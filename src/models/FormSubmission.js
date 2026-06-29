const mongoose = require('mongoose');

const formSubmissionSchema = new mongoose.Schema({
  form: { type: mongoose.Schema.Types.ObjectId, ref: 'Form', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  values: { type: Map, of: String, default: () => new Map() },
}, { timestamps: true });

module.exports = mongoose.model('FormSubmission', formSubmissionSchema);
