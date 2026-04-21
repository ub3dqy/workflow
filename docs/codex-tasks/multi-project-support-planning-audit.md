# Multi-Project Support — Planning Audit

> **План**: `docs/codex-tasks/multi-project-support.md`

---

## 1. Files read

| # | File | Lines | What extracted |
|---|------|-------|----------------|
| F1 | `scripts/mailbox-lib.mjs` | 241-270 | readMessage: current fields extracted, no `project` |
| F2 | `scripts/mailbox-lib.mjs` | 342-382 | generateMessageFile: data object built without project |
| F3 | `scripts/mailbox.mjs` | 72-110 | formatTable headers, send options, usage text |
| F4 | `scripts/mailbox-status.mjs` | 142-211 | buildSummary + main: preview format, standalone parsing |
| F5 | `dashboard/server.js` | 38-53 | GET /api/messages: no query params |
| F6 | `dashboard/src/App.jsx` | 1-50 | translations object: no project keys |
| F7 | `dashboard/src/api.js` | 17-24 | fetchMessages: no query params |

---

## 2. Commands run

| # | Command | Key output | What it proved |
|---|---------|------------|----------------|
| C1 | `git log --oneline -8` | 8 commits, HEAD at 6a65e46 | Clean state |
| C2 | `git status --short` | only `?? .codex` | No dirty files |

---

## 3. Assumptions + verification

| # | Утверждение | Source | Status | Evidence |
|---|-------------|--------|--------|----------|
| A1 | readMessage не extract'ит project сейчас | `[EMPIRICAL]` | ✅ verified | F1: no `project` in return object |
| A2 | generateMessageFile не принимает project | `[EMPIRICAL]` | ✅ verified | F2: no project in signature |
| A3 | CLI не имеет --project flag | `[EMPIRICAL]` | ✅ verified | F3: usage text |
| A4 | Server не фильтрует по query params | `[EMPIRICAL]` | ✅ verified | F5 |
| A5 | Dashboard не зна��т о project | `[EMPIRICAL]` | ✅ verified | F6, F7 |
| A6 | mailbox-status.mjs standalone | `[EMPIRICAL]` | ✅ verified | F4: regex parsing, no gray-matter |
| A7 | Existing messages без project backward compatible | `[PROJECT]` | ✅ by design | Empty project = unscoped |

---

## 4. Baselines

| # | Measurement | Value |
|---|------------|-------|
| B1 | HEAD | 6a65e46 |
| B2 | mailbox-lib.mjs lines | 547 |
| B3 | mailbox.mjs lines | 299 |
| B4 | mailbox-status.mjs lines | 212 |
| B5 | server.js lines | 150 |
| B6 | App.jsx lines | 1266 |
| B7 | api.js lines | 56 |


## Legacy Workflow Note (2026-04-21)

This file is preserved as a historical artifact from an earlier workflow revision.

It may mention legacy patterns such as `Claude planner / Codex executor`, user relay, `compact prompt`, or older handoff shapes.

Do not use it as the live operating template. Current contract: `docs/codex-system-prompt.md`, `AGENTS.md`, `workflow-role-distribution.md`, `workflow-instructions-claude.md`, and `workflow-instructions-codex.md`.
