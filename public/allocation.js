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

  const scenario = payload.scenario || 0;
  const usersAboveCount = payload.usersAboveCount || 0;
  
  // Scenario descriptions
  const scenarioDescriptions = {
    0: "Estado actual de la asignación",
    1: "Simulación: usuarios restantes se presentan",
    2: "Simulación: destinos específicos se ocupan", 
    3: "Simulación: peor caso posible"
  };
  
  const simulationText = scenario > 0 
    ? ` (${scenarioDescriptions[scenario] || "Simulación"})`
    : " (Estado actual)";
  
  const positionInfo = usersAboveCount > 0 
    ? `<p class="muted" style="margin-bottom: 16px;"><strong>Posición en la cola:</strong> Han contestado <strong>${usersAboveCount}</strong> persona${usersAboveCount === 1 ? '' : 's'} por encima de ti.</p>`
    : `<p class="muted" style="margin-bottom: 16px;"><strong>Posición en la cola:</strong> ¡Eres la primera persona en la lista de prioridades!</p>`;

  // Get the actual count of available items from the first user's data
  const actualAvailableCount = mine.length > 0 ? (mine[0].availableByPreference || []).length : 0;
  const availableCountText = actualAvailableCount > 0 ? actualAvailableCount : "destinos";

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
${positionInfo}
<table>
  <thead>
    <tr>
      <th>Tu posición</th>
      <th>Nombre</th>
      <th>Destino asignado</th>
      <th>Siguientes ${availableCountText} disponibles (según tu preferencia) que nadie por encima de tí ha obtenido como destino</th>
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
          // Get the scenario from the select field
          const scenarioSelect = document.getElementById("scenarioSelect");
          let scenario = scenarioSelect ? parseInt(scenarioSelect.value) || 0 : 0;
          
          // Get blocked items for scenario 2 and competition depth for scenario 3
          let blockedItems = [];
          let competitionDepth = 3; // default value
          
          if (scenario === 2) {
            // Get current selections from dropdowns (in case user didn't click preview)
            const localidadSelect = document.getElementById("localidadSelect");
            const centroSelect = document.getElementById("centroSelect");
            
            // Try to get from in-memory state first, then from dropdowns
            let selectedLocalidades = window.state?.blockedItems?.selectedLocalidades || [];
            let selectedCentros = window.state?.blockedItems?.selectedCentros || [];
            
            // If in-memory state is empty, get from current dropdown selections
            if (selectedLocalidades.length === 0 && localidadSelect) {
              selectedLocalidades = Array.from(localidadSelect.selectedOptions).map(opt => opt.value);
            }
            if (selectedCentros.length === 0 && centroSelect) {
              selectedCentros = Array.from(centroSelect.selectedOptions).map(opt => opt.value);
            }
            
            // If no items are selected to block, treat as scenario 0 (current state)
            if (selectedLocalidades.length === 0 && selectedCentros.length === 0) {
              scenario = 0; // Override scenario to 0
              blockedItems = {};
            } else {
              blockedItems = { selectedLocalidades, selectedCentros };
            }
          } else if (scenario === 3) {
            // Get competition depth from in-memory state or input
            competitionDepth = window.state?.competitionDepth || 3;
            const competitionDepthInput = document.getElementById("competitionDepthInput");
            if (competitionDepthInput) {
              const inputValue = Math.max(1, Math.min(20, Number(competitionDepthInput.value) || 3));
              competitionDepth = inputValue;
              // Update state with current input value
              if (window.state) {
                window.state.competitionDepth = competitionDepth;
              }
            }
          }

          const data = await window.api.allocate(season, scenario, blockedItems, competitionDepth);
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
