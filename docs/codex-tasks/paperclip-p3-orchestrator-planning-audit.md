# Paperclip P3 — Orchestrator Loop — Planning Audit

**Plan**: `docs/codex-tasks/paperclip-p3-orchestrator.md`
**Report template**: `docs/codex-tasks/paperclip-p3-orchestrator-report.md`
**Architecture parent**: approved R4
**P1 parent**: commit `f3d065d` (task queue)
**P2 parent**: commit `836999d` (adapter contract + mock)
**Planner**: Claude
**Date**: 2026-04-20
**Baseline**: HEAD=`836999d`
**Version**: v1

---

## §0 Meta-procedure

Canonical procedure: `claude-plan-creation-procedure.md` v1 (NO-STOP DISCIPLINE).

Inputs:
- Architecture §6 P3 scope: orchestrator watches supervisor.state.pendingIndex + tasks.json → fires adapter calls → break conditions (resolution/max-iter/user-stop).
- P1: task schema + state machine + ALLOWED_TRANSITIONS allow-list (pending/launching/awaiting-reply/handing-off/resolved/failed/stopped/max-iter-exceeded).
- P2: AgentAdapter interface + MockAdapter.
- Existing mailbox pollTick (Phase A supervisor) — reuse for message detection.

### P3 scope

**Deliverables**:
1. NEW `dashboard/orchestrator.mjs` — `createOrchestrator({supervisor, adapter, logger})` factory returning `{processTick, stop}`.
2. Wire orchestrator invocation в supervisor.mjs pollTick (после pendingIndex update + janitor... wait no janitor был Phase D which was reverted).
3. Observability: task transition events в supervisorHealth counters (taskTicksProcessed, taskTransitions, taskCyclesCompleted).
4. Per-turn logic: detect mailbox reply matching task.thread → resume adapter → transition state machine.
5. Break conditions: thread resolution (mailbox message с resolution frontmatter), iterations ≥ maxIterations, task state=stopped.
6. Spec update: «Orchestrator Loop (paperclip pivot P3)» section.

**Out of scope** (future phases):
- Real Claude/Codex adapter implementations (P4).
- Multi-task concurrency beyond naive sequential processing (P5+).
- Coordinator restart recovery для in-flight tasks (P5+).
- UI task timeline / transition history display (P5+).

---

## §1 MCP + Skill selection

| Tool | Purpose | Priority |
|------|---------|----------|
| `plan-audit` skill | Step 10 | mandatory |
| Existing patterns | P1 supervisor task helpers + P2 adapter interface + Phase A pollTick | reuse verbatim |
| Mailbox read | existing readBucket (Phase A) — для reply detection | reuse |

---

## §2 MCP readiness verification

| Probe | Status |
|-------|--------|
| supervisor exports listTasks/transitionTask/getTask/stopTask | ✅ L294/L255/L310/L283 post-P1 |
| supervisor.state.pendingIndex carries project+to+from+thread+relativePath | ✅ Phase A unchanged |
| AgentAdapter interface resolved 8 methods + MockAdapter full impl | ✅ P2 committed 836999d |
| ALLOWED_TRANSITIONS map exists | ✅ P1 exports (через closure в supervisor) |
| `plan-audit` skill | deferred Step 10 |

---

## §3 Files read during planning

| File | Lines | Key findings |
|------|-------|--------------|
| `dashboard/supervisor.mjs` | 414 | task helpers L250+, pollTick L~180, return shape extended. Pattern для orchestrator integration: inject orchestrator.processTick() в pollTick tail после pendingIndex update. |
| `dashboard/server.js` | 355 | supervisor mounted; task endpoints POST/GET/:id/stop. Orchestrator integration transparent для endpoints — они просто читают task state. |
| `scripts/adapters/agent-adapter.mjs` | 142 | AgentAdapter typedef + AGENT_ADAPTER_METHODS + validateAdapter. P3 consumer. |
| `scripts/adapters/mock-adapter.mjs` | 187 | createMockAdapter с full 8 methods. Used в P3 orchestrator tests. |
| Architecture §6 P3 | — | processTick loop + state transitions + 3 break conditions specified. |
| Mailbox reply detection | — | pendingIndex entries have `{to, from, project, thread, relativePath, created, received_at}`. Orchestrator matches task.thread ↔ pending entries. |

---

## §4 Official docs fetched

Not applicable — P3 is internal Node logic using existing supervisor/adapter primitives. No external APIs.

---

## §5 AST scans + commands run

| Command | Output |
|---------|--------|
| `wc -l` | supervisor=414, server=355, App.jsx=1972, api.js=126, adapters=329 total, spec=916 |
| `git log --oneline -3` | `836999d P2 adapter` / `f3d065d P1 task queue` / `94c6749 revert Stop hook` |
| `grep listTasks\|transitionTask в supervisor.mjs` | task helpers present, callable через supervisor.* |

---

## §6 Empirical tests

Not applicable для P3 planning — behavior verified в V-phase §7 plan using MockAdapter.

---

## §7 Assumptions + verification status

| Claim | Evidence | Status |
|-------|----------|--------|
| supervisor.pollTick tail can invoke orchestrator.processTick() | Phase A pattern + P1 additions demonstrate safe tick extension | ✅ reasoned |
| Orchestrator via Node stays OS-agnostic | pure JS logic + supervisor/adapter abstractions | ✅ |
| Mailbox reply detection через pendingIndex thread match | pendingIndex schema confirmed | ✅ verified |
| Max-iterations safety break = task.maxIterations field (P1 existing) | P1 schema has field | ✅ |
| User stop via POST /tasks/:id/stop (P1) — orchestrator respects terminal state | transitionTask guard blocks transitions out of terminal | ✅ verified P1 |
| Thread resolution detection — scan pendingIndex for resolution field OR archive presence | **needs clarification** — resolution typically set when archived via mailbox-lib.mjs; pendingIndex filters status=pending only | ⚠️ GAP G1 — orchestrator может не видеть resolution until next pollTick reads archive |
| MockAdapter interface supports full loop cycle | P2 interface complete, mock callable via adapter.launch/resume/shutdown | ✅ |
| Single orchestrator instance per supervisor | Phase A singleton pattern | ✅ design |

---

## §8 plan-audit skill invocation

### Round 1 — 2026-04-20

Invocation: `Skill({plan-audit})`. Score: **6/10** 🟠 (downgraded from initial 10 due 3 logic bugs в cycle flow).

- **F1 (blocker)** — handoff always `adapter.resume` but newCurrent первый раз не имеет sessionId → mock returns messageAccepted:false silently → orchestrator ignores → state advances без реального invoke. Fix applied inline: `if (!task.sessionIds[newCurrent]) adapter.launch else adapter.resume`. V9c probe enhanced с `hasClaudeSession` assertion.
- **F2 (important)** — `maxIter >= maxIterations` check applied к ANY non-terminal state, но `pending`/`launching` disallow max-iter-exceeded per ALLOWED_TRANSITIONS → illegal transition throw. Fix applied: scope check к `awaiting-reply`/`handing-off` only.
- **F3 (important)** — orchestrator ignored `result.messageAccepted` from `adapter.resume`. Fix applied: resume path checks `!result.messageAccepted` → treat as adapter error via handleAdapterFailure.

All 3 fixed inline before Codex adversarial review.

### Round 2 — 2026-04-20 (Codex adversarial)

Invocation: mailbox reply `2026-04-20T11-39-38Z-codex-001` на thread `paperclip-p3-orchestrator-review`. Findings:

- **F4 (blocker)** — handing-off retry path broken. Task transitions to `handing-off` before adapter handoff, but `handleTaskTick` has branches only for `pending`/`awaiting-reply`. If adapter launch/resume fails below threshold, `handleAdapterFailure` returns without state change, task stays in `handing-off`, subsequent ticks fall through unhandled → task wedged forever; 3-error threshold never reached. **Fix applied inline**: in adapter-failure catch branch, revert `handing-off` → `awaiting-reply` с `prevLastInbound` (saved before transition). Added defensive `handing-off` recovery branch in `handleTaskTick` for post-restart resilience.
- **F5 (important)** — plan regressed canonical P3 break condition. Architecture/audit say P3 includes resolution/max-iter/user-stop, but executable plan explicitly defers mailbox resolution detection к P4. No path to transition into `resolved`. **Fix applied inline — honest downgrade**: §6 spec и §9 out-of-scope marked resolution break deferred к P4. Rationale: pendingIndex only tracks status=pending, archive detection requires separate plumbing. P3 acceptance contract revised to: max-iter-exceeded / failed / stopped (3 of 4 canonical breaks), resolution break scheduled P4 as explicit carryover.
- **F6 (important)** — task/thread correlation unsafe; `thread` still optional in live `addTask` API, but orchestrator matching is entirely thread-based. Empty thread → task cannot correlate к mailbox traffic, or collides с another empty-thread task. **Fix applied inline**: Change 2.5 — `addTask` requires non-empty trimmed string; throws if empty. POST `/api/tasks` existing error middleware wraps в 400.

All 3 applied inline. Round 3 — pending Codex re-review.

### Round 3 — 2026-04-20 (Codex adversarial)

Invocation: mailbox reply `2026-04-20T11-50-09Z-codex-003` (superseded earlier mangled `-002`). Findings:

- **F7 (blocker)** — defensive handing-off recovery branch (added в R2) has logic bug. Branch reverts к `awaiting-reply` без сброса/восстановления `lastInboundMessageId`. `findReplyInPendingIndex` filters `item.relativePath !== task.lastInboundMessageId`, так что reply который triggered original handoff permanently excluded post-restart → task wedges waiting for a different reply that never arrives. Claimed «post-restart resilience» false. **Fix applied inline — remove branch**: defensive recovery branch удалён; orchestrator crash-in-handing-off surfaces as `unhandled-state-handing-off` noop. Proper restart recovery requires persisting `previousLastInboundMessageId` в task schema before handing-off transition → P5+ carryover. §9 out-of-scope updated with explicit F7 deferral note. In-plan comment explains rationale.
- **F8 (bookkeeping)** — V14 added но report/acceptance still referenced `V1-V13` в multiple places (report §2 title, self-audit, acceptance summary) + plan §11 checkpoint + §12 self-audit. **Fix applied inline**: all occurrences updated к `V1-V14`.

Both applied. Round 4 — pending Codex re-review.

### Round 4 — 2026-04-20 (Codex adversarial)

Invocation: mailbox reply `2026-04-20T11-54-18Z-codex-004`. Findings (both doc cleanup, non-executable):

- **F9 (important)** — planning-audit §10 Gap G1 stale. Text still closed with «Decision (plan §6): orchestrator treats message disappearing from pendingIndex AFTER being consumed as resolved via archive» — but F5 downgraded resolution detection out of P3. Audit contradicts executable plan и points Codex at non-existent behavior. **Fix applied inline**: Gap G1 rewritten as «P4 carryover, post-R2 F5» с honest status/consequence/scope sections — explicitly states P3 has no `resolved` path.
- **F10 (important bookkeeping)** — report template §6 self-audit still said «Plan §12 — ≥12/14 required», but checklist has 15 items after Change 2.5 row (F6 post-R2). **Fix applied inline**: updated к «≥13/15 required».

Both applied. Round 5 — pending Codex re-review. Codex указал «после этих двух cleanups у меня новых findings по P3 plan не останется» — expected clean.

### Round 5 — 2026-04-20 (Codex adversarial)

Invocation: mailbox reply `2026-04-20T11-57-27Z-codex-005`. Response: **«R5 clean. Новых findings по P3 plan у меня больше нет.»**

Adversarial review loop closed. Plan готов к execution handoff.

**Final score**: 10/10 (post R1+R2+R3+R4 fixes — F1-F10 all applied inline, R5 clean).

---

## §9 Delta from P2

- P2 delivered: adapter interface + mock + research doc.
- P3 adds:
  - NEW `dashboard/orchestrator.mjs` (factory + processTick + state transition logic)
  - Modify `dashboard/supervisor.mjs` — inject orchestrator invocation в pollTick tail
  - Modify `dashboard/server.js` — wire createOrchestrator с MockAdapter at app startup
  - Modify `dashboard/src/App.jsx` — minimal task state display enhancement (optional, stretch scope)
  - Spec update P3 section
- NO adapter changes (P2 interface stable)
- NO task schema changes (P1 field set sufficient)
- Scope: **1 new file + 2 modifications (supervisor.mjs + server.js) + 1 spec modification** (+ optional App.jsx enhance — explicitly out of scope to lock minimum).

---

## §10 Known gaps (honest flags)

### Gap G1 — Thread resolution detection (P4 carryover, post-R2 F5)

**Status — deferred out of P3.** Initial plan proposed detecting «conversation resolved» by watching messages disappear from `supervisor.state.pendingIndex` (treating archive as implicit resolution signal). R2 F5 honest downgrade rejected this: pendingIndex only tracks `status=pending`, archive detection requires separate plumbing (mailbox-lib archive read + `supervisor.isThreadResolved` helper), and no deterministic design was ready within P3 scope.

**P3 consequence**: orchestrator has no path to transition к `resolved`. Terminal states in P3 are `max-iter-exceeded` / `failed` / `stopped` — 3 of 4 canonical break conditions (architecture §6). Successful conversation completion surfaces indirectly (max-iter reached after productive exchange, or user-stop when satisfied).

**P4 scope**: implement archive-aware resolution detection (options: polling archive for task.thread + resolution frontmatter, or supervisor extension emitting resolution events on archive writes, or task.stopCondition field populated on agent-signalled completion). Plan §9 out-of-scope и spec P3 section both document this deferral.

### Gap G2 — Max-iterations edge cases

`iterations ≥ maxIterations` → transition `max-iter-exceeded`. But iteration increment semantics must be exact: count = number of full Codex↔Claude cycles, or each individual message? Plan decision: count each adapter.launch + each adapter.resume invocation as 1 iteration.

### Gap G3 — Concurrent task processing

Phase P3 minimal: process tasks serially (one awaiting-reply at a time). Multi-task parallel — P5+. Simpler mental model, fewer race conditions.

### Gap G4 — Orchestrator failure recovery

If orchestrator.processTick throws, supervisor pollTick increments tickErrors и continues. Tasks stay in current state. Not ideal — may block progress if adapter throws repeatedly. P3 minimal: log error, mark task failed на 3 consecutive adapter errors. Gap acknowledged — P5+ proper retry/backoff.

### Gap G5 — User stop race

POST /tasks/:id/stop transitions state → stopped while orchestrator.processTick reads same task. Race: orchestrator might overwrite stopped. Mitigation: orchestrator checks task.state before transitionTask; if terminal, skip. TransitionTask guards throw on terminal→X, so even если race, throw is caught safely.

### Gap G6 — Real adapter (P4) divergence

MockAdapter always succeeds + deterministic. Real adapters may timeout, fail mid-message, have stale session. Orchestrator design должен handle these per adapter.classifyCrash categories — but P3 validates на mock только. Real regressions surface в P4.

---

## §11 Signature

Planner: Claude
Date: 2026-04-20
Procedure: `claude-plan-creation-procedure.md` v1
Baseline: HEAD=`836999d`
Input: architecture §6 P3 + P1 task helpers + P2 adapter interface
Status: **skeleton (Step 2 complete)** → Steps 3-11 proceeding per NO-STOP DISCIPLINE
