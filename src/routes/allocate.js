const express = require("express");
const { allocate, allocateForUser } = require("../lib/allocate");
const { logIP } = require("../lib/ipLogger");
const DemandDrivenCacheManager = require("../lib/demandDrivenCache");

module.exports = function ({ ddb }) {
  const router = express.Router();
  
  // Initialize demand-driven cache manager for season data
  const cacheManager = new DemandDrivenCacheManager();
  
  // Items cache: load items once at server startup (not on every cache refresh)
  // This is separate from the demand-driven cache because items are static data
  const itemsCache = new Map(); // season -> items array
  const loadItemsForSeason = async (season) => {
    if (itemsCache.has(season)) {
      // Return cached items (loaded once at server startup)
      return itemsCache.get(season);
    }
    
    try {
      // Load items from local JSON file (2025.json, etc.)
      const { getItemsForSeason } = require("../lib/localItems");
      const items = await getItemsForSeason(season);
      itemsCache.set(season, items);
      console.log(`[ITEMS-CACHE] Loaded ${items.length} items for season ${season} (server startup)`);
      return items;
    } catch (e) {
      console.warn(`[ITEMS-CACHE] Could not load items for season ${season}:`, e.message);
      itemsCache.set(season, []);
      return [];
    }
  };

  // Preload items at server startup (only current year - same as frontend default)
  const preloadItems = async () => {
    try {
      const currentYear = new Date().getFullYear();
      
      // Preload only current year (matches frontend default selection)
      // This ensures items are available immediately when server starts
      await loadItemsForSeason(currentYear);
    } catch (error) {
      console.error(`[ITEMS-CACHE] Failed to preload items at server startup:`, error);
    }
  };

  // Start preloading immediately when this module loads
  preloadItems();
  
  // Implement the refresh function for the cache manager
  // This is called when demand-driven cache needs fresh data from DynamoDB
  cacheManager.refreshSeasonData = async function(season) {
    try {
      // Get all submissions for the season from DynamoDB
      const allSubmissions = ddb.enabled ? await ddb.fetchAllSubmissions(season) : [];
      
      // Get items from items cache (loaded once at server startup)
      const items = await loadItemsForSeason(season);
      
      // Create season data object with both submissions and items
      const seasonData = {
        submissions: allSubmissions,
        items: items,
        lastRefresh: Date.now()
      };
      
      // Store in demand-driven cache
      this.setCachedData(season, seasonData);
      console.log(`[DEMAND-CACHE] Season ${season} refreshed: ${allSubmissions.length} submissions, ${items.length} items`);
      
    } catch (error) {
      console.error(`[DEMAND-CACHE] Failed to refresh season ${season}:`, error);
      throw error;
    }
  };

  // Simple in-memory rate limiting to prevent abuse
  const userRequests = new Map(); // userId -> lastRequestTime
  const RATE_LIMIT_MS = parseInt(process.env.ALLOCATION_RATE_LIMIT_SECONDS || "30") * 1000; // Convert seconds to milliseconds

  // Legacy cache for real submissions above user queries (fallback when demand-driven cache misses)
  // Fake users are generated fresh each time, never cached
  const submissionsAboveCache = new Map(); // season+userOrder -> { realSubmissions, timestamp }
  const ALLOCATION_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache TTL

  // Invalidate allocation cache for a season (call after new submissions)
  // This ensures fresh data is fetched after any data changes
  function invalidateAllocationCache(season) {
    // Invalidate demand-driven cache (main cache)
    cacheManager.invalidateSeason(season);
    
    // Invalidate legacy cache (fallback cache)
    let invalidatedCount = 0;
    for (const [key, value] of submissionsAboveCache.entries()) {
      if (key.startsWith(`${season}+`)) {
        submissionsAboveCache.delete(key);
        invalidatedCount++;
      }
    }
    if (invalidatedCount > 0) {
      console.log(`[ALLOCATION-CACHE] INVALIDATED ${invalidatedCount} legacy cache entries for season ${season}`);
    }
    
    console.log(`[CACHE-INVALIDATION] Season ${season} cache invalidated (demand-driven + legacy)`);
  }

  // Get submissions above a specific user order (using demand-driven cache + legacy cache for user-specific queries)
  // This function implements a two-tier caching strategy for optimal performance
  async function getSubmissionsAboveUser(season, userOrder, scenario = 0) {
    if (!ddb.enabled) return [];
    
    // First, try to get from demand-driven cache (full season data)
    const seasonData = cacheManager.getCachedData(season);
    let realSubsAbove;
    
    if (seasonData && seasonData.submissions) {
      // Use cached season data and filter for submissions above user order
      // This is the most efficient path - no DynamoDB call needed
      realSubsAbove = seasonData.submissions.filter(s => s.order < userOrder);
      console.log(`[DEMAND-CACHE] Using cached season data for user order ${userOrder}: ${realSubsAbove.length} submissions above`);
    } else {
      // Fallback to legacy cache for user-specific queries when demand-driven cache misses
      const cacheKey = `${season}+${userOrder}`;
      const cached = submissionsAboveCache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < ALLOCATION_CACHE_TTL_MS) {
        // Legacy cache hit - use cached real submissions
        console.log(`[LEGACY-CACHE] HIT for real submissions: season ${season}, user order ${userOrder} (${cached.realSubmissions.length} real submissions)`);
        realSubsAbove = cached.realSubmissions;
      } else {
        // Legacy cache miss - fetch real submissions from DynamoDB using GSI
        console.log(`[LEGACY-CACHE] MISS for real submissions: season ${season}, user order ${userOrder} - fetching from DynamoDB`);
        realSubsAbove = await ddb.fetchSubmissionsAboveUser(season, userOrder);
        
        // Cache only the real submissions (not fake users)
        submissionsAboveCache.set(cacheKey, {
          realSubmissions: realSubsAbove,
          timestamp: Date.now()
        });
        
        // Clean up old cache entries (keep only last 100 entries to prevent memory leaks)
        if (submissionsAboveCache.size > 100) {
          const oldestKey = submissionsAboveCache.keys().next().value;
          submissionsAboveCache.delete(oldestKey);
          console.log(`[LEGACY-CACHE] Cleaned up old cache entry: ${oldestKey}`);
        }
        
        console.log(`[LEGACY-CACHE] CACHED ${realSubsAbove.length} real submissions for season ${season}, user order ${userOrder}`);
      }
    }
    
    // Generate fresh fake users if scenario 1 (always fresh, never cached)
    // This ensures realistic simulation data that changes each time
    if (scenario === 1) {
      const { generateFakeSubmissions } = require("../lib/allocate");
      const finalSubmissions = generateFakeSubmissions(realSubsAbove, userOrder);
      const fakeCount = finalSubmissions.length - realSubsAbove.length;
      console.log(`[FAKE-USERS] Generated ${fakeCount} fresh fake users for scenario 1 (total: ${finalSubmissions.length} submissions)`);
      return finalSubmissions;
    }
    
    // Return real submissions for other scenarios (0, 2, 3)
    return realSubsAbove;
  }

  // Rate limiting middleware to prevent abuse of allocation endpoint
  function rateLimit(req, res, next) {
    const userId = req.body && req.body.userId;

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

  // SECURE: User-specific allocation endpoint
  // This endpoint provides allocation results for a specific user only
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

      // Mark season as active in demand-driven cache (triggers refresh if needed)
      cacheManager.markSeasonActive(season);

      // Check if we need to refresh the season cache (demand-driven logic)
      if (cacheManager.needsRefresh(season)) {
        await cacheManager.refreshSeasonData(season);
      }

      // Get current user's submission (try from cache first, then DynamoDB as fallback)
      let currentUserSubmission = null;
      const seasonData = cacheManager.getCachedData(season);
      
      if (seasonData && seasonData.submissions) {
        // Find user in cached submissions (most efficient path)
        currentUserSubmission = seasonData.submissions.find(s => s.id === userId);
        if (currentUserSubmission) {
          console.log(`[DEMAND-CACHE] Found user ${userId} in cached submissions (order: ${currentUserSubmission.order})`);
        }
      }
      
      // Fallback to DynamoDB if not found in cache (should be rare)
      if (!currentUserSubmission && ddb.enabled) {
        console.log(`[DEMAND-CACHE] User ${userId} not found in cache, fetching from DynamoDB`);
        currentUserSubmission = await ddb.fetchUserSubmission(season, userId);
      }

      if (!currentUserSubmission) {
        logIP(req, "ALLOCATE_NOT_FOUND", { userId, season, competitionDepth });
        return res.status(404).json({ error: "User not found in submissions" });
      }

      // Get submissions above current user (using demand-driven cache + legacy cache)
      const subsAbove = await getSubmissionsAboveUser(season, currentUserSubmission.order, scenario);
      
      // For position display, count only real submissions (not fake users)
      // This ensures accurate queue position for the user
      const realUsersAboveCount = subsAbove.filter(s => !s.isFake).length;
      
      // Get items data (from items cache - loaded once at server startup)
      const items = await loadItemsForSeason(season);
      
      // Perform allocation for this specific user
      const userAllocation = allocateForUser(subsAbove, currentUserSubmission, scenario, items, blockedItems, competitionDepth);

      // Log successful allocation request for monitoring
      logIP(req, "ALLOCATE_SUCCESS", {
        userId,
        userName: userAllocation.name,
        order: userAllocation.order,
        season,
        scenario,
        assignedCount: userAllocation.assignedItemIds.length,
        availableCount: userAllocation.availableByPreference.length
      });

      // Return only the user's own data (no other users' information for security)
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
  // This endpoint returns allocation results for ALL users (admin use only)
  router.post("/allocate-admin", async (req, res) => {
    try {
      // Add admin authentication here if needed
      const season = String(
        (req.body && req.body.season) || new Date().getFullYear(),
      );
      const scenario = parseInt(req.body && req.body.scenario) || 0;
      const competitionDepth = parseInt(req.body && req.body.competitionDepth) || 1;
      
      // Fetch all submissions directly from DynamoDB (bypasses caching for admin)
      const subs = ddb.enabled ? await ddb.fetchAllSubmissions(season) : [];
      
      // Get items data (from items cache - loaded once at server startup)
      const items = await loadItemsForSeason(season);
      
      // Perform full allocation for all users
      const allocation = allocate(subs, scenario, items, competitionDepth);
      
      // Log admin allocation request for monitoring
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

  // Cache statistics endpoint for monitoring
  // Provides detailed cache performance metrics and status
  router.get("/cache-stats", (req, res) => {
    try {
      const stats = cacheManager.getStats();
      const cacheStatus = cacheManager.getCacheStatus();
      
      res.json({
        stats: stats,
        cacheStatus: cacheStatus,
        timestamp: new Date().toISOString()
      });
    } catch (e) {
      console.error("[/api/cache-stats] error:", e);
      res.status(500).json({ error: "Failed to get cache stats" });
    }
  });

  // Export cache invalidation function and cache manager for use by other routes
  // This allows other routes (submit, reset) to invalidate cache when data changes
  router.invalidateAllocationCache = invalidateAllocationCache;
  router.cacheManager = cacheManager;
  
  return router;
};
