const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware');
const { uploadSinglePhoto, uploadIdPhotos } = require('../middleware/upload.middleware');
const auditLog = require('../middleware/auditLog.middleware');

// All routes require authentication
router.use(protect);

// ── My Profile ────────────────────────────────────────────────────────────────
router.get('/profile', userController.getProfile);
router.patch('/profile', auditLog('profile_updated', 'User'), userController.updateProfile);
router.post('/avatar', uploadSinglePhoto('avatar'), userController.uploadAvatar);

// ── Identity Verification ────────────────────────────────────────────────────
router.post(
  '/identity/verify',
  uploadIdPhotos,
  userController.submitIdentityVerification
);
router.get('/stats', userController.getUserStats);
router.patch('/notification-preferences', userController.updateNotificationPreferences);

// ── Verify Identity (alternative endpoint) ───────────────────────────────────
router.post(
  '/verify-identity',
  uploadIdPhotos,
  auditLog('identity_verification_submitted', 'User'),
  userController.submitIdentityVerification
);

// ── View another user's profile ──────────────────────────────────────────────
router.get('/:id/profile', userController.getProfile);

// ── Admin routes ──────────────────────────────────────────────────────────────
router.get('/', restrictTo('admin', 'moderator'), userController.getAllUsers);
router.delete('/:id', restrictTo('admin'), userController.deleteUser);
router.patch(
  '/:id/status',
  restrictTo('admin'),
  auditLog('account_status_changed', 'User'),
  userController.updateAccountStatus
);
router.post(
  '/:id/verify-identity',
  restrictTo('admin'),
  userController.approveKyc
);
router.post(
  '/:id/reject-kyc',
  restrictTo('admin'),
  userController.rejectKyc
);

module.exports = router;
