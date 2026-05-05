const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const childSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    dateOfBirth: { type: Date, required: true },
  },
  { _id: true }
);

const profileSchema = new mongoose.Schema(
  {
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    phone: { type: String, trim: true },
    address: {
      city: { type: String, trim: true },
      street: { type: String, trim: true },
    },
    dateOfBirth: { type: Date },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    maritalStatus: {
      type: String,
      enum: ['single', 'married', 'common_law', 'in_relationship', 'divorced', 'other'],
    },
    employmentStatus: {
      type: String,
      enum: ['employee', 'self_employed', 'combined', 'not_working', 'student'],
    },
    studentLevel: {
      type: String,
      enum: ['bachelors', 'masters', 'doctorate', 'other'],
    },
    gedud: {
      type: String,
      enum: ['משמר העמקים', 'אבישי', 'הכרמל', 'אבשלום', 'חרב שאול'],
    },
    children: { type: [childSchema], default: [] },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 8, select: false },

    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    role: { type: String, enum: ['member', 'admin'], default: 'member' },

    isEmailVerified: { type: Boolean, default: false },
    emailOtp: { type: String, select: false },
    emailOtpExpires: { type: Date, select: false },

    // Forgot-password
    resetPasswordOtp: { type: String, select: false },
    resetPasswordOtpExpires: { type: Date, select: false },

    // Pending email change (verified by OTP sent to new address)
    pendingEmail: { type: String, select: false },
    pendingEmailOtp: { type: String, select: false },
    pendingEmailOtpExpires: { type: Date, select: false },

    isProfileComplete: { type: Boolean, default: false },
    profile: { type: profileSchema, default: () => ({}) },

    avatarUrl: { type: String, default: '' },
    cvUrl: { type: String, default: '' },
  },
  { timestamps: true }
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.methods.toSafeJSON = function () {
  const obj = this.toObject({ versionKey: false });
  delete obj.password;
  delete obj.emailOtp;
  delete obj.emailOtpExpires;
  delete obj.resetPasswordOtp;
  delete obj.resetPasswordOtpExpires;
  delete obj.pendingEmail;
  delete obj.pendingEmailOtp;
  delete obj.pendingEmailOtpExpires;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
