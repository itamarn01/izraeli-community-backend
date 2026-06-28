const { Resend } = require('resend');
const { escapeHtml } = require('../utils/html');

let client = null;

function getClient() {
  if (client) return client;
  if (!process.env.RESEND_API_KEY) return null;
  client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

const FROM = () => process.env.RESEND_FROM || 'onboarding@resend.dev';

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

  const c = getClient();
  if (!c) {
    console.log(`[DEV] OTP for ${to}: ${otp}`);
    return { dev: true };
  }
  return c.emails.send({ from: FROM(), to, subject, html });
}

async function sendApplicationEmail({ to, jobTitle, company, applicant, message, cvUrl, isAnonymous }) {
  const applicantName = isAnonymous ? 'מועמד אנונימי' : escapeHtml(applicant);
  const safeCvUrl = encodeURI(cvUrl || '');
  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; padding: 24px; background: #f5f5f4; color: #3A3A3A;">
      <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 32px; border-top: 6px solid #CB8333;">
        <h2 style="margin: 0 0 8px;">מועמדות חדשה למשרה</h2>
        <p style="color: #666; margin: 0 0 24px;">קיבלת מועמדות חדשה דרך קהילת חטיבת יזרעאלי</p>
        <table style="width:100%; border-collapse:collapse; font-size:14px;">
          <tr><td style="padding:8px 0; color:#666; width:130px;">משרה</td><td style="font-weight:bold;">${escapeHtml(jobTitle)}</td></tr>
          <tr><td style="padding:8px 0; color:#666;">חברה</td><td>${escapeHtml(company)}</td></tr>
          <tr><td style="padding:8px 0; color:#666;">מועמד/ת</td><td>${applicantName}</td></tr>
          ${!isAnonymous && applicant ? `<tr><td style="padding:8px 0; color:#666;">שם</td><td>${escapeHtml(applicant)}</td></tr>` : ''}
        </table>
        ${message ? `
        <div style="margin-top:20px; padding:16px; background:#f5f5f4; border-radius:8px;">
          <div style="font-size:12px; color:#999; margin-bottom:8px;">הודעה מהמועמד/ת</div>
          <p style="margin:0; white-space:pre-wrap;">${escapeHtml(message)}</p>
        </div>` : ''}
        ${cvUrl ? `
        <div style="margin-top:20px;">
          <a href="${safeCvUrl}" style="display:inline-block; background:#CB8333; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:bold;">
            צפייה בקורות החיים
          </a>
        </div>` : '<p style="margin-top:16px; color:#999; font-size:13px;">לא צורפו קורות חיים</p>'}
        <hr style="margin:24px 0; border:none; border-top:1px solid #eee;" />
        <p style="font-size:12px; color:#aaa; margin:0;">הודעה זו נשלחה אוטומטית ממערכת קהילת חטיבת יזרעאלי.</p>
      </div>
    </div>`;

  const c = getClient();
  if (!c) {
    console.log(`[DEV] Application email to ${to}: ${applicantName} applied for ${jobTitle}`);
    return { dev: true };
  }
  return c.emails.send({
    from: FROM(),
    to,
    subject: `מועמדות חדשה: ${jobTitle} — קהילת חטיבת יזרעאלי`,
    html,
  });
}

async function sendAdminMessage({ to, subject, message, adminName }) {
  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; padding: 24px; background: #f5f5f4; color: #3A3A3A;">
      <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 32px; border-top: 6px solid #CB8333;">
        <h2 style="margin: 0 0 8px;">${escapeHtml(subject)}</h2>
        <p style="color: #666; margin: 0 0 20px; font-size: 13px;">הודעה מצוות הניהול של קהילת חטיבת יזרעאלי</p>
        <div style="white-space:pre-wrap; line-height:1.7; font-size:14px;">${escapeHtml(message)}</div>
        <hr style="margin:24px 0; border:none; border-top:1px solid #eee;" />
        <p style="font-size:12px; color:#aaa; margin:0;">${adminName ? `נשלח על ידי ${escapeHtml(adminName)} · ` : ''}קהילת חטיבת יזרעאלי</p>
      </div>
    </div>`;

  const c = getClient();
  if (!c) {
    console.log(`[DEV] Admin message to ${to}: ${subject}`);
    return { dev: true };
  }
  return c.emails.send({
    from: FROM(),
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
        <p>${adminName ? `${escapeHtml(adminName)}, מצוות הניהול, ` : 'צוות הניהול '}איפס את הסיסמה שלך לחשבון בקהילת חטיבת יזרעאלי.</p>
        <p>הסיסמה הזמנית החדשה שלך:</p>
        <div style="font-family: monospace; font-size:18px; font-weight:bold; letter-spacing:2px; color:#CB8333; padding:14px 18px; background:#f5f5f4; border-radius:8px; display:inline-block; margin: 8px 0 16px;">${escapeHtml(newPassword)}</div>
        <p style="color:#666; font-size:13px;">מומלץ להחליף את הסיסמה מיד לאחר ההתחברות.</p>
      </div>
    </div>`;

  const c = getClient();
  if (!c) {
    console.log(`[DEV] Password reset for ${to}: ${newPassword}`);
    return { dev: true };
  }
  return c.emails.send({
    from: FROM(),
    to,
    subject: 'איפוס סיסמה — קהילת חטיבת יזרעאלי',
    html,
  });
}

async function sendCouponEmail({ to, userName, benefitTitle, businessName, code, qrCode, validUntil }) {
  const safeTitle = escapeHtml(benefitTitle || '');
  const safeBusiness = escapeHtml(businessName || '');
  const safeCode = escapeHtml(code || '');
  const safeQr = escapeHtml(qrCode || '');
  const safeUser = escapeHtml(userName || '');
  const validStr = validUntil ? new Date(validUntil).toLocaleDateString('he-IL') : '';

  const html = `
    <div dir="rtl" style="font-family:Arial,sans-serif;padding:24px;background:#f5f5f4;color:#3A3A3A;">
      <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border-top:6px solid #CB8333;">
        <h2 style="margin:0 0 8px;">הקופון שלך מוכן!</h2>
        <p style="color:#666;margin:0 0 20px;">שלום${safeUser ? ` ${safeUser}` : ''}, הנה קופון ההטבה שלך מקהילת חטיבת יזרעאלי</p>
        ${safeBusiness ? `<p style="font-weight:bold;margin:0 0 4px;">${safeBusiness}</p>` : ''}
        <p style="margin:0 0 20px;color:#666;">${safeTitle}</p>
        <div style="background:#f5f5f4;border-radius:10px;padding:20px;text-align:center;margin:0 0 16px;">
          <div style="font-size:12px;color:#999;margin-bottom:8px;">קוד הקופון שלך</div>
          <div style="font-family:monospace;font-size:24px;font-weight:bold;letter-spacing:3px;color:#CB8333;">${safeCode}</div>
          ${safeQr ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid #e5e5e5;">
            <div style="font-size:11px;color:#999;margin-bottom:4px;">קוד ברקוד</div>
            <div style="font-family:monospace;font-size:13px;color:#555;">${safeQr}</div>
          </div>` : ''}
        </div>
        ${validStr ? `<p style="font-size:13px;color:#888;">תוקף ההטבה: ${validStr}</p>` : ''}
        <p style="font-size:12px;color:#aaa;margin-top:24px;">הקופון הוקצה לך אישית ואינו ניתן להעברה.<br/>קהילת חטיבת יזרעאלי</p>
      </div>
    </div>`;

  const c = getClient();
  if (!c) {
    console.log(`[DEV] Coupon email to ${to}: code=${code}`);
    return { dev: true };
  }
  return c.emails.send({ from: FROM(), to, subject: `הקופון שלך: ${benefitTitle} — קהילת חטיבת יזרעאלי`, html });
}

async function sendCommentNotificationEmail({ to, authorName, commenterName, postContent, commentText, postUrl }) {
  const safeAuthor = escapeHtml(authorName || '');
  const safeCommenter = escapeHtml(commenterName || 'חבר קהילה');
  const safeContent = escapeHtml(postContent || '');
  const safeComment = escapeHtml(commentText || '');

  const html = `
    <div dir="rtl" style="font-family:Arial,sans-serif;padding:24px;background:#f5f5f4;color:#3A3A3A;">
      <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border-top:6px solid #CB8333;">
        <h2 style="margin:0 0 8px;">תגובה חדשה על הפוסט שלך</h2>
        <p style="color:#666;margin:0 0 20px;">שלום${safeAuthor ? ` ${safeAuthor}` : ''}, ${safeCommenter} הגיב/ה על הפוסט שלך בקהילת חטיבת יזרעאלי</p>
        ${safeContent ? `<div style="background:#f5f5f4;border-radius:8px;padding:16px;margin-bottom:16px;border-right:3px solid #CB8333;">
          <div style="font-size:12px;color:#999;margin-bottom:6px;">הפוסט שלך</div>
          <p style="margin:0;color:#555;font-size:14px;">${safeContent}${postContent.length >= 100 ? '…' : ''}</p>
        </div>` : ''}
        <div style="background:#fff8f0;border-radius:8px;padding:16px;margin-bottom:20px;border:1px solid #f5e0c0;">
          <div style="font-size:12px;color:#999;margin-bottom:6px;">התגובה של ${safeCommenter}</div>
          <p style="margin:0;white-space:pre-wrap;color:#3A3A3A;">${safeComment}</p>
        </div>
        ${postUrl ? `<a href="${encodeURI(postUrl)}" style="display:inline-block;background:#CB8333;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">צפייה בפוסט</a>` : ''}
        <hr style="margin:24px 0;border:none;border-top:1px solid #eee;" />
        <p style="font-size:12px;color:#aaa;margin:0;">קהילת חטיבת יזרעאלי</p>
      </div>
    </div>`;

  const c = getClient();
  if (!c) {
    console.log(`[DEV] Comment notification to ${to} from ${commenterName}`);
    return { dev: true };
  }
  return c.emails.send({ from: FROM(), to, subject: `${commenterName} הגיב/ה על הפוסט שלך — קהילת חטיבת יזרעאלי`, html });
}

module.exports = { sendOtpEmail, sendApplicationEmail, sendAdminMessage, sendPasswordResetByAdmin, sendCouponEmail, sendCommentNotificationEmail };
