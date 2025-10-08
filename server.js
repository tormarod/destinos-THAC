// server.js (only the routes wiring changed)
require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");

const { createDdb } = require("./src/lib/ddb");
const { getItemsForSeason } = require("./src/lib/s3Items");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const ID_FIELD = process.env.ID_FIELD || "Nº vacante";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(PUBLIC_DIR));

// DynamoDB (submissions)
const ddb = createDdb({
  region: process.env.AWS_REGION,
  tableName: process.env.DDB_TABLE,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

app.use("/api", (req, _res, next) => {
  console.log(`[api] ${req.method} ${req.path} body=`, req.body);
  next();
});

app.post("/api/reset-user/_probe", (req, res) => {
  console.log("[probe] body =", req.body);
  res.json({ ok: true, got: req.body });
});

// Routes (now season-aware and S3-backed for items)
app.use(
  "/api",
  require("./src/routes/state")({ ddb, idField: ID_FIELD, getItemsForSeason })
);
app.use("/api", require("./src/routes/orders")({ ddb }));
app.use("/api", require("./src/routes/submit")({ ddb, idField: ID_FIELD }));
app.use("/api", require("./src/routes/allocate")({ ddb, idField: ID_FIELD }));
app.use("/api", require("./src/routes/resetUser")({ ddb, idField: ID_FIELD }));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
