// src/middleware/rateLimit.js
// Rate limiting middleware for allocation requests

/**
 * Simple in-memory rate limiting to prevent abuse
 * Tracks user requests and enforces cooldown periods
 */
const userRequests = new Map(); // userId -> lastRequestTime
const RATE_LIMIT_MS =
  parseInt(process.env.ALLOCATION_RATE_LIMIT_SECONDS || "30") * 1000; // Convert seconds to milliseconds

/**
 * Rate limiting middleware for allocation requests
 * Prevents users from making too many allocation requests in a short time
 */
function allocationRateLimiter(req, res, next) {
  const { userId } = req.body;

  if (!userId || typeof userId !== "string") {
    return next(); // Let other validation handle missing userId
  }

  const now = Date.now();
  const lastRequest = userRequests.get(userId);

  if (lastRequest && now - lastRequest < RATE_LIMIT_MS) {
    // User is rate limited - calculate remaining time
    const remainingMs = RATE_LIMIT_MS - (now - lastRequest);
    const remainingSeconds = Math.ceil(remainingMs / 1000);

    return res.status(429).json({
      error: "Demasiadas solicitudes",
      message: `Debes esperar ${remainingSeconds} segundos antes de ejecutar otra asignación`,
      retryAfter: remainingSeconds,
    });
  }

  // Update last request time for this user
  userRequests.set(userId, now);
  next();
}

module.exports = {
  allocationRateLimiter,
};
