const router = require('express').Router();
const events = require('../controllers/event.controller');
const { requireAuth, requireVerified, requireProfile } = require('../middleware/auth');

// --- Public (shareable landing page) ---
router.get('/public/:slug', events.getPublic);
router.get('/:id/calendar.ics', events.downloadIcs);

// --- Members ---
router.use(requireAuth, requireVerified, requireProfile);

router.get('/', events.list);
router.get('/popup', events.popup);
router.get('/:id', events.getOne);
router.post('/:id/register', events.register);
router.patch('/:id/register', events.updateRegistration);
router.delete('/:id/register', events.cancelRegistration);
router.post('/:id/decline', events.decline);

module.exports = router;
