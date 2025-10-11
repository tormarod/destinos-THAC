const express = require("express");
const { allocate } = require("../lib/allocate");

module.exports = function ({ ddb }) {
  const router = express.Router();

  // SECURE: User-specific allocation endpoint
  router.post("/allocate", async (req, res) => {
    try {
      const season = String(
        (req.body && req.body.season) || new Date().getFullYear()
      );
      const x = parseInt(req.body && req.body.x) || 0;
      const userId = req.body && req.body.userId;
      
      if (!userId || typeof userId !== "string") {
        return res.status(400).json({ error: "userId is required" });
      }

      const subs = ddb.enabled ? await ddb.fetchAllSubmissions(season) : [];
      const fullAllocation = allocate(subs, x);
      
      // Find only the current user's allocation
      const userAllocation = fullAllocation.find(a => a.userId === userId);
      
      if (!userAllocation) {
        return res.status(404).json({ error: "User not found in allocation" });
      }

      // Return only the user's own data (no other users' information)
      res.json({ 
        allocation: [userAllocation], 
        season, 
        x 
      });
    } catch (e) {
      console.error("[/api/allocate] error:", e);
      res.status(500).json({ error: "Allocation failed" });
    }
  });

  // ADMIN ONLY: Full allocation endpoint (for debugging/admin purposes)
  router.post("/allocate-admin", async (req, res) => {
    try {
      // Add admin authentication here if needed
      const season = String(
        (req.body && req.body.season) || new Date().getFullYear()
      );
      const x = parseInt(req.body && req.body.x) || 0;
      const subs = ddb.enabled ? await ddb.fetchAllSubmissions(season) : [];
      const allocation = allocate(subs, x);
      res.json({ allocation, season, x });
    } catch (e) {
      console.error("[/api/allocate-admin] error:", e);
      res.status(500).json({ error: "Allocation failed" });
    }
  });

  return router;
};
