# Workflow Project

## Overview

Документация и инструментарий для sequential Claude↔Codex workflow.

## Directory Structure

```text
.
├── AGENTS.md                        # Repo-level summary for agents
├── CLAUDE.md                        # This file — project conventions
├── .gitignore                       # agent-mailbox/, node_modules/, dist/
├── .github/workflows/ci.yml         # CI: vite build + personal data scan
├── workflow-instructions-claude.md  # Claude operating guide
├── workflow-instructions-codex.md   # Codex operating guide
├── workflow-role-distribution.md    # Durable role split + sequence
├── local-claude-codex-mailbox-workflow.md  # Mailbox protocol
├── local-mailbox-ui-options.md      # UI constraints and notes
├── agent-mailbox/                   # Gitignored agent-mail transport
├── dashboard/                       # Local mailbox dashboard
└── docs/
    ├── codex-system-prompt.md       # Canonical sequential workflow prompt
    └── codex-tasks/                 # Tracked task artifacts + historical archive
```

## Authoritative Workflow Contract

Canonical source of truth: [docs/codex-system-prompt.md](./docs/codex-system-prompt.md).

Repo docs operationalize that prompt. They do not replace it.

## Key Files

- `AGENTS.md` — short repo-level workflow summary
- `workflow-instructions-claude.md` — Claude-specific operating guide
- `workflow-instructions-codex.md` — Codex-specific operating guide
- `workflow-role-distribution.md` — durable role split
- `local-claude-codex-mailbox-workflow.md` — mailbox protocol

## Live Artifact Model

For a live task, the expected tracked files are:

1. `docs/codex-tasks/<slug>.md`
2. `docs/codex-tasks/<slug>-planning-audit.md`
3. `docs/codex-tasks/<slug>-report.md`
4. `docs/codex-tasks/<slug>-work-verification.md`

Mailbox carries:

- Claude initial result
- Codex synthesized specification
- review remarks / agreements
- implementation handoff notices
- final verification verdicts

Important: most existing `docs/codex-tasks/*.md` files are archival artifacts from older workflow revisions. They are evidence, not the current template.

## Roles

- **Claude** — planning and execution agent.
- **Codex** — synthesis, review, and verification gate.
- **User** — decision gate.

Detailed split: `workflow-role-distribution.md`.

## Priority Order

1. Official documentation
2. User's explicit instructions
3. Factual tool/test/audit results
4. Agreed project documents
5. Wiki as contextual memory

## Agent Rules — Non-negotiable

1. **Research before planning.** Use wiki, official docs, real code, and real probes. No claims from memory.
2. **Mailbox-only Claude↔Codex coordination.** User chat is not the working transport between agents.
3. **Tracked package stays stable.** Use the live artifact model above; do not invent replacement package formats.
4. **Codex writes the Work Verification Report.** Final approval without it is invalid.
5. **Traceability everywhere.** Important claims must point to docs, code, tool output, tests, audits, or verified evidence.
6. **Discrepancy means stop and re-agree.** If facts break the plan, update the package and resend it to Codex.
7. **Personal data scan before push.** Use the same regex as CI.
8. **No commit/push/merge without explicit user command.**
9. **Historical archive is not the template.** Do not blindly reuse older `docs/codex-tasks/*.md`.

## Mailbox Protocol

- `agent-mailbox/` is the transport for agent coordination.
- `docs/codex-tasks/` stores tracked implementation and verification artifacts.
- Mailbox messages do not silently change scope, whitelist, or design decisions.
- Agent-path CLI requires explicit `--project`.
- `send` and `reply` require explicit `--from`.

See [local-claude-codex-mailbox-workflow.md](./local-claude-codex-mailbox-workflow.md) for full details.

## Dashboard

- `dashboard/` is a local mailbox dashboard, not a second source of truth.
- Start: `cd dashboard && npm run dev`
- UI: `http://127.0.0.1:9119/`
- API: `http://127.0.0.1:3003/`

## CI

- `.github/workflows/ci.yml`
  - `build` — `npm ci && npx vite build`
  - `personal-data-check` — regex scan, excludes `.github/`

## Commands

```bash
# Dashboard
cd dashboard && npm run dev
cd dashboard && npm run server
cd dashboard && npx vite build

# Personal data scan
grep -riE "$PD_PATTERNS" \
  --include="*.js" \
  --include="*.jsx" \
  --include="*.json" \
  --include="*.md" \
  --include="*.html" \
  --exclude-dir=.github \
  -l .
```
