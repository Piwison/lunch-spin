// Builds the configured Express app (API + auth routes) WITHOUT any Vite/static
// wiring, so it can be imported by both the local server (index.ts) and the
// Vercel serverless function without pulling in the heavy `vite` dev dependency.
import express, { type Express } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerGoogleAuthRoutes } from "../googleAuth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";

export function createApp(): Express {
  const app = express();
  // Larger body limit for bulk imports / uploads.
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Liveness probe (no DB). Both paths so it works locally (/healthz) and on
  // Vercel, where the function only receives /api/* (/api/healthz).
  app.get(["/healthz", "/api/healthz"], (_req, res) => res.status(200).json({ ok: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app); // legacy Manus callback (harmless; login now uses Google)
  registerGoogleAuthRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({ router: appRouter, createContext })
  );
  // Terminal JSON 404 for any unmatched API path (avoids HTML error bodies).
  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));
  return app;
}
