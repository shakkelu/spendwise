import { randomUUID } from "expo-crypto";
import {
  createLedger,
  mutateLedger,
  overview,
  today,
  validateLedger,
} from "../../services/api/src/finance";
import {
  emptyDevice,
  readDevice,
  writeDevice,
  type DeviceState,
} from "./src/storage";
import { Monitor } from "./src/Monitor";
import { BottomTabs, Drawer, type Tab } from "./src/Navigation";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
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
import { Button, Card, Field, useTheme, ThemeProvider } from "./src/ui";
const KEY = "spendwise-session";

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Spendwise />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
function Spendwise() {
  const { s, colors, dark } = useTheme();
  const scroll = useRef<ScrollView>(null);
  const [device, setDevice] = useState<DeviceState>(emptyDevice);
  const deviceRef = useRef<DeviceState>(emptyDevice());
  const [authOpen, setAuthOpen] = useState(false),
    [menuOpen, setMenuOpen] = useState(false);
  const [deviceError, setDeviceError] = useState(false);
  async function persist(changes: Parameters<typeof writeDevice>[1]) {
    const next = await writeDevice(deviceRef.current, changes);
    deviceRef.current = next;
    setDevice(next);
    return next;
  }
  function localSnapshot(
    state = deviceRef.current,
    selectedMonth = month,
  ): Snapshot {
    const ledger = state.ledger;
    return {
      email: "Device-only records",
      ledger,
      overview: ledger
        ? overview(ledger, selectedMonth || today(ledger.timezone).slice(0, 7))
        : null,
    };
  }
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
  useEffect(() => {
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (busy) return true;
      if (editor) {
        setEditor(null);
        return true;
      }
      if (settlement) {
        setSettlement(null);
        return true;
      }
      if (authOpen && device.guest) {
        setAuthOpen(false);
        return true;
      }
      if (tab !== "Overview") {
        setTab("Overview");
        return true;
      }
      return false;
    });
    return () => listener.remove();
  }, [busy, editor, settlement, authOpen, device.guest, tab]);
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
    setAuthOpen(true);
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
    if (!value) {
      if (deviceRef.current.guest) {
        const data = localSnapshot(deviceRef.current, selectedMonth);
        setSnapshot(data);
        if (!selectedMonth && data.overview) setMonth(data.overview.month);
      }
      return;
    }
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
  const running = useRef(false);
  async function run(action: () => Promise<void>) {
    if (busy || running.current) return;
    running.current = true;
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
      running.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    void (async () => {
      try {
        const state = await readDevice();
        deviceRef.current = state;
        setDevice(state);
        let value = await SecureStore.getItemAsync(KEY);
        // A crash between credential persistence and local cleanup must not
        // silently discard guest data on restart. Resume through authentication.
        if (value && state.guest) {
          await SecureStore.deleteItemAsync(KEY);
          value = null;
        }
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
        } else if (state.guest) {
          const data = localSnapshot(state, "");
          setSnapshot(data);
          setMonth(data.overview?.month ?? "");
        }
      } catch {
        setDeviceError(true);
        setNotice(
          "Device storage could not be read. No records were erased. Close and reopen the app to retry.",
        );
      } finally {
        setReady(true);
      }
    })();
  }, []);
  async function login(value: string, email?: string, transfer = false) {
    try {
      if (deviceRef.current.ledger && transfer) {
        const pending = deviceRef.current.signup;
        if (!pending || pending.email !== email?.trim().toLowerCase())
          throw new Error(
            "Sign in to the new account created on this device to transfer these records, or choose existing-account sign-in.",
          );
        if (!pending.upload)
          await persist({
            signup: { ...pending, upload: deviceRef.current.ledger },
          });
        const confirmation = await request<{ imported: boolean }>(
          "/account/import",
          value,
          {
            key: pending.key,
            ledger: deviceRef.current.signup!.upload,
          },
        );
        if (confirmation?.imported !== true)
          throw new Error(
            "Transfer confirmation was incomplete. Device records have been kept.",
          );
      }
      const data = await request<Snapshot>("/account", value);
      if (!data || typeof data.email !== "string" || data.ledger === undefined)
        throw new Error(
          "Cloud account response was incomplete. Device records have been kept.",
        );
      if (data.ledger !== null) {
        data.ledger = validateLedger(data.ledger);
        data.overview = overview(
          data.ledger,
          today(data.ledger.timezone).slice(0, 7),
        );
      } else if (transfer && deviceRef.current.ledger)
        throw new Error(
          "Cloud transfer could not be confirmed. Device records have been kept.",
        );
      await SecureStore.setItemAsync(KEY, value);
      try {
        await persist({ guest: false, ledger: null, signup: null });
      } catch (error) {
        try {
          await SecureStore.deleteItemAsync(KEY);
        } catch {
          setStorageFailed(true);
          setNotice(
            "Local credential removal failed. Retry removing the saved credential before sharing this device.",
          );
        }
        throw error;
      }
      tokenRef.current = value;
      setToken(value);
      setSnapshot(data);
      setAuthOpen(false);
      setStorageFailed(false);
      setNotice("");
      setMonth(data.overview?.month ?? "");
      setTab("Overview");
      setEditor(null);
      setSettlement(null);
    } catch (error) {
      try {
        await request("/auth/logout", value, {});
      } catch {
        /* Remote session expires normally. */
      }
      throw error;
    }
  }
  async function prepareSignup(email: string) {
    if (!deviceRef.current.ledger) return undefined;
    const pending = deviceRef.current.signup;
    if (pending?.upload)
      throw new Error(
        "A transfer is already in progress. Verify and sign in to that new account to finish it.",
      );
    const key =
      pending?.email === email
        ? pending.key
        : randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
    await persist({ signup: { email, key, upload: null } });
    return key;
  }
  async function beforeLogin(transfer: boolean) {
    if (!deviceRef.current.ledger || transfer) return true;
    return new Promise<boolean>((resolve) =>
      Alert.alert(
        "Replace device records?",
        "Signing in to an existing account replaces all records stored on this device with its cloud records. Device-only records will be deleted after the account loads successfully. This cannot be undone.",
        [
          { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
          {
            text: "Replace and sign in",
            style: "destructive",
            onPress: () => resolve(true),
          },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      ),
    );
  }
  async function startLocal() {
    await run(async () => {
      const state = await persist({ guest: true });
      setSnapshot(localSnapshot(state, ""));
      setAuthOpen(false);
      setTab("Overview");
    });
  }
  function selectTab(next: Tab) {
    scroll.current?.scrollTo({ y: 0, animated: false });
    setTab(next);
    setVisibleRecords(50);
    setEditor(null);
    setSettlement(null);
  }
  function logout() {
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
    });
  }
  async function save(body: Record<string, unknown>) {
    await run(async () => {
      if (!tokenRef.current && deviceRef.current.guest) {
        if (deviceRef.current.signup?.upload)
          throw new Error(
            "Finish the pending account transfer before editing device records.",
          );
        const ledger = deviceRef.current.ledger;
        const next = ledger ? mutateLedger(ledger, body) : createLedger(body);
        await persist({ ledger: next });
      } else
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
      <StatusBar
        barStyle={dark ? "light-content" : "dark-content"}
        backgroundColor={colors.bg}
      />
      {ready && (token || device.guest) && !authOpen && (
        <View
          style={{
            paddingHorizontal: 20,
            paddingVertical: 10,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Button
            secondary
            title="☰ Menu"
            disabled={busy}
            onPress={() => setMenuOpen(true)}
          />
          <Text style={s.label}>
            {device.guest ? "DEVICE ONLY" : "CLOUD ACCOUNT"}
          </Text>
        </View>
      )}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scroll}
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
          ) : deviceError ? (
            <Text style={s.error}>
              Storage is unavailable. Your existing data has been preserved.
            </Text>
          ) : !token && (!device.guest || authOpen) ? (
            <>
              <Button
                title={
                  device.guest
                    ? "Back to device records"
                    : "Continue without an account"
                }
                disabled={busy || storageFailed}
                onPress={() => void startLocal()}
              />
              <Text style={s.subtitle}>
                Device-only mode needs no account or connection. Removing the
                app or clearing its data can erase these records; there is no
                cloud recovery.
              </Text>
              <AuthView
                onLogin={login}
                signupEmail={device.signup?.email}
                prepareSignup={prepareSignup}
                beforeLogin={beforeLogin}
                onBusyChange={setBusy}
              />
            </>
          ) : (
            <>
              {device.signup?.upload && (
                <Text style={s.error}>
                  Account transfer is pending. Device records are kept read-only
                  until you finish signing in from the menu.
                </Text>
              )}
              <Button
                secondary
                disabled={busy}
                title={
                  busy
                    ? "Working…"
                    : device.guest
                      ? "Refresh device totals"
                      : "Refresh account"
                }
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
                  {tab === "Monitor" && (
                    <Monitor ledger={ledger} summary={summary!} />
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
                      {!device.guest && (
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
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      {ready && (token || device.guest) && !authOpen && (
        <BottomTabs tab={tab} select={selectTab} disabled={busy} />
      )}
      <Drawer
        open={menuOpen}
        close={() => setMenuOpen(false)}
        select={selectTab}
        guest={device.guest}
        email={snapshot?.email}
        busy={busy}
        logout={logout}
        connect={() => setAuthOpen(true)}
      />
    </SafeAreaView>
  );
}
