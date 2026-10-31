import { useState } from "react";
import { Text, View } from "react-native";
import { displayMoney, type Ledger, type Snapshot } from "./api";
import { Button, Card, useTheme } from "./ui";
export function spendingData(ledger: Ledger, asOf: string, month: string) {
  const categories = new Map<string, bigint>();
  const end = new Date(`${month}-01T00:00:00Z`);
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(end);
    d.setUTCMonth(d.getUTCMonth() - 5 + i);
    return { month: d.toISOString().slice(0, 7), income: 0n, expense: 0n };
  });
  for (const tx of ledger.transactions) {
    if (tx.date > asOf) continue;
    const bucket = months.find((x) => tx.date.startsWith(x.month));
    if (bucket) bucket[tx.type] += BigInt(tx.amount);
    if (tx.type === "expense" && tx.date.startsWith(month))
      categories.set(
        tx.category,
        (categories.get(tx.category) ?? 0n) + BigInt(tx.amount),
      );
  }
  return {
    months: months.map((x) => ({
      ...x,
      income: Number(x.income),
      expense: Number(x.expense),
    })),
    categories: [...categories]
      .map(([name, amount]) => ({ name, amount: Number(amount) }))
      .sort((a, b) => b.amount - a.amount),
  };
}
export function Monitor({
  ledger,
  summary,
}: {
  ledger: Ledger;
  summary: NonNullable<Snapshot["overview"]>;
}) {
  const { s, colors } = useTheme();
  const [values, setValues] = useState(false);
  const data = spendingData(ledger, summary.asOf, summary.month);
  const peak = Math.max(
    1,
    ...data.months.flatMap((x) => [x.income, x.expense]),
  );
  const categoryPeak = Math.max(1, ...data.categories.map((x) => x.amount));
  return (
    <>
      <Text style={s.title}>Monitor</Text>
      <Text style={s.subtitle}>
        Recorded activity · {summary.month} · {ledger.currency}
      </Text>
      <Card>
        <Text style={s.label}>MONTHLY EXPENDITURE</Text>
        <Text style={s.big}>
          {displayMoney(summary.expense, ledger.currency)}
        </Text>
        <Text style={s.subtitle}>
          Income {displayMoney(summary.income, ledger.currency)} · Net{" "}
          {displayMoney(summary.income - summary.expense, ledger.currency)}
        </Text>
        <Text style={s.subtitle}>
          Actual transactions only. Opening balance and expected payments are
          excluded.
        </Text>
      </Card>
      <Card>
        <Text style={s.label}>Six-month activity</Text>
        <Text style={s.subtitle}>
          Left bar: income · Right bar: expense. Scale starts at zero.
        </Text>
        <Text style={s.subtitle}>
          {data.months[0]!.month} to {data.months[5]!.month}
        </Text>
        <View style={{ flexDirection: "row", gap: 8, paddingVertical: 12 }}>
          {data.months.map((point) => (
            <View
              key={point.month}
              accessible
              accessibilityLabel={`${point.month}: income ${displayMoney(point.income, ledger.currency)}, expenses ${displayMoney(point.expense, ledger.currency)}`}
              style={{ flex: 1, gap: 8 }}
            >
              <View
                style={{
                  height: 140,
                  flexDirection: "row",
                  alignItems: "flex-end",
                  justifyContent: "center",
                  gap: 4,
                  borderBottomWidth: 1,
                  borderColor: colors.line,
                }}
              >
                <View
                  style={{
                    width: 10,
                    height: (point.income / peak) * 140,
                    backgroundColor: colors.accent,
                    borderTopLeftRadius: 5,
                    borderTopRightRadius: 5,
                  }}
                />
                <View
                  style={{
                    width: 10,
                    height: (point.expense / peak) * 140,
                    backgroundColor: colors.danger,
                    borderTopLeftRadius: 5,
                    borderTopRightRadius: 5,
                  }}
                />
              </View>
              <Text style={[s.label, { textAlign: "center", fontSize: 12 }]}>
                {point.month.slice(5)}
              </Text>
            </View>
          ))}
        </View>
        <Button
          secondary
          title={values ? "Hide monthly values" : "Show monthly values"}
          onPress={() => setValues(!values)}
        />
        {values &&
          data.months.map((point) => (
            <Text key={point.month} style={s.subtitle}>
              {point.month} · Income{" "}
              {displayMoney(point.income, ledger.currency)} · Expenses{" "}
              {displayMoney(point.expense, ledger.currency)}
            </Text>
          ))}
      </Card>
      <Card>
        <Text style={s.label}>Where it went · {summary.month}</Text>
        {!data.categories.length && (
          <Text style={s.subtitle}>
            No recorded spending this month. Your first expense will appear
            here.
          </Text>
        )}
        {data.categories.map((item) => (
          <View key={item.name} style={{ gap: 8, paddingVertical: 8 }}>
            <Text style={s.label}>
              {item.name} · {displayMoney(item.amount, ledger.currency)}
            </Text>
            <View
              style={{
                height: 10,
                backgroundColor: colors.line,
                borderRadius: 5,
              }}
            >
              <View
                style={{
                  height: 10,
                  width: `${(item.amount / categoryPeak) * 100}%`,
                  backgroundColor: colors.accent,
                  borderRadius: 5,
                }}
              />
            </View>
          </View>
        ))}
      </Card>
      <Text style={s.subtitle}>
        Change the summary month in Overview. Future estimates are shown
        separately in Forecast.
      </Text>
    </>
  );
}
