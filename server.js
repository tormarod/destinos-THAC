// server.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const cors = require("cors");

const DATA_PATH = path.join(__dirname, "data.json");

function loadState() {
  if (fs.existsSync(DATA_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
      submissions = Array.isArray(data.submissions) ? data.submissions : [];
    } catch (e) {
      console.error("Error reading data.json:", e);
      submissions = [];
    }
  } else {
    submissions = [];
  }
}

function saveState() {
  try {
    fs.writeFileSync(
      DATA_PATH,
      JSON.stringify({ submissions }, null, 2),
      "utf-8"
    );
  } catch (e) {
    console.error("Error saving data.json:", e);
  }
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const ITEMS_PATH = path.join(__dirname, "items.json");
if (!fs.existsSync(ITEMS_PATH)) {
  console.error("Missing items.json. Place it next to server.js");
  process.exit(1);
}

// ITEMS are objects WITHOUT 'id'. We use "Nº vacante" as the unique key.
const ID_FIELD = "Nº vacante";
let ITEMS = JSON.parse(fs.readFileSync(ITEMS_PATH, "utf-8"));
const requireId = (o) => {
  if (
    !o ||
    typeof o[ID_FIELD] === "undefined" ||
    String(o[ID_FIELD]).trim() === ""
  ) {
    throw new Error(`Each item must include a non-empty "${ID_FIELD}"`);
  }
};
ITEMS.forEach(requireId);

const itemIndex = new Map(ITEMS.map((o) => [String(o[ID_FIELD]), o]));

// ---- Submissions ----
// rankedItems: array of IDs (values from "Nº vacante")
// order: positive integer; this is the user's QUOTA (how many items they can receive)
let submissions = [];
loadState();

// ---- Helpers ----
const isValidRanking = (ranking) =>
  Array.isArray(ranking) && ranking.every((x) => itemIndex.has(String(x)));

function allocate() {
  // Multi-unit serial dictatorship (round-robin by priority):
  // - Sort users by order number ascending (1 is highest), tie-break by submittedAt.
  // - Each user has quota = 'order' items.
  // - Loop passes; on each pass, give each user their highest-ranked available item,
  //   until all quotas filled or items exhausted.
  const users = [...submissions].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.submittedAt - b.submittedAt;
  });

  const remaining = new Map(); // userId -> remaining quota
  users.forEach((u) => remaining.set(u.id, Math.max(0, Number(u.order) || 0)));

  const taken = new Set(); // set of item IDs already assigned
  const assigned = new Map(users.map((u) => [u.id, []])); // userId -> array of item IDs

  let progress = true;
  while (progress) {
    progress = false;

    for (const u of users) {
      if (remaining.get(u.id) <= 0) continue;

      // find highest-ranked available item for this user
      const choice = (u.rankedItems || []).find((id) => !taken.has(String(id)));
      if (choice !== undefined) {
        const id = String(choice);
        taken.add(id);
        assigned.get(u.id).push(id);
        remaining.set(u.id, remaining.get(u.id) - 1);
        progress = true;
        // continue to next user in this pass
      }
    }
  }

  return users.map((u) => ({
    userId: u.id,
    name: u.name,
    order: u.order,
    quota: u.order,
    rankedItems: u.rankedItems, // array of IDs (Nº vacante values)
    assignedItemIds: assigned.get(u.id) || [], // array of IDs actually assigned
  }));
}

// ---- API ----

// Current state
app.get("/api/state", (req, res) => {
  res.json({ items: ITEMS, submissions, idField: ID_FIELD });
});

// Replace items with new array of objects (must contain the ID_FIELD)
app.post("/api/items", (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Provide a non-empty items array." });
  }
  try {
    items.forEach(requireId);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  ITEMS = items;
  itemIndex.clear();
  for (const o of ITEMS) itemIndex.set(String(o[ID_FIELD]), o);

  // Sanitize existing submissions
  submissions = submissions.map((s) => ({
    ...s,
    rankedItems: (s.rankedItems || []).filter((id) =>
      itemIndex.has(String(id))
    ),
  }));

  res.json({ ok: true, items: ITEMS });
});

// Submit or update ranking
app.post("/api/submit", (req, res) => {
  const { name, order, rankedItems, id } = req.body || {};

  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Name is required." });
  }
  const parsedOrder = Number(order);
  if (!Number.isInteger(parsedOrder) || parsedOrder <= 0) {
    return res.status(400).json({ error: "Order must be a positive integer." });
  }
  if (!isValidRanking(rankedItems)) {
    return res.status(400).json({
      error: `rankedItems must be an array of valid "${ID_FIELD}" values.`,
    });
  }

  const userId =
    id && typeof id === "string"
      ? id
      : `u_${Math.random().toString(36).slice(2)}`;

  // Keep the user's full ranking (deduplicated), no cap here
  const uniqueRanking = Array.from(
    new Set(rankedItems.map((x) => String(x)))
  ).filter((x) => itemIndex.has(x));

  const existingIdx = submissions.findIndex((s) => s.id === userId);
  const payload = {
    id: userId,
    name: name.trim(),
    order: parsedOrder, // QUOTA (used only by allocator)
    rankedItems: uniqueRanking, // keep full preference list
    submittedAt:
      existingIdx >= 0 ? submissions[existingIdx].submittedAt : Date.now(),
  };

  if (existingIdx >= 0) submissions[existingIdx] = payload;
  else submissions.push(payload);
  saveState();

  res.json({ ok: true, id: userId, submission: payload });
});

// Run allocation
app.post("/api/allocate", (req, res) => {
  const allocation = allocate();
  res.json({ items: ITEMS, allocation, idField: ID_FIELD });
});

// Reset
app.post("/api/reset", (req, res) => {
  submissions = [];
  saveState();
  res.json({ ok: true });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(
    "Accessible from your network at: http://" + getLocalIp() + ":" + PORT
  );
});

function getLocalIp() {
  const os = require("os");
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "localhost";
}
