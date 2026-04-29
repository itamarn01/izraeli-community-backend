const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER) return null;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

async function sendOtpEmail(
  to,
  otp,
  subject = 'קוד אימות — קהילת חטיבת יזרעאלי',
  heading = 'קוד האימות שלך'
) {
  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; padding: 24px; background: #f5f5f4; color: #3A3A3A;">
      <div style="max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 32px; border-top: 6px solid #CB8333;">
        <h2 style="margin: 0 0 16px;">${heading} — קהילת חטיבת יזרעאלי</h2>
        <p>הקוד שלך:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #CB8333; padding: 16px 0;">${otp}</div>
        <p style="color: #666;">הקוד תקף ל-10 דקות. אם לא ביקשת קוד זה, התעלם מהודעה זו.</p>
      </div>
    </div>`;

  const t = getTransporter();
  if (!t) {
    console.log(`[DEV] OTP for ${to}: ${otp}`);
    return { dev: true };
  }
  return t.sendMail({
    from: process.env.SMTP_FROM || 'noreply@izraeli.org.il',
    to,
    subject,
    html,
  });
}

module.exports = { sendOtpEmail };
