import { useState } from "react";
import { Text, View } from "react-native";
import { randomUUID } from "expo-crypto";
import {
  decimal,
  type Entry,
  type Expected,
  type Ledger,
  type Currency,
} from "./api";
import { Button, Card, Field, s } from "./ui";
export function SettingsForm({
  ledger,
  busy,
  save,
}: {
  ledger: Ledger | null;
  busy: boolean;
  save: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [currency, setCurrency] = useState<Currency>(ledger?.currency ?? "USD"),
    [timezone, setTimezone] = useState(ledger?.timezone ?? "UTC"),
    [amount, setAmount] = useState(
      ledger ? decimal(ledger.openingAmount, ledger.currency) : "0",
    ),
    [day, setDay] = useState(
      ledger?.openingDate ?? new Date().toISOString().slice(0, 10),
    );
  return (
    <Card>
      <Text style={s.label}>Opening balance & account</Text>
      <Text style={s.subtitle}>
        Balance at the START of this date. Transactions you add on or after this
        date must not already be included. Currency cannot change after setup.
      </Text>
      {!ledger && (
        <View style={s.row}>
          {(["USD", "EUR", "GBP", "INR", "JPY", "KWD"] as Currency[]).map(
            (c) => (
              <Button
                key={c}
                secondary={currency !== c}
                disabled={busy}
                title={c}
                onPress={() => setCurrency(c)}
              />
            ),
          )}
        </View>
      )}
      <Field
        label={`Opening balance (${currency}) — may be negative`}
        value={amount}
        onChangeText={setAmount}
        keyboardType="numbers-and-punctuation"
      />
      <Field
        label="Opening date (YYYY-MM-DD)"
        value={day}
        onChangeText={setDay}
        autoCapitalize="none"
      />
      <Field
        label="Account timezone (IANA name, e.g. Asia/Kolkata)"
        value={timezone}
        onChangeText={setTimezone}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Button
        disabled={busy}
        title={
          busy
            ? "Saving…"
            : ledger
              ? "Update opening balance"
              : "Set up my account"
        }
        onPress={() =>
          void save({
            currency,
            timezone,
            openingAmount: amount,
            openingDate: day,
            ...(ledger ? { action: "settings" } : {}),
          })
        }
      />
    </Card>
  );
}
export function EntryForm({
  ledger,
  record,
  expected,
  asOf,
  busy,
  save,
  cancel,
}: {
  ledger: Ledger;
  record?: Entry | Expected;
  expected: boolean;
  asOf: string;
  busy: boolean;
  save: (body: Record<string, unknown>) => Promise<void>;
  cancel: () => void;
}) {
  const [id] = useState(record?.id ?? randomUUID()),
    [type, setType] = useState(record?.type ?? "expense"),
    [amount, setAmount] = useState(
      record ? decimal(record.amount, ledger.currency) : "",
    ),
    [day, setDay] = useState(record?.date ?? asOf),
    [category, setCategory] = useState(record?.category ?? "General"),
    [description, setDescription] = useState(record?.description ?? "");
  return (
    <Card>
      <Text style={s.title}>
        {record ? "Edit" : "Add"} {expected ? "expectation" : "transaction"}
      </Text>
      <Text style={s.subtitle}>
        {expected
          ? "Projected, not guaranteed. Use the scheduled date; settle it only when money is actually received or paid."
          : "Record only money already received or paid. Do not include amounts already reflected in the opening balance."}
      </Text>
      <View style={s.row}>
        <Button
          disabled={busy}
          title="Income"
          secondary={type !== "income"}
          onPress={() => setType("income")}
        />
        <Button
          disabled={busy}
          title="Expense"
          secondary={type !== "expense"}
          onPress={() => setType("expense")}
        />
      </View>
      <Field
        label={`Positive amount (${ledger.currency})`}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
      />
      <Field
        label={`${expected ? "Scheduled" : "Recorded"} date (YYYY-MM-DD)`}
        value={day}
        onChangeText={setDay}
        autoCapitalize="none"
      />
      <Field
        label="Category"
        value={category}
        onChangeText={setCategory}
        maxLength={40}
      />
      <Field
        label="Description (optional)"
        value={description}
        onChangeText={setDescription}
        maxLength={300}
      />
      <Button
        disabled={busy}
        title={busy ? "Saving…" : "Save"}
        onPress={() =>
          void save({
            action: `${expected ? "expectation" : "transaction"}-${record ? "update" : "create"}`,
            id,
            type,
            amount,
            date: day,
            category,
            description,
            ...(expected
              ? {
                  status:
                    record && "status" in record ? record.status : "pending",
                }
              : {}),
          })
        }
      />
      <Button disabled={busy} secondary title="Cancel" onPress={cancel} />
    </Card>
  );
}
export function SettlementForm({
  item,
  asOf,
  busy,
  save,
  cancel,
}: {
  item: Expected;
  asOf: string;
  busy: boolean;
  save: (body: Record<string, unknown>) => Promise<void>;
  cancel: () => void;
}) {
  const [day, setDay] = useState(asOf),
    [transactionId] = useState(randomUUID());
  return (
    <Card>
      <Text style={s.title}>
        {item.type === "income" ? "Mark received" : "Mark paid"}
      </Text>
      <Text style={s.subtitle}>
        This creates one actual transaction and removes this item from projected
        amounts. For partial or different payments, edit the expectation amount
        first.
      </Text>
      <Field
        label="Actual receipt/payment date (YYYY-MM-DD)"
        value={day}
        onChangeText={setDay}
      />
      <Button
        disabled={busy}
        title="Confirm settlement"
        onPress={() =>
          void save({ action: "settle", id: item.id, transactionId, date: day })
        }
      />
      <Button disabled={busy} secondary title="Cancel" onPress={cancel} />
    </Card>
  );
}
