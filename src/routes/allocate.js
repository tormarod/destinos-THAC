// src/routes/allocate.js
const express = require("express");
const { allocate } = require("../lib/allocate");

module.exports = function ({ ddb /*, idField */ }) {
  const router = express.Router();

  router.post("/allocate", async (req, res) => {
    try {
      const submissions = ddb.enabled ? await ddb.fetchAllSubmissions() : [];
      const allocation = allocate(submissions);
      res.json({ allocation });
    } catch (e) {
      console.error("[/api/allocate] error:", e);
      res.status(500).json({ error: "Allocation failed" });
    }
  });

  return router;
};
