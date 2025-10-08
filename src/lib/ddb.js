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
      "[ddb] Missing AWS/DynamoDB env. Set AWS_REGION, DDB_TABLE, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY"
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
          ExpressionAttributeNames: { "#pk": "pk" },
          ExpressionAttributeValues: { ":pk": makePk(season) },
          ExclusiveStartKey,
        })
      );
      (resp.Items || []).forEach((it) =>
        out.push({
          // expose plain userId in results:
          id: it.sk,
          name: it.name,
          order: it.order,
          rankedItems: it.rankedItems,
          submittedAt: it.submittedAt,
          season: it.season,
        })
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
        })
      );
      (resp.Items || []).forEach((it) =>
        out.push({
          id: it.sk,
          order: it.order,
          name: it.name || "",
          season: it.season,
        })
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
      })
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
        },
      })
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
      })
    );
    return !!(resp.Attributes && Object.keys(resp.Attributes).length);
  }

  return {
    enabled,
    tableName,
    fetchAllSubmissions,
    fetchAllOrders,
    upsertSubmission,
    deleteSubmission,
    orderExists, // optional faster check
  };
}

module.exports = { createDdb };
