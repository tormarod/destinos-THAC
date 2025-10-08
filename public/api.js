// public/api.js
(function () {
  async function jsonOrThrow(res, fallbackMsg) {
    let body = null;
    const text = await res.text().catch(() => "");
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }
    if (!res.ok) {
      const msg =
        (body && (body.error || body.message)) ||
        fallbackMsg ||
        `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body || {};
  }

  const api = {
    async getState(season) {
      const res = await fetch(
        `/api/state?season=${encodeURIComponent(season)}`
      );
      return jsonOrThrow(res, "Failed to load state");
    },
    async getOrders(season) {
      const res = await fetch(
        `/api/orders?season=${encodeURIComponent(season)}`
      );
      return jsonOrThrow(res, "Failed to load orders");
    },
    async submit(payload) {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return jsonOrThrow(res, "Submission failed");
    },
    async resetUser(userId, season) {
      const res = await fetch("/api/reset-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, season }), // ← MUST include season
      });
      return jsonOrThrow(res, "Failed to reset your submissions");
    },
    async allocate(season) {
      const res = await fetch("/api/allocate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ season }),
      });
      return jsonOrThrow(res, "Allocation failed");
    },
  };

  window.api = api;
})();
