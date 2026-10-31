import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import { connectDatabase } from "../src/database.js";
import { createApp } from "../src/app.js";
import { product } from "../src/product.js";
import { newToken } from "../src/sessions.js";
import { createLedger, mutateLedger } from "../src/finance.js";
import type { User } from "../src/accounts.js";

test(
  "local import is authenticated, new-account-only, atomic and retry-safe",
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
    const secret = "synthetic migration password";
    const key = newToken(),
      mail = `${randomUUID()}@example.test`;
    let ledger = createLedger({
      currency: "USD",
      timezone: "UTC",
      openingAmount: "100",
      openingDate: "2026-01-01",
    });
    ledger = mutateLedger(ledger, {
      action: "transaction-create",
      id: randomUUID(),
      type: "expense",
      amount: "10.25",
      date: "2026-01-02",
      category: "Food",
      description: "Synthetic",
    });
    const payload = { key, ledger };
    assert.equal((await request("/account/import", payload)).status, 401);
    await request("/auth/register", {
      email: mail,
      password: secret,
      transferKey: key,
    });
    await request("/auth/verify", {
      token: delivered.find((x) => x.email === mail)!.token,
    });
    const token = (
      await request("/auth/login", { email: mail, password: secret })
    ).body.token as string;
    assert.equal(
      (await request("/account/import", { ...payload, key: newToken() }, token))
        .status,
      409,
    );
    assert.equal(
      (
        await request(
          "/account/import",
          {
            key,
            ledger: {
              ...ledger,
              transactions: [{ ...ledger.transactions[0], amount: -1 }],
            },
          },
          token,
        )
      ).status,
      400,
    );
    const results = await Promise.all([
      request("/account/import", payload, token),
      request("/account/import", payload, token),
    ]);
    assert.deepEqual(
      results.map((x) => x.status),
      [200, 200],
    );
    const imported = (await request("/account", undefined, token)).body;
    assert.equal(imported.overview.balance, 8975);
    assert.equal(imported.ledger.transactions.length, 1);
    // A lost response retried after subsequent cloud edits must never overwrite them.
    await request(
      "/account/operations",
      {
        action: "transaction-create",
        id: randomUUID(),
        version: ledger.version,
        type: "income",
        amount: "5",
        date: "2026-01-02",
        category: "Work",
        description: "Synthetic",
      },
      token,
    );
    assert.equal(
      (await request("/account/import", payload, token)).status,
      200,
    );
    assert.equal(
      (await request("/account", undefined, token)).body.overview.balance,
      9475,
    );
    assert.equal(
      (
        await request(
          "/account/import",
          { key, ledger: { ...ledger, openingAmount: 999 } },
          token,
        )
      ).status,
      409,
    );
    const other = `${randomUUID()}@example.test`;
    await request("/auth/register", { email: other, password: secret });
    await request("/auth/verify", {
      token: delivered.find((x) => x.email === other)!.token,
    });
    const otherToken = (
      await request("/auth/login", { email: other, password: secret })
    ).body.token as string;
    // Re-registering a verified account cannot grant import permission.
    await request("/auth/register", {
      email: other,
      password: secret,
      transferKey: key,
    });
    assert.equal(
      (await request("/account/import", payload, otherToken)).status,
      409,
    );
    assert.equal(
      (await db.collection<User>("users").findOne({ email: other }))!.ledger,
      null,
    );
    assert.equal(
      (
        await request(
          "/account/import",
          { key, ledger, junk: "x".repeat(8 * 1024 * 1024) },
          token,
        )
      ).status,
      413,
    );
  },
);
