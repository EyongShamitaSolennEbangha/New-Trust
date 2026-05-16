const AuditLog = require('../models/AuditLog.model');
const logger = require('../config/logger');

/**
 * Factory: returns middleware that logs a specific action to the audit trail
 * Usage: router.post('/agreements', auditLog('agreement_created', 'Agreement'), controller)
 */
const auditLog = (action, targetModel = null) => {
  return async (req, res, next) => {
    // Store original json() to intercept response
    const originalJson = res.json.bind(res);

    res.json = async (body) => {
      // Only log successful actions
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          // Get last audit entry for hash chaining
          const lastEntry = await AuditLog.findOne().sort({ createdAt: -1 }).select('currentHash');

          await AuditLog.create({
            action,
            performedBy: req.user?._id || null,
            targetModel,
            targetId: body?.data?._id || body?.data?.id || req.params?.id || null,
            details: {
              method: req.method,
              url: req.originalUrl,
              body: sanitizeBody(req.body),
              responseStatus: res.statusCode,
            },
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent'),
            previousHash: lastEntry?.currentHash || '0',
          });
        } catch (err) {
          logger.error(`AuditLog error: ${err.message}`);
        }
      }
      return originalJson(body);
    };

    next();
  };
};

// Remove sensitive fields before logging
const sanitizeBody = (body) => {
  if (!body) return {};
  const sensitive = ['password', 'passwordConfirm', 'otpCode', 'token', 'secret', 'cardNumber'];
  const sanitized = { ...body };
  sensitive.forEach((field) => {
    if (sanitized[field]) sanitized[field] = '[REDACTED]';
  });
  return sanitized;
};

module.exports = auditLog;
