const router = require('express').Router();
const ctrl = require('../controllers/benefit.controller');
const { requireAuth, requireVerified, requireProfile, requireAdmin } = require('../middleware/auth');

router.use(requireAuth, requireVerified, requireProfile);

router.get('/', ctrl.list);
router.post('/suggest', ctrl.suggest);
router.get('/:id', ctrl.getOne);
router.get('/:id/my-coupon', ctrl.getMyCoupon);
router.post('/:id/claim', ctrl.claimCoupon);
router.post('/', requireAdmin, ctrl.create);
router.patch('/:id', requireAdmin, ctrl.update);
router.delete('/:id', requireAdmin, ctrl.remove);

module.exports = router;
