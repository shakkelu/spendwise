import assert from "node:assert/strict";
import { test } from "node:test";
import { readDatabaseUri } from "../src/config.js";
import { connectDatabase } from "../src/database.js";

test("missing and invalid database configuration is rejected without echoing input", async () => {
  for (const value of [undefined, "", "https://private-value"]) {
    assert.throws(() => readDatabaseUri({ MONGODB_URI: value }), {
      message: "MONGODB_URI must be a MongoDB connection string.",
    });
  }
  await assert.rejects(connectDatabase("not-a-uri-private-value"), {
    message:
      "Database connection failed. Check local MongoDB and its configuration.",
  });
});
