// ════════════════════════════════════════════════════
// notification.routes.js
// ════════════════════════════════════════════════════
const express = require('express');
const notifRouter = express.Router();
const {
  getMyNotifications,
  markNotificationsRead,
  getUnreadCount,
  deleteNotification,
} = require('../controllers/misc.controllers');
const { protect } = require('../middleware/auth.middleware');

notifRouter.use(protect);
notifRouter.get('/', getMyNotifications);
notifRouter.get('/unread-count', getUnreadCount);
notifRouter.patch('/mark-read', markNotificationsRead);
notifRouter.delete('/:id', deleteNotification);

module.exports = notifRouter;
