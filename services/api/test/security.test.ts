import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { readDatabaseUri } from "../src/config.js";
import { password } from "../src/accounts.js";
import { mailDelivery } from "../src/mail.js";

test("production rejects insecure database and missing mail configuration", () => {
  for (const uri of [
    "mongodb://localhost/db",
    "mongodb+srv://host/db?tls=false",
    "mongodb://host/db?tls=true&tlsInsecure=true",
    "mongodb://host/db?TLS=true&tlsinsecure=true",
    "mongodb://host/db?tls=true&TLS=false",
  ])
    assert.throws(() =>
      readDatabaseUri({ NODE_ENV: "production", MONGODB_URI: uri }),
    );
  assert.equal(
    readDatabaseUri({
      NODE_ENV: "production",
      MONGODB_URI: "mongodb://host/db?tls=true",
    }),
    "mongodb://host/db?tls=true",
  );
  assert.throws(() =>
    mailDelivery({ NODE_ENV: "production", MAIL_MODE: "local" }),
  );
  assert.equal(password("  synthetic password  "), "  synthetic password  ");
  assert.equal(password("🙂".repeat(15)), "🙂".repeat(15));
  assert.throws(() => password("x".repeat(129)));
  assert.throws(() => password("\ud800".repeat(15)));
});

test("HTTP rejects oversized/malformed JSON and plaintext production requests", async (t) => {
  const server = createApp(undefined, true).listen(0, "127.0.0.1");
  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((e) => (e ? reject(e) : resolve()));
        server.closeAllConnections();
      }),
  );
  await once(server, "listening");
  const a = server.address();
  assert.ok(a && typeof a !== "string");
  const url = `http://127.0.0.1:${a.port}`;
  const plain = await fetch(url + "/account");
  assert.equal(plain.status, 400);
  assert.equal(plain.headers.get("cache-control"), "no-store");
  const malformed = await fetch(url + "/account", {
    method: "POST",
    headers: {
      "X-Forwarded-Proto": "https",
      "Content-Type": "application/json",
    },
    body: "{",
  });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { error: "Invalid JSON." });
  const large = await fetch(url + "/account", {
    method: "POST",
    headers: {
      "X-Forwarded-Proto": "https",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ large: "a".repeat(17000) }),
  });
  assert.equal(large.status, 413);
});
