const User = require('../models/User');
const { generateOtp } = require('../utils/token');
const { sendOtpEmail } = require('../services/email');
const { updateProfileSchema, changeEmailSchema, verifyNewEmailSchema } = require('../validation/schemas');

async function updateProfile(req, res, next) {
  try {
    const data = updateProfileSchema.parse(req.body);
    const user = req.user;
    user.profile = { ...user.profile.toObject(), ...data };
    await user.save();
    res.json({ user: user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
}

async function requestEmailChange(req, res, next) {
  try {
    const { newEmail } = changeEmailSchema.parse(req.body);
    const normalized = newEmail.toLowerCase().trim();

    const taken = await User.findOne({ email: normalized });
    if (taken) return res.status(409).json({ message: 'כתובת מייל זו כבר בשימוש' });

    const user = req.user;
    const otp = generateOtp();
    user.pendingEmail = normalized;
    user.pendingEmailOtp = otp;
    user.pendingEmailOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await sendOtpEmail(normalized, otp, 'אימות כתובת מייל חדשה', 'קוד האימות');
    res.json({ message: `נשלח קוד אימות אל ${normalized}` });
  } catch (err) {
    next(err);
  }
}

async function verifyNewEmail(req, res, next) {
  try {
    const { otp } = verifyNewEmailSchema.parse(req.body);
    const user = await User.findById(req.user._id).select('+pendingEmail +pendingEmailOtp +pendingEmailOtpExpires');
    if (!user.pendingEmail) return res.status(400).json({ message: 'אין בקשת שינוי מייל פעילה' });
    if (!user.pendingEmailOtp || !user.pendingEmailOtpExpires || user.pendingEmailOtpExpires < new Date())
      return res.status(400).json({ message: 'הקוד פג תוקף, יש לבקש קוד חדש' });
    if (user.pendingEmailOtp !== otp) return res.status(400).json({ message: 'קוד לא תקין' });

    user.email = user.pendingEmail;
    user.pendingEmail = undefined;
    user.pendingEmailOtp = undefined;
    user.pendingEmailOtpExpires = undefined;
    await user.save();

    res.json({ user: user.toSafeJSON(), message: 'כתובת המייל עודכנה בהצלחה' });
  } catch (err) {
    next(err);
  }
}

async function uploadCv(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ message: 'לא נמצא קובץ' });
    const cvUrl = `/uploads/${req.file.filename}`;
    req.user.cvUrl = cvUrl;
    await req.user.save();
    res.json({ cvUrl });
  } catch (err) {
    next(err);
  }
}

module.exports = { updateProfile, requestEmailChange, verifyNewEmail, uploadCv };
