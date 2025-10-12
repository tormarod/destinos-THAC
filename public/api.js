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

  // Cache for configuration
  let configCache = null;

  const api = {
    async getConfig() {
      if (configCache) return configCache;
      
      const res = await fetch("/api/config");
      const data = await jsonOrThrow(res, "Error al cargar configuración");
      configCache = data;
      return data;
    },
    async getState(season) {
      const userId = localStorage.getItem("allocator:userId");
      const url = userId
        ? `/api/state?season=${encodeURIComponent(
            season,
          )}&userId=${encodeURIComponent(userId)}`
        : `/api/state?season=${encodeURIComponent(season)}`;

      const res = await fetch(url);
      const data = await jsonOrThrow(res, "Error al cargar el estado");

      return data;
    },
    async getOrders(season) {
      const res = await fetch(
        `/api/orders?season=${encodeURIComponent(season)}`,
      );
      return jsonOrThrow(res, "Error al cargar las órdenes");
    },
    async submit(payload) {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await jsonOrThrow(res, "Error al enviar la solicitud");

      return result;
    },
    async resetUser(userId, season) {
      const res = await fetch("/api/reset-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, season }), // ← MUST include season
      });
      const result = await jsonOrThrow(
        res,
        "Error al restablecer tus solicitudes",
      );

      return result;
    },
    async resetUserEverywhere(userId) {
      const res = await fetch("/api/reset-user-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const result = await jsonOrThrow(
        res,
        "Error al restablecer tus solicitudes en todas las temporadas",
      );

      return result;
    },
    async allocate(season, competitionDepth = 0) {
      const userId = localStorage.getItem("allocator:userId");
      if (!userId) {
        throw new Error(
          "No se encontró ID de usuario. Por favor, envía tus preferencias primero.",
        );
      }

      // Pure server-side allocation - no client-side caching or calculation
      const res = await fetch("/api/allocate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ season, competitionDepth, userId }),
      });
      const result = await jsonOrThrow(res, "Error en la asignación");

      return result;
    },
  };

  window.api = api;
})();
