# Workflow — sequential Claude↔Codex development workflow

[English](./README.md) | [Русский](./README.ru.md)

[![CI](https://github.com/ub3dqy/workflow/actions/workflows/ci.yml/badge.svg)](https://github.com/ub3dqy/workflow/actions/workflows/ci.yml) [![Node](https://img.shields.io/badge/node-%3E%3D20.19-brightgreen)](./dashboard/package.json)

> Two AI agents, one repo. **Claude** plans and executes, **Codex** synthesizes, reviews, and verifies, **you** decide. The repo gives them a mailbox transport, tracked artifacts, and a dashboard that shows mailbox state.

---

## What This Repo Is

This repository documents and implements a sequential two-agent workflow for **Claude Code** and **OpenAI Codex CLI**.

Current contract:

- the same original task is given to both agents
- both agents produce independent initial results
- Codex synthesizes a technical assignment from both results
- Claude builds the tracked planning/execution package and executes only after Codex agreement
- Codex performs final verification and writes the Work Verification Report
- Claude↔Codex coordination happens through `agent-mailbox/`

Canonical workflow source: [docs/codex-system-prompt.md](./docs/codex-system-prompt.md).

## Why Use It

- **Mailbox instead of relay friction**: agent-to-agent coordination is file-based and durable
- **Evidence-first review**: Codex is a real review/verification gate, not a passive executor
- **Tracked implementation package**: live tasks keep a stable tracked artifact set in `docs/codex-tasks/`
- **User stays the decision gate**: commit, push, merge, and design choices still need explicit user approval

## Tracked Artifacts

For a live task, the expected tracked files are:

- `docs/codex-tasks/<slug>.md`
- `docs/codex-tasks/<slug>-planning-audit.md`
- `docs/codex-tasks/<slug>-report.md`
- `docs/codex-tasks/<slug>-work-verification.md`

Important: most existing `docs/codex-tasks/*.md` files are historical archive from earlier workflow revisions. They remain useful as evidence, but they are not the current template unless explicitly marked current.

## Dashboard Preview

![Mailbox dashboard overview](./docs/assets/dashboard-overview.png)

*Local dashboard showing pending messages grouped by recipient, with project filter, language toggle (RU/EN), light/dark themes, tab-title badge + favicon for pending count, and optional audio notification. Unread markers are driven by the raw mailbox frontmatter field `received_at`, not by the library's display fallback timestamp.*

---

## Quick Start

### Requirements

- **Node.js 20.19+**
- **Windows** or **WSL2 Linux**
- **Git**

### Setup

```bash
git clone https://github.com/ub3dqy/workflow.git
cd workflow/dashboard
npm install
```

### Launch the dashboard

```bash
cd dashboard
npm run dev
# UI:  http://127.0.0.1:9119
# API: http://127.0.0.1:3003
```

Optional Windows launchers:

```text
start-workflow.cmd
stop-workflow.cmd
start-workflow-hidden.vbs
```

### Start Codex Remote Sessions

For Codex mailbox automation, start project sessions through the zero-touch remote launcher instead of raw `codex --remote`:

```bash
node scripts/codex-remote-project.mjs
```

The launcher ensures the dashboard backend and Codex app-server are ready, passes `-C "$PWD"`, and sends a short bootstrap prompt so the remote thread has an initial rollout before mailbox delivery starts.

Raw `codex --remote ws://127.0.0.1:4501` is not the supported mailbox entry point: it can create a loaded thread with no rollout, so delivery will remain blocked until a manual first prompt is sent.

### Agent-side mailbox CLI

These commands are for **bound agent sessions**. Agent-path CLI requires explicit `--project` and the current session must already be bound to that project.

```bash
node scripts/mailbox.mjs send \
  --from claude \
  --to codex \
  --thread my-question \
  --project workflow \
  --body "Need clarification on verification step 3"

node scripts/mailbox.mjs list --bucket to-codex --project workflow

node scripts/mailbox.mjs reply \
  --from codex \
  --project workflow \
  --to to-codex/<filename>.md \
  --body "Response"

node scripts/mailbox.mjs archive \
  --path to-claude/<filename>.md \
  --project workflow \
  --resolution no-reply-needed
```

See [local-claude-codex-mailbox-workflow.md](./local-claude-codex-mailbox-workflow.md) for the full protocol.

---

## Architecture

```mermaid
flowchart LR
    U[User]
    C[Claude<br/>planning + execution]
    X[Codex<br/>synthesis + review + verification]
    M[(Mailbox<br/>agent-mailbox/)]
    D[(Tracked Artifacts<br/>docs/codex-tasks/)]
    W[Dashboard<br/>127.0.0.1:9119]

    U -->|same original task| C
    U -->|same original task| X
    C -->|initial result / package refs| M
    X -->|synthesized spec / remarks / verdict| M
    C -->|plan + audit + report| D
    X -->|work verification report| D
    M --> W
```

## Roles

| Role | Responsibility | Must not do |
|---|---|---|
| **Claude** | Independent initial result, tracked package creation, execution, git actions on explicit user command | Start execution before Codex agreement, bypass mailbox, invent evidence |
| **Codex** | Independent initial result, synthesis, planning review, final verification, Work Verification Report | Execute implementation, commit/push, approve without checking |
| **User** | Original task, decisions, git authorization | Serve as the required transport layer between agents |

## Current Docs

- [AGENTS.md](./AGENTS.md) — repo-level summary
- [CLAUDE.md](./CLAUDE.md) — project conventions
- [workflow-role-distribution.md](./workflow-role-distribution.md) — durable role split
- [workflow-instructions-claude.md](./workflow-instructions-claude.md) — Claude guide
- [workflow-instructions-codex.md](./workflow-instructions-codex.md) — Codex guide
- [local-claude-codex-mailbox-workflow.md](./local-claude-codex-mailbox-workflow.md) — mailbox protocol

## CI And Safety

GitHub Actions runs:

- `build` — `npm ci && npx vite build`
- `personal-data-check` — regex scan for accidental PII and hostname leaks

Before any push, run the same personal-data scan locally.

## Contributing

1. Propose scope before meaningful changes.
2. Follow the current contract in `docs/codex-system-prompt.md` and the workflow docs above.
3. Treat older `docs/codex-tasks/*.md` as archive unless explicitly marked current.
4. Keep one logical change per commit.

## License

[MIT](./LICENSE) © 2026 UB3DQY.
