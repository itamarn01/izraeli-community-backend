// Flashy REST API client — the app's only mail provider, for both broadcasts
// and transactional mail (OTP, coupons, event confirmations). Senders reach it
// through services/mailer.js rather than calling this directly.
//
// API reference: https://flashy.app/docs/rest-api/
//   POST https://api.flashy.app/messages/email
//   auth: "x-api-key" request header
//   body: { message: { html, subject, from: {name,email}, to: {name,email}, vars } }
//
// Note there is no bulk endpoint: `to` is a single recipient, so a broadcast is
// one request per person. adminBroadcasts.controller drives that loop.
// The endpoint takes an HTML body only — no attachments — so anything that
// used to be attached (e.g. an .ics file) has to be linked instead.

const BASE_URL = process.env.FLASHY_BASE_URL || 'https://api.flashy.app';
const TIMEOUT_MS = 20000;

function isConfigured() {
  return Boolean(process.env.FLASHY_API_KEY && process.env.FLASHY_FROM_EMAIL);
}

// Explains exactly what is missing, so the admin UI can say so instead of
// failing with a generic error.
function configError() {
  const missing = [];
  if (!process.env.FLASHY_API_KEY) missing.push('FLASHY_API_KEY');
  if (!process.env.FLASHY_FROM_EMAIL) missing.push('FLASHY_FROM_EMAIL');
  if (!missing.length) return null;
  return `שליחת מיילים דרך Flashy אינה מוגדרת. חסר בקובץ ה-.env של השרת: ${missing.join(', ')}`;
}

function sender() {
  return {
    name: process.env.FLASHY_FROM_NAME || 'קהילת חטיבת יזרעאלי',
    email: process.env.FLASHY_FROM_EMAIL,
  };
}

class FlashyError extends Error {
  constructor(message, { status = null, body = null } = {}) {
    super(message);
    this.name = 'FlashyError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Sends one email through Flashy.
 * @param {{name?: string, email: string}} to
 * @param {string} subject
 * @param {string} html   full HTML document/body for the email
 * @param {object} [vars] template variables (unused with raw html, kept for parity)
 */
async function sendEmail({ to, subject, html, vars }) {
  const problem = configError();
  if (problem) throw new FlashyError(problem);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  let payload;
  try {
    response = await fetch(`${BASE_URL}/messages/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.FLASHY_API_KEY,
      },
      body: JSON.stringify({
        message: {
          html,
          subject,
          from: sender(),
          to: { name: to.name || to.email, email: to.email },
          ...(vars ? { vars } : {}),
        },
      }),
      signal: controller.signal,
    });
    payload = await response.text();
  } catch (err) {
    if (err.name === 'AbortError') throw new FlashyError('פסק זמן בפנייה ל-Flashy');
    throw new FlashyError(`שגיאת רשת בפנייה ל-Flashy: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try {
    data = payload ? JSON.parse(payload) : null;
  } catch {
    /* non-JSON body — surfaced through the message below */
  }

  if (!response.ok) {
    const detail = data?.message || data?.error || payload?.slice(0, 200) || '';
    throw new FlashyError(`Flashy החזיר שגיאה ${response.status}${detail ? `: ${detail}` : ''}`, {
      status: response.status,
      body: data,
    });
  }

  // Flashy answers 200 with { success: false, ... } for rejected sends.
  if (data && data.success === false) {
    const detail = data.message || data.error || JSON.stringify(data).slice(0, 200);
    throw new FlashyError(`Flashy דחה את השליחה: ${detail}`, { status: response.status, body: data });
  }

  return data;
}

// Cheap credential check for the admin UI ("is the key valid?").
async function verifyAccount() {
  const problem = configError();
  if (problem) throw new FlashyError(problem);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/account`, {
      headers: { 'x-api-key': process.env.FLASHY_API_KEY },
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.success === false) {
      throw new FlashyError(`Flashy דחה את המפתח (${res.status})`, { status: res.status, body: data });
    }
    return data?.data || null;
  } catch (err) {
    if (err instanceof FlashyError) throw err;
    throw new FlashyError(`שגיאת רשת בפנייה ל-Flashy: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { sendEmail, verifyAccount, isConfigured, configError, sender, FlashyError };
