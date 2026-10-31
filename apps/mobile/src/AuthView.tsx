import { useState } from "react";
import { Text, View } from "react-native";
import { request } from "./api";
import { Button, Card, Field, useTheme } from "./ui";
type Mode = "login" | "register" | "verify" | "recover" | "reset";
export function AuthView({
  onLogin,
  signupEmail,
  prepareSignup,
  beforeLogin,
  onBusyChange,
}: {
  onLogin: (token: string, email?: string, transfer?: boolean) => Promise<void>;
  onBusyChange?: (busy: boolean) => void;
  signupEmail?: string;
  prepareSignup?: (email: string) => Promise<string | undefined>;
  beforeLogin?: (transfer: boolean) => Promise<boolean>;
}) {
  const { s } = useTheme();
  const [mode, setMode] = useState<Mode>("login"),
    [email, setEmail] = useState(signupEmail ?? ""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [joining, setJoining] = useState(!!signupEmail);
  const change = (next: Mode) => {
    setMode(next);
    if (next === "register") setJoining(true);
    setPassword("");
    setCode("");
    setNotice("");
  };
  async function submit() {
    if (busy) return;
    setBusy(true);
    onBusyChange?.(true);
    setNotice("");
    try {
      if (mode === "login") {
        if (beforeLogin && !(await beforeLogin(joining))) return;
        const result = await request<{ token: string }>("/auth/login", null, {
          email,
          password,
        });
        if (beforeLogin) await onLogin(result.token, email, joining);
        else await onLogin(result.token);
      } else {
        const transferKey =
          mode === "register"
            ? await prepareSignup?.(email.trim().toLowerCase())
            : undefined;
        const result = await request<{ message: string }>(
          `/auth/${mode}`,
          null,
          {
            email,
            password,
            token: code,
            ...(transferKey ? { transferKey } : {}),
          },
        );
        if (mode === "register") setMode("verify");
        if (mode === "verify") setMode("login");
        setNotice(result.message);
      }
      setPassword("");
      setCode("");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  const titles = {
    login: "Welcome back",
    register: "Your money, clearer",
    verify: "Verify your email",
    recover: "Recover access",
    reset: "Choose a new password",
  };
  return (
    <>
      <Text style={s.title}>{titles[mode]}</Text>
      <Text style={s.subtitle}>
        A clear view of what you have, what’s due, and what might come next.
      </Text>
      {prepareSignup && (
        <Text style={s.subtitle}>
          {joining
            ? "New account: verify your email, then sign in to transfer your device records. They stay on this device until transfer succeeds."
            : "Existing account: signing in replaces device records only after your confirmation and a successful cloud load."}
        </Text>
      )}
      {prepareSignup && joining && (
        <Button
          secondary
          title="Use an existing account instead"
          disabled={busy}
          onPress={() => {
            setJoining(false);
            change("login");
          }}
        />
      )}
      <Card>
        {["login", "register", "recover"].includes(mode) && (
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
          />
        )}
        {["verify", "reset"].includes(mode) && (
          <Field
            label="Code from email"
            value={code}
            onChangeText={setCode}
            autoCapitalize="none"
            autoCorrect={false}
          />
        )}
        {["login", "register", "reset"].includes(mode) && (
          <Field
            label="Password (15–128 characters)"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
          />
        )}
        {!!notice && (
          <Text accessibilityRole="alert" style={s.subtitle}>
            {notice}
          </Text>
        )}
        <Button
          disabled={busy}
          title={
            busy ? "Please wait…" : mode === "login" ? "Sign in" : "Continue"
          }
          onPress={() => void submit()}
        />
        {mode === "verify" && (
          <>
            <Field
              label="Email to resend verification"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Button
              secondary
              disabled={busy}
              title="Resend verification"
              onPress={() => {
                setBusy(true);
                void request<{ message: string }>(
                  "/auth/request-verification",
                  null,
                  { email },
                )
                  .then((r) => setNotice(r.message))
                  .catch((e) => setNotice(e.message))
                  .finally(() => setBusy(false));
              }}
            />
          </>
        )}
      </Card>
      <View style={s.row}>
        {(["login", "register", "verify", "recover", "reset"] as Mode[])
          .filter((m) => m !== mode)
          .map((m) => (
            <Button
              secondary
              disabled={busy}
              key={m}
              title={
                {
                  login: "Sign in",
                  register: "Create account",
                  verify: "Verify email",
                  recover: "Forgot password",
                  reset: "Use recovery code",
                }[m]
              }
              onPress={() => change(m)}
            />
          ))}
      </View>
      <Text style={s.subtitle}>
        Your account must be verified before you can access private records.
        Forecasts are estimates, never guaranteed funds.
      </Text>
    </>
  );
}
