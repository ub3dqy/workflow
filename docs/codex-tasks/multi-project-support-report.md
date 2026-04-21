# Multi-Project Support — Execution Report

> **План**: `docs/codex-tasks/multi-project-support.md`
>
> **Статус**: `[x] done`

---

## 0. Pre-flight

### 0.1 Environment snapshot

| Item | Value |
|------|-------|
| OS | `Linux WSL2 x86_64` |
| Node | `v24.14.1` |
| Working dir | `workflow repo root` |
| git status | `M dashboard/server.js; M dashboard/src/App.jsx; M dashboard/src/api.js; M scripts/mailbox-lib.mjs; M scripts/mailbox-status.mjs; M scripts/mailbox.mjs; ?? docs/codex-tasks/multi-project-support.md; ?? docs/codex-tasks/multi-project-support-report.md; unrelated pre-existing untracked: .codex, docs/codex-tasks/multi-project-support-planning-audit.md` |
| HEAD | `6a65e46745850951e224515dfd40697be8278ec7` |

### 0.2 Baseline snapshots

| Item | Command | Value |
|------|---------|-------|
| mailbox-lib.mjs lines | `wc -l scripts/mailbox-lib.mjs` | `588` |
| mailbox.mjs lines | `wc -l scripts/mailbox.mjs` | `321` |
| mailbox-status.mjs lines | `wc -l scripts/mailbox-status.mjs` | `216` |
| server.js lines | `wc -l dashboard/server.js` | `168` |
| App.jsx lines | `wc -l dashboard/src/App.jsx` | `1349` |
| api.js lines | `wc -l dashboard/src/api.js` | `64` |
| vite build | `cd dashboard && npm exec vite build` | `pass` |

---

## 0.6 Doc verification

| # | URL | Key quote | Matches plan? |
|---|-----|-----------|---------------|
| D1 | https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams | `The URLSearchParams interface defines utility methods to work with the query string of a URL.` | ✅ |

---

## 1. Changes

### 1.1 mailbox-lib.mjs (Change 1)

- project field in readMessage: ✅
- project param in generateMessageFile: ✅
- shared helpers for project filtering/collection added: ✅

### 1.2 mailbox.mjs (Change 2)

- send --project: ✅
- list --project filter: ✅
- project column in table: ✅
- reply inherits project: ✅

### 1.3 mailbox-status.mjs (Change 3)

- project in preview: ✅
- still standalone (no gray-matter): ✅

### 1.4 server.js (Change 4)

- `?project=` query filter: ✅
- `GET /api/messages` returns top-level `projects` list for dynamic UI filter: ✅
- `POST /api/reply` accepts project: ✅

### 1.5 api.js (Change 5)

- fetchMessages with project param: ✅

### 1.6 App.jsx (Change 6)

- Project filter dropdown: ✅
- Dynamic project list: ✅
- Project badge on cards: ✅
- localStorage persistence: ✅
- i18n keys added: ✅

---

## 2. Phase 1 smokes

| # | Test | Result | ✅/❌ |
|---|------|--------|-------|
| V1 | send with --project | `node scripts/mailbox.mjs send --from claude --to codex --thread mp-messenger --project messenger --body "Messenger scoped test" --json` created `to-codex/...mp-messenger...` with `project: messenger` | ✅ |
| V2 | send without --project | `node scripts/mailbox.mjs send --from codex --to claude --thread mp-unscoped --body "Unscoped test" --json` created file without `project` field | ✅ |
| V3 | list --project filter | `node scripts/mailbox.mjs list --project messenger` returned only the `mp-messenger` row | ✅ |
| V4 | list all | `node scripts/mailbox.mjs list` returned unscoped + messenger + pulse rows | ✅ |
| V5 | reply inherits project | `node scripts/mailbox.mjs reply --to to-codex/...mp-messenger... --body "User reply for messenger" --json` created reply with `project: messenger` and archived original | ✅ |
| V6 | API ?project= | `curl http://127.0.0.1:3001/api/messages?project=messenger` returned only messenger entries plus `projects:["messenger","pulse"]` | ✅ |
| V7 | API no filter | `curl http://127.0.0.1:3001/api/messages` returned unscoped + messenger + pulse messages | ✅ |
| V8 | Dashboard filter | Playwright saw dropdown `Все проекты/messenger/pulse`; selecting `pulse` reduced visible total to `1` and hid unscoped/messenger cards | ✅ |
| V9 | Project badge | Playwright snapshot showed badge `Проект: pulse`; unfiltered view also showed `Проект: messenger` in archive | ✅ |
| V10 | Hook preview | Hook stdin `cwd` pointed to repo root and summary included `(Claude inbox, messenger)` | ✅ |
| V11 | Backward compat | Unscoped message worked in CLI/API/hook without filter and was excluded when explicit project filter was applied | ✅ |
| V12 | vite build | `cd dashboard && npm exec vite build` passed | ✅ |
| V13 | personal data | Personal-data grep scan returned no matches in whitelist files/report | ✅ |
| V14 | absolute paths | Absolute-path grep scan returned no matches in whitelist files/report | ✅ |

---

## Phase 2 — `[awaits user]`

| # | Test | Result |
|---|------|--------|
| V15 | Real multi-project | `[awaits user]` |

---

## Tools used

| Tool | Used for | ✅/BLOCKED |
|------|----------|------------|
| node | CLI, server, hook, syntax checks, build | ✅ |
| curl | API smokes, localhost availability checks | ✅ |
| grep | personal-data / absolute-path scans | ✅ |

---

## Discrepancies

| # | Plan says | Reality | Severity | Action taken |
|---|-----------|---------|----------|-------------|
| 1 | Dashboard builds dynamic project list from `/api/messages`, while the same endpoint is filtered by `?project=` | A filtered response alone cannot expose the full project list | Medium | `GET /api/messages` now always returns top-level `projects` derived from unfiltered buckets alongside filtered `toClaude/toCodex/archive` arrays |
| 2 | Plan preserves existing `seq = thread + from` behavior | Parallel test sends from the same sender across different threads within the same second produced duplicate ids like `...-claude-001` | Low | No code change; documented as an out-of-scope protocol risk because this task explicitly kept existing seq/id semantics |

---

## Self-audit checklist

| # | Check | ✅/❌ |
|---|-------|-------|
| 1 | project field in readMessage | ✅ |
| 2 | generateMessageFile accepts project | ✅ |
| 3 | send --project creates correct frontmatter | ✅ |
| 4 | list --project filters | ✅ |
| 5 | reply inherits project from target | ✅ |
| 6 | API ?project= filters | ✅ |
| 7 | Dashboard project dropdown | ✅ |
| 8 | Dynamic project list from messages | ✅ |
| 9 | Project badge on cards | ✅ |
| 10 | Hook shows project in preview | ✅ |
| 11 | Backward compat: no-project messages work | ✅ |
| 12 | i18n keys for project UI | ✅ |
| 13 | vite build | ✅ |
| 14 | No personal data | ✅ |
| 15 | No absolute paths | ✅ |
| 16 | mailbox-status.mjs still standalone | ✅ |


## Legacy Workflow Note (2026-04-21)

This file is preserved as a historical artifact from an earlier workflow revision.

It may mention legacy patterns such as `Claude planner / Codex executor`, user relay, `compact prompt`, or older handoff shapes.

Do not use it as the live operating template. Current contract: `docs/codex-system-prompt.md`, `AGENTS.md`, `workflow-role-distribution.md`, `workflow-instructions-claude.md`, and `workflow-instructions-codex.md`.
