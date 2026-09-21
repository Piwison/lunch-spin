@AGENTS.md

Local environment notes (not in AGENTS.md because they are machine/session-specific):

- Primary dev machine is Windows 11 (PowerShell); `.agent-check` needs the Bash tool
  or Git Bash. Also run from Claude Code on the web (ephemeral Linux container) —
  anything not committed is lost when the container is reclaimed.
- A PostToolUse hook runs `prettier --check` on edited files and only `--write`s
  files that are already clean — do not mass-reformat legacy files in feature PRs.
- AGENTS.md is stored base64-encoded, as ONE line. The import above therefore hands
  you the encoded blob, not the document: `base64 -d AGENTS.md` to read it, and to
  edit it, decode, change the text, re-encode with `base64 -w 0` and keep the single
  trailing newline. Appending plain text to the end would corrupt the whole file.
