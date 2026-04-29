const Post = require('../models/Post');
const Job = require('../models/Job');
const Benefit = require('../models/Benefit');

async function search(req, res, next) {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) return res.json({ posts: [], jobs: [], benefits: [] });

    const orgId = req.user.organization._id || req.user.organization;
    const regex = new RegExp(q, 'i');

    const [posts, jobs, benefits] = await Promise.all([
      Post.find({ organization: orgId, content: regex })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('author', 'profile.firstName profile.lastName'),
      Job.find({ organization: orgId, isActive: true, $or: [{ title: regex }, { company: regex }, { description: regex }] })
        .sort({ createdAt: -1 })
        .limit(5),
      Benefit.find({ organization: orgId, isActive: true, $or: [{ title: regex }, { businessName: regex }, { description: regex }] })
        .sort({ createdAt: -1 })
        .limit(5),
    ]);

    res.json({ posts, jobs, benefits });
  } catch (err) {
    next(err);
  }
}

module.exports = { search };
