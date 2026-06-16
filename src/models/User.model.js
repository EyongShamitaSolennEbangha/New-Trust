const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema(
  {
    // ── Identity ────────────────────────────────────────────────────────────
    firstName: { type: String, required: true, trim: true, maxlength: 50 },
    lastName: { type: String, required: true, trim: true, maxlength: 50 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^\+?[1-9]\d{1,14}$/, 'Please enter a valid phone number'],
    },
    password: { type: String, required: true, minlength: 8, select: false },

    // ── Profile ─────────────────────────────────────────────────────────────
    avatar: { type: String, default: null },
    dateOfBirth: { type: Date },
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      zipCode: String,
    },
    nationality: { type: String },

    // ── Identity Verification ────────────────────────────────────────────────
    idDocument: {
      type: { type: String, enum: ['national_id', 'passport', 'drivers_license', 'voters_card'] },
      number: { type: String, select: false }, // encrypted
      frontPhoto: String,
      backPhoto: String,
      selfiePhoto: String,
      verifiedAt: Date,
      aiMatchScore: { type: Number, min: 0, max: 1 },
    },
    isIdentityVerified: { type: Boolean, default: false },

    // ── Trust Score ──────────────────────────────────────────────────────────
    trustScore: {
      score: { type: Number, default: 50, min: 0, max: 100 },
      level: {
        type: String,
        enum: ['unverified', 'bronze', 'silver', 'gold', 'platinum'],
        default: 'unverified',
      },
      lastCalculated: Date,
      history: [
        {
          score: Number,
          reason: String,
          changedAt: { type: Date, default: Date.now },
        },
      ],
    },

    // ── Role & Status ────────────────────────────────────────────────────────
    role: { type: String, enum: ['user', 'admin', 'moderator'], default: 'user' },
    accountStatus: {
      type: String,
      enum: ['active', 'suspended', 'banned', 'pending_verification'],
      default: 'pending_verification',
    },
    isEmailVerified: { type: Boolean, default: false },
    isPhoneVerified: { type: Boolean, default: false },

    // ── Security ─────────────────────────────────────────────────────────────
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String, select: false },
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    lastLogin: Date,
    lastLoginIP: String,

    // ── Behavior Patterns (for AI trust scoring) ─────────────────────────────
    behaviorMetrics: {
      avgResponseTimeHours: { type: Number, default: 0 },
      loginFrequencyPerWeek: { type: Number, default: 0 },
      disputesInitiated: { type: Number, default: 0 },
      disputesResolved: { type: Number, default: 0 },
      lastActivityAt: Date,
    },

    // ── Stats ────────────────────────────────────────────────────────────────
    stats: {
      totalAgreementsAsCreditor: { type: Number, default: 0 },
      totalAgreementsAsDebtor: { type: Number, default: 0 },
      completedAgreements: { type: Number, default: 0 },
      defaultedAgreements: { type: Number, default: 0 },
      totalAmountLent: { type: Number, default: 0 },
      totalAmountBorrowed: { type: Number, default: 0 },
      onTimePaymentRate: { type: Number, default: 0 },
    },

    // ── Password Reset ────────────────────────────────────────────────────────
    passwordResetToken: { type: String, select: false },
    passwordResetExpire: { type: Date, select: false },
    emailVerificationToken: { type: String, select: false },
    emailVerificationExpire: { type: Date, select: false },
    phoneOTP: { type: String, select: false },
    phoneOTPExpire: { type: Date, select: false },

    // ── Notifications Preferences ─────────────────────────────────────────────
    notificationPreferences: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      paymentReminders: { type: Boolean, default: true },
      agreementUpdates: { type: Boolean, default: true },
      trustScoreUpdates: { type: Boolean, default: true },
    },

    // ── Public Profile (for verify portal) ───────────────────────────────────
    isPubliclySearchable: { type: Boolean, default: false },
    isDefaulter: { type: Boolean, default: false },
    defaulterListedAt: { type: Date },
    defaulterRemovedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes ──────────────────────────────────────────────────────────────────
userSchema.index({ email: 1 });
userSchema.index({ phone: 1 });
userSchema.index({ isDefaulter: 1 });
userSchema.index({ 'trustScore.score': -1 });
userSchema.index({ 'trustScore.level': 1 });

// ── Virtual: full name ────────────────────────────────────────────────────────
userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// ── Virtual: is account locked ────────────────────────────────────────────────
userSchema.virtual('isLocked').get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// ── Pre-save: hash password ───────────────────────────────────────────────────
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ── Method: compare password ──────────────────────────────────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// ── Method: generate password reset token ────────────────────────────────────
userSchema.methods.getPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  this.passwordResetExpire = Date.now() + 30 * 60 * 1000; // 30 minutes
  return resetToken;
};

// ── Method: generate email verification token ─────────────────────────────────
userSchema.methods.getEmailVerificationToken = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.emailVerificationToken = crypto.createHash('sha256').update(token).digest('hex');
  this.emailVerificationExpire = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  return token;
};

// ── Method: increment login attempts / lock ───────────────────────────────────
userSchema.methods.incrementLoginAttempts = async function () {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({ $set: { loginAttempts: 1 }, $unset: { lockUntil: 1 } });
  }
  const updates = { $inc: { loginAttempts: 1 } };
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hr lock
  }
  return this.updateOne(updates);
};

// ── Method: trust level from score ───────────────────────────────────────────
userSchema.methods.calculateTrustLevel = function () {
  const score = this.trustScore.score;
  if (score < 300) return 'unverified';
  if (score < 500) return 'bronze';
  if (score < 700) return 'silver';
  if (score < 900) return 'gold';
  return 'platinum';
};

module.exports = mongoose.model('User', userSchema);
