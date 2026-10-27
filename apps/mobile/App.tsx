import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  Text,
  View,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { AuthView } from "./src/AuthView";
import { EntryForm, SettingsForm, SettlementForm } from "./src/forms";
import {
  decimal,
  displayMoney,
  request,
  RequestError,
  type Entry,
  type Expected,
  type Snapshot,
} from "./src/api";
import { Button, Card, Field, s, colors } from "./src/ui";
const KEY = "spendwise-session";
type Tab = "Overview" | "Transactions" | "Upcoming" | "Forecast" | "Account";
export default function App() {
  return (
    <SafeAreaProvider>
      <Spendwise />
    </SafeAreaProvider>
  );
}
function Spendwise() {
  const [token, setToken] = useState<string | null>(null),
    tokenRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [tab, setTab] = useState<Tab>("Overview"),
    [month, setMonth] = useState("");
  const [editor, setEditor] = useState<{
      expected: boolean;
      record?: Entry | Expected;
    } | null>(null),
    [settlement, setSettlement] = useState<Expected | null>(null);
  const [currentPassword, setCurrentPassword] = useState(""),
    [newPassword, setNewPassword] = useState("");
  const refreshId = useRef(0);
  const [visibleRecords, setVisibleRecords] = useState(50);
  const [storageFailed, setStorageFailed] = useState(false);
  async function clear(message: string) {
    tokenRef.current = null;
    refreshId.current++;
    setToken(null);
    setSnapshot(null);
    setEditor(null);
    setSettlement(null);
    setCurrentPassword("");
    setNewPassword("");
    setMonth("");
    setTab("Overview");
    setNotice(message);
    try {
      await SecureStore.deleteItemAsync(KEY);
      setStorageFailed(false);
    } catch {
      setStorageFailed(true);
      setNotice(
        "Local credential removal failed. Close the app and retry logout before sharing this device.",
      );
    }
  }
  async function refresh(value = tokenRef.current, selectedMonth = month) {
    if (!value) return;
    const id = ++refreshId.current;
    const data = await request<Snapshot>(
      `/account${selectedMonth ? `?month=${encodeURIComponent(selectedMonth)}` : ""}`,
      value,
    );
    if (value === tokenRef.current && id === refreshId.current) {
      setSnapshot(data);
      if (!selectedMonth && data.overview) setMonth(data.overview.month);
    }
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      await action();
    } catch (e) {
      if (e instanceof RequestError && e.status === 401)
        await clear("Your session ended. Please sign in again.");
      else
        setNotice(
          e instanceof Error
            ? e.message
            : "Something went wrong. Please retry.",
        );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void SecureStore.getItemAsync(KEY)
      .then(async (value) => {
        tokenRef.current = value;
        setToken(value);
        if (value) {
          try {
            await refresh(value, "");
          } catch (e) {
            if (e instanceof RequestError && e.status === 401)
              await clear("Please sign in again.");
            else
              setNotice(
                "Could not load your account. Check your connection and refresh.",
              );
          }
        }
      })
      .catch(() =>
        setNotice(
          "Secure credential storage is unavailable. Please retry on a supported device.",
        ),
      )
      .finally(() => setReady(true));
  }, []);
  async function login(value: string) {
    try {
      await SecureStore.setItemAsync(KEY, value);
      setStorageFailed(false);
    } catch {
      try {
        await request("/auth/logout", value, {});
      } catch {
        /* No credential is persisted; remote expiry still applies. */
      }
      throw new Error(
        "Secure storage could not save your session. Please retry on a supported device.",
      );
    }
    tokenRef.current = value;
    setToken(value);
    setNotice("");
    try {
      await refresh(value, "");
    } catch (error) {
      if (tokenRef.current !== value) return;
      if (error instanceof RequestError && error.status === 401)
        await clear("Your session ended. Please sign in again.");
      else
        setNotice(
          "Signed in, but your account could not be loaded. Refresh to retry.",
        );
    }
  }
  async function save(body: Record<string, unknown>) {
    await run(async () => {
      await request(
        snapshot?.ledger ? "/account/operations" : "/account",
        tokenRef.current,
        {
          ...body,
          ...(snapshot?.ledger ? { version: snapshot.ledger.version } : {}),
        },
      );
      setEditor(null);
      setSettlement(null);
      await refresh();
    });
  }
  function remove(record: Entry | Expected, expected: boolean) {
    Alert.alert(
      "Remove this record?",
      expected
        ? "This expectation will no longer contribute to your forecast."
        : "Your actual balance will be recalculated. If linked to an expectation, that expectation returns to pending and may affect the forecast.",
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () =>
            void save({
              action: expected ? "expectation-delete" : "transaction-delete",
              id: record.id,
              confirmRestore: true,
            }),
        },
      ],
    );
  }
  const ledger = snapshot?.ledger,
    summary = snapshot?.overview;
  return (
    <SafeAreaView style={s.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={s.content}
        >
          <Text style={s.brand}>SPENDWISE</Text>
          {!!notice && (
            <Card>
              <Text accessibilityRole="alert" style={s.error}>
                {notice}
              </Text>
            </Card>
          )}
          {storageFailed && (
            <Button
              title="Retry removing saved credential"
              onPress={() => void clear("Local credential removed.")}
            />
          )}
          {!ready ? (
            <ActivityIndicator
              accessibilityLabel="Loading secure session"
              color={colors.accent}
            />
          ) : !token ? (
            <AuthView onLogin={login} />
          ) : (
            <>
              <View style={s.row}>
                {(
                  [
                    "Overview",
                    "Transactions",
                    "Upcoming",
                    "Forecast",
                    "Account",
                  ] as Tab[]
                ).map((item) => (
                  <Button
                    key={item}
                    disabled={busy}
                    secondary={tab !== item}
                    title={item}
                    onPress={() => {
                      setTab(item);
                      setVisibleRecords(50);
                      setEditor(null);
                      setSettlement(null);
                    }}
                  />
                ))}
              </View>
              <Button
                secondary
                disabled={busy}
                title={busy ? "Working…" : "Refresh account"}
                onPress={() => void run(() => refresh())}
              />
              {!snapshot ? (
                <Text style={s.subtitle}>
                  Your account could not be loaded. Refresh to try again.
                </Text>
              ) : !ledger ? (
                <SettingsForm ledger={null} busy={busy} save={save} />
              ) : editor ? (
                <EntryForm
                  key={editor.record?.id ?? String(editor.expected)}
                  ledger={ledger}
                  record={editor.record}
                  expected={editor.expected}
                  asOf={summary!.asOf}
                  busy={busy}
                  save={save}
                  cancel={() => setEditor(null)}
                />
              ) : settlement ? (
                <SettlementForm
                  item={settlement}
                  asOf={summary!.asOf}
                  busy={busy}
                  save={save}
                  cancel={() => setSettlement(null)}
                />
              ) : (
                <>
                  {tab === "Overview" && (
                    <>
                      <Text style={s.title}>Your money, in view</Text>
                      <Text style={s.subtitle}>
                        As of {summary!.asOf} · {ledger.timezone}
                      </Text>
                      <Card>
                        <Text style={s.label}>RECORDED BALANCE</Text>
                        <Text style={s.big}>
                          {displayMoney(summary!.balance, ledger.currency)}
                        </Text>
                        <Text style={s.subtitle}>
                          Opening balance + actual income − actual expenses
                        </Text>
                      </Card>
                      <Card>
                        <Field
                          label="Summary month (YYYY-MM)"
                          value={month}
                          onChangeText={setMonth}
                        />
                        <Button
                          secondary
                          disabled={busy}
                          title="Show month"
                          onPress={() => void run(() => refresh())}
                        />
                        <Text style={s.label}>
                          Income:{" "}
                          {displayMoney(summary!.income, ledger.currency)}
                        </Text>
                        <Text style={s.label}>
                          Expenses:{" "}
                          {displayMoney(summary!.expense, ledger.currency)}
                        </Text>
                      </Card>
                      <View style={s.row}>
                        <Button
                          title="Record transaction"
                          onPress={() => setEditor({ expected: false })}
                        />
                        <Button
                          secondary
                          title="Plan a payment"
                          onPress={() => setEditor({ expected: true })}
                        />
                      </View>
                      <Card>
                        <Text style={s.label}>
                          {summary!.overdue.length} overdue commitments
                        </Text>
                        <Text style={s.subtitle}>
                          Overdue income is excluded from projections. Overdue
                          expenses reduce today’s projection.
                        </Text>
                      </Card>
                    </>
                  )}
                  {(tab === "Transactions" || tab === "Upcoming") && (
                    <>
                      <Text style={s.title}>
                        {tab === "Transactions"
                          ? "Recorded activity"
                          : "What’s coming"}
                      </Text>
                      <Text style={s.subtitle}>
                        {tab === "Transactions"
                          ? "Actual money received and paid."
                          : "Expected amounts are projected, not guaranteed."}
                      </Text>
                      <Button
                        disabled={busy}
                        title={
                          tab === "Transactions"
                            ? "Add transaction"
                            : "Add expectation"
                        }
                        onPress={() =>
                          setEditor({ expected: tab === "Upcoming" })
                        }
                      />
                      {(tab === "Transactions"
                        ? ledger.transactions
                        : ledger.expectations
                      ).length === 0 && (
                        <Card>
                          <Text style={s.subtitle}>
                            No records yet. Add your first item when you’re
                            ready.
                          </Text>
                        </Card>
                      )}
                      {[
                        ...(tab === "Transactions"
                          ? ledger.transactions
                          : ledger.expectations),
                      ]
                        .sort((a, b) => {
                          if (tab === "Transactions")
                            return b.date.localeCompare(a.date);
                          const rank = (item: Entry | Expected) =>
                            "status" in item && item.status === "pending"
                              ? 0
                              : 1;
                          return (
                            rank(a) - rank(b) || a.date.localeCompare(b.date)
                          );
                        })
                        .slice(0, visibleRecords)
                        .map((record) => {
                          const expectation =
                            "status" in record ? (record as Expected) : null;
                          return (
                            <Card key={record.id}>
                              <Text style={s.label}>
                                {record.category} · {record.type}
                              </Text>
                              <Text style={{ ...s.title, fontSize: 23 }}>
                                {displayMoney(record.amount, ledger.currency)}
                              </Text>
                              <Text style={s.subtitle}>
                                {record.date}
                                {expectation
                                  ? ` · ${expectation.status}${record.date < summary!.asOf && expectation.status === "pending" ? " · overdue" : ""}`
                                  : " · recorded"}
                              </Text>
                              {!!record.description && (
                                <Text style={s.subtitle}>
                                  {record.description}
                                </Text>
                              )}
                              {expectation?.status === "settled" ? (
                                <Text style={s.subtitle}>
                                  Scheduled amount shown above. Settled actual
                                  payment:{" "}
                                  {(() => {
                                    const linked = ledger.transactions.find(
                                      (t) => t.id === expectation.transactionId,
                                    );
                                    return linked
                                      ? `${displayMoney(linked.amount, ledger.currency)} on ${linked.date}`
                                      : "linked transaction unavailable";
                                  })()}
                                  . Edit its linked entry in Transactions to
                                  correct it.
                                </Text>
                              ) : (
                                <View style={s.row}>
                                  <Button
                                    secondary
                                    disabled={busy}
                                    title="Edit"
                                    onPress={() =>
                                      setEditor({
                                        expected: !!expectation,
                                        record,
                                      })
                                    }
                                  />
                                  <Button
                                    secondary
                                    disabled={busy}
                                    title="Remove"
                                    onPress={() =>
                                      remove(record, !!expectation)
                                    }
                                  />
                                  {expectation?.status === "pending" && (
                                    <Button
                                      disabled={busy}
                                      title={
                                        record.type === "income"
                                          ? "Received"
                                          : "Paid"
                                      }
                                      onPress={() => setSettlement(expectation)}
                                    />
                                  )}
                                  {expectation && (
                                    <Button
                                      secondary
                                      disabled={busy}
                                      title={
                                        expectation.status === "cancelled"
                                          ? "Restore"
                                          : "Cancel item"
                                      }
                                      onPress={() =>
                                        void save({
                                          ...record,
                                          action: "expectation-update",
                                          amount: decimal(
                                            record.amount,
                                            ledger.currency,
                                          ),
                                          status:
                                            expectation.status === "cancelled"
                                              ? "pending"
                                              : "cancelled",
                                        })
                                      }
                                    />
                                  )}
                                </View>
                              )}
                            </Card>
                          );
                        })}
                    </>
                  )}
                  {(tab === "Transactions" || tab === "Upcoming") &&
                    (tab === "Transactions"
                      ? ledger.transactions.length
                      : ledger.expectations.length) > visibleRecords && (
                      <Button
                        secondary
                        title="Show 50 more records"
                        onPress={() => setVisibleRecords((n) => n + 50)}
                      />
                    )}
                  {tab === "Forecast" && (
                    <>
                      <Text style={s.title}>The next 90 days</Text>
                      <Card>
                        <Text style={s.label}>PROJECTED · NOT GUARANTEED</Text>
                        <Text style={s.subtitle}>{summary!.assumptions}</Text>
                        <Text style={s.big}>
                          {displayMoney(
                            summary!.forecast[89]!.balance,
                            ledger.currency,
                          )}
                        </Text>
                        <Text style={s.subtitle}>
                          Projected at the end of the horizon
                        </Text>
                      </Card>
                      <Card>
                        {summary!.forecast.map((point) => (
                          <View key={point.date} style={s.divider}>
                            <Text style={s.label}>{point.date}</Text>
                            <Text
                              style={[s.subtitle, point.balance < 0 && s.error]}
                            >
                              {displayMoney(point.balance, ledger.currency)}
                              {point.balance < 0
                                ? " · projected shortfall"
                                : ""}
                            </Text>
                          </View>
                        ))}
                      </Card>
                    </>
                  )}
                  {tab === "Account" && (
                    <>
                      <Text style={s.title}>Your account</Text>
                      <Text style={s.subtitle}>{snapshot.email}</Text>
                      <SettingsForm
                        key={ledger.version}
                        ledger={ledger}
                        busy={busy}
                        save={save}
                      />
                      <Card>
                        <Text style={s.label}>Change password</Text>
                        <Field
                          label="Current password"
                          value={currentPassword}
                          onChangeText={setCurrentPassword}
                          secureTextEntry
                        />
                        <Field
                          label="New password (15–128 characters)"
                          value={newPassword}
                          onChangeText={setNewPassword}
                          secureTextEntry
                        />
                        <Button
                          disabled={busy}
                          title="Change and sign out all devices"
                          onPress={() =>
                            void run(async () => {
                              await request(
                                "/auth/password",
                                tokenRef.current,
                                { currentPassword, password: newPassword },
                              );
                              await clear("Password changed. Sign in again.");
                            })
                          }
                        />
                      </Card>
                    </>
                  )}
                </>
              )}
              <Button
                secondary
                disabled={busy}
                title="Sign out"
                onPress={() =>
                  void run(async () => {
                    let confirmed = true;
                    try {
                      await request("/auth/logout", tokenRef.current, {});
                    } catch {
                      confirmed = false;
                    }
                    await clear(
                      confirmed
                        ? "Signed out."
                        : "Signed out on this device. Server revocation could not be confirmed; the remote session may remain valid until expiry.",
                    );
                  })
                }
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
