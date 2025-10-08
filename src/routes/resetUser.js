const express = require("express");

module.exports = function ({ ddb }) {
  const router = express.Router();

  router.post("/reset-user", async (req, res) => {
    try {
      const { userId, season } = req.body || {};
      if (!userId || typeof userId !== "string") {
        return res.status(400).json({ error: "userId is required" });
      }
      const seasonStr = String(season || new Date().getFullYear());

      if (ddb.enabled) {
        await ddb.deleteSubmission(seasonStr, userId);
      }

      return res.json({ ok: true, removed: 1 });
    } catch (e) {
      console.error("[/api/reset-user] error:", e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  return router;
};
