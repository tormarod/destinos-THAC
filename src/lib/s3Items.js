// src/lib/s3Items.js
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");

const DEFAULT_TTL = Number(process.env.ITEMS_CACHE_TTL_MS || 15 * 60 * 1000); // 15 min
const BUCKET = process.env.S3_BUCKET;
const PREFIX = (process.env.S3_PREFIX || "items/").replace(/^\/+|\/+$/g, "") + "/";

let s3 = null;
function getS3() {
  if (!s3) {
    s3 = new S3Client({ region: process.env.AWS_REGION });
  }
  return s3;
}

const cache = new Map(); // season -> { ts, items }

async function loadSeasonFromS3(season) {
  const Key = `${PREFIX}${season}.json`;
  const Bucket = BUCKET;
  const res = await getS3().send(new GetObjectCommand({ Bucket, Key }));
  const text = await res.Body.transformToString();
  const items = JSON.parse(text);
  if (!Array.isArray(items)) throw new Error(`S3 ${Key} is not an array`);
  return items;
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
  const items = await loadSeasonFromS3(key);
  cache.set(key, { ts: now, items });
  return items;
}

module.exports = { getItemsForSeason };
