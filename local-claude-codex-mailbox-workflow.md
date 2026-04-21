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
