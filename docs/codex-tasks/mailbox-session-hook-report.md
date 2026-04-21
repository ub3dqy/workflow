# Mailbox SessionStart Hook — Execution Report

> **План**: `docs/codex-tasks/mailbox-session-hook.md`
>
> **Статус**: `[ ] not started` / `[ ] in progress` / `[x] done`

---

## 0. Pre-flight

### 0.1 Environment snapshot

| Item | Value |
|------|-------|
| OS | `Linux 6.6.87.2-microsoft-standard-WSL2 x86_64 GNU/Linux` |
| Node | `v24.14.1` |
| git | `2.43.0` |
| Working dir | `/mnt/e/project/workflow` |
| git status | `?? .claude/`, `?? scripts/`, plus untracked planning/report docs |
| HEAD | `67c5e80904f382ef148559ac5f72e7bba5852be7` |

### 0.2 Baseline snapshots

| Item | Command | Value |
|------|---------|-------|
| scripts/ exists | `ls scripts/ 2>&1` | `ls: cannot access 'scripts': No such file or directory` |
| .claude/ exists | `ls .claude/ 2>&1` | `ls: cannot access '.claude': No such file or directory` |
| Global settings untouched | `sha256sum ~/.claude/settings.json` | `ca3d163bab055381827226140568f3bef7eaac187cebd76878e0b63e9e442356` |
| Pending messages | `find agent-mailbox -name "*.md" \| wc -l` | `0` |

---

## 0.6 Doc verification

| # | URL | Key quote | Matches plan? |
|---|-----|-----------|---------------|
| D1 | https://docs.anthropic.com/en/docs/claude-code/hooks | "For command hooks, input arrives on stdin" and common input includes `cwd`; for `SessionStart`, stdout can return `hookSpecificOutput.additionalContext` | ✅ |
| D2 | https://docs.anthropic.com/en/docs/claude-code/hooks#hook-configuration | Hook locations include `.claude/settings.local.json`; command hook fields include `command`, and `timeout` is in seconds with default `600` for command hooks | ✅ |

Reference implementation aligned with existing hook output:

- Existing `memory-claude` SessionStart hook prints JSON as:
  - `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"..."}}`
- Existing `settings.example.json` uses:
  - `hooks -> SessionStart -> [{ matcher, hooks: [{ type, command, timeout }] }]`

---

## 1. Changes

### 1.1 scripts/mailbox-status.mjs (Change 1)

- Created: ✅
- Reads stdin JSON: ✅
- Uses `cwd` for mailbox path: ✅
- Silent on empty mailbox: ✅
- Shows count + preview: ✅
- No npm dependencies: ✅
- Handles CRLF + LF: ✅

Implementation details:

- Built-ins only:
  - `node:fs/promises`
  - `node:path`
- Frontmatter parsing uses regex:
  - `^---\\r?\\n([\\s\\S]*?)\\r?\\n---\\r?\\n?`
- Body preview uses the first non-empty body line
- Output format is JSON with:
  - `hookSpecificOutput.hookEventName = "SessionStart"`
  - `hookSpecificOutput.additionalContext = "...summary..."`
- On all errors:
  - writes a short message to stderr
  - exits `0`
  - produces no stdout on failure paths

### 1.2 .claude/settings.local.json (Change 2)

- Created: ✅
- SessionStart hook only: ✅
- Timeout = 3s: ✅
- Global settings.json NOT modified: ✅

Configuration details:

- Location: project-local `.claude/settings.local.json`
- Event: `SessionStart`
- Matcher: `""` (match all SessionStart sources)
- Hook type: `command`
- Command:
  - `node "$CLAUDE_PROJECT_DIR/scripts/mailbox-status.mjs"`

---

## 2. Phase 1 smokes

| # | Test | Command | Output | Exit code | ✅/❌ |
|---|------|---------|--------|-----------|-------|
| V1 | empty mailbox | `printf '{"cwd":"/mnt/e/project/workflow"}' \| node scripts/mailbox-status.mjs` | empty stdout | `0` | ✅ |
| V2 | with message | create one test message in `agent-mailbox/to-codex/`, then `printf '{"cwd":"/mnt/e/project/workflow"}' \| node scripts/mailbox-status.mjs` | JSON with `Pending for Codex: 1` | `0` | ✅ |
| V3 | preview shows | same as V2 | JSON contains `hook-test`, `from claude`, and `Mailbox hook preview line` | `0` | ✅ |
| V4 | missing mailbox dir | `printf '{"cwd":"/tmp"}' \| node scripts/mailbox-status.mjs` | empty stdout | `0` | ✅ |
| V5 | invalid stdin | `printf 'garbage' \| node scripts/mailbox-status.mjs` with test message present in current project | falls back to `process.cwd()` and still returns valid summary JSON | `0` | ✅ |
| V6 | valid JSON settings | `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.local.json','utf8')); console.log('ok')"` | `ok` | `0` | ✅ |
| V7 | personal data | `grep -riE '<personal-data-patterns>' scripts/ .claude/ --include="*.mjs" --include="*.json" -l` | no output | `1` | ✅ |
| V8 | absolute paths | `grep -rE '/mnt/e\|E:\\\\\|C:\\\\Users\|/home/' scripts/ --include="*.mjs" -l` | no output | `1` | ✅ |

Additional checks:

- Windows-style `cwd` fallback under WSL:
  - `printf '{"cwd":"E:\\Project\\workflow"}' | node scripts/mailbox-status.mjs`
  - returned the same valid SessionStart summary JSON ✅
- Global settings checksum after work:
  - `ca3d163bab055381827226140568f3bef7eaac187cebd76878e0b63e9e442356`
  - unchanged from baseline ✅
- Imports audit:
  - only `node:fs/promises` and `node:path` ✅

---

## Phase 2 — `[awaits user]`

| # | Test | Result |
|---|------|--------|
| V9 | Live hook test | `[awaits user]` |
| V10 | Silent when empty | `[awaits user]` |

---

## Tools used

| Tool | Used for | ✅/BLOCKED |
|------|----------|------------|
| node | syntax check, hook execution, JSON parse, test message creation | ✅ |
| webfetch | doc verification for Claude Code hooks docs | ✅ |
| grep | personal-data scan and absolute-path scan | ✅ |

---

## Out-of-scope temptations

| What | Why skipped |
|------|-------------|
| Add `UserPromptSubmit` hook | Explicitly forbidden by spec and task rules |
| Reuse `gray-matter` from dashboard | Hook must be standalone and dependency-free |
| Modify global `~/.claude/settings.json` | Task explicitly requires project-local `.claude/settings.local.json` only |
| Add archive statistics or thread grouping | Not part of SessionStart pending summary MVP |

---

## Discrepancies

| # | Plan says | Reality | Severity | Action taken |
|---|-----------|---------|----------|-------------|
| none | — | No material discrepancies found after doc verification | — | — |

---

## Self-audit checklist

| # | Check | ✅/❌ |
|---|-------|-------|
| 1 | `scripts/mailbox-status.mjs` created | ✅ |
| 2 | No npm dependencies in hook script | ✅ |
| 3 | Reads stdin JSON for `cwd` | ✅ |
| 4 | Silent on empty mailbox | ✅ |
| 5 | Shows count + preview (max 2) | ✅ |
| 6 | Handles missing `agent-mailbox/` dir | ✅ |
| 7 | Handles invalid stdin gracefully | ✅ |
| 8 | `.claude/settings.local.json` created | ✅ |
| 9 | SessionStart only, no UserPromptSubmit | ✅ |
| 10 | Timeout = 3 seconds | ✅ |
| 11 | Global settings.json NOT modified | ✅ |
| 12 | No personal data | ✅ |
| 13 | No absolute paths | ✅ |
| 14 | Exit code always 0 | ✅ |
| 15 | Test messages cleaned up | ✅ |


## Legacy Workflow Note (2026-04-21)

This file is preserved as a historical artifact from an earlier workflow revision.

It may mention legacy patterns such as `Claude planner / Codex executor`, user relay, `compact prompt`, or older handoff shapes.

Do not use it as the live operating template. Current contract: `docs/codex-system-prompt.md`, `AGENTS.md`, `workflow-role-distribution.md`, `workflow-instructions-claude.md`, and `workflow-instructions-codex.md`.
