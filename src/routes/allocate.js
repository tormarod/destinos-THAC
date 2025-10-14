const express = require("express");
const { allocate, allocateForUser } = require("../lib/allocate");
const { logIP } = require("../lib/ipLogger");

module.exports = function ({ ddb }) {
  const router = express.Router();

  // Simple in-memory rate limiting
  const userRequests = new Map(); // userId -> lastRequestTime
  const RATE_LIMIT_MS = parseInt(process.env.ALLOCATION_RATE_LIMIT_SECONDS || "30") * 1000; // Convert seconds to milliseconds

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
      const competitionDepth = parseInt(req.body && req.body.competitionDepth) || 3;

      if (!userId || typeof userId !== "string") {
        logIP(req, "ALLOCATE_FAILED", { reason: "missing_userId", season });
        return res.status(400).json({ error: "userId is required" });
      }

      // Optimized: get current user's submission and submissions above them
      const currentUserSubmission = ddb.enabled ? await ddb.fetchUserSubmission(season, userId) : null;

      if (!currentUserSubmission) {
        logIP(req, "ALLOCATE_NOT_FOUND", { userId, season, competitionDepth });
        return res.status(404).json({ error: "User not found in submissions" });
      }

      // Only fetch submissions above current user (much more efficient)
      const subsAbove = ddb.enabled ? await ddb.fetchSubmissionsAboveUser(season, currentUserSubmission.order) : [];
      
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
        usersAboveCount: subsAbove.length, // Number of users with higher priority (lower order number)
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
      const competitionDepth = parseInt(req.body && req.body.competitionDepth) || 3;
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

  return router;
};
