// server.js
require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");
const cors = require("cors");

const { createDdb } = require("./src/lib/ddb");

// ---- Config ----
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const ITEMS_PATH = process.env.ITEMS_PATH || path.join(__dirname, "items.json"); // adjust if your file lives elsewhere
const ID_FIELD = process.env.ID_FIELD || "Nº vacante";

// ---- Load items once at boot ----
function loadItems() {
  try {
    const raw = fs.readFileSync(ITEMS_PATH, "utf8");
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) throw new Error("items.json is not an array");
    return arr;
  } catch (e) {
    console.error("[items] Failed to load items:", e.message);
    return [];
  }
}

const ITEMS = loadItems();

// ---- App + middleware ----
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(PUBLIC_DIR));

// ---- DynamoDB client (doc) ----
const ddb = createDdb({
  region: process.env.AWS_REGION,
  tableName: process.env.DDB_TABLE,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

// ---- Routes (dependency-injected) ----
app.use(
  "/api",
  require("./src/routes/state")({ ddb, items: ITEMS, idField: ID_FIELD })
);
app.use("/api", require("./src/routes/orders")({ ddb }));
app.use(
  "/api",
  require("./src/routes/submit")({ ddb, idField: ID_FIELD, items: ITEMS })
);
app.use("/api", require("./src/routes/resetUser")({ ddb }));
app.use("/api", require("./src/routes/allocate")({ ddb, idField: ID_FIELD }));

// ---- Start ----
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

app.use(
  "/assets",
  express.static(path.join(__dirname, "public", "assets"), {
    maxAge: "30d", // cache for 30 days
    immutable: true,
  })
);
