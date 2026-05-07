const mongoose = require('mongoose');

const deletedAccountSchema = new mongoose.Schema({
  email: { type: String, required: true },
  fullName: { type: String, default: '' },
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
  deletedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('DeletedAccount', deletedAccountSchema);
