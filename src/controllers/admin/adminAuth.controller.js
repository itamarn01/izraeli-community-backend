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
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

const otpSchema = z.object({
  username: z.string().trim().min(1),
  otp: z.string().regex(/^\d{6}$/, 'קוד לא תקין'),
});

const resendSchema = z.object({
  username: z.string().trim().min(1),
});

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
    await sendOtpEmail(admin.email, otp, 'אימות מייל מנהל — קהילת חטיבת יזרעאלי', 'אימות חשבון מנהל');

    res.status(201).json({
      message: 'חשבון נוצר. נשלח קוד אימות למייל',
      username: admin.username,
      nextStep: 'verify_email',
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { username, password } = loginSchema.parse(req.body);
    const admin = await Admin.findOne({ username: username.toLowerCase() }).select('+password');
    if (!admin) return res.status(401).json({ message: 'שם משתמש או סיסמה שגויים' });

    const ok = await admin.comparePassword(password);
    if (!ok) return res.status(401).json({ message: 'שם משתמש או סיסמה שגויים' });

    if (!admin.isEmailVerified) {
      // Re-issue an OTP if needed
      const otp = generateOtp();
      admin.emailOtp = otp;
      admin.emailOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
      await admin.save();
      await sendOtpEmail(admin.email, otp, 'אימות מייל מנהל — קהילת חטיבת יזרעאלי', 'אימות חשבון מנהל');
      return res.json({ nextStep: 'verify_email', username: admin.username, message: 'נשלח קוד אימות למייל' });
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
    await sendOtpEmail(admin.email, otp, 'אימות מייל מנהל — קהילת חטיבת יזרעאלי', 'אימות חשבון מנהל');
    res.json({ message: 'נשלח קוד חדש למייל' });
  } catch (err) {
    next(err);
  }
}

async function me(req, res) {
  res.json({ admin: req.admin.toSafeJSON() });
}

module.exports = { bootstrap, login, verifyOtp, resendOtp, me };
