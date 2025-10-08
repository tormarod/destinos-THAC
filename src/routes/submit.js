// src/routes/submit.js
const express = require("express");

module.exports = function ({ ddb, idField, items }) {
  const router = express.Router();

  router.post("/submit", async (req, res) => {
    try {
      const { name, order, rankedItems, id } = req.body || {};

      if (!name || typeof name !== "string") {
        return res.status(400).json({ error: "Name is required." });
      }
      const parsedOrder = Number(order);
      if (!Number.isInteger(parsedOrder) || parsedOrder <= 0) {
        return res
          .status(400)
          .json({ error: "Order must be a positive integer." });
      }

      // validate IDs against the catalog
      const validIds = new Set(items.map((o) => String(o[idField])));
      const uniqueRanking = Array.from(
        new Set((rankedItems || []).map((x) => String(x)))
      ).filter((x) => validIds.has(x));

      const userId =
        id && typeof id === "string"
          ? id
          : `u_${Math.random().toString(36).slice(2)}`;

      // preserve original submittedAt for same user (last-write wins)
      const now = Date.now();
      const all = ddb.enabled ? await ddb.fetchAllSubmissions() : [];
      const existing = all.find((s) => s.id === userId);

      const payload = {
        id: userId,
        name: name.trim(),
        order: parsedOrder,
        rankedItems: uniqueRanking,
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
