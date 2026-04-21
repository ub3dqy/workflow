# Dashboard Phase 2 — Safe Actions — Planning Audit

> **План**: `docs/codex-tasks/dashboard-phase2-safe-actions.md`

---

## 1. Files read

| # | File | Lines | What extracted |
|---|------|-------|----------------|
| F1 | `local-claude-codex-mailbox-workflow.md` | 206-216 | UI safe actions: reply, archive, open related file — must translate to same file ops |
| F2 | `local-claude-codex-mailbox-workflow.md` | 255-293 | Message format: frontmatter fields, optional fields (reply_to, answer_message_id, archived_at, resolution) |
| F3 | `local-claude-codex-mailbox-workflow.md` | 295-316 | Timestamp rule: UTC, ISO Z suffix, writer-side |
| F4 | `local-claude-codex-mailbox-workflow.md` | 318-350 | Filename convention: `<timestamp>-<thread>-<from>-<seq>.md`, seq local to thread+from |
| F5 | `local-claude-codex-mailbox-workflow.md` | 384-391 | Thread slug validation: reply inherits thread from original message |
| F6 | `local-claude-codex-mailbox-workflow.md` | 393-409 | Lifecycle: pending → answered → archived, addressee owns message |
| F7 | `local-claude-codex-mailbox-workflow.md` | 411-428 | Anti-pattern: no in-place edits except frontmatter on archive |
| F8 | `local-claude-codex-mailbox-workflow.md` | 430-443 | Archive policy: mv not copy, immediate after reply, addressee archives |
| F9 | `local-claude-codex-mailbox-workflow.md` | 656-669 | Phase 2 protocol: SessionStart hook only (separate from UI Phase 2) |
| F10 | `dashboard/server.js` | 1-171 | Current server: 2 GET endpoints, readMessage/readBucket/collectMarkdownFiles, no POST, no express.json() |
| F11 | `dashboard/src/App.jsx` | 1-568 | Current UI: MessageCard component, 3-column grid, polling, empty state, no action buttons |
| F12 | `dashboard/src/api.js` | 1-12 | Current API: only fetchMessages() |
| F13 | `dashboard/package.json` | 1-23 | Current deps: express, gray-matter, marked, react, react-dom, vite, plugin-react, concurrently |
| F14 | `dashboard/vite.config.js` | 1-15 | Port 9119, proxy /api → 3001 |

---

## 2. Commands run

| # | Command | Key output | What it proved |
|---|---------|------------|----------------|
| C1 | `git log --oneline` | 4 commits, HEAD at 67c5e80 | Clean state, no uncommitted changes |
| C2 | `git status --short` | `?? .codex` only | No dirty files to worry about |

---

## 3. URLs fetched

| # | URL | Key finding | Used in plan |
|---|-----|-------------|-------------|
| — | Not fetched during planning | Deferred to Codex doc verification (D1-D3) | — |

---

## 4. Wiki articles

| # | Article | What used |
|---|---------|-----------|
| W1 | `[[concepts/inter-agent-file-mailbox]]` | Confirmed: three dirs, gitignored, file-per-message, archive by addressee |

---

## 5. Assumptions + verification

| # | Утверждение в плане | Source marker | Status | Evidence |
|---|---------------------|--------------|--------|----------|
| A1 | express.json() доступен в Express 5 без доп. пакетов | `[OFFICIAL]` | ⚠️ assumed | Express 5 built-in, но не проверено fetch'ем. Codex верифицирует D1. |
| A2 | matter.stringify(content, data) генерирует валидный frontmatter | `[OFFICIAL]` | ⚠️ assumed | gray-matter docs. Codex верифицирует D2. |
| A3 | Новых npm dependencies не нужно | `[EMPIRICAL]` | ✅ verified | F13: express уже есть, gray-matter уже есть |
| A4 | server.js: после строки 31 нет middleware | `[EMPIRICAL]` | ✅ verified | F10: строка 31 = next(), следующая строка 33 = normalizePath |
| A5 | App.jsx: MessageCard не имеет action buttons | `[EMPIRICAL]` | ✅ verified | F11: карточка рендерит только данные, нет onClick handlers |
| A6 | api.js: только fetchMessages() | `[EMPIRICAL]` | ✅ verified | F12: 12 строк, один export |
| A7 | Archive: mv не copy | `[PROJECT]` | ✅ verified | F8: spec line 434 |
| A8 | Reply + archive = одна логическая операция | `[PROJECT]` | ✅ verified | F8: spec line 440 |
| A9 | from = "user" для UI replies | `[PROJECT]` | ✅ verified | Spec не определяет явно, но user через UI ≠ agent. Design decision в этом плане. |
| A10 | Path traversal protection нужна | `[PROJECT]` | ✅ verified | Server принимает relativePath от клиента — нужна валидация |

---

## 6. Baselines captured

| # | Measurement | Command | Value |
|---|------------|---------|-------|
| B1 | server.js lines | `wc -l dashboard/server.js` | 171 |
| B2 | App.jsx lines | `wc -l dashboard/src/App.jsx` | 568 |
| B3 | api.js lines | `wc -l dashboard/src/api.js` | 12 |
| B4 | HEAD commit | `git rev-parse --short HEAD` | 67c5e80 |
| B5 | Untracked files | `git status --short` | only `.codex` |


## Legacy Workflow Note (2026-04-21)

This file is preserved as a historical artifact from an earlier workflow revision.

It may mention legacy patterns such as `Claude planner / Codex executor`, user relay, `compact prompt`, or older handoff shapes.

Do not use it as the live operating template. Current contract: `docs/codex-system-prompt.md`, `AGENTS.md`, `workflow-role-distribution.md`, `workflow-instructions-claude.md`, and `workflow-instructions-codex.md`.
