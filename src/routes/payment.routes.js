const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/payment.controller");
const { protect, restrictTo } = require("../middleware/auth.middleware");
const { uploadPaymentReceipt } = require("../middleware/upload.middleware");
const auditLog = require("../middleware/auditLog.middleware");
const { body } = require("express-validator");
const validate = require("../validators/validate");

// Validation rules
const recordPaymentRules = [
  body("agreementId").isMongoId().withMessage("Valid agreement ID required"),
  body("amount").isFloat({ min: 0.01 }).withMessage("Amount must be greater than 0"),
  body("paymentMethod")
    .isIn(["cash", "bank_transfer", "card", "mobile_money", "crypto", "other"])
    .withMessage("Invalid payment method"),
];

const stripePaymentRules = [
  body("agreementId").isMongoId().withMessage("Valid agreement ID required"),
  body("amount").isFloat({ min: 0.01 }).withMessage("Amount must be greater than 0"),
];

const mobileMoneyRules = [
  body("agreementId").isMongoId().withMessage("Valid agreement ID required"),
  body("amount").isFloat({ min: 0.01 }).withMessage("Amount must be greater than 0"),
  body("provider").isIn(["mtn", "orange"]).withMessage("Unsupported mobile money provider"),
  body("phone").isMobilePhone("any").withMessage("Valid phone number required"),
];

// All payment routes require authentication
router.use(protect);

// ── My Payments ───────────────────────────────────────────────────────────────
router.get("/", paymentController.getMyPayments);
router.get("/agreement/:agreementId", paymentController.getAgreementPayments);
router.get("/:id/status", paymentController.getPaymentStatus);

// ── Stripe Payment Intent ────────────────────────────────────────────────────
router.post(
  "/stripe/intent",           // matches frontend call (PaymentSection)
  stripePaymentRules,
  validate,
  paymentController.createStripePaymentIntent
);

// ── Mobile Money Payment Initiation (CamPay) ─────────────────────────────────
router.post(
  "/mobile-money/initiate",
  mobileMoneyRules,
  validate,
  paymentController.initiateMobileMoneyPayment
);
router.post(
  "/mobile-money/callback",
  paymentController.mobileMoneyCallback
);

// ── Record Payment (manual, e.g., cash or bank transfer) ─────────────────────
router.post(
  "/",
  uploadPaymentReceipt,
  recordPaymentRules,
  validate,
  auditLog("payment_recorded", "Payment"),
  paymentController.recordPayment
);

// ── Payment Actions (confirm, dispute) ───────────────────────────────────────
router.patch(
  "/:id/confirm",
  auditLog("payment_confirmed", "Payment"),
  paymentController.confirmPayment
);
router.patch(
  "/:id/dispute",
  auditLog("payment_disputed", "Payment"),
  paymentController.disputePayment
);

// ── Disbursement to Creditor (admin only) ────────────────────────────────────
router.post(
  "/disburse",
  protect,
  restrictTo("admin"),
  paymentController.disburseToCreditor
);

module.exports = router;