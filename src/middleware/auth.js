const jwt = require('jsonwebtoken');
const User = require('../models/User');

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'אין הרשאה — חסר טוקן' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub).populate('organization');
    if (!user) return res.status(401).json({ message: 'משתמש לא נמצא' });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'טוקן לא תקין או פג תוקף' });
  }
}

function requireVerified(req, res, next) {
  if (!req.user.isEmailVerified) {
    return res.status(403).json({ message: 'יש לאמת את כתובת המייל לפני המשך', code: 'EMAIL_NOT_VERIFIED' });
  }
  next();
}

function requireProfile(req, res, next) {
  if (!req.user.isProfileComplete) {
    return res.status(403).json({ message: 'יש להשלים את השאלון האישי', code: 'PROFILE_INCOMPLETE' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'נדרשות הרשאות מנהל' });
  next();
}

module.exports = { requireAuth, requireVerified, requireProfile, requireAdmin };
