// The one place an email actually leaves the app.
//
// Every sender — OTPs, coupons, job applications, admin messages, event
// confirmations and broadcasts — goes through `deliver()`, so switching
// providers is a change in this file alone. Provider today: Flashy.
const flashy = require('./flashy');

// Where recipients should write when something in the system goes wrong.
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'community.izraeli@gmail.com';

// Lets withSupportFooter() recognise its own work, so a body that already
// carries the footer never gets a second one.
const FOOTER_MARKER = 'data-support-footer';

function supportFooterHtml() {
  return `
    <div ${FOOTER_MARKER}="1" dir="rtl" style="font-family:Arial,Helvetica,sans-serif;background:#f5f5f4;padding:4px 24px 26px;">
      <div style="max-width:560px;margin:0 auto;text-align:center;font-size:12px;line-height:1.7;color:#999999;">
        נתקלתם בבעיה? צרו קשר:
        <a href="mailto:${SUPPORT_EMAIL}" style="color:#CB8333;font-weight:bold;text-decoration:none;">${SUPPORT_EMAIL}</a>
      </div>
    </div>`;
}

/**
 * Appends the support line to an email body. Bodies come in two shapes: a bare
 * `<div>` wrapper (the transactional emails) and a full document (broadcasts),
 * so the footer goes inside `</body>` when there is one and at the end
 * otherwise — either way it lands on the same background as the card above it.
 */
function withSupportFooter(html) {
  const body = String(html || '');
  if (body.includes(FOOTER_MARKER)) return body;
  const closing = body.lastIndexOf('</body>');
  return closing === -1
    ? body + supportFooterHtml()
    : body.slice(0, closing) + supportFooterHtml() + body.slice(closing);
}

/**
 * Sends one email.
 *
 * With no provider configured (local dev, tests) nothing is sent and the
 * message is logged instead — `devLabel` is what shows up in that log line,
 * so keep it useful (e.g. the OTP itself).
 *
 * @param {string}  to        recipient address
 * @param {string}  subject
 * @param {string}  html      full HTML body
 * @param {string} [toName]   recipient display name
 * @param {string} [devLabel] what to print when no provider is configured
 */
async function deliver({ to, subject, html, toName, devLabel }) {
  if (!flashy.isConfigured()) {
    console.log(`[DEV] ${devLabel || `email to ${to}: ${subject}`}`);
    return { dev: true };
  }
  await flashy.sendEmail({
    to: { email: to, name: toName },
    subject,
    html: withSupportFooter(html),
  });
  return { sent: true };
}

function isConfigured() {
  return flashy.isConfigured();
}

module.exports = { deliver, isConfigured, withSupportFooter, supportFooterHtml, SUPPORT_EMAIL };
