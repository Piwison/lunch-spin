// Bundled by `pnpm build` (esbuild) into api/[...path].js — the Vercel
// serverless function entry. Kept separate from app.ts so the bundle's
// default export is a ready-to-use request handler.
//
// Vercel routes only `/api/*` to this catch-all function, but the path it
// hands to the function can arrive WITHOUT the leading `/api` segment
// (observed in prod: `/auth/google/login` instead of `/api/auth/google/login`,
// which 404'd). Our Express routes are all mounted under `/api/...`, so we
// re-assert that prefix here before delegating. This is a no-op when the
// prefix is already present, so it's safe regardless of Vercel's behavior.
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "./app";

const app = createApp();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  const url = req.url ?? "/";
  if (!url.startsWith("/api")) {
    req.url = "/api" + (url.startsWith("/") ? url : "/" + url);
  }
  return (app as unknown as (r: IncomingMessage, s: ServerResponse) => void)(req, res);
}
