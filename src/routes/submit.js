const express = require("express");
const { logIP } = require("../lib/ipLogger");

module.exports = function ({ ddb, invalidateAllocationCache, cacheManager }) {
  const router = express.Router();

  // Multi-layer duplicate prevention system
  const recentSubmissions = new Map(); // userId+season -> timestamp (cooldown tracking)
  const processedRequestIds = new Set(); // Track processed requestIds to prevent exact duplicates
  const SUBMISSION_COOLDOWN_MS = 15000; // 15 seconds cooldown between submissions

  router.post("/submit", async (req, res) => {
    try {
      const { name, order, rankedItems, id, season, requestId } =
        req.body || {};
      const seasonStr = String(season || new Date().getFullYear());
      // Generate unique requestId if not provided by frontend
      const uniqueRequestId =
        requestId || `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      // Validate required fields
      if (!name || typeof name !== "string") {
        logIP(req, "SUBMIT_FAILED", {
          reason: "missing_name",
          season: seasonStr,
        });
        return res.status(400).json({ error: "Name is required." });
      }
      const parsedOrder = Number(order);
      if (!Number.isInteger(parsedOrder) || parsedOrder <= 0) {
        logIP(req, "SUBMIT_FAILED", {
          reason: "invalid_order",
          season: seasonStr,
          name: name.trim(),
        });
        return res
          .status(400)
          .json({ error: "Order must be a positive integer." });
      }

      const trimmedName = name.trim();
      const now = Date.now();

      // Generate userId (use provided id or generate new one)
      const userId =
        id && typeof id === "string" && id.trim() !== ""
          ? id
          : `u_${Math.random().toString(36).slice(2)}`;

      // Create tracking key using userId + season for cooldown tracking
      const submissionKey = `${userId}_${seasonStr}`;

      // Layer 1: Check for duplicate requestId (exact same request processed multiple times)
      if (processedRequestIds.has(uniqueRequestId)) {
        logIP(req, "SUBMIT_BLOCKED", {
          reason: "duplicate_requestId",
          userId,
          season: seasonStr,
          requestId: uniqueRequestId,
        });
        return res.status(409).json({
          error: "Solicitud duplicada",
          message:
            "Esta solicitud ya ha sido procesada. No se creará un registro duplicado.",
          requestId: uniqueRequestId,
        });
      }

      // Layer 2: Check for recent duplicate submission within cooldown period
      const lastSubmission = recentSubmissions.get(submissionKey);
      if (lastSubmission && now - lastSubmission < SUBMISSION_COOLDOWN_MS) {
        const remainingSeconds = Math.ceil(
          (SUBMISSION_COOLDOWN_MS - (now - lastSubmission)) / 1000,
        );
        logIP(req, "SUBMIT_BLOCKED", {
          reason: "duplicate_submission",
          userId,
          season: seasonStr,
          remainingSeconds,
        });
        return res.status(429).json({
          error: "Solicitud duplicada",
          message: `Ya has enviado una solicitud recientemente. Espera ${remainingSeconds} segundo(s) antes de enviar otra.\n\nEsto previene envíos duplicados por problemas de conexión.`,
          retryAfter: remainingSeconds,
        });
      }

      // Get existing submissions for the season (only needed for userId lookup)
      const allSubmissions = await ddb.fetchAllSubmissions(seasonStr);

      let submittedAt = now;
      const existing = allSubmissions.find((s) => s.id === userId);
      if (existing) submittedAt = existing.submittedAt || now;

      // Save submission to DynamoDB
      await ddb.upsertSubmission({
        season: seasonStr,
        userId,
        name: trimmedName,
        order: parsedOrder,
        rankedItems: Array.from(new Set((rankedItems || []).map(String))), // Remove duplicates
        submittedAt,
        updatedAt: now, // Always set updatedAt to current timestamp
      });

      // Log successful submission with IP for monitoring
      logIP(req, "SUBMIT_SUCCESS", {
        userId,
        name: trimmedName,
        order: parsedOrder,
        season: seasonStr,
        rankedItemsCount: rankedItems?.length || 0,
        isUpdate: !!existing,
        requestId: uniqueRequestId,
      });

      // Track this submission to prevent rapid duplicates (Layer 2)
      recentSubmissions.set(submissionKey, now);
      processedRequestIds.add(uniqueRequestId);

      // Mark season as active in demand-driven cache (new submission request)
      if (cacheManager) {
        cacheManager.markSeasonActive(seasonStr);
      }

      // Invalidate allocation cache since new submission affects allocation results
      if (invalidateAllocationCache) {
        invalidateAllocationCache(seasonStr);
      }

      // Memory management: clean up old entries from tracking maps
      if (recentSubmissions.size > 100) {
        const oldestKey = recentSubmissions.keys().next().value;
        recentSubmissions.delete(oldestKey);
      }
      if (processedRequestIds.size > 1000) {
        // Clear half of the processed request IDs (keep recent ones)
        const idsToDelete = Array.from(processedRequestIds).slice(0, 500);
        idsToDelete.forEach((id) => processedRequestIds.delete(id));
      }

      return res.json({ ok: true, id: userId });
    } catch (e) {
      console.error("[/api/submit] error:", e);
      logIP(req, "SUBMIT_ERROR", { error: e.message, season: seasonStr });
      res.status(500).json({ error: "Internal error" });
    }
  });

  return router;
};
