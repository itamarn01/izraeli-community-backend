const Notification = require('../models/Notification');
const Post = require('../models/Post');
const Job = require('../models/Job');
const Benefit = require('../models/Benefit');

async function list(req, res, next) {
  try {
    const orgId = req.user.organization._id || req.user.organization;
    const notifications = await Notification.find({ organization: orgId })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('actor', 'profile.firstName profile.lastName');

    // Gather resourceIds by type to check visibility
    const ids = { post: [], job: [], benefit: [] };
    for (const n of notifications) {
      if (n.resourceId && ids[n.type]) ids[n.type].push(n.resourceId);
    }

    const [visiblePosts, visibleJobs, visibleBenefits] = await Promise.all([
      ids.post.length
        ? Post.find({ _id: { $in: ids.post }, isHidden: { $ne: true } }).select('_id').lean()
        : [],
      ids.job.length
        ? Job.find({ _id: { $in: ids.job }, isHidden: { $ne: true }, isActive: { $ne: false } }).select('_id').lean()
        : [],
      ids.benefit.length
        ? Benefit.find({ _id: { $in: ids.benefit }, isHidden: { $ne: true }, isActive: { $ne: false } }).select('_id').lean()
        : [],
    ]);

    const visible = new Set([
      ...visiblePosts.map((d) => String(d._id)),
      ...visibleJobs.map((d) => String(d._id)),
      ...visibleBenefits.map((d) => String(d._id)),
    ]);

    const filtered = notifications.filter(
      (n) => !n.resourceId || visible.has(String(n.resourceId))
    );

    const unreadCount = filtered.filter(
      (n) => !n.readBy.some((id) => id.equals(req.user._id))
    ).length;

    res.json({ notifications: filtered, unreadCount });
  } catch (err) {
    next(err);
  }
}

async function markRead(req, res, next) {
  try {
    const orgId = req.user.organization._id || req.user.organization;
    const notif = await Notification.findOne({ _id: req.params.id, organization: orgId });
    if (!notif) return res.status(404).json({ message: 'לא נמצא' });
    if (!notif.readBy.some((id) => id.equals(req.user._id))) {
      notif.readBy.push(req.user._id);
      await notif.save();
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function markAllRead(req, res, next) {
  try {
    const orgId = req.user.organization._id || req.user.organization;
    await Notification.updateMany(
      { organization: orgId, readBy: { $ne: req.user._id } },
      { $addToSet: { readBy: req.user._id } }
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function clearAll(req, res, next) {
  try {
    const orgId = req.user.organization._id || req.user.organization;
    await Notification.deleteMany({ organization: orgId });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, markRead, markAllRead, clearAll };
