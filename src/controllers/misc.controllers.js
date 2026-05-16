// ════════════════════════════════════════════════════════════
// trustScore.controller.js
// ════════════════════════════════════════════════════════════
const User = require('../models/User.model');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { sendSuccess } = require('../utils/response.utils');
const trustScoreService = require('../services/trustScore.service');
const notificationService = require('../services/notification.service');

exports.getMyTrustScore = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).select('trustScore isIdentityVerified stats');
  const breakdown = await trustScoreService.calculateTrustScore(req.user._id);
  sendSuccess(res, { data: { ...user.toObject(), breakdown } });
});

exports.getTrustScoreBreakdown = catchAsync(async (req, res) => {
  const breakdown = await trustScoreService.calculateTrustScore(req.user._id);
  sendSuccess(res, { data: breakdown });
});

exports.getUserTrustScore = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id).select('firstName lastName trustScore isIdentityVerified');
  if (!user) return next(new AppError('User not found.', 404));
  sendSuccess(res, { data: user });
});

exports.recalculateTrustScore = catchAsync(async (req, res) => {
  const io = req.app.get('io');
  const result = await trustScoreService.updateUserTrustScore(req.user._id, 'Manual recalculation');
  notificationService.emitTrustScoreUpdate(io, req.user._id, result);
  sendSuccess(res, { message: 'Trust score recalculated.', data: result });
});

exports.getTrustScoreHistory = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).select('trustScore.history trustScore.score trustScore.level');
  sendSuccess(res, { data: user.trustScore });
});


// ════════════════════════════════════════════════════════════
// notification.controller.js
// ════════════════════════════════════════════════════════════
const Notification = require('../models/Notification.model');
const { sendPaginated } = require('../utils/response.utils');

exports.getMyNotifications = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, unreadOnly } = req.query;
  const skip = (page - 1) * limit;
  const filter = { recipient: req.user._id };
  if (unreadOnly === 'true') filter.isRead = false;

  const [notifications, total] = await Promise.all([
    Notification.find(filter).skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 }),
    Notification.countDocuments(filter),
  ]);

  sendPaginated(res, { data: notifications, total, page, limit });
});

exports.markNotificationsRead = catchAsync(async (req, res) => {
  const { ids } = req.body; // optional array of specific IDs
  await notificationService.markAsRead(req.user._id, ids);
  sendSuccess(res, { message: 'Notifications marked as read.' });
});

exports.getUnreadCount = catchAsync(async (req, res) => {
  const count = await notificationService.getUnreadCount(req.user._id);
  sendSuccess(res, { data: { count } });
});

exports.deleteNotification = catchAsync(async (req, res, next) => {
  const notification = await Notification.findOneAndDelete({
    _id: req.params.id,
    recipient: req.user._id,
  });
  if (!notification) return next(new AppError('Notification not found.', 404));
  sendSuccess(res, { message: 'Notification deleted.' });
});


// ════════════════════════════════════════════════════════════
// dispute.controller.js
// ════════════════════════════════════════════════════════════
const Dispute = require('../models/Dispute.model');
const Agreement = require('../models/Agreement.model');
const cloudinaryService = require('../services/cloudinary.service');

exports.createDispute = catchAsync(async (req, res, next) => {
  const { agreementId, reason, description } = req.body;

  const agreement = await Agreement.findById(agreementId);
  if (!agreement) return next(new AppError('Agreement not found.', 404));

  const isParty =
    String(agreement.creditor.user) === String(req.user._id) ||
    String(agreement.debtor.user) === String(req.user._id);
  if (!isParty) return next(new AppError('Not authorised.', 403));

  const respondent =
    String(agreement.creditor.user) === String(req.user._id)
      ? agreement.debtor.user
      : agreement.creditor.user;

  // Upload evidence files
  const evidence = [];
  if (req.files?.length) {
    for (let i = 0; i < req.files.length; i++) {
      const url = await cloudinaryService.uploadDisputeEvidence(req.files[i].buffer, `new_${Date.now()}`, i);
      evidence.push({ url, type: req.files[i].mimetype, uploadedAt: new Date() });
    }
  }

  const dispute = await Dispute.create({
    agreement: agreementId,
    initiatedBy: req.user._id,
    respondent,
    reason,
    description,
    evidence,
  });

  // Update agreement status
  await Agreement.findByIdAndUpdate(agreementId, {
    status: 'disputed',
    $push: { disputes: dispute._id },
    $push: { statusHistory: { status: 'disputed', changedBy: req.user._id, reason: 'Dispute raised' } },
  });

  const io = req.app.get('io');
  await notificationService.createNotification(io, {
    recipientId: respondent,
    type: 'agreement_disputed',
    title: 'A Dispute Has Been Raised',
    message: `A dispute has been opened on agreement ${agreement.agreementId}. Please respond.`,
    data: { disputeId: dispute._id, agreementId },
    channels: { email: true },
    priority: 'urgent',
  });

  sendCreated(res, { message: 'Dispute created.', data: dispute });
});

exports.getMyDisputes = catchAsync(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;
  const filter = { $or: [{ initiatedBy: req.user._id }, { respondent: req.user._id }] };
  const [disputes, total] = await Promise.all([
    Dispute.find(filter).skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 })
      .populate('agreement', 'agreementId principalAmount currency')
      .populate('initiatedBy', 'firstName lastName')
      .populate('respondent', 'firstName lastName'),
    Dispute.countDocuments(filter),
  ]);
  sendPaginated(res, { data: disputes, total, page, limit });
});

exports.getDispute = catchAsync(async (req, res, next) => {
  const dispute = await Dispute.findById(req.params.id)
    .populate('agreement')
    .populate('initiatedBy', 'firstName lastName avatar')
    .populate('respondent', 'firstName lastName avatar')
    .populate('messages.sender', 'firstName lastName avatar');

  if (!dispute) return next(new AppError('Dispute not found.', 404));
  const isParty =
    String(dispute.initiatedBy._id) === String(req.user._id) ||
    String(dispute.respondent._id) === String(req.user._id) ||
    req.user.role === 'admin';
  if (!isParty) return next(new AppError('Not authorised.', 403));

  sendSuccess(res, { data: dispute });
});

exports.addDisputeMessage = catchAsync(async (req, res, next) => {
  const dispute = await Dispute.findById(req.params.id);
  if (!dispute) return next(new AppError('Dispute not found.', 404));
  if (!['open', 'under_review'].includes(dispute.status)) {
    return next(new AppError('Cannot add messages to a resolved dispute.', 400));
  }

  dispute.messages.push({
    sender: req.user._id,
    message: req.body.message,
    sentAt: new Date(),
  });
  await dispute.save();
  sendSuccess(res, { message: 'Message added.', data: dispute });
});

exports.resolveDispute = catchAsync(async (req, res, next) => {
  const { resolution, outcome } = req.body;
  const dispute = await Dispute.findById(req.params.id);
  if (!dispute) return next(new AppError('Dispute not found.', 404));

  const validOutcomes = ['resolved_creditor', 'resolved_debtor', 'withdrawn'];
  if (!validOutcomes.includes(outcome)) return next(new AppError('Invalid outcome.', 400));

  dispute.status = outcome;
  dispute.resolution = resolution;
  dispute.resolvedAt = new Date();
  dispute.resolvedBy = req.user._id;
  await dispute.save();

  // Restore agreement to active if dispute is resolved
  await Agreement.findByIdAndUpdate(dispute.agreement, { status: 'active' });

  sendSuccess(res, { message: 'Dispute resolved.', data: dispute });
});

exports.getAllDisputes = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const filter = {};
  if (status) filter.status = status;
  const [disputes, total] = await Promise.all([
    Dispute.find(filter).skip((page - 1) * limit).limit(parseInt(limit)).sort({ createdAt: -1 })
      .populate('initiatedBy', 'firstName lastName email')
      .populate('respondent', 'firstName lastName email')
      .populate('agreement', 'agreementId'),
    Dispute.countDocuments(filter),
  ]);
  sendPaginated(res, { data: disputes, total, page, limit });
});


// ════════════════════════════════════════════════════════════
// public.controller.js — verify.trustledger.com portal
// ════════════════════════════════════════════════════════════

exports.searchDefaulters = catchAsync(async (req, res) => {
  const { name, agreementId, page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;

  const filter = { isDefaulter: true, isPubliclySearchable: true };
  if (name) {
    filter.$or = [
      { firstName: new RegExp(name, 'i') },
      { lastName: new RegExp(name, 'i') },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .skip(skip)
      .limit(parseInt(limit))
      .select('firstName lastName trustScore.score trustScore.level defaulterListedAt'),
    User.countDocuments(filter),
  ]);

  sendPaginated(res, { data: users, total, page, limit });
});

exports.verifyAgreementPublic = catchAsync(async (req, res, next) => {
  const { agreementId } = req.params;
  const agreement = await Agreement.findOne({ agreementId })
    .select('agreementId status documentHash principalAmount currency dueDate createdAt activatedAt');
  if (!agreement) return next(new AppError('Agreement not found.', 404));

  const recomputedHash = agreement.generateDocumentHash();
  sendSuccess(res, {
    data: {
      agreementId: agreement.agreementId,
      status: agreement.status,
      principalAmount: agreement.principalAmount,
      currency: agreement.currency,
      dueDate: agreement.dueDate,
      createdAt: agreement.createdAt,
      activatedAt: agreement.activatedAt,
      isIntact: recomputedHash === agreement.documentHash,
    },
  });
});

exports.getUserPublicProfile = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id)
    .select('firstName lastName trustScore.score trustScore.level isIdentityVerified stats.completedAgreements stats.defaultedAgreements isDefaulter');
  if (!user) return next(new AppError('User not found.', 404));
  sendSuccess(res, { data: user });
});


// ════════════════════════════════════════════════════════════
// admin.controller.js
// ════════════════════════════════════════════════════════════
const AuditLog = require('../models/AuditLog.model');

exports.getDashboardStats = catchAsync(async (req, res) => {
  const [
    totalUsers,
    verifiedUsers,
    totalAgreements,
    activeAgreements,
    defaultedAgreements,
    totalPayments,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ isIdentityVerified: true }),
    Agreement.countDocuments(),
    Agreement.countDocuments({ status: 'active' }),
    Agreement.countDocuments({ status: 'defaulted' }),
    Payment.countDocuments({ status: 'confirmed' }),
  ]);

  sendSuccess(res, {
    data: {
      users: { total: totalUsers, verified: verifiedUsers },
      agreements: { total: totalAgreements, active: activeAgreements, defaulted: defaultedAgreements },
      payments: { confirmed: totalPayments },
    },
  });
});

exports.getAuditLogs = catchAsync(async (req, res) => {
  const { page = 1, limit = 50, action, userId } = req.query;
  const filter = {};
  if (action) filter.action = new RegExp(action, 'i');
  if (userId) filter.performedBy = userId;

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 })
      .populate('performedBy', 'firstName lastName email'),
    AuditLog.countDocuments(filter),
  ]);

  sendPaginated(res, { data: logs, total, page, limit });
});

exports.listDefaulter = catchAsync(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isDefaulter: true, isPubliclySearchable: true, defaulterListedAt: new Date() },
    { new: true }
  );
  if (!user) return next(new AppError('User not found.', 404));
  sendSuccess(res, { message: 'User listed as defaulter.', data: user });
});

exports.removeDefaulter = catchAsync(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    {
      isDefaulter: false,
      isPubliclySearchable: false,
      defaulterRemovedAt: new Date(),
    },
    { new: true }
  );
  if (!user) return next(new AppError('User not found.', 404));
  sendSuccess(res, { message: 'User removed from defaulter list.', data: user });
});

// Need these imports at top for controllers that use them
const { sendCreated } = require('../utils/response.utils');
const Payment = require('../models/Payment.model');
