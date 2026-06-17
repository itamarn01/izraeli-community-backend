const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');

router.post('/check-org-code', ctrl.checkOrganizationCode);
router.post('/register', authLimiter, ctrl.register);
router.post('/verify-otp', authLimiter, ctrl.verifyOtp);
router.post('/resend-otp', authLimiter, ctrl.resendOtp);
router.post('/login', authLimiter, ctrl.login);
router.post('/login-otp-request', authLimiter, ctrl.requestLoginOtp);
router.post('/login-otp-verify', authLimiter, ctrl.verifyLoginOtp);
router.post('/forgot-password', authLimiter, ctrl.forgotPassword);
router.post('/reset-password', authLimiter, ctrl.resetPassword);
router.post('/questionnaire', requireAuth, ctrl.submitQuestionnaire);
router.get('/me', requireAuth, ctrl.me);

module.exports = router;
