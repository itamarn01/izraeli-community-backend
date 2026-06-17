const rateLimit = require('express-rate-limit');

const isProd = process.env.NODE_ENV === 'production';

// Strict limiter for authentication-sensitive endpoints
// (login, OTP, password reset). Protects against brute force / credential
// stuffing and abuse of the email-sending endpoints.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProd ? 20 : 1000, // very permissive in dev so it never blocks local work
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'יותר מדי ניסיונות. נסו שוב בעוד מספר דקות.' },
});

// Broad limiter applied to the whole API as a safety net against scraping / DoS.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 1000 : 100000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'יותר מדי בקשות. נסו שוב מאוחר יותר.' },
});

module.exports = { authLimiter, apiLimiter };
