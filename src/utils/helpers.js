const crypto = require("crypto");

/**
 * Generate random delay between min and max (in milliseconds)
 */
const randomDelay = (min = 30000, max = 60000) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * Sleep/delay function
 */
const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Validate Facebook Group URL
 */
const isValidGroupUrl = (url) => {
  const groupUrlPattern =
    /^https?:\/\/(www\.)?(facebook|fb)\.com\/groups\/[\w.-]+\/?$/i;
  return groupUrlPattern.test(url);
};

/**
 * Extract Group ID from URL
 */
const extractGroupId = (url) => {
  const match = url.match(/\/groups\/([\w.-]+)/i);
  return match ? match[1] : null;
};

/**
 * Validate email
 */
const isValidEmail = (email) => {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(email);
};

/**
 * Format error response
 */
const formatError = (error) => {
  return {
    error: true,
    message: error.message || "An error occurred",
    ...(process.env.NODE_ENV === "development" && {
      stack: error.stack,
      details: error,
    }),
  };
};

/**
 * Pagination helper
 */
const paginate = (page = 1, limit = 10) => {
  const offset = (page - 1) * limit;
  return { limit, offset };
};

/**
 * Calculate success rate
 */
const calculateSuccessRate = (successCount, totalCount) => {
  if (totalCount === 0) return 0;
  return ((successCount / totalCount) * 100).toFixed(2);
};

/**
 * Encrypt
 */
const encrypt = (plainText) => {
  const secret =
    process.env.ENCRYPTION_SECRET || "change_me_dev_secret_32_bytes_minimum";
  const key = crypto.createHash("sha256").update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
};

/**
 * Decrypt
 */
const decrypt = (cipherTextB64) => {
  const buf = Buffer.from(cipherTextB64, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const secret =
    process.env.ENCRYPTION_SECRET || "change_me_dev_secret_32_bytes_minimum";
  const key = crypto.createHash("sha256").update(secret).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
};

module.exports = {
  randomDelay,
  sleep,
  isValidGroupUrl,
  extractGroupId,
  isValidEmail,
  formatError,
  paginate,
  calculateSuccessRate,
  encrypt,
  decrypt,
};
