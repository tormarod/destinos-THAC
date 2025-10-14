// src/lib/ddb.js
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");

function assertConfig(cfg) {
  const ok =
    cfg &&
    cfg.region &&
    cfg.tableName &&
    cfg.accessKeyId &&
    cfg.secretAccessKey;
  if (!ok) {
    console.warn(
      "[ddb] Missing AWS/DynamoDB env. Set AWS_REGION, DDB_TABLE, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY",
    );
  }
  return ok;
}

function createDdb(cfg) {
  const enabled = assertConfig(cfg);
  const tableName = cfg.tableName;

  let doc = null;
  if (enabled) {
    const client = new DynamoDBClient({
      region: cfg.region,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    });
    doc = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  const makePk = (season) => `SUBMISSION#${String(season)}`;

  /** Get ALL submissions for a season (one query, paginated) */
  async function fetchAllSubmissions(season) {
    if (!enabled) return [];
    const out = [];
    let ExclusiveStartKey;
    do {
      const resp = await doc.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: "#pk = :pk",
          ExpressionAttributeNames: {
            "#pk": "pk",
            "#order": "order",
            "#ranked": "rankedItems",
            "#name": "name",
          },
          ExpressionAttributeValues: { ":pk": makePk(season) },
          ProjectionExpression:
            "sk, #order, #ranked, #name, submittedAt, updatedAt, season",
          ExclusiveStartKey,
        }),
      );
      (resp.Items || []).forEach((it) =>
        out.push({
          // expose plain userId in results:
          id: it.sk,
          name: it.name,
          order: it.order,
          rankedItems: it.rankedItems, // Keep ALL rankedItems (even if 300+ items)
          submittedAt: it.submittedAt,
          updatedAt: it.updatedAt,
          season: it.season,
        }),
      );
      ExclusiveStartKey = resp.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return out;
  }

  /** Get orders for a season (project minimal fields) */
  async function fetchAllOrders(season) {
    if (!enabled) return [];
    const out = [];
    let ExclusiveStartKey;
    do {
      const resp = await doc.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: "#pk = :pk",
          ExpressionAttributeNames: {
            "#pk": "pk",
            "#o": "order",
            "#n": "name",
            "#s": "season",
            "#sk": "sk",
          },
          ExpressionAttributeValues: { ":pk": makePk(season) },
          ProjectionExpression: "#sk, #o, #n, #s",
          ExclusiveStartKey,
        }),
      );
      (resp.Items || []).forEach((it) =>
        out.push({
          id: it.sk,
          order: it.order,
          name: it.name || "",
          season: it.season,
        }),
      );
      ExclusiveStartKey = resp.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return out;
  }

  /** Get a specific user's submission by userId */
  async function fetchUserSubmission(season, userId) {
    if (!enabled) return null;
    const resp = await doc.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "#pk = :pk AND #sk = :sk",
        ExpressionAttributeNames: {
          "#pk": "pk",
          "#sk": "sk",
          "#order": "order",
          "#ranked": "rankedItems",
          "#name": "name",
        },
        ExpressionAttributeValues: {
          ":pk": makePk(season),
          ":sk": String(userId),
        },
        ProjectionExpression:
          "sk, #order, #ranked, #name, submittedAt, updatedAt, season",
      }),
    );
    const item = resp.Items && resp.Items[0];
    return item
      ? {
          id: item.sk,
          name: item.name,
          order: item.order,
          rankedItems: item.rankedItems,
          submittedAt: item.submittedAt,
          updatedAt: item.updatedAt,
          season: item.season,
        }
      : null;
  }

  /** Get submissions above a specific user order (optimized for allocation) */
  async function fetchSubmissionsAboveUser(season, userOrder) {
    if (!enabled) return [];
    const out = [];
    let ExclusiveStartKey;
    do {
      const resp = await doc.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: "GSI1",
          KeyConditionExpression: "#pk = :pk AND #o < :userOrder",
          ExpressionAttributeNames: {
            "#pk": "pk",
            "#o": "order",
            "#ranked": "rankedItems",
            "#name": "name",
          },
          ExpressionAttributeValues: {
            ":pk": makePk(season),
            ":userOrder": Number(userOrder),
          },
          ProjectionExpression: "sk, #o, #ranked, #name, submittedAt, season",
          ExclusiveStartKey,
        }),
      );
      (resp.Items || []).forEach((it) =>
        out.push({
          id: it.sk,
          name: it.name,
          order: it.order,
          rankedItems: it.rankedItems,
          submittedAt: it.submittedAt,
          updatedAt: it.updatedAt || it.submittedAt, // Fallback to submittedAt if updatedAt not available from GSI1
          season: it.season,
        }),
      );
      ExclusiveStartKey = resp.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return out;
  }

  /** FAST order-exists check via GSI1 (optional helper) */
  async function orderExists(season, orderValue) {
    if (!enabled) return false;
    const resp = await doc.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: "GSI1",
        KeyConditionExpression: "#pk = :pk AND #o = :o",
        ExpressionAttributeNames: { "#pk": "pk", "#o": "order" },
        ExpressionAttributeValues: {
          ":pk": makePk(season),
          ":o": Number(orderValue),
        },
        Limit: 1,
      }),
    );
    return (resp.Count || 0) > 0;
  }

  /** Upsert one submission for (season, userId) */
  async function upsertSubmission({
    season,
    userId,
    name,
    order,
    rankedItems,
    submittedAt,
    updatedAt,
  }) {
    if (!enabled) return;
    await doc.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          pk: makePk(season),
          sk: String(userId),
          season: String(season),
          name,
          order: Number(order),
          rankedItems,
          submittedAt,
          updatedAt: updatedAt || Date.now(),
        },
      }),
    );
  }

  /** Delete one submission for (season, userId) */
  async function deleteSubmission(season, userId) {
    if (!enabled) {
      console.warn("[ddb] deleteSubmission skipped: DDB not enabled");
      return false;
    }
    const resp = await doc.send(
      new DeleteCommand({
        TableName: tableName,
        Key: { pk: `SUBMISSION#${String(season)}`, sk: String(userId) },
        ReturnValues: "ALL_OLD",
      }),
    );
    return !!(resp.Attributes && Object.keys(resp.Attributes).length);
  }

  /** Delete ALL submissions for a given userId across ALL seasons.
   *  Uses a Scan + per-item Delete (OK at your scale).
   *  Returns how many rows were removed.
   */
  async function deleteAllByUser(userId) {
    if (!enabled) {
      console.warn("[ddb] deleteAllByUser skipped: DDB not enabled");
      return 0;
    }
    const sk = String(userId);
    let removed = 0;

    // Scan for all items where sk == userId
    let ExclusiveStartKey;
    do {
      const r = await doc.send(
        new (require("@aws-sdk/lib-dynamodb").ScanCommand)({
          TableName: tableName,
          FilterExpression: "#sk = :sk",
          ExpressionAttributeNames: { "#sk": "sk" },
          ExpressionAttributeValues: { ":sk": sk },
          ExclusiveStartKey,
        }),
      );
      const items = r.Items || [];
      for (const it of items) {
        await doc.send(
          new (require("@aws-sdk/lib-dynamodb").DeleteCommand)({
            TableName: tableName,
            Key: { pk: it.pk, sk: it.sk },
          }),
        );
        removed++;
      }
      ExclusiveStartKey = r.LastEvaluatedKey;
    } while (ExclusiveStartKey);

    return removed;
  }

  return {
    enabled,
    tableName,
    fetchAllSubmissions,
    fetchAllOrders,
    fetchUserSubmission, // get single user submission
    fetchSubmissionsAboveUser, // optimized for user-specific allocation
    upsertSubmission,
    deleteSubmission,
    orderExists, // optional faster check
    deleteAllByUser,
  };
}

module.exports = { createDdb };
