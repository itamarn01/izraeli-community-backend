const Post = require('../../models/Post');
const User = require('../../models/User');

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
    const { q, organization, isHidden, userQuery, author, page = 1, limit = 25 } = req.query;
    const filter = {};
    if (organization) filter.organization = organization;
    if (isHidden === 'true') filter.isHidden = true;
    if (isHidden === 'false') filter.isHidden = false;
    if (q) filter.content = { $regex: q, $options: 'i' };

    if (author) filter.author = author;
    else if (userQuery) {
      const ids = await findUserIdsByQuery(userQuery);
      if (!ids?.length) return res.json({ posts: [], hasMore: false, total: 0 });
      filter.author = { $in: ids };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [posts, total] = await Promise.all([
      Post.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('author', 'email profile.firstName profile.lastName profile.phone avatarUrl')
        .populate('comments.user', 'email profile.firstName profile.lastName avatarUrl')
        .populate('organization', 'name code'),
      Post.countDocuments(filter),
    ]);
    res.json({ posts, hasMore: skip + posts.length < total, total });
  } catch (err) {
    next(err);
  }
}

async function toggleHide(req, res, next) {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'פוסט לא נמצא' });
    post.isHidden = !post.isHidden;
    await post.save();
    res.json({ post });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const post = await Post.findByIdAndDelete(req.params.id);
    if (!post) return res.status(404).json({ message: 'פוסט לא נמצא' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function deleteComment(req, res, next) {
  try {
    const { id, commentId } = req.params;
    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ message: 'פוסט לא נמצא' });
    const before = post.comments.length;
    post.comments = post.comments.filter((c) => c._id.toString() !== commentId);
    if (post.comments.length === before) return res.status(404).json({ message: 'תגובה לא נמצאה' });
    await post.save();
    const populated = await post.populate('comments.user', 'email profile.firstName profile.lastName avatarUrl');
    res.json({ post: populated });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, toggleHide, remove, deleteComment };
