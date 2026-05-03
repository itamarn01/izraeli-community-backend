const User = require('../../models/User');
const Post = require('../../models/Post');
const Job = require('../../models/Job');
const Benefit = require('../../models/Benefit');
const Organization = require('../../models/Organization');

async function dashboard(req, res, next) {
  try {
    const [users, verifiedUsers, posts, jobs, benefits, orgs] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isEmailVerified: true }),
      Post.countDocuments(),
      Job.countDocuments(),
      Benefit.countDocuments(),
      Organization.countDocuments(),
    ]);

    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('organization', 'name')
      .select('email profile.firstName profile.lastName createdAt isEmailVerified organization');

    res.json({
      stats: {
        users,
        verifiedUsers,
        posts,
        jobs,
        benefits,
        organizations: orgs,
      },
      recentUsers,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { dashboard };
