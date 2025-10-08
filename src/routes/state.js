// src/routes/state.js
const express = require("express");

module.exports = function ({ ddb, items, idField }) {
  const router = express.Router();

  router.get("/state", async (req, res) => {
    try {
      // Always read fresh from DynamoDB so server mirrors reality
      const submissions = ddb.enabled ? await ddb.fetchAllSubmissions() : [];
      res.json({ items, submissions, idField });
    } catch (e) {
      console.error("[/api/state] error:", e);
      res.status(500).json({ error: "Failed to load state" });
    }
  });

  return router;
};
