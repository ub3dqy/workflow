# Wiki Sync — Dashboard Unread Semantics

External wiki root `/mnt/e/Project/memory claude/memory claude/` is read-only in the current Codex sandbox, so these wiki edits could not be applied directly from this session. This note captures the exact sync required to keep wiki guidance aligned with the current `workflow` codebase.

## Reason

`readMessage()` in `workflow/scripts/mailbox-lib.mjs` returns two different notions of "received":

- top-level `message.received_at` = normalized display fallback (`raw received_at ?? created`)
- `message.metadata.received_at` = raw frontmatter truth used by the dashboard unread marker

This distinction caused a real misread: a read-only mailbox probe reported `received_at` as present even though the dashboard correctly still showed the letter as unread.

## Target wiki files

1. `wiki/concepts/mailbox-list-destructive-read.md`
2. `wiki/concepts/agent-mail.md`
3. `wiki/concepts/inter-agent-file-mailbox.md`

## Required wiki updates

### 1. `wiki/concepts/mailbox-list-destructive-read.md`

Add a new key point:

- **Safe read-only probes do not provide unread truth by default**: `collectMailboxMessages()` / `readMessage()` expose top-level `received_at` as a display fallback (`received_at ?? created`). To determine whether the dashboard should show unread, inspect raw frontmatter `metadata.received_at`, not the derived top-level field.

Update the "Safe read-only alternatives" table:

- `collectMailboxMessages()` row should say that it is safe for content inspection, but unread state must be derived from raw frontmatter, not the normalized top-level timestamp.

Add a short warning under "Mutation path" or "Why this is a problem":

- A read-only probe can make a pending letter look "received" if the caller inspects `message.received_at` instead of `message.metadata.received_at`.

### 2. `wiki/concepts/agent-mail.md`

Update the operational guide so it matches the current repo contract:

- `list`, `reply`, `archive`, `recover` examples should include explicit `--project`.
- `send` should also keep explicit `--project`.
- `list --bucket all` should no longer be presented as always safe. Add a note that when Claude and Codex share the same repo root, agent identity can be ambiguous and explicit inbox buckets (`to-claude` / `to-codex`) are preferred.
- Add a troubleshooting note: if a safe read-only probe shows `received_at`, verify raw frontmatter before concluding that the dashboard should clear the unread marker.

Recommended wording:

> Dashboard unread state is based on raw frontmatter `received_at`. The library reader's top-level `received_at` is only a normalized display timestamp and may fall back to `created` for unread messages.

### 3. `wiki/concepts/inter-agent-file-mailbox.md`

Add a small current-state note in the dashboard / mailbox semantics sections:

- The dashboard unread dot and pending banner use raw `metadata.received_at`.
- `readMessage()` keeps a top-level normalized `received_at` for display/legacy compatibility.
- Therefore "display timestamp" and "unread truth" are intentionally separate.

Recommended wording:

> Current implementation separates unread truth from display timestamps. Unread truth is raw frontmatter `received_at`; the top-level API field may be populated from `created` for display compatibility and must not be used as the unread source of truth.

## In-repo sources already updated in this session

- `README.md`
- `README.ru.md`
- `local-claude-codex-mailbox-workflow.md`
- `docs/mailbox-agent-onboarding.md`
- `dashboard/src/App.jsx`
- `scripts/mailbox-lib.mjs`
