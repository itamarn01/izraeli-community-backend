const Form = require('../models/Form');

// List published forms for the user's organization.
async function list(req, res, next) {
  try {
    const orgId = req.user.organization._id || req.user.organization;
    const forms = await Form.find({ organization: orgId, isPublished: true })
      .select('title description updatedAt')
      .sort({ createdAt: -1 });
    res.json({ forms });
  } catch (err) {
    next(err);
  }
}

// Get a single published form (full body + fields) scoped to the user's org.
async function getOne(req, res, next) {
  try {
    const orgId = String(req.user.organization._id || req.user.organization);
    const form = await Form.findById(req.params.id).populate('organization', 'name');
    if (!form || String(form.organization?._id || form.organization) !== orgId || !form.isPublished) {
      return res.status(404).json({ message: 'הטופס לא נמצא' });
    }
    res.json({ form });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getOne };
