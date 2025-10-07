// server.js
require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const fetch = require("node-fetch");

const JSONBIN_BIN_URL = process.env.JSONBIN_BIN_URL; // e.g. https://api.jsonbin.io/v3/b/xxxxxxxx
const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY; // from jsonbin.io dashboard

function assertJsonBinConfig() {
  if (!JSONBIN_BIN_URL || !JSONBIN_API_KEY) {
    console.warn(
      "[state] JSONBin not configured (set JSONBIN_BIN_URL and JSONBIN_API_KEY). Falling back to in-memory only."
    );
    return false;
  }
  return true;
}

async function loadState() {
  if (!assertJsonBinConfig()) return;

  try {
    const r = await fetch(process.env.JSONBIN_BIN_URL, {
      headers: { "X-Master-Key": process.env.JSONBIN_API_KEY },
    });
    if (!r.ok) {
      console.warn(`[state] JSONBin GET failed: ${r.status} ${r.statusText}`);
      return;
    }
    const payload = await r.json();
    const record = payload.record || payload;

    // Only load submissions from JSONBin; keep ITEMS from items.json
    submissions = Array.isArray(record.submissions) ? record.submissions : [];
    console.log(
      `[state] Loaded ${submissions.length} submissions from JSONBin`
    );
  } catch (e) {
    console.error("[state] load error from JSONBin:", e);
  }
}

// expects: JSONBIN_BIN_URL like "https://api.jsonbin.io/v3/b/<BIN_ID>"
// expects: JSONBIN_API_KEY = your Master Key (from JSONBin account)
// requires Node 18+ or node-fetch polyfill

async function saveState() {
  if (!assertJsonBinConfig()) return;

  // Optional compaction: keep only the latest submission per userId
  const latestByUser = new Map();
  for (const s of submissions) {
    const prev = latestByUser.get(s.id);
    if (!prev || (s.submittedAt || 0) > (prev.submittedAt || 0)) {
      latestByUser.set(s.id, {
        id: s.id,
        name: s.name,
        order: s.order,
        rankedItems: s.rankedItems,
        submittedAt: s.submittedAt,
      });
    }
  }
  const compactSubs = Array.from(latestByUser.values());

  const record = { submissions: compactSubs, savedAt: Date.now() };
  const body = JSON.stringify(record);

  // Quick size meter to help stay < 100 KB
  const bytes = Buffer.byteLength(body, "utf8");
  const kb = Math.round((bytes / 1024) * 10) / 10;
  if (bytes > 95 * 1024) {
    console.warn(
      `[state] Warning: payload ~${kb} KB (close to JSONBin free limit 100 KB). Consider pruning old submissions.`
    );
  }

  // Ensure we PUT to /v3/b/<id> (not /latest)
  const putUrl = process.env.JSONBIN_BIN_URL.replace(
    /\/latest\/?$/i,
    ""
  ).replace(/\/$/, "");

  try {
    const r = await fetch(putUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": process.env.JSONBIN_API_KEY,
      },
      body,
    });

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      console.warn(
        `[state] JSONBin PUT failed: ${r.status} ${r.statusText} — ${text}`
      );
      return;
    }

    console.log(
      `[state] Saved ${compactSubs.length} submissions to JSONBin (${kb} KB)`
    );
  } catch (e) {
    console.error("[state] save error to JSONBin:", e);
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

app.post("/api/reset-user", async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ error: "userId is required" });
    }
    const before = submissions.length;
    submissions = submissions.filter((s) => s.id !== userId);
    if (typeof saveState === "function") {
      await saveState();
    }
    return res.json({ ok: true, removed: before - submissions.length });
  } catch (e) {
    console.error("reset-user error:", e);
    return res.status(500).json({ error: "Internal error" });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
async function start() {
  await loadState(); // hydrate from JSONBin before serving traffic
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Local network IP: http://${getLocalIp()}:${PORT}`);
  });
}

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

start();
