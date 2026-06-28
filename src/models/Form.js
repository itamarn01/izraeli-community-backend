const mongoose = require('mongoose');

// A single fillable field inside a form template.
// `key` is a stable token (e.g. "field_1") referenced inside bodyHtml as {{field_1}}.
const formFieldSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true, trim: true },
    type: { type: String, enum: ['text', 'date', 'select'], default: 'text' },
    required: { type: Boolean, default: false },
    placeholder: { type: String, default: '' },
    options: [{ type: String }], // for type === 'select'
  },
  { _id: false }
);

const formSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },

    // Rich HTML written by the admin, RTL-friendly, with {{key}} placeholders.
    bodyHtml: { type: String, default: '' },

    fields: [formFieldSchema],
    // Counter so generated field keys are never reused within a form.
    fieldSeq: { type: Number, default: 0 },

    // Signature options
    requireUserSignature: { type: Boolean, default: false },
    signatureLabel: { type: String, default: 'חתימת הממלא/ת' },
    adminSignatureUrl: { type: String, default: '' }, // fixed org signature/stamp image
    adminSignatureLabel: { type: String, default: '' }, // name/title under the admin signature

    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

formSchema.index({ organization: 1, isPublished: 1, createdAt: -1 });

module.exports = mongoose.model('Form', formSchema);
