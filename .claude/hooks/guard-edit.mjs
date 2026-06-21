#!/usr/bin/env node
// PreToolUse guard: deny edits to do-not-touch surfaces (secrets + auth contract).
// Mirrors the "Do-not-touch surfaces" section of CLAUDE.md.
import { readFileSync } from "node:fs";

let data = {};
try {
  data = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  process.exit(0); // can't parse input → don't block
}

const fp = data?.tool_input?.file_path || "";
if (!fp) process.exit(0);

const blocked = [
  {
    re: /(^|\/)\.env(\.local|\.production|\.development)?$/,
    why: ".env files hold secrets — edit them outside the agent.",
  },
  {
    re: /(^|\/)server\/_core\//,
    why: "server/_core/* is a do-not-touch surface (auth/session contract).",
  },
  {
    re: /(^|\/)shared\/const\.ts$/,
    why: "shared/const.ts holds contract constants — do-not-touch.",
  },
];

for (const b of blocked) {
  if (b.re.test(fp)) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: `Blocked by guard-edit hook: ${b.why} If this is intentional, disable the PreToolUse hook in .claude/settings.json first.`,
        },
      })
    );
    process.exit(0);
  }
}
process.exit(0);
