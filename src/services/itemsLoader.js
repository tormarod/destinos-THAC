// src/services/itemsLoader.js
// Items loading and caching service for destination catalogs

/**
 * Items cache: load items once at server startup (not on every cache refresh)
 * This is separate from the demand-driven cache because items are static data
 */
const itemsCache = new Map(); // season -> items array

/**
 * Load items for a specific season from local JSON files
 * Items are cached in memory and loaded only once per season
 */
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
    console.log(
      `[ITEMS-CACHE] Loaded ${items.length} items for season ${season} (server startup)`,
    );
    return items;
  } catch (e) {
    console.warn(
      `[ITEMS-CACHE] Could not load items for season ${season}:`,
      e.message,
    );
    itemsCache.set(season, []);
    return [];
  }
};

/**
 * Preload items at server startup (only current year - same as frontend default)
 * This ensures items are available immediately when server starts
 */
const preloadItems = async () => {
  try {
    const currentYear = new Date().getFullYear();

    // Preload only current year (matches frontend default selection)
    // This ensures items are available immediately when server starts
    await loadItemsForSeason(currentYear);
  } catch (error) {
    console.error(
      `[ITEMS-CACHE] Failed to preload items at server startup:`,
      error,
    );
  }
};

module.exports = {
  loadItemsForSeason,
  preloadItems,
  itemsCache,
};
