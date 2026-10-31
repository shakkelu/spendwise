import { createHash } from "node:crypto";
import { Router, json } from "express";
import type { Db } from "mongodb";
import { accounts, throttle, type Deliver, type User } from "./accounts.js";
import { ApiError, object } from "./errors.js";
import {
  createLedger,
  mutateLedger,
  overview,
  today,
  validateLedger,
} from "./finance.js";
import { requireSession, tokenHash, type Session } from "./sessions.js";
import { rateLimit } from "./limits.js";

export async function product(db: Db, deliver: Deliver, rateScope = "") {
  const auth = await accounts(db, deliver);
  const router = Router();
  const generic = {
    message:
      "If the account is eligible, an email has been sent. Check your inbox.",
  };
  router.use("/auth", async (req, _res, next) => {
    if (req.path === "/logout") {
      next();
      return;
    }
    await throttle(
      db,
      rateScope + (req.ip ?? "unknown"),
      object(req.body ?? {}).email,
    );
    next();
  });
  router.post("/auth/register", async (req, res) => {
    const b = object(req.body);
    await auth.register(b.email, b.password, b.transferKey);
    res.status(202).json(generic);
  });
  router.post("/auth/request-verification", async (req, res) => {
    await auth.request(object(req.body).email, "verify");
    res.status(202).json(generic);
  });
  router.post("/auth/recover", async (req, res) => {
    await auth.request(object(req.body).email, "reset");
    res.status(202).json(generic);
  });
  router.post("/auth/verify", async (req, res) => {
    await auth.verify(object(req.body).token);
    res.json({ message: "Email verified. You can sign in." });
  });
  router.post("/auth/reset", async (req, res) => {
    const b = object(req.body);
    await auth.reset(b.token, b.password);
    res.json({ message: "Password reset. Sign in again on each device." });
  });
  router.post("/auth/login", async (req, res) => {
    const b = object(req.body);
    const token = await auth.login(b.email, b.password);
    res.json({ token });
  });
  router.use(async (req, res, next) => {
    res.locals.session = await requireSession(db, req.headers.authorization);
    if (req.path !== "/auth/logout")
      await rateLimit(
        db,
        `user:${(res.locals.session as Session).userId}`,
        120,
        60000,
      );
    next();
  });
  const users = db.collection<User>("users");
  router.post("/auth/logout", async (_req, res) => {
    const session = res.locals.session as Session;
    await db.collection<Session>("sessions").deleteOne({ _id: session._id });
    res.status(204).end();
  });
  router.post("/auth/password", async (req, res) => {
    const b = object(req.body);
    await auth.change(
      (res.locals.session as Session).userId,
      b.currentPassword,
      b.password,
    );
    res.json({ message: "Password changed. Sign in again." });
  });
  router.get("/account", async (req, res) => {
    if (req.query.month !== undefined && typeof req.query.month !== "string")
      throw new ApiError(400, "Invalid month.");
    const session = res.locals.session as Session;
    const user = await users.findOne({
      _id: session.userId,
      authVersion: session.authVersion,
      verified: true,
    });
    if (!user) throw new ApiError(401, "Sign in required.");
    const month =
      typeof req.query.month === "string"
        ? req.query.month
        : user.ledger
          ? today(user.ledger.timezone).slice(0, 7)
          : "";
    res.json({
      email: user.email,
      ledger: user.ledger,
      overview: user.ledger ? overview(user.ledger, month) : null,
    });
  });
  router.post("/account", async (req, res) => {
    const ledger = createLedger(req.body);
    const session = res.locals.session as Session;
    const result = await users.updateOne(
      {
        _id: session.userId,
        authVersion: session.authVersion,
        verified: true,
        ledger: null,
      },
      { $set: { ledger } },
    );
    if (!result.modifiedCount)
      throw new ApiError(
        409,
        "Account already configured. Refresh to continue.",
      );
    res.status(201).json({ ledger });
  });
  router.post(
    "/account/import",
    json({ limit: "8mb", strict: true }),
    async (req, res) => {
      const b = object(req.body);
      if (typeof b.key !== "string" || !/^[a-f0-9]{64}$/.test(b.key))
        throw new ApiError(400, "Invalid transfer key.");
      const ledger = validateLedger(b.ledger);
      const receipt = createHash("sha256")
        .update(JSON.stringify(ledger))
        .digest("hex");
      const session = res.locals.session as Session;
      const owner = {
        _id: session.userId,
        authVersion: session.authVersion,
        verified: true,
      };
      const user = await users.findOne(owner);
      if (!user || user.transferHash !== tokenHash(b.key))
        throw new ApiError(
          409,
          "Local transfer is only available for the new account created on this device. Local records have been kept.",
        );
      if (user.transferReceipt === receipt) {
        res.json({ imported: true });
        return;
      }
      if (user.ledger || user.transferReceipt)
        throw new ApiError(
          409,
          "Cloud account already contains records. Local records have been kept.",
        );
      const updated = await users.updateOne(
        {
          ...owner,
          transferHash: tokenHash(b.key),
          ledger: null,
          transferReceipt: { $exists: false },
        },
        { $set: { ledger, transferReceipt: receipt } },
      );
      if (!updated.modifiedCount) {
        const retry = await users.findOne({
          ...owner,
          transferHash: tokenHash(b.key),
          transferReceipt: receipt,
        });
        if (!retry)
          throw new ApiError(
            409,
            "Account changed. Local records have been kept; retry after signing in.",
          );
      }
      res.json({ imported: true });
    },
  );
  router.post("/account/operations", async (req, res) => {
    const session = res.locals.session as Session;
    const id = session.userId;
    const b = object(req.body);
    if (!Number.isSafeInteger(b.version) || Number(b.version) < 0)
      throw new ApiError(400, "Account version is required.");
    const user = await users.findOne({
      _id: id,
      authVersion: session.authVersion,
      verified: true,
    });
    if (!user?.ledger)
      throw new ApiError(409, "Set up your opening balance first.");
    if (user.ledger.version !== b.version)
      throw new ApiError(
        409,
        "Account changed. Refresh before retrying; your change was not applied.",
      );
    const ledger = mutateLedger(user.ledger, b);
    const result = await users.updateOne(
      {
        _id: id,
        authVersion: session.authVersion,
        verified: true,
        "ledger.version": b.version,
      },
      { $set: { ledger } },
    );
    if (!result.modifiedCount)
      throw new ApiError(
        409,
        "Account changed. Refresh before retrying; your change was not applied.",
      );
    res.json({ ledger });
  });
  return router;
}
