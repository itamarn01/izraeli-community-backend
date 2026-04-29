const router = require('express').Router();
const ctrl = require('../controllers/post.controller');
const { requireAuth, requireVerified, requireProfile } = require('../middleware/auth');

router.use(requireAuth, requireVerified, requireProfile);

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.delete('/:id', ctrl.remove);
router.post('/:id/like', ctrl.toggleLike);
router.post('/:id/comments', ctrl.comment);

module.exports = router;
