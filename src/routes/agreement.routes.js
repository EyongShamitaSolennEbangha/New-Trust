const express = require('express');
const router = express.Router();
const agreementController = require('../controllers/agreement.controller');
const { protect, restrictTo, requireIdentityVerification } = require('../middleware/auth.middleware');
const { uploadIdPhotos } = require('../middleware/upload.middleware');
const auditLog = require('../middleware/auditLog.middleware');
const { body } = require('express-validator');
const validate = require('../validators/validate');
const { messaging, userTokens } = require('../utils/firebase'); // import
const { normalizePhone } = require('../utils/phone');


// You can keep the helper function here, but it must be defined, not invoked

async function sendPushNotification(phoneNumber, title, body) {
  try {
    const { getFCMToken, messaging } = require('../utils/firebase');
    const fcmToken = await getFCMToken(phoneNumber);
    if (!fcmToken) {
      console.log(`No FCM token for ${phoneNumber}`);
      return false;
    }
    const message = { notification: { title, body }, token: fcmToken };
    await messaging.send(message);
    return true;
  } catch (error) {
    console.error('Push notification error:', error);
    return false;
  }
}
router.use(protect);

const createAgreementRules = [
  body('principalAmount').isFloat({ min: 1 }).withMessage('Amount must be greater than 0'),
  body('purpose').trim().notEmpty().withMessage('Purpose is required'),
  body('dueDate').isISO8601().withMessage('Valid due date required'),
  body('verificationMode').isIn(['in_person', 'remote']).withMessage('Invalid verification mode'),
];

// ── CRUD ──────────────────────────────────────────────────────────────────────
router.post(
  '/',
  requireIdentityVerification,
  createAgreementRules,
  validate,
  auditLog('agreement_created', 'Agreement'),
  agreementController.createAgreement
);
router.get('/', agreementController.getMyAgreements);
router.get('/all', restrictTo('admin', 'moderator'), agreementController.getAllAgreements);
router.get('/:id', agreementController.getAgreement);
router.delete('/:id/cancel', auditLog('agreement_cancelled', 'Agreement'), agreementController.cancelAgreement);

// ── Integrity ─────────────────────────────────────────────────────────────────
router.get('/:id/verify-integrity', agreementController.verifyAgreementIntegrity);

// ── In-Person Verification Flow ───────────────────────────────────────────────
router.post('/:id/in-person/initiate', auditLog('otp_generated', 'Agreement'), agreementController.initiateInPersonVerification);
router.post('/:id/in-person/complete', auditLog('in_person_verified', 'Agreement'), agreementController.completeInPersonVerification);

// ── Signing ───────────────────────────────────────────────────────────────────
router.post('/:id/sign/creditor', auditLog('agreement_signed_creditor', 'Agreement'), agreementController.creditorSign);

// ── Remote Verification Flow ──────────────────────────────────────────────────
router.post('/:id/remote/generate-link', auditLog('verification_link_generated', 'Agreement'), agreementController.generateRemoteVerificationLink);

// ── Default ───────────────────────────────────────────────────────────────────
router.patch('/:id/default', auditLog('agreement_defaulted', 'Agreement'), agreementController.markAsDefaulted);




module.exports = router;
