# Paperclip Mailbox Resolution — Planning Audit

**Plan**: `docs/codex-tasks/paperclip-mailbox-resolution.md`
**Report template**: `docs/codex-tasks/paperclip-mailbox-resolution-report.md`
**Architecture parent**: approved R4
**P3 parent (orchestrator)**: commit `e884a03`
**P4b parent (last merge)**: commit `274a62a`
**Planner**: Claude
**Date**: 2026-04-20
**Baseline**: HEAD=`274a62a`
**Version**: v1

---

## §0 Meta-procedure

Canonical procedure: `E:/Project/memory claude/memory claude/docs/claude-plan-creation-procedure.md` v1 (NO-STOP DISCIPLINE).

### Goal

Close P3-R2 F5 honest downgrade: mailbox resolution break condition was deferred из P3 orchestrator (orchestrator.mjs has no path к `resolved` terminal state; только max-iter/failed/stopped reachable). Closes last architectural gap из architecture plan §6 P3 scope.

### Scope

**Deliverables**:
1. NEW `supervisor.isThreadResolved({thread, project, since})` async helper (F1 post-Codex-R1 added `since` pivot parameter) — reads `agent-mailbox/archive/<thread>/*.md` via existing `readBucket("archive", mailboxRoot)` + `normalizeProject`, returns `true` если any archived message матчит thread+project с `resolution` in `{answered, no-reply-needed, superseded}` AND `archived_at > since` (F3 post-R2 — legacy rows без valid `archived_at` explicitly excluded).
2. Modify `dashboard/orchestrator.mjs` `handleTaskTick` `awaiting-reply` branch — before `findReplyInPendingIndex`, check `await supervisor.isThreadResolved(...)`; on true transition task к `resolved` state с `stopReason: "thread-resolved"`.
3. Modify `dashboard/supervisor.mjs` exports — add `isThreadResolved` к return object.
4. Modify `local-claude-codex-mailbox-workflow.md` — append «Thread Resolution (paperclip mailbox-resolution)» spec section.

**Out of scope**:
- Change к ALLOWED_TRANSITIONS (уже allows `awaiting-reply → resolved` + `handing-off → resolved` — verified L175-191 supervisor.mjs).
- TASK_SCHEMA_VERSION bump (schema не меняется, только state graph behaviour).
- Cache/memoization of archive scan — for P3c scope keep simple polling (supervisor pollTick cadence 3s acceptable).
- Resolution signal propagation через dashboard UI — тasks panel уже показывает `state=resolved` через existing task schema.
- Resolution detection для `handing-off` state — adapter handoff window short; add same check would need care about mid-handoff transitions. Keep out of scope (honest gap G1).

---

## §1 MCP + Skill selection

| Tool | Purpose | Priority |
|------|---------|----------|
| `plan-audit` skill | Step 10 mandatory | deferred |
| Existing `scripts/mailbox-lib.mjs` `readBucket("archive")` + `readMessage` | archive parsing with `resolution` frontmatter extraction | reuse verbatim |
| Existing `scripts/mailbox-lib.mjs` `validateResolution` | set of valid resolution values (answered, no-reply-needed, superseded) | reuse |
| `dashboard/supervisor.mjs` / `orchestrator.mjs` / `mailbox-lib.mjs` | reads to confirm contracts | verbatim code reference |

---

## §2 MCP readiness verification

| Probe | Result |
|-------|--------|
| Read `scripts/mailbox-lib.mjs` L380-466 | ✅ `readBucket("archive", mailboxRoot)` returns parsed messages with `resolution`, `thread`, `project` fields (L402-403, 395-400) |
| Read `dashboard/supervisor.mjs` L155-192 | ✅ TASK_STATES includes `resolved`; ALLOWED_TRANSITIONS `awaiting-reply → resolved` и `handing-off → resolved` already allowed; no schema change needed |
| Read `dashboard/orchestrator.mjs` L120-130 | ✅ `awaiting-reply` branch hooks cleanly before `findReplyInPendingIndex` — minimal diff insertion |
| `plan-audit` skill | deferred Step 10 |

---

## §3 Files read during planning

| File | Lines | Purpose |
|------|-------|---------|
| `scripts/mailbox-lib.mjs` | readBucket/readMessage/validateResolution | archive parsing contract |
| `dashboard/supervisor.mjs` | 155-192 | state graph + ALLOWED_TRANSITIONS |
| `dashboard/orchestrator.mjs` | 78-170 | handleTaskTick awaiting-reply branch insertion site |
| `dashboard/server.js` | existing imports | ensure no new wiring needed (supervisor.setOrchestrator already set; isThreadResolved exported naturally) |
| `docs/codex-tasks/paperclip-p3-orchestrator-planning-audit.md` Gap G1 | F5 post-R2 rationale | closure source |
| `docs/codex-tasks/paperclip-pivot-architecture-plan.md` §6 P3/P5+ | scope alignment | no scope creep to P5+ |

---

## §4 Official docs fetched

Not applicable — pure internal refactor using already-committed primitives (mailbox-lib, supervisor state machine).

---

## §5 AST scans + commands run

| Command | Key output |
|---------|------------|
| `git rev-parse HEAD` | `274a62a` |
| `wc -l` | supervisor.mjs=439 (P4b baseline), orchestrator.mjs=271, mailbox-lib.mjs known, spec=969 |
| Grep `ALLOWED_TRANSITIONS.*resolved` supervisor.mjs | confirmed `awaiting-reply → resolved` allowed L183 + `handing-off → resolved` L187 |
| Grep `readBucket` mailbox-lib.mjs | function L424 — uses `collectMarkdownFiles(bucketRoot, config.recursive)`; archive recursive true per bucketConfig |
| Grep `validateResolution` mailbox-lib.mjs | L261 — valid set: `answered`, `no-reply-needed`, `superseded` |

---

## §6 Empirical tests

Not applicable для plan authoring. Behavior validated Phase 1 via stubbed archive filesystem + Phase 2 real archive via mailbox CLI.

---

## §7 Assumptions + verification status

| Claim | Evidence | Status |
|-------|----------|--------|
| `readBucket("archive", mailboxRoot)` returns parsed array с `resolution`/`thread`/`project` fields | mailbox-lib.mjs L380-446 | ✅ docs-verified |
| `resolution` valid set is `{answered, no-reply-needed, superseded}` | validateResolution L261-268 | ✅ |
| Archive directory structure: `agent-mailbox/archive/<thread>/<filename>.md` | mailbox-lib.mjs L621 `archiveDirPath = path.join(mailboxRoot, "archive", thread)` | ✅ |
| `supervisor.transitionTask(id, 'resolved', {...})` from `awaiting-reply` legal | ALLOWED_TRANSITIONS L178-184 | ✅ |
| `supervisor.transitionTask` sets `resolvedAt` automatically when TERMINAL_STATES reached | supervisor.mjs L290-291 | ✅ |
| Polling archive on every pollTick не drain'ит FS — typical archive size small (<100 messages per thread) | empirical assumption | ⚠️ acceptable for P3c scope; cache может быть добавлен post-P5+ если measurement shows overhead |
| Orchestrator's serial-task invariant means only one `isThreadResolved` call per task tick | P3 design | ✅ |
| supervisor runs в same process as orchestrator — async helper inherits supervisor's existing `mailboxRoot` closure var | supervisor.mjs factory signature | ✅ |
| normalizeProject ensures task.project matches archive message.project format | mailbox-lib normalizeProject | ✅ |
| Archive read-only — helper doesn't mutate files | readBucket is read-only | ✅ |

---

## §8 plan-audit skill invocation

### Round 1 — 2026-04-20

Invocation: `Skill({plan-audit})`. Score: **10/10** ✅ (0 critical, 0 important, 3 optional). All 5 dimensions full points — scope tight, primitives verified в baseline grep, honest G1-G6 gaps flagged, V-probes empirically cover answered/legacy/invalid/cross-project fixtures.

Optional polish applied inline:
- **O1**: Change 1 import note reworded — «No new import needed» с ref к baseline grep (supervisor.mjs L5-6 already has `readBucket` + `normalizeProject`).
- **O2**: Change 1 export list expanded to actual factory return `{router, start, stop, state, addTask, setOrchestrator, transitionTask, stopTask, listTasks, getTask, persistTasks}` (supervisor.mjs L426-438).
- O3 (V9 multi-message fixture edge) skipped — current V9 sufficient; edge case для Phase 2 empirical.

Plan ready for Codex adversarial delivery (Step 11).

### Round 2 — 2026-04-20 (Codex adversarial)

Invocation: mailbox reply `2026-04-20T18-45-32Z-codex-001`. Findings:

- **F1 (blocker) — stale-thread-reuse false-resolve**: baseline `addTask()` не enforce'ит unique thread slugs per project. If thread `feature-x` was used by Task A (archived с resolution=answered), и later reused by Task B — Task B's first awaiting-reply tick would find Task A's archived row → false-resolve Task B без any work done. **Fix applied**: `isThreadResolved({thread, project, since})` — добавлен `since` timestamp filter; caller (orchestrator) passes `since: task.createdAt`; archive messages с `archived_at <= since` excluded. V13 probe added (new; renumbers PD=V14 / whitelist=V15). **Superseded by F3 post-R2** — initial R1 narrative claimed «legacy archive rows без archived_at fall through к excluded branch safely», которое на самом деле было inverted (fell through к true). Corrected в R3 с explicit `if (!message.archived_at) return false` branch.
- **F2 (medium) — report template stale import checkbox**: report §1 Change 1 still expected import change, но plan (post-R1 O1) says no import needed. **Fix applied**: report §1 Change 1 first checkbox reworded «No import change needed — readBucket + normalizeProject already в baseline L5-6». Also added `since: task.createdAt` checkbox к Change 2.

Both applied inline. R3 — pending Codex re-review.

### Round 3 — 2026-04-20 (Codex adversarial)

Invocation: mailbox reply `2026-04-20T18-54-32Z-codex-002`. 2 findings:

- **F3 (blocker) — since-guard logic bug**: my R1 fix had inverted branch: `if (sinceMs != null && message.archived_at) { … return false на stale }; return true`. When `archived_at` missing под non-null since → outer `if` false → fell through к `return true` — legacy archive rows treated as «recent» by default. Contradicted rationale text. **Fix applied**: restructured — `if (sinceValid) { if (!message.archived_at) return false; ... }` — explicit exclude for missing/invalid archived_at under non-null since. Rationale text corrected: «Legacy archive rows без valid archived_at field excluded explicitly (F3 post-R2 fix) — no fall-through к default-true».
- **F4 (medium) — Change 3 spec signature stale**: spec text still showed `{thread, project}` signature, missed `since` parameter + pivot requirement. **Fix applied**: spec «Thread Resolution» section updated к `{thread, project, since}` signature + mentions F1 post-R1 pivot rationale + F3 post-R2 explicit legacy exclude.

Both applied inline. R4 — pending Codex re-review.

### Round 4 — 2026-04-20 (Codex adversarial)

Invocation: mailbox reply `2026-04-20T19-19-22Z-codex-003`. 0 blockers, 2 stale docs medium:

- **F5 (medium) — planning-audit §0 + §9 still showed old `{thread, project}` signature**. **Fix applied**: §0 deliverable list + §9 delta bullet rewritten к `{thread, project, since}` с F1+F3 cross-refs.
- **F6 (medium) — report §6 self-audit numbering stale after V13→stale-thread / V14→PD / V15→whitelist renumbering**. **Fix applied**: report §6 items 6-8 fixed, items 9-16 renumbered (+1 shift); threshold bumped к ≥14/16; plan §10 also synced к same numbering.

Both applied. R5 — pending Codex re-review.

### Round 5 — 2026-04-20 (Codex adversarial)

Invocation: mailbox reply `2026-04-20T19-34-59Z-codex-004`. 0 blockers, 2 more stale doc refs caught:

- **F7 (medium) — plan §9 STOP checkpoints pre-renumber labels**: items 9/10 still said «V13 PD hit», «V14 whitelist drift». After R2 renumbering V13=stale-thread empirical, V14=PD, V15=whitelist. **Fix applied**: plan §9 items 9/10 updated к V14 PD / V15 whitelist.
- **F8 (medium) — planning-audit §8 R2 narrative pre-F3 claim**: Round 2 F1 bullet said legacy rows без archived_at «fall through к excluded branch safely» — the inverted-logic claim that R3 F3 later disproved. **Fix applied**: R2 F1 bullet extended с «Superseded by F3 post-R2» note explaining что initial narrative was wrong; corrected в R3 с explicit `if (!message.archived_at) return false` branch. Audit trail теперь internally consistent.

Both applied. R6 — pending Codex re-review.

### Round 6 — 2026-04-20 (Codex adversarial)

Invocation: mailbox reply `2026-04-20T19-39-53Z-codex-005`. 0 blockers, 1 medium stale status footer:

- **F9 (medium) — planning-audit §11 status footer stale**: still said «skeleton+draft (Step 2-9 in progress) → Step 10 plan-audit loop next» despite file already documenting completed R2-R5 adversarial rounds. **Fix applied**: footer reworded к «audit-clean post R1-R5 adversarial loop (Step 2-10 complete) → Step 11 execute handoff ready (post-F8 audit trail internally consistent)».

Applied. R7 — pending Codex re-review.

### Round 7 — 2026-04-20 (Codex adversarial)

Invocation: mailbox reply `2026-04-20T19-49-49Z-codex-006`. Response: **«R7 complete. I do not currently have another finding on the package. From my side the plan/audit/report set is now clean enough for execute handoff.»**

Adversarial loop closed. R1 (plan-audit skill self) + R2-R7 Codex adversarial. Total 9 findings (F1 blocker F2 medium / F3 blocker F4 medium / F5-F6 medium / F7-F8 medium / F9 medium) applied inline across rounds. Audit trail internally consistent; Gap G7 stale-thread-reuse resolved in-plan.

**Final**: execute-ready.

---

## §12 Post-execution addendum (F10 — 2026-04-20)

After Codex applied plan verbatim и reported V1-V15 PASS, Claude's independent verification (rule #3) ran V9-V13 empirical probes через WSL — V9 (answered-resolves) returned **false** when true was expected; V10-V13 passed coincidentally because they expected false outputs.

**Root cause**: plan/implementation referenced `message.archived_at` as top-level field, but `scripts/mailbox-lib.mjs readMessage()` (L380-422) parses `archived_at` into `message.metadata.archived_at` only — no top-level promotion. sinceValid branch therefore received `undefined` → always excluded → V9 genuine-recent-resolved fixture failed. Plan spec had pre-existing blind spot (readMessage output shape wasn't fully audited during §3 research phase) — not a Codex execution error.

**Fix applied**: supervisor.mjs isThreadResolved line 342 — `const archivedRaw = message.archived_at || message.metadata?.archived_at;` — dual-read falls back к metadata. Plan Change 1 code sample synchronously updated с same correction (+comment «F10 post-exec fix»).

**Re-verify**: V9-V13 all PASS post-fix (V9 answered-resolves ✓, V10 legacy-empty ✓, V11 invalid-resolution ✓, V12 cross-project ✓, V13 stale-archive-blocked ✓).

Lesson reinforced: `readMessage()` top-level fields ≠ raw frontmatter. Future helpers reading archive metadata must dual-read `field || metadata.field` OR add explicit top-level promotion к readMessage. Out-of-scope для this handoff (mailbox-lib.mjs locked); noted как future improvement candidate.

---

## §9 Delta from P4b

- P4b delivered: CodexAdapter + three-way env gate + P4 family closure.
- Mailbox-resolution adds:
  - NEW supervisor helper `isThreadResolved({thread, project, since})` (F1 post-R1 added pivot; F3 post-R2 explicit legacy exclude).
  - Modify orchestrator `awaiting-reply` branch: pre-reply resolution probe — passes `since: task.createdAt`.
  - Modify spec: «Thread Resolution» section.
- NO changes:
  - agent-adapter.mjs / mock-adapter.mjs / claude-code-adapter.mjs / codex-adapter.mjs (adapter contract stable).
  - orchestrator.mjs state graph — only insertion point, no state additions.
  - supervisor.mjs state graph — ALLOWED_TRANSITIONS already allows `awaiting-reply → resolved`.
  - tasks schema — unchanged.
- Scope: **0 new files + 3 M (supervisor.mjs + orchestrator.mjs + spec) + 3 handoff artefacts**.

---

## §10 Known gaps (honest flags)

### Gap G1 — `handing-off` state not covered

Resolution check gated к `awaiting-reply` branch only. `handing-off` is short-lived transitional state — adding check here requires careful handoff-window semantics (what if resolution signal arrives mid-adapter-spawn?). For scope minimality: only `awaiting-reply` branch. Future P5+: extend к `handing-off` если needed.

### Gap G2 — Archive polling overhead

supervisor pollTick runs every 3 seconds; each tick с active awaiting-reply task triggers `readBucket("archive", mailboxRoot)` full-scan. For typical workflow archive (<200 messages), this is O(ms) — acceptable. For large archives (1000+ messages), could become noticeable. Mitigation options (P5+): (a) thread-scoped subdirectory listing instead of whole archive, (b) cache с invalidation via fs.watch. Honest flag — not blocking.

### Gap G3 — Race condition: resolution signal arrives between two ticks

If mailbox archive receives answered message at tick T, и next pollTick fires at T+3s, task could hit findReplyInPendingIndex first (if pendingIndex still has старый message) and transition к handing-off before resolution check gets chance. This is consistent с "poll frequency ≤ resolution detection latency" trade-off. Alternative: check resolution inside findReplyInPendingIndex caller path too. For P3c: put check FIRST в awaiting-reply branch so it wins the race when both conditions true same tick.

### Gap G4 — stopReason string

Adapter uses `stopReason: "thread-resolved"` — new constant. Existing stopReason values in codebase: `"user-stop"`, `"adapter-error-threshold"`, `"iterations reached maxIterations"`. Added «thread-resolved» is additive, не требует schema bump. Declared в spec.

### Gap G5 — Archived messages без `resolution` field

Old archive messages pre-dating resolution frontmatter have `resolution: ""` (empty string per readMessage L402-403). `validateResolution` helper validates incoming values; check must filter к `['answered','no-reply-needed','superseded']` set explicitly, NOT «any non-empty resolution», to avoid false-resolve on legacy data.

### Gap G6 — `project` matching

`message.project` uses `normalizeProject` (lowercased). Task `project` stored as-entered (might be case-different). Safe check: normalize both sides before comparison.

### Gap G7 — Stale-thread-reuse false-resolve RESOLVED (F1 post-Codex-R1)

Originally not flagged — Codex adversarial R1 каught: same thread slug may be reused across tasks; stale archive signals would false-resolve new task на first tick. **Fixed in plan**: `isThreadResolved` gets `since` pivot timestamp; orchestrator passes `task.createdAt`; only archive messages с `archived_at > since` trigger resolution. Legacy rows без `archived_at` field excluded safely. V13 probe validates empirically.

---

## §11 Signature

Planner: Claude
Date: 2026-04-20
Procedure: `claude-plan-creation-procedure.md` v1
Baseline: HEAD=`274a62a`
Status: **audit-clean post R1-R5 adversarial loop (Step 2-10 complete)** → Step 11 execute handoff ready (post-F8 audit trail internally consistent).
