import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";

test("health and unknown routes return stable, minimal JSON", async (t) => {
  const server = createApp().listen(0, "127.0.0.1");
  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  );
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  assert.match(health.headers.get("content-type") ?? "", /^application\/json/);
  assert.equal(health.headers.get("x-powered-by"), null);
  assert.deepEqual(await health.json(), { status: "ok" });
  const missing = await fetch(`${base}/missing`);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: "Not found" });
  const unsupported = await fetch(`${base}/health`, { method: "POST" });
  assert.equal(unsupported.status, 404);
  assert.deepEqual(await unsupported.json(), { error: "Not found" });
});

test("configuration defaults, overrides, and invalid ports", () => {
  assert.deepEqual(readConfig({}), { host: "127.0.0.1", port: 3000 });
  for (const port of ["1", "3001", "65535"]) {
    assert.equal(readConfig({ PORT: port }).port, Number(port));
  }
  for (const port of ["", "0", "65536", "-1", "1.5", "abc", " 3000", "1e3"]) {
    assert.throws(() => readConfig({ PORT: port }), /PORT must be an integer/);
  }
});
