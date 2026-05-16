// ════════════════════════════════════════════════════════════
// auth.routes.js
// ════════════════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');
const { body } = require('express-validator');
const validate = require('../validators/validate');

const registerRules = [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
  body('phone').matches(/^\+?[1-9]\d{1,14}$/).withMessage('Valid phone number required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
];

const loginRules = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
];

router.post('/register', registerRules, validate, authController.register);
router.post('/login', loginRules, validate, authController.login);
router.post('/logout', protect, authController.logout);
router.post('/refresh-token', authController.refreshToken);
router.get('/verify-email/:token', authController.verifyEmail);
router.post('/resend-verification', protect, authController.resendEmailVerification);
router.post('/send-phone-otp', protect, authController.sendPhoneOTP);
router.post('/verify-phone-otp', protect, authController.verifyPhoneOTP);
router.post('/forgot-password', authController.forgotPassword);
router.patch('/reset-password/:token', authController.resetPassword);
router.patch('/change-password', protect, authController.changePassword);
router.get('/me', protect, authController.getMe);

module.exports = router;
