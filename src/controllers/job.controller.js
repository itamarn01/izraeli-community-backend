const Job = require('../models/Job');
const { jobSchema } = require('../validation/schemas');
const { createNotification } = require('../services/notifications');

async function list(req, res, next) {
  try {
    const { type, category, q } = req.query;
    const filter = { organization: req.user.organization._id || req.user.organization, isActive: true };
    if (type && type !== 'all') filter.type = type;
    if (category && category !== 'all') filter.category = category;
    if (q) filter.$text = { $search: q };

    const jobs = await Job.find(filter)
      .select('-applications')
      .sort({ createdAt: -1 })
      .populate('postedBy', 'profile.firstName profile.lastName email');

    res.json({ jobs });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const job = await Job.findById(req.params.id).populate('postedBy', 'profile.firstName profile.lastName email');
    if (!job) return res.status(404).json({ message: 'משרה לא נמצאה' });

    const isOwner = job.postedBy._id.toString() === req.user._id.toString();
    const obj = job.toObject();
    if (!isOwner && req.user.role !== 'admin') delete obj.applications;
    res.json({ job: obj });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const data = jobSchema.parse(req.body);
    const orgId = req.user.organization._id || req.user.organization;
    const job = await Job.create({ ...data, postedBy: req.user._id, organization: orgId });

    await createNotification({
      organization: orgId,
      type: 'job',
      title: `משרה חדשה: ${data.title}`,
      body: `${data.company}${data.location ? ` · ${data.location}` : ''}`,
      actor: req.user._id,
      resourceId: job._id,
    });

    res.status(201).json({ job });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: 'משרה לא נמצאה' });
    if (job.postedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'אין הרשאה לעדכן משרה זו' });
    }
    const data = jobSchema.partial().parse(req.body);
    Object.assign(job, data);
    await job.save();
    res.json({ job });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: 'משרה לא נמצאה' });
    if (job.postedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'אין הרשאה למחוק משרה זו' });
    }
    await job.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function apply(req, res, next) {
  try {
    const { isAnonymous = false, message = '' } = req.body;
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: 'משרה לא נמצאה' });

    const already = job.applications.find((a) => a.user.toString() === req.user._id.toString());
    if (already) return res.status(409).json({ message: 'כבר הגשת מועמדות למשרה זו' });

    job.applications.push({
      user: req.user._id,
      isAnonymous: !!isAnonymous,
      message,
      cvUrl: req.user.cvUrl || '',
    });
    await job.save();
    res.status(201).json({ ok: true, applicationsCount: job.applications.length });
  } catch (err) {
    next(err);
  }
}

async function listApplications(req, res, next) {
  try {
    const job = await Job.findById(req.params.id).populate({
      path: 'applications.user',
      select: 'email profile cvUrl',
    });
    if (!job) return res.status(404).json({ message: 'משרה לא נמצאה' });
    if (job.postedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'אין הרשאה לצפות במועמדויות' });
    }

    const sanitized = job.applications.map((app) => {
      const a = app.toObject();
      if (a.isAnonymous) {
        a.user = {
          _id: 'anonymous',
          email: null,
          profile: { firstName: 'מועמד', lastName: 'אנונימי' },
          cvUrl: a.cvUrl || null,
        };
      }
      return a;
    });

    res.json({ applications: sanitized });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getOne, create, update, remove, apply, listApplications };
