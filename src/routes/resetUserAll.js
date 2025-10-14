// src/routes/resetUserAll.js
const express = require("express");
const { logIP } = require("../lib/ipLogger");

module.exports = function ({ ddb, invalidateAllocationCache }) {
  const router = express.Router();

  router.post("/reset-user-all", async (req, res) => {
    try {
      const { userId } = req.body || {};
      if (!userId || typeof userId !== "string") {
        logIP(req, "RESET_USER_ALL_FAILED", { reason: "missing_userId" });
        return res.status(400).json({ error: "userId is required" });
      }
      if (!ddb.enabled) {
        logIP(req, "RESET_USER_ALL_FAILED", { reason: "ddb_disabled", userId });
        return res.status(503).json({ error: "DynamoDB not enabled" });
      }

      const removed = await ddb.deleteAllByUser(userId);
      
      // Invalidate allocation cache for all seasons since user was deleted across all seasons
      if (invalidateAllocationCache) {
        // Clear cache for common seasons (could be more sophisticated)
        const currentYear = new Date().getFullYear();
        for (let year = currentYear - 2; year <= currentYear + 2; year++) {
          invalidateAllocationCache(String(year));
        }
      }
      
      logIP(req, "RESET_USER_ALL_SUCCESS", { userId, removedCount: removed });
      return res.json({ ok: true, removed });
    } catch (e) {
      console.error("[/api/reset-user-all] error:", e);
      logIP(req, "RESET_USER_ALL_ERROR", { error: e.message, userId });
      res.status(500).json({ error: "Internal error" });
    }
  });

  return router;
};
