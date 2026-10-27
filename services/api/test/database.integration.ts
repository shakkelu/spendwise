import assert from "node:assert/strict";
import { test } from "node:test";
import { MongoClient } from "mongodb";
import { connectDatabase } from "../src/database.js";

test(
  "authenticated test database connects and denies access outside its database",
  { timeout: 20000 },
  async () => {
    const uri = process.env.MONGODB_TEST_URI;
    assert.ok(uri, "MONGODB_TEST_URI is required; run db:setup first.");
    const target = new URL(uri);
    assert.equal(target.protocol, "mongodb:");
    assert.equal(target.hostname, "127.0.0.1");
    assert.equal(target.port, "27118");
    assert.equal(target.pathname, "/spendwise_test");
    assert.equal(target.username, "spendwise_test");
    assert.equal(target.search, "?authSource=spendwise_test");
    const client = await connectDatabase(uri);
    try {
      assert.equal((await client.db().command({ ping: 1 })).ok, 1);
      await client.db().listCollections().toArray();
      await assert.rejects(
        client.db("spendwise_dev").listCollections().toArray(),
        { code: 13 },
      );
    } finally {
      await client.close();
    }
    const unauthenticated = new MongoClient(
      "mongodb://127.0.0.1:27118/spendwise_test",
      { serverSelectionTimeoutMS: 3000 },
    );
    try {
      await assert.rejects(unauthenticated.db().listCollections().toArray(), {
        code: 13,
      });
    } finally {
      await unauthenticated.close();
    }
    target.password = "intentionally-invalid-test-password";
    await assert.rejects(connectDatabase(target.toString()), {
      message:
        "Database connection failed. Check local MongoDB and its configuration.",
    });
  },
);
