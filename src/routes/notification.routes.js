const router = require('express').Router();
const { requireAuth, requireVerified, requireProfile } = require('../middleware/auth');
const ctrl = require('../controllers/notification.controller');

router.use(requireAuth, requireVerified, requireProfile);

router.get('/', ctrl.list);
router.post('/:id/read', ctrl.markRead);
router.post('/read-all', ctrl.markAllRead);
router.delete('/clear-all', ctrl.clearAll);

module.exports = router;
