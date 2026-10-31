import argon2 from "argon2";
import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import { ApiError, text } from "./errors.js";
import type { Ledger } from "./finance.js";
import { issueSession, newToken, tokenHash } from "./sessions.js";
import { rateLimit } from "./limits.js";

export interface User {
  _id: string;
  email: string;
  passwordHash: string;
  verified: boolean;
  authVersion: number;
  ledger: Ledger | null;
  transferHash?: string;
  transferReceipt?: string;
  verifyHash?: string;
  verifyUntil?: Date;
  resetHash?: string;
  resetUntil?: Date;
}
export type Deliver = (
  email: string,
  purpose: "verify" | "reset",
  token: string,
) => Promise<void>;
type AuthUser = Omit<User, "ledger">;
const hashOptions = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;
let active = 0;
async function bounded<T>(operation: () => Promise<T>): Promise<T> {
  if (active >= 4)
    throw new ApiError(429, "Authentication is busy. Try again shortly.");
  active++;
  try {
    return await operation();
  } finally {
    active--;
  }
}
export function password(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length > 256 ||
    Array.from(value).length < 15 ||
    Array.from(value).length > 128 ||
    Array.from(value).some(
      (character) =>
        character.length === 1 &&
        character.charCodeAt(0) >= 0xd800 &&
        character.charCodeAt(0) <= 0xdfff,
    )
  )
    throw new ApiError(
      400,
      "Password must contain 15–128 characters; spaces are preserved.",
    );
  return value;
}
export function email(value: unknown) {
  const result = text(value, "email", 254).toLowerCase();
  if (
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(
      result,
    )
  )
    throw new ApiError(400, "Enter a valid email address.");
  return result;
}
export async function accounts(db: Db, deliver: Deliver) {
  const users = db.collection<User>("users");
  await users.createIndex({ email: 1 }, { unique: true });
  await users.createIndex({ verifyHash: 1 }, { unique: true, sparse: true });
  await users.createIndex({ resetHash: 1 }, { unique: true, sparse: true });
  await db
    .collection("sessions")
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db
    .collection("limits")
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  const dummy = await argon2.hash(newToken(), hashOptions);
  function notify(address: string, purpose: "verify" | "reset", token: string) {
    // Do not expose SMTP latency or failure through account-existence responses.
    void Promise.resolve()
      .then(() => deliver(address, purpose, token))
      .catch(() => {
        console.error(
          "Authentication email delivery failed; recipient and credential redacted. Request a new code after delivery is restored.",
        );
      });
  }
  async function send(user: AuthUser, purpose: "verify" | "reset") {
    const token = newToken();
    const until = new Date(Date.now() + 30 * 60 * 1000);
    await users.updateOne(
      { _id: user._id },
      {
        $set:
          purpose === "verify"
            ? { verifyHash: tokenHash(token), verifyUntil: until }
            : { resetHash: tokenHash(token), resetUntil: until },
      },
    );
    notify(user.email, purpose, token);
  }
  return {
    async register(address: unknown, secret: unknown, transferKey?: unknown) {
      if (
        transferKey !== undefined &&
        (typeof transferKey !== "string" || !/^[a-f0-9]{64}$/.test(transferKey))
      )
        throw new ApiError(400, "Invalid transfer key.");
      const mail = email(address),
        plain = password(secret);
      const passwordHash = await bounded(() => argon2.hash(plain, hashOptions));
      const user: User = {
        _id: randomUUID(),
        email: mail,
        passwordHash,
        verified: false,
        authVersion: 0,
        ledger: null,
        ...(typeof transferKey === "string"
          ? { transferHash: tokenHash(transferKey) }
          : {}),
      };
      const token = newToken();
      user.verifyHash = tokenHash(token);
      user.verifyUntil = new Date(Date.now() + 30 * 60 * 1000);
      try {
        await users.insertOne(user);
      } catch (error) {
        if (
          typeof error === "object" &&
          error &&
          "code" in error &&
          error.code === 11000
        ) {
          // An email owner registering again must not verify a password chosen
          // by somebody who previously registered their address.
          const updated = await users.updateOne(
            { email: mail, verified: false },
            {
              $set: {
                passwordHash,
                verifyHash: user.verifyHash,
                verifyUntil: user.verifyUntil,
                ...(user.transferHash
                  ? { transferHash: user.transferHash }
                  : {}),
              },
              $inc: { authVersion: 1 },
              $unset: {
                resetHash: "",
                resetUntil: "",
                ...(!user.transferHash ? { transferHash: "" as const } : {}),
              },
            },
          );
          if (updated.modifiedCount) notify(mail, "verify", token);
          return;
        }
        throw error;
      }
      notify(mail, "verify", token);
    },
    async request(address: unknown, purpose: "verify" | "reset") {
      const user = await users.findOne<AuthUser>(
        { email: email(address) },
        { projection: { ledger: 0 } },
      );
      if (user && (purpose === "reset" || !user.verified))
        await send(user, purpose);
    },
    async verify(value: unknown) {
      const token = text(value, "verification code", 64);
      if (!/^[a-f0-9]{64}$/.test(token))
        throw new ApiError(400, "Invalid or expired verification code.");
      const result = await users.updateOne(
        { verifyHash: tokenHash(token), verifyUntil: { $gt: new Date() } },
        {
          $set: { verified: true },
          $unset: { verifyHash: "", verifyUntil: "" },
        },
      );
      if (!result.modifiedCount)
        throw new ApiError(400, "Invalid or expired verification code.");
    },
    async reset(value: unknown, secret: unknown) {
      const token = text(value, "recovery code", 64),
        plain = password(secret);
      if (!/^[a-f0-9]{64}$/.test(token))
        throw new ApiError(400, "Invalid or expired recovery code.");
      const passwordHash = await bounded(() => argon2.hash(plain, hashOptions));
      const result = await users.updateOne(
        { resetHash: tokenHash(token), resetUntil: { $gt: new Date() } },
        {
          $set: { passwordHash },
          $inc: { authVersion: 1 },
          $unset: { resetHash: "", resetUntil: "" },
        },
      );
      if (!result.modifiedCount)
        throw new ApiError(400, "Invalid or expired recovery code.");
    },
    async login(address: unknown, secret: unknown) {
      const mail = email(address),
        plain = password(secret);
      const user = await users.findOne<AuthUser>(
        { email: mail },
        { projection: { ledger: 0 } },
      );
      const valid = await bounded(() =>
        argon2.verify(user?.passwordHash ?? dummy, plain),
      );
      if (!valid || !user?.verified)
        throw new ApiError(
          401,
          "Unable to sign in. Check credentials and email verification.",
        );
      return issueSession(db, user._id, user.authVersion);
    },
    async change(userId: string, current: unknown, next: unknown) {
      const old = password(current),
        plain = password(next);
      const user = await users.findOne<AuthUser>(
        { _id: userId },
        { projection: { ledger: 0 } },
      );
      if (
        !user ||
        !(await bounded(() => argon2.verify(user.passwordHash, old)))
      )
        throw new ApiError(
          400,
          "Unable to change password. Check your current password.",
        );
      const passwordHash = await bounded(() => argon2.hash(plain, hashOptions));
      const result = await users.updateOne(
        { _id: userId, authVersion: user.authVersion },
        {
          $set: { passwordHash },
          $inc: { authVersion: 1 },
          $unset: { resetHash: "", resetUntil: "" },
        },
      );
      if (!result.modifiedCount)
        throw new ApiError(409, "Account changed. Sign in again.");
    },
  };
}

export async function throttle(db: Db, source: string, address: unknown) {
  await rateLimit(db, `ip:${source}`, 30, 900000);
  if (typeof address === "string")
    await rateLimit(db, `email:${address.trim().toLowerCase()}`, 10, 900000);
}
