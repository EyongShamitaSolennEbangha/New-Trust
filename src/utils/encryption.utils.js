const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY || 'trustledger_default_key_32chars!!', 'utf8');

/**
 * Encrypt sensitive plaintext using AES-256-GCM.
 * Returns a colon-separated string: iv:authTag:ciphertext (all hex)
 */
const encrypt = (plaintext) => {
  if (!plaintext) return null;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(String(plaintext), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
};

/**
 * Decrypt an AES-256-GCM encrypted string.
 */
const decrypt = (encryptedString) => {
  if (!encryptedString) return null;
  try {
    const [ivHex, authTagHex, encrypted] = encryptedString.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return null;
  }
};

/**
 * Generate SHA-256 hash of any content string.
 * Used for agreement/document integrity checks.
 */
const hashContent = (content) =>
  crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex');

/**
 * Verify a document hash by re-hashing and comparing.
 */
const verifyHash = (content, storedHash) =>
  hashContent(content) === storedHash;

/**
 * Generate a cryptographically secure random token.
 * @param {number} bytes - default 32 (256-bit)
 */
const generateSecureToken = (bytes = 32) =>
  crypto.randomBytes(bytes).toString('hex');

/**
 * Generate a URL-safe token for verification links.
 */
const generateUrlSafeToken = (bytes = 32) => {
  const { randomBytes } = require('crypto');
  return randomBytes(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
};

/**
 * Hash a token for safe DB storage (one-way).
 */
const hashToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

module.exports = {
  encrypt,
  decrypt,
  hashContent,
  verifyHash,
  generateSecureToken,
  generateUrlSafeToken,
  hashToken,
};
