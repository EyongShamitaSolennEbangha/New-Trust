const express = require('express');
const router = express.Router();
const agreementController = require('../controllers/agreement.controller');
const { uploadIdPhotos } = require('../middleware/upload.middleware');
const { body } = require('express-validator');
const validate = require('../validators/validate');
const auditLog = require('../middleware/auditLog.middleware');

/**
 * Public route — no authentication required.
 * Debtor accesses this via the secure one-time link emailed/SMSed to them.
 * Route: GET/POST /api/verification/:token
 */

// ── Get agreement preview from token (before submitting) ──────────────────────
router.get('/:token', async (req, res, next) => {
  const { hashToken } = require('../utils/encryption.utils');
  const Agreement = require('../models/Agreement.model');
  const AppError = require('../utils/AppError');

  const hashedToken = hashToken(req.params.token);
  const agreement = await Agreement.findOne({
    'remoteVerification.verificationToken': hashedToken,
    'remoteVerification.linkExpiry': { $gt: new Date() },
    'remoteVerification.linkUsed': false,
  }).select('agreementId principalAmount currency purpose dueDate creditor.name remoteVerification.linkExpiry');

  if (!agreement) {
    return next(new AppError('This verification link is invalid or has expired.', 400));
  }

  res.status(200).json({
    success: true,
    message: 'Verification link is valid.',
    data: {
      agreementId: agreement.agreementId,
      principalAmount: agreement.principalAmount,
      currency: agreement.currency,
      purpose: agreement.purpose,
      dueDate: agreement.dueDate,
      creditorName: agreement.creditor.name,
      linkExpiry: agreement.remoteVerification.linkExpiry,
    },
  });
});

// ── Submit ID + selfie + signature via remote link ────────────────────────────
router.post(
  '/:token/submit',
  uploadIdPhotos,
  [body('signature').notEmpty().withMessage('Digital signature is required')],
  validate,
  auditLog('remote_verification_completed', 'Agreement'),
  agreementController.completeRemoteVerification
);

module.exports = router;
