import express from "express";
import type { ErrorRequestHandler, Router } from "express";
import { ApiError } from "./errors.js";

export function createApp(routes?: Router, production = false) {
  const app = express();
  app.disable("x-powered-by");
  if (production) app.set("trust proxy", "loopback");
  app.use((req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    if (production && req.secure)
      res.set("Strict-Transport-Security", "max-age=31536000");
    next();
  });

  app.get("/health", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  app.use((req, _res, next) => {
    if (production && !req.secure)
      return next(new ApiError(400, "HTTPS is required."));
    next();
  });
  app.use(express.json({ limit: "16kb", strict: true }));
  if (routes) app.use(routes);

  app.use((_request, response) => {
    response.status(404).json({ error: "Not found" });
  });

  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof ApiError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof SyntaxError) {
      res.status(400).json({ error: "Invalid JSON." });
      return;
    }
    if (
      typeof error === "object" &&
      error &&
      "type" in error &&
      error.type === "entity.too.large"
    ) {
      res.status(413).json({ error: "Request is too large." });
      return;
    }
    console.error("Request failed; internal details redacted.");
    res
      .status(503)
      .json({ error: "Service temporarily unavailable. Try again later." });
  };
  app.use(errors);

  return app;
}
