import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import {
  createLedger,
  mutateLedger,
  validateLedger,
  overview,
} from "../src/finance.js";
const now = new Date("2026-10-27T12:00:00Z");
function fixture() {
  let ledger = createLedger(
    {
      currency: "KWD",
      timezone: "UTC",
      openingAmount: "100.001",
      openingDate: "2026-01-01",
    },
    now,
  );
  const id = randomUUID();
  ledger = mutateLedger(
    ledger,
    {
      action: "expectation-create",
      id,
      type: "expense",
      amount: "1.234",
      date: "2026-10-27",
      category: "Food",
      description: "Synthetic",
    },
    now,
  );
  return mutateLedger(
    ledger,
    { action: "settle", id, transactionId: randomUUID(), date: "2026-10-27" },
    now,
  );
}
test("import round trip preserves precision, opening balance, settlement and forecast without duplication", () => {
  const source = fixture();
  const restored = validateLedger(JSON.parse(JSON.stringify(source)), now);
  assert.deepEqual(restored, source);
  assert.deepEqual(
    overview(restored, "2026-10", now),
    overview(source, "2026-10", now),
  );
  assert.equal(overview(restored, "2026-10", now).balance, 98767);
});
test("import rejects malformed amounts, dates, duplicate IDs, broken links, wrong types and oversized ledgers", () => {
  for (const edit of [
    (x: ReturnType<typeof fixture>) => {
      x.transactions[0]!.amount = 1.2;
    },
    (x: ReturnType<typeof fixture>) => {
      x.transactions[0]!.amount = -1;
    },
    (x: ReturnType<typeof fixture>) => {
      x.transactions[0]!.date = "2027-01-01";
    },
    (x: ReturnType<typeof fixture>) => {
      x.transactions[0]!.date = "2025-01-01";
    },
    (x: ReturnType<typeof fixture>) => {
      x.expectations[0]!.id = x.transactions[0]!.id;
    },
    (x: ReturnType<typeof fixture>) => {
      x.expectations[0]!.transactionId = randomUUID();
    },
    (x: ReturnType<typeof fixture>) => {
      x.transactions[0]!.type = "income";
    },
    (x: ReturnType<typeof fixture>) => {
      x.expectations[0]!.status = "pending";
    },
    (x: ReturnType<typeof fixture>) => {
      x.transactions = Array.from({ length: 5001 }, () => x.transactions[0]!);
    },
  ]) {
    const source = fixture();
    edit(source);
    assert.throws(() => validateLedger(source, now));
  }
});
