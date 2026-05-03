const { z } = require('zod');
const Organization = require('../../models/Organization');
const User = require('../../models/User');

const orgSchema = z.object({
  name: z.string().trim().min(2),
  code: z.string().trim().min(3).max(40),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  maxMembers: z.number().int().nonnegative().optional(),
});

async function list(req, res, next) {
  try {
    const { q, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (q) {
      const re = new RegExp(q, 'i');
      filter.$or = [{ name: re }, { code: re }];
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [orgs, total] = await Promise.all([
      Organization.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Organization.countDocuments(filter),
    ]);

    // Member counts
    const counts = await User.aggregate([
      { $match: { organization: { $in: orgs.map((o) => o._id) } } },
      { $group: { _id: '$organization', count: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));

    const enriched = orgs.map((o) => ({ ...o.toObject(), memberCount: countMap[String(o._id)] || 0 }));
    res.json({ organizations: enriched, hasMore: skip + orgs.length < total, total });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const data = orgSchema.parse(req.body);
    data.code = data.code.toUpperCase();
    const exists = await Organization.findOne({ code: data.code });
    if (exists) return res.status(409).json({ message: 'קוד ארגון כבר קיים' });
    const org = await Organization.create(data);
    res.status(201).json({ organization: org });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const data = orgSchema.partial().parse(req.body);
    if (data.code) data.code = data.code.toUpperCase();

    const org = await Organization.findById(req.params.id);
    if (!org) return res.status(404).json({ message: 'ארגון לא נמצא' });

    if (data.code && data.code !== org.code) {
      const taken = await Organization.findOne({ code: data.code, _id: { $ne: org._id } });
      if (taken) return res.status(409).json({ message: 'קוד ארגון כבר קיים' });
    }

    Object.assign(org, data);
    await org.save();
    res.json({ organization: org });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const memberCount = await User.countDocuments({ organization: req.params.id });
    if (memberCount > 0) {
      return res.status(409).json({
        message: `לא ניתן למחוק — יש ${memberCount} חברים משויכים לארגון. ניתן לנטרל ארגון על ידי הסרת isActive.`,
      });
    }
    const org = await Organization.findByIdAndDelete(req.params.id);
    if (!org) return res.status(404).json({ message: 'ארגון לא נמצא' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, remove };
