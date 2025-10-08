// src/routes/submit.js
const express = require("express");

module.exports = function ({ ddb, idField }) {
  const router = express.Router();

  router.post("/submit", async (req, res) => {
    try {
      const { name, order, rankedItems, id, season } = req.body || {};
      const seasonStr = String(season || new Date().getFullYear());

      if (!name || typeof name !== "string") {
        return res.status(400).json({ error: "Name is required." });
      }
      const parsedOrder = Number(order);
      if (!Number.isInteger(parsedOrder) || parsedOrder <= 0) {
        return res.status(400).json({ error: "Order must be a positive integer." });
      }

      // NOTE: items are validated on the client; optionally validate here by fetching items for the season

      const userId =
        id && typeof id === "string" ? id : `u_${Math.random().toString(36).slice(2)}`;

      // preserve first submittedAt
      const now = Date.now();
      const all = ddb.enabled ? await ddb.fetchAllSubmissions() : [];
      const existing = all.find((s) => s.id === userId && String(s.season || "") === seasonStr);

      const payload = {
        id: userId,
        season: seasonStr,
        name: name.trim(),
        order: parsedOrder,
        rankedItems: Array.from(new Set((rankedItems || []).map(String))),
        submittedAt: existing ? existing.submittedAt : now,
      };

      if (ddb.enabled) {
        await ddb.upsertSubmission(payload);
      }

      return res.json({ ok: true, id: userId, submission: payload });
    } catch (e) {
      console.error("[/api/submit] error:", e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  return router;
};
