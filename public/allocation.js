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

  const rows = mine
    .map((r) => {
      const firstAssigned =
        r.assignedItemIds && r.assignedItemIds.length > 0
          ? r.assignedItemIds[0]
          : "<span class='muted'>None</span>";

      const availableNums = (r.availableByPreference || []).join(" » ");

      return `
<tr>
  <td>${r.order}</td>
  <td>${r.name}</td>
  <td><strong>${firstAssigned}</strong></td>
  <td>${
    "NO VOY A MOSTRAR NADA QUE OS VOLVÉIS LOCOS" ||
    "<span class='muted'>No items available at your turn</span>"
  }</td>
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
      <th>Siguientes 20 destinos disponibles (por tu preferencia) que nadie por encima tuya ha obtenido como destino</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`;
}

// Run allocation with a short “Buena Suerte” splash
async function runAllocation(season) {
  showLuckOverlay();

  try {
    const data = await window.api.allocate(season);
    renderAllocation(data);
  } finally {
    // keep the overlay visible a bit so the animation is noticeable
    await sleep(3000);
    hideLuckOverlay();
  }
}

// Expose globals (used by app.js event wiring)
window.renderAllocation = renderAllocation;
window.runAllocation = runAllocation;
