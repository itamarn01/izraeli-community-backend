const crypto = require('crypto');
const { z } = require('zod');
const User = require('../../models/User');
const Post = require('../../models/Post');
const Job = require('../../models/Job');
const DeletedAccount = require('../../models/DeletedAccount');
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

function buildFilter({ q, organization, isEmailVerified, role, gedud, employmentStatus, gender, maritalStatus, city }) {
  const filter = {};
  if (organization) filter.organization = organization;
  if (role) filter.role = role;
  if (isEmailVerified === 'true') filter.isEmailVerified = true;
  if (isEmailVerified === 'false') filter.isEmailVerified = false;
  if (gedud) filter['profile.gedud'] = gedud;
  if (employmentStatus) {
    filter.$and = (filter.$and || []).concat([{ $or: [
      { 'profile.employmentStatuses': employmentStatus },
      { 'profile.employmentStatus': employmentStatus },
    ]}]);
  }
  if (gender) filter['profile.gender'] = gender;
  if (maritalStatus) filter['profile.maritalStatus'] = maritalStatus;
  if (city) filter['profile.address.city'] = new RegExp(city, 'i');
  if (q) {
    const re = new RegExp(q, 'i');
    filter.$and = (filter.$and || []).concat([{ $or: [
      { email: re },
      { 'profile.firstName': re },
      { 'profile.lastName': re },
      { 'profile.phone': re },
    ]}]);
  }
  return filter;
}

async function list(req, res, next) {
  try {
    const { q, organization, isEmailVerified, role, gedud, employmentStatus, gender, maritalStatus, city, page = 1, limit = 25 } = req.query;
    const filter = buildFilter({ q, organization, isEmailVerified, role, gedud, employmentStatus, gender, maritalStatus, city });

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

async function exportUsers(req, res, next) {
  try {
    const { q, organization, isEmailVerified, role, gedud, employmentStatus, gender, maritalStatus, city } = req.query;
    const filter = buildFilter({ q, organization, isEmailVerified, role, gedud, employmentStatus, gender, maritalStatus, city });

    const users = await User.find(filter).sort({ createdAt: -1 }).populate('organization', 'name');

    const GENDER_HE = { male: 'זכר', female: 'נקבה', other: 'אחר' };
    const MARITAL_HE = { single: 'רווק/ה', married: 'נשוי/אה', common_law: 'ידוע/ה בציבור', in_relationship: 'בזוגיות', divorced: 'גרוש/ה', other: 'אחר' };
    const EMPLOY_HE = { employee: 'שכיר/ה', self_employed: 'עצמאי/ת', combined: 'משולב', not_working: 'לא עובד/ת', student: 'סטודנט/ית' };
    const employStr = (p) => {
      const arr = p.employmentStatuses?.length ? p.employmentStatuses : (p.employmentStatus ? [p.employmentStatus] : []);
      return arr.map((s) => EMPLOY_HE[s] || s).join(' + ');
    };

    const headers = ['שם פרטי','שם משפחה','מייל','טלפון','גדוד','מגדר','מצב משפחתי','תעסוקה','שם עסק / תחום','עיר','רחוב','מספר בית','דירה','ילדים','ארגון','תפקיד','מאומת','נוצר'];
    const toCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = users.map((u) => {
      const p = u.profile || {};
      return [
        p.firstName || '',
        p.lastName || '',
        u.email,
        p.phone || '',
        p.gedud || '',
        GENDER_HE[p.gender] || '',
        MARITAL_HE[p.maritalStatus] || '',
        employStr(p),
        (p.employmentStatuses?.includes('self_employed') || p.employmentStatus === 'self_employed' || p.employmentStatus === 'combined') ? (p.selfEmployedBusiness || '') : '',
        p.address?.city || '',
        p.address?.street || '',
        p.address?.houseNumber || '',
        p.address?.apartment || '',
        p.children?.length ?? 0,
        u.organization?.name || '',
        u.role === 'admin' ? 'מנהל' : 'חבר',
        u.isEmailVerified ? 'כן' : 'לא',
        new Date(u.createdAt).toLocaleDateString('he-IL'),
      ].map(toCell).join(',');
    });

    const csv = '﻿' + [headers.map(toCell).join(','), ...rows].join('\n');

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="users.csv"',
    });
    res.send(csv);
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

async function listDeletedAccounts(req, res, next) {
  try {
    const { page = 1, limit = 25 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const [accounts, total] = await Promise.all([
      DeletedAccount.find().sort({ deletedAt: -1 }).skip(skip).limit(Number(limit)).populate('organization', 'name'),
      DeletedAccount.countDocuments(),
    ]);
    res.json({ accounts, hasMore: skip + accounts.length < total, total });
  } catch (err) {
    next(err);
  }
}

async function upcomingBirthdays(req, res, next) {
  try {
    const { organization } = req.query;
    const filter = { 'profile.dateOfBirth': { $exists: true, $ne: null } };
    if (organization) filter.organization = organization;

    const users = await User.find(filter)
      .select('profile.firstName profile.lastName profile.dateOfBirth profile.gedud profile.phone email avatarUrl')
      .lean();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    function daysUntil(dob) {
      const d = new Date(dob);
      const next = new Date(today.getFullYear(), d.getMonth(), d.getDate());
      if (next < today) next.setFullYear(today.getFullYear() + 1);
      return Math.round((next - today) / (1000 * 60 * 60 * 24));
    }

    const withDays = users
      .map((u) => ({ ...u, daysUntil: daysUntil(u.profile.dateOfBirth) }))
      .filter((u) => u.daysUntil <= 13)
      .sort((a, b) => a.daysUntil - b.daysUntil);

    res.json({
      thisWeek: withDays.filter((u) => u.daysUntil <= 6),
      nextWeek: withDays.filter((u) => u.daysUntil >= 7),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getOne, update, remove, resetPassword, sendMessage, exportUsers, listDeletedAccounts, upcomingBirthdays };
