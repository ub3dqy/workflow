# mailbox-received-at-caller-scope — scope `received_at` marking to caller's inbox only

**Stage**: 6 (independent — not in dashboard-perf roadmap)
**Version**: 1
**Thread**: `mailbox-received-at-caller-scope`
**Planning-audit**: `docs/codex-tasks/mailbox-received-at-caller-scope-planning-audit.md`
**Execution report**: `docs/codex-tasks/mailbox-received-at-caller-scope-report.md` (TBD after exec)
**Work-verification** (Codex, post-exec): `docs/codex-tasks/mailbox-received-at-caller-scope-work-verification.md` (TBD)
**Depends on**: current `master` at the Stage-6 docs-landing commit (`6c347e5` for v1; this v2 revision lands as a follow-up commit on top of it — see revised base in `-planning-audit.md §1.0`).
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
| 1 | `scripts/mailbox-lib.mjs` — new internal helper `resolveCallerSession({ cwd, runtimeRoot })` | Session-row lookup shared by project and agent resolvers. Reads `sessions.json`, does the same case-folded exact-or-ancestor `cwd` match as the current `resolveCallerProject`, returns the matching session object (with `agent`, `project`, etc.) or `null`. |
| 2 | `scripts/mailbox-lib.mjs` — refactor `resolveCallerProject` | Now a thin wrapper: `resolveCallerSession(...) → normalizeProject(entry?.project) \|\| ""`. Behaviour unchanged; body de-duplicated. Applied per Codex recommendation to avoid cloning the full lookup. |
| 3 | `scripts/mailbox-lib.mjs` — new export `resolveCallerAgent({ cwd, runtimeRoot })` | Thin wrapper: `resolveCallerSession(...) → sanitizeAgent(entry?.agent) \|\| ""`, where `sanitizeAgent` accepts only `"claude"` / `"codex"` (anything else → `""`). |
| 4 | `scripts/mailbox.mjs` — `handleList` at `:195-223` | After `resolveCallerProject` call, look up `boundAgent`. In the marking loop, restrict bucket filter from `"to-claude" \|\| "to-codex"` to `"to-\${boundAgent}"`. If `boundAgent === ""` → skip marking entirely (list still prints, keeping visibility). |
| 5 | `scripts/mailbox.mjs` — `handleReply` at `:274-282` | **Scope change from v1 plan.** Reply path DOES still have the bug: `readMessageByRelativePath` accepts any in-project `to-claude/*` or `to-codex/*` path, so a Claude caller could reply-mark a `to-codex` letter. Fix: after `readMessageByRelativePath`, look up `boundAgent`; guard `markMessageReceived(location)` with `targetMessage.to === boundAgent`. If the direction is wrong (e.g. Claude replying to a letter NOT addressed to Claude), the reply can still proceed (existing behaviour), but `received_at` is not stamped. |
| 6 | `dashboard/server.js` — agent router `GET /messages` at `:215-233` | Replace `const toMark = [...toClaude, ...toCodex].filter(…pending)` with caller-inbox-only filter driven by `request.agentSession.agent`. Unknown role → skip marking. |

**Non-changes**:

- `dashboard/server.js` non-agent path `GET /api/messages` at `:47-70` — does NOT mark `received_at` (never did), unchanged.
- `scripts/mailbox-lib.mjs:markMessageReceived` function body — unchanged, stays idempotent (only stamps if absent).
- `scripts/supervisor.mjs` — does not call `markMessageReceived`, unchanged.
- `dashboard/src/App.jsx` — no client change; `received_at` semantics from UI perspective remains «has the recipient ack'd» — stays correct once backend is fixed.
- Existing letters with potentially-false `received_at` — NOT rewritten. The mark is already in frontmatter; we have no reliable way to tell which are genuine vs. bogus, and rewriting history would break ordering and trust. The fix is forward-only.
- Bucket-filter output when listing — `list --bucket to-codex` still shows Codex's pending messages (visibility preserved); it just stops marking them.

**Total estimated touch**: 2 files + 3 new/refactored helper functions = ~80-120 LOC net (v2 scope expanded for reply fix + `resolveCallerSession` extraction). Single concern. Still within Rule #8 one-commit threshold.

## 3. Expected behaviour after fix

| Scenario | Current behaviour (buggy) | Fixed behaviour |
|---|---|---|
| Claude runs `mailbox.mjs list --bucket all --project workflow` | All pending in `to-claude` + `to-codex` get `received_at` | Only `to-claude/*.md` pending get `received_at`; `to-codex/*.md` untouched |
| Claude runs `mailbox.mjs list --bucket to-codex --project workflow` | `to-codex` pending get `received_at` | `to-codex` pending LISTED but NOT marked |
| Codex runs the same list commands | Same problem mirrored | Only `to-codex` marks; `to-claude` untouched |
| Claude runs `mailbox.mjs reply …` targeting a `to-claude` letter (normal case: replying to letter addressed to Claude) | Marks target (correct) | Same: `targetMessage.to === "claude" === boundAgent` → mark proceeds |
| Claude runs `mailbox.mjs reply …` targeting a `to-codex` letter (edge case: Claude replying to a letter NOT addressed to Claude) | Marks target (BUG — stamps wrong-direction) | Reply proceeds, but `markMessageReceived` SKIPPED because `targetMessage.to !== boundAgent` |
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

`git revert <stage-6-commit>` locally. Pushing the revert requires an explicit user command per Rule #11 — not implied by this document. Revert is a single commit touching 2 code files; it restores the over-eager marking. No data migration to undo.

## 6. Connection to the broader mailbox-read discussion

Separately (user 2026-04-23 thread): «as a tool-level thing — how to make Read tool not see the letter body?». My answer there was «real fix = separate body from metadata on disk». That's a bigger refactor (~200-300 LOC, 4+ files) and a different concern entirely. This Stage 6 fixes only the wrong-direction marking bug; it does NOT prevent filesystem `Read` of letter bodies. If you later decide to pursue the body-separation refactor, it layers cleanly on top of this fix.
