const express = require("express");
const { logIP } = require("../lib/ipLogger");

module.exports = function ({ ddb }) {
  const router = express.Router();

  router.post("/reset-user", async (req, res) => {
    try {
      const { userId, season } = req.body || {};
      const seasonStr = String(season || new Date().getFullYear());

      if (!userId || typeof userId !== "string") {
        console.warn("[reset-user] 400 missing userId");
        logIP(req, "RESET_USER_FAILED", { reason: "missing_userId", season: seasonStr });
        return res.status(400).json({ error: "userId is required" });
      }

      const pk = `SUBMISSION#${seasonStr}`;
      const sk = String(userId);
      console.log(`[reset-user] Attempting delete pk=${pk} sk=${sk}`);

      if (!ddb.enabled) {
        console.warn("[reset-user] 503 DynamoDB not enabled");
        logIP(req, "RESET_USER_FAILED", { reason: "ddb_disabled", userId, season: seasonStr });
        return res.status(503).json({ error: "DynamoDB not enabled" });
      }

      const removed = await ddb.deleteSubmission(seasonStr, sk);
      console.log("[reset-user] removed:", removed);

      if (removed) {
        logIP(req, "RESET_USER_SUCCESS", { userId, season: seasonStr });
        return res.json({ ok: true, removed: 1 });
      }

      // Not found — fetch what the server sees for this season to help diagnose
      const subs = await ddb.fetchAllSubmissions(seasonStr);
      const idsHere = subs.map((s) => s.id);
      console.warn("[reset-user] 404 not found. Season rows sk list:", idsHere);

      logIP(req, "RESET_USER_NOT_FOUND", { userId, season: seasonStr, availableIds: idsHere.length });

      return res.status(404).json({
        error: "No submission found for this season/user",
        attempted: { pk, sk },
        season,
        presentIds: idsHere, // the SKs the server actually sees in this season
        count: subs.length,
      });
    } catch (e) {
      console.error("[/api/reset-user] error:", e);
      logIP(req, "RESET_USER_ERROR", { error: e.message, userId, season: seasonStr });
      res.status(500).json({ error: "Internal error" });
    }
  });

  return router;
};
