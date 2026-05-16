const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: [
        'payment_received',
        'payment_confirmed',
        'payment_overdue',
        'payment_reminder',
        'agreement_created',
        'agreement_signed',
        'agreement_activated',
        'agreement_completed',
        'agreement_defaulted',
        'agreement_disputed',
        'verification_required',
        'verification_complete',
        'trust_score_updated',
        'account_warning',
        'defaulter_listed',
        'otp_generated',
        'system',
      ],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    data: { type: mongoose.Schema.Types.Mixed }, // extra context (agreementId etc.)
    isRead: { type: Boolean, default: false },
    readAt: Date,
    channels: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: false },
      sms: { type: Boolean, default: false },
      emailSentAt: Date,
      smsSentAt: Date,
    },
    priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, isRead: 1 });
notificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
