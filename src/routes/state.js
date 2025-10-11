const express = require("express");

module.exports = function ({ ddb, idField, getItemsForSeason }) {
  const router = express.Router();

  router.get("/state", async (req, res) => {
    const season = String(req.query.season || new Date().getFullYear());
    const userId = req.query.userId;
    
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
      // Otherwise, return all submissions (for admin/backward compatibility)
      let submissions = [];
      if (ddb.enabled) {
        if (userId && typeof userId === 'string') {
          // User-specific: only return their own submission
          const allSubmissions = await ddb.fetchAllSubmissions(season);
          const userSubmission = allSubmissions.find(s => s.id === userId);
          submissions = userSubmission ? [userSubmission] : [];
        } else {
          // Admin/backward compatibility: return all submissions
          submissions = await ddb.fetchAllSubmissions(season);
        }
      }
      
      res.json({ items, submissions, idField, season, notFound });
    } catch (e) {
      console.error("[/api/state] error:", e);
      res.status(500).json({ error: "Failed to load state" });
    }
  });

  // New endpoint: get allocation data without exposing user details
  router.get("/allocation-data", async (req, res) => {
    const season = String(req.query.season || new Date().getFullYear());
    
    try {
      if (!ddb.enabled) {
        return res.json({ submissions: [] });
      }

      // Fetch all submissions but anonymize them for allocation purposes
      const allSubmissions = await ddb.fetchAllSubmissions(season);
      
      // Return only the data needed for allocation (no names, just IDs and preferences)
      const anonymizedSubmissions = allSubmissions.map(sub => ({
        id: sub.id,
        order: sub.order,
        rankedItems: sub.rankedItems || [],
        submittedAt: sub.submittedAt
        // Note: intentionally omitting 'name' field
      }));
      
      res.json({ submissions: anonymizedSubmissions });
    } catch (e) {
      console.error("[/api/allocation-data] error:", e);
      res.status(500).json({ error: "Failed to load allocation data" });
    }
  });

  return router;
};
