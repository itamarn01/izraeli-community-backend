const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    maxMembers: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Organization', organizationSchema);
