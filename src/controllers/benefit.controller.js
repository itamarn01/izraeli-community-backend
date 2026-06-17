const Benefit = require('../models/Benefit');
const BenefitSuggestion = require('../models/BenefitSuggestion');
const { benefitSchema } = require('../validation/schemas');
const { createNotification } = require('../services/notifications');
const { sendAdminMessage } = require('../services/email');

async function list(req, res, next) {
  try {
    const { category, q, page = 1, limit = 12 } = req.query;
    const filter = { organization: req.user.organization._id || req.user.organization, isActive: true, isHidden: { $ne: true } };
    if (category && category !== 'all') filter.category = category;
    if (q) filter.$or = [
      { title: { $regex: q, $options: 'i' } },
      { businessName: { $regex: q, $options: 'i' } },
      { description: { $regex: q, $options: 'i' } },
    ];
    const skip = (Number(page) - 1) * Number(limit);
    const [benefits, total] = await Promise.all([
      Benefit.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Benefit.countDocuments(filter),
    ]);
    res.json({ benefits, hasMore: skip + benefits.length < total, total });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const orgId = String(req.user.organization._id || req.user.organization);
    const benefit = await Benefit.findById(req.params.id);
    // Scope to the user's organization — don't allow reading another org's benefit by id.
    if (!benefit || String(benefit.organization) !== orgId || benefit.isHidden) {
      return res.status(404).json({ message: 'הטבה לא נמצאה' });
    }
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

async function suggest(req, res, next) {
  try {
    const { businessName, description, contactName, contactPhone, website } = req.body;
    if (!businessName?.trim() || !description?.trim()) {
      return res.status(400).json({ message: 'שם עסק ותיאור הם שדות חובה' });
    }
    const orgId = req.user.organization._id || req.user.organization;
    const submitterName = [req.user.profile?.firstName, req.user.profile?.lastName].filter(Boolean).join(' ') || req.user.email;

    const suggestion = await BenefitSuggestion.create({
      organization: orgId,
      submittedBy: req.user._id,
      businessName: businessName.trim(),
      description: description.trim(),
      contactName: contactName?.trim() || '',
      contactPhone: contactPhone?.trim() || '',
      website: website?.trim() || '',
    });

    sendAdminMessage({
      to: 'community.izraeli@gmail.com',
      subject: `הצעת הטבה חדשה: ${businessName.trim()}`,
      message: `הוגשה הצעת הטבה חדשה:\n\nעסק: ${businessName.trim()}\nתיאור: ${description.trim()}${contactName ? `\nשם איש קשר: ${contactName}` : ''}${contactPhone ? `\nטלפון: ${contactPhone}` : ''}${website ? `\nאתר: ${website}` : ''}\n\nהוגש על ידי: ${submitterName}`,
      adminName: 'מערכת קהילת יזרעאלי',
    }).catch((err) => console.error('[suggest] email failed:', err.message));

    res.status(201).json({ suggestion });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getOne, create, update, remove, suggest };
