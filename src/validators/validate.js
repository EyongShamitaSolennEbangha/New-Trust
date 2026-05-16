const { validationResult } = require('express-validator');
const AppError = require('../utils/AppError');

/**
 * Run after express-validator rules.
 * Collects all validation errors and sends a 400 if any exist.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const messages = errors.array().map((e) => e.msg).join('. ');
    return next(new AppError(messages, 400));
  }
  next();
};

module.exports = validate;
