# mailbox-received-at-caller-scope — scope `received_at` marking to caller's inbox only

**Stage**: 6 (independent — not in dashboard-perf roadmap)
**Version**: 5 (see revision trail at bottom of file)
**Thread**: `mailbox-received-at-caller-scope`
**Planning-audit**: `docs/codex-tasks/mailbox-received-at-caller-scope-planning-audit.md`
**Execution report**: `docs/codex-tasks/mailbox-received-at-caller-scope-report.md` (TBD after exec)
**Work-verification** (Codex, post-exec): `docs/codex-tasks/mailbox-received-at-caller-scope-work-verification.md` (TBD)
**Depends on**: current `master` at the latest `docs(codex-tasks): Stage 6 v<N>` commit (v5 lands this revision on top of v4 `e334c55`). Prerequisite chore `fea959e` (`.gitattributes`) already on master. See `-planning-audit.md §1.0` for base-state probe run at exec-start.
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
| 5 | `scripts/mailbox.mjs` — `handleReply` at `:274-303` | **Scope change from v1 plan. Tightened again in v3 per Codex round-2.** Reply path has a bigger hole than just marking: the caller can reply to a letter in ANY bucket within project scope, which triggers body read + outgoing-letter write + target archive. Claude hitting `reply --to to-codex/<codex-letter>` would effectively close Codex's inbox. Fix: after `readMessageByRelativePath` + `validateProjectScope`, look up `boundAgent`; if `targetMessage.to !== boundAgent` → throw `ClientError(64, "reply target bucket owned by <to>, cannot reply as <boundAgent>")`. Whole reply is rejected — no body read, no outgoing letter, no archive, no mark. Same-direction reply (normal case, `targetMessage.to === boundAgent`) proceeds unchanged and marks as before. |
| 6 | `dashboard/server.js` — agent router `GET /messages` at `:215-233` | Replace `const toMark = [...toClaude, ...toCodex].filter(…pending)` with caller-inbox-only filter driven by `request.agentSession.agent`. Unknown role → skip marking. |
| 7 | `scripts/mailbox-lib.mjs` at `:11-31`, `scripts/mailbox.mjs` at `:27-30`, `dashboard/server.js` at `:5-27` | **New in v3.** Env-based overrides for paths + port — per Codex round-2 blocker 3, fixture-based ACs require these values be overridable for the throwaway probe harness. Pattern: `const port = Number(process.env.PORT) \|\| 3003;` `const runtimeRoot = process.env.RUNTIME_ROOT ? path.resolve(process.env.RUNTIME_ROOT) : path.resolve(__dirname, "..", "mailbox-runtime");` `const mailboxRoot = process.env.MAILBOX_ROOT ? path.resolve(process.env.MAILBOX_ROOT) : defaultMailboxRoot;`. Backward-compatible: env vars absent → behaviour unchanged. |

**Non-changes**:

- `dashboard/server.js` non-agent path `GET /api/messages` at `:47-70` — does NOT mark `received_at` (never did), unchanged.
- `scripts/mailbox-lib.mjs:markMessageReceived` function body — unchanged, stays idempotent (only stamps if absent).
- `scripts/supervisor.mjs` — does not call `markMessageReceived`, unchanged.
- `dashboard/src/App.jsx` — no client change; `received_at` semantics from UI perspective remains «has the recipient ack'd» — stays correct once backend is fixed.
- Existing letters with potentially-false `received_at` — NOT rewritten. The mark is already in frontmatter; we have no reliable way to tell which are genuine vs. bogus, and rewriting history would break ordering and trust. The fix is forward-only.
- Bucket-filter output when listing — `list --bucket to-codex` still shows Codex's pending messages (visibility preserved); it just stops marking them.

**Total estimated touch**: 3 files + 3 new/refactored helper functions + env-override scaffolding = ~130-170 LOC net. Codex confirmed round 1 «one commit fine once base-state clean»; we stay single-commit for Stage 6 code. Separate prerequisite chore commit for `.gitattributes` already landed — see §7.

## 3. Expected behaviour after fix

| Scenario | Current behaviour (buggy) | Fixed behaviour |
|---|---|---|
| Claude runs `mailbox.mjs list --bucket all --project workflow` | All pending in `to-claude` + `to-codex` get `received_at` | Only `to-claude/*.md` pending get `received_at`; `to-codex/*.md` untouched |
| Claude runs `mailbox.mjs list --bucket to-codex --project workflow` | `to-codex` pending get `received_at` | `to-codex` pending LISTED but NOT marked |
| Codex runs the same list commands | Same problem mirrored | Only `to-codex` marks; `to-claude` untouched |
| Claude runs `mailbox.mjs reply …` targeting a `to-claude` letter (normal case) | Marks target + archives + writes outgoing | Same — all steps proceed; `boundAgent === "claude" === targetMessage.to` |
| Claude runs `mailbox.mjs reply …` targeting a `to-codex` letter (wrong-direction — Claude replying to letter not addressed to Claude) | Marks target + archives target + writes outgoing letter (BUG — Claude silently closes Codex's inbox item) | **Rejected** with `ClientError(64, "reply target bucket owned by <to>, cannot reply as <boundAgent>")`. No state mutation. |
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

The Stage 6 code commit is a single commit touching 3 files (`scripts/mailbox-lib.mjs`, `scripts/mailbox.mjs`, `dashboard/server.js`). `git revert <stage-6-sha>` locally reverts just that commit and restores the over-eager marking + permissive wrong-direction reply.

The prerequisite chore `fea959e` (`.gitattributes` + renormalization) is intentionally LEFT in place on rollback — the LF-normalization is repo hygiene, independent of Stage 6. If a full return to the pre-prerequisite state is required for an unrelated reason, a separate `git revert fea959e` also lands.

Pushing either revert to `origin/master` requires an explicit user command per Rule #11 — not implied by this document. No data migration to undo.

## 6. Connection to the broader mailbox-read discussion

Separately (user 2026-04-23 thread): «as a tool-level thing — how to make Read tool not see the letter body?». My answer there was «real fix = separate body from metadata on disk». That's a bigger refactor (~200-300 LOC, 4+ files) and a different concern entirely. This Stage 6 fixes only the wrong-direction marking bug; it does NOT prevent filesystem `Read` of letter bodies. If you later decide to pursue the body-separation refactor, it layers cleanly on top of this fix.

## 7. Prerequisite chore: `.gitattributes` LF normalization

**Landed** as commit `fea959e` on `master` (pre-v3 docs). Adds `.gitattributes` with `* text=auto eol=lf` + explicit binary markers; `git add --renormalize .` touched only the 2 v3 docs themselves (other tracked files already LF). Removes the cross-client CRLF dirty-tree perception Codex saw on rounds 1-2. Independent of Stage 6 code; not reverted on Stage-6 rollback.

## 8. Revision trail

- **v1** (commits `6c347e5`): initial package. Under-scoped reply path; hard-coded test plan.
- **v2** (commit `a11937a`): Codex round-1 fixes — base-SHA, `resolveCallerSession` extraction, fixture-based ACs attempt, reply-mark guard (too weak).
- **v3** (commits `fea959e` + `f9a3cd1`): Codex round-2 fixes — `.gitattributes` LF normalization, reply `ClientError` rejection (not pass-through), env-override scaffolding, AC-11 auth shape fix.
- **v4** (commit `e334c55`): Codex round-3 fixes — CLI-child-process-only AC invocation (helper-export dropped), `-report.md` template added, v1/v2 text sweep, rollback text matches actual multi-commit plan, AC-6 rewritten without `git stash`.
- **v5** (this revision): Codex round-4 fixes — AC-7..10 CLI invocation uses absolute `SCRIPT` path instead of relative `scripts/mailbox.mjs` (the fixture cwd has no `scripts/` tree); report-template base-ref unpinned from `f9a3cd1`; Version label bumped to 5; duplicate `§2.4 dashboard/server.js` resolved (single §2.5 server.js, §2.4 env-overrides).
