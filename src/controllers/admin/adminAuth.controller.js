const Admin = require('../../models/Admin');
const { z } = require('zod');
const { generateOtp } = require('../../utils/token');
const { sendOtpEmail } = require('../../services/email');
const { signAdminToken } = require('../../middleware/adminAuth');

const registerSchema = z.object({
  username: z.string().trim().min(3).regex(/^[a-zA-Z0-9_.-]+$/, 'שם משתמש: אותיות באנגלית/ספרות בלבד'),
  email: z.string().email('כתובת מייל לא תקינה'),
  password: z.string().min(8, 'סיסמה חייבת להכיל לפחות 8 תווים'),
  fullName: z.string().trim().optional(),
  setupKey: z.string().optional(),
});

const loginSchema = z.object({
  // Accepts either a username or an email address
  username: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(200),
});

const otpSchema = z.object({
  username: z.string().trim().min(1),
  otp: z.string().regex(/^\d{6}$/, 'קוד לא תקין'),
});

const resendSchema = z.object({
  username: z.string().trim().min(1),
});

const forgotSchema = z.object({
  identifier: z.string().trim().min(1, 'יש להזין שם משתמש או מייל').max(254),
});

const resetSchema = z.object({
  identifier: z.string().trim().min(1).max(254),
  otp: z.string().regex(/^\d{6}$/, 'קוד לא תקין'),
  newPassword: z.string().min(8, 'סיסמה חייבת להכיל לפחות 8 תווים').max(200),
});

// Find an admin by username or email (case-insensitive), without leaking which matched
function buildIdentifierQuery(identifier) {
  const id = identifier.toLowerCase().trim();
  return { $or: [{ username: id }, { email: id }] };
}

async function bootstrap(req, res, next) {
  try {
    const data = registerSchema.parse(req.body);
    const count = await Admin.countDocuments();

    // Either no admins exist (first bootstrap) OR a valid setup key was supplied
    const setupKey = process.env.ADMIN_SETUP_KEY;
    if (count > 0) {
      if (!setupKey || data.setupKey !== setupKey) {
        return res.status(403).json({ message: 'יצירת מנהל חדש נחסמה — נדרש מפתח התקנה' });
      }
    }

    const username = data.username.toLowerCase();
    const email = data.email.toLowerCase();

    const exists = await Admin.findOne({ $or: [{ username }, { email }] });
    if (exists) return res.status(409).json({ message: 'שם משתמש או מייל כבר קיימים' });

    const otp = generateOtp();
    const admin = new Admin({
      username,
      email,
      password: data.password,
      fullName: data.fullName || '',
      role: count === 0 ? 'superadmin' : 'admin',
      emailOtp: otp,
      emailOtpExpires: new Date(Date.now() + 10 * 60 * 1000),
    });
    await admin.save();
    let emailSent = true;
    try {
      await sendOtpEmail(admin.email, otp, 'אימות מייל מנהל — קהילת חטיבת יזרעאלי', 'אימות חשבון מנהל');
    } catch (emailErr) {
      console.error('[bootstrap] שגיאה בשליחת מייל OTP:', emailErr.message);
      emailSent = false;
    }

    res.status(201).json({
      message: emailSent
        ? 'חשבון נוצר. נשלח קוד אימות למייל'
        : 'חשבון נוצר אך שליחת המייל נכשלה — ניתן לשלוח שוב מעמוד האימות',
      username: admin.username,
      nextStep: 'verify_email',
      emailSent,
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { username, password } = loginSchema.parse(req.body);
    const admin = await Admin.findOne(buildIdentifierQuery(username)).select('+password');
    if (!admin) return res.status(401).json({ message: 'שם משתמש או סיסמה שגויים' });

    const ok = await admin.comparePassword(password);
    if (!ok) return res.status(401).json({ message: 'שם משתמש או סיסמה שגויים' });

    if (!admin.isEmailVerified) {
      // Re-issue an OTP if needed
      const otp = generateOtp();
      admin.emailOtp = otp;
      admin.emailOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
      await admin.save();
      let emailSentOnLogin = true;
      try {
        await sendOtpEmail(admin.email, otp, 'אימות מייל מנהל — קהילת חטיבת יזרעאלי', 'אימות חשבון מנהל');
      } catch (emailErr) {
        console.error('[login] שגיאה בשליחת מייל OTP:', emailErr.message);
        emailSentOnLogin = false;
      }
      return res.json({
        nextStep: 'verify_email',
        username: admin.username,
        message: emailSentOnLogin ? 'נשלח קוד אימות למייל' : 'שליחת המייל נכשלה — ניתן לשלוח שוב מעמוד האימות',
        emailSent: emailSentOnLogin,
      });
    }

    admin.lastLoginAt = new Date();
    await admin.save();

    const token = signAdminToken(admin._id);
    res.json({ token, admin: admin.toSafeJSON(), nextStep: 'dashboard' });
  } catch (err) {
    next(err);
  }
}

async function verifyOtp(req, res, next) {
  try {
    const { username, otp } = otpSchema.parse(req.body);
    const admin = await Admin.findOne({ username: username.toLowerCase() })
      .select('+emailOtp +emailOtpExpires');
    if (!admin) return res.status(404).json({ message: 'מנהל לא נמצא' });
    if (!admin.emailOtp || !admin.emailOtpExpires || admin.emailOtpExpires < new Date())
      return res.status(400).json({ message: 'הקוד פג תוקף, יש לבקש קוד חדש' });
    if (admin.emailOtp !== otp) return res.status(400).json({ message: 'קוד לא תקין' });

    admin.isEmailVerified = true;
    admin.emailOtp = undefined;
    admin.emailOtpExpires = undefined;
    admin.lastLoginAt = new Date();
    await admin.save();

    const token = signAdminToken(admin._id);
    res.json({ token, admin: admin.toSafeJSON(), nextStep: 'dashboard' });
  } catch (err) {
    next(err);
  }
}

async function resendOtp(req, res, next) {
  try {
    const { username } = resendSchema.parse(req.body);
    const admin = await Admin.findOne({ username: username.toLowerCase() })
      .select('+emailOtp +emailOtpExpires');
    if (!admin) return res.status(404).json({ message: 'מנהל לא נמצא' });
    if (admin.isEmailVerified) return res.status(400).json({ message: 'המייל כבר מאומת' });

    const otp = generateOtp();
    admin.emailOtp = otp;
    admin.emailOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await admin.save();
    let emailSentOnResend = true;
    try {
      await sendOtpEmail(admin.email, otp, 'אימות מייל מנהל — קהילת חטיבת יזרעאלי', 'אימות חשבון מנהל');
    } catch (emailErr) {
      console.error('[resendOtp] שגיאה בשליחת מייל OTP:', emailErr.message);
      emailSentOnResend = false;
    }
    res.json({
      message: emailSentOnResend ? 'נשלח קוד חדש למייל' : 'שליחת המייל נכשלה — בדוק את הגדרות ה-SMTP בשרת',
      emailSent: emailSentOnResend,
    });
  } catch (err) {
    next(err);
  }
}

async function forgotPassword(req, res, next) {
  try {
    const { identifier } = forgotSchema.parse(req.body);
    const admin = await Admin.findOne(buildIdentifierQuery(identifier));

    // Always respond identically to avoid revealing whether the account exists
    const genericMessage = 'אם החשבון קיים במערכת, נשלח קוד לאיפוס הסיסמה למייל';
    if (!admin) return res.json({ message: genericMessage });

    const otp = generateOtp();
    admin.resetPasswordOtp = otp;
    admin.resetPasswordOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await admin.save();

    try {
      await sendOtpEmail(
        admin.email,
        otp,
        'קוד לאיפוס סיסמת מנהל — קהילת חטיבת יזרעאלי',
        'קוד איפוס סיסמה'
      );
    } catch (emailErr) {
      console.error('[admin forgotPassword] שגיאה בשליחת מייל:', emailErr.message);
    }

    res.json({ message: genericMessage });
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const { identifier, otp, newPassword } = resetSchema.parse(req.body);
    const admin = await Admin.findOne(buildIdentifierQuery(identifier))
      .select('+password +resetPasswordOtp +resetPasswordOtpExpires');
    if (!admin) return res.status(400).json({ message: 'קוד לא תקין או שפג תוקפו' });

    if (
      !admin.resetPasswordOtp ||
      !admin.resetPasswordOtpExpires ||
      admin.resetPasswordOtpExpires < new Date()
    ) {
      return res.status(400).json({ message: 'הקוד פג תוקף, יש לבקש קוד חדש' });
    }
    if (admin.resetPasswordOtp !== otp) {
      return res.status(400).json({ message: 'קוד לא תקין' });
    }

    admin.password = newPassword;
    admin.resetPasswordOtp = undefined;
    admin.resetPasswordOtpExpires = undefined;
    // A successful reset over email also confirms ownership of the mailbox
    admin.isEmailVerified = true;
    await admin.save();

    res.json({ message: 'הסיסמה אופסה בהצלחה — ניתן להתחבר' });
  } catch (err) {
    next(err);
  }
}

async function me(req, res) {
  res.json({ admin: req.admin.toSafeJSON() });
}

const updateProfileSchema = z.object({
  fullName: z.string().trim().max(120).optional(),
  avatarUrl: z.string().trim().url('כתובת תמונה לא תקינה').max(2048).optional().or(z.literal('')),
  currentPassword: z.string().max(200).optional(),
  newPassword: z.string().min(8, 'סיסמה חייבת להכיל לפחות 8 תווים').max(200).optional(),
});

async function updateProfile(req, res, next) {
  try {
    const { fullName, avatarUrl, newPassword, currentPassword } = updateProfileSchema.parse(req.body);

    const admin = await Admin.findById(req.admin._id).select('+password');
    if (!admin) return res.status(404).json({ message: 'מנהל לא נמצא' });

    if (fullName !== undefined) admin.fullName = fullName;
    if (avatarUrl !== undefined) admin.avatarUrl = avatarUrl;

    if (newPassword) {
      if (!currentPassword) return res.status(400).json({ message: 'יש להזין סיסמה נוכחית' });
      const ok = await admin.comparePassword(currentPassword);
      if (!ok) return res.status(400).json({ message: 'סיסמה נוכחית שגויה' });
      admin.password = newPassword;
    }

    await admin.save();
    res.json({ admin: admin.toSafeJSON() });
  } catch (err) {
    next(err);
  }
}

module.exports = { bootstrap, login, verifyOtp, resendOtp, forgotPassword, resetPassword, me, updateProfile };
