// Builds the configured Express app (API + auth routes) WITHOUT any Vite/static
// wiring, so it can be imported by both the local server (index.ts) and the
// Vercel serverless function without pulling in the heavy `vite` dev dependency.
import express, { type Express } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerGoogleAuthRoutes } from "../googleAuth";
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
  registerOAuthRoutes(app); // legacy Manus callback (harmless; login now uses Google)
  registerGoogleAuthRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({ router: appRouter, createContext })
  );
  // Terminal JSON 404 for an unmatched API path. Echoes the path the app
  // actually received so a Vercel routing mismatch is debuggable from the
  // response body (instead of Express's default HTML "Cannot GET ..." page).
  //
  // Scoped to `/api`, and that scope is load-bearing. This used to catch
  // EVERYTHING, and because `index.ts` adds Vite (dev) or the static handler
  // (prod) AFTER calling createApp, this terminal handler sat in front of both:
  // `pnpm dev` — the first command in AGENTS.md's toolchain — answered
  // `{"error":"Not found"}` for `/`, `/app`, every route in the app. Only
  // Vercel was unaffected, because `vercelHandler` forces every request onto
  // `/api` before delegating, which is also why the whole scope below is a
  // no-op there and nothing changes for the deployed function.
  //
  // Deferring it instead of scoping it would not work: Vite and serveStatic
  // both end in their own `app.use("*")` SPA fallback, so an unmatched
  // `/api/...` would be answered with index.html — HTML for an API call.
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api")) return next();
    res.status(404).json({ error: "Not found", path: req.url, originalUrl: req.originalUrl });
  });
  return app;
}
