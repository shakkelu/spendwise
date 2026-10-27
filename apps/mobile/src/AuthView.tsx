import { useState } from "react";
import { Text, View } from "react-native";
import { request } from "./api";
import { Button, Card, Field, s } from "./ui";
type Mode = "login" | "register" | "verify" | "recover" | "reset";
export function AuthView({
  onLogin,
}: {
  onLogin: (token: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<Mode>("login"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const change = (next: Mode) => {
    setMode(next);
    setPassword("");
    setCode("");
    setNotice("");
  };
  async function submit() {
    setBusy(true);
    setNotice("");
    try {
      if (mode === "login") {
        const result = await request<{ token: string }>("/auth/login", null, {
          email,
          password,
        });
        await onLogin(result.token);
      } else {
        const result = await request<{ message: string }>(
          `/auth/${mode}`,
          null,
          { email, password, token: code },
        );
        setNotice(result.message);
      }
      setPassword("");
      setCode("");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
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
