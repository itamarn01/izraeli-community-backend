const User = require('../models/User');
const Organization = require('../models/Organization');
const { signToken, generateOtp } = require('../utils/token');
const { sendOtpEmail } = require('../services/email');
const {
  orgCodeSchema,
  registerSchema,
  loginSchema,
  verifyOtpSchema,
  resendOtpSchema,
  loginOtpRequestSchema,
  loginOtpVerifySchema,
  questionnaireSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require('../validation/schemas');

async function checkOrganizationCode(req, res, next) {
  try {
    const { code } = orgCodeSchema.parse(req.body);
    const org = await Organization.findOne({ code: code.toUpperCase(), isActive: true });
    if (!org) return res.status(404).json({ valid: false, message: 'קוד ארגון לא תקין' });
    res.json({ valid: true, organization: { id: org._id, name: org.name, description: org.description } });
  } catch (err) {
    next(err);
  }
}

async function register(req, res, next) {
  try {
    const { email, password, organizationCode } = registerSchema.parse(req.body);
    const org = await Organization.findOne({ code: organizationCode.toUpperCase(), isActive: true });
    if (!org) return res.status(400).json({ message: 'קוד ארגון לא תקין' });
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ message: 'משתמש עם מייל זה כבר קיים' });

    const otp = generateOtp();
    const user = new User({
      email: email.toLowerCase(),
      password,
      organization: org._id,
      emailOtp: otp,
      emailOtpExpires: new Date(Date.now() + 10 * 60 * 1000),
    });
    await user.save();
    sendOtpEmail(user.email, otp).catch((err) => console.error('OTP email failed:', err.message));

    const token = signToken(user._id);
    res.status(201).json({ token, user: user.toSafeJSON(), nextStep: 'verify_email' });
  } catch (err) {
    next(err);
  }
}

async function verifyOtp(req, res, next) {
  try {
    const { email, otp } = verifyOtpSchema.parse(req.body);
    const user = await User.findOne({ email: email.toLowerCase() }).select('+emailOtp +emailOtpExpires');
    if (!user) return res.status(404).json({ message: 'משתמש לא נמצא' });
    if (user.isEmailVerified) return res.json({ message: 'המייל כבר מאומת', user: user.toSafeJSON() });
    if (!user.emailOtp || !user.emailOtpExpires || user.emailOtpExpires < new Date())
      return res.status(400).json({ message: 'הקוד פג תוקף, יש לבקש קוד חדש' });
    if (user.emailOtp !== otp) return res.status(400).json({ message: 'קוד לא תקין' });

    user.isEmailVerified = true;
    user.emailOtp = undefined;
    user.emailOtpExpires = undefined;
    await user.save();

    const token = signToken(user._id);
    res.json({ token, user: user.toSafeJSON(), nextStep: user.isProfileComplete ? 'dashboard' : 'questionnaire' });
  } catch (err) {
    next(err);
  }
}

async function resendOtp(req, res, next) {
  try {
    const { email } = resendOtpSchema.parse(req.body);
    const user = await User.findOne({ email: email.toLowerCase() }).select('+emailOtp +emailOtpExpires');
    if (!user) return res.status(404).json({ message: 'משתמש לא נמצא' });
    if (user.isEmailVerified) return res.status(400).json({ message: 'המייל כבר מאומת' });
    const otp = generateOtp();
    user.emailOtp = otp;
    user.emailOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();
    await sendOtpEmail(user.email, otp);
    res.json({ message: 'נשלח קוד חדש למייל' });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password').populate('organization');
    if (!user) return res.status(401).json({ message: 'מייל או סיסמה שגויים' });
    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ message: 'מייל או סיסמה שגויים' });

    const token = signToken(user._id);
    let nextStep = 'dashboard';
    if (!user.isEmailVerified) nextStep = 'verify_email';
    else if (!user.isProfileComplete) nextStep = 'questionnaire';
    res.json({ token, user: user.toSafeJSON(), nextStep });
  } catch (err) {
    next(err);
  }
}

async function submitQuestionnaire(req, res, next) {
  try {
    const data = questionnaireSchema.parse(req.body);
    const user = req.user;
    if (!user.isEmailVerified) return res.status(403).json({ message: 'יש לאמת את המייל לפני מילוי השאלון' });
    user.profile = data;
    user.isProfileComplete = true;
    await user.save();
    res.json({ user: user.toSafeJSON(), nextStep: 'dashboard' });
  } catch (err) {
    next(err);
  }
}

async function forgotPassword(req, res, next) {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    const user = await User.findOne({ email: email.toLowerCase() });
    // Return success regardless to prevent user enumeration
    if (!user) return res.json({ message: 'אם הכתובת קיימת במערכת, נשלח קוד לאיפוס הסיסמה' });

    const otp = generateOtp();
    user.resetPasswordOtp = otp;
    user.resetPasswordOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await sendOtpEmail(
      user.email,
      otp,
      'קוד לאיפוס סיסמה — קהילת חטיבת יזרעאלי',
      'קוד האיפוס שלך'
    );
    res.json({ message: 'אם הכתובת קיימת במערכת, נשלח קוד לאיפוס הסיסמה' });
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const { email, otp, newPassword } = resetPasswordSchema.parse(req.body);
    const user = await User.findOne({ email: email.toLowerCase() })
      .select('+resetPasswordOtp +resetPasswordOtpExpires +password');
    if (!user) return res.status(404).json({ message: 'משתמש לא נמצא' });
    if (!user.resetPasswordOtp || !user.resetPasswordOtpExpires || user.resetPasswordOtpExpires < new Date())
      return res.status(400).json({ message: 'הקוד פג תוקף, יש לבקש קוד חדש' });
    if (user.resetPasswordOtp !== otp) return res.status(400).json({ message: 'קוד לא תקין' });

    user.password = newPassword;
    user.resetPasswordOtp = undefined;
    user.resetPasswordOtpExpires = undefined;
    await user.save();

    const token = signToken(user._id);
    res.json({ token, message: 'הסיסמה עודכנה בהצלחה' });
  } catch (err) {
    next(err);
  }
}

async function requestLoginOtp(req, res, next) {
  try {
    const { email } = loginOtpRequestSchema.parse(req.body);
    const user = await User.findOne({ email: email.toLowerCase() });
    if (user && user.isEmailVerified) {
      const otp = generateOtp();
      user.loginOtp = otp;
      user.loginOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
      await user.save();
      sendOtpEmail(
        user.email,
        otp,
        'קוד כניסה — קהילת חטיבת יזרעאלי',
        'קוד הכניסה שלך',
      ).catch((err) => console.error('Login OTP email failed:', err.message));
    }
    // Always return same response to prevent user enumeration
    res.json({ message: 'אם הכתובת קיימת במערכת, ישלח קוד כניסה' });
  } catch (err) {
    next(err);
  }
}

async function verifyLoginOtp(req, res, next) {
  try {
    const { email, otp } = loginOtpVerifySchema.parse(req.body);
    const user = await User.findOne({ email: email.toLowerCase() })
      .select('+loginOtp +loginOtpExpires')
      .populate('organization');
    if (!user || !user.isEmailVerified)
      return res.status(401).json({ message: 'קוד לא תקין' });
    if (!user.loginOtp || !user.loginOtpExpires || user.loginOtpExpires < new Date())
      return res.status(400).json({ message: 'הקוד פג תוקף, יש לבקש קוד חדש' });
    if (user.loginOtp !== otp)
      return res.status(400).json({ message: 'קוד לא תקין' });

    user.loginOtp = undefined;
    user.loginOtpExpires = undefined;
    await user.save();

    const token = signToken(user._id);
    const nextStep = user.isProfileComplete ? 'dashboard' : 'questionnaire';
    res.json({ token, user: user.toSafeJSON(), nextStep });
  } catch (err) {
    next(err);
  }
}

async function me(req, res) {
  res.json({ user: req.user.toSafeJSON ? req.user.toSafeJSON() : req.user });
}

module.exports = {
  checkOrganizationCode,
  register,
  verifyOtp,
  resendOtp,
  login,
  requestLoginOtp,
  verifyLoginOtp,
  submitQuestionnaire,
  forgotPassword,
  resetPassword,
  me,
};
