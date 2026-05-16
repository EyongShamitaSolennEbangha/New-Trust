const mongoose = require('mongoose');
const crypto = require('crypto');

const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    targetModel: { type: String, enum: ['User', 'Agreement', 'Payment', 'Dispute'] },
    targetId: mongoose.Schema.Types.ObjectId,
    details: mongoose.Schema.Types.Mixed,
    ipAddress: String,
    userAgent: String,
    // Tamper detection: chain each log entry
    previousHash: String,
    currentHash: String,
  },
  { timestamps: true }
);

// Pre-save: generate immutable hash chain
auditLogSchema.pre('save', async function (next) {
  const content = JSON.stringify({
    action: this.action,
    performedBy: this.performedBy,
    targetId: this.targetId,
    details: this.details,
    createdAt: new Date().toISOString(),
    previousHash: this.previousHash || '0',
  });
  this.currentHash = crypto.createHash('sha256').update(content).digest('hex');
  next();
});

auditLogSchema.index({ performedBy: 1 });
auditLogSchema.index({ targetModel: 1, targetId: 1 });
auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
