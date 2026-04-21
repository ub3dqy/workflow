# Mailbox Phase 3 — Helper Scripts — Planning Audit

> **План**: `docs/codex-tasks/mailbox-helper-scripts.md`

---

## 1. Files read

| # | File | Lines | What extracted |
|---|------|-------|----------------|
| F1 | `local-claude-codex-mailbox-workflow.md` | 673-696 | Phase 3 spec: send/list/reply/archive, atomic seq, thread validator, cached lookup, performance on /mnt/e/ |
| F2 | `local-claude-codex-mailbox-workflow.md` | 384-391 | Thread continuity: reply inherits thread, validator checks against existing threads |
| F3 | `local-claude-codex-mailbox-workflow.md` | 430-443 | Archive policy + error recovery: mv not copy, immediate archive, recovery for partial completion |
| F4 | `dashboard/server.js` | 214-232 | nextSequenceForThreadFrom: full mailbox scan for seq allocation |
| F5 | `dashboard/server.js` | 295-326 | generateMessageFile: creates markdown with frontmatter via gray-matter.stringify |
| F6 | `dashboard/server.js` | 328-378 | archiveMessageFile: read→update frontmatter→mkdir→rename, with idempotency |
| F7 | `dashboard/server.js` | 91-151 | Validation functions: thread, reply target, relative inbox path |
| F8 | `scripts/mailbox-status.mjs` | 1-212 | Standalone hook: no gray-matter, regex parsing, stdin JSON |

---

## 2. Commands run

| # | Command | Key output | What it proved |
|---|---------|------------|----------------|
| C1 | `git log --oneline` | 6 commits, HEAD at 17272f8 | Clean state |
| C2 | `git status --short` | only `?? .codex` | No dirty tracked files |
| C3 | `node --version` | v24.13.0 | Node available, parseArgs() supported (18.3+) |

---

## 3. URLs fetched

| # | URL | Key finding | Used in plan |
|---|-----|-------------|-------------|
| — | Not fetched | Deferred to Codex (D1-D2) | — |

---

## 4. Wiki articles

| # | Article | What used |
|---|---------|-----------|
| W1 | `[[concepts/inter-agent-file-mailbox]]` | Confirmed protocol rules for archive, recovery, thread inheritance |

---

## 5. Assumptions + verification

| # | Утверждение | Source | Status | Evidence |
|---|-------------|--------|--------|----------|
| A1 | parseArgs() available in Node 24 | `[OFFICIAL]` | ✅ verified | Node 24 >> 18.3 requirement |
| A2 | gray-matter resolvable from root package.json | `[PROJECT]` | ⚠️ assumed | Codex will npm install in root and verify |
| A3 | server.js can import from ../scripts/ | `[PROJECT]` | ⚠️ assumed | ESM relative imports should work, Codex verifies |
| A4 | server.js inline functions = exact match of what lib needs | `[EMPIRICAL]` | ✅ verified | F4-F7: read all relevant functions |
| A5 | mailbox-status.mjs stays standalone | `[PROJECT]` | ✅ verified | Plan explicitly excludes it from changes |
| A6 | No Python runtime in project | `[EMPIRICAL]` | ✅ verified | No pyproject.toml, no venv |

---

## 6. Baselines captured

| # | Measurement | Command | Value |
|---|------------|---------|-------|
| B1 | HEAD | `git rev-parse --short HEAD` | 17272f8 |
| B2 | server.js lines | `wc -l dashboard/server.js` | 499 |
| B3 | scripts/ contents | `ls scripts/` | mailbox-status.mjs only |
| B4 | Root package.json | `cat package.json` | not found |


## Legacy Workflow Note (2026-04-21)

This file is preserved as a historical artifact from an earlier workflow revision.

It may mention legacy patterns such as `Claude planner / Codex executor`, user relay, `compact prompt`, or older handoff shapes.

Do not use it as the live operating template. Current contract: `docs/codex-system-prompt.md`, `AGENTS.md`, `workflow-role-distribution.md`, `workflow-instructions-claude.md`, and `workflow-instructions-codex.md`.
