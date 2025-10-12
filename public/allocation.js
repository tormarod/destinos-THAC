// public/allocation.js

// Small helper
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Luck overlay controls
function showLuckOverlay() {
  const el = document.getElementById("luckOverlay");
  if (el) el.style.display = "block";
}
function hideLuckOverlay() {
  const el = document.getElementById("luckOverlay");
  if (el) el.style.display = "none";
}

// Render only the local user's allocation (first assigned + available list)
function renderAllocation(payload) {
  const ct = document.getElementById("allocationResult");
  const localId = localStorage.getItem("allocator:userId") || "";

  if (!localId) {
    ct.innerHTML =
      "<p class='muted'>No hay usuario local aún. Guarda tus destinos para crear uno.</p>";
    return;
  }

  const mine = (payload.allocation || []).filter((r) => r.userId === localId);
  if (!mine.length) {
    ct.innerHTML =
      "<p class='muted'>No hay resultados para este usuario aún.</p>";
    return;
  }

  const x = payload.x || 0;
  const simulationText =
    x > 0
      ? ` (Simulación: primeras ${x} preferencias de usuarios por encima marcadas como no disponibles)`
      : " (Simulación estándar)";

  const rows = mine
    .map((r) => {
      const firstAssigned =
        r.assignedItemIds && r.assignedItemIds.length > 0
          ? r.assignedItemIds[0]
          : "<span class='muted'>Ninguno</span>";

      const availableNums = (r.availableByPreference || []).join(" » ");

      return `
<tr>
  <td>${r.order}</td>
  <td>${r.name}</td>
  <td><strong>${firstAssigned}</strong></td>
  <td>${availableNums || "<span class='muted'>No hay destinos de respaldo disponibles</span>"}</td>
</tr>`;
    })
    .join("");

  ct.innerHTML = `
<table>
  <thead>
    <tr>
      <th>Tu posición</th>
      <th>Nombre</th>
      <th>Destino asignado</th>
      <th>Siguientes 20 destinos disponibles (según tu preferencia) que nadie por encima de tí ha obtenido como destino</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`;
}

// Run allocation with a short "Buena Suerte" splash
async function runAllocation(season) {
  // Check if user is currently rate-limited (button disabled)
  const allocateBtn = document.getElementById("allocateBtn");
  if (allocateBtn && allocateBtn.disabled) {
    // User is rate-limited, don't show animation or make request
    return;
  }

  showLuckOverlay();

  try {
          // Get the competition depth parameter from the input field
          const competitionDepthInput = document.getElementById("competitionDepthParameter");
          const competitionDepth = competitionDepthInput ? parseInt(competitionDepthInput.value) || 0 : 0;

          const data = await window.api.allocate(season, competitionDepth);
    renderAllocation(data);

    // Start countdown after successful allocation to prevent immediate second request
    const config = await window.api.getConfig();
    startRateLimitCountdown(config.allocationRateLimitSeconds);
  } catch (error) {
    console.error("Allocation failed:", error);
    const ct = document.getElementById("allocationResult");

    // Handle rate limiting specifically
    if (error.status === 429 && error.body && error.body.retryAfter) {
      // Don't show error message, just start the countdown timer
      startRateLimitCountdown(error.body.retryAfter);
    } else {
      ct.innerHTML = `<p class="error">Error: ${error.message}</p>`;
    }
  } finally {
    // keep the overlay visible a bit so the animation is noticeable
    await sleep(3000);
    hideLuckOverlay();
  }
}

// Rate limit countdown functionality
function startRateLimitCountdown(seconds) {
  const countdownElement = document.getElementById("rateLimitCountdown");
  const timerElement = document.getElementById("countdownTimer");
  const allocateBtn = document.getElementById("allocateBtn");

  if (!countdownElement || !timerElement || !allocateBtn) return;

  // Show countdown and disable button
  countdownElement.style.display = "flex";
  allocateBtn.disabled = true;
  allocateBtn.textContent = "Esperando...";

  let remaining = seconds;

  function updateCountdown() {
    timerElement.textContent = remaining;

    if (remaining <= 0) {
      // Countdown finished
      countdownElement.style.display = "none";
      allocateBtn.disabled = false;
      allocateBtn.textContent = "Repartir";
      return;
    }

    remaining--;
    setTimeout(updateCountdown, 1000);
  }

  updateCountdown();
}

// Expose globals (used by app.js event wiring)
window.renderAllocation = renderAllocation;
window.runAllocation = runAllocation;
