// routes/firebase.js (example)
const express = require('express');
const router = express.Router();
const { auth, userTokens } = require('../utils/firebase');

// Endpoint 1: Verify Firebase ID Token after OTP
router.post('/api/verify-firebase-token', async (req, res) => {
  const { idToken, phoneNumber } = req.body;
  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    if (decodedToken.phone_number !== phoneNumber) {
      return res.status(401).json({ error: 'Phone number mismatch' });
    }
    // Create your own session JWT or set cookie here
    res.json({ success: true, uid: decodedToken.uid });
  } catch (err) {
    console.error(err);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Endpoint 2: Save FCM token for a user
router.post('/api/save-fcm-token', (req, res) => {
  const { fcmToken, phoneNumber } = req.body;
  if (!fcmToken || !phoneNumber) {
    return res.status(400).json({ error: 'Missing token or phone' });
  }
  userTokens.set(phoneNumber, fcmToken);
  res.json({ success: true });
});

module.exports = router;