// Bundled by `pnpm build` (esbuild) into api/[...path].js — the Vercel
// serverless function entry. Kept separate from app.ts so the bundle's
// default export is a ready-to-use Express app instance.
import { createApp } from "./app";

const app = createApp();
export default app;
