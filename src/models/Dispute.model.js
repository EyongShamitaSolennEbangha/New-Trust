const mongoose = require('mongoose');

const disputeSchema = new mongoose.Schema(
  {
    disputeId: {
      type: String,
      unique: true,
      default: () => `DSP-${Date.now()}`,
    },
    agreement: { type: mongoose.Schema.Types.ObjectId, ref: 'Agreement', required: true },
    initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    respondent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    reason: {
      type: String,
      enum: [
        'payment_not_received',
        'payment_amount_incorrect',
        'agreement_terms_violated',
        'fraud',
        'identity_issue',
        'other',
      ],
      required: true,
    },
    description: { type: String, required: true, maxlength: 2000 },
    evidence: [{ url: String, type: String, uploadedAt: Date }],

    status: {
      type: String,
      enum: ['open', 'under_review', 'resolved_creditor', 'resolved_debtor', 'withdrawn'],
      default: 'open',
    },

    assignedModerator: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolution: { type: String, maxlength: 2000 },
    resolvedAt: Date,
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    messages: [
      {
        sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        message: String,
        attachments: [String],
        sentAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

disputeSchema.index({ agreement: 1 });
disputeSchema.index({ initiatedBy: 1 });
disputeSchema.index({ status: 1 });

module.exports = mongoose.model('Dispute', disputeSchema);
