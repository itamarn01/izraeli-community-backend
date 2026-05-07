const User = require('../models/User');
const Post = require('../models/Post');
const Job = require('../models/Job');
const DeletedAccount = require('../models/DeletedAccount');
const { generateOtp } = require('../utils/token');
const { sendOtpEmail } = require('../services/email');
const { updateProfileSchema, changeEmailSchema, verifyNewEmailSchema } = require('../validation/schemas');
const { uploadImageBuffer } = require('../services/cloudinary');

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
    const baseUrl = process.env.API_URL || `${req.protocol}://${req.get('host')}`;
    const cvUrl = `${baseUrl}/uploads/${req.file.filename}`;
    req.user.cvUrl = cvUrl;
    await req.user.save();
    res.json({ cvUrl });
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ message: 'חסרים שדות' });
    if (newPassword.length < 8)
      return res.status(400).json({ message: 'הסיסמה החדשה חייבת להכיל לפחות 8 תווים' });

    const user = await User.findById(req.user._id).select('+password');
    const ok = await user.comparePassword(currentPassword);
    if (!ok) return res.status(400).json({ message: 'הסיסמה הנוכחית שגויה' });

    user.password = newPassword;
    await user.save();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function deleteAccount(req, res, next) {
  try {
    const user = req.user;
    const fullName = [user.profile?.firstName, user.profile?.lastName].filter(Boolean).join(' ');

    await Promise.all([
      Post.deleteMany({ author: user._id }),
      Job.deleteMany({ postedBy: user._id }),
      Post.updateMany({ 'comments.user': user._id }, { $pull: { comments: { user: user._id } } }),
      Job.updateMany({ 'applications.user': user._id }, { $pull: { applications: { user: user._id } } }),
    ]);

    await DeletedAccount.create({ email: user.email, fullName, organization: user.organization });
    await user.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function acceptTerms(req, res, next) {
  try {
    req.user.termsAcceptedAt = new Date();
    await req.user.save();
    res.json({ user: req.user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
}

async function uploadAvatar(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ message: 'לא נמצא קובץ' });
    const result = await uploadImageBuffer(req.file.buffer, 'izraeli-community/avatars');
    req.user.avatarUrl = result.secure_url;
    await req.user.save();
    res.json({ avatarUrl: result.secure_url });
  } catch (err) {
    next(err);
  }
}

module.exports = { updateProfile, requestEmailChange, verifyNewEmail, uploadCv, uploadAvatar, changePassword, deleteAccount, acceptTerms };
