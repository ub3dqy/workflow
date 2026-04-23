# mailbox-received-at-caller-scope — Execution report (template, pre-exec)

**Stage**: 6. **Commit**: TBD (landed after Codex greenlights the v4 planning package).
**Branch**: `master` → `origin/master` via explicit user `комит и пуш` command (Rule #11).
**Executor**: Claude. **Report mode**: template scaffolded pre-exec per Codex round-3 blocker 2; filled post-exec with real probe output.

---

## 0. Status

**Pre-exec**: all sections below are placeholders. Filled during Stage 6 execution on top of approved planning-audit v4 (`f9a3cd1` or later).

Sections will be populated in this order when exec begins:

1. §1 — `git show <stage-6-sha> --stat` (from real commit).
2. §2 — file-by-file role (3 files: `scripts/mailbox-lib.mjs`, `scripts/mailbox.mjs`, `dashboard/server.js`).
3. §3 — probe raw output (V1..V11 aligned with ACs).
4. §4 — AC status table (AC-1..AC-20 per planning-audit §3.1).
5. §5 — known unknowns actually discovered during exec.
6. §6 — rollback if material defect surfaces.

## 1. git diff --stat

*TBD: captured at exec-time from `git show <stage-6-sha> --stat`.*

## 2. File-by-file role

*TBD: 3-row table — `scripts/mailbox-lib.mjs` (new `resolveCallerSession` internal, refactored `resolveCallerProject` thin wrapper, new `resolveCallerAgent` export, env-aware `port` + `defaultMailboxRoot`), `scripts/mailbox.mjs` (env-aware `runtimeRoot`, `handleList` caller-scope, `handleReply` reject wrong-direction), `dashboard/server.js` (env-aware `mailboxRoot`/`runtimeRoot`/`port`, `/api/agent/messages` caller-scope).*

## 3. Probes (raw output)

All probes run post-exec from the `tmp-probe-stage6.mjs` driver (see planning-audit §3.0) and the live dev-server. Each block captures literal stdout/stderr, not a summary.

### V1 — commit metadata
*TBD*

### V2 — helper shape (AC-1)
*TBD — shows `typeof resolveCallerAgent === "function"` and `typeof resolveCallerSession === "undefined"`.*

### V3 — helper-lookup matrix (AC-2..AC-5)
*TBD — 4 invocations, 4 expected returns.*

### V4 — `resolveCallerProject` equivalence (AC-6)
*TBD — known-input known-output assertion.*

### V5 — CLI `list` fixture: Claude does not mark `to-codex` (AC-7)
*TBD — spawnSync raw output + post-call frontmatter dump.*

### V6 — CLI `list` fixture: Claude marks `to-claude` (AC-8)
*TBD — same shape, opposite bucket.*

### V7 — CLI `reply` same-direction full flow (AC-9)
*TBD — spawnSync + archive check + outgoing-letter check.*

### V8 — CLI `reply` wrong-direction reject (AC-10)
*TBD — spawnSync exit 64 + stderr pattern match + zero-mutation frontmatter dump.*

### V9 — server agent-messages per agent role (AC-11..AC-13)
*TBD — 3 HTTP calls with 3 fixture sessions.*

### V10 — non-agent server path no-mark (AC-14)
*TBD — HTTP call, post-call frontmatter dump.*

### V11 — vite build + prod server restart (AC-16 + AC-17)
*TBD — `npx vite build` output + `npm run dev` restart + `curl /api/messages` 200.*

### V12 — PD scan (AC-19)
*TBD — CI parity grep, exit 1.*

### V13 — fixture cleanup (AC-20)
*TBD — `ls E:/tmp/stage6-probe-*` → absent.*

## 4. Acceptance Criteria status

*TBD: table mirrors planning-audit §3.1. Each row: AC id, description (brief), probe ref, ☑/☒ with timestamp + probe section ref.*

## 5. Known unknowns (filled post-exec)

*TBD — anything that surfaced during exec but didn't fit any AC: timing quirks, environment-specific notes, leftover doubts.*

## 6. Rollback (invoked only if §4 shows a PASS→FAIL later)

*TBD or N/A. If the post-push smoke reveals a defect, `git revert <stage-6-sha>` is the single-commit recovery; push requires explicit user command.*

## 7. Handoff to Codex

This report file, once filled, + the updated mailbox letter referencing the exec SHA, go to Codex in the same thread. Codex authors `docs/codex-tasks/mailbox-received-at-caller-scope-work-verification.md` as the closing artifact.
