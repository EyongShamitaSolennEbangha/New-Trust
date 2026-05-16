const cron = require('node-cron');
const Agreement = require('../models/Agreement.model');
const User = require('../models/User.model');
const emailService = require('../services/email.service');
const smsService = require('../services/sms.service');
const trustScoreService = require('../services/trustScore.service');
const logger = require('../config/logger');

/**
 * Register all cron jobs.
 * Call this from server.js after DB connects.
 */
const registerCronJobs = () => {

  // ── Payment Reminders — runs every day at 08:00 ──────────────────────────
  cron.schedule('0 8 * * *', async () => {
    logger.info('CRON: Running payment reminders...');
    try {
      const now = new Date();
      const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      const in1Day = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);

      // Agreements due in exactly 3 days or 1 day
      const upcomingAgreements = await Agreement.find({
        status: 'active',
        dueDate: {
          $gte: new Date(now.toDateString()),
          $lte: in3Days,
        },
      }).populate('debtor.user creditor.user');

      for (const agreement of upcomingAgreements) {
        const daysUntilDue = Math.ceil(
          (new Date(agreement.dueDate) - now) / (1000 * 60 * 60 * 24)
        );
        const debtor = agreement.debtor.user;
        if (!debtor?.email) continue;

        if (daysUntilDue <= 1 || daysUntilDue === 3) {
          try {
            await emailService.sendPaymentReminderEmail(debtor, agreement, daysUntilDue);
            if (debtor.notificationPreferences?.sms) {
              await smsService.sendPaymentReminderSMS(
                debtor.phone,
                debtor.firstName,
                agreement.agreementId,
                agreement.remainingBalance,
                agreement.currency
              );
            }
          } catch (err) {
            logger.error(`Reminder failed for agreement ${agreement.agreementId}: ${err.message}`);
          }
        }
      }
      logger.info(`CRON: Payment reminders sent for ${upcomingAgreements.length} agreements`);
    } catch (err) {
      logger.error(`CRON payment reminders error: ${err.message}`);
    }
  });

  // ── Auto-flag Overdue Agreements — runs every day at midnight ────────────
  cron.schedule('0 0 * * *', async () => {
    logger.info('CRON: Checking overdue agreements...');
    try {
      const overdueAgreements = await Agreement.find({
        status: 'active',
        dueDate: { $lt: new Date() },
      });

      for (const agreement of overdueAgreements) {
        // Only auto-default if more than 30 days overdue
        const daysOverdue = Math.floor(
          (Date.now() - new Date(agreement.dueDate)) / (1000 * 60 * 60 * 24)
        );

        if (daysOverdue > 30) {
          agreement.status = 'defaulted';
          agreement.defaultedAt = new Date();
          agreement.isPubliclyVisible = true;
          agreement.statusHistory.push({
            status: 'defaulted',
            reason: `Auto-defaulted: ${daysOverdue} days overdue`,
            changedAt: new Date(),
          });
          await agreement.save();

          await User.findByIdAndUpdate(agreement.debtor.user, {
            $inc: { 'stats.defaultedAgreements': 1 },
            isDefaulter: true,
            defaulterListedAt: new Date(),
          });

          // Recalculate debtor trust score
          await trustScoreService.updateUserTrustScore(
            agreement.debtor.user,
            'Auto-defaulted after 30 days overdue'
          );

          logger.warn(`CRON: Auto-defaulted agreement ${agreement.agreementId}`);
        }
      }
    } catch (err) {
      logger.error(`CRON overdue check error: ${err.message}`);
    }
  });

  // ── Expire Unused Remote Verification Links — runs every hour ─────────────
  cron.schedule('0 * * * *', async () => {
    try {
      await Agreement.updateMany(
        {
          'remoteVerification.linkExpiry': { $lt: new Date() },
          'remoteVerification.linkUsed': false,
          status: 'pending_debtor_verification',
        },
        { status: 'expired' }
      );
    } catch (err) {
      logger.error(`CRON link expiry error: ${err.message}`);
    }
  });

  // ── Nightly Trust Score Recalculation — runs at 02:00 ────────────────────
  cron.schedule('0 2 * * *', async () => {
    logger.info('CRON: Nightly trust score recalculation...');
    try {
      // Only recalculate for active users with recent activity
      const recentUsers = await User.find({
        accountStatus: 'active',
        'behaviorMetrics.lastActivityAt': {
          $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // active in last 30 days
        },
      }).select('_id');

      let count = 0;
      for (const user of recentUsers) {
        try {
          await trustScoreService.updateUserTrustScore(user._id, 'Nightly recalculation');
          count++;
        } catch (err) {
          logger.error(`Trust score recalc failed for ${user._id}: ${err.message}`);
        }
      }
      logger.info(`CRON: Recalculated trust scores for ${count} users`);
    } catch (err) {
      logger.error(`CRON trust score recalc error: ${err.message}`);
    }
  });

  logger.info('Cron jobs registered: payment reminders, overdue checks, link expiry, trust scores');
};

module.exports = registerCronJobs;
