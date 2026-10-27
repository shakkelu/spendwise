import type { Db } from "mongodb";
import { ApiError } from "./errors.js";
import { tokenHash } from "./sessions.js";

export async function rateLimit(
  db: Db,
  key: string,
  maximum: number,
  windowMs: number,
) {
  const window = Math.floor(Date.now() / windowMs);
  const counters = db.collection<{
    _id: string;
    count: number;
    expiresAt: Date;
  }>("limits");
  try {
    const count = await counters.findOneAndUpdate(
      { _id: tokenHash(`${windowMs}:${window}:${key}`) },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt: new Date((window + 2) * windowMs) },
      },
      { upsert: true, returnDocument: "after" },
    );
    if (!count || count.count > maximum)
      throw new ApiError(429, "Too many requests. Wait before trying again.");
  } catch (error) {
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      error.code === 11000
    )
      throw new ApiError(429, "Too many requests. Try again shortly.");
    throw error;
  }
}
