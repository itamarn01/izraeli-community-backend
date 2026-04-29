const router = require('express').Router();
const Organization = require('../models/Organization');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/mine', requireAuth, async (req, res) => {
  res.json({ organization: req.user.organization });
});

router.post('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const org = await Organization.create(req.body);
    res.status(201).json({ organization: org });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
