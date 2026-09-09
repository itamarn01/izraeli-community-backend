// Renders the branded RTL shell around admin-authored rich text, and fills the
// {{token}} placeholders the editor inserts, per recipient.

const { escapeHtml } = require('../utils/html');
const { sanitizeEmailHtml } = require('../utils/sanitizeHtml');

// Tokens the admin can drop into the body from the editor toolbar. `resolve`
// receives the recipient context assembled by the broadcast controller.
const PERSONALIZATION_FIELDS = [
  { key: 'firstName', label: 'שם פרטי', resolve: (c) => c.firstName || '' },
  { key: 'lastName', label: 'שם משפחה', resolve: (c) => c.lastName || '' },
  { key: 'fullName', label: 'שם מלא', resolve: (c) => [c.firstName, c.lastName].filter(Boolean).join(' ') },
  { key: 'gedud', label: 'גדוד', resolve: (c) => c.gedud || '' },
  { key: 'email', label: 'כתובת מייל', resolve: (c) => c.email || '' },
];

// Extra tokens offered only when the broadcast targets an event's registrants.
const EVENT_FIELDS = [
  { key: 'eventTitle', label: 'שם האירוע', resolve: (c) => c.eventTitle || '' },
  { key: 'eventDate', label: 'תאריך האירוע', resolve: (c) => c.eventDate || '' },
  { key: 'eventTime', label: 'שעות האירוע', resolve: (c) => c.eventTime || '' },
  { key: 'eventLocation', label: 'מיקום האירוע', resolve: (c) => c.eventLocation || '' },
  { key: 'spouseName', label: 'שם בן/בת הזוג', resolve: (c) => c.spouseName || '' },
  { key: 'tourTitle', label: 'שם הסיור', resolve: (c) => c.tourTitle || '' },
  { key: 'tourTime', label: 'שעת הסיור', resolve: (c) => c.tourTime || '' },
];

function fieldsFor(audienceType) {
  return audienceType === 'event'
    ? [...PERSONALIZATION_FIELDS, ...EVENT_FIELDS]
    : PERSONALIZATION_FIELDS;
}

const ALL_FIELDS = [...PERSONALIZATION_FIELDS, ...EVENT_FIELDS];

/**
 * Replaces every {{token}} with the recipient's value, HTML-escaped so a name
 * containing "<" cannot break the markup. Unknown tokens are removed rather
 * than left visible in the inbox.
 */
function personalize(text, context = {}) {
  return String(text || '').replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (match, key) => {
    const field = ALL_FIELDS.find((f) => f.key === key);
    if (!field) return '';
    return escapeHtml(field.resolve(context));
  });
}

// Subject lines are plain text, so tokens there must not be HTML-escaped.
function personalizePlain(text, context = {}) {
  return String(text || '').replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (match, key) => {
    const field = ALL_FIELDS.find((f) => f.key === key);
    return field ? String(field.resolve(context) ?? '') : '';
  });
}

/**
 * Wraps the body in the same look as the platform's other emails.
 * @param {{subject: string, bodyHtml: string, adminName?: string, appUrl?: string}} input
 */
function renderBroadcastHtml({ subject, bodyHtml, adminName, appUrl }) {
  const safeBody = sanitizeEmailHtml(bodyHtml);
  const site = (appUrl || process.env.CLIENT_URL || (process.env.CLIENT_ORIGIN || '').split(',')[0] || '').replace(/\/$/, '');

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f4;">
  <div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;padding:24px;background:#f5f5f4;color:#3A3A3A;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border-top:6px solid #CB8333;">
      <div style="padding:32px 32px 8px;">
        <h1 style="margin:0 0 6px;font-size:22px;line-height:1.3;color:#3A3A3A;">${escapeHtml(subject)}</h1>
        <p style="margin:0 0 22px;color:#999;font-size:12px;">קהילת חטיבת יזרעאלי · חברותא 186</p>
      </div>
      <div style="padding:0 32px 28px;font-size:15px;line-height:1.8;color:#3A3A3A;">
        ${safeBody}
      </div>
      <div style="padding:20px 32px;background:#faf9f7;border-top:1px solid #eeeeee;">
        ${site ? `<p style="margin:0 0 8px;font-size:13px;"><a href="${escapeHtml(site)}" style="color:#CB8333;font-weight:bold;text-decoration:none;">כניסה לחברותא 186</a></p>` : ''}
        <p style="margin:0;font-size:11px;color:#aaaaaa;">
          ${adminName ? `נשלח על ידי ${escapeHtml(adminName)} · ` : ''}קהילת חטיבת יזרעאלי
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

module.exports = {
  renderBroadcastHtml,
  personalize,
  personalizePlain,
  fieldsFor,
  PERSONALIZATION_FIELDS,
  EVENT_FIELDS,
};
