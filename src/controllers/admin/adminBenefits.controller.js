const Benefit = require('../../models/Benefit');
const { benefitSchema } = require('../../validation/schemas');

async function list(req, res, next) {
  try {
    const { q, category, organization, isHidden, page = 1, limit = 25 } = req.query;
    const filter = {};
    if (organization) filter.organization = organization;
    if (category && category !== 'all') filter.category = category;
    if (isHidden === 'true') filter.isHidden = true;
    if (isHidden === 'false') filter.isHidden = false;
    if (q) {
      filter.$or = [
        { title: { $regex: q, $options: 'i' } },
        { businessName: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
      ];
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [benefits, total] = await Promise.all([
      Benefit.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('organization', 'name code'),
      Benefit.countDocuments(filter),
    ]);
    res.json({ benefits, hasMore: skip + benefits.length < total, total });
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
    const orgId = req.body.organization;
    if (!orgId) return res.status(400).json({ message: 'יש לבחור ארגון' });
    const benefit = await Benefit.create({ ...data, organization: orgId });
    res.status(201).json({ benefit });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const data = benefitSchema.partial().parse(req.body);
    if (req.body.organization) data.organization = req.body.organization;
    const benefit = await Benefit.findByIdAndUpdate(req.params.id, data, { new: true });
    if (!benefit) return res.status(404).json({ message: 'הטבה לא נמצאה' });
    res.json({ benefit });
  } catch (err) {
    next(err);
  }
}

async function toggleHide(req, res, next) {
  try {
    const benefit = await Benefit.findById(req.params.id);
    if (!benefit) return res.status(404).json({ message: 'הטבה לא נמצאה' });
    benefit.isHidden = !benefit.isHidden;
    await benefit.save();
    res.json({ benefit });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const benefit = await Benefit.findByIdAndDelete(req.params.id);
    if (!benefit) return res.status(404).json({ message: 'הטבה לא נמצאה' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getOne, create, update, toggleHide, remove };
