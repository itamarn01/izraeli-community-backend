const Post = require('../models/Post');
const User = require('../models/User');
const { postSchema, commentSchema } = require('../validation/schemas');
const { sendCommentNotificationEmail } = require('../services/email');
const { createNotification } = require('../services/notifications');

async function list(req, res, next) {
  try {
    const orgId = req.user.organization._id || req.user.organization;
    const { page = 1, limit = 10 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const filter = { organization: orgId, isHidden: { $ne: true } };
    const [posts, total] = await Promise.all([
      Post.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('author', 'profile.firstName profile.lastName avatarUrl')
        .populate('comments.user', 'profile.firstName profile.lastName avatarUrl'),
      Post.countDocuments(filter),
    ]);
    res.json({ posts, hasMore: skip + posts.length < total, total });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const data = postSchema.parse(req.body);
    const orgId = req.user.organization._id || req.user.organization;
    const post = await Post.create({ ...data, author: req.user._id, organization: orgId });
    const populated = await post.populate('author', 'profile.firstName profile.lastName avatarUrl');

    const authorName = [req.user.profile?.firstName, req.user.profile?.lastName].filter(Boolean).join(' ') || 'חבר קהילה';
    await createNotification({
      organization: orgId,
      type: 'post',
      title: `פוסט חדש מאת ${authorName}`,
      body: data.content.slice(0, 100),
      actor: req.user._id,
      resourceId: post._id,
    });

    res.status(201).json({ post: populated });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'פוסט לא נמצא' });
    if (post.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'אין הרשאה למחוק פוסט זה' });
    }
    await post.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function toggleLike(req, res, next) {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'פוסט לא נמצא' });
    const idx = post.likes.findIndex((id) => id.toString() === req.user._id.toString());
    if (idx >= 0) post.likes.splice(idx, 1);
    else post.likes.push(req.user._id);
    await post.save();
    res.json({ likes: post.likes.length, liked: idx < 0 });
  } catch (err) {
    next(err);
  }
}

async function comment(req, res, next) {
  try {
    const { text } = commentSchema.parse(req.body);
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'פוסט לא נמצא' });
    post.comments.push({ user: req.user._id, text });
    await post.save();
    const populated = await post.populate('comments.user', 'profile.firstName profile.lastName avatarUrl');
    res.status(201).json({ comments: populated.comments });

    // Notify post author by email (skip if commenter is the author)
    const authorId = post.author;
    if (authorId && String(authorId) !== String(req.user._id)) {
      User.findById(authorId).select('email profile.firstName profile.lastName').lean()
        .then((author) => {
          if (!author?.email) return;
          const commenterName = [req.user.profile?.firstName, req.user.profile?.lastName].filter(Boolean).join(' ') || 'חבר קהילה';
          const authorName = [author.profile?.firstName, author.profile?.lastName].filter(Boolean).join(' ') || '';
          const appUrl = (process.env.CLIENT_ORIGIN || '').split(',')[0].trim();
          return sendCommentNotificationEmail({
            to: author.email,
            authorName,
            commenterName,
            postContent: (post.content || '').slice(0, 100),
            commentText: text,
            postUrl: appUrl ? `${appUrl}/app/feed` : '',
          });
        })
        .catch((err) => console.error('[comment] email failed:', err.message));
    }
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, remove, toggleLike, comment };
