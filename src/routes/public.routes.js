const express = require('express');
const router = express.Router();
const {
  searchDefaulters,
  verifyAgreementPublic,
  getUserPublicProfile,
} = require('../controllers/misc.controllers');
const rateLimit = require('express-rate-limit');

// Strict rate limiting on public portal — prevent scraping
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

router.use(publicLimiter);

// ── Public Search — No auth required ─────────────────────────────────────────
router.get('/defaulters', searchDefaulters);
router.get('/agreements/:agreementId/verify', verifyAgreementPublic);
router.get('/users/:id/profile', getUserPublicProfile);

// ── Platform health / info ────────────────────────────────────────────────────
router.get('/info', (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'TrustLedger',
      description: 'Verified Financial Agreement Ecosystem',
      version: '1.0.0',
      verificationPortal: process.env.VERIFICATION_PORTAL_URL,
    },
  });
});

module.exports = router;
