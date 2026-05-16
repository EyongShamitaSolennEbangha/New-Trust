const express = require('express');
const router = express.Router();
const {
  getDashboardStats,
  getAuditLogs,
  listDefaulter,
  removeDefaulter,
} = require('../controllers/misc.controllers');
const { protect, restrictTo } = require('../middleware/auth.middleware');
const auditLog = require('../middleware/auditLog.middleware');

// All admin routes require auth + admin role
router.use(protect, restrictTo('admin'));

router.get('/dashboard', getDashboardStats);
router.get('/audit-logs', getAuditLogs);
router.patch('/users/:id/list-defaulter', auditLog('defaulter_listed', 'User'), listDefaulter);
router.patch('/users/:id/remove-defaulter', auditLog('defaulter_removed', 'User'), removeDefaulter);

module.exports = router;
