const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    text: { type: String, required: true, trim: true },
    isAdminComment: { type: Boolean, default: false },
    adminDisplayName: { type: String, default: '' },
    adminAvatarUrl: { type: String, default: '' },
  },
  { timestamps: true }
);

const postSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    content: { type: String, required: true, trim: true },
    imageUrl: { type: String, default: '' },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    comments: { type: [commentSchema], default: [] },
    isHidden: { type: Boolean, default: false },
    isAdminPost: { type: Boolean, default: false },
    adminDisplayName: { type: String, default: '' },
    adminAvatarUrl: { type: String, default: '' },
  },
  { timestamps: true }
);

// Feed query: filter by organization + visibility, sorted newest-first.
postSchema.index({ organization: 1, isHidden: 1, createdAt: -1 });

module.exports = mongoose.model('Post', postSchema);
