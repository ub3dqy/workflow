# Mailbox Phase 1 MVP — Planning Audit

> **План**: `docs/codex-tasks/mailbox-phase1-mvp.md`
>
> Документирует ВСЕ шаги research и verification, выполненные при составлении плана.

---

## 1. Files read

| # | File | Lines | What extracted |
|---|------|-------|----------------|
| F1 | `E:/Project/workflow/local-claude-codex-mailbox-workflow.md` | 1-751 (full) | Protocol spec: directory layout (92-97), gitignore decision (112-119), message format (228-267), UI layer (170-254), lifecycle (366-382), archive policy (403-427) |
| F2 | `E:/Project/workflow/workflow-instructions-claude.md` | 1-147 (full) | Three-file handoff requirement, planner role, whitelist discipline, independent review protocol |
| F3 | `E:/Project/workflow/workflow-instructions-codex.md` | 1-132 (full) | Executor role, doc verification protocol, discrepancy handling, design feedback rights |
| F4 | `E:/Project/workflow/workflow-role-distribution.md` | 1-177 (full) | Role boundaries, "user is bridge" principle (line 126-133), handoff chain (150-168), golden rule |
| F5 | `E:/Project/workflow/local-mailbox-ui-options.md` | 1-41 (full) | UI concept: GH-like cards, file-as-protocol principle, rollout phases |

---

## 2. Commands run

| # | Command | Key output | What it proved |
|---|---------|------------|----------------|
| C1 | `ls "E:/Project/workflow/"` | 5 .md files | Project содержит только документацию, нет кода |
| C2 | `ls "E:/Project/workflow/docs/codex-tasks/" 2>/dev/null` | `no codex-tasks dir` | Директория не существовала, создана в процессе планирования |
| C3 | `cat "E:/Project/workflow/.gitignore" 2>/dev/null` | `no .gitignore` | .gitignore отсутствует, нужно создать |
| C4 | `cat "E:/Project/workflow/package.json" 2>/dev/null` | (empty) | Нет package.json, нет зависимостей |
| C5 | `git -C "E:/Project/workflow" rev-parse --is-inside-work-tree` | `fatal: not a git repository` | Не git-репозиторий, нужен git init |
| C6 | `ls -la "E:/Project/workflow/"` | 5 .md + .codex (0 bytes) | Полный listing, .codex пустой файл |
| C7 | `cat "E:/Project/workflow/CLAUDE.md" 2>/dev/null` | `no CLAUDE.md` | CLAUDE.md отсутствует, нужно создать |
| C8 | `git --version` | `2.53.0.windows.2` | Git доступен |
| C9 | `node --version` | `v24.13.0` | Node доступен |
| C10 | `npm --version` | `11.8.0` | npm доступен |
| C11 | `python --version` | `Python 3.11.9` | Python доступен |
| C12 | `uv --version` | `uv 0.10.2` | uv доступен |
| C13 | `npm view vite version` | `8.0.8` | Latest vite |
| C14 | `npm view react version` | `19.2.5` | Latest react |
| C15 | `npm view react-dom version` | `19.2.5` | Latest react-dom |
| C16 | `npm view gray-matter version` | `4.0.3` | Latest gray-matter |
| C17 | `npm view marked version` | `18.0.0` | Latest marked |
| C18 | `npm view express version` | `5.2.1` | Latest express |
| C19 | `npm view @openai/codex version` | `0.121.0` | Local codex 0.112.0, update available |

---

## 3. URLs fetched

| # | URL | Key finding | Used in plan |
|---|-----|-------------|-------------|
| — | Не были fetch'нуты напрямую | — | Версии проверены через npm view (C13-C19). URL'ы в D1-D6 оставлены для doc verification Codex'ом. |

---

## 4. Wiki articles

| # | Article | What used |
|---|---------|-----------|
| W1 | `[[concepts/inter-agent-file-mailbox]]` | Подтверждение архитектуры: three dirs, gitignored, file-per-message |
| W2 | `[[concepts/codex-dual-window-workflow]]` | Cross-OS filesystem access: `/mnt/e/...` ok для лёгких операций |
| W3 | `[[concepts/wiki-hook-injection-tuning]]` | Подтверждение: Phase 1 без hooks |
| W4 | `[[sources/openai-codex-docs]]` | Codex capabilities reference |

---

## 5. Assumptions + verification

| # | Утверждение в плане | Source marker | Status | Evidence |
|---|---------------------|--------------|--------|----------|
| A1 | Проект не является git-репозиторием | `[EMPIRICAL]` | ✅ verified | C5: `fatal: not a git repository` |
| A2 | .gitignore не существует | `[EMPIRICAL]` | ✅ verified | C3: `no .gitignore` |
| A3 | package.json не существует | `[EMPIRICAL]` | ✅ verified | C4: пустой вывод |
| A4 | CLAUDE.md не существует | `[EMPIRICAL]` | ✅ verified | C7: `no CLAUDE.md` |
| A5 | agent-mailbox/ должен быть gitignored | `[PROJECT]` | ✅ verified | F1: spec line 112-119 |
| A6 | Layout: to-claude/, to-codex/, archive/ | `[PROJECT]` | ✅ verified | F1: spec line 92-97 |
| A7 | UI: files are protocol, web UI is view/controller | `[PROJECT]` | ✅ verified | F1: spec line 176 |
| A8 | UI: localhost-only, port 9119 | `[PROJECT]` | ✅ verified | F1: spec line 245 |
| A9 | UI: polling 2-5s, no watchers in MVP | `[PROJECT]` | ✅ verified | F1: spec line 227-230 |
| A10 | UI: empty state required | `[PROJECT]` | ✅ verified | F1: spec line 200-204 |
| A11 | Mailbox ≠ task assignment | `[PROJECT]` | ✅ verified | F1: spec line 156-168 + F4: role-distribution line 126-133 |
| A12 | vite latest = 8.0.8 | `[EMPIRICAL]` | ✅ verified | C13 |
| A13 | react latest = 19.2.5 | `[EMPIRICAL]` | ✅ verified | C14 |
| A14 | gray-matter latest = 4.0.3 | `[EMPIRICAL]` | ✅ verified | C16 |
| A15 | marked latest = 18.0.0 | `[EMPIRICAL]` | ✅ verified | C17 |
| A16 | express latest = 5.2.1 | `[EMPIRICAL]` | ✅ verified | C18 |
| A17 | gray-matter — Node-only, не работает в браузере | `[EMPIRICAL]` | ⚠️ assumed | Общеизвестно (fs-based), но не проверено тестом. Codex верифицирует при scaffold. |
| A18 | concurrently latest = ^9.1.2 | `[EMPIRICAL]` | ⚠️ assumed | Не проверено через npm view. Codex верифицирует. |
| A19 | @vitejs/plugin-react latest = ^4.5.3 | `[EMPIRICAL]` | ⚠️ assumed | Не проверено через npm view. Codex верифицирует. |

---

## 6. Baselines captured

| # | Measurement | Command | Value |
|---|------------|---------|-------|
| B1 | File count in project root | `ls -1 E:/Project/workflow/ \| wc -l` | 5 .md files + .codex |
| B2 | Git repo status | `git rev-parse --is-inside-work-tree` | not a git repo |
| B3 | Existing dirs | `ls E:/Project/workflow/` | no subdirs except docs/codex-tasks/ (just created) |


## Legacy Workflow Note (2026-04-21)

This file is preserved as a historical artifact from an earlier workflow revision.

It may mention legacy patterns such as `Claude planner / Codex executor`, user relay, `compact prompt`, or older handoff shapes.

Do not use it as the live operating template. Current contract: `docs/codex-system-prompt.md`, `AGENTS.md`, `workflow-role-distribution.md`, `workflow-instructions-claude.md`, and `workflow-instructions-codex.md`.
