import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import { connectDatabase } from "../src/database.js";
import { createApp } from "../src/app.js";
import { product } from "../src/product.js";
import {
  tokenHash,
  IDLE_MS,
  ABSOLUTE_MS,
  type Session,
} from "../src/sessions.js";
import type { User } from "../src/accounts.js";

test(
  "real MongoDB authentication, ownership, concurrency, recovery and expiry",
  { timeout: 30000 },
  async (t) => {
    const uri = process.env.MONGODB_TEST_URI;
    assert.ok(uri);
    const target = new URL(uri);
    assert.equal(target.hostname, "127.0.0.1");
    assert.equal(target.port, "27118");
    assert.equal(target.pathname, "/spendwise_test");
    assert.equal(target.username, "spendwise_test");
    assert.equal(target.search, "?authSource=spendwise_test");
    const client = await connectDatabase(uri);
    const db = client.db();
    t.after(() => client.close());
    const delivered: { email: string; purpose: string; token: string }[] = [];
    const routes = await product(
      db,
      async (email, purpose, token) => {
        delivered.push({ email, purpose, token });
      },
      randomUUID(),
    );
    const server = createApp(routes).listen(0, "127.0.0.1");
    t.after(
      () =>
        new Promise<void>((resolve, reject) => {
          server.close((e) => (e ? reject(e) : resolve()));
          server.closeAllConnections();
        }),
    );
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const request = async (path: string, body?: unknown, token?: string) => {
      const r = await fetch(`http://127.0.0.1:${address.port}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await r.text();
      return { status: r.status, body: text ? JSON.parse(text) : null };
    };
    const secret = "synthetic long password 123";
    const mail = `${randomUUID()}@example.test`,
      other = `${randomUUID()}@example.test`;
    assert.equal((await request("/account")).status, 401);
    assert.equal(
      (await request("/auth/register", { email: mail, password: secret }))
        .status,
      202,
    );
    assert.equal(
      (await request("/auth/login", { email: mail, password: secret })).status,
      401,
    );
    const verification = delivered.find((x) => x.email === mail)!.token;
    assert.equal(
      (await request("/auth/verify", { token: verification })).status,
      200,
    );
    assert.equal(
      (await request("/auth/verify", { token: verification })).status,
      400,
    );
    assert.equal(
      (
        await request("/auth/login", {
          email: mail,
          password: "wrong synthetic password",
        })
      ).status,
      401,
    );
    const token = (
      await request("/auth/login", { email: mail, password: secret })
    ).body.token as string;
    const stored = await db
      .collection<Session>("sessions")
      .findOne({ _id: tokenHash(token) });
    assert.ok(stored);
    assert.ok(!JSON.stringify(stored).includes(token));
    await request("/auth/register", { email: other, password: secret });
    await request("/auth/verify", {
      token: delivered.find((x) => x.email === other)!.token,
    });
    const otherToken = (
      await request("/auth/login", { email: other, password: secret })
    ).body.token as string;
    const settings = {
      currency: "USD",
      timezone: "UTC",
      openingDate: "2026-01-01",
      openingAmount: "100",
    };
    assert.equal((await request("/account", settings, token)).status, 201);
    assert.equal(
      (await request("/account", undefined, otherToken)).body.ledger,
      null,
    );
    const op = {
      action: "transaction-create",
      version: 0,
      id: randomUUID(),
      type: "income",
      amount: "10.25",
      date: "2026-01-02",
      category: "Work",
      description: "Synthetic",
    };
    const competing = await Promise.all([
      request("/account/operations", op, token),
      request("/account/operations", op, token),
    ]);
    assert.deepEqual(competing.map((x) => x.status).sort(), [200, 409]);
    assert.equal(
      (
        await request(
          "/account/operations",
          { ...op, userId: stored.userId },
          otherToken,
        )
      ).status,
      409,
    );
    const snapshot = (await request("/account", undefined, token)).body;
    assert.equal(snapshot.ledger.transactions.length, 1);
    assert.equal(snapshot.overview.balance, 11025);
    assert.ok(!JSON.stringify(snapshot).includes("passwordHash"));
    assert.equal((await request("/account", settings, otherToken)).status, 201);
    assert.equal(
      (
        await request(
          "/account/operations",
          { ...op, action: "transaction-update", userId: stored.userId },
          otherToken,
        )
      ).status,
      404,
    );
    assert.equal(
      (await request("/account", undefined, otherToken)).body.overview.balance,
      10000,
    );
    const expectedId = randomUUID(),
      settledId = randomUUID();
    assert.equal(
      (
        await request(
          "/account/operations",
          {
            ...op,
            action: "expectation-create",
            id: expectedId,
            amount: "20",
            version: 1,
          },
          token,
        )
      ).status,
      200,
    );
    const settle = {
      action: "settle",
      id: expectedId,
      transactionId: settledId,
      date: "2026-01-02",
      version: 2,
    };
    const settlements = await Promise.all([
      request("/account/operations", settle, token),
      request("/account/operations", settle, token),
    ]);
    assert.deepEqual(settlements.map((x) => x.status).sort(), [200, 409]);
    const settled = (await request("/account", undefined, token)).body;
    assert.equal(settled.overview.balance, 13025);
    assert.equal(
      settled.ledger.transactions.filter(
        (x: { id: string }) => x.id === settledId,
      ).length,
      1,
    );
    assert.equal(
      (
        await request(
          "/account/operations",
          {
            action: "transaction-delete",
            id: settledId,
            version: 3,
            confirmRestore: true,
          },
          token,
        )
      ).status,
      200,
    );
    const undone = (await request("/account", undefined, token)).body;
    assert.equal(undone.overview.balance, 11025);
    assert.equal(undone.ledger.expectations[0].status, "pending");
    await db
      .collection<Session>("sessions")
      .updateOne(
        { _id: tokenHash(token) },
        { $set: { lastActivity: new Date(Date.now() - IDLE_MS - 1000) } },
      );
    assert.equal((await request("/account", undefined, token)).status, 401);
    const fresh = (
      await request("/auth/login", { email: mail, password: secret })
    ).body.token as string;
    await db
      .collection<Session>("sessions")
      .updateOne(
        { _id: tokenHash(fresh) },
        { $set: { expiresAt: new Date(Date.now() - ABSOLUTE_MS) } },
      );
    assert.equal((await request("/account", undefined, fresh)).status, 401);
    const beforeReset = (
      await request("/auth/login", { email: mail, password: secret })
    ).body.token as string;
    await request("/auth/recover", { email: mail });
    const reset = delivered.find(
      (x) => x.email === mail && x.purpose === "reset",
    )!.token;
    assert.equal(
      (
        await request("/auth/reset", {
          token: reset,
          password: "replacement synthetic password",
        })
      ).status,
      200,
    );
    assert.equal(
      (await request("/account", undefined, beforeReset)).status,
      401,
    );
    assert.equal(
      (await request("/auth/reset", { token: reset, password: secret })).status,
      400,
    );
    assert.equal((await request("/auth/logout", {}, otherToken)).status, 204);
    assert.equal(
      (await request("/account", undefined, otherToken)).status,
      401,
    );
    assert.equal(
      (await db.collection<User>("users").findOne({ email: mail }))!
        .authVersion,
      1,
    );
    // Synthetic records are retained; no deletion or arbitrary database cleanup.
  },
);
