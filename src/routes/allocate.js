const express = require("express");
const { allocate, allocateForUser } = require("../lib/allocate");
const { logIP } = require("../lib/ipLogger");
const DemandDrivenCacheManager = require("../lib/demandDrivenCache");
const { allocationRateLimiter } = require("../middleware/rateLimit");
const { loadItemsForSeason, preloadItems } = require("../services/itemsLoader");

module.exports = function ({ ddb }) {
  const router = express.Router();

  // Initialize demand-driven cache manager for season data
  const cacheManager = new DemandDrivenCacheManager();

  // Start preloading immediately when this module loads
  preloadItems();

  // Implement the refresh function for the cache manager
  // This is called when demand-driven cache needs fresh data from DynamoDB
  cacheManager.refreshSeasonData = async function (season) {
    try {
      // Get all submissions for the season from DynamoDB
      const allSubmissions = ddb.enabled
        ? await ddb.fetchAllSubmissions(season)
        : [];

      // Get items from items cache (loaded once at server startup)
      const items = await loadItemsForSeason(season);

      // Create season data object with both submissions and items
      const seasonData = {
        submissions: allSubmissions,
        items: items,
        lastRefresh: Date.now(),
      };

      // Store in demand-driven cache
      this.setCachedData(season, seasonData);
      console.log(
        `[DEMAND-CACHE] Season ${season} refreshed: ${allSubmissions.length} submissions, ${items.length} items`,
      );
    } catch (error) {
      console.error(
        `[DEMAND-CACHE] Failed to refresh season ${season}:`,
        error,
      );
      throw error;
    }
  };

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
      console.log(
        `[ALLOCATION-CACHE] INVALIDATED ${invalidatedCount} legacy cache entries for season ${season}`,
      );
    }

    console.log(
      `[CACHE-INVALIDATION] Season ${season} cache invalidated (demand-driven + legacy)`,
    );
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
      realSubsAbove = seasonData.submissions.filter((s) => s.order < userOrder);
      console.log(
        `[DEMAND-CACHE] Using cached season data for user order ${userOrder}: ${realSubsAbove.length} submissions above`,
      );
    } else {
      // Fallback to legacy cache for user-specific queries when demand-driven cache misses
      const cacheKey = `${season}+${userOrder}`;
      const cached = submissionsAboveCache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < ALLOCATION_CACHE_TTL_MS) {
        // Legacy cache hit - use cached real submissions
        console.log(
          `[LEGACY-CACHE] HIT for real submissions: season ${season}, user order ${userOrder} (${cached.realSubmissions.length} real submissions)`,
        );
        realSubsAbove = cached.realSubmissions;
      } else {
        // Legacy cache miss - fetch real submissions from DynamoDB using GSI
        console.log(
          `[LEGACY-CACHE] MISS for real submissions: season ${season}, user order ${userOrder} - fetching from DynamoDB`,
        );
        realSubsAbove = await ddb.fetchSubmissionsAboveUser(season, userOrder);

        // Cache only the real submissions (not fake users)
        submissionsAboveCache.set(cacheKey, {
          realSubmissions: realSubsAbove,
          timestamp: Date.now(),
        });

        // Clean up old cache entries (keep only last 100 entries to prevent memory leaks)
        if (submissionsAboveCache.size > 100) {
          const oldestKey = submissionsAboveCache.keys().next().value;
          submissionsAboveCache.delete(oldestKey);
          console.log(
            `[LEGACY-CACHE] Cleaned up old cache entry: ${oldestKey}`,
          );
        }

        console.log(
          `[LEGACY-CACHE] CACHED ${realSubsAbove.length} real submissions for season ${season}, user order ${userOrder}`,
        );
      }
    }

    // Generate fresh fake users if scenario 1 (always fresh, never cached)
    // This ensures realistic simulation data that changes each time
    if (scenario === 1) {
      const { generateFakeSubmissions } = require("../lib/fakeUsers");
      const finalSubmissions = generateFakeSubmissions(
        realSubsAbove,
        userOrder,
      );
      const fakeCount = finalSubmissions.length - realSubsAbove.length;
      console.log(
        `[FAKE-USERS] Generated ${fakeCount} fresh fake users for scenario 1 (total: ${finalSubmissions.length} submissions)`,
      );
      return finalSubmissions;
    }

    // Return real submissions for other scenarios (0, 2, 3)
    return realSubsAbove;
  }

  // SECURE: User-specific allocation endpoint
  // This endpoint provides allocation results for a specific user only
  router.post("/allocate", allocationRateLimiter, async (req, res) => {
    try {
      const season = String(
        (req.body && req.body.season) || new Date().getFullYear(),
      );
      const scenario = parseInt(req.body && req.body.scenario) || 0;
      const userId = req.body && req.body.userId;
      const blockedItems = (req.body && req.body.blockedItems) || {};
      const competitionDepth =
        parseInt(req.body && req.body.competitionDepth) || 1;

      if (!userId || typeof userId !== "string") {
        logIP(req, "ALLOCATE_FAILED", { reason: "missing_userId", season });
        return res.status(400).json({ error: "userId is required" });
      }

      // Mark season as active in demand-driven cache (triggers refresh if needed)
      cacheManager.markSeasonActive(season);

      // Refresh cache if needed (demand-driven caching)
      if (cacheManager.needsRefresh(season)) {
        await cacheManager.refreshSeasonData(season);
      }

      // Get current user's submission
      const seasonData = cacheManager.getCachedData(season);
      let currentUserSubmission;
      if (seasonData && seasonData.submissions) {
        // Try to find user in cached data first (most efficient)
        currentUserSubmission = seasonData.submissions.find(
          (s) => s.id === userId,
        );
      }

      // Fallback to DynamoDB if not found in cache
      if (!currentUserSubmission && ddb.enabled) {
        currentUserSubmission = await ddb.fetchUserSubmission(season, userId);
      }

      if (!currentUserSubmission) {
        logIP(req, "ALLOCATE_FAILED", { reason: "user_not_found", userId, season });
        return res.status(404).json({ error: "User not found" });
      }

      // Get submissions above current user (using demand-driven cache + legacy cache for user-specific queries)
      const subsAbove = await getSubmissionsAboveUser(
        season,
        currentUserSubmission.order,
        scenario,
      );

      // Get items from items cache (loaded once at server startup)
      const items = await loadItemsForSeason(season);

      // Run allocation for the specific user
      const allocationResult = allocateForUser(
        subsAbove,
        currentUserSubmission,
        scenario,
        items,
        blockedItems,
        competitionDepth,
      );

      // Count real users above (excluding fake users for position display)
      const realUsersAboveCount = subsAbove.filter((s) => !s.isFake).length;

      logIP(req, "ALLOCATE_SUCCESS", {
        userId,
        userName: currentUserSubmission.name,
        season,
        scenario,
        userOrder: currentUserSubmission.order,
        usersAboveCount: realUsersAboveCount,
      });

      res.json({
        allocation: [allocationResult],
        season,
        scenario,
        usersAboveCount: realUsersAboveCount,
      });
    } catch (error) {
      console.error("Allocation error:", error);
      logIP(req, "ALLOCATE_ERROR", { error: error.message });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ADMIN: Full allocation endpoint (for debugging/admin purposes)
  // This endpoint processes all submissions and returns complete allocation results
  router.post("/allocate-admin", async (req, res) => {
    try {
      const season = String(
        (req.body && req.body.season) || new Date().getFullYear(),
      );
      const scenario = parseInt(req.body && req.body.scenario) || 0;
      const competitionDepth =
        parseInt(req.body && req.body.competitionDepth) || 1;

      // Get all submissions directly from DynamoDB (admin endpoint doesn't use caching)
      const allSubmissions = ddb.enabled
        ? await ddb.fetchAllSubmissions(season)
        : [];

      // Get items from items cache (loaded once at server startup)
      const items = await loadItemsForSeason(season);

      // Run full allocation
      const allocationResults = allocate(
        allSubmissions,
        scenario,
        items,
        competitionDepth,
      );

      logIP(req, "ALLOCATE_ADMIN_SUCCESS", {
        season,
        scenario,
        totalUsers: allSubmissions.length,
      });

      res.json({
        allocation: allocationResults,
        season,
        scenario,
        totalUsers: allSubmissions.length,
      });
    } catch (error) {
      console.error("Admin allocation error:", error);
      logIP(req, "ALLOCATE_ADMIN_ERROR", { error: error.message });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Cache statistics endpoint for monitoring
  router.get("/cache-stats", (req, res) => {
    try {
      const stats = cacheManager.getStats();
      const cacheStatus = cacheManager.getCacheStatus();

      res.json({
        stats,
        cacheStatus,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Cache stats error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Export functions for use by other routes
  router.invalidateAllocationCache = invalidateAllocationCache;
  router.cacheManager = cacheManager;

  return router;
};