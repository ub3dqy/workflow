# Local Claude <-> Codex Mailbox Workflow

> Current contract reference: [docs/codex-system-prompt.md](./docs/codex-system-prompt.md).
> This file describes the mailbox protocol that carries Claude↔Codex coordination inside the sequential workflow.

---

## Purpose

Mailbox is the mandatory coordination transport between Claude and Codex in this repository.

It is used for:

- Claude independent initial result -> Codex
- Codex synthesized technical specification -> Claude
- Codex review remarks / agreements -> Claude
- Claude implementation handoff / status updates -> Codex
- Codex final verification verdict -> Claude

Mailbox is **not** the source of truth for scope or implementation details by itself. Tracked implementation artifacts still live in `docs/codex-tasks/`.

## Core Rule

> Claude<->Codex interaction happens through agent mail only.

User chat remains the user<->agent channel. It is not the required transport layer between agents.

## Directory Layout

```text
agent-mailbox/
  to-claude/
  to-codex/
  archive/
    <thread>/
```

Each message is a separate markdown file with frontmatter.

## Message Classes

Supported live message types:

1. `initial-result`
2. `synthesized-spec`
3. `review-remarks`
4. `full-agreement`
5. `implementation-handoff`
6. `final-verdict`

The type can live in body headings or frontmatter metadata, but the meaning must be unambiguous.

## Required Frontmatter

Every agent-authored message must contain:

```yaml
---
id: 2026-04-21T12-00-00Z-claude-001
project: workflow
thread: my-task
from: claude
to: codex
status: pending
created: 2026-04-21T12:00:00Z
---
```

Allowed agent senders/receivers:

- `claude`
- `codex`

Important constraints:

- `project` is mandatory
- `from` is mandatory
- `to` is mandatory
- `from === to` is invalid
- thread identity comes from frontmatter `thread`, not filename

## Message Lifecycle

Expected lifecycle:

1. message created in `to-claude/` or `to-codex/`
2. receiving agent reads it
3. receiving agent replies through mailbox when needed
4. processed message is archived into `archive/<thread>/`

Archive entries should remain self-contained lifecycle records.

## What Belongs In Mailbox vs Tracked Docs

### Mailbox

Use mailbox for:

- independent results
- synthesized specification
- remarks / agreements
- delivery notices
- review outcomes

### Tracked Docs

Use `docs/codex-tasks/` for:

- Claude plan: `<slug>.md`
- Claude planning audit: `<slug>-planning-audit.md`
- Claude execution report: `<slug>-report.md`
- Codex verification artifact: `<slug>-work-verification.md`

Mailbox letters should reference tracked files by path when needed.

## Scope Guardrails

Mailbox must not:

- silently change approved scope
- silently rewrite whitelist
- silently replace design decisions
- bypass discrepancy handling
- bypass required review loops

If a message reveals a scope-breaking fact, the tracked package must be updated and re-reviewed.

## Agent-side CLI

Current agent-path CLI contract:

```text
node scripts/mailbox.mjs send --from <claude|codex> --to <claude|codex> --thread <slug> --project <name> (--body <text> | --file <path>) [--reply-to <id>] [--existing-thread]
node scripts/mailbox.mjs list [--bucket <to-claude|to-codex|archive|all>] --project <name> [--json]
node scripts/mailbox.mjs reply --from <claude|codex> --project <name> --to <relativePath> (--body <text> | --file <path>)
node scripts/mailbox.mjs archive --path <relativePath> --project <name> [--resolution <answered|no-reply-needed|superseded>] [--answered-at <UTC ISO> --answer-message-id <id>]
node scripts/mailbox.mjs recover --project <name>
```

Operational notes:

- `--project` is mandatory on agent-path commands
- `send` and `reply` require explicit `--from`
- cwd autodetect is removed
- agent-path operations require a bound session for the current project

## Project Isolation

Project isolation is infrastructure-enforced:

- agent-path reads are project-scoped
- cross-project send/list/reply/archive/recover are invalid
- dashboard is user-facing and can remain multi-project
- agents must never use mailbox visibility to invent cross-project priorities

## Agent-path read isolation contract

Enforced in-repo as of read-isolation task (session + filename-prefix storage):

- **CLI**: every agent-path operation (`send / list / reply / archive / recover`) requires a bound session whose project equals the `--project` flag. Session binding is established by the SessionStart hook via `scripts/mailbox-session-register.mjs` → supervisor POST `/api/runtime/sessions`. Read paths (`readBucket`, `collectMailboxMessages`, `readMessageByRelativePath`, `recoverOrphans`) filter by filename prefix **before** any file content is opened.
- **HTTP**: every `/api/agent/*` call requires `session_id` + `project` query params; server rejects 400 (missing) / 404 (unknown session) / 403 (project scope mismatch). `/api/agent/messages` readBucket calls are project-scoped.
- **Admin endpoints** (`/api/messages*`, `/api/archive`, `/api/notes`) remain multi-project by design — human admin surface via browser. They are explicitly **NOT part of the agent isolation guarantee**.
- **Filesystem discipline**: agents MUST NOT read `agent-mailbox/` files directly (`Read`, `Bash cat`, `Grep` on mailbox paths). This is a discipline contract, not a code-level guard. Any agent that bypasses the CLI/API surface violates project isolation.

## Dashboard unread semantics

- Dashboard unread state is driven by the **raw** frontmatter field `received_at`.
- In API payloads this means `message.metadata.received_at`; the UI unread dot and pending banner intentionally use that raw field.
- The top-level `message.received_at` returned by `readMessage()` is a **display fallback** (`raw received_at ?? created`) so legacy and unread letters still have a printable timestamp.
- Therefore a read-only library probe can show a populated top-level `received_at` even when the message is still unread. Do **not** use the derived top-level field as unread truth.
- Canonical rule: unread truth = raw frontmatter; display timestamp = normalized fallback.

### Storage invariant

Every message filename starts with `<project>__` (double-underscore separator). Enforced by `generateMessageFile` which prepends the normalized project and by `normalizeProject` which rejects slugs containing `__` with `ClientError(400, 'project slug must not contain "__" (filename-prefix separator)')`.

### Residual risks

- Admin endpoints (accepted non-goal — human scope)
- Direct filesystem reads by agents (discipline contract, unenforceable in code)
- Process-memory serial reuse across agent turns in the same Node process (theoretical side-channel; not a realistic attack vector in local-dev trust model)
- Local host binding (`127.0.0.1`) — dashboard is not network-exposed

## Migration runbook — maintenance window

The filename-prefix storage is established via a one-time migration script (`scripts/mailbox-migrate-project-prefix.mjs`). Because `agent-mailbox/` is gitignored (`.gitignore:1-3`), migration runs as a **runtime operation outside of git**, tracked only via a migration-log under `mailbox-runtime/`.

**Step A — Code changes (Claude, working-tree only, no commit)**

Claude applies all code + docs edits in the working tree. Runs pre-migration V-probes. Updates the execution report. **Claude does NOT commit** — per `CLAUDE.md:85` commit requires explicit user command.

**Step A' — Commit + push (explicit user-commanded branch)**

Triggered only when the user explicitly commands commit / push. Claude runs `git commit` (and `git push` only on additional authorization).

**Step B — Maintenance-window migration (user-executed)**

1. Stop dashboard server and all Claude/Codex Code sessions in the project.
2. `node scripts/mailbox-migrate-project-prefix.mjs --dry-run` — review planned renames.
3. `node scripts/mailbox-migrate-project-prefix.mjs --apply` — executes renames, emits `mailbox-runtime/migration-<utc-timestamp>.log` with one `<old-relative-path>\t<new-relative-path>` per line.
4. Re-apply `--apply` — idempotency check expected 0 renamed.
5. `find agent-mailbox -name "*.md" -not -name "*__*"` — expected empty.
6. Restart dashboard (`cd dashboard && npm run dev`).
7. Open a fresh Claude Code session (SessionStart hook re-registers with the restarted supervisor).
8. Fresh Claude session runs remaining V-probes and fills execution report §2.

### Rollback

- **Working-tree rollback** (Step A done, no commit): `git restore <files>` or `git checkout -- <files>`.
- **Code rollback after commit** (Step A'): `git revert <step-A'-sha>` then restart dashboard + fresh sessions. Requires explicit user command per repo policy.
- **Data rollback** (Step B): `node scripts/mailbox-migrate-project-prefix.mjs --restore mailbox-runtime/migration-<timestamp>.log` reads the log in reverse and renames files back. The migration-log is the sole source of truth for data rollback — **not git**. Log is gitignored but persists locally.
- **Order when both applied**: roll back data first (while new code still expects prefixes), then code via user-commanded `git revert`.

## Dashboard Constraints

The dashboard is allowed to:

- read mailbox files
- show grouped pending/archive state
- surface related tracked files
- perform safe actions already supported by the file protocol

The dashboard must not:

- become a second source of truth
- create hidden state outside files
- auto-launch agents
- turn mailbox into live chat
- bypass review or discrepancy rules

## Hooks And Automation

Current automation stance:

- backend-first business logic
- hooks are thin adapters only
- SessionStart is acceptable for pending-mail summary
- Stop can be used only as a continue-or-stop signal, not as a text injection channel
- UserPromptSubmit mailbox injection is rejected as noisy
- Claude Code channels are the supported autonomous wake-up path for Claude mailbox
  automation. Project `.mcp.json` registers MCP server `workflow-mailbox`, backed by
  `scripts/mailbox-channel.mjs`. The operator entry point is
  `clauder`, matching the Codex-side `codexr`. If the PATH alias is not installed,
  `clauder.cmd` from the repo root is the Windows fallback; `install-clauder.cmd`
  installs the permanent short Windows command. The launcher starts
  `claude --dangerously-load-development-channels server:workflow-mailbox --permission-mode auto`;
  `clauder --mode bypass` is reserved for trusted local sessions
  that must suppress permission prompts completely. The channel declares
  `claude/channel`, polls `agent-mailbox/to-claude/` read-only for pending
  `project: workflow` mail, and emits `notifications/claude/channel` events. It never
  calls `mailbox.mjs list` or writes `received_at`; Claude must still process mail with
  the normal mailbox CLI and archive/reply in the same turn. Channel-suggested CLI
  commands set `AGENT_MAILBOX_PROJECT=workflow AGENT_MAILBOX_AGENT=claude` so missing
  hook registration or stale Codex session bindings for the same cwd do not make
  `to-claude` reads look like cross-agent mailbox access. The older `acceptEdits` plus
  long `--allowedTools` launch form is not treated as zero-touch because env-prefixed
  Bash commands can still prompt.
- Claude Code plugin monitors are allowed as read-only diagnostic signal adapters. The
  local `workflow-mailbox` plugin runs `scripts/mailbox-monitor.mjs` for
  `project: workflow`, polls `to-claude/`, emits only a short
  `WORKFLOW_MAILBOX_PENDING` line, and never calls `mailbox.mjs list` or writes
  `received_at`. In idle Claude Code CLI sessions the visible proof is `1 monitor` in
  the status bar; monitor output is delivered to Claude during an active or next user
  turn, not as a guaranteed autonomous wake-up.

## Chat Reporting Policy

After mailbox actions, chat should report operational status only unless the user explicitly asks for message contents.

Good:

- "Почту проверил"
- "Ответ отправлен"
- "Сообщение архивировано"

Not good by default:

- pasting the full mailbox body into chat
- summarizing private mailbox content without request

## Historical Note

Earlier versions of this file discussed mailbox mainly as a way to reduce manual relay. The current contract is stricter: mailbox is now the required Claude↔Codex coordination transport inside the sequential workflow.
