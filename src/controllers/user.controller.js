const User = require('../models/User.model');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { sendSuccess, sendPaginated } = require('../utils/response.utils');
const cloudinaryService = require('../services/cloudinary.service');
const faceMatchService = require('../services/faceMatch.service');
const trustScoreService = require('../services/trustScore.service');
const notificationService = require('../services/notification.service');
const { encrypt } = require('../utils/encryption.utils');

// ── Get Profile ───────────────────────────────────────────────────────────────
exports.getProfile = catchAsync(async (req, res) => {
  const userId = req.params.id || req.user._id;
  const user = await User.findById(userId).select(
    '-passwordResetToken -emailVerificationToken -phoneOTP -twoFactorSecret'
  );
  if (!user) throw new AppError('User not found.', 404);
  sendSuccess(res, { data: user });
});

// ── Update Profile ────────────────────────────────────────────────────────────
exports.updateProfile = catchAsync(async (req, res, next) => {
  const forbidden = ['password', 'email', 'role', 'accountStatus', 'trustScore'];
  const hasForibdden = forbidden.some((f) => req.body[f]);
  if (hasForibdden) {
    return next(new AppError('You cannot update restricted fields through this route.', 400));
  }

  const allowed = ['firstName', 'lastName', 'phone', 'address', 'nationality', 'dateOfBirth', 'notificationPreferences'];
  const updateData = {};
  allowed.forEach((field) => {
    if (req.body[field] !== undefined) updateData[field] = req.body[field];
  });

  const user = await User.findByIdAndUpdate(req.user._id, updateData, {
    new: true,
    runValidators: true,
  });

  sendSuccess(res, { message: 'Profile updated.', data: user });
});

// ── Upload Avatar ─────────────────────────────────────────────────────────────
exports.uploadAvatar = catchAsync(async (req, res, next) => {
  if (!req.file) return next(new AppError('Please upload an image.', 400));

  const avatarUrl = await cloudinaryService.uploadAvatar(req.file.buffer, req.user._id);
  await User.findByIdAndUpdate(req.user._id, { avatar: avatarUrl });

  sendSuccess(res, { message: 'Avatar updated.', data: { avatar: avatarUrl } });
});

// ── Submit Identity Verification ──────────────────────────────────────────────
exports.submitIdentityVerification = catchAsync(async (req, res, next) => {
  if (!req.files?.idFront || !req.files?.selfie) {
    return next(new AppError('ID front photo and selfie are required.', 400));
  }

  const { idType, idNumber } = req.body;
  if (!idType || !idNumber) {
    return next(new AppError('ID type and number are required.', 400));
  }

  // Upload to Cloudinary
  const [idFrontUrl, selfieUrl] = await Promise.all([
    cloudinaryService.uploadIdFront(req.files.idFront[0].buffer, req.user._id),
    cloudinaryService.uploadSelfie(req.files.selfie[0].buffer, req.user._id),
  ]);

  let idBackUrl = null;
  if (req.files?.idBack) {
    idBackUrl = await cloudinaryService.uploadIdBack(req.files.idBack[0].buffer, req.user._id);
  }

  // Detect face in selfie
  const faceDetection = await faceMatchService.detectFace(selfieUrl);
  if (!faceDetection.hasExactlyOneFace) {
    return next(
      new AppError('Selfie must contain exactly one clearly visible face.', 400)
    );
  }

  // AI face matching: selfie vs ID photo
  const matchResult = await faceMatchService.compareFaces(idFrontUrl, selfieUrl);

  // Encrypt ID number before storing
  const encryptedIdNumber = encrypt(idNumber);

  const updateData = {
    'idDocument.type': idType,
    'idDocument.number': encryptedIdNumber,
    'idDocument.frontPhoto': idFrontUrl,
    'idDocument.selfiePhoto': selfieUrl,
    'idDocument.aiMatchScore': matchResult.score,
    ...(idBackUrl && { 'idDocument.backPhoto': idBackUrl }),
  };

  if (matchResult.matched) {
    updateData['idDocument.verifiedAt'] = new Date();
    updateData.isIdentityVerified = true;
    updateData.accountStatus = 'active';
  }

  const user = await User.findByIdAndUpdate(req.user._id, updateData, { new: true });

  // Recalculate trust score after identity verification
  if (matchResult.matched) {
    const io = req.app.get('io');
    const scoreResult = await trustScoreService.updateUserTrustScore(
      req.user._id,
      'Identity verified'
    );
    notificationService.emitTrustScoreUpdate(io, req.user._id, scoreResult);
  }

  sendSuccess(res, {
    message: matchResult.matched
      ? 'Identity verified successfully!'
      : 'ID submitted for review. Face match failed — please retake selfie.',
    data: {
      isIdentityVerified: matchResult.matched,
      faceMatchScore: matchResult.score,
      faceMatchConfidence: matchResult.confidence,
    },
  });
});

// ── Get All Users (admin) ─────────────────────────────────────────────────────
exports.getAllUsers = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, status, role, search } = req.query;
  const skip = (page - 1) * limit;

  const filter = {};
  if (status) filter.accountStatus = status;
  if (role) filter.role = role;
  if (search) {
    filter.$or = [
      { firstName: new RegExp(search, 'i') },
      { lastName: new RegExp(search, 'i') },
      { email: new RegExp(search, 'i') },
      { phone: new RegExp(search, 'i') },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 })
      .select('-password -passwordResetToken -emailVerificationToken'),
    User.countDocuments(filter),
  ]);

  sendPaginated(res, { data: users, total, page, limit });
});

// ── Suspend / Ban User (admin) ────────────────────────────────────────────────
exports.updateAccountStatus = catchAsync(async (req, res, next) => {
  const { status, reason } = req.body;
  const validStatuses = ['active', 'suspended', 'banned'];
  if (!validStatuses.includes(status)) {
    return next(new AppError('Invalid status value.', 400));
  }

  const user = await User.findByIdAndUpdate(
    req.params.id,
    { accountStatus: status },
    { new: true }
  );
  if (!user) return next(new AppError('User not found.', 404));

  sendSuccess(res, { message: `Account ${status}.`, data: user });
});

// ── Get User Stats ─────────────────────────────────────────────────────────────
exports.getUserStats = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).select('stats trustScore behaviorMetrics');
  sendSuccess(res, { data: user });
});

// ── Update Notification Preferences ──────────────────────────────────────────
exports.updateNotificationPreferences = catchAsync(async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { notificationPreferences: req.body },
    { new: true, runValidators: true }
  );
  sendSuccess(res, { message: 'Notification preferences updated.', data: user.notificationPreferences });
});
