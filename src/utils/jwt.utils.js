const jwt = require('jsonwebtoken');

const signAccessToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });

const signRefreshToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d',
  });

const verifyRefreshToken = (token) =>
  jwt.verify(token, process.env.JWT_REFRESH_SECRET);

/**
 * Send JWT tokens in response.
 * @param {object} user - Mongoose User document
 * @param {number} statusCode
 * @param {object} res
 * @param {string} [message]
 */
const sendTokenResponse = (user, statusCode, res, message = 'Success') => {
  const accessToken = signAccessToken(user._id);
  const refreshToken = signRefreshToken(user._id);

  // Remove sensitive fields
  user.password = undefined;
  user.passwordResetToken = undefined;
  user.twoFactorSecret = undefined;

  res.status(statusCode).json({
    success: true,
    message,
    data: {
      accessToken,
      refreshToken,
      user,
    },
  });
};

module.exports = { signAccessToken, signRefreshToken, verifyRefreshToken, sendTokenResponse };
