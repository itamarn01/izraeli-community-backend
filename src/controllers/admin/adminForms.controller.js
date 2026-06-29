const Form = require('../../models/Form');
const FormSubmission = require('../../models/FormSubmission');
const { formInputSchema } = require('../../validation/schemas');
const { createNotification } = require('../../services/notifications');

// Bell notification when a form becomes visible to members.
function notifyPublished(form) {
  return createNotification({
    organization: form.organization,
    type: 'form',
    title: `טופס חדש: ${form.title}`,
    body: form.description || '',
    resourceId: form._id,
  });
}

async function list(req, res, next) {
  try {
    const { q, organization, isPublished, page = 1, limit = 25 } = req.query;
    const filter = {};
    if (organization) filter.organization = organization;
    if (isPublished === 'true') filter.isPublished = true;
    if (isPublished === 'false') filter.isPublished = false;
    if (q) {
      filter.$or = [
        { title: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
      ];
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [forms, total] = await Promise.all([
      Form.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('organization', 'name code'),
      Form.countDocuments(filter),
    ]);
    res.json({ forms, hasMore: skip + forms.length < total, total });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const form = await Form.findById(req.params.id);
    if (!form) return res.status(404).json({ message: 'הטופס לא נמצא' });
    res.json({ form });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const data = formInputSchema.parse(req.body);
    const orgId = req.body.organization;
    if (!orgId) return res.status(400).json({ message: 'יש לבחור ארגון' });
    const form = await Form.create({ ...data, organization: orgId });
    if (form.isPublished) await notifyPublished(form);
    res.status(201).json({ form });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const data = formInputSchema.partial().parse(req.body);
    if (req.body.organization) data.organization = req.body.organization;
    const before = await Form.findById(req.params.id).select('isPublished');
    if (!before) return res.status(404).json({ message: 'הטופס לא נמצא' });
    const form = await Form.findByIdAndUpdate(req.params.id, data, { new: true });
    // Notify only on the draft → published transition (avoid re-notifying on edits).
    if (!before.isPublished && form.isPublished) await notifyPublished(form);
    res.json({ form });
  } catch (err) {
    next(err);
  }
}

async function togglePublish(req, res, next) {
  try {
    const form = await Form.findById(req.params.id);
    if (!form) return res.status(404).json({ message: 'הטופס לא נמצא' });
    form.isPublished = !form.isPublished;
    await form.save();
    if (form.isPublished) await notifyPublished(form);
    res.json({ form });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const form = await Form.findByIdAndDelete(req.params.id);
    if (!form) return res.status(404).json({ message: 'הטופס לא נמצא' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function listSubmissions(req, res, next) {
  try {
    const form = await Form.findById(req.params.id).select('title fields');
    if (!form) return res.status(404).json({ message: 'הטופס לא נמצא' });
    const submissions = await FormSubmission.find({ form: req.params.id })
      .populate('user', 'firstName lastName email phone')
      .sort({ createdAt: -1 });
    res.json({ form, submissions });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getOne, create, update, togglePublish, remove, listSubmissions };
