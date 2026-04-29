const router = require('express').Router();
const ctrl = require('../controllers/user.controller');
const { requireAuth } = require('../middleware/auth');
const { cvUpload } = require('../middleware/upload');

router.use(requireAuth);

router.get('/me', (req, res) => res.json({ user: req.user.toSafeJSON() }));
router.patch('/me/profile', ctrl.updateProfile);
router.post('/me/change-email', ctrl.requestEmailChange);
router.post('/me/verify-email', ctrl.verifyNewEmail);
router.post('/me/cv', cvUpload.single('cv'), ctrl.uploadCv);

module.exports = router;
