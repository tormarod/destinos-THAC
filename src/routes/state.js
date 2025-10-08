const express = require("express");

module.exports = function ({ ddb, idField, getItemsForSeason }) {
  const router = express.Router();

  router.get("/state", async (req, res) => {
    const season = String(req.query.season || new Date().getFullYear());
    try {
      let items = [];
      let notFound = false;

      try {
        items = await getItemsForSeason(season);
      } catch (e) {
        const msg = String(e && (e.name || e.code || e.message || e));
        const status = e && e.$metadata && e.$metadata.httpStatusCode;
        if (
          msg.includes("NoSuchKey") ||
          msg.includes("NotFound") ||
          status === 404
        ) {
          items = [];
          notFound = true;
        } else {
          throw e;
        }
      }

      const submissions = ddb.enabled
        ? await ddb.fetchAllSubmissions(season)
        : [];
      res.json({ items, submissions, idField, season, notFound });
    } catch (e) {
      console.error("[/api/state] error:", e);
      res.status(500).json({ error: "Failed to load state" });
    }
  });

  return router;
};
