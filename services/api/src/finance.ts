import { ApiError, object, text } from "./errors.js";

export const precision = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  INR: 2,
  JPY: 0,
  KWD: 3,
} as const;
export type Currency = keyof typeof precision;
export type Kind = "income" | "expense";
export interface Entry {
  id: string;
  type: Kind;
  amount: number;
  date: string;
  category: string;
  description: string;
}
export interface Expected extends Entry {
  status: "pending" | "cancelled" | "settled";
  transactionId?: string;
}
export interface Ledger {
  version: number;
  currency: Currency;
  timezone: string;
  openingAmount: number;
  openingDate: string;
  transactions: Entry[];
  expectations: Expected[];
}
export const LIMIT = 1_000_000_000_000;
const fail = (message: string): never => {
  throw new ApiError(400, message);
};

export function money(value: unknown, currency: Currency, signed = false) {
  if (
    typeof value !== "string" ||
    !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) ||
    value.length > 24
  )
    return fail("Enter a plain decimal amount.");
  const negative = value.startsWith("-");
  const [whole, decimal = ""] = value.replace(/^-/, "").split(".");
  const digits = precision[currency];
  if (decimal.length > digits)
    return fail(
      `This currency permits ${digits} decimal places; no rounding is applied.`,
    );
  const amount =
    BigInt(whole!) * 10n ** BigInt(digits) +
    BigInt(decimal.padEnd(digits, "0") || "0");
  if (amount > BigInt(LIMIT) || (!signed && (negative || amount === 0n)))
    return fail("Amount must be positive and within the supported limit.");
  return Number(negative ? -amount : amount);
}
export function date(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < "1900-01-01" ||
    value > "2199-12-31"
  )
    return fail("Enter a valid date from 1900 through 2199.");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    return fail("Invalid calendar date.");
  return value;
}
export function today(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (part: string) => parts.find((p) => p.type === part)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function identifier(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      value,
    )
  )
    return fail("A valid UUID v4 is required.");
  return value.toLowerCase();
}
function configuration(input: Record<string, unknown>, now: Date) {
  if (
    typeof input.currency !== "string" ||
    !Object.hasOwn(precision, input.currency)
  )
    return fail("Unsupported currency.");
  const currency = input.currency as Currency;
  const timezone = text(input.timezone, "timezone", 80);
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    return fail("Invalid timezone.");
  }
  const openingDate = date(input.openingDate);
  if (openingDate > today(timezone, now))
    return fail("Opening date cannot be in the future.");
  return {
    currency,
    timezone,
    openingDate,
    openingAmount: money(input.openingAmount, currency, true),
  };
}
export function createLedger(value: unknown, now = new Date()): Ledger {
  return {
    ...configuration(object(value), now),
    version: 0,
    transactions: [],
    expectations: [],
  };
}
function entry(
  value: unknown,
  ledger: Ledger,
  actual: boolean,
  now: Date,
): Entry {
  const input = object(value);
  if (input.type !== "income" && input.type !== "expense")
    return fail("Choose income or expense.");
  const day = date(input.date);
  if (day < ledger.openingDate || (actual && day > today(ledger.timezone, now)))
    return fail(
      "Recorded dates must be between the opening date and today; expectations cannot predate the opening balance.",
    );
  return {
    id: identifier(input.id),
    type: input.type,
    amount: money(input.amount, ledger.currency),
    date: day,
    category: text(input.category, "category", 40),
    description:
      typeof input.description === "string" && input.description.length <= 300
        ? input.description.trim()
        : fail("Description must be at most 300 characters."),
  };
}
export function mutateLedger(
  current: Ledger,
  value: unknown,
  now = new Date(),
): Ledger {
  const input = object(value);
  const result = structuredClone(current);
  const id = input.action === "settings" ? "" : identifier(input.id);
  const tx = result.transactions.find((x) => x.id === id);
  const expected = result.expectations.find((x) => x.id === id);
  const ensureRoom = () => {
    if (result.transactions.length + result.expectations.length >= 5000)
      throw new ApiError(
        409,
        "Account record limit reached (5,000). No records were removed.",
      );
  };
  switch (input.action) {
    case "settings": {
      const next = configuration(input, now);
      if (next.currency !== current.currency)
        return fail("Account currency cannot change.");
      if (
        [...result.transactions, ...result.expectations].some(
          (x) => x.date < next.openingDate,
        )
      )
        return fail("Opening date cannot move past existing records.");
      if (result.transactions.some((x) => x.date > today(next.timezone, now)))
        return fail("Timezone would make an actual transaction future-dated.");
      Object.assign(result, next);
      break;
    }
    case "transaction-create":
      if (tx || expected)
        throw new ApiError(
          409,
          "Record already exists. Refresh before retrying.",
        );
      ensureRoom();
      result.transactions.push(entry(input, result, true, now));
      break;
    case "transaction-update":
      if (!tx) throw new ApiError(404, "Record not found.");
      {
        const next = entry(input, result, true, now);
        const linked = result.expectations.find((x) => x.transactionId === id);
        if (linked && next.type !== linked.type)
          return fail("A settled payment cannot change income/expense type.");
        Object.assign(tx, next);
      }
      break;
    case "transaction-delete":
      if (!tx) throw new ApiError(404, "Record not found.");
      {
        const linked = result.expectations.find((x) => x.transactionId === id);
        if (linked) {
          if (input.confirmRestore !== true)
            return fail("Confirm restoring the linked expectation to pending.");
          linked.status = "pending";
          delete linked.transactionId;
        }
      }
      result.transactions = result.transactions.filter((x) => x.id !== id);
      break;
    case "expectation-create":
      if (expected || tx)
        throw new ApiError(
          409,
          "Record already exists. Refresh before retrying.",
        );
      ensureRoom();
      result.expectations.push({
        ...entry(input, result, false, now),
        status: "pending",
      });
      break;
    case "expectation-update":
      if (!expected) throw new ApiError(404, "Record not found.");
      if (expected.status === "settled")
        return fail(
          "Edit the linked transaction or undo its settlement first.",
        );
      if (input.status !== "pending" && input.status !== "cancelled")
        return fail("Choose pending or cancelled.");
      Object.assign(expected, entry(input, result, false, now), {
        status: input.status,
      });
      break;
    case "expectation-delete":
      if (!expected) throw new ApiError(404, "Record not found.");
      if (expected.status === "settled")
        return fail(
          "Undo the linked transaction before deleting this expectation.",
        );
      result.expectations = result.expectations.filter((x) => x.id !== id);
      break;
    case "settle":
      if (!expected) throw new ApiError(404, "Record not found.");
      if (expected.status !== "pending")
        throw new ApiError(409, "Only pending expectations can be settled.");
      ensureRoom();
      {
        const transactionId = identifier(input.transactionId);
        if (
          [...result.transactions, ...result.expectations].some(
            (x) => x.id === transactionId,
          )
        )
          throw new ApiError(409, "Record ID already exists.");
        const settlementDate = date(input.date);
        if (
          settlementDate < result.openingDate ||
          settlementDate > today(result.timezone, now)
        )
          return fail(
            "Settlement date must be between opening date and today.",
          );
        result.transactions.push({
          id: transactionId,
          type: expected.type,
          amount: expected.amount,
          date: settlementDate,
          category: expected.category,
          description: expected.description,
        });
        expected.status = "settled";
        expected.transactionId = transactionId;
      }
      break;
    default:
      return fail("Unknown financial operation.");
  }
  result.version++;
  return result;
}
function safe(value: bigint) {
  if (
    value > BigInt(Number.MAX_SAFE_INTEGER) ||
    value < BigInt(Number.MIN_SAFE_INTEGER)
  )
    throw new ApiError(422, "Calculated amount exceeds the supported range.");
  return Number(value);
}
const signed = (entry: Entry) =>
  BigInt(entry.amount) * (entry.type === "income" ? 1n : -1n);
export function overview(ledger: Ledger, month: string, now = new Date()) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return fail("Invalid month.");
  const day = today(ledger.timezone, now);
  let balance = BigInt(ledger.openingAmount),
    income = 0n,
    expense = 0n;
  for (const tx of ledger.transactions) {
    if (tx.date <= day) balance += signed(tx);
    if (tx.date.startsWith(month)) {
      if (tx.type === "income") income += BigInt(tx.amount);
      else expense += BigInt(tx.amount);
    }
  }
  const pending = ledger.expectations.filter((x) => x.status === "pending");
  const overdue = pending.filter((x) => x.date < day);
  let projected = balance;
  const forecast = Array.from({ length: 90 }, (_, i) => {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const current = d.toISOString().slice(0, 10);
    for (const item of pending)
      if (
        item.date === current ||
        (i === 0 && item.type === "expense" && item.date < day)
      )
        projected += signed(item);
    return { date: current, balance: safe(projected) };
  });
  return {
    asOf: day,
    month,
    balance: safe(balance),
    income: safe(income),
    expense: safe(expense),
    forecast,
    overdue,
    assumptions:
      "90-day projection, not guaranteed. Overdue income is excluded; overdue expenses reduce today. Actual transactions already reflected in the opening balance must not be entered again.",
  };
}
