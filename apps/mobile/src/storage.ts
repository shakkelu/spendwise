import { openDatabaseAsync } from "expo-sqlite";
import type { Ledger } from "./api";
import { validateLedger } from "../../../services/api/src/finance";
export type Appearance = "system" | "light" | "dark";
export interface DeviceState {
  schema: 1;
  revision: number;
  guest: boolean;
  ledger: Ledger | null;
  signup: { email: string; key: string; upload: Ledger | null } | null;
}
export const emptyDevice = (): DeviceState => ({
  schema: 1,
  revision: 0,
  guest: false,
  ledger: null,
  signup: null,
});
let connection: ReturnType<typeof openDatabaseAsync> | undefined;
async function database() {
  if (!connection)
    connection = openDatabaseAsync("spendwise-device.db")
      .then(async (db) => {
        await db.execAsync(
          "PRAGMA journal_mode = DELETE; PRAGMA secure_delete = ON; CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);",
        );
        return db;
      })
      .catch((error) => {
        connection = undefined;
        throw error;
      });
  return connection;
}
export async function readDevice(): Promise<DeviceState> {
  const db = await database();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM state WHERE key = ?",
    "device",
  );
  if (!row) return emptyDevice();
  const data = JSON.parse(row.value) as DeviceState;
  if (
    !data ||
    data.schema !== 1 ||
    !Number.isSafeInteger(data.revision) ||
    data.revision < 0 ||
    !(
      data.ledger === null ||
      (typeof data.ledger === "object" && !Array.isArray(data.ledger))
    ) ||
    !(
      data.signup === null ||
      (typeof data.signup === "object" && !Array.isArray(data.signup))
    ) ||
    (!data.guest && (data.ledger !== null || data.signup !== null)) ||
    typeof data.guest !== "boolean"
  )
    throw new Error(
      "Device records could not be read. They have not been erased.",
    );
  if (data.ledger) data.ledger = validateLedger(data.ledger);
  if (
    data.signup &&
    (!data.ledger ||
      typeof data.signup.email !== "string" ||
      !(
        data.signup.upload === null ||
        (typeof data.signup.upload === "object" &&
          !Array.isArray(data.signup.upload))
      ) ||
      !/^[a-f0-9]{64}$/.test(data.signup.key))
  )
    throw new Error(
      "Account transfer state could not be read. Records have not been erased.",
    );
  if (data.signup?.upload)
    data.signup.upload = validateLedger(data.signup.upload);
  return data;
}
export async function writeDevice(
  previous: DeviceState,
  changes: Partial<Omit<DeviceState, "schema" | "revision">>,
) {
  const db = await database();
  const next = { ...previous, ...changes, revision: previous.revision + 1 };
  await db.withExclusiveTransactionAsync(async (tx) => {
    const row = await tx.getFirstAsync<{ value: string }>(
      "SELECT value FROM state WHERE key = ?",
      "device",
    );
    if (
      (row ? (JSON.parse(row.value) as DeviceState).revision : 0) !==
      previous.revision
    )
      throw new Error(
        "Device records changed. Reopen the app before retrying.",
      );
    await tx.runAsync(
      "INSERT OR REPLACE INTO state (key, value) VALUES (?, ?)",
      "device",
      JSON.stringify(next),
    );
  });
  return next;
}
export async function readAppearance(): Promise<Appearance> {
  const row = await (
    await database()
  ).getFirstAsync<{ value: string }>(
    "SELECT value FROM state WHERE key = ?",
    "appearance",
  );
  return row?.value === "dark" || row?.value === "light" ? row.value : "system";
}
export async function writeAppearance(value: Appearance) {
  await (
    await database()
  ).runAsync(
    "INSERT OR REPLACE INTO state (key, value) VALUES (?, ?)",
    "appearance",
    value,
  );
}
