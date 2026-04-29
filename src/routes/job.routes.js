const router = require('express').Router();
const ctrl = require('../controllers/job.controller');
const { requireAuth, requireVerified, requireProfile } = require('../middleware/auth');

router.use(requireAuth, requireVerified, requireProfile);

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.get('/:id', ctrl.getOne);
router.patch('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);
router.post('/:id/apply', ctrl.apply);
router.get('/:id/applications', ctrl.listApplications);

module.exports = router;
