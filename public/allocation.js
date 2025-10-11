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
  const simulationText = x > 0 
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
<div class="muted" style="margin-bottom: 12px;">
  <strong>Parámetro de simulación:</strong> ${x}${simulationText}
</div>
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
  showLuckOverlay();

  try {
    // Get the X parameter from the input field
    const xInput = document.getElementById("xParameter");
    const x = xInput ? parseInt(xInput.value) || 0 : 0;
    
    const data = await window.api.allocate(season, x);
    renderAllocation(data);
  } catch (error) {
    console.error("Allocation failed:", error);
    const ct = document.getElementById("allocationResult");
    ct.innerHTML = `<p class="error">Error: ${error.message}</p>`;
  } finally {
    // keep the overlay visible a bit so the animation is noticeable
    await sleep(3000);
    hideLuckOverlay();
  }
}

// Expose globals (used by app.js event wiring)
window.renderAllocation = renderAllocation;
window.runAllocation = runAllocation;
