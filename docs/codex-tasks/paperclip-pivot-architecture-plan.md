# Paperclip-Light Pivot — Architecture Plan (workflow automation vector shift)

**Version**: v1
**Planning-audit**: `docs/codex-tasks/paperclip-pivot-architecture-plan-planning-audit.md`
**Report template**: `docs/codex-tasks/paperclip-pivot-architecture-plan-report.md`
**Baseline**: HEAD=`94c6749` (post-cleanup after Phase D revert + Phase C Stop injection removal)
**Reference**: https://github.com/ub3dqy/paperclip (fetched 2026-04-20)
**Target output**: **architecture plan**, not executable handoff. Plan определяет что/как строить; per-phase executable handoffs будут в отдельных циклах.
**Planner**: Claude (Windows)

---

## §0 Why pivot

Hook-centric automation path (Phase A → D) уперся в design constraint:

- **Stop hook `additionalContext` ignored** per Claude Code docs — original Phase C promise сломана.
- Phase D добавил dedup/persistence поверх broken inject channel — discarded.
- Остались полезные: Phase A dashboard+supervisor, Phase B session-register heartbeat, Phase C `/deliveries` API endpoint.

Pivot: **перенести центр тяжести с hooks на external always-alive coordinator** (paperclip-style). Hooks остаются только как discovery/heartbeat adapter — не как core inject path.

Цель user-facing:
1. User даёт старт.
2. Codex пишет Claude (через mailbox).
3. Claude получает, выполняет, отвечает.
4. Codex получает ответ, продолжает.
5. Цикл идёт без участия user до закрытия задачи.

---

## §1 Primary execution model + what we BORROW from paperclip

### §1.0 Execution model decision (F1 fix post-R1)

**Primary model: coordinator-owned execution**. Coordinator spawns Claude Code + Codex processes programmatically via adapter layer; coordinator manages full lifecycle (launch → inject → monitor → shutdown). This is the only model consistent с user's «hands-off automation» goal (user starts task → cycle proceeds без user keeping windows open).

**NOT primary**: «coordinator only signals pre-existing live user sessions». Phase B session registration + `/api/agent/runtime/deliveries` remain available, но only as **observability/discovery surface** (dashboard status + optional probe для adapters checking если user has manual session open). Core loop does NOT depend on live user-opened sessions — coordinator boots adapters itself.

Это жёсткий выбор до P2: все design decisions принимают «coordinator owns process lifecycle» как invariant. Pre-existing live sessions = bonus discovery data, не required pathway.

### §1.1 Borrow table

| Механика paperclip | Наша реализация |
|--------------------|-----------------|
| **External always-alive coordinator** | Существующий `dashboard/server.js` + `supervisor.mjs` расширяется до coordinator. Single Node process на localhost. |
| **Server-side runtime state** | Reuse `mailbox-runtime/*.json` pattern (atomic write + rename). Add `tasks.json` + `loops.json`. Без PostgreSQL. |
| **Task queue с atomic checkout** | JSON-based queue + file lock via atomic rename. Расширенная state-модель — см. §6 P1. |
| **Adapter layer для запуска агентов** | Abstract `AgentAdapter` interface. Coordinator spawns agents end-to-end. Implementations: `ClaudeCodeAdapter` (spawn CLI или wrapper), `CodexAdapter` (WSL spawn). |
| **Heartbeat / session registry (observability only)** | Already exists (Phase B). Used for dashboard UI + adapter liveness probe — NOT как inject path. |
| **Persistent tasks across restart** | `tasks.json` survives coordinator crash; in-flight tasks на recovery либо resume adapter session (если possible), либо marked failed с clear reason. Session resume = best-effort within adapter — see §6 P4. |
| **Tool-call tracing + conversation threading** | Reuse mailbox .md files per thread — conversation log. No new DB. |
| **Event-based triggers** | Coordinator watches mailbox pollTick (existing 3s) + internal task state transitions. |
| **Plugin adapter pattern** | Interface shaped в P2 (contract research + real-agent probe), implementations в P4. |

---

## §2 What we DO NOT borrow

| Paperclip feature | Why skipped |
|-------------------|-------------|
| **Embedded PostgreSQL** | Overkill — single-user local, low QPS. JSON atomic writes достаточны. |
| **React UI rewrite** | Existing Vite+React dashboard extends incrementally. Full rewrite scope creep. |
| **Org charts / hierarchies / roles** | Not needed — two agents (Claude + Codex), user is гражданин. No reporting lines. |
| **Monthly budgets per agent** | User не требует cost control. Break conditions = thread resolution / max iterations / user stop. |
| **Goal alignment / company mission** | Task ancestry = single thread per goal. Already capture через mailbox thread system. |
| **Multi-company isolation** | Multi-project isolation уже в spec L304 (mandatory `project` field). Same primitive. |
| **Governance / approval gates** | Не меняем user gate model — commit/push остаются explicit user command (rule #5). No mid-loop approval queue. |
| **Full audit log + ticketing** | Mailbox message files уже audit log. Archive preserves full history. |
| **Runtime skill injection** | Static agent instructions (CLAUDE.md + AGENTS.md) уже работают; skill injection — future consideration если scenarios требуют. |

---

## §3 Existing infrastructure reused

Post-cleanup (HEAD=`94c6749`) есть:

| Layer | File | Reuse в pivot |
|-------|------|---------------|
| Mailbox CLI+lib | `scripts/mailbox-lib.mjs`, `scripts/mailbox.mjs` | Queue substrate (send/read/reply/archive/recover) |
| Dashboard backend | `dashboard/server.js` | Coordinator host (add task endpoints + loop orchestrator) |
| Supervisor | `dashboard/supervisor.mjs` | State engine (add taskRegistry, loopRegistry) |
| Session registry | via Phase B hooks + POST /sessions | Agent liveness signal |
| Agent-path delivery API | `/api/agent/runtime/deliveries` | Poll interface для agents, also readable by coordinator |
| Dashboard UI | `dashboard/src/App.jsx` | Incremental extend с task/loop panels |
| Runtime state dir | `mailbox-runtime/` | Add tasks.json, loops.json |
| SessionStart working inject | `scripts/mailbox-status.mjs` | Keep — only working additionalContext path |
| Protocol spec | `local-claude-codex-mailbox-workflow.md` | Add Coordinator section |

---

## §4 Target architecture (paperclip-light)

```
╔════════════════════════════════════════════════════╗
║  User (Windows browser / CLI)                      ║
║  - «Start task» button                             ║
║  - Mid-task monitoring                             ║
║  - «Stop» / «Pause»                                ║
║  - commit/push explicit gate (rule #5 preserved)   ║
╚═══════════╦════════════════════════════════════════╝
            │ HTTP (localhost 3003)
            ▼
╔════════════════════════════════════════════════════╗
║  Coordinator (Node: dashboard/server.js +          ║
║               dashboard/supervisor.mjs extended)   ║
║                                                    ║
║  ┌──────────────────────────────────────────────┐  ║
║  │ Task Queue                                   │  ║
║  │ tasks.json (atomic write+rename)             │  ║
║  │ canonical states (per §6 P1 schema):         │  ║
║  │   pending | launching | awaiting-reply       │  ║
║  │   | handing-off | resolved | failed          │  ║
║  │   | stopped | max-iter-exceeded              │  ║
║  └──────────────────────────────────────────────┘  ║
║                                                    ║
║  ┌──────────────────────────────────────────────┐  ║
║  │ Loop Orchestrator                            │  ║
║  │ - reads mailbox polling (existing supervisor)│  ║
║  │ - matches pending message ↔ next agent       │  ║
║  │ - invokes AgentAdapter.launch()              │  ║
║  │ - watches for reply → next iteration         │  ║
║  │ - break on resolution or max-iterations      │  ║
║  └──────────────────────────────────────────────┘  ║
║                                                    ║
║  ┌──────────────────────────────────────────────┐  ║
║  │ Agent Adapter Layer (interface)              │  ║
║  │ launch(agent, project, thread, message)      │  ║
║  │ resume(sessionId, message) — best-effort     │  ║
║  │ shutdown(sessionId)                          │  ║
║  │ Implementations:                             │  ║
║  │  - ClaudeCodeAdapter (Windows + WSL + IDE)   │  ║
║  │  - CodexAdapter (WSL only — rail #7)         │  ║
║  │  - [future] HTTPAdapter / MockAdapter        │  ║
║  └──────────────────────────────────────────────┘  ║
║                                                    ║
║  ┌──────────────────────────────────────────────┐  ║
║  │ Existing (reuse):                            │  ║
║  │  - Session registry (Phase B)                │  ║
║  │  - /api/agent/runtime/deliveries (Phase C)   │  ║
║  │  - Mailbox pollTick (Phase A)                │  ║
║  └──────────────────────────────────────────────┘  ║
╚═══════════╦════════════════╦═══════════════════════╝
            │                │
            ▼                ▼
    ┌───────────────┐  ┌───────────────┐
    │ Claude Code   │  │ Codex CLI     │
    │ (Win / WSL    │  │ (WSL only)    │
    │  / IDE)       │  │               │
    │               │  │               │
    │ Writes reply  │  │ Writes reply  │
    │ via mailbox   │  │ via mailbox   │
    │ CLI           │  │ CLI           │
    └───────┬───────┘  └───────┬───────┘
            │                  │
            └────────┬─────────┘
                     ▼
        ┌──────────────────────────┐
        │ agent-mailbox/           │
        │ (file system)            │
        │ per-thread .md messages  │
        └──────────────────────────┘
```

**Data flow пример** (user starts task «Implement X»):

1. User POST /api/tasks {project, initialAgent: codex, instruction}
2. Coordinator writes tasks.json entry — state=`pending`
3. Orchestrator picks task, invokes `CodexAdapter.launch(project, initial_thread, instruction)`
4. Codex runs, sends message via `mailbox.mjs send --to claude` → file written в agent-mailbox/
5. Supervisor pollTick detects new pending message для claude → emits internal event
6. Orchestrator sees event, resolves target = Claude, invokes `ClaudeCodeAdapter.launch(project, thread, message_path)`
7. Claude reads mailbox, works, sends reply → file written
8. Orchestrator sees reply → matches against Codex's thread → invokes `CodexAdapter.resume(session_id, reply_message)`
9. Iteration repeats until:
   - Resolution = `answered` + task marked done by user or by completion signal
   - Resolution = `no-reply-needed` (terminal)
   - Max iterations guard (safety)
   - User Stop command

---

## §5 Cross-platform strategy

| Runtime piece | Windows | WSL | Strategy |
|---------------|---------|-----|----------|
| Coordinator (Node server) | ✅ | ✅ | Pure Node, no native deps beyond Phase A-tested `@rolldown` (existing launcher guard в start-workflow.cmd handles binding drift) |
| Claude Code adapter | ✅ native CLI | ✅ WSL CLI | `ClaudeCodeAdapter` delegates к platform-appropriate process spawn; existing wiki `windows-wsl-process-launcher` patterns applied |
| Codex CLI adapter | ❌ experimental, disabled Windows | ✅ supported | `CodexAdapter` works WSL only; Windows native Codex = degraded per rail #7 (existing compat cycle) |
| Dashboard UI | ✅ | ✅ | Existing Vite build, reused |
| Runtime state files | ✅ NTFS atomic | ✅ ext4/btrfs atomic | Existing atomicWriteJson pattern (Phase A verified) |
| Hook transport layer | Claude hooks cross-platform | Claude WSL hooks + Codex WSL hooks | Optional — coordinator не требует hooks для loop operation; hooks остаются только heartbeat discovery |

---

## §6 Phased rollout (minimal, each phase = separate Codex handoff)

### Phase P1 — Task Queue Foundation

**Goal**: persistent task queue с atomic checkout в JSON runtime + rich schema supporting real ping-pong loop.

**Task schema (post-F2 expansion)**:

```json
{
  "id": "task-YYYYMMDDTHHMMSSZ-<slug>",
  "project": "workflow",
  "thread": "<mailbox-thread-slug>",
  "instruction": "initial human-authored task description",
  "initialAgent": "codex | claude",
  "currentAgent": "codex | claude | null",
  "nextAgent": "codex | claude | null",
  "sessionIds": {
    "claude": "<session-id-if-known>",
    "codex": "<session-id-if-known>"
  },
  "lastInboundMessageId": "<message-id-last-received-from-any-agent>",
  "lastOutboundMessageId": "<message-id-last-handed-to-agent>",
  "iterations": 0,
  "maxIterations": 10,
  "state": "pending | launching | awaiting-reply | handing-off | resolved | failed | stopped | max-iter-exceeded",
  "stopReason": "user-stop | max-iter | adapter-error | thread-resolution | ...",
  "error": "<human-readable-error-if-failed>",
  "createdAt": "UTC ISO",
  "lastActivityAt": "UTC ISO",
  "resolvedAt": "UTC ISO?"
}
```

**State machine** (explicit):

- `pending` — task queued, no adapter invoked yet
- `launching` — adapter.launch() in-progress
- `awaiting-reply` — adapter running, orchestrator watches mailbox для inbound message
- `handing-off` — inbound received, preparing resume/launch для `nextAgent`
- `resolved` — thread resolution terminal (answered/no-reply-needed/superseded)
- `failed` — adapter error or unrecoverable runtime fault
- `stopped` — user-triggered stop
- `max-iter-exceeded` — safety break fired

**Scope**:
- `tasks.json` с above schema.
- Supervisor методы: `addTask`, `transitionTask` (atomic state transition with guarded preconditions), `listTasks`, `getTask`.
- Dashboard endpoints: `POST /api/tasks`, `GET /api/tasks`, `GET /api/tasks/:id`, `POST /api/tasks/:id/stop`.
- Dashboard UI section: «Tasks» — read-only list + state badge + iterations counter.
- No adapter integration yet — queue just stores + surface CRUD.

**Acceptance**: user может добавить task через UI button → появляется в списке с rich state → restart coordinator → task persists → state machine guards validate invalid transitions.

**Out of scope**: adapter launch, loop orchestrator, real message-id correlation (introduced in P3).

### Phase P2 — Agent Adapter Contract (research + mock)

**Goal**: определить expanded contract через research + mock implementation. **F4 fix post-R1**: contract-shaping research теперь часть P2 (не откладываем всё на P4).

**Scope**:
- **Research deliverable** (artifact в handoff): `docs/codex-tasks/paperclip-pivot-adapter-contract-research.md` covering:
  - Claude Code: spawn primitives (CLI flags, wrapper scripts, `--resume` semantics если applicable), stdin/stdout contract, liveness detection, completion signal heuristics, crash classification.
  - Codex CLI: same research в WSL context.
  - Process lifecycle gotchas per wiki `windows-wsl-process-launcher` + `wsl-windows-native-binding-drift`.
- **Expanded interface** (`scripts/adapters/agent-adapter.mjs`):
  - `launch({project, thread, instruction, sessionId?})` → `{processHandle, sessionId, launchedAt}`
  - `resume({processHandle|sessionId, message})` → `{messageAccepted, sessionId}`
  - `shutdown({processHandle|sessionId, force?})` → `{exitCode, reason}`
  - `isAlive({processHandle|sessionId})` → `boolean`
  - `attachExisting({sessionId})` → `{processHandle?, attached: boolean}` — best-effort attach к уже открытому user-session
  - `injectMessage({processHandle, message})` — explicit message injection (differs от launch/resume если adapter supports mid-life injection)
  - `parseCompletionSignal({recentOutput})` → `{completed, reason}` — heuristic для detecting agent done
  - `classifyCrash({exitCode, stderr})` → `{category: "env|auth|timeout|agent-error|unknown", retriable}`
- `scripts/adapters/mock-adapter.mjs` — implements full interface; records calls + returns fake states. Allows P3 orchestrator development без real spawn.
- No ClaudeCodeAdapter / CodexAdapter implementations yet — those в P4, но **contract locked в P2** after research approved.

**Acceptance**: research doc approved by user, mock-adapter implements full expanded interface, contract review с Codex (ensures real adapter corner cases addressed).

**Out of scope**: real agent spawn, actual CLI invocation, session resume implementation — только contract + mock.

### Phase P3 — Basic Loop Orchestrator (Mock adapter)

**Goal**: реальный loop cycle на MockAdapter. End-to-end: task → mock launches → mock replies via mailbox → loop detects → mock resumes → closes on resolution.

**Scope**:
- `dashboard/orchestrator.mjs` (new) — watches supervisor.state.pendingIndex + tasks.json, fires adapter invocations.
- Break conditions: resolution terminal, max-iterations (configurable, default 10), user stop.
- Observability: task transition events visible в `/api/tasks/:id` + UI.

**Acceptance**: end-to-end cycle завершается корректно на MockAdapter; user stop button прерывает loop.

**Out of scope**: real agents (P4).

### Phase P4 — ClaudeCode + Codex adapters (implementation only)

**Goal**: replace MockAdapter с реальными implementations. **Contract уже locked в P2** — P4 = pure implementation.

**Scope**:
- `ClaudeCodeAdapter` per P2 contract. Implements spawn + resume + lifecycle per P2 research doc.
- `CodexAdapter` per P2 contract. Implements WSL spawn per P2 research doc.
- Cross-platform: Claude Win+WSL; Codex WSL-only (Windows degraded per rail #7).
- Process management: child_process tracking, SIGTERM/SIGKILL escalation, zombie prevention.

**Acceptance**: real Codex↔Claude cycle на fixture task. User starts, loop runs hands-off до task close.

**Out of scope**: session resume optimization, multi-task concurrency, coordinator restart recovery — P5+.

### Phase P5+ — Hardening (future)

- Session resume (reuse existing Claude Code `--resume` semantics if available).
- Multi-task concurrency (queue prioritization).
- Coordinator restart recovery (resume in-flight tasks).
- Rich UI (task timeline, message previews, resolution analytics).
- Hook optional layer cleanup (heartbeat-only hooks if adapter replaces discovery).

### Phase-after-paperclip — Project isolation follow-up (memory: `project_isolation_open_followup.md`)

Separate handoff, после P4 stable.

---

## §7 Integration into workflow repo

**Minimal disruption**:
- `dashboard/server.js`: +task endpoints (P1), +orchestrator wiring (P3).
- `dashboard/supervisor.mjs`: +task state helpers (P1).
- **NEW** `dashboard/orchestrator.mjs` (P3) — loop logic.
- **NEW** `scripts/adapters/*` (P2) — adapter interface + implementations.
- `dashboard/src/App.jsx`: +Tasks panel (P1), +task detail view (P3), +start/stop buttons (P3).
- `local-claude-codex-mailbox-workflow.md`: +Coordinator section (P1) + Adapter section (P2) + Loop section (P3).
- `mailbox-runtime/`: +tasks.json, +loops.json (P1, gitignored).
- `.claude/settings.local.json`: minimal changes — hooks NOT expanded. Only optional heartbeat remains.

**NO changes**:
- `scripts/mailbox-lib.mjs`, `scripts/mailbox.mjs` — protocol unchanged.
- `agent-mailbox/` invariants — file-based protocol preserved.
- Project isolation contracts (spec L304 + Phase A+B+C validation).

---

## §8 Non-negotiable constraints

1. **No new dependencies** beyond Node + existing Vite/Express. No PostgreSQL, no Redis, no WebSocket lib.
2. **No hook reliance для loop**. Hooks remain optional heartbeat signals. Coordinator self-sufficient on polling + adapter callbacks.
3. **Project isolation — honest scope**:
   - Queue/orchestrator/adapter MUST NOT introduce **new** leak vectors beyond existing baseline (same A+B+C invariants carry over: `to/from/project` mandatory, agent-path endpoints require project query, adapter launch includes project arg).
   - Исходный gap (foreign-session discovery через /state + cross-project mailbox listing на agent path) остаётся known open item per memory `project_isolation_open_followup.md` — **post-P4 follow-up**, не часть этого плана.
   - **Acceptance criteria НЕ утверждают «isolation fully preserved»** — только «baseline isolation preserved, no new vectors introduced». См. §10.
4. **Cross-platform parity** для core coordinator (Phase A-inherited rail #1).
5. **User gate for commit/push** (rule #5) remains untouched.
6. **No auto-execution of risky actions**: adapters launch agents с predefined instruction, но agents themselves respect their existing rules (CLAUDE.md, AGENTS.md).
7. **Max-iterations safety break** (default 10 iterations per task loop) — prevents runaway cycles.
8. **Per-phase separate Codex handoff** — each Phase P1-P5+ goes through 11-step plan procedure independently. This architecture plan is meta-level.

---

## §9 Known risks + mitigations

| Risk | Mitigation |
|------|------------|
| Adapter spawn mechanism complex для Claude Code (transcript continuation / session state) | Research shifted в P2 (F4 fix post-R1) — contract locked BEFORE mock implementation, P3 orchestrator built on real contract shape. Fallback к fresh-session launch если resume too fragile — acceptable. |
| Coordinator crash leaves tasks in `in-flight` state | P5 recovery: on restart, scan in-flight tasks, attempt resume OR mark failed |
| Max-iterations triggered но task реально нужна больше | User sees task in state=failed с reason «max iterations», может вручную продолжить |
| WSL process spawn timing / zombie processes | Adapter tracks PID, shutdown() ensures kill; existing wiki patterns для WSL launcher |
| Loop infinite reply (Codex replies to Codex, Claude replies to Claude) | Mailbox protocol requires `to` field different from `from`; orchestrator validates |
| Cross-project leakage в queue | Task has `project` field, queue filter + adapter project arg (existing isolation) |
| Old project isolation follow-up (separate) | Tracked as post-P4 handoff per memory |

---

## §10 Success criteria (end state после P4)

- User может start task через dashboard.
- Task визуально видна в UI (pending → in-flight → cycling → done/failed).
- Cycle (Codex↔Claude) runs hands-off до resolution или max-iterations.
- Mailbox protocol unchanged — full audit trail per thread.
- **Baseline project isolation preserved** — no new leak vectors introduced beyond existing A+B+C invariants. **Full isolation (closing known `/state` + mailbox agent-path gaps) остаётся post-P4 follow-up** per memory `project_isolation_open_followup.md` — success criteria here do NOT claim full isolation, только «no regression vs baseline».
- **Task records persist через JSON runtime across coordinator restart**. После P4 честно гарантируется только сохранение task records на диске (rich schema + state snapshot). **Auto loop recovery для in-flight tasks = P5+ scope** — after restart, in-flight tasks могут требовать user intervention (marked failed с reason «coordinator restart during active loop») до implementation P5 recovery logic.
- Windows + WSL runtime — Claude CLI+IDE works everywhere, Codex CLI WSL only, Windows-native Codex explicitly degraded path.
- Hooks remain optional; coordinator independent of Stop/UserPromptSubmit decision.

---

## §11 Out of scope this plan

- **Executable diff** (no Change 1/2/3 blocks here) — this is architecture. Each phase P1-P5+ = separate executable handoff with whitelist + V1-Vn.
- **Multi-user / remote deployment** — localhost only.
- **Agent permission boundaries beyond existing CLAUDE.md/AGENTS.md** — rule set unchanged.
- **Replacement of mailbox protocol** — protocol stays; queue layers orthogonal.
- **Full React UI redesign** — incremental panels only.
- **Old project isolation completion** — post-P4 follow-up per memory `project_isolation_open_followup.md`.
- **Budget/governance features from paperclip** — explicitly skipped per §2.
- **PostgreSQL / SQLite storage** — JSON runtime only.
- **Hooks rewrite** — existing hooks stay; no new hook types.

---

## §12 Commitments for per-phase handoffs

Each Phase P1-P5+ handoff MUST:
- Follow 11-step plan creation procedure.
- Include pre-flight + V1-Vn verification + rollback + discrepancy checkpoints.
- Respect rails (#1 cross-OS, #3 project isolation, #4 thin layer where applicable, #5 Claude hooks, #8 no UserPromptSubmit, #10 unsupported path explicit marking).
- Whitelist-controlled — no scope creep outside listed files.
- Explicit dependency chain (P2 depends on P1, etc).
- Commit + push = user explicit command.

---

## §13 Notes

- **This plan is high-level architecture**. Execution happens через per-phase handoffs. Codex (per user delegation) должен review this architecture as whole, accept/propose changes, then when user says «go» каждая фаза становится отдельным executable handoff.
- **No code changes triggered by this plan**. User visible deliverable = architecture decision document.
- **Paperclip как reference** — not literal port. Selective adoption per §1-§2.
- **Post-adoption, wiki entry `workflow-hybrid-hook-automation`** needs update — the «hybrid» decision (thin hooks + thick backend) остаётся valid, но inject path claim (Stop hook) должен быть rewritten в соответствии с cleanup commit `94c6749` + this plan's shift toward adapter layer.

---

## §14 Status

**Architecture plan v1 ready for Codex adversarial review.** User delegation активен — Codex может challenge любой §1-§11 пункт, propose alternatives, вернуть меня на revision. After clean approval, Phase P1 = first executable handoff.
