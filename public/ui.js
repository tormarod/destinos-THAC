// public/ui.js
// UI rendering functions for the allocation system

/**
 * Render clickable items table with search and pagination
 * Displays available destinations that users can select
 */
function renderClickableItems() {
  const ct = document.getElementById("clickItems");
  ct.innerHTML = "";

  if (!Array.isArray(window.state.items) || window.state.items.length === 0) {
    ct.innerHTML = `<p class="muted">No hay destinos para la temporada ${window.state.season}.</p>`;
    return;
  }

  const filtered = window.state.searchTerm
    ? window.state.items.filter((o) =>
        Object.values(o).some(
          (v) =>
            v &&
            String(v).toLowerCase().includes(window.state.searchTerm.toLowerCase()),
        ),
      )
    : window.state.items;

  if (!filtered.length) {
    ct.innerHTML = "<p class='muted'>No hay resultados con ese filtro.</p>";
    return;
  }

  const cols = [
    window.state.idField,
    "Centro directivo",
    "Centro de destino",
    "Localidad",
    "Horario/ATF",
  ].filter(
    (c) => filtered[0] && Object.prototype.hasOwnProperty.call(filtered[0], c),
  );

  // Pagination (kept from previous step)
  const total = filtered.length;
  const pageSize = Math.max(1, Number(window.state.pageSize) || 10);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  window.state.page = Math.min(Math.max(1, window.state.page), totalPages);
  const startIdx = (window.state.page - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, total);
  const slice = filtered.slice(startIdx, endIdx);

  const classFor = (name) => {
    const k = String(name).toLowerCase();
    if (k.includes("provincia")) return "col-provincia";
    if (k.includes("localidad")) return "col-localidad";
    if (k.includes("centro de destino")) return "col-centro";
    if (k.includes("centro directivo")) return "col-centro-directivo";
    if (k.includes("horario")) return "col-horario";
    if (k.includes("vacante")) return "col-id";
    return "";
  };

  // Check if mobile/tablet view (screen width <= 1024px)
  const isMobile = window.innerWidth <= 1024;

  const rows = slice
    .map((o) => {
      const id = String(o[window.state.idField]);
      const isActive = window.state.ranking.includes(id);
      const btnLabel = isActive ? "Eliminar" : "Añadir";
      const btnClass = isActive ? "primary" : "ghost";
      const num = parseInt(o[window.state.idField], 10);
      const highlight = !isNaN(num) && num >= 1 && num <= 199 ? "top199" : "";

      if (isMobile) {
        // Mobile card layout
        return `
<div class="mobile-item-card ${highlight}" data-id="${id}">
  <div class="mobile-item-header">
    <div class="mobile-item-id">#${id}</div>
    <button type="button" class="${btnClass} mobile-btn" data-id="${id}">${btnLabel}</button>
  </div>
  <div class="mobile-item-details">
    <div class="mobile-item-row">
      <span class="mobile-label">Centro directivo:</span>
      <span class="mobile-value">${o["Centro directivo"] || ""}</span>
    </div>
    <div class="mobile-item-row">
      <span class="mobile-label">Centro de destino:</span>
      <span class="mobile-value">${o["Centro de destino"] || ""}</span>
    </div>
    <div class="mobile-item-row">
      <span class="mobile-label">Localidad:</span>
      <span class="mobile-value">${o["Localidad"] || ""}</span>
    </div>
    <div class="mobile-item-row">
      <span class="mobile-label">Horario/ATF:</span>
      <span class="mobile-value">${o["Horario/ATF"] || ""}</span>
    </div>
  </div>
</div>`;
      } else {
        // Desktop table layout
        return `
<tr class="${highlight}">
  ${cols
    .map((c) => `<td class="${classFor(c)}">${o[c] || ""}</td>`)
    .join("")}
  <td class="action" style="text-align:right;">
    <button type="button" class="${btnClass} table-btn" data-id="${id}">${btnLabel}</button>
  </td>
</tr>`;
      }
    })
    .join("");

  if (isMobile) {
    // Mobile card layout
    ct.innerHTML = `
    <div class="mobile-items-container">
      ${rows}
    </div>`;
  } else {
    // Desktop table layout
    ct.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            ${cols.map((c) => `<th class="${classFor(c)}">${c}</th>`).join("")}
            <th class="action"></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  // Add event listeners for item selection
  ct.querySelectorAll("button[data-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const idx = window.state.ranking.indexOf(id);
      if (idx >= 0) {
        window.state.ranking.splice(idx, 1);
      } else {
        window.state.ranking.push(id);
      }
      renderClickableItems();
      renderRankingTable();
      updateQuotaIndicators();
    });
  });

  // Render pagination
  renderPager(totalPages, window.state.page, total, pageSize);
}

/**
 * Render ranking table with drag and drop functionality
 * Displays user's selected destinations in order of preference
 */
function renderRankingTable() {
  const ct = document.getElementById("rankingTable");
  const ids = window.state.ranking;
  if (!ids.length) {
    ct.innerHTML =
      "<p class='muted'>No hay selecciones aún. Añade destinos de la tabla superior.</p>";
    return;
  }

  // Check if mobile/tablet view (screen width <= 1024px)
  const isMobile = window.innerWidth <= 1024;

  const rows = ids
    .map((id, idx) => {
      const o = window.state.itemsById.get(String(id));

      if (isMobile) {
        // Mobile card layout with drag functionality
        return `
<div class="mobile-ranking-card" draggable="true" data-index="${idx}">
  <div class="mobile-ranking-header">
    <div class="mobile-ranking-order">${idx + 1}</div>
    <div class="mobile-ranking-id">#${id}</div>
    <button type="button" class="ghost mobile-btn" data-remove="${id}">Eliminar</button>
  </div>
  <div class="mobile-ranking-details">
    <div class="mobile-ranking-row">
      <span class="mobile-label">Centro directivo:</span>
      <span class="mobile-value">${o ? o["Centro directivo"] || "" : ""}</span>
    </div>
    <div class="mobile-ranking-row">
      <span class="mobile-label">Centro de destino:</span>
      <span class="mobile-value">${o ? o["Centro de destino"] || "" : ""}</span>
    </div>
    <div class="mobile-ranking-row">
      <span class="mobile-label">Localidad:</span>
      <span class="mobile-value">${o ? o["Localidad"] || "" : ""}</span>
    </div>
  </div>
  <div class="mobile-drag-indicator">↕ Arrastra para reordenar</div>
</div>`;
      } else {
        // Desktop table layout
        return `
<tr draggable="true" data-index="${idx}">
  <td class="drag-handle" style="width:40px;cursor:grab;">↕</td>
  <td class="col-id"><strong>${id}</strong></td>
  <td class="col-centro-directivo">${o ? o["Centro directivo"] || "" : ""}</td>
  <td class="col-centro">${o ? o["Centro de destino"] || "" : ""}</td>
  <td class="col-localidad">${o ? o["Localidad"] || "" : ""}</td>
  <td class="action" style="text-align:right;">
    <button type="button" class="ghost table-btn" data-remove="${id}">Eliminar</button>
  </td>
</tr>`;
      }
    })
    .join("");

  if (isMobile) {
    // Mobile card layout
    ct.innerHTML = `
    <div class="mobile-ranking-container">
      ${rows}
    </div>`;
  } else {
    // Desktop table layout
    ct.innerHTML = `
    <div class="table-wrap">
      <table class="drag-table">
        <thead>
          <tr>
            <th class="drag-handle" style="width:40px;"></th>
            <th class="col-id">${window.state.idField}</th>
            <th class="col-centro-directivo">Centro directivo</th>
            <th class="col-centro">Centro de destino</th>
            <th class="col-localidad">Localidad</th>
            <th class="action"></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  // Add event listeners for item removal
  ct.querySelectorAll("button[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.remove;
      const idx = window.state.ranking.indexOf(id);
      if (idx >= 0) window.state.ranking.splice(idx, 1);
      renderClickableItems();
      renderRankingTable();
      updateQuotaIndicators();
    });
  });

  // Set up drag and drop functionality
  setupDragAndDrop(ct, isMobile);
}

/**
 * Update quota indicators to show selection progress
 * Displays how many items the user has selected vs their quota
 */
function updateQuotaIndicators() {
  const selected = window.state.ranking.length;
  const quota = window.state.quota;
  const quotaEl = document.getElementById("quota");
  if (quotaEl) {
    quotaEl.textContent = `${selected}/${quota}`;
  }
}

/**
 * Render pagination controls
 * Shows page numbers and navigation for large item lists
 */
function renderPager(totalPages, currentPage, total, pageSize) {
  const pagerEl = document.getElementById("pager");
  if (!pagerEl) {
    return;
  }

  const startIdx = (currentPage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, total);

  const pager = `
<div class="pager">
  <div class="pager-left">
    Mostrando <strong>${startIdx + 1}</strong>–<strong>${endIdx}</strong> de <strong>${total}</strong>
  </div>
  <div class="pager-right">
    <button type="button" class="pager-btn" data-page="first" ${currentPage === 1 ? "disabled" : ""}>«</button>
    <button type="button" class="pager-btn" data-page="prev" ${currentPage === 1 ? "disabled" : ""}>‹</button>
    <span class="pager-status">Página ${currentPage} / ${totalPages}</span>
    <button type="button" class="pager-btn" data-page="next" ${currentPage === totalPages ? "disabled" : ""}>›</button>
    <button type="button" class="pager-btn" data-page="last" ${currentPage === totalPages ? "disabled" : ""}>»</button>
    <label class="pager-size">
      por página
      <select id="pageSizeSelect">
        ${[10, 25, 50, 100]
          .map(
            (opt) =>
              `<option value="${opt}" ${
                opt === pageSize ? "selected" : ""
              }>${opt}</option>`,
          )
          .join("")}
      </select>
    </label>
  </div>
</div>`.trim();

  pagerEl.innerHTML = pager;

  // Pager buttons and size
  const setPage = (what) => {
    const totalPages2 = Math.max(1, Math.ceil(total / pageSize));
    if (what === "first") window.state.page = 1;
    else if (what === "prev") window.state.page = Math.max(1, window.state.page - 1);
    else if (what === "next")
      window.state.page = Math.min(totalPages2, window.state.page + 1);
    else if (what === "last") window.state.page = totalPages2;
    renderClickableItems();
  };
  
  pagerEl.querySelectorAll(".pager-btn[data-page]").forEach((b) =>
    b.addEventListener("click", () => setPage(b.dataset.page)),
  );
  
  const sel = pagerEl.querySelector("#pageSizeSelect");
  if (sel) {
    sel.addEventListener("change", (e) => {
      window.state.pageSize = Number(e.target.value) || 10;
      window.state.page = 1;
      renderClickableItems();
    });
  }
}

// Export functions for use by other modules
window.uiModule = {
  renderClickableItems,
  renderRankingTable,
  updateQuotaIndicators,
  renderPager,
};
