import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  createLedger,
  date,
  money,
  mutateLedger,
  overview,
  today,
} from "../src/finance.js";
const now = new Date("2026-10-26T12:00:00Z");
const settings = {
  currency: "USD",
  timezone: "UTC",
  openingAmount: "100.00",
  openingDate: "2026-10-01",
};
const event = (action: string, amount = "10.00", day = "2026-10-26") => ({
  action,
  id: randomUUID(),
  type: "income",
  amount,
  date: day,
  category: "Work",
  description: "Synthetic",
});

test("money parses exact minor units and rejects rounding, exponent, invalid sign and bounds", () => {
  assert.equal(money("0.29", "USD"), 29);
  assert.equal(money("1.234", "KWD"), 1234);
  assert.equal(money("100", "JPY"), 100);
  assert.equal(money("-1.20", "USD", true), -120);
  for (const value of ["1.001", "1e3", "-1", "0", " 1", "10000000000.01", 1])
    assert.throws(() => money(value, "USD"));
  assert.throws(() => money("1.0", "JPY"));
});
test("calendar validation and timezone month boundary", () => {
  assert.equal(date("2024-02-29"), "2024-02-29");
  for (const day of ["2025-02-29", "2026-04-31", "2026-13-01"])
    assert.throws(() => date(day));
  assert.equal(
    today("Asia/Kolkata", new Date("2026-01-31T20:00:00Z")),
    "2026-02-01",
  );
});
test("opening boundary, edits, dates and currency are enforced", () => {
  let ledger = createLedger(settings, now);
  assert.throws(() =>
    mutateLedger(ledger, event("transaction-create", "1", "2026-09-30"), now),
  );
  assert.throws(() =>
    mutateLedger(ledger, event("transaction-create", "1", "2026-10-27"), now),
  );
  ledger = mutateLedger(
    ledger,
    event("transaction-create", "10.00", "2026-10-01"),
    now,
  );
  assert.equal(overview(ledger, "2026-10", now).balance, 11000);
  assert.throws(() =>
    mutateLedger(
      ledger,
      { ...settings, action: "settings", openingDate: "2026-10-02" },
      now,
    ),
  );
  assert.throws(() =>
    mutateLedger(
      ledger,
      { ...settings, action: "settings", currency: "INR" },
      now,
    ),
  );
  ledger = mutateLedger(
    ledger,
    { ...settings, action: "settings", openingAmount: "-10.00" },
    now,
  );
  assert.equal(overview(ledger, "2026-10", now).balance, 0);
});
test("forecast distinguishes overdue income, due expenses, cancelled items and negative projections", () => {
  let ledger = createLedger(settings, now);
  ledger = mutateLedger(
    ledger,
    event("expectation-create", "500", "2026-10-25"),
    now,
  );
  ledger = mutateLedger(
    ledger,
    { ...event("expectation-create", "150", "2026-10-25"), type: "expense" },
    now,
  );
  const future = event("expectation-create", "30", "2026-10-27");
  ledger = mutateLedger(ledger, future, now);
  const result = overview(ledger, "2026-10", now);
  assert.equal(result.balance, 10000);
  assert.equal(result.income, 0);
  assert.equal(result.forecast.length, 90);
  assert.equal(result.overdue.length, 2);
  assert.equal(result.forecast[0]!.balance, -5000);
  assert.equal(result.forecast[1]!.balance, -2000);
  ledger = mutateLedger(
    ledger,
    { ...future, action: "expectation-update", status: "cancelled" },
    now,
  );
  assert.equal(overview(ledger, "2026-10", now).forecast[1]!.balance, -5000);
});
test("settlement is exactly once; undo requires confirmation and restores expectation", () => {
  let ledger = createLedger(settings, now);
  const expected = event("expectation-create");
  ledger = mutateLedger(ledger, expected, now);
  const txId = randomUUID();
  const settlement = {
    action: "settle",
    id: expected.id,
    transactionId: txId,
    date: "2026-10-26",
  };
  ledger = mutateLedger(ledger, settlement, now);
  assert.equal(overview(ledger, "2026-10", now).balance, 11000);
  assert.equal(overview(ledger, "2026-10", now).forecast[0]!.balance, 11000);
  assert.throws(() => mutateLedger(ledger, settlement, now));
  assert.throws(() =>
    mutateLedger(
      ledger,
      { action: "expectation-delete", id: expected.id },
      now,
    ),
  );
  assert.throws(() =>
    mutateLedger(ledger, { action: "transaction-delete", id: txId }, now),
  );
  ledger = mutateLedger(
    ledger,
    { action: "transaction-delete", id: txId, confirmRestore: true },
    now,
  );
  assert.equal(ledger.transactions.length, 0);
  assert.equal(ledger.expectations[0]!.status, "pending");
  assert.equal(overview(ledger, "2026-10", now).balance, 10000);
  assert.equal(overview(ledger, "2026-10", now).forecast[0]!.balance, 11000);
});

test("expense settlement, corrections and horizon boundary never double count", () => {
  let ledger = createLedger(settings, now);
  const expense = { ...event("expectation-create", "25"), type: "expense" };
  ledger = mutateLedger(ledger, expense, now);
  assert.equal(overview(ledger, "2026-10", now).forecast[0]!.balance, 7500);
  const tx = randomUUID();
  ledger = mutateLedger(
    ledger,
    { action: "settle", id: expense.id, transactionId: tx, date: "2026-10-26" },
    now,
  );
  assert.equal(overview(ledger, "2026-10", now).balance, 7500);
  assert.equal(overview(ledger, "2026-10", now).forecast[0]!.balance, 7500);
  ledger = mutateLedger(
    ledger,
    { ...expense, action: "transaction-update", id: tx, amount: "30" },
    now,
  );
  assert.equal(overview(ledger, "2026-10", now).expense, 3000);
  assert.throws(() =>
    mutateLedger(
      ledger,
      { ...expense, action: "transaction-update", id: tx, type: "income" },
      now,
    ),
  );
  const far = event("expectation-create", "50", "2027-01-24");
  ledger = mutateLedger(ledger, far, now);
  assert.equal(overview(ledger, "2026-10", now).forecast.at(-1)!.balance, 7000);
  ledger = mutateLedger(
    ledger,
    {
      ...far,
      action: "expectation-update",
      status: "pending",
      date: "2027-01-23",
    },
    now,
  );
  assert.equal(
    overview(ledger, "2026-10", now).forecast.at(-1)!.balance,
    12000,
  );
});
