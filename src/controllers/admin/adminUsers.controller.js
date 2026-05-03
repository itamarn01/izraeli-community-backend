const crypto = require('crypto');
const { z } = require('zod');
const User = require('../../models/User');
const Post = require('../../models/Post');
const Job = require('../../models/Job');
const { sendAdminMessage, sendPasswordResetByAdmin } = require('../../services/email');

const messageSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8).optional(),
  sendEmail: z.boolean().optional(),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  isEmailVerified: z.boolean().optional(),
  isProfileComplete: z.boolean().optional(),
  role: z.enum(['member', 'admin']).optional(),
  organization: z.string().optional(),
  profile: z
    .object({
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      phone: z.string().optional(),
      address: z.object({ city: z.string().optional(), street: z.string().optional() }).optional(),
    })
    .partial()
    .optional(),
});

function generateRandomPassword() {
  return crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) + 'A1!';
}

async function list(req, res, next) {
  try {
    const { q, organization, isEmailVerified, role, page = 1, limit = 25 } = req.query;
    const filter = {};
    if (organization) filter.organization = organization;
    if (role) filter.role = role;
    if (isEmailVerified === 'true') filter.isEmailVerified = true;
    if (isEmailVerified === 'false') filter.isEmailVerified = false;
    if (q) {
      const re = new RegExp(q, 'i');
      filter.$or = [
        { email: re },
        { 'profile.firstName': re },
        { 'profile.lastName': re },
        { 'profile.phone': re },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).populate('organization', 'name code'),
      User.countDocuments(filter),
    ]);

    res.json({ users, hasMore: skip + users.length < total, total });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const user = await User.findById(req.params.id).populate('organization', 'name code');
    if (!user) return res.status(404).json({ message: 'משתמש לא נמצא' });

    const [postCount, jobCount] = await Promise.all([
      Post.countDocuments({ author: user._id }),
      Job.countDocuments({ postedBy: user._id }),
    ]);

    res.json({ user, stats: { postCount, jobCount } });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const data = updateUserSchema.parse(req.body);
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'משתמש לא נמצא' });

    if (data.email) user.email = data.email.toLowerCase();
    if (data.isEmailVerified !== undefined) user.isEmailVerified = data.isEmailVerified;
    if (data.isProfileComplete !== undefined) user.isProfileComplete = data.isProfileComplete;
    if (data.role) user.role = data.role;
    if (data.organization) user.organization = data.organization;
    if (data.profile) {
      const current = user.profile?.toObject ? user.profile.toObject() : user.profile || {};
      user.profile = { ...current, ...data.profile };
    }
    await user.save();
    const populated = await user.populate('organization', 'name code');
    res.json({ user: populated.toSafeJSON() });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'משתמש לא נמצא' });

    // Cascade: remove posts and jobs they created
    await Promise.all([
      Post.deleteMany({ author: user._id }),
      Job.deleteMany({ postedBy: user._id }),
    ]);
    await user.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const { newPassword, sendEmail = true } = resetPasswordSchema.parse(req.body);
    const user = await User.findById(req.params.id).select('+password');
    if (!user) return res.status(404).json({ message: 'משתמש לא נמצא' });

    const password = newPassword || generateRandomPassword();
    user.password = password;
    await user.save();

    if (sendEmail) {
      sendPasswordResetByAdmin({
        to: user.email,
        newPassword: password,
        adminName: req.admin.fullName || req.admin.username,
      }).catch((err) => console.error('Failed to send reset email:', err.message));
    }

    res.json({ ok: true, newPassword: password });
  } catch (err) {
    next(err);
  }
}

async function sendMessage(req, res, next) {
  try {
    const { subject, message } = messageSchema.parse(req.body);
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'משתמש לא נמצא' });

    await sendAdminMessage({
      to: user.email,
      subject,
      message,
      adminName: req.admin.fullName || req.admin.username,
    });
    res.json({ ok: true, message: 'ההודעה נשלחה בהצלחה' });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getOne, update, remove, resetPassword, sendMessage };
