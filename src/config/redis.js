const { createClient } = require('redis');
const logger = require('./logger');

let redisClient;

const connectRedis = async () => {
  try {
    redisClient = createClient({
      socket: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT) || 6379,
      },
      password: process.env.REDIS_PASSWORD || undefined,
    });

    redisClient.on('error', (err) => logger.error(`Redis error: ${err.message}`));
    redisClient.on('connect', () => logger.info('Redis connected'));

    await redisClient.connect();
  } catch (err) {
    logger.warn(`Redis connection failed: ${err.message}. Caching disabled.`);
    redisClient = null;
  }
};

const getRedis = () => redisClient;

// Helper: set with TTL
const setCache = async (key, value, ttlSeconds = 3600) => {
  if (!redisClient) return;
  try {
    await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch (err) {
    logger.error(`Redis setCache error: ${err.message}`);
  }
};

// Helper: get
const getCache = async (key) => {
  if (!redisClient) return null;
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    logger.error(`Redis getCache error: ${err.message}`);
    return null;
  }
};

// Helper: delete
const deleteCache = async (key) => {
  if (!redisClient) return;
  try {
    await redisClient.del(key);
  } catch (err) {
    logger.error(`Redis deleteCache error: ${err.message}`);
  }
};

// Helper: store OTP (short-lived)
const setOTP = async (key, otp, ttlSeconds = 600) => {
  return setCache(`otp:${key}`, { otp, createdAt: Date.now() }, ttlSeconds);
};

const getOTP = async (key) => {
  return getCache(`otp:${key}`);
};

const deleteOTP = async (key) => {
  return deleteCache(`otp:${key}`);
};

// Helper: session blacklist (for logout)
const blacklistToken = async (token, ttlSeconds = 604800) => {
  return setCache(`blacklist:${token}`, true, ttlSeconds);
};

const isTokenBlacklisted = async (token) => {
  const result = await getCache(`blacklist:${token}`);
  return !!result;
};

module.exports = {
  connectRedis,
  getRedis,
  setCache,
  getCache,
  deleteCache,
  setOTP,
  getOTP,
  deleteOTP,
  blacklistToken,
  isTokenBlacklisted,
};
