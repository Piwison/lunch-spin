// Vercel serverless entry. Vercel routes every `/api/*` request here and invokes
// the default-exported Express app as the handler. The app is built once per
// cold start; it never calls `listen` (that path is guarded by !VERCEL).
import { createApp } from "../server/_core/app";

const app = createApp();
export default app;
