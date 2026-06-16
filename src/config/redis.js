const { createClient } = require('redis');
const logger = require('./logger');

// ---------- In‑memory fallback cache ----------
class MemoryCache {
  constructor() {
    this.store = new Map();
  }

  async get(key) {
    const item = this.store.get(key);
    if (!item) return null;
    if (Date.now() > item.expiry) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key, value, ttlSeconds = 3600) {
    const expiry = Date.now() + ttlSeconds * 1000;
    this.store.set(key, { value, expiry });
  }

  async del(key) {
    this.store.delete(key);
  }
}

let redisClient = null;
let useMemoryFallback = false;

const connectRedis = async () => {
  // If no Redis credentials, immediately use memory
  if (!process.env.REDIS_HOST && !process.env.REDIS_URL) {
    logger.warn('No Redis credentials provided – using in‑memory cache.');
    useMemoryFallback = true;
    redisClient = new MemoryCache();
    return;
  }

  try {
    // Prefer REDIS_URL if set (e.g. on Render), else fallback to host/port
    const config = process.env.REDIS_URL
      ? { url: process.env.REDIS_URL }
      : {
          socket: {
            host: process.env.REDIS_HOST || '127.0.0.1',
            port: parseInt(process.env.REDIS_PORT) || 6379,
          },
          password: process.env.REDIS_PASSWORD || undefined,
        };

    redisClient = createClient(config);

    // Only log the first error, then switch to memory
    let errorLogged = false;
    redisClient.on('error', (err) => {
      if (!errorLogged) {
        logger.error(`Redis connection failed: ${err.message}. Switching to memory cache.`);
        errorLogged = true;
      }
      // Replace the client with memory fallback so further operations work
      if (!useMemoryFallback) {
        useMemoryFallback = true;
        redisClient = new MemoryCache();
      }
    });

    redisClient.on('connect', () => {
      logger.info('✅ Redis connected');
      // If we were previously in fallback, switch back to real Redis
      if (useMemoryFallback) {
        useMemoryFallback = false;
        // But we already have a real client – no need to change
      }
    });

    await redisClient.connect();
  } catch (err) {
    logger.error(`Redis init error: ${err.message}. Using memory cache.`);
    useMemoryFallback = true;
    redisClient = new MemoryCache();
  }
};

const getRedis = () => redisClient;

// ---------- Helper functions (unchanged, but now work with memory) ----------
const setCache = async (key, value, ttlSeconds = 3600) => {
  if (!redisClient) return;
  try {
    await redisClient.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch (err) {
    logger.error(`Redis setCache error: ${err.message}`);
  }
};

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

const deleteCache = async (key) => {
  if (!redisClient) return;
  try {
    await redisClient.del(key);
  } catch (err) {
    logger.error(`Redis deleteCache error: ${err.message}`);
  }
};

const setOTP = async (key, otp, ttlSeconds = 600) => {
  return setCache(`otp:${key}`, { otp, createdAt: Date.now() }, ttlSeconds);
};

const getOTP = async (key) => {
  return getCache(`otp:${key}`);
};

const deleteOTP = async (key) => {
  return deleteCache(`otp:${key}`);
};

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
