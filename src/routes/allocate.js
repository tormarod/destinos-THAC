const express = require("express");
const { allocate } = require("../lib/allocate");

module.exports = function ({ ddb }) {
  const router = express.Router();

  router.post("/allocate", async (req, res) => {
    try {
      const season = String(
        (req.body && req.body.season) || new Date().getFullYear()
      );
      const subs = ddb.enabled ? await ddb.fetchAllSubmissions(season) : [];
      const allocation = allocate(subs);
      res.json({ allocation, season });
    } catch (e) {
      console.error("[/api/allocate] error:", e);
      res.status(500).json({ error: "Allocation failed" });
    }
  });

  return router;
};
