const router = require('express').Router();
const ctrl = require('../controllers/user.controller');
const { requireAuth } = require('../middleware/auth');
const { cvUpload, imageUpload } = require('../middleware/upload');

router.use(requireAuth);

router.get('/me', (req, res) => res.json({ user: req.user.toSafeJSON() }));
router.patch('/me/profile', ctrl.updateProfile);
router.post('/me/change-email', ctrl.requestEmailChange);
router.post('/me/verify-email', ctrl.verifyNewEmail);
router.post('/me/cv', cvUpload.single('cv'), ctrl.uploadCv);
router.post('/me/avatar', imageUpload.single('avatar'), ctrl.uploadAvatar);
router.post('/me/change-password', ctrl.changePassword);
router.delete('/me', ctrl.deleteAccount);
router.post('/me/accept-terms', ctrl.acceptTerms);

module.exports = router;
