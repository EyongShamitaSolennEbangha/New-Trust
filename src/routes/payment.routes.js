const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/payment.controller");
const { protect } = require("../middleware/auth.middleware");
const { uploadPaymentReceipt } = require("../middleware/upload.middleware");
const auditLog = require("../middleware/auditLog.middleware");
const { body } = require("express-validator");
const validate = require("../validators/validate");

const recordPaymentRules = [
  body("agreementId").isMongoId().withMessage("Valid agreement ID required"),
  body("amount")
    .isFloat({ min: 0.01 })
    .withMessage("Amount must be greater than 0"),
  body("paymentMethod")
    .isIn(["cash", "bank_transfer", "card", "mobile_money", "crypto", "other"])
    .withMessage("Invalid payment method"),
];

const stripePaymentRules = [
  body("agreementId").isMongoId().withMessage("Valid agreement ID required"),
  body("amount")
    .isFloat({ min: 0.01 })
    .withMessage("Amount must be greater than 0"),
];

const mobileMoneyRules = [
  body("agreementId").isMongoId().withMessage("Valid agreement ID required"),
  body("amount")
    .isFloat({ min: 0.01 })
    .withMessage("Amount must be greater than 0"),
  body("provider")
    .isIn(["mtn", "orange"])
    .withMessage("Unsupported mobile money provider"),
  body("phone").isMobilePhone("any").withMessage("Valid phone number required"),
];

router.use(protect);

// ── My Payments ───────────────────────────────────────────────────────────────
router.get("/", paymentController.getMyPayments);

// ── Stripe Payment Intent ────────────────────────────────────────────────────
router.post(
  "/stripe/create-intent",
  stripePaymentRules,
  validate,
  paymentController.createStripePaymentIntent,
);

// ── Mobile Money Payment Initiation ───────────────────────────────────────────
router.post(
  "/mobile-money/initiate",
  mobileMoneyRules,
  validate,
  paymentController.initiateMobileMoneyPayment,
);

// ── Record Payment ────────────────────────────────────────────────────────────
router.post(
  "/",
  uploadPaymentReceipt,
  recordPaymentRules,
  validate,
  auditLog("payment_recorded", "Payment"),
  paymentController.recordPayment,
);

// ── Agreement Payments ────────────────────────────────────────────────────────
router.get("/agreement/:agreementId", paymentController.getAgreementPayments);

router.get("/:id/status", paymentController.getPaymentStatus);

// ── Payment Actions ───────────────────────────────────────────────────────────
router.patch(
  "/:id/confirm",
  auditLog("payment_confirmed", "Payment"),
  paymentController.confirmPayment,
);
router.patch(
  "/:id/dispute",
  auditLog("payment_disputed", "Payment"),
  paymentController.disputePayment,
);

module.exports = router;
