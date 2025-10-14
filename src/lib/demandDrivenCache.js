// src/lib/demandDrivenCache.js
// Demand-driven caching system for allocation data

class DemandDrivenCacheManager {
  constructor() {
    // Cache for season data: season -> { data, lastRefresh, lastRequest, isActive, nextRefresh }
    // data: cached submissions and items for the season
    // lastRefresh: timestamp when data was last fetched from DynamoDB
    // lastRequest: timestamp when season was last marked as active
    // isActive: whether season is currently receiving user requests
    // nextRefresh: scheduled refresh time (not used in demand-driven mode)
    this.seasonCache = new Map();

    // Configuration - production timeouts
    // Cache expires after 15 minutes, and seasons become inactive after 15 minutes of no requests
    this.CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes cache TTL and inactivity threshold

    // Cache statistics for monitoring and debugging
    this.stats = {
      totalRequests: 0, // Total allocation requests received
      cacheHits: 0, // Requests served from cache
      cacheMisses: 0, // Requests requiring DynamoDB fetch
      inactiveSeasons: 0, // Seasons that became inactive
      activeSeasons: 0, // Currently active seasons
    };

    console.log(
      `[DEMAND-CACHE] Initialized with ${this.CACHE_TTL_MS / 1000}s TTL (demand-driven only)`,
    );
  }

  /**
   * Mark a season as active (user made a request)
   * This is the core of demand-driven caching - seasons only refresh when users are actively requesting
   */
  markSeasonActive(season) {
    const seasonStr = String(season);
    const cached = this.seasonCache.get(seasonStr);

    if (cached) {
      // Check if season was inactive (no requests for extended period)
      const timeSinceLastRequest = Date.now() - cached.lastRequest;
      const wasInactive =
        !cached.isActive || timeSinceLastRequest > this.CACHE_TTL_MS;

      if (wasInactive) {
        // Season was inactive - reactivate it and update lastRequest timestamp
        cached.lastRequest = Date.now();
        cached.isActive = true;
        console.log(
          `[DEMAND-CACHE] Season ${seasonStr} reactivated after being inactive (${Math.round(timeSinceLastRequest / 1000)}s since last request)`,
        );
      } else {
        // Season already active - just increment request count
        console.log(
          `[DEMAND-CACHE] Season ${seasonStr} already active (request #${(cached.activeCount || 0) + 1})`,
        );
      }

      cached.activeCount = (cached.activeCount || 0) + 1;
    } else {
      // Create new cache entry for this season
      this.seasonCache.set(seasonStr, {
        data: null, // No data cached yet
        lastRefresh: 0, // Never refreshed
        lastRequest: Date.now(), // First request now
        isActive: true, // Mark as active
        activeCount: 1, // First request
        nextRefresh: Date.now() + this.CACHE_TTL_MS, // Not used in demand-driven mode
      });

      console.log(
        `[DEMAND-CACHE] Season ${seasonStr} created and marked as active`,
      );
    }

    this.stats.totalRequests++;
  }

  /**
   * Check if season needs refresh (only if active and expired)
   * Key demand-driven logic: only refresh if season is both expired AND active
   */
  needsRefresh(season) {
    const seasonStr = String(season);
    const cached = this.seasonCache.get(seasonStr);

    if (!cached) {
      // No cache entry exists - needs initial data fetch
      console.log(
        `[DEMAND-CACHE] Season ${seasonStr} needs refresh - no cache entry`,
      );
      return true;
    }

    const isExpired = Date.now() - cached.lastRefresh > this.CACHE_TTL_MS;
    const isActive = cached.isActive;

    if (isExpired && isActive) {
      // Cache expired AND season is active - refresh now
      return true;
    }

    if (isExpired && !isActive) {
      // Cache expired but season is inactive - don't refresh until next user request
      console.log(
        `[DEMAND-CACHE] Season ${seasonStr} expired but inactive - will refresh on next request`,
      );
      return false;
    }

    // Cache is still fresh - no refresh needed
    return false;
  }

  /**
   * Get cached data for a season
   * Returns null if no data or if cache is expired (forces refresh)
   */
  getCachedData(season) {
    const seasonStr = String(season);
    const cached = this.seasonCache.get(seasonStr);

    if (!cached || !cached.data) {
      // No cache entry or no data - cache miss
      this.stats.cacheMisses++;
      return null;
    }

    const isExpired = Date.now() - cached.lastRefresh > this.CACHE_TTL_MS;
    if (isExpired) {
      // Cache expired - treat as miss to force refresh
      this.stats.cacheMisses++;
      return null;
    }

    // Cache hit - return cached data
    this.stats.cacheHits++;
    return cached.data;
  }

  /**
   * Set cached data for a season
   * Updates cache with fresh data from DynamoDB
   */
  setCachedData(season, data) {
    const seasonStr = String(season);
    const cached = this.seasonCache.get(seasonStr);

    if (cached) {
      // Update existing cache entry with fresh data
      cached.data = data;
      cached.lastRefresh = Date.now();
      cached.nextRefresh = Date.now() + this.CACHE_TTL_MS; // Not used in demand-driven mode
    } else {
      // Create new cache entry (shouldn't happen in normal flow)
      this.seasonCache.set(seasonStr, {
        data: data,
        lastRefresh: Date.now(),
        lastRequest: Date.now(),
        isActive: true,
        activeCount: 1,
        nextRefresh: Date.now() + this.CACHE_TTL_MS, // Not used in demand-driven mode
      });
    }
  }

  /**
   * Invalidate cache for a season (call after data changes)
   * Clears cached data to force fresh fetch on next request
   */
  invalidateSeason(season) {
    const seasonStr = String(season);
    const cached = this.seasonCache.get(seasonStr);

    if (cached) {
      // Clear cached data but keep the cache entry structure
      cached.data = null; // Clear the data
      cached.lastRefresh = 0; // Reset refresh timestamp
      cached.nextRefresh = Date.now() + this.CACHE_TTL_MS; // Not used in demand-driven mode
      cached.isActive = false; // Reset active status to force fresh refresh

      console.log(`[DEMAND-CACHE] Season ${seasonStr} cache invalidated and marked inactive`);
    }
  }

  /**
   * Refresh season data (to be implemented by the caller)
   * This is a placeholder - the actual implementation is provided by the allocation route
   */
  async refreshSeasonData(season) {
    // This will be implemented by the allocation route
    // The cache manager just tracks when refreshes are needed
    console.log(
      `[DEMAND-CACHE] Refresh requested for season ${season} (to be implemented by caller)`,
    );
  }

  /**
   * Get cache statistics for monitoring
   */
  getStats() {
    const activeSeasons = Array.from(this.seasonCache.values()).filter(
      (c) => c.isActive,
    ).length;
    this.stats.activeSeasons = activeSeasons;

    return {
      ...this.stats,
      totalCachedSeasons: this.seasonCache.size, // Total seasons with cache entries
      activeSeasons: activeSeasons, // Currently active seasons
      cacheHitRate:
        this.stats.totalRequests > 0
          ? ((this.stats.cacheHits / this.stats.totalRequests) * 100).toFixed(
              2,
            ) + "%"
          : "0%",
    };
  }

  /**
   * Get detailed cache status for debugging
   * Returns per-season cache information for monitoring
   */
  getCacheStatus() {
    const status = {};

    for (const [season, cache] of this.seasonCache.entries()) {
      const now = Date.now();
      const timeSinceRefresh = now - cache.lastRefresh;
      const timeSinceRequest = now - cache.lastRequest;

      status[season] = {
        isActive: cache.isActive, // Whether season is currently active
        hasData: !!cache.data, // Whether cached data exists
        timeSinceRefresh: Math.round(timeSinceRefresh / 1000) + "s", // Time since last DynamoDB fetch
        timeSinceRequest: Math.round(timeSinceRequest / 1000) + "s", // Time since last user request
        activeCount: cache.activeCount || 0, // Number of requests received
        needsRefresh: this.needsRefresh(season), // Whether cache needs refresh
      };
    }

    return status;
  }
}

module.exports = DemandDrivenCacheManager;
