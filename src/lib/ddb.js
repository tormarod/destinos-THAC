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

  async function fetchAllSubmissions() {
    if (!enabled) return [];
    const out = [];
    let ExclusiveStartKey;
    do {
      const resp = await doc.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: "#t = :type",
          ExpressionAttributeNames: { "#t": "type" },
          ExpressionAttributeValues: { ":type": "SUBMISSION" },
          ExclusiveStartKey,
        })
      );
      (resp.Items || []).forEach((it) =>
        out.push({
          id: it.id,
          name: it.name,
          order: it.order,
          rankedItems: it.rankedItems,
          submittedAt: it.submittedAt,
        })
      );
      ExclusiveStartKey = resp.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return out;
  }

  async function fetchAllOrders() {
    if (!enabled) return [];
    const out = [];
    let ExclusiveStartKey;
    do {
      const resp = await doc.send(
        new QueryCommand({
          TableName: tableName,
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
      (resp.Items || []).forEach((it) =>
        out.push({ id: it.id, order: it.order, name: it.name || "" })
      );
      ExclusiveStartKey = resp.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return out;
  }

  async function upsertSubmission(sub) {
    if (!enabled) return;
    await doc.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          type: "SUBMISSION",
          id: sub.id,
          name: sub.name,
          order: sub.order,
          rankedItems: sub.rankedItems,
          submittedAt: sub.submittedAt,
        },
      })
    );
  }

  async function deleteSubmission(userId) {
    if (!enabled) return;
    await doc.send(
      new DeleteCommand({
        TableName: tableName,
        Key: { type: "SUBMISSION", id: userId },
      })
    );
  }

  return {
    enabled,
    tableName,
    fetchAllSubmissions,
    upsertSubmission,
    deleteSubmission,
    fetchAllOrders,
  };
}

module.exports = { createDdb };
