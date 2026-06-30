// Bundled by `pnpm build` (esbuild) into api/index.js — the single Vercel
// serverless function. `vercel.json` rewrites every `/api/*` path (any depth)
// to this function via a plain filename (no `[...path]` dynamic-route magic,
// which proved unreliable for multi-segment paths). Kept separate from app.ts
// so the bundle's default export is a ready-to-use request handler.
//
// Belt-and-suspenders: if Vercel ever hands us a path missing the leading
// `/api` segment, re-assert it before delegating (no-op when already present).
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
