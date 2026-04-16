# Workflow Project

## Overview

Документация и инструментарий для dual-agent workflow (Claude + Codex).

## Key files

- `workflow-instructions-claude.md` — инструкция для Claude (planner role)
- `workflow-instructions-codex.md` — инструкция для Codex (executor role)
- `workflow-role-distribution.md` — распределение ролей
- `local-claude-codex-mailbox-workflow.md` — спецификация mailbox protocol

## Mailbox protocol

- `agent-mailbox/` — gitignored async dialogue between agents
- `docs/codex-tasks/` — formal structured handoff contracts (git-tracked)
- Mailbox is not for task assignment. Code changes go through `docs/codex-tasks/` handoff.
- Approved scope, whitelist, and design decisions are not changed through mailbox messages.
- See `local-claude-codex-mailbox-workflow.md` for the full protocol spec.

## Dashboard

- `dashboard/` — local read-only web UI for mailbox
- Start: `cd dashboard && npm run dev`
- App UI: `http://127.0.0.1:9119/`
- API server: `http://127.0.0.1:3001/`
- Production build is not needed. This is a local-only tool.
