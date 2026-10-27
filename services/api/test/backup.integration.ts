import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { connectDatabase } from "../src/database.js";

test(
  "synthetic MongoDB archive restores into a fresh collection without deletion",
  { timeout: 30000 },
  async (t) => {
    const uri = process.env.MONGODB_TEST_URI;
    assert.ok(uri);
    const target = new URL(uri);
    assert.equal(target.protocol, "mongodb:");
    assert.equal(target.hostname, "127.0.0.1");
    assert.equal(target.port, "27118");
    assert.equal(target.pathname, "/spendwise_test");
    assert.equal(target.username, "spendwise_test");
    assert.equal(target.search, "?authSource=spendwise_test");
    const client = await connectDatabase(uri);
    t.after(() => client.close());
    const db = client.db();
    const suffix = randomUUID().replaceAll("-", ""),
      source = `backup_probe_${suffix}`,
      restored = `restored_probe_${suffix}`;
    assert.equal(await db.listCollections({ name: restored }).hasNext(), false);
    const fixture = {
      _id: randomUUID(),
      kind: "synthetic-restore-probe",
      amount: 29,
      currency: "USD",
    };
    await db
      .collection<{
        _id: string;
        kind: string;
        amount: number;
        currency: string;
      }>(source)
      .insertOne(fixture);
    const root = fileURLToPath(new URL("../../../../", import.meta.url));
    const base = [
      "compose",
      "--env-file",
      `${root}.env.mongo`,
      "--file",
      `${root}compose.yaml`,
      "--profile",
      "test",
      "exec",
      "-T",
      "mongo-test",
      "sh",
      "-c",
    ];
    let archive: Buffer | undefined;
    try {
      archive = execFileSync(
        "docker",
        [
          ...base,
          'exec mongodump --username "$APP_USER" --password "$APP_PASSWORD" --authenticationDatabase spendwise_test --db spendwise_test --collection "$1" --archive',
          "sh",
          source,
        ],
        {
          timeout: 10000,
          maxBuffer: 2 * 1024 * 1024,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      assert.ok(archive.length > 0);
      execFileSync(
        "docker",
        [
          ...base,
          'exec mongorestore --username "$APP_USER" --password "$APP_PASSWORD" --authenticationDatabase spendwise_test --archive --nsInclude "spendwise_test.$1" --nsFrom "spendwise_test.$1" --nsTo "spendwise_test.$2"',
          "sh",
          source,
          restored,
        ],
        {
          input: archive,
          timeout: 10000,
          maxBuffer: 2 * 1024 * 1024,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
    } catch {
      throw new Error(
        "Isolated MongoDB archive/restore failed; command details redacted.",
      );
    } finally {
      archive?.fill(0);
    }
    assert.deepEqual(
      await db
        .collection<typeof fixture>(restored)
        .findOne({ _id: fixture._id }),
      fixture,
    );
    assert.equal(await db.collection(source).countDocuments(), 1);
    // Keep both synthetic collections. No --drop, database drop, or volume cleanup.
  },
);
