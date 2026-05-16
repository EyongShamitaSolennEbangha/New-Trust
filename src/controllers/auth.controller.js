const crypto = require('crypto');
const User = require('../models/User.model');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { sendTokenResponse, verifyRefreshToken, signAccessToken } = require('../utils/jwt.utils');
const { hashToken } = require('../utils/encryption.utils');
const { blacklistToken } = require('../config/redis');
const emailService = require('../services/email.service');
const smsService = require('../services/sms.service');
const { sendSuccess } = require('../utils/response.utils');

// ── Register ──────────────────────────────────────────────────────────────────
exports.register = catchAsync(async (req, res, next) => {
  const { firstName, lastName, email, phone, password } = req.body;

  const existing = await User.findOne({ $or: [{ email }, { phone }] });
  if (existing) {
    const field = existing.email === email ? 'email' : 'phone number';
    return next(new AppError(`An account with this ${field} already exists.`, 409));
  }

  const user = await User.create({ firstName, lastName, email, phone, password });

  // Send email verification
  const verificationToken = user.getEmailVerificationToken();
  await user.save({ validateBeforeSave: false });

  try {
    await emailService.sendEmailVerification(user, verificationToken);
    await emailService.sendWelcomeEmail(user);
  } catch (err) {
    user.emailVerificationToken = undefined;
    user.emailVerificationExpire = undefined;
    await user.save({ validateBeforeSave: false });
  }

  sendTokenResponse(user, 201, res, 'Account created. Please verify your email.');
});

// ── Login ─────────────────────────────────────────────────────────────────────
exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new AppError('Please provide email and password.', 400));
  }

  const user = await User.findOne({ email }).select('+password +loginAttempts +lockUntil');
  if (!user) return next(new AppError('Invalid email or password.', 401));

  if (user.isLocked) {
    return next(
      new AppError('Account locked due to multiple failed attempts. Try again in 2 hours.', 423)
    );
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    await user.incrementLoginAttempts();
    return next(new AppError('Invalid email or password.', 401));
  }

  // Reset login attempts on success
  user.loginAttempts = 0;
  user.lockUntil = undefined;
  user.lastLogin = new Date();
  user.lastLoginIP = req.ip;
  user.behaviorMetrics.lastActivityAt = new Date();
  await user.save({ validateBeforeSave: false });

  sendTokenResponse(user, 200, res, 'Login successful');
});

// ── Logout ────────────────────────────────────────────────────────────────────
exports.logout = catchAsync(async (req, res) => {
  // Blacklist the current access token
  await blacklistToken(req.token, 7 * 24 * 60 * 60);
  sendSuccess(res, { message: 'Logged out successfully' });
});

// ── Refresh Token ─────────────────────────────────────────────────────────────
exports.refreshToken = catchAsync(async (req, res, next) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return next(new AppError('Refresh token required.', 400));

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    return next(new AppError('Invalid or expired refresh token.', 401));
  }

  const user = await User.findById(decoded.id);
  if (!user) return next(new AppError('User not found.', 404));

  const accessToken = signAccessToken(user._id);
  sendSuccess(res, { message: 'Token refreshed', data: { accessToken } });
});

// ── Verify Email ──────────────────────────────────────────────────────────────
exports.verifyEmail = catchAsync(async (req, res, next) => {
  const hashedToken = hashToken(req.params.token);

  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpire: { $gt: Date.now() },
  });

  if (!user) return next(new AppError('Invalid or expired verification link.', 400));

  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpire = undefined;
  if (user.accountStatus === 'pending_verification') user.accountStatus = 'active';
  await user.save({ validateBeforeSave: false });

  sendSuccess(res, { message: 'Email verified successfully.' });
});

// ── Resend Email Verification ─────────────────────────────────────────────────
exports.resendEmailVerification = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id);
  if (user.isEmailVerified) return next(new AppError('Email is already verified.', 400));

  const token = user.getEmailVerificationToken();
  await user.save({ validateBeforeSave: false });
  await emailService.sendEmailVerification(user, token);

  sendSuccess(res, { message: 'Verification email sent.' });
});

// ── Send Phone OTP ────────────────────────────────────────────────────────────
exports.sendPhoneOTP = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id);
  await smsService.sendPhoneOTP(user.phone);
  sendSuccess(res, { message: `OTP sent to ${user.phone.slice(0, -4).replace(/./g, '*')}****` });
});

// ── Verify Phone OTP ──────────────────────────────────────────────────────────
exports.verifyPhoneOTP = catchAsync(async (req, res, next) => {
  const { otp } = req.body;
  if (!otp) return next(new AppError('OTP is required.', 400));

  const result = await smsService.verifyPhoneOTP(req.user.phone, otp);
  if (!result.valid) return next(new AppError(result.reason, 400));

  await User.findByIdAndUpdate(req.user._id, {
    isPhoneVerified: true,
    accountStatus: 'active',
  });

  sendSuccess(res, { message: 'Phone verified successfully.' });
});

// ── Forgot Password ───────────────────────────────────────────────────────────
exports.forgotPassword = catchAsync(async (req, res, next) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user) return next(new AppError('No account with that email address.', 404));

  const resetToken = user.getPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  try {
    await emailService.sendPasswordResetEmail(user, resetToken);
    sendSuccess(res, { message: 'Password reset email sent.' });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpire = undefined;
    await user.save({ validateBeforeSave: false });
    return next(new AppError('Failed to send reset email. Try again later.', 500));
  }
});

// ── Reset Password ────────────────────────────────────────────────────────────
exports.resetPassword = catchAsync(async (req, res, next) => {
  const hashedToken = hashToken(req.params.token);

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpire: { $gt: Date.now() },
  });

  if (!user) return next(new AppError('Invalid or expired reset token.', 400));

  user.password = req.body.password;
  user.passwordResetToken = undefined;
  user.passwordResetExpire = undefined;
  user.loginAttempts = 0;
  user.lockUntil = undefined;
  await user.save();

  sendTokenResponse(user, 200, res, 'Password reset successful.');
});

// ── Change Password ────────────────────────────────────────────────────────────
exports.changePassword = catchAsync(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+password');
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) return next(new AppError('Current password is incorrect.', 401));

  user.password = newPassword;
  await user.save();

  // Blacklist old token
  await blacklistToken(req.token, 7 * 24 * 60 * 60);

  sendTokenResponse(user, 200, res, 'Password changed successfully. Please log in again.');
});

// ── Get Current User ──────────────────────────────────────────────────────────
exports.getMe = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id);
  sendSuccess(res, { data: user });
});
