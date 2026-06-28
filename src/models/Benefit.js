const mongoose = require('mongoose');

const socialMediaSchema = new mongoose.Schema(
  {
    facebook: { type: String, default: '' },
    instagram: { type: String, default: '' },
    whatsapp: { type: String, default: '' },
    tiktok: { type: String, default: '' },
  },
  { _id: false }
);

const benefitSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    category: { type: String, default: 'כללי' },
    businessName: { type: String, trim: true, default: '' },
    website: { type: String, default: '' },
    socialMedia: { type: socialMediaSchema, default: () => ({}) },
    imageUrl: { type: String, default: '' },

    // Discount — either percentage or price comparison
    discountType: { type: String, enum: ['percentage', 'price_comparison'], default: 'percentage' },
    discountPercent: { type: Number, default: null },
    originalPrice: { type: Number, default: null },
    discountedPrice: { type: Number, default: null },

    whatYouGet: { type: String, default: '' },
    howToRedeem: { type: String, default: '' },
    redemptionLink: { type: String, default: '' },
    redemptionCode: { type: String, default: '' },
    validUntil: { type: Date },

    gedud: { type: String, default: '' },

    // Coupon system
    couponEnabled: { type: Boolean, default: false },
    coupons: [
      {
        code: { type: String, required: true, trim: true },
        qrCode: { type: String, default: '' },
        claimedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        claimedAt: { type: Date, default: null },
        _id: false,
      },
    ],

    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    isActive: { type: Boolean, default: true },
    isHidden: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Listing query: organization + active/visible benefits, sorted newest-first.
benefitSchema.index({ organization: 1, isActive: 1, isHidden: 1, createdAt: -1 });

module.exports = mongoose.model('Benefit', benefitSchema);
