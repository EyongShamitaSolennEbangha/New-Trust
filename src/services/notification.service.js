const Notification = require('../models/Notification.model');
const emailService = require('./email.service');
const smsService = require('./sms.service');
const { emitToUser } = require('../config/socket');
const logger = require('../config/logger');

/**
 * Create an in-app notification and optionally push via email/SMS.
 */
exports.createNotification = async (
  io,
  { recipientId, type, title, message, data = null, channels = {}, priority = 'normal' }
) => {
  try {
    const notification = await Notification.create({
      recipient: recipientId,
      type,
      title,
      message,
      data,
      channels: {
        inApp: true,
        email: channels.email || false,
        sms: channels.sms || false,
      },
      priority,
    });

    // Push real-time in-app notification via Socket.IO
    if (io) {
      emitToUser(io, String(recipientId), 'notification:new', {
        id: notification._id,
        type,
        title,
        message,
        data,
        priority,
        createdAt: notification.createdAt,
      });
    }

    return notification;
  } catch (err) {
    logger.error(`Notification create error: ${err.message}`);
  }
};

/**
 * Mark notifications as read.
 */
exports.markAsRead = async (userId, notificationIds = null) => {
  const filter = { recipient: userId };
  if (notificationIds?.length) filter._id = { $in: notificationIds };
  else filter.isRead = false;

  await Notification.updateMany(filter, { isRead: true, readAt: new Date() });
};

/**
 * Get unread count for a user.
 */
exports.getUnreadCount = async (userId) => {
  return Notification.countDocuments({ recipient: userId, isRead: false });
};

/**
 * Emit real-time trust score update via Socket.IO
 */
exports.emitTrustScoreUpdate = (io, userId, scoreData) => {
  if (!io) return;
  emitToUser(io, String(userId), 'trustScore:updated', scoreData);
};

/**
 * Emit payment update to an agreement room
 */
exports.emitPaymentUpdate = (io, agreementId, paymentData) => {
  if (!io) return;
  const { emitToAgreement } = require('../config/socket');
  emitToAgreement(io, String(agreementId), 'payment:new', paymentData);
};

/**
 * Emit agreement status change to room
 */
exports.emitAgreementStatusChange = (io, agreementId, statusData) => {
  if (!io) return;
  const { emitToAgreement } = require('../config/socket');
  emitToAgreement(io, String(agreementId), 'agreement:statusChanged', statusData);
};
