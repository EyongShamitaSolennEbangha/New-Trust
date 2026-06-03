// ════════════════════════════════════════════════════════════
// auth.routes.js
// ════════════════════════════════════════════════════════════
const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const { protect } = require("../middleware/auth.middleware");
const { body } = require("express-validator");
const validate = require("../validators/validate");
const {
  auth,
  saveFCMToken,
  userTokens,
  normalizePhone,
} = require("../utils/firebase");

const registerRules = [
  body("firstName").trim().notEmpty().withMessage("First name is required"),
  body("lastName").trim().notEmpty().withMessage("Last name is required"),
  body("email").isEmail().withMessage("Valid email required").normalizeEmail(),
  body("phone")
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage("Valid phone number required"),
  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters"),
];

const loginRules = [
  body("email").isEmail().normalizeEmail(),
  body("password").notEmpty(),
];

router.post("/register", registerRules, validate, authController.register);
router.post("/login", loginRules, validate, authController.login);
router.post("/logout", protect, authController.logout);
router.post("/refresh-token", authController.refreshToken);
router.get("/verify-email/:token", authController.verifyEmail);
router.post(
  "/resend-verification",
  protect,
  authController.resendEmailVerification,
);
router.post("/send-phone-otp", protect, authController.sendPhoneOTP);
router.post("/verify-phone-otp", protect, authController.verifyPhoneOTP);
router.post("/forgot-password", authController.forgotPassword);
router.patch("/reset-password/:token", authController.resetPassword);
router.patch("/change-password", protect, authController.changePassword);
router.get("/me", protect, authController.getMe);

// POST /api/auth/verify-identity – called after OTP verification
router.post("/verify-identity", async (req, res) => {
  const { idToken, phoneNumber } = req.body;
  try {
    const decoded = await auth.verifyIdToken(idToken);
    if (decoded.phone_number !== phoneNumber)
      return res.status(400).json({ error: "Phone mismatch" });
    // Mark user as verified in your DB (optional)
    res.json({ success: true });
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
});

// POST /api/auth/save-fcm-token – store token after verification
// POST /api/auth/save-fcm-token – store token after verification

router.post("/save-fcm-token", async (req, res) => {
  const { fcmToken, phoneNumber } = req.body;
  if (!fcmToken || !phoneNumber) {
    return res.status(400).json({ error: "Missing data" });
  }
  const normalizedPhone = normalizePhone(phoneNumber);
  console.log("save-fcm-token received", {
    phoneNumber: normalizedPhone,
    tokenLength: fcmToken.length,
  });
  try {
    await saveFCMToken(normalizedPhone, fcmToken);
    res.json({ success: true });
  } catch (err) {
    console.error("Failed to save FCM token:", err);
    res.status(500).json({ error: "Unable to save FCM token" });
  }
});
// In your backend routes (e.g., routes/auth.js)
router.get("/debug/tokens", (req, res) => {
  const tokens = Array.from(userTokens.entries());
  res.json({ count: tokens.length, tokens });
});

module.exports = router;
