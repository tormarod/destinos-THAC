// server.js
// Main server entry point for the allocation system
require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");

const { createDdb } = require("./src/lib/ddb"); // season-aware v2 helper
const { getItemsForSeason } = require("./src/lib/localItems");

// Server configuration
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const ID_FIELD = process.env.ID_FIELD || "Vacante";
const ALLOCATION_RATE_LIMIT_SECONDS = process.env.ALLOCATION_RATE_LIMIT_SECONDS || "30";

const { requireEnv } = require("./src/lib/requireEnv");

// Ensure required environment variables are present
requireEnv([
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "DDB_TABLE",
]);

const app = express();

// --- core middleware (must be BEFORE routes) ---
app.use(cors()); // Enable CORS for cross-origin requests
app.use(express.json({ limit: "2mb" })); // Parse JSON bodies up to 2MB
app.use(express.urlencoded({ extended: false })); // Parse URL-encoded bodies

// Security headers to prevent data exposure
app.use((req, res, next) => {
  // Prevent caching of sensitive API responses
  if (req.path.startsWith("/api/")) {
    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      "Surrogate-Control": "no-store",
    });
  }
  next();
});

// serve static files from public directory
app.use(express.static(PUBLIC_DIR));

// API request logger for debugging and monitoring
app.use("/api", (req, _res, next) => {
  console.log(`[api] ${req.method} ${req.path} body=`, req.body);
  next();
});

// --- DynamoDB client initialization ---
const ddb = createDdb({
  region: process.env.AWS_REGION,
  tableName: process.env.DDB_TABLE, // e.g. thac-submissions-v2
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

// --- Mount routes (NOTE: each require(...) is CALLED with dependencies) ---
// Routes are mounted in dependency order - allocate router must be created first

// Basic routes (no cache dependencies)
app.use(
  "/api",
  require("./src/routes/state")({ ddb, idField: ID_FIELD, getItemsForSeason }),
);
app.use("/api", require("./src/routes/orders")({ ddb }));

// Create allocate router first to get cache invalidation function and cache manager
const allocateRouter = require("./src/routes/allocate")({ ddb });
app.use("/api", allocateRouter); // POST /allocate

// Routes that modify data - pass cache invalidation function and cache manager
// This ensures cache is invalidated when data changes
app.use("/api", require("./src/routes/submit")({ ddb, invalidateAllocationCache: allocateRouter.invalidateAllocationCache, cacheManager: allocateRouter.cacheManager })); // POST /submit
app.use("/api", require("./src/routes/resetUser")({ ddb, invalidateAllocationCache: allocateRouter.invalidateAllocationCache, cacheManager: allocateRouter.cacheManager })); // POST /reset-user
app.use("/api", require("./src/routes/resetUserAll")({ ddb, invalidateAllocationCache: allocateRouter.invalidateAllocationCache, cacheManager: allocateRouter.cacheManager })); // POST /reset-user-all

// Configuration endpoint for frontend
app.get("/api/config", (req, res) => {
  res.json({
    allocationRateLimitSeconds: parseInt(ALLOCATION_RATE_LIMIT_SECONDS)
  });
});

// (optional) catch-all for SPA front-end—ensure this is AFTER /api routes
// app.get("*", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
