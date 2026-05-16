const Payment = require('../models/Payment.model');
const Agreement = require('../models/Agreement.model');
const User = require('../models/User.model');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { sendSuccess, sendCreated, sendPaginated } = require('../utils/response.utils');
const notificationService = require('../services/notification.service');
const trustScoreService = require('../services/trustScore.service');
const emailService = require('../services/email.service');
const cloudinaryService = require('../services/cloudinary.service');

// ── Record a Payment ──────────────────────────────────────────────────────────
exports.recordPayment = catchAsync(async (req, res, next) => {
  const { agreementId, amount, paymentMethod, notes, installmentNumber } = req.body;

  const agreement = await Agreement.findById(agreementId);
  if (!agreement) return next(new AppError('Agreement not found.', 404));

  if (String(agreement.debtor.user) !== String(req.user._id)) {
    return next(new AppError('Only the debtor can record a payment.', 403));
  }
  if (agreement.status !== 'active') {
    return next(new AppError('Payments can only be recorded on active agreements.', 400));
  }

  const parsedAmount = parseFloat(amount);
  if (parsedAmount <= 0) return next(new AppError('Payment amount must be greater than 0.', 400));
  if (parsedAmount > agreement.remainingBalance) {
    return next(
      new AppError(
        `Payment amount (${parsedAmount}) exceeds remaining balance (${agreement.remainingBalance}).`,
        400
      )
    );
  }

  // Check if payment is on time
  const isOnTime = new Date() <= new Date(agreement.dueDate);
  const daysLate = isOnTime
    ? 0
    : Math.floor((Date.now() - new Date(agreement.dueDate)) / (1000 * 60 * 60 * 24));

  // Upload receipt if provided
  let receiptUrl = null;
  if (req.file) {
    receiptUrl = await cloudinaryService.uploadPaymentReceipt(
      req.file.buffer,
      `temp_${Date.now()}`
    );
  }

  const payment = await Payment.create({
    agreement: agreementId,
    paidBy: req.user._id,
    receivedBy: agreement.creditor.user,
    amount: parsedAmount,
    currency: agreement.currency,
    paymentMethod,
    notes,
    installmentNumber,
    receiptPhoto: receiptUrl,
    isOnTime,
    daysLate,
    ipAddress: req.ip,
    status: 'pending', // creditor must confirm
  });

  // Update receipt with real reference
  if (receiptUrl) {
    const finalUrl = await cloudinaryService.uploadPaymentReceipt(
      req.file.buffer,
      payment.paymentReference
    );
    payment.receiptPhoto = finalUrl;
    await payment.save();
  }

  const io = req.app.get('io');

  // Real-time emit to agreement room
  notificationService.emitPaymentUpdate(io, agreementId, {
    paymentReference: payment.paymentReference,
    amount: parsedAmount,
    currency: agreement.currency,
    paidBy: req.user.fullName,
    status: 'pending',
  });

  // Notify creditor
  const [creditor, debtor] = await Promise.all([
    User.findById(agreement.creditor.user),
    User.findById(agreement.debtor.user),
  ]);

  await notificationService.createNotification(io, {
    recipientId: agreement.creditor.user,
    type: 'payment_received',
    title: 'Payment Recorded — Confirmation Required',
    message: `${debtor.fullName} recorded a payment of ${agreement.currency} ${parsedAmount.toLocaleString()} for agreement ${agreement.agreementId}. Please confirm.`,
    data: { paymentId: payment._id, agreementId },
    channels: { email: true },
    priority: 'high',
  });

  try {
    await emailService.sendPaymentReceivedEmail(creditor, debtor, payment, agreement);
  } catch {}

  sendCreated(res, {
    message: 'Payment recorded. Awaiting creditor confirmation.',
    data: payment,
  });
});

// ── Creditor Confirms Payment ──────────────────────────────────────────────────
exports.confirmPayment = catchAsync(async (req, res, next) => {
  const payment = await Payment.findById(req.params.id).populate('agreement');
  if (!payment) return next(new AppError('Payment not found.', 404));

  if (String(payment.receivedBy) !== String(req.user._id)) {
    return next(new AppError('Only the creditor can confirm this payment.', 403));
  }
  if (payment.status !== 'pending') {
    return next(new AppError(`Payment is already ${payment.status}.`, 400));
  }

  payment.status = 'confirmed';
  payment.confirmedAt = new Date();
  payment.confirmedBy = req.user._id;
  await payment.save();

  // Update agreement balance
  const agreement = await Agreement.findById(payment.agreement._id);
  agreement.remainingBalance = Math.max(0, agreement.remainingBalance - payment.amount);
  agreement.lastPaymentAt = new Date();

  // Update installment if applicable
  if (payment.installmentNumber) {
    const installment = agreement.installments.find(
      (i) => i.installmentNumber === payment.installmentNumber
    );
    if (installment) {
      installment.paidAmount += payment.amount;
      installment.paidAt = new Date();
      installment.status = installment.paidAmount >= installment.amountDue ? 'paid' : 'partial';
    }
  }

  // Mark complete if fully paid
  if (agreement.remainingBalance === 0) {
    agreement.status = 'completed';
    agreement.completedAt = new Date();
    agreement.statusHistory.push({
      status: 'completed',
      changedBy: req.user._id,
      reason: 'Fully paid',
    });

    // Update stats
    await Promise.all([
      User.findByIdAndUpdate(agreement.creditor.user, {
        $inc: { 'stats.completedAgreements': 1 },
      }),
      User.findByIdAndUpdate(agreement.debtor.user, {
        $inc: { 'stats.completedAgreements': 1 },
      }),
    ]);
  }

  await agreement.save();

  // Update debtor's stats
  await User.findByIdAndUpdate(payment.paidBy, {
    $inc: { 'stats.totalAmountBorrowed': -payment.amount },
  });

  const io = req.app.get('io');

  // Recalculate trust scores for both parties
  const [debtorScore, creditorScore] = await Promise.all([
    trustScoreService.updateUserTrustScore(payment.paidBy, 'Payment confirmed'),
    trustScoreService.updateUserTrustScore(payment.receivedBy, 'Payment received'),
  ]);
  notificationService.emitTrustScoreUpdate(io, payment.paidBy, debtorScore);
  notificationService.emitTrustScoreUpdate(io, payment.receivedBy, creditorScore);

  // Notify debtor
  await notificationService.createNotification(io, {
    recipientId: payment.paidBy,
    type: 'payment_confirmed',
    title: 'Payment Confirmed ✅',
    message: `Your payment of ${payment.currency} ${payment.amount.toLocaleString()} for agreement ${agreement.agreementId} has been confirmed.`,
    data: { paymentId: payment._id, agreementId: agreement._id },
    channels: { email: true, sms: true },
    priority: 'high',
  });

  notificationService.emitAgreementStatusChange(io, agreement._id, {
    remainingBalance: agreement.remainingBalance,
    status: agreement.status,
    paymentConfirmed: true,
  });

  sendSuccess(res, {
    message: 'Payment confirmed.',
    data: {
      payment,
      remainingBalance: agreement.remainingBalance,
      agreementStatus: agreement.status,
    },
  });
});

// ── Dispute a Payment ─────────────────────────────────────────────────────────
exports.disputePayment = catchAsync(async (req, res, next) => {
  const payment = await Payment.findById(req.params.id);
  if (!payment) return next(new AppError('Payment not found.', 404));

  if (
    String(payment.paidBy) !== String(req.user._id) &&
    String(payment.receivedBy) !== String(req.user._id)
  ) {
    return next(new AppError('Not authorised to dispute this payment.', 403));
  }

  payment.status = 'disputed';
  await payment.save();

  sendSuccess(res, { message: 'Payment disputed. Please open a formal dispute.', data: payment });
});

// ── Get Payments for an Agreement ─────────────────────────────────────────────
exports.getAgreementPayments = catchAsync(async (req, res, next) => {
  const agreement = await Agreement.findById(req.params.agreementId);
  if (!agreement) return next(new AppError('Agreement not found.', 404));

  const isParty =
    String(agreement.creditor.user) === String(req.user._id) ||
    String(agreement.debtor.user) === String(req.user._id) ||
    req.user.role === 'admin';

  if (!isParty) return next(new AppError('Not authorised.', 403));

  const payments = await Payment.find({ agreement: req.params.agreementId })
    .sort({ createdAt: -1 })
    .populate('paidBy', 'firstName lastName avatar')
    .populate('confirmedBy', 'firstName lastName');

  sendSuccess(res, { data: payments });
});

// ── Get My Payment History ────────────────────────────────────────────────────
exports.getMyPayments = catchAsync(async (req, res) => {
  const { page = 1, limit = 10, role } = req.query;
  const skip = (page - 1) * limit;

  const filter = role === 'creditor'
    ? { receivedBy: req.user._id }
    : role === 'debtor'
    ? { paidBy: req.user._id }
    : { $or: [{ paidBy: req.user._id }, { receivedBy: req.user._id }] };

  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 })
      .populate('agreement', 'agreementId currency')
      .populate('paidBy', 'firstName lastName')
      .populate('receivedBy', 'firstName lastName'),
    Payment.countDocuments(filter),
  ]);

  sendPaginated(res, { data: payments, total, page, limit });
});
