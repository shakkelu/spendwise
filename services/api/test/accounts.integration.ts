import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { accounts, throttle, type User } from "../src/accounts.js";
import { connectDatabase } from "../src/database.js";
import { requireSession, tokenHash } from "../src/sessions.js";

test("preregistration protection, email normalization, token expiry and all-session revocation", async (t) => {
  const uri = process.env.MONGODB_TEST_URI;
  assert.ok(uri);
  const target = new URL(uri);
  assert.equal(target.hostname, "127.0.0.1");
  assert.equal(target.port, "27118");
  assert.equal(target.pathname, "/spendwise_test");
  assert.equal(target.username, "spendwise_test");
  assert.equal(target.search, "?authSource=spendwise_test");
  const client = await connectDatabase(uri);
  t.after(() => client.close());
  const db = client.db();
  const messages: { email: string; purpose: string; token: string }[] = [];
  const auth = await accounts(db, async (email, purpose, token) => {
    messages.push({ email, purpose, token });
  });
  const address = `${randomUUID()}@example.test`,
    chosen = "email owner's chosen password";
  await auth.register(address, "preregistered synthetic password");
  const old = messages.at(-1)!.token;
  await auth.register(` ${address.toUpperCase()} `, chosen);
  const current = messages.at(-1)!.token;
  await assert.rejects(auth.verify(old));
  await auth.verify(current);
  await assert.rejects(auth.login(address, "preregistered synthetic password"));
  const first = await auth.login(address, chosen),
    second = await auth.login(address, chosen);
  await auth.register(address, "cannot replace verified password");
  await auth.change(
    (await requireSession(db, `Bearer ${first}`)).userId,
    chosen,
    "newly chosen replacement password",
  );
  await assert.rejects(requireSession(db, `Bearer ${first}`));
  await assert.rejects(requireSession(db, `Bearer ${second}`));
  await auth.request(address, "reset");
  const reset = messages.at(-1)!.token;
  await db
    .collection<User>("users")
    .updateOne({ email: address }, { $set: { resetUntil: new Date(0) } });
  await assert.rejects(auth.reset(reset, chosen));
  const unverified = `${randomUUID()}@example.test`;
  await auth.register(unverified, chosen);
  const expired = messages.at(-1)!.token;
  await db
    .collection<User>("users")
    .updateOne({ email: unverified }, { $set: { verifyUntil: new Date(0) } });
  await assert.rejects(auth.verify(expired));
  const scope = randomUUID();
  for (let i = 0; i < 10; i++)
    await throttle(db, scope, scope + "@example.test");
  await assert.rejects(throttle(db, scope, scope + "@example.test"), {
    status: 429,
  });
  const stored = await db.collection<User>("users").findOne({ email: address });
  assert.ok(stored);
  assert.notEqual(stored.passwordHash, chosen);
  assert.ok(!JSON.stringify(stored).includes(reset));
  assert.equal(stored.resetHash, tokenHash(reset));
});

test(
  "email requests return independently of delivery latency and redact delivery failures",
  { timeout: 5000 },
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
    t.after(() => client.close());
    const pending: (() => void)[] = [];
    let fail = false;
    const logs: string[] = [];
    t.mock.method(console, "error", (...args: unknown[]) => {
      logs.push(args.join(" "));
    });
    t.after(() => pending.forEach((resolve) => resolve()));
    const auth = await accounts(client.db(), async () => {
      if (fail) throw new Error("private-smtp-password");
      await new Promise<void>((resolve) => pending.push(resolve));
    });
    const address = `${randomUUID()}@example.test`;
    await auth.register(address, "synthetic delivery password");
    await auth.request(address, "verify");
    assert.equal(pending.length, 2);
    pending.forEach((resolve) => resolve());
    fail = true;
    await auth.request(address, "reset");
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.ok(logs.length > 0);
    assert.ok(!logs.join(" ").includes(address));
    assert.ok(!logs.join(" ").includes("private-smtp-password"));
  },
);
