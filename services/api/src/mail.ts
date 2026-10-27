import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import type { Deliver } from "./accounts.js";

export function mailDelivery(env: NodeJS.ProcessEnv): Deliver {
  if (env.NODE_ENV !== "production" && env.MAIL_MODE === "local") {
    return async (email, purpose, token) => {
      if (!/\.(test|invalid|example)$/.test(email))
        throw new Error("Local mail accepts synthetic addresses only.");
      const directory = new URL("../../.tmp/mail/", import.meta.url);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(
        new URL(`${randomUUID()}.json`, directory),
        JSON.stringify({ email, purpose, token }),
        { flag: "wx", mode: 0o600 },
      );
    };
  }
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD || !env.MAIL_FROM)
    throw new Error("Email delivery configuration is required.");
  const port = Number(env.SMTP_PORT ?? "465");
  if (port !== 465 && port !== 587)
    throw new Error("SMTP must use TLS port 465 or STARTTLS port 587.");
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: true,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  const pending: (() => Promise<void>)[] = [];
  let active = 0;
  function pump() {
    while (active < 2 && pending.length) {
      const job = pending.shift()!;
      active++;
      void job()
        .catch(() =>
          console.error(
            "SMTP delivery failed; recipient and credential redacted. Request another code after delivery is restored.",
          ),
        )
        .finally(() => {
          active--;
          pump();
        });
    }
  }
  return async (email, purpose, token) => {
    if (pending.length >= 64)
      throw new Error("Email delivery capacity reached.");
    pending.push(async () => {
      await transporter.sendMail({
        from: env.MAIL_FROM,
        to: email,
        subject:
          purpose === "verify"
            ? "Verify your Spendwise email"
            : "Reset your Spendwise password",
        text: `Enter this ${purpose === "verify" ? "verification" : "recovery"} code in Spendwise within 30 minutes:\n\n${token}\n\nIf you did not request this, ignore this email.`,
      });
    });
    pump();
  };
}
