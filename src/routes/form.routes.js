const router = require('express').Router();
const ctrl = require('../controllers/form.controller');
const { requireAuth, requireVerified, requireProfile } = require('../middleware/auth');

router.use(requireAuth, requireVerified, requireProfile);

router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/:id/submit', ctrl.submit);

module.exports = router;
