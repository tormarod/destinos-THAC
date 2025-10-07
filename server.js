// server.js
require("dotenv").config();
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  BatchWriteCommand,
  QueryCommand,
  DeleteCommand,
  PutCommand,
} = require("@aws-sdk/lib-dynamodb");
const express = require("express");
const path = require("path");
const fs = require("fs");
const cors = require("cors");

const DDB_TABLE = process.env.DDB_TABLE;
let ddbDoc = null;

function assertDdbConfig() {
  if (
    !process.env.AWS_REGION ||
    !process.env.AWS_ACCESS_KEY_ID ||
    !process.env.AWS_SECRET_ACCESS_KEY ||
    !DDB_TABLE
  ) {
    console.warn(
      "[state] DynamoDB not configured: set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, DDB_TABLE"
    );
    return false;
  }
  return true;
}

function getDdb() {
  if (ddbDoc) return ddbDoc;
  const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });
  ddbDoc = DynamoDBDocumentClient.from(ddb, {
    marshallOptions: {
      removeUndefinedValues: true,
      convertClassInstanceToMap: true,
    },
  });
  return ddbDoc;
}

// Keep only latest submission per user (same as before)
function latestPerUser(array) {
  const m = new Map();
  for (const s of array || []) {
    const prev = m.get(s.id);
    if (!prev || (s.submittedAt || 0) > (prev.submittedAt || 0)) m.set(s.id, s);
  }
  return Array.from(m.values());
}

async function ddbFetchAllSubmissions() {
  if (!assertDdbConfig()) return [];
  const ddb = getDdb();

  const all = [];
  let ExclusiveStartKey;
  do {
    const resp = await ddb.send(
      new QueryCommand({
        TableName: DDB_TABLE,
        KeyConditionExpression: "#t = :type",
        ExpressionAttributeNames: { "#t": "type" },
        ExpressionAttributeValues: { ":type": "SUBMISSION" },
        ExclusiveStartKey,
      })
    );
    (resp.Items || []).forEach((it) => {
      all.push({
        id: it.id,
        name: it.name,
        order: it.order,
        rankedItems: it.rankedItems,
        submittedAt: it.submittedAt,
      });
    });
    ExclusiveStartKey = resp.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return all;
}

async function loadState() {
  if (!assertDdbConfig()) return; // fall back to items.json + in-memory submissions

  try {
    const ddb = getDdb();
    // Query all items with type = "SUBMISSION"
    const resp = await ddb.send(
      new QueryCommand({
        TableName: DDB_TABLE,
        KeyConditionExpression: "#t = :type",
        ExpressionAttributeNames: { "#t": "type" },
        ExpressionAttributeValues: { ":type": "SUBMISSION" },
      })
    );

    // Each item stores the latest submission for that user
    submissions = (resp.Items || []).map((it) => ({
      id: it.id,
      name: it.name,
      order: it.order,
      rankedItems: it.rankedItems,
      submittedAt: it.submittedAt,
    }));

    console.log(
      `[state] Loaded ${submissions.length} submissions from DynamoDB`
    );
  } catch (e) {
    console.error("[state] DynamoDB load error:", e);
  }
}

async function saveState() {
  if (!assertDdbConfig()) return;

  try {
    const ddb = getDdb();
    const compact = latestPerUser(submissions);

    // BatchWrite supports 25 items per batch
    const chunks = [];
    for (let i = 0; i < compact.length; i += 25) {
      chunks.push(compact.slice(i, i + 25));
    }

    for (const chunk of chunks) {
      const RequestItems = {
        [DDB_TABLE]: chunk.map((s) => ({
          PutRequest: {
            Item: {
              type: "SUBMISSION",
              id: s.id,
              name: s.name,
              order: s.order,
              rankedItems: s.rankedItems,
              submittedAt: s.submittedAt ?? Date.now(),
            },
          },
        })),
      };
      await ddb.send(new BatchWriteCommand({ RequestItems }));
    }

    console.log(`[state] Saved ${compact.length} submissions to DynamoDB`);
  } catch (e) {
    console.error("[state] DynamoDB save error:", e);
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
  // Sort by priority: lower order first, then earlier submission time
  const users = [...submissions].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.submittedAt - b.submittedAt;
  });

  const remainingQuota = new Map();
  users.forEach((u) =>
    remainingQuota.set(u.id, Math.max(0, Number(u.order) || 0))
  );

  const takenFinal = new Set(); // items taken overall
  const assigned = new Map(users.map((u) => [u.id, []])); // userId -> assigned array

  // Round-robin assignment up to each user's quota
  let progress = true;
  while (progress) {
    progress = false;
    for (const u of users) {
      if (remainingQuota.get(u.id) <= 0) continue;
      const next = (u.rankedItems || []).find(
        (id) => !takenFinal.has(String(id))
      );
      if (typeof next !== "undefined") {
        const id = String(next);
        takenFinal.add(id);
        assigned.get(u.id).push(id);
        remainingQuota.set(u.id, remainingQuota.get(u.id) - 1);
        progress = true;
      }
    }
  }

  // Compute "available by preference" for each user:
  // items not taken by anyone *above* them in priority, preserving their ranking order.
  const availableByPref = new Map();
  const takenByHigher = new Set();
  for (const u of users) {
    const list = (u.rankedItems || [])
      .map(String)
      .filter((id) => !takenByHigher.has(id));
    availableByPref.set(u.id, list);
    // After computing current user's view, add their assigned items to the higher set
    for (const id of assigned.get(u.id)) takenByHigher.add(id);
  }

  // Return full allocation info
  return users.map((u) => ({
    userId: u.id,
    name: u.name,
    order: u.order,
    rankedItems: u.rankedItems || [],
    assignedItemIds: assigned.get(u.id) || [],
    availableByPreference: availableByPref.get(u.id) || [],
  }));
}

// ---- API ----

// Current state
app.get("/api/state", async (req, res) => {
  try {
    // Always refresh from DynamoDB so the server mirrors reality
    if (assertDdbConfig()) {
      submissions = await ddbFetchAllSubmissions();
    }
    res.json({ items: ITEMS, submissions, idField: ID_FIELD });
  } catch (e) {
    console.error("/api/state error:", e);
    res.status(500).json({ error: "Failed to load state" });
  }
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
app.post("/api/submit", async (req, res) => {
  try {
    const { name, order, rankedItems, id } = req.body || {};
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "Name is required." });
    }
    const parsedOrder = Number(order);
    if (!Number.isInteger(parsedOrder) || parsedOrder <= 0) {
      return res
        .status(400)
        .json({ error: "Order must be a positive integer." });
    }
    // validate ranked items against ITEMS
    const validIds = new Set(ITEMS.map((o) => String(o[ID_FIELD])));
    const uniqueRanking = Array.from(
      new Set((rankedItems || []).map((x) => String(x)))
    ).filter((x) => validIds.has(x));

    const userId =
      id && typeof id === "string"
        ? id
        : `u_${Math.random().toString(36).slice(2)}`;
    const now = Date.now();

    // Update in-memory copy (for immediate responses)
    const idx = submissions.findIndex((s) => s.id === userId);
    const payload = {
      id: userId,
      name: name.trim(),
      order: parsedOrder,
      rankedItems: uniqueRanking,
      submittedAt: idx >= 0 ? submissions[idx].submittedAt : now,
    };
    if (idx >= 0) submissions[idx] = payload;
    else submissions.push(payload);

    // Write ONLY this user to DynamoDB
    if (assertDdbConfig()) {
      const ddb = getDdb();
      await ddb.send(
        new PutCommand({
          TableName: DDB_TABLE,
          Item: {
            type: "SUBMISSION",
            id: userId,
            name: payload.name,
            order: payload.order,
            rankedItems: payload.rankedItems,
            submittedAt: payload.submittedAt,
          },
        })
      );
    }

    res.json({ ok: true, id: userId, submission: payload });
  } catch (e) {
    console.error("/api/submit error:", e);
    res.status(500).json({ error: "Internal error" });
  }
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

    if (assertDdbConfig()) {
      const ddb = getDdb();
      await ddb.send(
        new DeleteCommand({
          TableName: DDB_TABLE,
          Key: { type: "SUBMISSION", id: userId },
        })
      );
    }

    res.json({ ok: true, removed: before - submissions.length });
  } catch (e) {
    console.error("/api/reset-user error:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

app.get("/api/orders", async (req, res) => {
  try {
    if (!assertDdbConfig()) {
      return res.status(500).json({ error: "DynamoDB not configured" });
    }

    const ddb = getDdb();
    const orders = [];
    let ExclusiveStartKey;

    do {
      const resp = await ddb.send(
        new QueryCommand({
          TableName: DDB_TABLE,
          KeyConditionExpression: "#t = :type",
          ExpressionAttributeNames: {
            "#t": "type",
            "#o": "order",
            "#n": "name",
          },
          ExpressionAttributeValues: { ":type": "SUBMISSION" },
          ProjectionExpression: "id, #o, #n",
          ExclusiveStartKey,
        })
      );

      for (const it of resp.Items || []) {
        orders.push({
          order: it.order,
        });
      }
      ExclusiveStartKey = resp.LastEvaluatedKey;
    } while (ExclusiveStartKey);

    res.json({ orders });
  } catch (e) {
    console.error("[/api/orders] error:", e);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
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

const PORT = process.env.PORT || 3000;
async function start() {
  await loadState(); // hydrate from JSONBin before serving traffic
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Local network IP: http://${getLocalIp()}:${PORT}`);
  });
}

start();
