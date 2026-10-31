import { expect, jest, test } from "@jest/globals";
import { openDatabaseAsync } from "expo-sqlite";
import type { DatabaseSync } from "node:sqlite";
import {
  emptyDevice,
  readDevice,
  writeDevice,
  readAppearance,
  writeAppearance,
} from "../src/storage";
import { createLedger } from "../../../services/api/src/finance";
// Real SQLite statements/rollback with a Node adapter; native bridge is verified
// separately on Android. No database files or financial fixtures are written.
jest.mock("expo-sqlite", () => {
  const { DatabaseSync } =
    jest.requireActual<typeof import("node:sqlite")>("node:sqlite");
  const db: DatabaseSync = new DatabaseSync(":memory:");
  const adapter = {
    execAsync: async (sql: string) => {
      db.exec(sql);
    },
    getFirstAsync: async (sql: string, ...args: string[]) =>
      db.prepare(sql).get(...args) ?? null,
    runAsync: async (sql: string, ...args: string[]) =>
      db.prepare(sql).run(...args),
    withExclusiveTransactionAsync: async (
      action: (db: object) => Promise<void>,
    ) => {
      db.exec("BEGIN EXCLUSIVE");
      try {
        await action(adapter);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { openDatabaseAsync: async () => adapter };
});
test("SQLite preserves records, rejects stale overwrites, persists appearance and atomically clears only guest data", async () => {
  expect(await readDevice()).toEqual(emptyDevice());
  const ledger = createLedger({
    currency: "JPY",
    timezone: "UTC",
    openingAmount: "100",
    openingDate: "2026-01-01",
  });
  const saved = await writeDevice(emptyDevice(), { guest: true, ledger });
  expect(await readDevice()).toEqual(saved);
  await expect(writeDevice(emptyDevice(), { ledger: null })).rejects.toThrow(
    /changed/,
  );
  expect((await readDevice()).ledger).toEqual(ledger);
  await writeAppearance("dark");
  expect(await readAppearance()).toBe("dark");
  await writeDevice(saved, { guest: false, ledger: null, signup: null });
  expect((await readDevice()).ledger).toBeNull();
  expect(await readAppearance()).toBe("dark");
});

test("malformed saved schema is rejected instead of becoming a fresh empty account", async () => {
  const db = await openDatabaseAsync("spendwise-device.db");
  for (const invalid of [
    { schema: 1, revision: 1, guest: true, signup: null },
    { schema: 1, revision: -1, guest: true, ledger: null, signup: null },
    {
      schema: 1,
      revision: 1,
      guest: true,
      ledger: null,
      signup: { email: "x@example.test", key: "a".repeat(64) },
    },
  ]) {
    await db.runAsync(
      "UPDATE state SET value = ? WHERE key = ?",
      JSON.stringify(invalid),
      "device",
    );
    await expect(readDevice()).rejects.toThrow();
  }
});
