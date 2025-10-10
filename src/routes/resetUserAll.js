// src/routes/resetUserAll.js
const express = require("express");

module.exports = function ({ ddb }) {
  const router = express.Router();

  router.post("/reset-user-all", async (req, res) => {
    try {
      const { userId } = req.body || {};
      if (!userId || typeof userId !== "string") {
        return res.status(400).json({ error: "userId is required" });
      }
      if (!ddb.enabled) {
        return res.status(503).json({ error: "DynamoDB not enabled" });
      }

      const removed = await ddb.deleteAllByUser(userId);
      return res.json({ ok: true, removed });
    } catch (e) {
      console.error("[/api/reset-user-all] error:", e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  return router;
};
