const express = require("express");

module.exports = function ({ ddb }) {
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
        return res
          .status(400)
          .json({ error: "Order must be a positive integer." });
      }

      const userId =
        id && typeof id === "string"
          ? id
          : `u_${Math.random().toString(36).slice(2)}`;

      const now = Date.now();
      let submittedAt = now;
      const existing = (await ddb.fetchAllSubmissions(seasonStr)).find(
        (s) => s.id === userId
      );
      if (existing) submittedAt = existing.submittedAt || now;

      await ddb.upsertSubmission({
        season: seasonStr,
        userId,
        name: name.trim(),
        order: parsedOrder,
        rankedItems: Array.from(new Set((rankedItems || []).map(String))),
        submittedAt,
      });

      return res.json({ ok: true, id: userId });
    } catch (e) {
      console.error("[/api/submit] error:", e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  return router;
};
