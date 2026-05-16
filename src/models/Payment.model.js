const mongoose = require('mongoose');
const crypto = require('crypto');

const paymentSchema = new mongoose.Schema(
  {
    // ── Reference ─────────────────────────────────────────────────────────────
    paymentReference: {
      type: String,
      unique: true,
      default: () => `PAY-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    },
    agreement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agreement',
      required: true,
    },

    // ── Parties (debtor pays creditor) ────────────────────────────────────────
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // debtor
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // creditor

    // ── Amount ────────────────────────────────────────────────────────────────
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, default: 'NGN', uppercase: true },
    exchangeRate: { type: Number, default: 1 }, // for multi-currency
    amountInBaseCurrency: Number,

    // ── Payment Method ────────────────────────────────────────────────────────
    paymentMethod: {
      type: String,
      enum: ['cash', 'bank_transfer', 'card', 'mobile_money', 'crypto', 'other'],
      required: true,
    },
    paymentMethodDetails: {
      bankName: String,
      accountLast4: String,
      transactionId: String, // from bank/payment gateway
      receiptUrl: String,
    },

    // ── Status ────────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'disputed', 'reversed', 'failed'],
      default: 'pending',
    },
    confirmedAt: Date,
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // creditor confirms

    // ── Installment Reference ─────────────────────────────────────────────────
    installmentNumber: Number,

    // ── Receipt ───────────────────────────────────────────────────────────────
    receiptPhoto: String, // uploaded photo of receipt
    notes: { type: String, maxlength: 500 },

    // ── Cryptographic Proof ───────────────────────────────────────────────────
    paymentHash: String, // SHA-256 hash of payment record
    digitalSignature: String,

    // ── Metadata ─────────────────────────────────────────────────────────────
    ipAddress: String,
    isOnTime: Boolean,
    daysLate: { type: Number, default: 0 },

    // ── Stripe / Gateway ──────────────────────────────────────────────────────
    stripePaymentIntentId: String,
    stripeChargeId: String,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
paymentSchema.index({ agreement: 1 });
paymentSchema.index({ paidBy: 1 });
paymentSchema.index({ receivedBy: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ createdAt: -1 });

// ── Pre-save: generate payment hash ──────────────────────────────────────────
paymentSchema.pre('save', function (next) {
  if (this.isNew) {
    const content = JSON.stringify({
      paymentReference: this.paymentReference,
      agreement: this.agreement,
      paidBy: this.paidBy,
      amount: this.amount,
      currency: this.currency,
      createdAt: new Date().toISOString(),
    });
    this.paymentHash = crypto.createHash('sha256').update(content).digest('hex');
  }
  next();
});

module.exports = mongoose.model('Payment', paymentSchema);
