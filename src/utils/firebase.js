const admin = require('firebase-admin');
const serviceAccount = require('../service-account-key.json');
const { getCache, setCache } = require('../config/redis');
const logger = require('../config/logger');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const auth = admin.auth();
const messaging = admin.messaging();

// In-memory fallback for when Redis is unavailable
const userTokens = new Map();

function normalizePhone(phone) {
  let cleaned = String(phone).replace(/\s/g, '');
  if (!cleaned.startsWith('+')) cleaned = '+' + cleaned;
  return cleaned;
}

async function saveFCMToken(phone, token) {
  const key = `fcm:${normalizePhone(phone)}`;
  try {
    if (setCache) {
      await setCache(key, token, 60 * 60 * 24 * 30); // 30 days
      logger.info(`✅ Token stored in Redis for ${normalizePhone(phone)}`);
    } else {
      throw new Error('setCache not available');
    }
  } catch (err) {
    // Fallback to memory
    userTokens.set(normalizePhone(phone), token);
    logger.warn(`Redis save failed, using memory: ${err.message}`);
  }
}

async function getFCMToken(phone) {
  const key = `fcm:${normalizePhone(phone)}`;
  try {
    if (getCache) {
      const token = await getCache(key);
      if (token) return token;
    } else {
      throw new Error('getCache not available');
    }
  } catch (err) {
    logger.warn(`Redis get failed, trying memory: ${err.message}`);
  }
  // Fallback to memory
  return userTokens.get(normalizePhone(phone)) || null;
}

module.exports = { admin, auth, messaging, saveFCMToken, getFCMToken, normalizePhone };