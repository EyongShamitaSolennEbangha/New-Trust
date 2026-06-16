const User = require("../models/User.model");
const Agreement = require("../models/Agreement.model");
const Payment = require("../models/Payment.model");
const Dispute = require("../models/Dispute.model");
const { setCache, getCache, deleteCache } = require("../config/redis");
const logger = require("../config/logger");

/**
 * TrustLedger AI-Powered Trust Score Engine
 *
 * Scoring breakdown (final score 0–100):
 *  40% — Payment history (on-time payments, defaults, overdue frequency)
 *  30% — Agreement completion rate (completed vs defaulted/abandoned)
 *  20% — Behaviour patterns (login frequency, response time, dispute behaviour)
 *  10% — Community / platform feedback (dispute resolutions, peer feedback)
 * Plus identity verification bonus.
 */
exports.calculateTrustScore = async (userId) => {
  try {
    const cacheKey = `trustscore:${userId}`;
    let cached = await getCache(cacheKey);
    
    // Check if cached score is from the old 0–1000 scale (value > 100)
    if (cached && cached.total > 100) {
      // Invalidate stale cache
      await deleteCache(cacheKey);
      cached = null;
      logger.info(`Stale cache (old scale) invalidated for user ${userId}`);
    }
    
    if (cached) return cached;

    const user = await User.findById(userId);
    if (!user) return null;

    // ── 1. Payment History (max 40 points) ────────────────────────────────
    const payments = await Payment.find({
      paidBy: userId,
      status: "confirmed",
    });
    const totalPayments = payments.length;
    const onTimePayments = payments.filter((p) => p.isOnTime).length;
    const lateDays = payments.reduce((sum, p) => sum + (p.daysLate || 0), 0);

    const onTimeRate = totalPayments > 0 ? onTimePayments / totalPayments : 0.5;
    const avgLateness = totalPayments > 0 ? lateDays / totalPayments : 0;
    const latenessPenalty = Math.min(avgLateness * 2, 40);
    const paymentScoreRaw = onTimeRate * 40 - latenessPenalty;
    const paymentScore = Math.max(0, Math.min(40, Math.round(paymentScoreRaw)));

    // ── 2. Agreement Completion (max 30 points) ───────────────────────────
    const agreementsAsDebtor = await Agreement.find({
      "debtor.user": userId,
      status: { $in: ["completed", "defaulted", "cancelled"] },
    });
    const agreementsAsCreditor = await Agreement.find({
      "creditor.user": userId,
      status: { $in: ["completed", "defaulted", "cancelled"] },
    });

    const completed = [...agreementsAsDebtor, ...agreementsAsCreditor].filter(
      (a) => a.status === "completed"
    ).length;
    const defaulted = agreementsAsDebtor.filter(
      (a) => a.status === "defaulted"
    ).length;

    const total = agreementsAsDebtor.length + agreementsAsCreditor.length;
    const completionRate = total > 0 ? completed / total : 0.5;
    const defaultPenalty = defaulted * 5;
    const completionScoreRaw = completionRate * 30 - defaultPenalty;
    const completionScore = Math.max(0, Math.min(30, Math.round(completionScoreRaw)));

    // ── 3. Behaviour Patterns (max 20 points) ─────────────────────────────
    const metrics = user.behaviorMetrics || {};
    const responseScore = metrics.avgResponseTimeHours
      ? Math.max(0, 20 - metrics.avgResponseTimeHours * 1)
      : 10;
    const loginScore = Math.min((metrics.loginFrequencyPerWeek || 0) * 2, 10);
    const behaviourScore = Math.round(responseScore + loginScore);
    const behaviourScoreFinal = Math.max(0, Math.min(20, behaviourScore));

    // ── 4. Community / Disputes (max 10 points) ───────────────────────────
    const disputes = await Dispute.find({
      $or: [{ initiatedBy: userId }, { respondent: userId }],
    });
    const resolvedFavourably = disputes.filter(
      (d) =>
        (d.status === "resolved_creditor" &&
          String(d.initiatedBy) === String(userId)) ||
        (d.status === "resolved_debtor" &&
          String(d.respondent) === String(userId))
    ).length;
    const openDisputes = disputes.filter((d) => d.status === "open").length;
    const communityScoreRaw = resolvedFavourably * 2 - openDisputes * 1.5;
    const communityScore = Math.max(0, Math.min(10, Math.round(communityScoreRaw)));

    // ── Identity bonus ────────────────────────────────────────────────────
    const identityBonus = user.isIdentityVerified ? 5 : 0;

    // ── Final score (0–100) ───────────────────────────────────────────────
    const finalScore = Math.max(
      0,
      Math.min(
        100,
        paymentScore + completionScore + behaviourScoreFinal + communityScore + identityBonus
      )
    );

    const breakdown = {
      paymentHistory: paymentScore,
      agreementCompletion: completionScore,
      behaviourPatterns: behaviourScoreFinal,
      communityFeedback: communityScore,
      identityBonus,
      total: finalScore,
    };

    await setCache(cacheKey, breakdown, 3600);
    logger.info(`Trust score calculated for ${userId}: ${finalScore}`);
    return breakdown;
  } catch (err) {
    logger.error(`Trust score calculation error for ${userId}: ${err.message}`);
    return null;
  }
};

/**
 * Persist updated trust score to User document.
 * If the stored score is > 100 (old scale), it will be overwritten automatically.
 */
exports.updateUserTrustScore = async (
  userId,
  reason = "Periodic recalculation"
) => {
  const breakdown = await exports.calculateTrustScore(userId);
  if (!breakdown) return;

  const user = await User.findById(userId);
  // Force update if old score is present (score > 100)
  const needsFix = user && user.trustScore?.score > 100;

  const level = getTrustLevel(breakdown.total);

  await User.findByIdAndUpdate(userId, {
    "trustScore.score": breakdown.total,
    "trustScore.level": level,
    "trustScore.lastCalculated": new Date(),
    $push: {
      "trustScore.history": {
        $each: [{ score: breakdown.total, reason }],
        $slice: -50,
      },
    },
  });

  if (needsFix) {
    logger.info(`Fixed old trust score for user ${userId} (was ${user.trustScore.score} → now ${breakdown.total})`);
  }

  return { score: breakdown.total, level, breakdown };
};

const getTrustLevel = (score) => {
  if (score < 40) return "Poor";
  if (score < 60) return "Fair";
  if (score < 75) return "Good";
  if (score < 90) return "Excellent";
  return "Perfect";
};

exports.getTrustLevel = getTrustLevel;