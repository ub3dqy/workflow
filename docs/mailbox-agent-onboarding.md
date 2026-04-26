# Agent mailbox — onboarding prompt

Read this before touching anything in `agent-mailbox/`. You are either Claude or Codex, launched inside a repo that uses this mailbox as the **only** communication channel between agents.

---

## 1. Who you are (session identity)

Your identity is resolved from the session registry for your current working directory (`cwd`). In the normal case the mailbox CLI reads `mailbox-runtime/sessions.json`, finds the entry whose `cwd` matches or is an ancestor of yours, and returns your **agent role** (`"claude"` or `"codex"`) and **project** (e.g. `"workflow"`). If both Claude and Codex are live on the same repo root, use your explicit inbox bucket (`to-claude` or `to-codex`) instead of assuming `list --bucket all` can disambiguate you.

Check at any time:

```bash
node scripts/mailbox.mjs list --bucket to-claude --project <p>
```

If you see `requires bound session for current cwd`, your cwd isn't registered. Either `cd` into the registered parent directory, or ask the user to register a session for you. Never fake a session by writing to `sessions.json` unless you know exactly what you're doing.

### Codex remote launch rule

Do **not** start project Codex sessions with raw `codex --remote ws://127.0.0.1:4501`. The shared app-server may create the new thread using the app-server's own cwd (`workflow`) instead of the terminal cwd.

From any project directory, start remote Codex with:

```bash
codexr
```

`codexr` opens Codex directly as:

```bash
codex --remote ws://127.0.0.1:4501 -C "$PWD" "Старт remote-сессии проекта. Ответь только OK."
```

That first tiny prompt is the zero-touch cold-start path: it makes Codex create a real rollout for the current project cwd before mailbox automation needs to inject anything. Raw `codex --remote ws://127.0.0.1:4501` is not a supported mailbox launch path because it can leave the thread loaded but rollout-less until a manual prompt. Do not create a thread through the app-server first and do not run `codex resume <thread>` for cold remote sessions: app-server metadata can exist before the rollout file exists, and `resume` can fail with `Failed to resume session`.

Before opening Codex, `codexr` also checks the dashboard backend at `http://127.0.0.1:3003` and the Codex app-server at `ws://127.0.0.1:4501`. If the backend is not running, `codexr` starts the backend bridge in the background; if the app-server is not ready, it asks that backend to start the transport. The browser dashboard (`:9119`) is still launched by the normal workflow launcher.

The dashboard does not own live Codex remote sessions. Closing, crashing, restarting the dashboard backend, or using normal dashboard transport controls must leave the app-server running so open `codex --remote` windows keep their WebSocket connection. The dashboard exposes safe start/health-check behavior plus a separate emergency `Force stop` action. Legacy Stop/Restart API calls fail closed instead of killing the app-server; emergency force-stop requires explicit confirmation and disconnects every open remote session.

No manual thread id lookup is required. Pass Codex options after `--`, for example:

```bash
codexr -- --model gpt-5.5
```

## 2. What the mailbox is

- **Purpose**: persistent, file-based message queue between Claude and Codex (and the user, read-only via dashboard). Not a chat — each letter is a discrete, addressable artifact.
- **Layout on disk** (under `agent-mailbox/`):
  - `to-claude/` — inbox for Claude. Letters here are addressed to Claude (`to: claude` in frontmatter).
  - `to-codex/` — inbox for Codex.
  - `archive/<thread>/` — processed letters, moved here on archive/reply.
- **Transport is gitignored**: letters never enter git history. They are ephemeral working state.
- **File format**: YAML frontmatter (id, thread, from, to, status, created, project, optional reply_to / received_at / archived_at / resolution / answer_message_id / answered_at) + markdown body.

## 3. The four commands (this is your entire API)

```bash
node scripts/mailbox.mjs send   --from <claude|codex> --to <claude|codex> \
                                --thread <slug> --project <p> \
                                (--body "text" | --file path.md) \
                                [--reply-to <id>] [--existing-thread]

node scripts/mailbox.mjs list   [--bucket <to-claude|to-codex|archive|all>] \
                                --project <p> [--json]

node scripts/mailbox.mjs reply  --from <claude|codex> --project <p> \
                                --to <relative/path/to/target.md> \
                                (--body "text" | --file path.md)

node scripts/mailbox.mjs archive --path <relative/path/to/target.md> \
                                 --project <p> \
                                 [--resolution <answered|no-reply-needed|superseded>] \
                                 [--answered-at <ISO> --answer-message-id <id>]
```

Nothing else. No `cat`, no filesystem `Read` tool on letter files, no direct YAML editing.

## 4. Letter lifecycle

```
  send        list/reply           archive/reply
  ─────▶ pending ──▶ received (received_at set) ──▶ archived (moved to archive/<thread>/)
```

- **pending**: letter exists, frontmatter has no `received_at`. Recipient hasn't seen it.
- **received**: `mailbox.mjs list` on the recipient's inbox stamps raw frontmatter `received_at` on each pending letter IN THAT INBOX ONLY. This is the read-confirmation step. The dashboard unread dot uses the raw frontmatter field (`metadata.received_at`), not the library's display fallback timestamp.
- **archived**: `archive` or `reply` adds `status: archived` + `archived_at` + optional `resolution`/`answer_message_id`/`answered_at`, and moves the file to `archive/<thread>/`.

## 5. Rules

1. **First action when processing a letter: run `list` via CLI.** Don't open the file with `Read`/`cat`/an editor. Those don't stamp `received_at`, and the dashboard will keep showing the letter as unread.
2. **Archive in the same turn** you processed the letter. Don't batch-archive later. Use `--resolution answered` + `--answer-message-id <reply-id or commit-<sha>-<label>-merged>` when you replied or committed; `no-reply-needed` for FYI pings; `superseded` for replaced/mangled messages.
3. **`--project` is always required.** Letters in other projects are invisible to you — don't read them, don't reference them, don't try to help with them. This is enforced at the CLI level but also at the politeness level.
4. **`--from` must match your agent role.** Don't claim you are the other agent.
5. **`reply --to` must target a letter addressed to you.** Replying to a letter in the other agent's inbox is rejected with `ClientError(64)` (Stage 6). This protects the other agent's inbox from silent archival by you.
6. **Thread continuity**: one topic = one `--thread <slug>`. `reply` auto-threads. `send --existing-thread` lets you add a non-reply follow-up without starting a new thread.
7. **Mailbox is not user chat.** Never try to pass letter content to the user as chat output; instead, summarize the letter and archive it. User reads via the dashboard if they want raw text.
8. **`list` output tells you what's new.** If you poll and the list is empty, there's nothing to do on the mailbox side. Don't invent work.

## 6. Anti-patterns (all observed on this repo)

| Anti-pattern | What breaks | Correct action |
|---|---|---|
| Opening `agent-mailbox/to-claude/*.md` with the `Read` tool | `received_at` never set; dashboard shows stale unread | `node scripts/mailbox.mjs list --bucket to-claude --project <p>` first |
| Running `list --bucket all` blindly | If Claude and Codex share the same project root, agent identity can be ambiguous and `all` may be rejected | Prefer your explicit inbox bucket: `to-claude` or `to-codex` |
| Treating top-level `message.received_at` from a read-only library probe as unread truth | `readMessage()` falls back to `created`, so the value can look populated even when raw frontmatter has no `received_at` | For unread truth, inspect raw frontmatter / `metadata.received_at`, not the derived display field |
| `reply --to` pointed at a letter in the other agent's inbox | Pre-Stage-6: silently archived foreign inbox item. Stage-6: rejected. | Only reply to letters addressed to you |
| Forgetting to archive after processing | Letter lingers as `pending` in archive/UI view | `archive …` or `reply …` in the same turn you processed |
| Sending without `--project` | CLI rejects | Always pass `--project <your-project>` |
| Touching a letter whose `project` field is not yours | Contract violation, user flag | Ignore it; it's for a different agent instance |

## 7. Sanity checks before you report «done» to the user

1. `node scripts/mailbox.mjs list --bucket to-claude --project <p>` — is your inbox clean?
2. Grep your outgoing letter's frontmatter — does it have `status: archived` if you archived it? `received_at` if the recipient already polled?
3. If you replied, did the CLI also archive the target? (Check `archive/<thread>/`.)
4. Does the dashboard unread-dot on your item match your expectation?

If any of those are surprising, investigate before declaring the task done.

## 8. When something doesn't fit in a letter

- Large artifacts (git diffs, planning docs, probe outputs): commit them to `docs/codex-tasks/<slug>*.md` and reference the path in the letter body. Don't inline 5 KB of diff into a letter.
- Binary data: don't use mailbox at all.
- Decisions the user should gate: escalate via user chat + log to `decision-log.md`, don't bury in a letter.

## 9. TL;DR for the impatient agent

```
list → read frontmatter via list output → process → archive/reply in the same turn.
Never use the Read tool on a letter.
Always --project. Never cross-agent reply.
```

If you disagree with any rule above after reading the full repo context (`CLAUDE.md`, `AGENTS.md`, `local-claude-codex-mailbox-workflow.md`), escalate to the user — don't work around it silently.
