const express = require('express');
const router = express.Router();
const {
  createDispute,
  getMyDisputes,
  getDispute,
  addDisputeMessage,
  resolveDispute,
  getAllDisputes,
} = require('../controllers/misc.controllers');
const { protect, restrictTo } = require('../middleware/auth.middleware');
const { uploadDisputeEvidence } = require('../middleware/upload.middleware');
const auditLog = require('../middleware/auditLog.middleware');
const { body } = require('express-validator');
const validate = require('../validators/validate');

router.use(protect);

router.get('/', getMyDisputes);
router.get('/all', restrictTo('admin', 'moderator'), getAllDisputes);

router.post(
  '/',
  uploadDisputeEvidence,
  [
    body('agreementId').isMongoId().withMessage('Valid agreement ID required'),
    body('reason').notEmpty().withMessage('Dispute reason is required'),
    body('description').isLength({ min: 20 }).withMessage('Description must be at least 20 characters'),
  ],
  validate,
  auditLog('dispute_created', 'Dispute'),
  createDispute
);

router.get('/:id', getDispute);
router.post('/:id/messages', addDisputeMessage);
router.patch(
  '/:id/resolve',
  restrictTo('admin', 'moderator'),
  auditLog('dispute_resolved', 'Dispute'),
  resolveDispute
);

module.exports = router;
