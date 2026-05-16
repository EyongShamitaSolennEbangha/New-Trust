const jwt = require('jsonwebtoken');
const logger = require('./logger');

const socketHandler = (io) => {
  // Auth middleware for socket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication error'));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id} (user: ${socket.userId})`);

    // Join user's private room
    socket.join(`user:${socket.userId}`);

    // Join agreement room for real-time payment tracking
    socket.on('join:agreement', (agreementId) => {
      socket.join(`agreement:${agreementId}`);
      logger.info(`User ${socket.userId} joined agreement room: ${agreementId}`);
    });

    socket.on('leave:agreement', (agreementId) => {
      socket.leave(`agreement:${agreementId}`);
    });

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });
};

// Emit helpers (used by controllers)
const emitToUser = (io, userId, event, data) => {
  io.to(`user:${userId}`).emit(event, data);
};

const emitToAgreement = (io, agreementId, event, data) => {
  io.to(`agreement:${agreementId}`).emit(event, data);
};

module.exports = socketHandler;
module.exports.emitToUser = emitToUser;
module.exports.emitToAgreement = emitToAgreement;
