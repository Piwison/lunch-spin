#!/usr/bin/env node
// PostToolUse: format + autofix just the edited TS/TSX file. Fast, never fails
// the turn. eslint is skipped until it's installed (Workstream 3), so this is
// safe to land first.
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

let data = {};
try {
  data = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  process.exit(0);
}

const fp = data?.tool_input?.file_path || "";
if (!/\.(ts|tsx)$/.test(fp)) process.exit(0);
if (!/(^|\/)(client|server|shared)\//.test(fp)) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const bin = (name) => {
  const p = `${root}/node_modules/.bin/${name}`;
  return existsSync(p) ? p : null;
};

const quiet = { stdio: "ignore" };
const prettier = bin("prettier");
if (prettier) {
  try {
    execFileSync(prettier, ["--write", fp], quiet);
  } catch {
    /* formatting is best-effort */
  }
}
const eslint = bin("eslint");
if (eslint) {
  try {
    execFileSync(eslint, ["--fix", fp], quiet);
  } catch {
    /* autofix is best-effort */
  }
}
process.exit(0);
