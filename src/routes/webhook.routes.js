const express = require("express");
const router = express.Router();
const logger = require("../config/logger");
const paymentController = require("../controllers/payment.controller");

/**
 * Stripe Webhook Handler
 * Raw body is required — this route must be mounted BEFORE express.json()
 * which is why we handle it in server.js with express.raw()
 */
router.post("/stripe", async (req, res) => {
  const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    logger.error(`Stripe webhook signature error: ${err.message}`);
    return res
      .status(400)
      .json({ success: false, message: `Webhook Error: ${err.message}` });
  }

  const Payment = require("../models/Payment.model");
  const Agreement = require("../models/Agreement.model");

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const intent = event.data.object;
        // Find pending payment by stripe intent ID and auto-confirm
        const payment = await Payment.findOne({
          stripePaymentIntentId: intent.id,
        });
        if (payment) {
          payment.status = "confirmed";
          payment.confirmedAt = new Date();
          await payment.save();

          const agreement = await Agreement.findById(payment.agreement);
          if (agreement) {
            agreement.remainingBalance = Math.max(
              0,
              agreement.remainingBalance - payment.amount,
            );
            agreement.lastPaymentAt = new Date();
            if (agreement.remainingBalance === 0) {
              agreement.status = "completed";
              agreement.completedAt = new Date();
            }
            await agreement.save();
          }
          logger.info(`Stripe payment confirmed: ${payment.paymentReference}`);
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const intent = event.data.object;
        const payment = await Payment.findOne({
          stripePaymentIntentId: intent.id,
        });
        if (payment) {
          payment.status = "failed";
          await payment.save();
          logger.warn(`Stripe payment failed: ${intent.id}`);
        }
        break;
      }

      case "charge.dispute.created": {
        logger.warn(`Stripe charge dispute: ${event.data.object.id}`);
        break;
      }

      default:
        logger.info(`Unhandled Stripe event: ${event.type}`);
    }

    res.json({ received: true });
  } catch (err) {
    logger.error(`Webhook processing error: ${err.message}`);
    res
      .status(500)
      .json({ success: false, message: "Webhook processing failed" });
  }
});

// ── Mobile Money Callback ─────────────────────────────────────────────────────
router.post("/mobile-money", paymentController.mobileMoneyCallback);

module.exports = router;
