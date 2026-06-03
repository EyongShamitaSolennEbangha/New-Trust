const mongoose = require("mongoose");
const Agreement = require("../models/Agreement.model");
const User = require("../models/User.model");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/AppError");
const {
  sendSuccess,
  sendCreated,
  sendPaginated,
} = require("../utils/response.utils");

const loadAgreement = async (id, options = {}) => {
  const { select, populate } = options;

  const applyOptions = (query) => {
    if (select) query.select(select);
    if (populate) {
      if (Array.isArray(populate)) {
        populate.forEach((path) => query.populate(path));
      } else {
        query.populate(populate);
      }
    }
    return query;
  };

  if (mongoose.Types.ObjectId.isValid(id)) {
    const byIdQuery = applyOptions(Agreement.findById(id));
    const agreement = await byIdQuery;
    if (agreement) return agreement;
  }

  const byAgreementIdQuery = applyOptions(
    Agreement.findOne({ agreementId: id }),
  );
  return await byAgreementIdQuery;
};
const smsService = require("../services/sms.service");
const emailService = require("../services/email.service");
const notificationService = require("../services/notification.service");
const trustScoreService = require("../services/trustScore.service");
const {
  generateUrlSafeToken,
  hashToken,
  hashContent,
} = require("../utils/encryption.utils");
const { getFCMToken, messaging } = require("../utils/firebase");

// ── Create Agreement ──────────────────────────────────────────────────────────
exports.createAgreement = catchAsync(async (req, res, next) => {
  const {
    debtorPhone,
    debtorEmail,
    principalAmount,
    currency,
    interestRate,
    interestType,
    purpose,
    repaymentType,
    dueDate,
    installments,
    verificationMode,
    notes,
    tags,
  } = req.body;

  // Find debtor by phone or email
  const debtor = await User.findOne({
    $or: [
      ...(debtorPhone ? [{ phone: debtorPhone }] : []),
      ...(debtorEmail ? [{ email: debtorEmail }] : []),
    ],
  });
  if (!debtor) {
    return next(
      new AppError(
        "Debtor not found. Ask them to register on TrustLedger first.",
        404,
      ),
    );
  }
  if (String(debtor._id) === String(req.user._id)) {
    return next(
      new AppError("You cannot create an agreement with yourself.", 400),
    );
  }

  // Calculate total amount
  let totalAmountDue = parseFloat(principalAmount);
  if (interestRate && interestType !== "none") {
    if (interestType === "simple") {
      totalAmountDue = principalAmount * (1 + interestRate / 100);
    }
  }

  const creditor = req.user;

  const agreement = await Agreement.create({
    creditor: {
      user: creditor._id,
      name: creditor.fullName,
      email: creditor.email,
      phone: creditor.phone,
    },
    debtor: {
      user: debtor._id,
      name: debtor.fullName,
      email: debtor.email,
      phone: debtor.phone,
    },
    principalAmount: parseFloat(principalAmount),
    currency: currency || "NGN",
    interestRate: interestRate || 0,
    interestType: interestType || "none",
    totalAmountDue,
    remainingBalance: totalAmountDue,
    purpose,
    repaymentType: repaymentType || "lump_sum",
    dueDate: new Date(dueDate),
    verificationMode,
    notes,
    tags,
    status: "pending_debtor_verification",
    createdByIP: req.ip,
    ...(installments && { installments }),
    statusHistory: [
      {
        status: "pending_debtor_verification",
        changedBy: creditor._id,
        reason: "Agreement created",
      },
    ],
  });

  // Generate document hash for integrity
  agreement.documentHash = agreement.generateDocumentHash();
  await agreement.save();

  // If this is in-person verification, generate the first OTP immediately
  if (verificationMode === "in_person") {
    const initialCode = Math.floor(100000 + Math.random() * 900000).toString();
    agreement.inPersonVerification = agreement.inPersonVerification || {};
    agreement.inPersonVerification.otpCode = initialCode;
    agreement.inPersonVerification.otpExpiry = Date.now() + 10 * 60 * 1000;
    agreement.inPersonVerification.otpUsed = false;
    await agreement.save();
  }

  // Update creditor stats
  await User.findByIdAndUpdate(creditor._id, {
    $inc: { "stats.totalAgreementsAsCreditor": 1 },
  });

  const io = req.app.get("io");

  // Notify debtor of the new agreement
  await notificationService.createNotification(io, {
    recipientId: debtor._id,
    type: "agreement_created",
    title: "New Agreement Request",
    message: `${creditor.fullName} has created a financial agreement with you for ${currency} ${parseFloat(principalAmount).toLocaleString()}.`,
    data: { agreementId: agreement._id, agreementRef: agreement.agreementId },
    channels: { email: true, sms: true },
  });

  if (verificationMode === "in_person") {
    await notificationService.createNotification(io, {
      recipientId: debtor._id,
      type: "otp_generated",
      title: "Your verification code",
      message: `Use code ${agreement.inPersonVerification.otpCode} to verify the agreement in the app. This code expires in 10 minutes.`,
      data: { agreementId: agreement._id },
      channels: { inApp: true },
      priority: "high",
    });
  }

  // Send email/SMS notifications
  try {
    await emailService.sendAgreementCreatedEmail(creditor, debtor, agreement);
  } catch (err) {
    // Non-blocking
  }

  sendCreated(res, {
    message: "Agreement created successfully.",
    data: agreement,
  });
});

// ── Get All Agreements for current user ───────────────────────────────────────
exports.getMyAgreements = catchAsync(async (req, res) => {
  const { page = 1, limit = 10, status, role } = req.query;
  const skip = (page - 1) * limit;

  const filter = {};
  if (role === "creditor") filter["creditor.user"] = req.user._id;
  else if (role === "debtor") filter["debtor.user"] = req.user._id;
  else
    filter.$or = [
      { "creditor.user": req.user._id },
      { "debtor.user": req.user._id },
    ];

  if (status) filter.status = status;

  const [agreements, total] = await Promise.all([
    Agreement.find(filter)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 })
      .populate("creditor.user", "firstName lastName avatar trustScore.score")
      .populate("debtor.user", "firstName lastName avatar trustScore.score"),
    Agreement.countDocuments(filter),
  ]);

  sendPaginated(res, { data: agreements, total, page, limit });
});

// ── Get Single Agreement ──────────────────────────────────────────────────────
exports.getAgreement = catchAsync(async (req, res, next) => {
  const agreement = await loadAgreement(req.params.id, {
    populate: ["creditor.user", "debtor.user", "disputes"],
  });

  if (!agreement) return next(new AppError("Agreement not found.", 404));

  // Only parties involved can view
  // Development-only bypass: allow ?dev=true to view agreement without being a party
  const devBypass =
    process.env.NODE_ENV !== "production" && String(req.query.dev) === "true";

  const isParty =
    (req.user &&
      (String(agreement.creditor.user._id) === String(req.user._id) ||
        String(agreement.debtor.user._id) === String(req.user._id) ||
        req.user.role === "admin")) ||
    devBypass;

  if (!isParty)
    return next(new AppError("Not authorised to view this agreement.", 403));

  sendSuccess(res, { data: agreement });
});

// ── Initiate In-Person Verification (generate OTP) ───────────────────────────
exports.initiateInPersonVerification = async (req, res) => {
  try {
    const agreement = await loadAgreement(req.params.id);
    if (!agreement) {
      return res.status(404).json({ error: "Agreement not found." });
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Store code in DB (with expiry)
    agreement.inPersonVerification.otpCode = code;
    agreement.inPersonVerification.otpExpiry = Date.now() + 10 * 60 * 1000; // 10 min
    await agreement.save();

    const io = req.app.get("io");
    await notificationService.createNotification(io, {
      recipientId: agreement.debtor.user,
      type: "otp_generated",
      title: "Your verification code",
      message: `Use code ${code} to verify the agreement in the app. This code expires in 10 minutes.`,
      data: { agreementId: agreement._id },
      channels: { inApp: true },
      priority: "high",
    });

    // Send push notification if the debtor has a saved FCM token.
    const fcmToken = await getFCMToken(agreement.debtor.phone);
    let pushSent = false;
    let smsFallbackSent = false;

    if (fcmToken) {
      try {
        const message = {
          notification: {
            title: "TrustLedger Verification Code",
            body: `Your code: ${code}`,
          },
          token: fcmToken,
        };
        await messaging.send(message);
        pushSent = true;
        console.log(`Push sent to ${agreement.debtor.phone}`);
      } catch (err) {
        console.error("FCM send failed:", err.message);
      }
    } else {
      console.log(`No FCM token for ${agreement.debtor.phone}`);
    }

    if (!pushSent) {
      try {
        await smsService.sendSMS(
          agreement.debtor.phone,
          `TrustLedger verification code: ${code}. Enter it in the app to complete in-person verification.`,
        );
        smsFallbackSent = true;
        console.log(`SMS fallback sent to ${agreement.debtor.phone}`);
      } catch (err) {
        console.error("SMS fallback failed:", err.message);
      }
    }

    res.json({
      message: pushSent
        ? "Verification code sent by push notification."
        : smsFallbackSent
          ? "Verification code sent by SMS fallback."
          : "Unable to send verification notification. Use the code delivered locally or check server logs.",
      code: process.env.NODE_ENV === "development" ? code : undefined,
    });
  } catch (error) {
    console.error("Initiate in-person error:", error);
    res.status(500).json({ error: error.message });
  }
};

// ── Complete In-Person Verification (debtor submits OTP + signature) ──────────
exports.completeInPersonVerification = catchAsync(async (req, res, next) => {
  const { otp, signature } = req.body;
  const agreement = await loadAgreement(req.params.id, {
    select: "+inPersonVerification.otpCode",
  });

  if (!agreement) return next(new AppError("Agreement not found.", 404));
  if (String(agreement.debtor.user) !== String(req.user._id)) {
    return next(
      new AppError("Only the debtor can complete in-person verification.", 403),
    );
  }

  if (!otp || !String(otp).trim()) {
    return next(new AppError("OTP is required.", 400));
  }
  if (!signature || !String(signature).trim()) {
    return next(new AppError("Signature is required.", 400));
  }

  // Verify OTP stored in the agreement's in-person verification block.
  if (
    !agreement.inPersonVerification?.otpCode ||
    !agreement.inPersonVerification?.otpExpiry
  ) {
    return next(new AppError("OTP expired or not found.", 400));
  }

  if (agreement.inPersonVerification.otpUsed) {
    return next(new AppError("OTP has already been used.", 400));
  }

  if (Date.now() > agreement.inPersonVerification.otpExpiry) {
    return next(new AppError("OTP expired or not found.", 400));
  }

  if (agreement.inPersonVerification.otpCode !== String(otp).trim()) {
    return next(new AppError("Incorrect OTP.", 400));
  }

  // Record debtor's signature & complete verification
  agreement.debtor.signedAt = new Date();
  agreement.debtor.signature = signature;
  agreement.debtor.ipAddress = req.ip;
  agreement.inPersonVerification.otpUsed = true;
  agreement.inPersonVerification.verifiedAt = new Date();
  agreement.status = "pending_signatures";
  agreement.statusHistory.push({
    status: "pending_signatures",
    changedBy: req.user._id,
    reason: "In-person OTP verified by debtor",
  });

  agreement.inPersonVerification.otpCode = undefined;
  agreement.inPersonVerification.otpExpiry = undefined;

  await agreement.save();

  sendSuccess(res, {
    message: "OTP verified. Please sign the agreement to activate it.",
    data: { agreementId: agreement._id, status: agreement.status },
  });
});

// ── Creditor Signs Agreement ──────────────────────────────────────────────────
exports.creditorSign = catchAsync(async (req, res, next) => {
  const { signature } = req.body;
  const agreement = await loadAgreement(req.params.id);

  if (!agreement) return next(new AppError("Agreement not found.", 404));
  if (String(agreement.creditor.user) !== String(req.user._id)) {
    return next(new AppError("Not authorised.", 403));
  }
  if (agreement.creditor.signedAt) {
    return next(new AppError("You have already signed this agreement.", 400));
  }

  agreement.creditor.signedAt = new Date();
  agreement.creditor.signature = signature;
  agreement.creditor.ipAddress = req.ip;
  agreement.creditor.deviceInfo = req.get("User-Agent");

  // If debtor already signed, activate
  if (agreement.debtor.signedAt) {
    agreement.status = "active";
    agreement.activatedAt = new Date();
    agreement.statusHistory.push({
      status: "active",
      changedBy: req.user._id,
      reason: "Both parties signed — agreement activated",
    });

    // Update stats
    await User.findByIdAndUpdate(agreement.debtor.user, {
      $inc: {
        "stats.totalAgreementsAsDebtor": 1,
        "stats.totalAmountBorrowed": agreement.principalAmount,
      },
    });
    await User.findByIdAndUpdate(agreement.creditor.user, {
      $inc: { "stats.totalAmountLent": agreement.principalAmount },
    });

    const io = req.app.get("io");
    notificationService.emitAgreementStatusChange(io, agreement._id, {
      status: "active",
      agreementId: agreement.agreementId,
    });

    // Notify debtor
    await notificationService.createNotification(io, {
      recipientId: agreement.debtor.user,
      type: "agreement_activated",
      title: "Agreement is now ACTIVE",
      message: `Agreement ${agreement.agreementId} is active. Your first payment is due on ${new Date(agreement.dueDate).toLocaleDateString()}.`,
      data: { agreementId: agreement._id },
      channels: { email: true, sms: true },
    });
  }

  await agreement.save();
  sendSuccess(res, {
    message: "Agreement signed.",
    data: { status: agreement.status },
  });
});

// ── Generate Remote Verification Link ─────────────────────────────────────────
exports.generateRemoteVerificationLink = catchAsync(async (req, res, next) => {
  const agreement = await loadAgreement(req.params.id);
  if (!agreement) return next(new AppError("Agreement not found.", 404));

  if (String(agreement.creditor.user) !== String(req.user._id)) {
    return next(
      new AppError(
        "Only the creditor can generate the verification link.",
        403,
      ),
    );
  }
  if (agreement.verificationMode !== "remote") {
    return next(
      new AppError("This agreement uses in-person verification.", 400),
    );
  }

  const token = generateUrlSafeToken(32);
  const link = `${process.env.VERIFICATION_PORTAL_URL || process.env.CLIENT_URL}/verify/${token}`;

  agreement.remoteVerification.verificationToken = hashToken(token);
  agreement.remoteVerification.verificationLink = link;
  agreement.remoteVerification.linkExpiry = new Date(
    Date.now() +
      parseInt(process.env.OTP_LINK_EXPIRE_HOURS || 24) * 60 * 60 * 1000,
  );
  await agreement.save();

  // Email & SMS debtor the link
  const debtor = await User.findById(agreement.debtor.user);
  await emailService.sendRemoteVerificationLink(debtor, agreement, link);

  sendSuccess(res, {
    message: "Verification link sent to debtor.",
    data: {
      link,
      expiresAt: agreement.remoteVerification.linkExpiry,
      ...(process.env.NODE_ENV === "development" && { token }),
    },
  });
});

// ── Complete Remote Verification (debtor accesses link, uploads ID + selfie) ──
exports.completeRemoteVerification = catchAsync(async (req, res, next) => {
  const { token } = req.params;
  const { signature } = req.body;

  const hashedToken = hashToken(token);
  const agreement = await Agreement.findOne({
    "remoteVerification.verificationToken": hashedToken,
    "remoteVerification.linkExpiry": { $gt: new Date() },
    "remoteVerification.linkUsed": false,
  });

  if (!agreement) {
    return next(new AppError("Invalid or expired verification link.", 400));
  }

  if (!req.files?.idFront || !req.files?.selfie) {
    return next(new AppError("ID photo and selfie are required.", 400));
  }

  const cloudinaryService = require("../services/cloudinary.service");
  const faceMatchService = require("../services/faceMatch.service");

  // Upload photos
  const [idPhotoUrl, selfieUrl] = await Promise.all([
    cloudinaryService.uploadIdFront(
      req.files.idFront[0].buffer,
      `remote_${agreement._id}`,
    ),
    cloudinaryService.uploadSelfie(
      req.files.selfie[0].buffer,
      `remote_${agreement._id}`,
    ),
  ]);

  // Face matching
  const matchResult = await faceMatchService.compareFaces(
    idPhotoUrl,
    selfieUrl,
  );

  if (!matchResult.matched) {
    return next(
      new AppError(
        `Face verification failed (${matchResult.confidence}% match — 80% required). Please use a clearer photo.`,
        400,
      ),
    );
  }

  // Mark link used and store results
  agreement.remoteVerification.linkUsed = true;
  agreement.remoteVerification.debtorIdPhoto = idPhotoUrl;
  agreement.remoteVerification.debtorSelfie = selfieUrl;
  agreement.remoteVerification.faceMatchScore = matchResult.score;
  agreement.remoteVerification.faceMatchPassed = true;
  agreement.remoteVerification.verifiedAt = new Date();

  // Debtor signs
  agreement.debtor.signedAt = new Date();
  agreement.debtor.signature = signature;
  agreement.debtor.ipAddress = req.ip;
  agreement.status = "pending_signatures";
  agreement.statusHistory.push({
    status: "pending_signatures",
    changedBy: agreement.debtor.user,
    reason: "Remote verification complete — debtor signed",
  });

  await agreement.save();

  const io = req.app.get("io");
  await notificationService.createNotification(io, {
    recipientId: agreement.creditor.user,
    type: "verification_complete",
    title: "Debtor Verified — Please Sign",
    message: `${agreement.debtor.name} has completed verification for agreement ${agreement.agreementId}. Please sign to activate.`,
    data: { agreementId: agreement._id },
    channels: { email: true, sms: true },
  });

  sendSuccess(res, {
    message: "Identity verified. Agreement is awaiting creditor signature.",
    data: { faceMatchScore: matchResult.score, status: agreement.status },
  });
});

// ── Mark Agreement as Defaulted ───────────────────────────────────────────────
exports.markAsDefaulted = catchAsync(async (req, res, next) => {
  const agreement = await loadAgreement(req.params.id);
  if (!agreement) return next(new AppError("Agreement not found.", 404));

  if (String(agreement.creditor.user) !== String(req.user._id)) {
    return next(
      new AppError(
        "Only the creditor can mark an agreement as defaulted.",
        403,
      ),
    );
  }
  if (agreement.status !== "active") {
    return next(
      new AppError("Only active agreements can be marked as defaulted.", 400),
    );
  }

  agreement.status = "defaulted";
  agreement.defaultedAt = new Date();
  agreement.isPubliclyVisible = true;
  agreement.statusHistory.push({
    status: "defaulted",
    changedBy: req.user._id,
    reason: req.body.reason || "Marked as defaulted by creditor",
  });
  await agreement.save();

  // Update debtor stats and potentially list as defaulter
  await User.findByIdAndUpdate(agreement.debtor.user, {
    $inc: { "stats.defaultedAgreements": 1 },
    isDefaulter: true,
    defaulterListedAt: new Date(),
  });

  const io = req.app.get("io");
  const [creditor, debtor] = await Promise.all([
    User.findById(agreement.creditor.user),
    User.findById(agreement.debtor.user),
  ]);

  // Recalculate debtor trust score
  const scoreResult = await trustScoreService.updateUserTrustScore(
    agreement.debtor.user,
    "Agreement defaulted",
  );
  notificationService.emitTrustScoreUpdate(
    io,
    agreement.debtor.user,
    scoreResult,
  );

  await notificationService.createNotification(io, {
    recipientId: agreement.debtor.user,
    type: "agreement_defaulted",
    title: "⚠️ Agreement Marked as Defaulted",
    message: `Agreement ${agreement.agreementId} has been marked as defaulted. Your trust score has been affected.`,
    data: { agreementId: agreement._id },
    priority: "urgent",
    channels: { email: true, sms: true },
  });

  try {
    await emailService.sendDefaulterListingEmail(debtor, agreement);
  } catch {}

  sendSuccess(res, {
    message: "Agreement marked as defaulted.",
    data: agreement,
  });
});

// ── Cancel Agreement ──────────────────────────────────────────────────────────
exports.cancelAgreement = catchAsync(async (req, res, next) => {
  const agreement = await loadAgreement(req.params.id);
  if (!agreement) return next(new AppError("Agreement not found.", 404));

  const isCreditor = String(agreement.creditor.user) === String(req.user._id);
  if (!isCreditor && req.user.role !== "admin") {
    return next(
      new AppError("Only the creditor or admin can cancel an agreement.", 403),
    );
  }
  if (!["draft", "pending_debtor_verification"].includes(agreement.status)) {
    return next(
      new AppError("Only draft or pending agreements can be cancelled.", 400),
    );
  }

  agreement.status = "cancelled";
  agreement.statusHistory.push({
    status: "cancelled",
    changedBy: req.user._id,
    reason: req.body.reason || "Cancelled",
  });
  await agreement.save();

  sendSuccess(res, { message: "Agreement cancelled.", data: agreement });
});

// ── Verify Agreement Hash (tamper check) ──────────────────────────────────────
exports.verifyAgreementIntegrity = catchAsync(async (req, res, next) => {
  const agreement = await loadAgreement(req.params.id);
  if (!agreement) return next(new AppError("Agreement not found.", 404));

  const recomputedHash = agreement.generateDocumentHash();
  const isIntact = recomputedHash === agreement.documentHash;

  sendSuccess(res, {
    data: {
      agreementId: agreement.agreementId,
      storedHash: agreement.documentHash,
      recomputedHash,
      isIntact,
      verifiedAt: new Date().toISOString(),
    },
  });
});

// ── Admin: Get All Agreements ─────────────────────────────────────────────────
exports.getAllAgreements = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const skip = (page - 1) * limit;
  const filter = {};
  if (status) filter.status = status;

  const [agreements, total] = await Promise.all([
    Agreement.find(filter)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 })
      .populate("creditor.user", "firstName lastName email")
      .populate("debtor.user", "firstName lastName email"),
    Agreement.countDocuments(filter),
  ]);

  sendPaginated(res, { data: agreements, total, page, limit });
});
