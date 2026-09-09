// Builds an RFC 5545 calendar invite for an event registration.
// Times are emitted as Israel wall-clock (TZID=Asia/Jerusalem) rather than UTC,
// because the event is defined by its local hour, not by an instant.

const TZID = 'Asia/Jerusalem';

// Minimal Israeli DST definition so Outlook/Apple resolve TZID correctly.
const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${TZID}`,
  'X-LIC-LOCATION:Asia/Jerusalem',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0300',
  'TZNAME:IDT',
  'DTSTART:19700327T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=FR;BYMONTHDAY=23,24,25,26,27,28,29',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0300',
  'TZOFFSETTO:+0200',
  'TZNAME:IST',
  'DTSTART:19701025T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

function escapeIcs(text) {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// 'YYYY-MM-DD' + 'HH:mm' → '20260315T160000'
function localStamp(date, time, fallbackTime = '00:00') {
  const [h, m] = String(time || fallbackTime).split(':');
  const hh = String(h ?? '0').padStart(2, '0');
  const mm = String(m ?? '0').padStart(2, '0');
  return `${String(date).replace(/-/g, '')}T${hh}${mm}00`;
}

function addMinutes(time, minutes) {
  const [h, m] = String(time || '00:00').split(':').map(Number);
  const total = (h * 60 + m + minutes + 1440 * 7) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Folds long lines at 75 octets, as required by RFC 5545.
function fold(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 73) return line;
  const out = [];
  let chunk = '';
  let size = 0;
  for (const ch of line) {
    const chSize = Buffer.byteLength(ch, 'utf8');
    if (size + chSize > (out.length === 0 ? 73 : 72)) {
      out.push(chunk);
      chunk = '';
      size = 0;
    }
    chunk += ch;
    size += chSize;
  }
  if (chunk) out.push(chunk);
  return out.join('\r\n ');
}

/**
 * @param {object} event  Event document (date/startTime/endTime/title/location)
 * @param {object} [tour] { tourTitle, time } when the member booked a tour
 * @returns {string} ICS text
 */
function buildEventIcs(event, tour = null) {
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  // A booked tour starts before the event, so the invite covers the whole visit.
  const start = tour?.time || event.startTime || '09:00';
  const end = event.endTime || addMinutes(event.startTime || start, 180);

  const descriptionParts = [];
  if (event.summary) descriptionParts.push(event.summary);
  if (tour?.time) descriptionParts.push(`${tour.tourTitle || 'סיור'} בשעה ${tour.time}`);
  if (event.startTime) descriptionParts.push(`תחילת האירוע: ${event.startTime}`);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Havruta 186//Events//HE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...VTIMEZONE,
    'BEGIN:VEVENT',
    `UID:event-${event._id}-${tour?.slotId || 'main'}@havruta186`,
    `DTSTAMP:${now}`,
    `DTSTART;TZID=${TZID}:${localStamp(event.date, start)}`,
    `DTEND;TZID=${TZID}:${localStamp(event.date, end)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    descriptionParts.length ? `DESCRIPTION:${escapeIcs(descriptionParts.join('\n'))}` : null,
    event.location ? `LOCATION:${escapeIcs(event.location)}` : null,
    'BEGIN:VALARM',
    'TRIGGER:-PT1440M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcs(event.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  return lines.map(fold).join('\r\n');
}

module.exports = { buildEventIcs, addMinutes };
