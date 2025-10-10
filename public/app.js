// public/app.js

const $ = (id) => document.getElementById(id);

const state = {
  idField: "Nº vacante",
  season: null,
  items: [],
  itemsById: new Map(),
  ranking: [],
  quota: 0,
  maxClickable: 9999999,
  maxItemsTable: 9999999,
  searchTerm: "",
  page: 1,
  pageSize: 10, // default page size
};

const LOCAL_KEY = "allocator:userId";
const SEASON_KEY = "allocator:season";
const getLocalUserId = () => localStorage.getItem(LOCAL_KEY) || "";
const setLocalUserId = (id) => localStorage.setItem(LOCAL_KEY, id);
const clearLocalUserId = () => localStorage.removeItem(LOCAL_KEY);

function getSeason() {
  return localStorage.getItem(SEASON_KEY) || String(new Date().getFullYear());
}
function setSeason(s) {
  localStorage.setItem(SEASON_KEY, String(s));
  state.season = String(s);
}

// Populate season select (current year ± 4)
function populateSeasonSelect() {
  const sel = $("seasonSelect");
  const current = Number(new Date().getFullYear());
  const chosen = Number(getSeason());
  const years = [];
  for (let y = current + 1; y >= current - 4; y--) years.push(y);
  sel.innerHTML = years
    .map(
      (y) =>
        `<option value="${y}" ${y === chosen ? "selected" : ""}>${y}</option>`
    )
    .join("");
  state.season = String(chosen);
  sel.addEventListener("change", async (e) => {
    const s = e.target.value;
    setSeason(s);
    state.ranking = [];
    state.page = 1; // ← reset page on season change
    await fetchState();
  });
}

function labelFor(o) {
  if (!o) return "(unknown)";
  const id = o[state.idField];
  const parts = [];
  if (o["Centro de destino"]) parts.push(o["Centro de destino"]);
  if (o["Localidad"]) parts.push(o["Localidad"]);
  if (o["Provincia"]) parts.push(o["Provincia"]);
  return `#${id} · ${parts.join(" · ")}`.replace(/ · $/, "");
}

function normalizeOrder(v) {
  if (v === null || v === undefined) return null;
  const n = parseInt(String(v).trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function isOrderTakenRemote(order) {
  const desired = normalizeOrder(order);
  if (desired === null) return { taken: false };

  const localId = getLocalUserId() || $("userId").value || "";
  const data = await api.getOrders(state.season).catch(() => ({ orders: [] }));
  const list = Array.isArray(data.orders) ? data.orders : [];

  const conflict = list.find(
    (o) => normalizeOrder(o.order) === desired && o.id !== localId
  );
  return conflict
    ? { taken: true, by: conflict.name || conflict.id }
    : { taken: false };
}

function renderClickableItems() {
  const ct = $("clickItems");
  ct.innerHTML = "";

  if (!Array.isArray(state.items) || state.items.length === 0) {
    ct.innerHTML = `<p class="muted">No hay destinos para la temporada ${state.season}.</p>`;
    return;
  }

  const filtered = state.searchTerm
    ? state.items.filter((o) =>
        Object.values(o).some(
          (v) =>
            v &&
            String(v).toLowerCase().includes(state.searchTerm.toLowerCase())
        )
      )
    : state.items;

  if (!filtered.length) {
    ct.innerHTML = "<p class='muted'>No hay resultados con ese filtro.</p>";
    return;
  }

  const cols = [
    state.idField,
    "Centro de destino",
    "Localidad",
    "Provincia",
    "Horario/ATF",
  ].filter(
    (c) => filtered[0] && Object.prototype.hasOwnProperty.call(filtered[0], c)
  );

  // Pagination (kept from previous step)
  const total = filtered.length;
  const pageSize = Math.max(1, Number(state.pageSize) || 50);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  state.page = Math.min(Math.max(1, state.page), totalPages);
  const startIdx = (state.page - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, total);
  const slice = filtered.slice(startIdx, endIdx);

  const classFor = (name) => {
    const k = String(name).toLowerCase();
    if (k.includes("provincia")) return "col-provincia";
    if (k.includes("localidad")) return "col-localidad";
    if (k.includes("centro")) return "col-centro";
    if (k.includes("horario")) return "col-horario";
    if (k.includes("vacante")) return "col-id";
    return "";
  };

  const rows = slice
    .map((o) => {
      const id = String(o[state.idField]);
      const isActive = state.ranking.includes(id);
      const btnLabel = isActive ? "Eliminar" : "Añadir";
      const btnClass = isActive ? "primary" : "ghost";
      const num = parseInt(o[state.idField], 10);
      const highlight = !isNaN(num) && num >= 1 && num <= 199 ? "top199" : "";

      return `
<tr class="${highlight}">
  ${cols
    .map((c) => `<td class="${classFor(c)}">${o[c] != null ? o[c] : ""}</td>`)
    .join("")}
  <td class="action" style="text-align:right;">
    <button type="button" class="${btnClass} table-btn" data-id="${id}">${btnLabel}</button>
  </td>
</tr>`;
    })
    .join("");

  const pager = `
<div class="pager">
  <div class="pager-left">
    Mostrando <strong>${
      startIdx + 1
    }</strong>–<strong>${endIdx}</strong> de <strong>${total}</strong>
  </div>
  <div class="pager-right">
    <button type="button" class="pager-btn" data-page="first" ${
      state.page === 1 ? "disabled" : ""
    }>«</button>
    <button type="button" class="pager-btn" data-page="prev" ${
      state.page === 1 ? "disabled" : ""
    }>‹</button>
    <span class="pager-status">Página ${state.page} / ${totalPages}</span>
    <button type="button" class="pager-btn" data-page="next" ${
      state.page === totalPages ? "disabled" : ""
    }>›</button>
    <button type="button" class="pager-btn" data-page="last" ${
      state.page === totalPages ? "disabled" : ""
    }>»</button>
    <label class="pager-size">
      por página
      <select id="pageSizeSelect">
        ${[25, 50, 100, 200]
          .map(
            (opt) =>
              `<option value="${opt}" ${
                opt === pageSize ? "selected" : ""
              }>${opt}</option>`
          )
          .join("")}
      </select>
    </label>
  </div>
</div>`.trim();

  ct.innerHTML = `
  <div class="table-wrap">
    <table class="items-table">
      <thead>
        <tr>
          ${cols.map((c) => `<th class="${classFor(c)}">${c}</th>`).join("")}
          <th class="action"></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  ${pager}
  `;

  // Row buttons
  ct.querySelectorAll("button[data-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const idx = state.ranking.indexOf(id);
      if (idx >= 0) {
        state.ranking.splice(idx, 1);
      } else {
        state.ranking.push(id);
      }
      renderClickableItems();
      renderRankingTable();
      updateQuotaIndicators();
    });
  });

  // Pager buttons and size
  const setPage = (what) => {
    const totalPages2 = Math.max(1, Math.ceil(total / pageSize));
    if (what === "first") state.page = 1;
    else if (what === "prev") state.page = Math.max(1, state.page - 1);
    else if (what === "next")
      state.page = Math.min(totalPages2, state.page + 1);
    else if (what === "last") state.page = totalPages2;
    renderClickableItems();
  };
  ct.querySelectorAll(".pager-btn[data-page]").forEach((b) =>
    b.addEventListener("click", () => setPage(b.dataset.page))
  );
  const sel = ct.querySelector("#pageSizeSelect");
  if (sel) {
    sel.addEventListener("change", (e) => {
      state.pageSize = Number(e.target.value) || 50;
      state.page = 1;
      renderClickableItems();
    });
  }
}

function renderRankingTable() {
  const ct = $("rankingTable");
  const ids = state.ranking;
  if (!ids.length) {
    ct.innerHTML =
      "<p class='muted'>No hay selecciones aún. Añade destinos de la tabla superior.</p>";
    return;
  }

  const rows = ids
    .map((id, idx) => {
      const o = state.itemsById.get(String(id));
      return `
<tr draggable="true" data-index="${idx}">
  <td class="drag-handle" style="width:40px;cursor:grab;">↕</td>
  <td class="col-id"><strong>${id}</strong></td>
  <td class="col-centro">${o ? o["Centro de destino"] || "" : ""}</td>
  <td class="col-localidad">${o ? o["Localidad"] || "" : ""}</td>
  <td class="col-provincia">${o ? o["Provincia"] || "" : ""}</td>
  <td class="action" style="text-align:right;">
    <button type="button" class="ghost table-btn" data-remove="${id}">Eliminar</button>
  </td>
</tr>`;
    })
    .join("");

  ct.innerHTML = `
  <div class="table-wrap">
    <table class="drag-table">
      <thead>
        <tr>
          <th class="drag-handle" style="width:40px;"></th>
          <th class="col-id">${state.idField}</th>
          <th class="col-centro">Centro de destino</th>
          <th class="col-localidad">Localidad</th>
          <th class="col-provincia">Provincia</th>
          <th class="action"></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;

  ct.querySelectorAll("button[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.remove;
      const idx = state.ranking.indexOf(id);
      if (idx >= 0) state.ranking.splice(idx, 1);
      renderClickableItems();
      renderRankingTable();
      updateQuotaIndicators();
    });
  });

  const tbody = ct.querySelector("tbody");
  let dragIndex = null;

  tbody.querySelectorAll("tr").forEach((tr) => {
    tr.addEventListener("dragstart", (e) => {
      dragIndex = Number(tr.dataset.index);
      tr.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    tr.addEventListener("dragend", () => {
      tr.classList.remove("dragging");
    });
    tr.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    tr.addEventListener("drop", (e) => {
      e.preventDefault();
      const overIndex = Number(e.currentTarget.dataset.index);
      if (dragIndex === null || overIndex === dragIndex) return;
      const moved = state.ranking.splice(dragIndex, 1)[0];
      state.ranking.splice(overIndex, 0, moved);
      renderRankingTable();
      updateQuotaIndicators();
    });
  });
}

function updateQuotaIndicators() {
  const selected = state.ranking.length;
  const quota = state.quota;
  const remaining = quota - selected;
  $("quota").textContent = String(quota);
  $("selectedCount").textContent = String(selected);
  $("remaining").textContent = String(remaining);
}

function renderSubs(subs) {
  const ct = $("subs");
  const localId = getLocalUserId();

  if (!localId) {
    ct.innerHTML =
      "<p class='muted'>No hay ID de usuario local. Envia tu ranking para crear un usuario.</p>";
    return;
  }

  const mine = subs.filter((s) => s.id === localId);
  if (!mine.length) {
    ct.innerHTML = "<p class='muted'>No hay destinos para este usuario.</p>";
    return;
  }

  const rows = mine
    .sort((a, b) => a.order - b.order || a.submittedAt - b.submittedAt)
    .map(
      (s) => `
<tr>
  <td>${s.order}</td>
  <td>${s.name}</td>
  <td>${(s.rankedItems || []).join(" » ")}</td>
  <td class="muted">${new Date(s.submittedAt).toLocaleString()}</td>
</tr>`
    )
    .join("");

  ct.innerHTML = `
<table>
  <thead>
    <tr>
      <th>Tu posición</th>
      <th>Nombre</th>
      <th>Tus destinos</th>
      <th>Fecha de envío</th></tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`;
}

async function fetchState() {
  // Try to load; if the request fails hard, fall back to an "empty" state
  let data;
  try {
    data = await api.getState(state.season);
  } catch {
    data = {
      items: [],
      submissions: [],
      idField: state.idField,
      season: state.season,
      notFound: true,
    };
  }

  state.items = Array.isArray(data.items) ? data.items : [];
  state.idField = data.idField || state.idField;
  state.itemsById = new Map(
    state.items.map((o) => [String(o[state.idField]), o])
  );

  state.page = 1; // reset to first page on new data load

  const localId = getLocalUserId();
  let prefill = null;
  if (localId && Array.isArray(data.submissions)) {
    prefill = data.submissions.find((s) => s.id === localId) || null;
  }

  if (state.items.length === 0) {
    // No catalog for this season → clear selection to avoid mismatches
    state.ranking = [];
  } else if (prefill) {
    $("name").value = prefill.name || "";
    $("order").value = Number(prefill.order) || 0;

    state.quota = Math.max(0, Number(prefill.order) || 0);
    state.ranking = (prefill.rankedItems || [])
      .map((id) => String(id))
      .filter((id) => state.itemsById.has(id));
  } else {
    state.quota = Math.max(0, Number($("order").value) || 0);
    state.ranking = state.ranking.filter((id) => state.itemsById.has(id));
  }

  renderClickableItems();
  renderRankingTable();
  renderSubs(data.submissions || []);
  updateQuotaIndicators();
}

async function submitRanking(e) {
  e.preventDefault();

  const name = $("name").value.trim();
  const orderRaw = $("order").value;
  const orderVal = normalizeOrder(orderRaw);
  const rankedItems = [...state.ranking];
  const id = $("userId").value || getLocalUserId() || undefined;

  if (!name) return alert("Por favor, introduce tu nombre.");
  if (orderVal === null)
    return alert("El orden debe ser un número entero positivo.");
  if (!rankedItems.length) return alert("Selecciona al menos un destino.");

  try {
    const { taken } = await isOrderTakenRemote(orderVal);
    if (taken) {
      const proceed = confirm(
        `El orden ${orderVal} ya está siendo usado por otro usuario en ${state.season}.\n\n` +
          `Pulsa Aceptar para usarlo igualmente, o Cancelar para elegir otro número.`
      );
      if (!proceed) {
        $("order").value = "";
        state.quota = 0;
        updateQuotaIndicators();
        renderClickableItems();
        return;
      }
    }
  } catch {}

  const data = await api.submit({
    name,
    order: orderVal,
    rankedItems,
    id,
    season: state.season, // ✅ include season
  });

  if (data.id) {
    setLocalUserId(data.id);
    $("userId").value = data.id;
  }

  await fetchState();
  alert("¡Guardado correctamente!");
}

async function resetAll() {
  const localId = getLocalUserId();
  if (!localId) {
    alert(
      "No se encontró un ID de usuario local. Envía tu ranking una vez para crear tu usuario primero."
    );
    return;
  }
  if (
    !confirm(
      `¿Eliminar SOLO las solicitudes de este usuario local para la temporada ${state.season}?`
    )
  )
    return;

  try {
    const data = await api.resetUser(localId, state.season); // send season
    state.ranking = [];
    await fetchState();
    $("allocationResult").innerHTML = "";
    alert(
      `Se eliminaron ${data.removed ?? 0} solicitud(es) para este usuario.`
    );
  } catch (e) {
    console.error("/api/reset-user failed:", e.status, e.body || e);
    alert(e.message || "No se pudo restablecer tus solicitudes");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  populateSeasonSelect();

  $("submitForm").addEventListener("submit", submitRanking);
  $("allocateBtn").addEventListener("click", async () => {
    if (window.runAllocation) {
      await window.runAllocation(state.season);
    }
  });
  $("resetAllBtn").addEventListener("click", resetAll);
  $("itemSearch").addEventListener("input", (e) => {
    state.searchTerm = e.target.value.trim();
    state.page = 1; // reset to first page on new search
    renderClickableItems();
  });
  $("resetSelfBtn").addEventListener("click", async () => {
    const uid = getLocalUserId();
    if (!uid) {
      alert("No se encontró un ID de usuario local.");
      return;
    }
    const ok = confirm(
      "Esto eliminará TODAS tus solicitudes en TODAS las temporadas y borrará tu ID local. ¿Continuar?"
    );
    if (!ok) return;

    try {
      const data = await api.resetUserEverywhere(uid); // delete across seasons
      // Also clear any local state for the current season
      state.ranking = [];
      await fetchState();

      clearLocalUserId();
      $("userId").value = "";

      alert(
        `Se eliminaron ${
          data.removed ?? 0
        } registro(s) en DynamoDB y se borró tu ID local.`
      );
    } catch (e) {
      console.error("resetUserEverywhere failed:", e);
      alert(e.message || "No se pudo eliminar tus solicitudes.");
    }
  });

  $("order").addEventListener("input", () => {
    state.quota = Math.max(0, Number($("order").value) || 0);
    renderClickableItems();
    updateQuotaIndicators();
  });

  $("userId").value = getLocalUserId();
  setSeason(getSeason()); // initialize

  fetchState().then(() => {
    state.quota = Math.max(0, Number($("order").value) || 0);
    updateQuotaIndicators();
  });
});
