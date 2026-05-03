const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

async function requireAdminPanel(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'אין הרשאה — חסר טוקן' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.scope !== 'admin') return res.status(401).json({ message: 'טוקן לא תקין למערכת ניהול' });

    const admin = await Admin.findById(payload.sub);
    if (!admin) return res.status(401).json({ message: 'מנהל לא נמצא' });
    if (!admin.isEmailVerified) return res.status(403).json({ message: 'יש לאמת את כתובת המייל' });

    req.admin = admin;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'טוקן לא תקין או פג תוקף' });
  }
}

function requireSuperadmin(req, res, next) {
  if (req.admin?.role !== 'superadmin') {
    return res.status(403).json({ message: 'נדרשות הרשאות superadmin' });
  }
  next();
}

function signAdminToken(adminId) {
  return jwt.sign(
    { sub: adminId.toString(), scope: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

module.exports = { requireAdminPanel, requireSuperadmin, signAdminToken };
