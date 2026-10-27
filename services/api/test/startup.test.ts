import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("importing and constructing the app exits without a listener", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      'import { createApp } from "./dist/src/app.js"; createApp();',
    ],
    { timeout: 5000, encoding: "utf8" },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});

test("invalid startup configuration exits with a safe error", () => {
  const result = spawnSync(process.execPath, ["dist/src/server.js"], {
    env: { ...process.env, PORT: "private-invalid-value" },
    timeout: 5000,
    encoding: "utf8",
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /PORT must be an integer between 1 and 65535/);
  assert.doesNotMatch(result.stderr, /private-invalid-value|\n\s+at /);
});
