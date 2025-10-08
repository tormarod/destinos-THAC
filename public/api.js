// public/api.js
(function () {
  async function jsonOrThrow(res, fallbackMsg) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || fallbackMsg);
    return data;
  }

  const api = {
    async getState(season) {
      const res = await fetch(`/api/state?season=${encodeURIComponent(season)}`);
      return jsonOrThrow(res, "Failed to load state");
    },
    async getOrders(season) {
      const res = await fetch(`/api/orders?season=${encodeURIComponent(season)}`);
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
    async resetUser(userId) {
      const res = await fetch("/api/reset-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
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
