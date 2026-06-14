#!/bin/bash
# SessionStart hook: install dependencies so `pnpm check` / `pnpm test` /
# `pnpm build` work in Claude Code on the web. Synchronous (blocks session
# start) so the agent never races ahead of a half-installed node_modules.
set -euo pipefail

# Only needed in the remote (web) environment; local sessions already have deps.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# The repo pins pnpm via package.json "packageManager"; make sure it's on PATH.
if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || true
  corepack prepare pnpm@10.4.1 --activate >/dev/null 2>&1 || true
fi

# Lockfile-respecting, idempotent, and uses the warm store cache on resume.
# --config.confirm-modules-purge=false keeps it non-interactive if pnpm decides
# an existing node_modules needs to be re-linked.
pnpm install --prefer-offline --config.confirm-modules-purge=false
