// src/lib/localItems.js
const fs = require("fs").promises;
const path = require("path");

const DEFAULT_TTL = Number(process.env.ITEMS_CACHE_TTL_MS || 15 * 60 * 1000); // 15 min

const cache = new Map(); // season -> { ts, items }

async function loadSeasonFromLocal(season) {
  const filePath = path.join(__dirname, "../../", `${season}.json`);

  try {
    const text = await fs.readFile(filePath, "utf8");
    const items = JSON.parse(text);
    if (!Array.isArray(items))
      throw new Error(`File ${season}.json is not an array`);
    return items;
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Season ${season} not found (file: ${season}.json)`);
    }
    throw error;
  }
}

/**
 * Returns items for a given season with TTL caching.
 */
async function getItemsForSeason(season) {
  const key = String(season);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.ts < DEFAULT_TTL) {
    return hit.items;
  }
  const items = await loadSeasonFromLocal(key);
  cache.set(key, { ts: now, items });
  return items;
}

module.exports = { getItemsForSeason };
