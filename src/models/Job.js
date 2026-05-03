const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isAnonymous: { type: Boolean, default: false },
    message: { type: String, default: '' },
    cvUrl: { type: String, default: '' },
    status: {
      type: String,
      enum: ['pending', 'reviewed', 'accepted', 'rejected'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

const jobSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    company: { type: String, required: true, trim: true },
    location: { type: String, trim: true },
    type: {
      type: String,
      enum: ['full_time', 'part_time', 'freelance', 'internship', 'temporary'],
      default: 'full_time',
    },
    category: { type: String, default: 'general' },
    description: { type: String, required: true },
    requirements: { type: [String], default: [] },
    salaryRange: { type: String, default: '' },
    contactEmail: { type: String, default: '' },
    website: { type: String, default: '' },
    socialMedia: {
      type: new mongoose.Schema(
        { facebook: String, instagram: String, whatsapp: String, tiktok: String },
        { _id: false }
      ),
      default: () => ({}),
    },
    imageUrl: { type: String, default: '' },
    postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    isActive: { type: Boolean, default: true },
    isHidden: { type: Boolean, default: false },
    applications: { type: [applicationSchema], default: [] },
  },
  { timestamps: true }
);

jobSchema.index({ title: 'text', description: 'text', company: 'text' });

module.exports = mongoose.model('Job', jobSchema);
