export type Kind = "income" | "expense";
export type Currency = "USD" | "EUR" | "GBP" | "INR" | "JPY" | "KWD";
export const precision: Record<Currency, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  INR: 2,
  JPY: 0,
  KWD: 3,
};
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
export interface Snapshot {
  email: string;
  ledger: Ledger | null;
  overview: {
    asOf: string;
    month: string;
    balance: number;
    income: number;
    expense: number;
    forecast: { date: string; balance: number }[];
    overdue: Expected[];
    assumptions: string;
  } | null;
}
export class RequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function decimal(amount: number, currency: Currency) {
  const digits = precision[currency];
  const raw = Math.abs(amount)
    .toString()
    .padStart(digits + 1, "0");
  return `${amount < 0 ? "-" : ""}${digits ? `${raw.slice(0, -digits)}.${raw.slice(-digits)}` : raw}`;
}
export function displayMoney(amount: number, currency: Currency) {
  return `${currency} ${decimal(amount, currency)}`;
}

export async function request<T>(
  path: string,
  token: string | null,
  body?: unknown,
): Promise<T> {
  const base =
    process.env.EXPO_PUBLIC_API_URL ?? (__DEV__ ? "http://127.0.0.1:3000" : "");
  if (!base || (!__DEV__ && !base.startsWith("https://")))
    throw new Error("A production HTTPS API address must be configured.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
      method: body === undefined ? "GET" : "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const content = await response.text();
    const data = content ? JSON.parse(content) : null;
    if (!response.ok)
      throw new RequestError(
        response.status,
        typeof data?.error === "string"
          ? data.error
          : "Request failed. Please try again.",
      );
    return data as T;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new Error(
      "Unable to reach Spendwise. Check your connection and try again; refresh before repeating a saved change.",
      { cause: error },
    );
  } finally {
    clearTimeout(timer);
  }
}
