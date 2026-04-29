const Benefit = require('../models/Benefit');
const { benefitSchema } = require('../validation/schemas');
const { createNotification } = require('../services/notifications');

async function list(req, res, next) {
  try {
    const { category, q } = req.query;
    const filter = { organization: req.user.organization._id || req.user.organization, isActive: true };
    if (category && category !== 'all') filter.category = category;
    if (q) filter.$or = [
      { title: { $regex: q, $options: 'i' } },
      { businessName: { $regex: q, $options: 'i' } },
      { description: { $regex: q, $options: 'i' } },
    ];
    const benefits = await Benefit.find(filter).sort({ createdAt: -1 });
    res.json({ benefits });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const benefit = await Benefit.findById(req.params.id);
    if (!benefit) return res.status(404).json({ message: 'הטבה לא נמצאה' });
    res.json({ benefit });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const data = benefitSchema.parse(req.body);
    const orgId = req.user.organization._id || req.user.organization;
    const benefit = await Benefit.create({ ...data, organization: orgId });

    await createNotification({
      organization: orgId,
      type: 'benefit',
      title: `הטבה חדשה: ${data.title}`,
      body: data.businessName || data.description?.slice(0, 80) || '',
      actor: req.user._id,
      resourceId: benefit._id,
    });

    res.status(201).json({ benefit });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const data = benefitSchema.partial().parse(req.body);
    const benefit = await Benefit.findByIdAndUpdate(req.params.id, data, { new: true });
    if (!benefit) return res.status(404).json({ message: 'הטבה לא נמצאה' });
    res.json({ benefit });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await Benefit.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getOne, create, update, remove };
