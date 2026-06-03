const User = require("../models/User.model");
const Agreement = require("../models/Agreement.model");
const Payment = require("../models/Payment.model");
const Dispute = require("../models/Dispute.model");
const { setCache, getCache } = require("../config/redis");
const logger = require("../config/logger");

/**
 * TrustLedger AI-Powered Trust Score Engine
 *
 * Scoring breakdown (0–1000):
 *  40% — Payment history (on-time payments, defaults, overdue frequency)
 *  30% — Agreement completion rate (completed vs defaulted/abandoned)
 *  20% — Behaviour patterns (login frequency, response time, dispute behaviour)
 *  10% — Community / platform feedback (dispute resolutions, peer feedback)
 */
exports.calculateTrustScore = async (userId) => {
  try {
    const cacheKey = `trustscore:${userId}`;
    const cached = await getCache(cacheKey);
    if (cached) return cached;

    const user = await User.findById(userId);
    if (!user) return null;

    // ── 1. Payment History (40 pts max = 400) ─────────────────────────────────
    const payments = await Payment.find({
      paidBy: userId,
      status: "confirmed",
    });
    const totalPayments = payments.length;
    const onTimePayments = payments.filter((p) => p.isOnTime).length;
    const lateDays = payments.reduce((sum, p) => sum + (p.daysLate || 0), 0);

    const onTimeRate = totalPayments > 0 ? onTimePayments / totalPayments : 0.5;
    const avgLateness = totalPayments > 0 ? lateDays / totalPayments : 0;
    const latenesspenalty = Math.min(avgLateness * 2, 100);
    const paymentScore = Math.round(onTimeRate * 400 - latenesspenalty);

    // ── 2. Agreement Completion (30 pts max = 300) ─────────────────────────────
    // For a given user, only count agreements where they are the debtor for default penalty
    const agreementsAsDebtor = await Agreement.find({
      "debtor.user": userId,
      status: { $in: ["completed", "defaulted", "cancelled"] },
    });
    const agreementsAsCreditor = await Agreement.find({
      "creditor.user": userId,
      status: { $in: ["completed", "defaulted", "cancelled"] },
    });

    const completed = [...agreementsAsDebtor, ...agreementsAsCreditor].filter(
      (a) => a.status === "completed",
    ).length;
    const defaulted = agreementsAsDebtor.filter(
      (a) => a.status === "defaulted",
    ).length; // only debtor's defaults hurt them

    const total = agreementsAsDebtor.length + agreementsAsCreditor.length;
    const completionRate = total > 0 ? completed / total : 0.5;
    const defaultPenalty = defaulted * 50;
    const completionScore = Math.round(completionRate * 300 - defaultPenalty);

    // ── 3. Behaviour Patterns (20 pts max = 200) ──────────────────────────────
    const metrics = user.behaviorMetrics || {};
    const responseScore = metrics.avgResponseTimeHours
      ? Math.max(0, 100 - metrics.avgResponseTimeHours * 5)
      : 50;
    const loginScore = Math.min((metrics.loginFrequencyPerWeek || 0) * 10, 100);
    const behaviourScore = Math.round(responseScore + loginScore);

    // ── 4. Community / Disputes (10 pts max = 100) ────────────────────────────
    const disputes = await Dispute.find({
      $or: [{ initiatedBy: userId }, { respondent: userId }],
    });
    const resolvedFavourably = disputes.filter(
      (d) =>
        (d.status === "resolved_creditor" &&
          String(d.initiatedBy) === String(userId)) ||
        (d.status === "resolved_debtor" &&
          String(d.respondent) === String(userId)),
    ).length;
    const openDisputes = disputes.filter((d) => d.status === "open").length;
    const communityScore = Math.max(
      0,
      Math.round(resolvedFavourably * 20 - openDisputes * 15),
    );

    // ── Identity bonus ─────────────────────────────────────────────────────────
    const identityBonus = user.isIdentityVerified ? 50 : 0;

    // ── Final score (scale 0–1000, then compress to 0–100) ────────────────────────
    const rawScore =
      paymentScore +
      completionScore +
      behaviourScore +
      communityScore +
      identityBonus;
    const normalizedScore = Math.max(0, Math.min(1000, rawScore));
    const finalScore = Math.round(normalizedScore / 10); // 0–100

    const breakdown = {
      paymentHistory: Math.max(0, paymentScore),
      agreementCompletion: Math.max(0, completionScore),
      behaviourPatterns: Math.max(0, behaviourScore),
      communityFeedback: Math.max(0, communityScore),
      identityBonus,
      totalRaw: normalizedScore,
      total: finalScore,
    };

    // Cache for 1 hour
    await setCache(cacheKey, breakdown, 3600);

    logger.info(`Trust score calculated for ${userId}: ${finalScore}`);
    return breakdown;
    // Cache for 1 hour
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
 */
exports.updateUserTrustScore = async (
  userId,
  reason = "Periodic recalculation",
) => {
  const breakdown = await exports.calculateTrustScore(userId);
  if (!breakdown) return;

  const level = getTrustLevel(breakdown.total);

  await User.findByIdAndUpdate(userId, {
    "trustScore.score": breakdown.total,
    "trustScore.level": level,
    "trustScore.lastCalculated": new Date(),
    $push: {
      "trustScore.history": {
        $each: [{ score: breakdown.total, reason }],
        $slice: -50, // keep last 50 entries
      },
    },
  });

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
