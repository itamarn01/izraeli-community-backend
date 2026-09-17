const mongoose = require('mongoose');

// Which people a broadcast went to. Stored as the descriptor rather than a
// frozen recipient list, so history stays readable ("גדוד אבישי", "נרשמי הסיור
// ב-16:30") without keeping hundreds of email addresses per send.
const audienceSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['users', 'event'], required: true },
    // For type 'users' — the admin list filters that were active.
    filters: { type: mongoose.Schema.Types.Mixed, default: {} },
    // For type 'event'.
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
    segment: {
      type: String,
      enum: ['registered', 'tour', 'slot', 'not_registered', 'declined', 'cancelled'],
    },
    tourId: { type: mongoose.Schema.Types.ObjectId },
    slotId: { type: mongoose.Schema.Types.ObjectId },
    // Human-readable summary rendered in the history list.
    label: { type: String, default: '' },
  },
  { _id: false }
);

const failureSchema = new mongoose.Schema(
  { email: String, name: String, error: String },
  { _id: false }
);

const broadcastSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, trim: true },
    // The admin's rich text, before personalization and before the shell.
    bodyHtml: { type: String, default: '' },

    audience: { type: audienceSchema, required: true },

    provider: { type: String, default: 'flashy' },

    status: {
      type: String,
      enum: ['queued', 'sending', 'completed', 'completed_with_errors', 'failed', 'cancelled'],
      default: 'queued',
      index: true,
    },

    total: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    // Capped so one bad run cannot bloat the document past Mongo's 16MB limit.
    failures: { type: [failureSchema], default: [] },
    error: { type: String, default: '' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    adminName: { type: String, default: '' },

    startedAt: { type: Date },
    finishedAt: { type: Date },
  },
  { timestamps: true }
);

broadcastSchema.index({ createdAt: -1 });
broadcastSchema.index({ 'audience.event': 1, createdAt: -1 });

module.exports = mongoose.model('Broadcast', broadcastSchema);
