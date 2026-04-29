const router = require('express').Router();
const { requireAuth, requireVerified, requireProfile } = require('../middleware/auth');
const { search } = require('../controllers/search.controller');

router.get('/', requireAuth, requireVerified, requireProfile, search);

module.exports = router;
