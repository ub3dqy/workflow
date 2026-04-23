# mailbox-received-at-caller-scope — scope `received_at` marking to caller's inbox only

**Stage**: 6 (independent — not in dashboard-perf roadmap)
**Version**: 1
**Thread**: `mailbox-received-at-caller-scope`
**Planning-audit**: `docs/codex-tasks/mailbox-received-at-caller-scope-planning-audit.md`
**Execution report**: `docs/codex-tasks/mailbox-received-at-caller-scope-report.md` (TBD after exec)
**Work-verification** (Codex, post-exec): `docs/codex-tasks/mailbox-received-at-caller-scope-work-verification.md` (TBD)
**Depends on**: current `master` at `f9cd404`.
**Executor**: Claude. **Verifier**: Codex.

---

## 1. Why this stage exists

User observed on 2026-04-23: a letter that Claude sent to Codex (`to-codex/…claude-001.md`) has `received_at` set in frontmatter even though Codex has not run in this session yet and has not read the letter. Dashboard's S5 unread-dot therefore shows the letter as already read / acknowledged, which is wrong.

Root cause is in two paths that mark `received_at` without checking the caller's agent role:

1. **`scripts/mailbox.mjs:215-223`** — inside `handleList`, after `resolveCallerProject` + project-scope validation, the CLI iterates all pending messages from both `to-claude` and `to-codex` buckets and calls `markMessageReceived(abs)` on each. The caller's agent role (claude vs codex) is never consulted. So when Claude runs `mailbox.mjs list --project workflow --bucket all` (or even `--bucket to-codex`), letters in `to-codex/*.md` get stamped `received_at` even though the recipient is Codex, not Claude.

2. **`dashboard/server.js:215-233`** — the agent-authenticated endpoint `GET /api/agent/messages` concatenates `toClaude + toCodex` into `toMark` and calls `markMessageReceived` on every pending entry. `request.agentSession.agent` is available (the caller's agent role), but it's not used to scope the marking.

The semantic contract intended by `markMessageReceived` (per `scripts/mailbox-lib.mjs:604-626` — writes `received_at` ISO timestamp to frontmatter iff absent) is «the recipient acknowledged receipt». Current behaviour is «anyone listing the bucket stamps everything», which breaks the contract.

Fix goal: `received_at` stamps only when the recipient agent actually listed/polled their own inbox.

## 2. Change scope

| # | File | Change |
|---|---|---|
| 1 | `scripts/mailbox-lib.mjs` — new helper `resolveCallerAgent({ cwd, runtimeRoot })` | Mirror of `resolveCallerProject`: read `sessions.json`, find the session whose `cwd` matches or is an ancestor of the caller's `cwd` (case-folded on Windows/WSL per `feedback_mailbox_project_scope`), return `session.agent` (`"claude"` or `"codex"`) or `null`. |
| 2 | `scripts/mailbox.mjs` — `handleList` at `:195-223` | After `resolveCallerProject` call, add `const boundAgent = await resolveCallerAgent({ cwd: process.cwd(), runtimeRoot })`. If `!boundAgent` → existing `requires bound session` error already covers this (same ancestor walk). In the marking loop, restrict bucket filter from `"to-claude" \|\| "to-codex"` to `"to-\${boundAgent}"`. Messages in the opposite bucket are listed for visibility but NOT marked. |
| 3 | `dashboard/server.js` — agent router `GET /messages` at `:215-233` | Replace `const toMark = [...toClaude, ...toCodex].filter(…pending)` with `const callerInbox = request.agentSession.agent === "claude" ? toClaude : toCodex; const toMark = callerInbox.filter(…pending)`. Add defensive sanity check: if `request.agentSession.agent` is neither `"claude"` nor `"codex"` → skip marking entirely (do not fall through to marking both). |
| 4 | `scripts/mailbox.mjs` — `handleReply` at `:275-282` | **No change.** Reply-target marking already has correct semantics: the caller IS the recipient of the message they're replying to, by construction. |

**Non-changes**:

- `dashboard/server.js` non-agent path `GET /api/messages` at `:47-70` — does NOT mark `received_at` (never did), unchanged.
- `scripts/mailbox-lib.mjs:markMessageReceived` function body — unchanged, stays idempotent (only stamps if absent).
- `scripts/supervisor.mjs` — does not call `markMessageReceived`, unchanged.
- `dashboard/src/App.jsx` — no client change; `received_at` semantics from UI perspective remains «has the recipient ack'd» — stays correct once backend is fixed.
- Existing letters with potentially-false `received_at` — NOT rewritten. The mark is already in frontmatter; we have no reliable way to tell which are genuine vs. bogus, and rewriting history would break ordering and trust. The fix is forward-only.
- Bucket-filter output when listing — `list --bucket to-codex` still shows Codex's pending messages (visibility preserved); it just stops marking them.

**Total estimated touch**: 2 files for code + 1 new helper export = ~50-80 LOC net. Single concern. Below Rule #8 threshold; fits in one commit.

## 3. Expected behaviour after fix

| Scenario | Current behaviour (buggy) | Fixed behaviour |
|---|---|---|
| Claude runs `mailbox.mjs list --bucket all --project workflow` | All pending in `to-claude` + `to-codex` get `received_at` | Only `to-claude/*.md` pending get `received_at`; `to-codex/*.md` untouched |
| Claude runs `mailbox.mjs list --bucket to-codex --project workflow` | `to-codex` pending get `received_at` | `to-codex` pending LISTED but NOT marked |
| Codex runs the same list commands | Same problem mirrored | Only `to-codex` marks; `to-claude` untouched |
| Claude runs `mailbox.mjs reply …` targeting a `to-claude` letter | Marks target (correct) | Same (unchanged) |
| Claude runs `mailbox.mjs reply …` targeting a `to-codex` letter (edge case: agent replying to a letter they sent?) | Marks target | Same (reply-target marking is about read semantics of the replier, which IS correct here) |
| Dashboard `GET /api/messages` (non-agent) | No marking | No marking (unchanged) |
| Dashboard `GET /api/agent/messages` with `session.agent=claude` | Marks both buckets | Marks only `to-claude` |
| Dashboard `GET /api/agent/messages` with `session.agent=codex` | Marks both buckets | Marks only `to-codex` |

## 4. Out of scope

- **Retroactive correction of existing bogus `received_at`** — no way to distinguish. Forward-only fix.
- **Body/metadata separation** (the «block Read tool from seeing letter body» discussion with user on 2026-04-23) — explicitly a separate future stage (proposal noted but not started).
- **Changes to session binding (`resolveCallerProject`, `sessions.json` format)** — reusing current binding layer, not refactoring it.
- **Client-side (`App.jsx`) changes** — none. The unread-dot logic (`!metadata.received_at`) is correct; backend fix alone restores the invariant.
- **Supervisor `pendingIndex` derivation** — no change. `pendingIndex[*].received_at` is already a fallback-derived field that cannot distinguish read/unread; Stage 5's `pendingReceivedMap` correctly cross-references raw `metadata.received_at`. This fix just makes `metadata.received_at` more trustworthy.
- **Error messages / CLI help text changes** — out of scope unless Codex finds the behaviour change needs explicit documentation.

## 5. Rollback

```
git revert <stage-6-commit>
git push origin master
```

Single commit, 2 files. Reverts the caller-scope check; restores the over-eager marking. No data migration to undo.

## 6. Connection to the broader mailbox-read discussion

Separately (user 2026-04-23 thread): «as a tool-level thing — how to make Read tool not see the letter body?». My answer there was «real fix = separate body from metadata on disk». That's a bigger refactor (~200-300 LOC, 4+ files) and a different concern entirely. This Stage 6 fixes only the wrong-direction marking bug; it does NOT prevent filesystem `Read` of letter bodies. If you later decide to pursue the body-separation refactor, it layers cleanly on top of this fix.
