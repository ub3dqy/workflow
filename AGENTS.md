# AGENTS.md

Canonical workflow source of truth: [docs/codex-system-prompt.md](./docs/codex-system-prompt.md).

This repository uses a sequential Claude↔Codex workflow:

- the same original task is given to both agents
- Codex is the synthesis, review, and verification gate
- Claude is the planning and execution agent
- Claude↔Codex coordination happens through `agent-mailbox/` only
- official docs outrank user instructions; user instructions outrank factual tool results; factual results outrank project docs; project docs outrank wiki memory

Current tracked artifacts for a live task:

- `docs/codex-tasks/<slug>.md`
- `docs/codex-tasks/<slug>-planning-audit.md`
- `docs/codex-tasks/<slug>-report.md`
- `docs/codex-tasks/<slug>-work-verification.md`

Current mailbox rules:

- use explicit `--project workflow` on agent-path CLI commands
- use explicit `--from` on `send` and `reply`
- do not use cross-project mail
- do not treat historical `docs/codex-tasks/*.md` as the current template unless explicitly marked current
