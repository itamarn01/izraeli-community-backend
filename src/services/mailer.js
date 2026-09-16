// The one place an email actually leaves the app.
//
// Every sender — OTPs, coupons, job applications, admin messages, event
// confirmations and broadcasts — goes through `deliver()`, so switching
// providers is a change in this file alone. Provider today: Flashy.
const flashy = require('./flashy');

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
  await flashy.sendEmail({ to: { email: to, name: toName }, subject, html });
  return { sent: true };
}

function isConfigured() {
  return flashy.isConfigured();
}

module.exports = { deliver, isConfigured };
