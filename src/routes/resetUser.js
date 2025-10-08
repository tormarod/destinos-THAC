// src/routes/resetUser.js
const express = require("express");

module.exports = function ({ ddb }) {
  const router = express.Router();

  router.post("/reset-user", async (req, res) => {
    try {
      const { userId } = req.body || {};
      if (!userId || typeof userId !== "string") {
        return res.status(400).json({ error: "userId is required" });
      }

      if (ddb.enabled) {
        await ddb.deleteSubmission(userId);
      }

      // Response mirrors previous contract (we don't keep server cache)
      return res.json({ ok: true, removed: 1 });
    } catch (e) {
      console.error("[/api/reset-user] error:", e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  return router;
};
