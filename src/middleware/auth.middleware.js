const jwt = require('jsonwebtoken');
const User = require('../models/User.model');
const { isTokenBlacklisted } = require('../config/redis');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// Verify JWT and attach user to request
exports.protect = catchAsync(async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies?.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return next(new AppError('You are not logged in. Please log in to access this resource.', 401));
  }

  // Check if token is blacklisted (logged out)
  const blacklisted = await isTokenBlacklisted(token);
  if (blacklisted) {
    return next(new AppError('Token is no longer valid. Please log in again.', 401));
  }

  // Verify token
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return next(new AppError('Invalid or expired token. Please log in again.', 401));
  }

  // Check user still exists
  const user = await User.findById(decoded.id).select('+twoFactorSecret');
  if (!user) {
    return next(new AppError('The account belonging to this token no longer exists.', 401));
  }

  // Check account status
  if (user.accountStatus === 'banned') {
    return next(new AppError('Your account has been permanently banned.', 403));
  }
  if (user.accountStatus === 'suspended') {
    return next(new AppError('Your account is temporarily suspended. Contact support.', 403));
  }

  // Check if account is locked
  if (user.isLocked) {
    return next(new AppError('Account is locked due to multiple failed login attempts.', 423));
  }

  req.user = user;
  req.token = token;
  next();
});

// Role-based access control
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action.', 403));
    }
    next();
  };
};

// Require verified identity for sensitive actions
exports.requireIdentityVerification = (req, res, next) => {
  if (!req.user.isIdentityVerified) {
    return next(
      new AppError(
        'Identity verification required. Please verify your ID before performing this action.',
        403
      )
    );
  }
  next();
};

// Require email verified
exports.requireEmailVerified = (req, res, next) => {
  if (!req.user.isEmailVerified) {
    return next(new AppError('Please verify your email address first.', 403));
  }
  next();
};

// Require phone verified
exports.requirePhoneVerified = (req, res, next) => {
  if (!req.user.isPhoneVerified) {
    return next(new AppError('Please verify your phone number first.', 403));
  }
  next();
};

// Optional auth - attach user if token present, don't fail if not
exports.optionalAuth = catchAsync(async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id);
    } catch {
      // ignore invalid token for optional auth
    }
  }
  next();
});
