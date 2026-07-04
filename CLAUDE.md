@AGENTS.md

Local environment notes (not in AGENTS.md because they are machine/session-specific):

- Primary dev machine is Windows 11 (PowerShell); `.agent-check` needs the Bash tool
  or Git Bash. Also run from Claude Code on the web (ephemeral Linux container) —
  anything not committed is lost when the container is reclaimed.
- A PostToolUse hook runs `prettier --check` on edited files and only `--write`s
  files that are already clean — do not mass-reformat legacy files in feature PRs.
