# Paperclip P1 — Task Queue Foundation — Planning Audit

**Plan**: `docs/codex-tasks/paperclip-p1-task-queue.md`
**Report template**: `docs/codex-tasks/paperclip-p1-task-queue-report.md`
**Architecture parent**: `docs/codex-tasks/paperclip-pivot-architecture-plan.md` (approved R4 clean)
**Planner**: Claude
**Date**: 2026-04-20
**Baseline**: HEAD=`94c6749`
**Version**: v1

---

## §0 Meta-procedure

Canonical procedure: `claude-plan-creation-procedure.md` v1 (NO-STOP DISCIPLINE).

Inputs:
- Architecture plan `paperclip-pivot-architecture-plan.md` §6 P1 canonical schema + state machine (approved R4).
- Existing Phase A supervisor state pattern (atomic writeFile + rename).
- Existing dashboard server.js endpoint patterns.
- Existing dashboard UI React component patterns.

### P1 scope (from architecture §6 P1)

**Deliverable**: persistent task queue with atomic checkout + rich schema supporting real ping-pong loop. **No adapter integration** (P2+) — queue storage + CRUD + UI list only.

**Specifically**:
1. `tasks.json` в `mailbox-runtime/` с canonical schema (14 fields + state enum из 8).
2. supervisor.state +`taskRegistry` Map + persistTasks() + load on start.
3. supervisor methods: `addTask`, `transitionTask` (guarded precondition check), `listTasks`, `getTask`, `stopTask`.
4. Dashboard endpoints: POST /api/tasks (create), GET /api/tasks (list), GET /api/tasks/:id (detail), POST /api/tasks/:id/stop.
5. Dashboard UI «Tasks» section: read-only list + state badge + iterations counter.
6. Spec update: architecture plan reference + Task Queue section.

**Out of scope** (future phases):
- Adapter interface + mock (P2).
- Orchestrator loop logic (P3).
- Real agent spawn (P4).
- Coordinator restart recovery для in-flight tasks (P5+).

---

## §1 MCP + Skill selection

| Tool | Purpose | Priority |
|------|---------|----------|
| `plan-audit` skill | Step 10 audit loop | mandatory |
| Existing patterns | Phase A persistSessions/persistPendingIndex/persistHealth atomic writeJson | reuse verbatim |
| Wiki reads | reused from architecture plan (no new fetch) | — |
| `security-audit` | skip — tasks add (create/list/stop), no auth boundary |

---

## §2 MCP readiness verification

| Probe | Status |
|-------|--------|
| `plan-audit` | deferred to Step 10 |
| supervisor.mjs export pattern verified | ✅ Phase A+B+C committed, `return {router, start, stop, state}` |
| Dashboard existing endpoints pattern | ✅ server.js routes verified |
| Runtime state pattern | ✅ sessions.json + pending-index.json + supervisor-health.json existing |

---

## §3 Files read during planning

| File | Lines | Key findings |
|------|-------|--------------|
| `dashboard/supervisor.mjs` | 206 | state={sessions, pendingIndex, supervisorHealth}. persistSessions/Index/Health pattern atomic. Add `state.taskRegistry: Map` + `persistTasks()` следуя той же pattern. |
| `dashboard/server.js` | 305 | agentRouter для /api/agent/*, main app for /api/messages /api/archive /api/notes /api/runtime. Add new top-level `/api/tasks` routes. |
| `dashboard/src/api.js` | 82 | `fetchMessages`, `archiveMessage`, `postNote`, `fetchAgentMessages`, `fetchRuntimeState`. Pattern: parseJsonResponse helper. Add `fetchTasks`, `createTask`, `fetchTask`, `stopTask`. |
| `dashboard/src/App.jsx` | 1781 | Runtime panel (Phase A), mailbox list, project filter. Add Tasks panel near runtime or below. |
| `.gitignore` | 17 | `mailbox-runtime/` already covers tasks.json (no change needed). |
| `local-claude-codex-mailbox-workflow.md` | 881 | Has Phase A/B/C sections. Add P1 section «Task Queue». |
| Architecture plan §6 P1 | — | Canonical task schema + state machine + state transition guards. |

---

## §4 Official docs fetched

Not applicable для P1 — reuses existing Node + Express + React patterns from workflow repo. Architecture plan approved уже references paperclip reference.

---

## §5 AST scans + commands run

| Command | Output |
|---------|--------|
| `wc -l` | server.js=305, supervisor.mjs=206, App.jsx=1781, api.js=82, .gitignore=17, spec=881 |
| `git log --oneline -3` | `94c6749 revert(mailbox): remove broken Stop hook` / `e497ef6 Phase C` / `f2e76ee Phase B` |
| `grep persistSessions\|persistPendingIndex\|persistHealth в supervisor.mjs` | 3 patterns at L115/L122/L129 — model для persistTasks |

---

## §6 Empirical tests

Not applicable для P1 planning — feasibility verified через Phase A atomic pattern reuse. Test coverage идёт в verification phase §7 plan.

---

## §7 Assumptions + verification status

| Claim | Evidence | Status |
|-------|----------|--------|
| supervisor.state extension c new Map не ломает existing handlers | Phase B/C/D pattern proved state shape extensions backward-compatible | ✅ reasoned |
| atomicWriteJson reuse safe для tasks.json | Phase A verified atomic rename cross-OS | ✅ |
| Dashboard UI can add Tasks panel without breaking existing layout | Phase A runtimePanel pattern extensible | ✅ reasoned |
| tasks.json file size bounded для low-QPS user | Single user, ~10 tasks concurrent max | ✅ reasoned |
| State machine guards prevent invalid transitions | P1 Change defines guarded transitionTask | ✅ design-mandated |
| No secret values в tasks (instruction = user text) | User provides instruction plain; no token fields | ✅ |

---

## §8 plan-audit skill invocation

### Round 1 — 2026-04-20

Invocation: `Skill({plan-audit})` on plan + audit files. Score: **10/10** ✅.

- Ссылки: 0/10 ошибок (baseline files + HEAD + architecture parent + existing helpers all verified).
- Rules/rails: all соблюдены; architecture §1.0 coordinator-owned commitment honored; memory isolation followup preserved.
- Blast radius: tight — state extension additive, endpoints unique prefix, no adapter logic leak.
- Полнота: pre-flight P1-P5 + V1-V11 (5-probe empirical CRUD) + Phase 2/3 + rollback + discrepancy 9 conditions + self-audit 15-item.
- Реализуемость: patterns reused from Phase A verbatim, no new deps, scope disciplined.

0 findings, ready для Codex adversarial review.

### Round 2 — Codex adversarial review (2026-04-20)

Codex нашёл 2 findings:

- **F1 important** — transitionTask guards проверяли только (a) state в enum, (b) terminal lock. Но nonsensical transitions `pending → resolved` / `launching → stopped` без explicit policy не rejected. Acceptance/audit wording переобещал «state machine guards validate invalid transitions». Fix: added explicit `ALLOWED_TRANSITIONS` allow-list map по state; transitionTask validates `next ∈ ALLOWED_TRANSITIONS[current]` или throws `illegal transition X → Y`. V9f probe добавлен (attempts pending→resolved, expects rejection).
- **F2 important** — tasks.json не содержал `schemaVersion` field. Plan сам задавал question про schema robustness при P2+ evolution. Fix: `TASK_SCHEMA_VERSION = 1` constant + `schemaVersion` field в task object (set в `addTask`); restore logic checks version и skips incompatible entries (с error log); comment про future migration hook. V9e expanded — проверяет schemaVersion=1 в persisted task.

Applied inline.

### Round 3 — Codex adversarial review (2026-04-20, post-R2)

Codex: «Re-review clean. Новых findings по P1 plan у меня больше нет. Allow-list переходов и schemaVersion закрыли оба реальных риска; scope storage-only остался чистым. План можно считать готовым к показу пользователю и, если он согласен, к исполнению.»

Plan approved. Total rounds: R1 in-session + R2-R3 Codex adversarial (F1-F2 applied inline). Ready для execution delivery.

---

## §9 Delta from architecture approved state

Architecture plan не меняет code yet. P1 = first executable phase. Delta:
- +`dashboard/supervisor.mjs` — extend state + add persistTasks + task methods
- +`dashboard/server.js` — 4 new endpoints (/api/tasks × 4)
- +`dashboard/src/api.js` — 4 new fetch wrappers
- +`dashboard/src/App.jsx` — Tasks panel section + translations
- +`local-claude-codex-mailbox-workflow.md` — Task Queue section

No changes к scripts/, agent-mailbox/, .gitignore (tasks.json auto-covered by mailbox-runtime/).

Scope: **4 modifications** (frontend + backend shared via supervisor). Medium scope, tightly contained.

---

## §10 Known gaps (honest flags)

### Gap G1 — No adapter integration yet

P1 purely storage layer. Task создание через API/UI без real agent launch. P2 добавит adapter interface, P3 orchestrator fires on task state changes.

### Gap G2 — Stop action limited в P1

POST /api/tasks/:id/stop изменяет state → `stopped` + stopReason=`user-stop`, но нет actual process kill (no adapter). P4 добавит real process termination.

### Gap G3 — No task priority / ordering

Tasks list в порядке creation. P3+ добавит orchestrator-side prioritization если нужно.

### Gap G4 — Single project per task

Task имеет field `project` single value. Cross-project tasks не supported (rail #3 invariant).

### Gap G5 — No task deletion endpoint

Only create + stop. Completed/failed tasks остаются в tasks.json. Cleanup policy — P5+ concern (archive or TTL).

### Gap G6 — maxIterations hardcoded default 10

Configurable через API optional field `maxIterations`. Env override / global default config — P5+.

---

## §11 Signature

Planner: Claude
Date: 2026-04-20
Procedure: `claude-plan-creation-procedure.md` v1
Baseline: HEAD=`94c6749`
Input: architecture plan approved + existing Phase A-C infrastructure
Status: **skeleton (Step 2 complete)** → Steps 3-11 proceeding per NO-STOP DISCIPLINE
