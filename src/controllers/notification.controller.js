const Notification = require('../models/Notification');

async function list(req, res, next) {
  try {
    const orgId = req.user.organization._id || req.user.organization;
    const notifications = await Notification.find({ organization: orgId })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('actor', 'profile.firstName profile.lastName');
    const unreadCount = notifications.filter(
      (n) => !n.readBy.some((id) => id.equals(req.user._id))
    ).length;
    res.json({ notifications, unreadCount });
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
