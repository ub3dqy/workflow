# Workflow

Documentation and tooling for dual-agent workflow: **Claude** (planner) + **Codex** (executor). Mailbox protocol for async inter-agent communication + local read-only dashboard for visualization.

[![CI](https://github.com/ub3dqy/workflow/actions/workflows/ci.yml/badge.svg)](https://github.com/ub3dqy/workflow/actions/workflows/ci.yml)

## What this is

- **`scripts/mailbox.mjs`** — CLI для sending/listing/replying/archiving messages between Claude и Codex via markdown files в `agent-mailbox/`.
- **`dashboard/`** — local read-only web UI (Express + Vite + React) для browsing mailbox, ports `127.0.0.1:3003` (API) + `127.0.0.1:9119` (Vite).
- **`docs/codex-tasks/`** — formal handoff plans от Claude к Codex (plan + report + planning-audit triplets).
- **`agent-mailbox/`** — gitignored async dialogue directory (`to-claude/`, `to-codex/`, `archive/`).

## Requirements

- **Node.js 20.19+** recommended (ESM module loading works out of the box; `engines` field в `dashboard/package.json` warns on older). Node 18.x technically works (prior empirical testing на Node 18.19.1) but будет показывать install-time warnings — upgrade recommended.
- **Windows or WSL2 Linux** (launchers Windows-specific, но CLI + dashboard cross-platform).
- **Git** (for tracked workflow).

## Setup

```bash
git clone https://github.com/ub3dqy/workflow.git
cd workflow/dashboard
npm install
```

## Usage

### Start dashboard (browse mailbox UI)

**Any platform**:
```bash
cd dashboard
npm run dev
# Dashboard: http://127.0.0.1:9119
# API: http://127.0.0.1:3003
```

**Windows one-click** (optional):
```
start-workflow.cmd
```
Smart npm install caching: skips install когда `package-lock.json` matches last snapshot.

**Stop dashboard**:
```
stop-workflow.cmd
```
Uses `npx kill-port` to release ports 3003 + 9119.

**Hidden console** (optional — для shortcut / tray launch):
```
start-workflow-hidden.vbs
```
Runs `start-workflow.cmd` без visible terminal window.

### Send message via CLI

```bash
# From workflow repo root:
node scripts/mailbox.mjs send --from codex --to claude --thread my-thread --body "message text"

# Auto-detects project from cwd basename. Explicit override:
node scripts/mailbox.mjs send --from claude --to codex --thread task --project messenger --body "..."

# List Claude's inbox:
node scripts/mailbox.mjs list --bucket to-claude

# Reply to inbox message:
node scripts/mailbox.mjs reply --to to-codex/<filename>.md --body "reply text"

# Archive message with resolution:
node scripts/mailbox.mjs archive --path to-claude/<filename>.md --resolution answered
```

See also: project conventions in [`CLAUDE.md`](./CLAUDE.md) and mailbox protocol spec in [`local-claude-codex-mailbox-workflow.md`](./local-claude-codex-mailbox-workflow.md).

## Architecture

Dual-agent workflow:
- **Claude** = planner. Writes handoff plans в `docs/codex-tasks/<slug>{,-planning-audit,-report}.md`. Никогда не executes production code.
- **Codex** = executor. Reads plan + planning-audit → runs pre-flight → applies changes → fills report. Никогда не changes whitelist / scope.
- **User** = decision gate. Approves scope, commits, pushes.

Coms:
- **Formal handoff** = git-tracked `docs/codex-tasks/` (plan + planning-audit + report, three-file pattern).
- **Informal async** = `agent-mailbox/` (gitignored, scratchpad).

Detailed rules:
- [`CLAUDE.md`](./CLAUDE.md) — project conventions
- [`workflow-instructions-claude.md`](./workflow-instructions-claude.md) — planner role
- [`workflow-instructions-codex.md`](./workflow-instructions-codex.md) — executor role
- [`workflow-role-distribution.md`](./workflow-role-distribution.md) — role separation
- [`local-claude-codex-mailbox-workflow.md`](./local-claude-codex-mailbox-workflow.md) — mailbox protocol spec

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs на every push/PR to master:
- **`build`** — `npm ci && npx vite build` на Node 24
- **`personal-data-check`** — regex scan для accidental PII/hostname leaks

## License

No explicit license file in repository; all rights reserved by default. Contact maintainer for licensing questions.

## Contributing

Issues и PRs welcome. Workflow expects:
1. Propose scope to maintainer (open issue).
2. Follow handoff pattern if change is non-trivial (see `docs/codex-tasks/` examples).
3. Personal data scan clean before push (CI enforces).
4. One commit per logical change.
