import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import { test } from "node:test";

test(
  "built API starts with MongoDB, rejects occupied ports and closes its pool",
  { timeout: 20000 },
  async () => {
    const uri = process.env.MONGODB_TEST_URI;
    assert.ok(uri);
    const target = new URL(uri);
    assert.equal(target.hostname, "127.0.0.1");
    assert.equal(target.port, "27118");
    assert.equal(target.pathname, "/spendwise_test");
    assert.equal(target.username, "spendwise_test");
    assert.equal(target.search, "?authSource=spendwise_test");
    const reservation = net.createServer().listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const address = reservation.address();
    assert.ok(address && typeof address !== "string");
    const port = address.port;
    await new Promise<void>((resolve) => reservation.close(() => resolve()));
    const env = {
      ...process.env,
      NODE_ENV: "test",
      MAIL_MODE: "local",
      MONGODB_URI: uri,
      PORT: String(port),
    };
    const child = spawn(process.execPath, ["dist/src/server.js"], { env });
    try {
      const [line] = await once(child.stdout, "data", {
        signal: AbortSignal.timeout(10000),
      });
      assert.match(String(line), /API listening/);
      const health = await fetch(`http://127.0.0.1:${port}/health`);
      assert.equal(health.status, 200);
      assert.deepEqual(await health.json(), { status: "ok" });
      const conflict = spawnSync(process.execPath, ["dist/src/server.js"], {
        env,
        timeout: 8000,
        encoding: "utf8",
      });
      assert.ifError(conflict.error);
      assert.equal(conflict.status, 1);
      assert.equal(conflict.stdout, "");
      assert.match(conflict.stderr, /API failed to listen/);
      const exit = once(child, "close");
      child.kill("SIGTERM");
      assert.equal((await exit)[0], 0);
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  },
);

test(
  "unavailable MongoDB causes bounded redacted startup failure",
  { timeout: 15000 },
  async () => {
    const unavailable = net
      .createServer((socket) => socket.destroy())
      .listen(0, "127.0.0.1");
    await once(unavailable, "listening");
    const address = unavailable.address();
    assert.ok(address && typeof address !== "string");
    const child = spawn(process.execPath, ["dist/src/server.js"], {
      env: {
        ...process.env,
        NODE_ENV: "test",
        MAIL_MODE: "local",
        MONGODB_URI: `mongodb://synthetic:private-test-value@127.0.0.1:${address.port}/unavailable`,
        PORT: "3000",
      },
    });
    let error = "",
      output = "";
    child.stderr.on("data", (chunk) => (error += chunk));
    child.stdout.on("data", (chunk) => (output += chunk));
    try {
      const [code] = await once(child, "close", {
        signal: AbortSignal.timeout(10000),
      });
      assert.equal(code, 1);
      assert.equal(output, "");
      assert.equal(
        error,
        "API startup failed. Check database and email configuration.\n",
      );
      assert.doesNotMatch(error, /private-test-value/);
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
      await new Promise<void>((resolve) => unavailable.close(() => resolve()));
    }
  },
);
