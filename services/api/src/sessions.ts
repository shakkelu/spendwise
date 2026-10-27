import { createHash, randomBytes } from "node:crypto";
import type { Db } from "mongodb";
import { ApiError } from "./errors.js";

export const IDLE_MS = 24 * 60 * 60 * 1000;
export const ABSOLUTE_MS = 7 * IDLE_MS;
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("hex");

export interface Session {
  _id: string;
  userId: string;
  authVersion: number;
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
}

export async function issueSession(
  db: Db,
  userId: string,
  authVersion: number,
  now = new Date(),
) {
  const token = newToken();
  await db.collection<Session>("sessions").insertOne({
    _id: tokenHash(token),
    userId,
    authVersion,
    createdAt: now,
    lastActivity: now,
    expiresAt: new Date(now.getTime() + ABSOLUTE_MS),
  });
  return token;
}

export async function requireSession(
  db: Db,
  header: string | undefined,
  now = new Date(),
) {
  if (!header || !/^Bearer [a-f0-9]{64}$/.test(header))
    throw new ApiError(401, "Sign in required.");
  const session = await db.collection<Session>("sessions").findOneAndUpdate(
    {
      _id: tokenHash(header.slice(7)),
      expiresAt: { $gt: now },
      lastActivity: { $gt: new Date(now.getTime() - IDLE_MS) },
    },
    { $max: { lastActivity: now } },
    { returnDocument: "after" },
  );
  if (!session) throw new ApiError(401, "Sign in required.");
  const user = await db
    .collection<{ _id: string; authVersion: number; verified: boolean }>(
      "users",
    )
    .findOne(
      {
        _id: session.userId,
        authVersion: session.authVersion,
        verified: true,
      },
      { projection: { _id: 1, authVersion: 1, verified: 1 } },
    );
  if (!user) throw new ApiError(401, "Sign in required.");
  return session;
}
