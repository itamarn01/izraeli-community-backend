const Job = require('../../models/Job');
const User = require('../../models/User');
const { jobSchema } = require('../../validation/schemas');

async function findUserIdsByQuery(query) {
  if (!query) return null;
  const re = new RegExp(query, 'i');
  const users = await User.find({
    $or: [
      { email: re },
      { 'profile.firstName': re },
      { 'profile.lastName': re },
      { 'profile.phone': re },
    ],
  }).select('_id');
  return users.map((u) => u._id);
}

async function list(req, res, next) {
  try {
    const { q, type, organization, isHidden, isActive, userQuery, postedBy, page = 1, limit = 25 } = req.query;
    const filter = {};
    if (organization) filter.organization = organization;
    if (type && type !== 'all') filter.type = type;
    if (isHidden === 'true') filter.isHidden = true;
    if (isHidden === 'false') filter.isHidden = false;
    if (isActive === 'true') filter.isActive = true;
    if (isActive === 'false') filter.isActive = false;
    if (q) filter.$text = { $search: q };

    if (postedBy) filter.postedBy = postedBy;
    else if (userQuery) {
      const ids = await findUserIdsByQuery(userQuery);
      if (!ids?.length) return res.json({ jobs: [], hasMore: false, total: 0 });
      filter.postedBy = { $in: ids };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [jobs, total] = await Promise.all([
      Job.find(filter)
        .select('-applications')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('postedBy', 'email profile.firstName profile.lastName profile.phone')
        .populate('organization', 'name code'),
      Job.countDocuments(filter),
    ]);
    res.json({ jobs, hasMore: skip + jobs.length < total, total });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const data = jobSchema.partial().parse(req.body);
    const job = await Job.findByIdAndUpdate(req.params.id, data, { new: true });
    if (!job) return res.status(404).json({ message: 'משרה לא נמצאה' });
    res.json({ job });
  } catch (err) {
    next(err);
  }
}

async function toggleHide(req, res, next) {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: 'משרה לא נמצאה' });
    job.isHidden = !job.isHidden;
    await job.save();
    res.json({ job });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const job = await Job.findByIdAndDelete(req.params.id);
    if (!job) return res.status(404).json({ message: 'משרה לא נמצאה' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, update, toggleHide, remove };
