// src/routes/orders.js
const express = require("express");

module.exports = function ({ ddb }) {
  const router = express.Router();

  router.get("/orders", async (req, res) => {
    try {
      const season = String(req.query.season || new Date().getFullYear());
      const all = ddb.enabled ? await ddb.fetchAllOrders() : [];
      // Only return orders for this season
      const orders = all.filter((o) => String(o.season || "") === season);
      res.json({ orders });
    } catch (e) {
      console.error("[/api/orders] error:", e);
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  return router;
};
