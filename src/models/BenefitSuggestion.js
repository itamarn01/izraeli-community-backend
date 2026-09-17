const mongoose = require('mongoose');

// A suggestion holds the same fields a published Benefit does: the member fills
// the whole thing in, and approving it copies the fields across verbatim. The
// contact fields are extra — they are for the admin reviewing the suggestion
// and are never published.
const socialMediaSchema = new mongoose.Schema(
  {
    facebook: { type: String, default: '' },
    instagram: { type: String, default: '' },
    whatsapp: { type: String, default: '' },
    tiktok: { type: String, default: '' },
  },
  { _id: false }
);

const schema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // ── The benefit as it will be published ──────────────────────────────
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    category: { type: String, default: 'כללי' },
    businessName: { type: String, required: true, trim: true },
    website: { type: String, default: '' },
    socialMedia: { type: socialMediaSchema, default: () => ({}) },
    imageUrl: { type: String, default: '' },

    discountType: {
      type: String,
      enum: ['percentage', 'price_comparison', 'gift_with_purchase'],
      default: 'percentage',
    },
    discountPercent: { type: Number, default: null },
    originalPrice: { type: Number, default: null },
    discountedPrice: { type: Number, default: null },

    whatYouGet: { type: String, default: '' },
    howToRedeem: { type: String, default: '' },
    redemptionLink: { type: String, default: '' },
    redemptionCode: { type: String, default: '' },
    validUntil: { type: Date },
    gedud: { type: String, default: '' },

    // ── Review-only ──────────────────────────────────────────────────────
    contactName: { type: String, trim: true, default: '' },
    contactPhone: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    // The Benefit created on approval, so approving twice cannot publish twice
    // and so the admin can jump straight to the live entry.
    publishedBenefit: { type: mongoose.Schema.Types.ObjectId, ref: 'Benefit', default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The fields that are copied verbatim into a Benefit on approval.
schema.statics.PUBLISHED_FIELDS = [
  'title', 'description', 'category', 'businessName', 'website', 'socialMedia',
  'imageUrl', 'discountType', 'discountPercent', 'originalPrice', 'discountedPrice',
  'whatYouGet', 'howToRedeem', 'redemptionLink', 'redemptionCode', 'validUntil', 'gedud',
];

module.exports = mongoose.model('BenefitSuggestion', schema);
