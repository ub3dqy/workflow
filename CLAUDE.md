# Workflow Project

## Overview

Документация и инструментарий для dual-agent workflow (Claude + Codex).

## Directory structure

```
.
├── CLAUDE.md                          # This file — project conventions
├── .gitignore                         # agent-mailbox/, node_modules/, dist/
├── .github/workflows/ci.yml           # CI: vite build + personal data scan
├── workflow-instructions-claude.md    # Инструкция для Claude (planner role)
├── workflow-instructions-codex.md     # Инструкция для Codex (executor role)
├── workflow-role-distribution.md      # Распределение ролей
├── local-claude-codex-mailbox-workflow.md  # Спецификация mailbox protocol
├── local-mailbox-ui-options.md        # UI concept notes
├── agent-mailbox/                     # Gitignored async dialogue between agents
│   ├── to-claude/
│   ├── to-codex/
│   └── archive/
├── dashboard/                         # Local read-only web UI for mailbox
│   ├── package.json
│   ├── server.js                      # Express API (127.0.0.1:3003)
│   ├── vite.config.js                 # Vite dev server (127.0.0.1:9119)
│   └── src/
│       ├── main.jsx
│       ├── App.jsx                    # Three-column card layout + polling
│       └── api.js                     # Fetch wrapper
└── docs/codex-tasks/                  # Formal structured handoff contracts (git-tracked)
```

## Key files

- `workflow-instructions-claude.md` — инструкция для Claude (planner role)
- `workflow-instructions-codex.md` — инструкция для Codex (executor role)
- `workflow-role-distribution.md` — распределение ролей
- `local-claude-codex-mailbox-workflow.md` — спецификация mailbox protocol

## Roles — non-negotiable

- **Claude** думает, планирует, ревьюирует. Не пишет production code.
- **Codex** выполняет, верифицирует, предлагает альтернативы с аргументацией.
- **User** принимает решения, даёт go/no-go, коммитит и мержит.
- Никто не делает работу другого. Никто не принимает решения за пользователя.
- Подробности: `workflow-role-distribution.md`

## Agent rules — non-negotiable

1. **Research before planning.** Прочитай wiki, реальный код, офдоки, запусти preflight. Не пиши план "из головы".
2. **Three-file handoff.** Каждая задача для Codex = план + report template + planning audit в `docs/codex-tasks/`.
3. **Independent review after Codex.** Не верь summary — проверь diff scope, personal data, повтори smokes.
4. **Personal data scan before push.** ВСЕГДА grep перед `git push`. CI ловит после пуша — данные уже утекли. Паттерны в `.github/workflows/ci.yml`.
5. **No commit/push/merge without explicit user command.** `pr`, `commit`, `merge` — только по команде.
6. **Don't ask when task is clear.** Чёткая команда = выполнять, не переспрашивать.
7. **Discrepancy → stop → wait.** Если реальность ≠ план, остановись и зафиксируй. Не продолжай вслепую.
8. **NO-STOP DISCIPLINE during plan creation.** После получения go на handoff (user «да» OR Codex approves TZ через active delegation) и до отправки плана Codex'у на adversarial review — **ни одной остановки**. Audit findings применяются inline автоматически, audit-loop прогоняется до 10/10 без остановок, Codex adversarial findings тоже fix+reply без пауз, delivery к Codex'у sent **без спроса user'а**. Stop ТОЛЬКО при: user explicit stop команде / commit-push команде / discrepancy требующей scope decision / cross-project bleed. Full rule + examples: `C:\Users\<user>\.claude\projects\E--Project-workflow\memory\feedback_no_stop_during_plan.md` + `E:/Project/memory claude/memory claude/docs/claude-plan-creation-procedure.md §"NO-STOP DISCIPLINE"`.

## Mailbox protocol

- `agent-mailbox/` — gitignored async dialogue between agents
- `docs/codex-tasks/` — formal structured handoff contracts (git-tracked)
- Mailbox is NOT for task assignment. Code changes go through `docs/codex-tasks/` handoff.
- Approved scope, whitelist, and design decisions are not changed through mailbox messages.
- See `local-claude-codex-mailbox-workflow.md` for the full protocol spec.

## Dashboard

- `dashboard/` — local read-only web UI for mailbox
- Start: `cd dashboard && npm run dev`
- App UI: `http://127.0.0.1:9119/`
- API server: `http://127.0.0.1:3003/`
- Production build is not needed. This is a local-only tool.

## CI

- `.github/workflows/ci.yml` — two jobs:
  - `build` — `npm ci && npx vite build` (Node 24)
  - `personal-data-check` — grep scan, excludes `.github/`

## Commands

```bash
# Dashboard
cd dashboard && npm run dev        # Start dev server (API + Vite)
cd dashboard && npm run server     # Start API only
cd dashboard && npx vite build     # Production build check

# Personal data scan (run BEFORE push)
grep -riE "$PD_PATTERNS" --include="*.js" --include="*.jsx" --include="*.json" --include="*.md" --include="*.html" --exclude-dir=.github -l .
```
