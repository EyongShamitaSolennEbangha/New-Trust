const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { protect } = require('../middleware/auth.middleware');
const { uploadPaymentReceipt } = require('../middleware/upload.middleware');
const auditLog = require('../middleware/auditLog.middleware');
const { body } = require('express-validator');
const validate = require('../validators/validate');

router.use(protect);

const recordPaymentRules = [
  body('agreementId').isMongoId().withMessage('Valid agreement ID required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
  body('paymentMethod')
    .isIn(['cash', 'bank_transfer', 'card', 'mobile_money', 'crypto', 'other'])
    .withMessage('Invalid payment method'),
];

// ── My Payments ───────────────────────────────────────────────────────────────
router.get('/', paymentController.getMyPayments);

// ── Record Payment ────────────────────────────────────────────────────────────
router.post(
  '/',
  uploadPaymentReceipt,
  recordPaymentRules,
  validate,
  auditLog('payment_recorded', 'Payment'),
  paymentController.recordPayment
);

// ── Agreement Payments ────────────────────────────────────────────────────────
router.get('/agreement/:agreementId', paymentController.getAgreementPayments);

// ── Payment Actions ───────────────────────────────────────────────────────────
router.patch('/:id/confirm', auditLog('payment_confirmed', 'Payment'), paymentController.confirmPayment);
router.patch('/:id/dispute', auditLog('payment_disputed', 'Payment'), paymentController.disputePayment);

module.exports = router;
