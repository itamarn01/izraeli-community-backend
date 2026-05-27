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
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
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

async function sendApplicationEmail({ to, jobTitle, company, applicant, message, cvUrl, isAnonymous }) {
  const applicantName = isAnonymous ? 'מועמד אנונימי' : applicant;
  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; padding: 24px; background: #f5f5f4; color: #3A3A3A;">
      <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 32px; border-top: 6px solid #CB8333;">
        <h2 style="margin: 0 0 8px;">מועמדות חדשה למשרה</h2>
        <p style="color: #666; margin: 0 0 24px;">קיבלת מועמדות חדשה דרך קהילת חטיבת יזרעאלי</p>
        <table style="width:100%; border-collapse:collapse; font-size:14px;">
          <tr><td style="padding:8px 0; color:#666; width:130px;">משרה</td><td style="font-weight:bold;">${jobTitle}</td></tr>
          <tr><td style="padding:8px 0; color:#666;">חברה</td><td>${company}</td></tr>
          <tr><td style="padding:8px 0; color:#666;">מועמד/ת</td><td>${applicantName}</td></tr>
          ${!isAnonymous && applicant ? `<tr><td style="padding:8px 0; color:#666;">שם</td><td>${applicant}</td></tr>` : ''}
        </table>
        ${message ? `
        <div style="margin-top:20px; padding:16px; background:#f5f5f4; border-radius:8px;">
          <div style="font-size:12px; color:#999; margin-bottom:8px;">הודעה מהמועמד/ת</div>
          <p style="margin:0; white-space:pre-wrap;">${message}</p>
        </div>` : ''}
        ${cvUrl ? `
        <div style="margin-top:20px;">
          <a href="${cvUrl}" style="display:inline-block; background:#CB8333; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:bold;">
            צפייה בקורות החיים
          </a>
        </div>` : '<p style="margin-top:16px; color:#999; font-size:13px;">לא צורפו קורות חיים</p>'}
        <hr style="margin:24px 0; border:none; border-top:1px solid #eee;" />
        <p style="font-size:12px; color:#aaa; margin:0;">הודעה זו נשלחה אוטומטית ממערכת קהילת חטיבת יזרעאלי.</p>
      </div>
    </div>`;

  const t = getTransporter();
  if (!t) {
    console.log(`[DEV] Application email to ${to}: ${applicantName} applied for ${jobTitle}`);
    return { dev: true };
  }
  return t.sendMail({
    from: process.env.SMTP_FROM || 'noreply@izraeli.org.il',
    to,
    subject: `מועמדות חדשה: ${jobTitle} — קהילת חטיבת יזרעאלי`,
    html,
  });
}

async function sendAdminMessage({ to, subject, message, adminName }) {
  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; padding: 24px; background: #f5f5f4; color: #3A3A3A;">
      <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 32px; border-top: 6px solid #CB8333;">
        <h2 style="margin: 0 0 8px;">${subject}</h2>
        <p style="color: #666; margin: 0 0 20px; font-size: 13px;">הודעה מצוות הניהול של קהילת חטיבת יזרעאלי</p>
        <div style="white-space:pre-wrap; line-height:1.7; font-size:14px;">${message}</div>
        <hr style="margin:24px 0; border:none; border-top:1px solid #eee;" />
        <p style="font-size:12px; color:#aaa; margin:0;">${adminName ? `נשלח על ידי ${adminName} · ` : ''}קהילת חטיבת יזרעאלי</p>
      </div>
    </div>`;

  const t = getTransporter();
  if (!t) {
    console.log(`[DEV] Admin message to ${to}: ${subject}`);
    return { dev: true };
  }
  return t.sendMail({
    from: process.env.SMTP_FROM || 'noreply@izraeli.org.il',
    to,
    subject: `${subject} — קהילת חטיבת יזרעאלי`,
    html,
  });
}

async function sendPasswordResetByAdmin({ to, newPassword, adminName }) {
  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; padding: 24px; background: #f5f5f4; color: #3A3A3A;">
      <div style="max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 32px; border-top: 6px solid #CB8333;">
        <h2 style="margin: 0 0 16px;">הסיסמה שלך אופסה</h2>
        <p>${adminName ? `${adminName}, מצוות הניהול, ` : 'צוות הניהול '}איפס את הסיסמה שלך לחשבון בקהילת חטיבת יזרעאלי.</p>
        <p>הסיסמה הזמנית החדשה שלך:</p>
        <div style="font-family: monospace; font-size:18px; font-weight:bold; letter-spacing:2px; color:#CB8333; padding:14px 18px; background:#f5f5f4; border-radius:8px; display:inline-block; margin: 8px 0 16px;">${newPassword}</div>
        <p style="color:#666; font-size:13px;">מומלץ להחליף את הסיסמה מיד לאחר ההתחברות.</p>
      </div>
    </div>`;

  const t = getTransporter();
  if (!t) {
    console.log(`[DEV] Password reset for ${to}: ${newPassword}`);
    return { dev: true };
  }
  return t.sendMail({
    from: process.env.SMTP_FROM || 'noreply@izraeli.org.il',
    to,
    subject: 'איפוס סיסמה — קהילת חטיבת יזרעאלי',
    html,
  });
}

module.exports = { sendOtpEmail, sendApplicationEmail, sendAdminMessage, sendPasswordResetByAdmin };
