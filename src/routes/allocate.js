const express = require("express");
const { allocate, allocateForUser } = require("../lib/allocate");
const { logIP } = require("../lib/ipLogger");

module.exports = function ({ ddb }) {
  const router = express.Router();

  // Simple in-memory rate limiting
  const userRequests = new Map(); // userId -> lastRequestTime
  const RATE_LIMIT_MS = parseInt(process.env.ALLOCATION_RATE_LIMIT_SECONDS || "30") * 1000; // Convert seconds to milliseconds

  // Cache for real submissions above user queries (fake users generated fresh each time)
  const submissionsAboveCache = new Map(); // season+userOrder -> { realSubmissions, timestamp }
  const ALLOCATION_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache TTL

  // Invalidate allocation cache for a season (call after new submissions)
  function invalidateAllocationCache(season) {
    let invalidatedCount = 0;
    for (const [key, value] of submissionsAboveCache.entries()) {
      if (key.startsWith(`${season}+`)) {
        submissionsAboveCache.delete(key);
        invalidatedCount++;
      }
    }
    if (invalidatedCount > 0) {
      console.log(`[ALLOCATION-CACHE] INVALIDATED ${invalidatedCount} real submission cache entries for season ${season}`);
    }
  }

  // Get submissions above a specific user order (cache real submissions, generate fresh fake users)
  async function getSubmissionsAboveUser(season, userOrder, scenario = 0) {
    if (!ddb.enabled) return [];
    
    const cacheKey = `${season}+${userOrder}`;
    let realSubsAbove;
    
    // Check cache for real submissions only
    const cached = submissionsAboveCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < ALLOCATION_CACHE_TTL_MS) {
      console.log(`[ALLOCATION-CACHE] HIT for real submissions: season ${season}, user order ${userOrder} (${cached.realSubmissions.length} real submissions)`);
      realSubsAbove = cached.realSubmissions;
    } else {
      // Cache miss - fetch real submissions from DynamoDB
      console.log(`[ALLOCATION-CACHE] MISS for real submissions: season ${season}, user order ${userOrder} - fetching from DynamoDB`);
      realSubsAbove = await ddb.fetchSubmissionsAboveUser(season, userOrder);
      
      // Cache only the real submissions
      submissionsAboveCache.set(cacheKey, {
        realSubmissions: realSubsAbove,
        timestamp: Date.now()
      });
      
      // Clean up old cache entries (keep only last 100 entries)
      if (submissionsAboveCache.size > 100) {
        const oldestKey = submissionsAboveCache.keys().next().value;
        submissionsAboveCache.delete(oldestKey);
        console.log(`[ALLOCATION-CACHE] Cleaned up old cache entry: ${oldestKey}`);
      }
      
      console.log(`[ALLOCATION-CACHE] CACHED ${realSubsAbove.length} real submissions for season ${season}, user order ${userOrder}`);
    }
    
    // Generate fresh fake users if scenario 1 (always fresh, never cached)
    if (scenario === 1) {
      const { generateFakeSubmissions } = require("../lib/allocate");
      const finalSubmissions = generateFakeSubmissions(realSubsAbove, userOrder);
      const fakeCount = finalSubmissions.length - realSubsAbove.length;
      console.log(`[FAKE-USERS] Generated ${fakeCount} fresh fake users for scenario 1 (total: ${finalSubmissions.length} submissions)`);
      return finalSubmissions;
    }
    
    // Return real submissions for other scenarios
    return realSubsAbove;
  }

  // Rate limiting middleware
  function rateLimit(req, res, next) {
    const userId = req.body && req.body.userId;

    if (!userId || typeof userId !== "string") {
      return next(); // Let other validation handle missing userId
    }

    const now = Date.now();
    const lastRequest = userRequests.get(userId);

    if (lastRequest && now - lastRequest < RATE_LIMIT_MS) {
      const remainingMs = RATE_LIMIT_MS - (now - lastRequest);
      const remainingSeconds = Math.ceil(remainingMs / 1000);

      return res.status(429).json({
        error: "Demasiadas solicitudes",
        message: `Debes esperar ${remainingSeconds} segundos antes de ejecutar otra asignación`,
        retryAfter: remainingSeconds,
      });
    }

    // Update last request time
    userRequests.set(userId, now);
    next();
  }

  // SECURE: User-specific allocation endpoint
  router.post("/allocate", rateLimit, async (req, res) => {
    try {
      const season = String(
        (req.body && req.body.season) || new Date().getFullYear(),
      );
      const scenario = parseInt(req.body && req.body.scenario) || 0;
      const userId = req.body && req.body.userId;
      const blockedItems = req.body && req.body.blockedItems || {};
      const competitionDepth = parseInt(req.body && req.body.competitionDepth) || 1;

      if (!userId || typeof userId !== "string") {
        logIP(req, "ALLOCATE_FAILED", { reason: "missing_userId", season });
        return res.status(400).json({ error: "userId is required" });
      }

      // Get current user's submission first
      const currentUserSubmission = ddb.enabled ? await ddb.fetchUserSubmission(season, userId) : null;

      if (!currentUserSubmission) {
        logIP(req, "ALLOCATE_NOT_FOUND", { userId, season, competitionDepth });
        return res.status(404).json({ error: "User not found in submissions" });
      }

      // Get submissions above current user (efficient GSI query with scenario-aware caching)
      const subsAbove = await getSubmissionsAboveUser(season, currentUserSubmission.order, scenario);
      
      // For position display, count only real submissions (not fake users)
      // This is already handled correctly by the caching system
      const realUsersAboveCount = subsAbove.filter(s => !s.isFake).length;
      
      // Get items data for centro-based scenarios
      let items = [];
      try {
        const { getItemsForSeason } = require("../lib/localItems");
        items = await getItemsForSeason(season);
      } catch (e) {
        console.warn("Could not load items for centro scenario:", e.message);
      }
      
      const userAllocation = allocateForUser(subsAbove, currentUserSubmission, scenario, items, blockedItems, competitionDepth);

      // Log successful allocation request
      logIP(req, "ALLOCATE_SUCCESS", {
        userId,
        userName: userAllocation.name,
        order: userAllocation.order,
        season,
        scenario,
        assignedCount: userAllocation.assignedItemIds.length,
        availableCount: userAllocation.availableByPreference.length
      });

      // Return only the user's own data (no other users' information)
      res.json({
        allocation: [userAllocation],
        season,
        scenario,
        usersAboveCount: realUsersAboveCount, // Number of REAL users with higher priority (not including fake users)
      });
    } catch (e) {
      console.error("[/api/allocate] error:", e);
      logIP(req, "ALLOCATE_ERROR", { error: e.message, userId, season });
      res.status(500).json({ error: "Allocation failed" });
    }
  });

  // ADMIN ONLY: Full allocation endpoint (for debugging/admin purposes)
  router.post("/allocate-admin", async (req, res) => {
    try {
      // Add admin authentication here if needed
      const season = String(
        (req.body && req.body.season) || new Date().getFullYear(),
      );
      const scenario = parseInt(req.body && req.body.scenario) || 0;
      const competitionDepth = parseInt(req.body && req.body.competitionDepth) || 1;
      const subs = ddb.enabled ? await ddb.fetchAllSubmissions(season) : [];
      
      // Get items data for centro-based scenarios
      let items = [];
      try {
        const { getItemsForSeason } = require("../lib/localItems");
        items = await getItemsForSeason(season);
      } catch (e) {
        console.warn("Could not load items for centro scenario:", e.message);
      }
      
      const allocation = allocate(subs, scenario, items, competitionDepth);
      
      // Log admin allocation request
      logIP(req, "ALLOCATE_ADMIN_SUCCESS", {
        season,
        scenario,
        totalUsers: allocation.length,
        adminRequest: true
      });
      
      res.json({ allocation, season, scenario });
    } catch (e) {
      console.error("[/api/allocate-admin] error:", e);
      logIP(req, "ALLOCATE_ADMIN_ERROR", { error: e.message, season });
      res.status(500).json({ error: "Allocation failed" });
    }
  });

  // Export cache invalidation function for use by other routes
  router.invalidateAllocationCache = invalidateAllocationCache;
  
  return router;
};
