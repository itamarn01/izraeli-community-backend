const Benefit = require('../models/Benefit');
const BenefitSuggestion = require('../models/BenefitSuggestion');
const { benefitSchema, benefitSuggestionSchema } = require('../validation/schemas');
const { createNotification } = require('../services/notifications');
const { sendAdminMessage, sendCouponEmail } = require('../services/email');

// Where a new suggestion is announced for review.
const SUGGESTIONS_INBOX = process.env.SUPPORT_EMAIL || 'community.izraeli@gmail.com';

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

// The member fills in the benefit exactly as it will be published; approval in
// the admin panel copies it across as-is. Nothing here reaches the benefits
// list until an admin approves it.
async function suggest(req, res, next) {
  try {
    const data = benefitSuggestionSchema.parse(req.body);
    const orgId = req.user.organization._id || req.user.organization;
    const submitterName =
      [req.user.profile?.firstName, req.user.profile?.lastName].filter(Boolean).join(' ') || req.user.email;

    const suggestion = await BenefitSuggestion.create({
      ...data,
      organization: orgId,
      submittedBy: req.user._id,
    });

    const lines = [
      `עסק: ${data.businessName}`,
      `כותרת: ${data.title}`,
      `תיאור: ${data.description}`,
      data.discountType === 'percentage' && data.discountPercent ? `הנחה: ${data.discountPercent}%` : '',
      data.discountType === 'price_comparison' && data.discountedPrice != null
        ? `מחיר: ${data.originalPrice ?? '?'} ₪ ← ${data.discountedPrice} ₪`
        : '',
      data.whatYouGet ? `מה מקבלים: ${data.whatYouGet}` : '',
      data.contactName ? `שם איש קשר: ${data.contactName}` : '',
      data.contactPhone ? `טלפון: ${data.contactPhone}` : '',
      data.website ? `אתר: ${data.website}` : '',
      data.imageUrl ? 'צורפה תמונה' : 'ללא תמונה',
    ].filter(Boolean);

    sendAdminMessage({
      to: SUGGESTIONS_INBOX,
      subject: `הצעת הטבה חדשה: ${data.businessName}`,
      message: `הוגשה הצעת הטבה חדשה הממתינה לאישור:\n\n${lines.join('\n')}\n\nהוגש על ידי: ${submitterName}\n\nלאישור ופרסום: מערכת הניהול ← הצעות הטבות.`,
      adminName: 'מערכת קהילת יזרעאלי',
    }).catch((err) => console.error('[suggest] email failed:', err.message));

    res.status(201).json({ suggestion });
  } catch (err) {
    next(err);
  }
}

async function getMyCoupon(req, res, next) {
  try {
    const orgId = String(req.user.organization._id || req.user.organization);
    const benefit = await Benefit.findById(req.params.id);
    if (!benefit || String(benefit.organization) !== orgId || benefit.isHidden) {
      return res.status(404).json({ message: 'הטבה לא נמצאה' });
    }
    if (!benefit.couponEnabled) return res.json({ coupon: null });
    const coupon = benefit.coupons.find((c) => c.claimedBy && String(c.claimedBy) === String(req.user._id));
    const soldOut = !benefit.coupons.some((c) => !c.claimedBy);
    const expired = benefit.validUntil && new Date() > new Date(benefit.validUntil);
    res.json({ coupon: coupon || null, soldOut, expired });
  } catch (err) {
    next(err);
  }
}

async function claimCoupon(req, res, next) {
  try {
    const orgId = String(req.user.organization._id || req.user.organization);
    const benefit = await Benefit.findById(req.params.id);
    if (!benefit || String(benefit.organization) !== orgId || benefit.isHidden) {
      return res.status(404).json({ message: 'הטבה לא נמצאה' });
    }
    if (!benefit.couponEnabled) return res.status(400).json({ message: 'הטבה זו אינה כוללת קופונים' });
    if (benefit.validUntil && new Date() > new Date(benefit.validUntil)) {
      return res.status(400).json({ message: 'ההטבה פגה תוקף' });
    }

    const existing = benefit.coupons.find((c) => c.claimedBy && String(c.claimedBy) === String(req.user._id));
    if (existing) return res.json({ coupon: existing, alreadyClaimed: true });

    const available = benefit.coupons.find((c) => !c.claimedBy);
    if (!available) return res.status(400).json({ message: 'נגמרו הקופונים, מצטערים!' });

    available.claimedBy = req.user._id;
    available.claimedAt = new Date();
    await benefit.save();

    const userName = [req.user.profile?.firstName, req.user.profile?.lastName].filter(Boolean).join(' ') || '';
    sendCouponEmail({
      to: req.user.email,
      userName,
      benefitTitle: benefit.title,
      businessName: benefit.businessName,
      code: available.code,
      qrCode: available.qrCode,
      validUntil: benefit.validUntil,
    }).catch((err) => console.error('[claimCoupon] email failed:', err.message));

    res.json({ coupon: available, alreadyClaimed: false });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getOne, create, update, remove, suggest, getMyCoupon, claimCoupon };
