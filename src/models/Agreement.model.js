const mongoose = require('mongoose');
const crypto = require('crypto');

const agreementSchema = new mongoose.Schema(
  {
    // ── Identification ────────────────────────────────────────────────────────
    agreementId: {
      type: String,
      unique: true,
      default: () => `TL-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
    },

    // ── Parties ───────────────────────────────────────────────────────────────
    creditor: {
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      name: String, // snapshot at time of creation
      email: String,
      phone: String,
      signedAt: Date,
      signature: String, // base64 digital signature
      ipAddress: String,
      deviceInfo: String,
    },
    debtor: {
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      name: String,
      email: String,
      phone: String,
      signedAt: Date,
      signature: String,
      ipAddress: String,
      deviceInfo: String,
    },

    // ── Financial Terms ───────────────────────────────────────────────────────
    principalAmount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'NGN', uppercase: true, maxlength: 3 },
    interestRate: { type: Number, default: 0, min: 0 }, // percentage
    interestType: { type: String, enum: ['none', 'simple', 'compound'], default: 'none' },
    totalAmountDue: { type: Number, required: true },
    remainingBalance: { type: Number },
    purpose: { type: String, required: true, maxlength: 500 },
    notes: { type: String, maxlength: 1000 },

    // ── Payment Schedule ──────────────────────────────────────────────────────
    repaymentType: {
      type: String,
      enum: ['lump_sum', 'installments', 'flexible'],
      default: 'lump_sum',
    },
    dueDate: { type: Date, required: true },
    installments: [
      {
        installmentNumber: Number,
        amountDue: Number,
        dueDate: Date,
        paidAmount: { type: Number, default: 0 },
        paidAt: Date,
        status: {
          type: String,
          enum: ['pending', 'partial', 'paid', 'overdue', 'waived'],
          default: 'pending',
        },
      },
    ],

    // ── Status & Lifecycle ────────────────────────────────────────────────────
    status: {
      type: String,
      enum: [
        'draft',
        'pending_debtor_verification',
        'pending_signatures',
        'active',
        'completed',
        'defaulted',
        'disputed',
        'cancelled',
        'expired',
      ],
      default: 'draft',
    },
    statusHistory: [
      {
        status: String,
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        reason: String,
        changedAt: { type: Date, default: Date.now },
      },
    ],

    // ── Verification Mode ─────────────────────────────────────────────────────
    verificationMode: {
      type: String,
      enum: ['in_person', 'remote'],
      required: true,
    },

    // ── In-Person Verification ────────────────────────────────────────────────
    inPersonVerification: {
      otpCode: { type: String, select: false },
      otpExpiry: Date,
      otpUsed: { type: Boolean, default: false },
      meetingLocation: String,
      verifiedAt: Date,
    },

    // ── Remote Verification ───────────────────────────────────────────────────
    remoteVerification: {
      verificationToken: { type: String, select: false },
      verificationLink: String,
      linkExpiry: Date,
      linkUsed: { type: Boolean, default: false },
      debtorIdPhoto: String,
      debtorSelfie: String,
      faceMatchScore: { type: Number, min: 0, max: 1 },
      faceMatchPassed: Boolean,
      verifiedAt: Date,
    },

    // ── Cryptographic Integrity ───────────────────────────────────────────────
    documentHash: String, // SHA-256 hash of agreement content
    hashAlgorithm: { type: String, default: 'SHA-256' },
    isHashVerified: { type: Boolean, default: false },
    blockchainTxHash: String, // future blockchain anchoring
    blockchainNetwork: String,

    // ── Timestamps ────────────────────────────────────────────────────────────
    activatedAt: Date,
    completedAt: Date,
    defaultedAt: Date,
    lastPaymentAt: Date,

    // ── Witnesses (optional) ───────────────────────────────────────────────────
    witnesses: [
      {
        name: String,
        phone: String,
        email: String,
        signature: String,
        signedAt: Date,
      },
    ],

    // ── Dispute Reference ─────────────────────────────────────────────────────
    disputes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Dispute' }],

    // ── Metadata ──────────────────────────────────────────────────────────────
    createdByIP: String,
    isPubliclyVisible: { type: Boolean, default: false }, // for defaulter portal
    tags: [String],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
agreementSchema.index({ agreementId: 1 });
agreementSchema.index({ 'creditor.user': 1 });
agreementSchema.index({ 'debtor.user': 1 });
agreementSchema.index({ status: 1 });
agreementSchema.index({ dueDate: 1 });
agreementSchema.index({ 'remoteVerification.verificationToken': 1 });

// ── Pre-save: set remainingBalance ────────────────────────────────────────────
agreementSchema.pre('save', function (next) {
  if (this.isNew) {
    this.remainingBalance = this.totalAmountDue;
  }
  next();
});

// ── Virtual: isOverdue ────────────────────────────────────────────────────────
agreementSchema.virtual('isOverdue').get(function () {
  return this.status === 'active' && this.dueDate < new Date();
});

// ── Virtual: paymentProgress (%) ─────────────────────────────────────────────
agreementSchema.virtual('paymentProgress').get(function () {
  if (!this.totalAmountDue) return 0;
  const paid = this.totalAmountDue - (this.remainingBalance || 0);
  return Math.round((paid / this.totalAmountDue) * 100);
});

// ── Method: generate document hash ───────────────────────────────────────────
agreementSchema.methods.generateDocumentHash = function () {
  const content = JSON.stringify({
    agreementId: this.agreementId,
    creditorId: this.creditor.user,
    debtorId: this.debtor.user,
    principalAmount: this.principalAmount,
    currency: this.currency,
    dueDate: this.dueDate,
    purpose: this.purpose,
    createdAt: this.createdAt,
  });
  return crypto.createHash('sha256').update(content).digest('hex');
};

module.exports = mongoose.model('Agreement', agreementSchema);
