// Confirmation / update / cancellation emails for event registrations.
// Kept out of email.js so the event module stays self-contained; it reuses the
// same Resend client configuration.
const { Resend } = require('resend');
const { escapeHtml } = require('../utils/html');
const { buildEventIcs } = require('./calendar');

let client = null;
function getClient() {
  if (client) return client;
  if (!process.env.RESEND_API_KEY) return null;
  client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

const FROM = () => process.env.RESEND_FROM || 'onboarding@resend.dev';

const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

// 'YYYY-MM-DD' → 'יום ראשון, 15 במרץ 2026'
function formatEventDate(date) {
  if (!date) return '';
  const [y, m, d] = String(date).split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  const long = dt.toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `יום ${HE_DAYS[dt.getUTCDay()]}, ${long}`;
}

function row(label, value) {
  if (!value) return '';
  return `<tr>
    <td style="padding:9px 0;color:#888;font-size:13px;width:130px;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:9px 0;font-size:14px;font-weight:600;color:#3A3A3A;">${value}</td>
  </tr>`;
}

function googleCalendarUrl(event, tour) {
  const start = (tour?.time || event.startTime || '09:00').replace(':', '') + '00';
  const end = (event.endTime || '23:00').replace(':', '') + '00';
  const day = String(event.date).replace(/-/g, '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title || '',
    dates: `${day}T${start}/${day}T${end}`,
    details: [event.summary, tour?.time ? `${tour.tourTitle || 'סיור'} בשעה ${tour.time}` : '']
      .filter(Boolean)
      .join('\n'),
    location: event.location || '',
    ctz: 'Asia/Jerusalem',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Confirmation email, with the personal .ics attached.
 * @param {'created'|'updated'|'cancelled'} kind
 */
async function sendEventRegistrationEmail({ to, userName, event, registration, kind = 'created', appUrl }) {
  const tour = registration?.tour || null;
  const cancelled = kind === 'cancelled';

  const heading = cancelled
    ? 'ההרשמה שלך בוטלה'
    : kind === 'updated'
      ? 'ההרשמה שלך עודכנה'
      : 'ההרשמה אושרה!';

  const intro = cancelled
    ? 'ביטלת את ההשתתפות. תמיד אפשר להירשם מחדש כל עוד ההרשמה פתוחה.'
    : `שלום${userName ? ` ${escapeHtml(userName)}` : ''}, מקומך נשמר. אלה הפרטים:`;

  const detailsTable = cancelled
    ? row('אירוע', escapeHtml(event.title)) + row('תאריך', escapeHtml(formatEventDate(event.date)))
    : [
        row('אירוע', escapeHtml(event.title)),
        row('תאריך', escapeHtml(formatEventDate(event.date))),
        row('שעות', event.startTime ? escapeHtml([event.startTime, event.endTime].filter(Boolean).join(' – ')) : ''),
        row('מיקום', escapeHtml(event.location)),
        row('בן/בת זוג', registration?.hasSpouse ? escapeHtml(registration.spouseName || 'כן') : 'לא'),
        event.toursEnabled
          ? row(
              'סיור',
              tour
                ? `${escapeHtml(tour.tourTitle || 'סיור')} · ${escapeHtml(tour.time)}${
                    tour.forBoth ? ' (לשניכם)' : registration?.hasSpouse ? ' (לחייל בלבד)' : ''
                  }`
                : 'לא נרשמת לסיור'
            )
          : '',
      ].join('');

  const calendarUrl = cancelled ? '' : googleCalendarUrl(event, tour);
  const eventUrl = appUrl ? `${appUrl.replace(/\/$/, '')}/app/events?event=${event._id}` : '';

  const html = `
    <div dir="rtl" style="font-family:Arial,sans-serif;padding:24px;background:#f5f5f4;color:#3A3A3A;">
      <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border-top:6px solid ${cancelled ? '#9BAD94' : '#CB8333'};">
        <h2 style="margin:0 0 8px;">${escapeHtml(heading)}</h2>
        <p style="color:#666;margin:0 0 22px;">${intro}</p>
        <table style="width:100%;border-collapse:collapse;">${detailsTable}</table>
        ${
          calendarUrl
            ? `<div style="margin-top:26px;">
                 <a href="${escapeHtml(calendarUrl)}" style="display:inline-block;background:#CB8333;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;">הוספה ליומן Google</a>
                 <p style="font-size:12px;color:#999;margin:12px 0 0;">מצורף גם קובץ יומן (.ics) לפתיחה ב-Apple Calendar או Outlook.</p>
               </div>`
            : ''
        }
        ${
          eventUrl
            ? `<p style="margin-top:22px;font-size:13px;"><a href="${escapeHtml(eventUrl)}" style="color:#CB8333;font-weight:600;">צפייה ועריכה של ההרשמה שלך</a></p>`
            : ''
        }
        <hr style="margin:26px 0;border:none;border-top:1px solid #eee;" />
        <p style="font-size:12px;color:#aaa;margin:0;">קהילת חטיבת יזרעאלי · חברותא 186</p>
      </div>
    </div>`;

  const c = getClient();
  if (!c) {
    console.log(`[DEV] Event ${kind} email to ${to}: ${event.title}${tour ? ` (סיור ${tour.time})` : ''}`);
    return { dev: true };
  }

  const payload = {
    from: FROM(),
    to,
    subject: `${heading} — ${event.title}`,
    html,
  };

  if (!cancelled) {
    payload.attachments = [
      {
        filename: 'event.ics',
        content: Buffer.from(buildEventIcs(event, tour), 'utf8').toString('base64'),
        contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
      },
    ];
  }

  return c.emails.send(payload);
}

module.exports = { sendEventRegistrationEmail, formatEventDate, googleCalendarUrl };
