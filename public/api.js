// public/api.js
// Lightweight API wrapper (no framework). Attaches `window.api`.

(function () {
  async function jsonOrThrow(res, fallbackMsg) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || fallbackMsg);
    return data;
  }

  const api = {
    // Load full app state (items + this-user submissions list)
    async getState() {
      const res = await fetch("/api/state");
      return jsonOrThrow(res, "Failed to load state");
    },

    // Get all orders (for conflict check against DynamoDB)
    async getOrders() {
      const res = await fetch("/api/orders");
      return jsonOrThrow(res, "Failed to load orders");
    },

    // Submit or update a user's ranking
    async submit(payload) {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return jsonOrThrow(res, "Submission failed");
    },

    // Delete only this user's submissions
    async resetUser(userId) {
      const res = await fetch("/api/reset-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      return jsonOrThrow(res, "Failed to reset your submissions");
    },

    // Run allocation
    async allocate() {
      const res = await fetch("/api/allocate", { method: "POST" });
      return jsonOrThrow(res, "Allocation failed");
    },
  };

  window.api = api;
})();
