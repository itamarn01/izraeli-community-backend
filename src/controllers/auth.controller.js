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

// Says when it cannot send, for the same reason requestLoginOtp does: the old
// "if the address exists we sent a code" left people who never registered
// staring at a code screen for a mail that was never coming. `authLimiter` on
// the route is what holds enumeration back.
async function forgotPassword(req, res, next) {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    const emailLower = email.toLowerCase();
    const user = await User.findOne({ email: emailLower });

    if (!user) {
      // A spouse address can sign in, but the account's single password lives
      // on the primary address — so reset from here would have nothing to
      // reset. Point them at the code login instead of at registration.
      const spouseOf = await User.findOne({
        'profile.spouseEmail': emailLower,
        'profile.spouseEmailVerified': true,
      }).select('_id');
      if (spouseOf) {
        return res.status(400).json({
          code: 'spouse_email',
          message: 'הכתובת הזו רשומה כבן/בת זוג ואין לה סיסמה נפרדת. אפשר להיכנס עם קוד לאימייל, או לאפס את הסיסמה מכתובת המייל הראשית של החשבון.',
        });
      }
      return res.status(404).json({
        code: 'not_registered',
        message: 'הכתובת הזו אינה רשומה במערכת, ולכן לא ניתן לשלוח אליה קוד לאיפוס סיסמה. יש להירשם קודם עם קוד הארגון.',
      });
    }

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
    res.json({ message: 'קוד לאיפוס הסיסמה נשלח לכתובת המייל' });
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

// A login identifier can be the account's own email or its verified spouse
// email — either resolves to the same account, per the shared-login-code design.
function findByLoginIdentifier(emailLower, extraSelect = '') {
  return User.findOne({
    $or: [
      { email: emailLower },
      { 'profile.spouseEmail': emailLower, 'profile.spouseEmailVerified': true },
    ],
  }).select(extraSelect);
}

// Unlike the other code-sending endpoints, this one tells the caller when the
// address is unknown. People who never registered were typing their email,
// landing on the "we sent you a code" screen and waiting for a mail that was
// never coming — a dead end with no way out. Enumeration is held back by
// `authLimiter` on the route (20 requests / 15 min per IP in production)
// rather than by a vague answer. `code` lets the UI offer the way forward.
async function requestLoginOtp(req, res, next) {
  try {
    const { email } = loginOtpRequestSchema.parse(req.body);
    const user = await findByLoginIdentifier(email.toLowerCase());

    if (!user) {
      // A spouse address that was entered but never verified is not a login
      // identifier yet — telling them to register would be the wrong advice,
      // since the account they belong to already exists.
      const pendingSpouse = await User.findOne({ 'profile.spouseEmail': email.toLowerCase() }).select('_id');
      if (pendingSpouse) {
        return res.status(403).json({
          code: 'spouse_not_verified',
          message: 'הכתובת הזו נוספה כבן/בת זוג אך טרם אומתה, ולכן אי אפשר לשלוח אליה קוד כניסה. יש להשלים את האימות מהפרופיל של בן/בת הזוג הרשום/ה.',
        });
      }
      return res.status(404).json({
        code: 'not_registered',
        message: 'הכתובת הזו אינה רשומה במערכת, ולכן לא ניתן לשלוח אליה קוד כניסה. יש להירשם קודם עם קוד הארגון.',
      });
    }

    // Registered but never finished verifying. Password login is the only way
    // in for them (it routes to the verification screen), so say that instead
    // of sending a login code that would bypass verification.
    if (!user.isEmailVerified) {
      return res.status(403).json({
        code: 'email_not_verified',
        message: 'החשבון קיים אבל כתובת המייל עדיין לא אומתה. יש להתחבר עם הסיסמה שבחרתם בהרשמה כדי להשלים את האימות.',
      });
    }

    const otp = generateOtp();
    user.loginOtp = otp;
    user.loginOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    // The same code goes to both addresses, so whichever of the two typed
    // it in can complete the login — one shared account, two doors in.
    const recipients = [user.email];
    if (user.profile?.spouseEmailVerified && user.profile.spouseEmail && user.profile.spouseEmail !== user.email) {
      recipients.push(user.profile.spouseEmail);
    }
    Promise.all(
      recipients.map((to) =>
        sendOtpEmail(to, otp, 'קוד כניסה — קהילת חטיבת יזרעאלי', 'קוד הכניסה שלך')
      )
    ).catch((err) => console.error('Login OTP email failed:', err.message));

    res.json({ message: 'קוד הכניסה נשלח לכתובת המייל' });
  } catch (err) {
    next(err);
  }
}

async function verifyLoginOtp(req, res, next) {
  try {
    const { email, otp } = loginOtpVerifySchema.parse(req.body);
    const user = await findByLoginIdentifier(email.toLowerCase(), '+loginOtp +loginOtpExpires').populate('organization');
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
