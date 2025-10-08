// ===== DOM utils =====
const $ = (id) => document.getElementById(id);

// ===== Global state =====
const state = {
  idField: "Nº vacante",
  items: [],
  itemsById: new Map(),
  ranking: [],
  quota: 0,
  maxClickable: 9999999,
  maxItemsTable: 9999999,
  searchTerm: "",
};

// ===== Local user ID helpers =====
const LOCAL_KEY = "allocator:userId";
const getLocalUserId = () => localStorage.getItem(LOCAL_KEY) || "";
const setLocalUserId = (id) => localStorage.setItem(LOCAL_KEY, id);
const clearLocalUserId = () => localStorage.removeItem(LOCAL_KEY);

// ===== Small helpers =====
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

// Remote order check against DynamoDB (server-side)
async function isOrderTakenRemote(order) {
  const desired = normalizeOrder(order);
  if (desired === null) return { taken: false };

  const localId = getLocalUserId() || $("userId").value || "";
  const data = await api.getOrders().catch(() => ({ orders: [] }));
  const list = Array.isArray(data.orders) ? data.orders : [];

  const conflict = list.find(
    (o) => normalizeOrder(o.order) === desired && o.id !== localId
  );
  return conflict
    ? { taken: true, by: conflict.name || conflict.id }
    : { taken: false };
}

// ===== Renderers (items, ranking, submissions) =====
function renderClickableItems() {
  const ct = $("clickItems");
  ct.innerHTML = "";
  const filtered = state.searchTerm
    ? state.items.filter((o) =>
        Object.values(o).some(
          (v) =>
            v &&
            String(v).toLowerCase().includes(state.searchTerm.toLowerCase())
        )
      )
    : state.items;

  const items = filtered.slice(0, state.maxClickable);
  if (!items.length) {
    ct.innerHTML = "<p class='muted'>No items loaded.</p>";
    return;
  }

  const cols = [
    state.idField,
    "Centro de destino",
    "Localidad",
    "Provincia",
    "Horario/ATF",
  ].filter(
    (c) => items[0] && Object.prototype.hasOwnProperty.call(items[0], c)
  );

  const rows = items
    .map((o) => {
      const id = String(o[state.idField]);
      const isActive = state.ranking.includes(id);
      const btnLabel = isActive ? "Eliminar" : "Añadir";
      const btnClass = isActive ? "primary" : "ghost";
      const num = parseInt(o[state.idField], 10);
      const highlight = !isNaN(num) && num >= 1 && num <= 199 ? "top199" : "";

      return `
<tr class="${highlight}">
  ${cols.map((c) => `<td>${o[c] != null ? o[c] : ""}</td>`).join("")}
  <td style="text-align:right;">
    <button type="button" class="${btnClass}" data-id="${id}">${btnLabel}</button>
  </td>
</tr>`;
    })
    .join("");

  ct.innerHTML = `
  <table>
    <thead>
      <tr>
        ${cols.map((c) => `<th>${c}</th>`).join("")}
        <th></th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  ${
    state.items.length > items.length
      ? `<div class="muted" style="margin-top:8px;">Mostrando ${items.length} de ${state.items.length} destinos.</div>`
      : ""
  }`;

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
  <td style="width:40px;cursor:grab;">↕</td>
  <td><strong>${id}</strong></td>
  <td>${o ? o["Centro de destino"] || "" : ""}</td>
  <td>${o ? o["Localidad"] || "" : ""}</td>
  <td>${o ? o["Provincia"] || "" : ""}</td>
  <td style="text-align:right;">
    <button type="button" class="ghost" data-remove="${id}">Eliminar</button>
  </td>
</tr>`;
    })
    .join("");

  ct.innerHTML = `
  <table class="drag-table">
    <thead>
      <tr>
        <th style="width:40px;"></th>
        <th>${state.idField}</th>
        <th>Centro de destino</th>
        <th>Localidad</th>
        <th>Provincia</th>
        <th></th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;

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

// ===== Data loading =====
async function fetchState() {
  const data = await api.getState();

  state.items = data.items || [];
  state.idField = data.idField || state.idField;
  state.itemsById = new Map(
    state.items.map((o) => [String(o[state.idField]), o])
  );

  const localId = getLocalUserId();
  let prefill = null;
  if (localId && Array.isArray(data.submissions)) {
    prefill = data.submissions.find((s) => s.id === localId) || null;
  }

  if (prefill) {
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

// ===== Actions =====
async function submitRanking(e) {
  e.preventDefault();

  const name = $("name").value.trim();
  const orderRaw = $("order").value;
  const orderVal = normalizeOrder(orderRaw);
  const rankedItems = [...state.ranking];
  const id = $("userId").value || getLocalUserId() || undefined;

  if (!name) return alert("Please enter your name.");
  if (orderVal === null) return alert("Order must be a positive integer.");
  if (!rankedItems.length) return alert("Select at least one item.");

  try {
    const { taken } = await (async () => {
      try {
        return await (async () => await (await api.getOrders()).orders,
        await isOrderTakenRemote(orderVal))();
      } catch {
        return { taken: false };
      }
    })();
    if (taken) {
      const proceed = confirm(
        `El orden ${orderVal} ya está siendo usado por otro usuario.\n\n` +
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

  const data = await api.submit({ name, order: orderVal, rankedItems, id });
  if (data.id) {
    setLocalUserId(data.id);
    $("userId").value = data.id;
  }

  await fetchState();
  alert("Saved!");
}

async function resetAll() {
  const localId = getLocalUserId();
  if (!localId) {
    alert("No local user ID found. Submit once to create your user first.");
    return;
  }
  if (!confirm("Remove ONLY this browser user’s submissions?")) return;

  const data = await api.resetUser(localId);
  state.ranking = [];
  await fetchState();
  $("allocationResult").innerHTML = "";
  alert(`Removed ${data.removed ?? 0} submission(s) for this user.`);
}

// ===== Event wiring =====
document.addEventListener("DOMContentLoaded", () => {
  $("submitForm").addEventListener("submit", submitRanking);
  $("allocateBtn").addEventListener(
    "click",
    () => window.runAllocation && window.runAllocation()
  );
  $("resetAllBtn").addEventListener("click", resetAll);
  $("itemSearch").addEventListener("input", (e) => {
    state.searchTerm = e.target.value.trim();
    renderClickableItems();
  });
  $("resetSelfBtn").addEventListener("click", () => {
    resetAll();
    clearLocalUserId();
    $("userId").value = "";
    alert(
      "Cleared your local user ID. Future submissions will create a new one."
    );
  });
  $("order").addEventListener("input", () => {
    state.quota = Math.max(0, Number($("order").value) || 0);
    renderClickableItems();
    updateQuotaIndicators();
  });

  $("userId").value = getLocalUserId();

  fetchState().then(() => {
    state.quota = Math.max(0, Number($("order").value) || 0);
    updateQuotaIndicators();
  });
});
