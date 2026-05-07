const router = require('express').Router();
const auth = require('../controllers/admin/adminAuth.controller');
const stats = require('../controllers/admin/adminStats.controller');
const users = require('../controllers/admin/adminUsers.controller');
const orgs = require('../controllers/admin/adminOrgs.controller');
const jobs = require('../controllers/admin/adminJobs.controller');
const posts = require('../controllers/admin/adminPosts.controller');
const benefits = require('../controllers/admin/adminBenefits.controller');
const { requireAdminPanel } = require('../middleware/adminAuth');
const { imageUpload } = require('../middleware/upload');
const { uploadImageBuffer } = require('../services/cloudinary');

// --- Auth ---
router.post('/auth/bootstrap', auth.bootstrap);
router.post('/auth/login', auth.login);
router.post('/auth/verify-otp', auth.verifyOtp);
router.post('/auth/resend-otp', auth.resendOtp);
router.get('/auth/me', requireAdminPanel, auth.me);

// All routes below require admin panel auth
router.use(requireAdminPanel);

// --- Image upload (for admin forms — benefits etc.) ---
router.post('/upload/image', imageUpload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'לא נמצא קובץ' });
    const result = await uploadImageBuffer(req.file.buffer);
    res.json({ url: result.secure_url, publicId: result.public_id });
  } catch (err) {
    next(err);
  }
});

// --- Stats / dashboard ---
router.get('/dashboard', stats.dashboard);

// --- Users ---
router.get('/users/export', users.exportUsers);
router.get('/users/deleted', users.listDeletedAccounts);
router.get('/users', users.list);
router.get('/users/:id', users.getOne);
router.patch('/users/:id', users.update);
router.delete('/users/:id', users.remove);
router.post('/users/:id/reset-password', users.resetPassword);
router.post('/users/:id/send-message', users.sendMessage);

// --- Organizations ---
router.get('/organizations', orgs.list);
router.post('/organizations', orgs.create);
router.patch('/organizations/:id', orgs.update);
router.delete('/organizations/:id', orgs.remove);

// --- Jobs ---
router.get('/jobs', jobs.list);
router.patch('/jobs/:id', jobs.update);
router.post('/jobs/:id/toggle-hide', jobs.toggleHide);
router.delete('/jobs/:id', jobs.remove);

// --- Posts ---
router.get('/posts', posts.list);
router.post('/posts/:id/toggle-hide', posts.toggleHide);
router.delete('/posts/:id', posts.remove);
router.delete('/posts/:id/comments/:commentId', posts.deleteComment);

// --- Benefits ---
router.get('/benefits', benefits.list);
router.get('/benefits/:id', benefits.getOne);
router.post('/benefits', benefits.create);
router.patch('/benefits/:id', benefits.update);
router.post('/benefits/:id/toggle-hide', benefits.toggleHide);
router.delete('/benefits/:id', benefits.remove);

module.exports = router;
