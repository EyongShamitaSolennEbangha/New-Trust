const express = require('express');
const router = express.Router();
const {
  getMyTrustScore,
  getTrustScoreBreakdown,
  getUserTrustScore,
  recalculateTrustScore,
  getTrustScoreHistory,
} = require('../controllers/misc.controllers');
const { protect } = require('../middleware/auth.middleware');

router.use(protect);

router.get('/me', getMyTrustScore);
router.get('/me/breakdown', getTrustScoreBreakdown);
router.get('/me/history', getTrustScoreHistory);
router.post('/me/recalculate', recalculateTrustScore);
router.get('/user/:id', getUserTrustScore);

module.exports = router;
