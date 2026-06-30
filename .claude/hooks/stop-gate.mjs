#!/usr/bin/env node
// Stop gate: before the agent declares "done", run tsc + vitest. On failure,
// block the stop with the failing output so work can't be reported complete on
// red. Blocks at most once per turn (stop_hook_active guards the re-entry).
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

let data = {};
try {
  data = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  process.exit(0);
}

if (data?.stop_hook_active) process.exit(0); // already re-prompted; let it stop

const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function run(label, cmd) {
  try {
    execSync(cmd, { cwd, stdio: "pipe" });
    return null;
  } catch (e) {
    const out =
      (e.stdout?.toString() || "") + (e.stderr?.toString() || "");
    return `${label} failed:\n${out.slice(-1500)}`;
  }
}

const failure =
  run("pnpm check (tsc --noEmit)", "pnpm check") ||
  run("pnpm test (vitest run)", "pnpm test");

if (failure) {
  process.stdout.write(
    JSON.stringify({
      decision: "block",
      reason: `Stop blocked — verification did not pass; fix before declaring done.\n\n${failure}`,
    })
  );
}
process.exit(0);
