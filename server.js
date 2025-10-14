// server.js
require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");

const { createDdb } = require("./src/lib/ddb"); // season-aware v2 helper
const { getItemsForSeason } = require("./src/lib/localItems");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const ID_FIELD = process.env.ID_FIELD || "Vacante";
const ALLOCATION_RATE_LIMIT_SECONDS = process.env.ALLOCATION_RATE_LIMIT_SECONDS || "30";

const { requireEnv } = require("./src/lib/requireEnv");

requireEnv([
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "DDB_TABLE",
]);

const app = express();

// --- core middleware (must be BEFORE routes) ---
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false }));

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

// serve static
app.use(express.static(PUBLIC_DIR));

// tiny API logger to confirm route hits & payloads
app.use("/api", (req, _res, next) => {
  console.log(`[api] ${req.method} ${req.path} body=`, req.body);
  next();
});

// (optional) quick probe to diagnose routing; remove after things work
// app.post("/api/reset-user/_probe", (req, res) => res.json({ ok: true, got: req.body }));

// --- DynamoDB client ---
const ddb = createDdb({
  region: process.env.AWS_REGION,
  tableName: process.env.DDB_TABLE, // e.g. thac-submissions-v2
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

// --- Mount routes (NOTE: each require(...) is CALLED with deps) ---
app.use(
  "/api",
  require("./src/routes/state")({ ddb, idField: ID_FIELD, getItemsForSeason }),
);
app.use("/api", require("./src/routes/orders")({ ddb }));

// Create allocate router first to get cache invalidation function
const allocateRouter = require("./src/routes/allocate")({ ddb });
app.use("/api", allocateRouter); // POST /allocate

// Pass cache invalidation function to routes that modify data
app.use("/api", require("./src/routes/submit")({ ddb, invalidateAllocationCache: allocateRouter.invalidateAllocationCache })); // POST /submit
app.use("/api", require("./src/routes/resetUser")({ ddb, invalidateAllocationCache: allocateRouter.invalidateAllocationCache })); // POST /reset-user
app.use("/api", require("./src/routes/resetUserAll")({ ddb, invalidateAllocationCache: allocateRouter.invalidateAllocationCache })); // POST /reset-user-all

// Configuration endpoint
app.get("/api/config", (req, res) => {
  res.json({
    allocationRateLimitSeconds: parseInt(ALLOCATION_RATE_LIMIT_SECONDS)
  });
});

// (optional) catch-all for SPA front-end—ensure this is AFTER /api routes
// app.get("*", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
