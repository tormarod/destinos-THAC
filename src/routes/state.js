const express = require("express");
const { logIP } = require("../lib/ipLogger");

module.exports = function ({ ddb, idField, getItemsForSeason }) {
  const router = express.Router();

  router.get("/state", async (req, res) => {
    const season = String(req.query.season || new Date().getFullYear());
    const userId = req.query.userId;

    // Log access attempts for security monitoring
    if (userId && typeof userId === "string") {
      logIP(req, "STATE_ACCESS_USER", { userId, season });
    } else {
      logIP(req, "STATE_ACCESS_ALL", { season });
    }

    try {
      let items = [];
      let notFound = false;

      try {
        items = await getItemsForSeason(season);
      } catch (e) {
        const msg = String(e && (e.name || e.code || e.message || e));
        const status = e && e.$metadata && e.$metadata.httpStatusCode;
        if (
          msg.includes("NoSuchKey") ||
          msg.includes("NotFound") ||
          status === 404
        ) {
          items = [];
          notFound = true;
        } else {
          throw e;
        }
      }

      // If userId is provided, only return that user's submission
      // Otherwise, return NO submissions for security (no admin access without proper auth)
      // SECURITY WARNING: No authorization checks - anyone can access any user's data by providing userId
      let submissions = [];
      if (ddb.enabled) {
        if (userId && typeof userId === "string") {
          // User-specific: directly fetch only their submission (more efficient)
          // TODO: Add authorization check to ensure user can only access their own data
          const userSubmission = await ddb.fetchUserSubmission(season, userId);
          submissions = userSubmission ? [userSubmission] : [];
        } else {
          // SECURITY FIX: Return no submissions when no userId provided
          // This prevents unauthorized access to all user data
          submissions = [];
        }
      }

      res.json({ items, submissions, idField, season, notFound });
    } catch (e) {
      console.error("[/api/state] error:", e);
      res.status(500).json({ error: "Failed to load state" });
    }
  });

  return router;
};
