// public/api.js
(function () {
  // Client-side caching for submissions data
  const CACHE_TTL = 2.5 * 60 * 1000; // 2.5 minutes (2:30)
  const submissionsCache = new Map(); // season -> { data, timestamp }
  let cacheTimerInterval = null;

  function getCachedSubmissions(season) {
    const cached = submissionsCache.get(season);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      return cached.data;
    }
    return null;
  }

  function setCachedSubmissions(season, data) {
    submissionsCache.set(season, {
      data: data,
      timestamp: Date.now()
    });
    // Always restart timer when cache is set (even if timer is already running)
    startTimerImmediately();
  }

  function startTimerImmediately() {
    const timerElement = document.getElementById('cacheTimer');
    const countdownElement = document.getElementById('timerCountdown');
    
    if (!timerElement || !countdownElement) {
      return;
    }

    // Clear existing timer
    if (cacheTimerInterval) {
      clearInterval(cacheTimerInterval);
      cacheTimerInterval = null;
    }

    // Find the earliest cache expiration
    let earliestExpiration = null;
    for (const [season, cached] of submissionsCache) {
      const expiration = cached.timestamp + CACHE_TTL;
      if (!earliestExpiration || expiration < earliestExpiration) {
        earliestExpiration = expiration;
      }
    }

    if (!earliestExpiration) {
      timerElement.style.display = 'none';
      return;
    }

    // Always show timer when cache is available
    timerElement.style.display = 'flex';
    
    function updateCountdown() {
      const now = Date.now();
      const remaining = Math.max(0, earliestExpiration - now);
      
      // Always show the countdown, even when expired (shows 00:00)
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      countdownElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      
      // Don't clear the timer when it expires, just let it show 00:00
      if (remaining <= 0) {
      }
    }
    
    updateCountdown();
    cacheTimerInterval = setInterval(updateCountdown, 1000);
  }

  function clearSubmissionsCache(season = null) {
    if (season) {
      submissionsCache.delete(season);
    } else {
      submissionsCache.clear();
    }
    // Clear timer when cache is cleared
    const timerElement = document.getElementById('cacheTimer');
    if (timerElement) {
      timerElement.style.display = 'none';
    }
    if (cacheTimerInterval) {
      clearInterval(cacheTimerInterval);
      cacheTimerInterval = null;
    }
  }

  function updateCacheTimer() {
    console.log('[timer] updateCacheTimer called, cache size:', submissionsCache.size);
    
    const timerElement = document.getElementById('cacheTimer');
    const countdownElement = document.getElementById('timerCountdown');
    
    if (!timerElement || !countdownElement) {
      console.log('[timer] Timer elements not found');
      return;
    }

    // Clear existing timer
    if (cacheTimerInterval) {
      clearInterval(cacheTimerInterval);
      cacheTimerInterval = null;
    }

    // Find the earliest cache expiration
    let earliestExpiration = null;
    for (const [season, cached] of submissionsCache) {
      const expiration = cached.timestamp + CACHE_TTL;
      console.log(`[timer] Season ${season}: timestamp=${cached.timestamp}, expiration=${expiration}, now=${Date.now()}`);
      if (!earliestExpiration || expiration < earliestExpiration) {
        earliestExpiration = expiration;
      }
    }

    if (!earliestExpiration) {
      console.log('[timer] No cache expiration found, hiding timer');
      timerElement.style.display = 'none';
      return;
    }

    // Check if cache is already expired
    const now = Date.now();
    if (earliestExpiration <= now) {
      console.log('[timer] Cache already expired, hiding timer');
      timerElement.style.display = 'none';
      return;
    }

    console.log('[timer] Showing timer, earliest expiration:', earliestExpiration);
    // Show timer and start countdown
    timerElement.style.display = 'flex';
    
    function updateCountdown() {
      const now = Date.now();
      const remaining = Math.max(0, earliestExpiration - now);
      
      if (remaining <= 0) {
        console.log('[timer] Timer expired');
        countdownElement.textContent = '00:00';
        timerElement.style.display = 'none';
        clearInterval(cacheTimerInterval);
        cacheTimerInterval = null;
        return;
      }
      
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      countdownElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    updateCountdown();
    cacheTimerInterval = setInterval(updateCountdown, 1000);
  }

  // Client-side allocation function (simplified version of server-side algorithm)
  function clientSideAllocate(submissions, x = 0) {
    const users = [...submissions].sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return (a.submittedAt || 0) - (b.submittedAt || 0);
    });

    const takenFinal = new Set();
    const assigned = new Map(users.map((u) => [u.id, []]));

    // Allocate exactly 1 item per user in priority order
    for (const u of users) {
      const next = (u.rankedItems || []).find(
        (id) => !takenFinal.has(String(id))
      );
      if (typeof next !== "undefined") {
        const id = String(next);
        takenFinal.add(id);
        assigned.get(u.id).push(id);
      }
    }

    // Available-by-preference: show what user would get if first X preferences of users above were already taken
    const availableByPref = new Map();
    for (const u of users) {
      const userRankedItems = u.rankedItems || [];
      if (userRankedItems.length === 0) {
        availableByPref.set(u.id, []);
        continue;
      }
      
      // Collect all first X preferences from users above this user
      const takenByUsersAbove = new Set();
      for (const otherUser of users) {
        if (otherUser.order < u.order) {
          const otherUserItems = otherUser.rankedItems || [];
          // Mark the first X preferences of this user above as taken
          for (let i = 0; i < Math.min(x, otherUserItems.length); i++) {
            takenByUsersAbove.add(String(otherUserItems[i]));
          }
        }
      }
      
      // Find what this user would get if their first few preferences were also unavailable
      const backupItems = [];
      const maxBackupItems = 20;
      
      for (let skipCount = 1; skipCount <= maxBackupItems && skipCount < userRankedItems.length; skipCount++) {
        // Find the first available item after skipping the first 'skipCount' preferences
        const availableItem = userRankedItems.slice(skipCount).find(
          (id) => !takenByUsersAbove.has(String(id))
        );
        
        if (availableItem) {
          const itemStr = String(availableItem);
          // Only add if it's different from their actual assigned item
          const actualAssigned = assigned.get(u.id);
          const actualItem = actualAssigned && actualAssigned.length > 0 ? String(actualAssigned[0]) : null;
          if (itemStr !== actualItem && !backupItems.includes(itemStr)) {
            backupItems.push(itemStr);
          }
        }
      }
      
      availableByPref.set(u.id, backupItems.slice(0, maxBackupItems));
    }

    return users.map((u) => ({
      userId: u.id,
      name: u.name,
      order: u.order,
      rankedItems: u.rankedItems || [],
      assignedItemIds: assigned.get(u.id) || [],
      availableByPreference: availableByPref.get(u.id) || [],
    }));
  }

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
      const userId = localStorage.getItem("allocator:userId");
      const url = userId 
        ? `/api/state?season=${encodeURIComponent(season)}&userId=${encodeURIComponent(userId)}`
        : `/api/state?season=${encodeURIComponent(season)}`;
        
      const res = await fetch(url);
      const data = await jsonOrThrow(res, "Error al cargar el estado");
      
      // Don't cache submissions from getState (user-specific data)
      // Cache will be populated from allocation-data endpoint
      
      return data;
    },
    async getAllocationData(season) {
      const res = await fetch(
        `/api/allocation-data?season=${encodeURIComponent(season)}`
      );
      const data = await jsonOrThrow(res, "Error al cargar datos de asignación");
      
      // Cache the anonymized submissions data for allocation
      if (data.submissions) {
        setCachedSubmissions(season, data.submissions);
      }
      
      return data;
    },
    async getOrders(season) {
      const res = await fetch(
        `/api/orders?season=${encodeURIComponent(season)}`
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
      
      // Clear cache for this season since data has changed
      if (payload.season) {
        clearSubmissionsCache(payload.season);
      }
      
      return result;
    },
    async resetUser(userId, season) {
      const res = await fetch("/api/reset-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, season }), // ← MUST include season
      });
      const result = await jsonOrThrow(res, "Error al restablecer tus solicitudes");
      
      // Clear cache for this season since data has changed
      clearSubmissionsCache(season);
      
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
        "Error al restablecer tus solicitudes en todas las temporadas"
      );
      
      // Clear all cache since data has changed across all seasons
      clearSubmissionsCache();
      
      return result;
    },
    async allocate(season, x = 0) {
      const userId = localStorage.getItem("allocator:userId");
      if (!userId) {
        throw new Error("No se encontró ID de usuario. Por favor, envía tus preferencias primero.");
      }
      
      // Check if we have cached submissions data
      const cachedSubmissions = getCachedSubmissions(season);
      if (cachedSubmissions) {
        // Use cached data for client-side allocation calculation
        const fullAllocation = clientSideAllocate(cachedSubmissions, x);
        const userAllocation = fullAllocation.find(a => a.userId === userId);
        
        if (!userAllocation) {
          throw new Error("Usuario no encontrado en la asignación");
        }
        
        return {
          allocation: [userAllocation],
          season,
          x
        };
      }
      
      // No cache available, refresh cache first then use client-side allocation
      await this.getAllocationData(season);
      
      // Now try again with fresh cache
      const freshCachedSubmissions = getCachedSubmissions(season);
      if (freshCachedSubmissions) {
        const fullAllocation = clientSideAllocate(freshCachedSubmissions, x);
        const userAllocation = fullAllocation.find(a => a.userId === userId);
        
        if (!userAllocation) {
          throw new Error("Usuario no encontrado en la asignación");
        }
        
        return {
          allocation: [userAllocation],
          season,
          x
        };
      }
      
      // Fallback to server-side allocation if still no cache
      const res = await fetch("/api/allocate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ season, x, userId }),
      });
      const result = await jsonOrThrow(res, "Error en la asignación");
      
      return result;
    },
  };

  window.api = api;
})();
