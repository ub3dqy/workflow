# Paperclip P3 — Orchestrator Loop — Execution Plan

**Version**: v1
**Planning-audit**: `docs/codex-tasks/paperclip-p3-orchestrator-planning-audit.md`
**Report template**: `docs/codex-tasks/paperclip-p3-orchestrator-report.md`
**Architecture parent**: approved R4
**P1 parent**: `f3d065d` (task queue)
**P2 parent**: `836999d` (adapter contract + mock)
**Baseline**: HEAD=`836999d`
**Target executor**: Codex (WSL + Windows parity)
**Scope**: orchestrator loop with MockAdapter, wired into supervisor pollTick. No real adapter implementations (P4). No coordinator restart recovery (P5+).

---

## §0 Compat rails inheritance

- Rail #1 (cross-OS): orchestrator pure JS; delegates OS-specifics to adapter (P4).
- Rail #3 (baseline isolation): orchestrator reads task.project + filters pendingIndex by task scope; no cross-project routing.
- Rail #4 (thin layer): orchestrator = coordinator logic, не agent logic. Adapter does spawn.
- Architecture §1.0 coordinator-owned: orchestrator IS the coordinator loop.

---

## §1 Why this plan exists

P1+P2 delivered storage + adapter contract. P3 wires them together — MockAdapter exercises cycle, proves orchestrator design correct BEFORE real adapters (P4) bring agent-specific quirks. Architecture §6 P3 ensures contract + orchestrator locked separately so P4 = implementation-only.

---

## §2 Hierarchy of sources of truth

1. Architecture §6 P3 canonical description of orchestrator loop + break conditions.
2. P1 supervisor task helpers + state machine + ALLOWED_TRANSITIONS.
3. P2 AgentAdapter interface + MockAdapter behavior spec.
4. Phase A supervisor pollTick pattern для tick injection.
5. This plan — derived.
6. Discrepancy → STOP + §5.

---

## §3 Doc verification

### §V1 — supervisor.listTasks / getTask / transitionTask / stopTask

L294/L310/L255/L283 post-`836999d`. Orchestrator consumes all 4.

### §V2 — supervisor.pollTick tail extension

Phase A pattern — pollTick updates pendingIndex + persists. P1 added task persist calls. P3 injects orchestrator.processTick() as tail step (after pendingIndex ready, before tickErrors rollup).

### §V3 — AgentAdapter interface

P2 committed. Orchestrator imports agent-adapter.mjs для validateAdapter check at construction.

### §V4 — pendingIndex message schema

`{relativePath, to, from, project, projectMissing, deliverable, thread, created, received_at}` — fields for reply matching.

---

## §4 Pre-flight verification

### P1 — environment baseline

```bash
node --version
git rev-parse --short HEAD
git status --short
```

Expected: Node ≥20.19, HEAD=`836999d` or newer.

### P2 — baseline line counts

```bash
wc -l dashboard/supervisor.mjs dashboard/server.js dashboard/src/App.jsx dashboard/src/api.js scripts/adapters/agent-adapter.mjs scripts/adapters/mock-adapter.mjs local-claude-codex-mailbox-workflow.md
```

Expected (post-`836999d`):
- `dashboard/supervisor.mjs` = 414
- `dashboard/server.js` = 355
- `dashboard/src/App.jsx` = 1972
- `dashboard/src/api.js` = 126
- `scripts/adapters/agent-adapter.mjs` = 142
- `scripts/adapters/mock-adapter.mjs` = 187
- `local-claude-codex-mailbox-workflow.md` = 916

Drift >10 lines → STOP + record §0.4.

### P3 — validateAdapter against MockAdapter smoke

```bash
node -e "
Promise.all([
  import('./scripts/adapters/agent-adapter.mjs'),
  import('./scripts/adapters/mock-adapter.mjs')
]).then(([iface, mock]) => {
  const v = iface.validateAdapter(mock.createMockAdapter());
  console.log(v.valid ? 'P3 PASS' : 'P3 FAIL missing=' + v.missing.join(','));
});
"
```

Expected: `P3 PASS`.

### P4 — baseline build

```bash
cd dashboard && npx vite build 2>&1 | tail -5
```

Expected: `✓ built`.

### P5 — orchestrator.mjs absence

```bash
ls dashboard/orchestrator.mjs 2>&1
```

Expected: file not found (new в этом handoff).

---

## §5 Whitelist

| File | Purpose | Status |
|------|---------|--------|
| `dashboard/orchestrator.mjs` | **NEW** — `createOrchestrator({supervisor, adapter, logger})` factory. processTick() + handleTaskTick() + state transition logic + break condition detection. | create |
| `dashboard/supervisor.mjs` | extend pollTick tail — call orchestrator.processTick() (best-effort non-throwing); extend supervisorHealth counters (+taskTicksProcessed, +taskTransitions, +taskCyclesCompleted, +taskAdapterErrors) | modify |
| `dashboard/server.js` | import createOrchestrator + createMockAdapter; instantiate at app bootstrap с `{supervisor, adapter, logger: console}`; store ref так чтобы stop shutdown can call orchestrator.stop() | modify |
| `local-claude-codex-mailbox-workflow.md` | +«Orchestrator Loop (paperclip pivot P3)» section after Adapter Contract section | modify |

**НЕ ТРОГАТЬ**:
- `scripts/**` — adapters + mailbox unchanged
- `.claude/settings.local.json`
- `.gitignore`
- `agent-mailbox/**`, `mailbox-runtime/**`
- `dashboard/src/**` — no UI changes (P5+ for timeline display)
- `docs/codex-tasks/*` кроме P3 handoff trio

---

## §6 Changes

### Change 1 — **NEW** `dashboard/orchestrator.mjs`

```js
import { validateAdapter } from "../scripts/adapters/agent-adapter.mjs";

const ADAPTER_ERROR_THRESHOLD = 3;

export function createOrchestrator({ supervisor, adapter, logger = console }) {
  const v = validateAdapter(adapter);
  if (!v.valid) {
    throw new Error(`orchestrator: adapter invalid, missing methods: ${v.missing.join(",")}`);
  }

  /** @type {Map<string, number>} task.id → consecutive adapter error count */
  const adapterErrorCounts = new Map();
  let stopped = false;

  function nextAgent(currentAgent) {
    if (currentAgent === "claude") return "codex";
    if (currentAgent === "codex") return "claude";
    return null;
  }

  function findReplyInPendingIndex(task, state) {
    const expectedTo = task.currentAgent && nextAgent(task.currentAgent);
    if (!expectedTo) return null;
    return state.pendingIndex.find((item) =>
      item.thread === task.thread
      && item.project === task.project
      && item.to === expectedTo
      && item.deliverable === true
      && item.relativePath !== task.lastInboundMessageId
    );
  }

  function recordAdapterError(taskId) {
    const prev = adapterErrorCounts.get(taskId) || 0;
    const next = prev + 1;
    adapterErrorCounts.set(taskId, next);
    return next;
  }

  function resetAdapterErrors(taskId) {
    adapterErrorCounts.delete(taskId);
  }

  async function handleTaskTick(task, state, healthCounters) {
    // Skip if terminal state (race safety).
    if (["resolved", "failed", "stopped", "max-iter-exceeded"].includes(task.state)) {
      return { noop: true };
    }

    // Check max-iterations break condition.
    // F2 fix post-R1: scope only к states где max-iter-exceeded allowed per ALLOWED_TRANSITIONS
    // (pending/launching disallow; iterations remain 0 в них anyway для default maxIterations≥1).
    const maxIterApplicable = task.state === "awaiting-reply" || task.state === "handing-off";
    if (maxIterApplicable && task.iterations >= task.maxIterations) {
      supervisor.transitionTask(task.id, "max-iter-exceeded", {
        stopReason: `iterations reached maxIterations=${task.maxIterations}`
      });
      healthCounters.taskTransitions += 1;
      return { transition: "max-iter-exceeded" };
    }

    if (task.state === "pending") {
      // Launch via adapter.
      try {
        const result = await adapter.launch({
          project: task.project,
          thread: task.thread,
          instruction: task.instruction,
          sessionId: task.sessionIds[task.initialAgent] || undefined
        });
        supervisor.transitionTask(task.id, "launching", {
          currentAgent: task.initialAgent,
          nextAgent: nextAgent(task.initialAgent),
          sessionIds: { ...task.sessionIds, [task.initialAgent]: result.sessionId },
          iterations: task.iterations + 1
        });
        supervisor.transitionTask(task.id, "awaiting-reply");
        healthCounters.taskTransitions += 2;
        resetAdapterErrors(task.id);
        return { transition: "awaiting-reply" };
      } catch (error) {
        return handleAdapterFailure(task, error, healthCounters, "launch");
      }
    }

    if (task.state === "awaiting-reply") {
      // Detect mailbox reply matching task.thread + expected recipient.
      const reply = findReplyInPendingIndex(task, state);
      if (!reply) {
        return { noop: true, reason: "no-reply-yet" };
      }
      // F4 fix post-R2: save prev lastInbound для revert path если handoff fails below threshold.
      const prevLastInbound = task.lastInboundMessageId;
      // Reply detected → hand off.
      supervisor.transitionTask(task.id, "handing-off", {
        lastInboundMessageId: reply.relativePath
      });
      healthCounters.taskTransitions += 1;
      // Determine next agent (reply.to is new currentAgent).
      const newCurrent = reply.to;
      const newNext = nextAgent(newCurrent);
      // F1 fix post-R1: distinguish first-time-agent (launch) vs subsequent (resume).
      // sessionIds[newCurrent] empty → agent never launched before → use launch().
      const existingSession = task.sessionIds[newCurrent];
      const isFirstTimeForAgent = !existingSession || existingSession === "";
      try {
        let result;
        let adapterMethod;
        if (isFirstTimeForAgent) {
          adapterMethod = "launch";
          result = await adapter.launch({
            project: task.project,
            thread: task.thread,
            instruction: `Relay from ${reply.from}: ${reply.relativePath}`,
            sessionId: undefined
          });
          // launch returns {processHandle, sessionId, launchedAt}; no messageAccepted field.
        } else {
          adapterMethod = "resume";
          result = await adapter.resume({
            sessionId: existingSession,
            message: `New message на thread ${task.thread}: ${reply.relativePath}`
          });
          // F3 fix post-R1: check adapter.resume confirms messageAccepted.
          // If false → treat as adapter error, NOT advance state.
          if (!result.messageAccepted) {
            return handleAdapterFailure(
              task,
              new Error(`adapter.resume returned messageAccepted=false for session ${existingSession}`),
              healthCounters,
              "resume"
            );
          }
        }
        supervisor.transitionTask(task.id, "awaiting-reply", {
          currentAgent: newCurrent,
          nextAgent: newNext,
          sessionIds: { ...task.sessionIds, [newCurrent]: result.sessionId || existingSession },
          lastOutboundMessageId: reply.relativePath,
          iterations: task.iterations + 1
        });
        healthCounters.taskTransitions += 1;
        healthCounters.taskCyclesCompleted += 1;
        resetAdapterErrors(task.id);
        return { transition: "awaiting-reply", iteration: task.iterations + 1, adapterMethod };
      } catch (error) {
        // F4 fix post-R2: на adapter failure без превышения threshold revert к awaiting-reply с prev lastInbound,
        // чтобы следующий tick findReply снова matched тот же reply для retry. Task не wedged в handing-off.
        const errCount = recordAdapterError(task.id);
        healthCounters.taskAdapterErrors += 1;
        logger.error(`[orchestrator] handoff adapter failed for task ${task.id} (attempt ${errCount}):`, error);
        if (errCount >= ADAPTER_ERROR_THRESHOLD) {
          try {
            supervisor.transitionTask(task.id, "failed", {
              error: `adapter handoff failed ${errCount} consecutive times: ${error && error.message ? error.message : String(error)}`,
              stopReason: "adapter-error-threshold"
            });
            healthCounters.taskTransitions += 1;
            adapterErrorCounts.delete(task.id);
          } catch (ignore) {}
          return { transition: "failed", reason: "adapter-error-threshold" };
        }
        // Revert handing-off → awaiting-reply с restored prevLastInbound to enable retry.
        try {
          supervisor.transitionTask(task.id, "awaiting-reply", {
            lastInboundMessageId: prevLastInbound
          });
          healthCounters.taskTransitions += 1;
        } catch (ignore) {}
        return { error: true, errCount, reverted: true };
      }
    }

    // NB: task.state === "handing-off" after restart (orchestrator crash mid-handoff) is
    // explicitly NOT recovered in P3 (F7 post-P3-R3). Naive revert к awaiting-reply keeps
    // task.lastInboundMessageId, and findReplyInPendingIndex filters that path — so the same
    // reply that triggered the original handoff would be permanently excluded, wedging the
    // task until a different reply arrives. Proper restart recovery requires persisting
    // pre-handoff state (previousLastInboundMessageId) and is deferred to P5+ (see §9).
    // In P3, stuck-in-handing-off surfaces via unhandled-state log + adapter-error threshold
    // on the next productive attempt (none — since we don't retry), eventually requiring
    // manual user-stop. Acceptable trade-off per R3 agreement.

    return { noop: true, reason: `unhandled-state-${task.state}` };
  }

  function handleAdapterFailure(task, error, healthCounters, context) {
    const errCount = recordAdapterError(task.id);
    healthCounters.taskAdapterErrors += 1;
    logger.error(`[orchestrator] adapter.${context} failed for task ${task.id} (attempt ${errCount}):`, error);
    if (errCount >= ADAPTER_ERROR_THRESHOLD) {
      try {
        supervisor.transitionTask(task.id, "failed", {
          error: `adapter.${context} failed ${errCount} consecutive times: ${error && error.message ? error.message : String(error)}`,
          stopReason: "adapter-error-threshold"
        });
        healthCounters.taskTransitions += 1;
        adapterErrorCounts.delete(task.id);
      } catch (ignore) {
        // Transition может throw если task уже terminal — OK.
      }
      return { transition: "failed", reason: "adapter-error-threshold" };
    }
    return { error: true, errCount };
  }

  async function processTick() {
    if (stopped) return { stopped: true };
    const healthCounters = {
      taskTicksProcessed: 0,
      taskTransitions: 0,
      taskCyclesCompleted: 0,
      taskAdapterErrors: 0
    };
    const state = supervisor.state;
    const tasks = supervisor.listTasks({});
    for (const task of tasks) {
      if (["resolved", "failed", "stopped", "max-iter-exceeded"].includes(task.state)) continue;
      try {
        await handleTaskTick(task, state, healthCounters);
        healthCounters.taskTicksProcessed += 1;
      } catch (error) {
        logger.error(`[orchestrator] unexpected handleTaskTick error for ${task.id}:`, error);
        healthCounters.taskAdapterErrors += 1;
      }
    }
    // Fold counters into supervisorHealth.
    const h = supervisor.state.supervisorHealth;
    h.taskTicksProcessed = (h.taskTicksProcessed || 0) + healthCounters.taskTicksProcessed;
    h.taskTransitions = (h.taskTransitions || 0) + healthCounters.taskTransitions;
    h.taskCyclesCompleted = (h.taskCyclesCompleted || 0) + healthCounters.taskCyclesCompleted;
    h.taskAdapterErrors = (h.taskAdapterErrors || 0) + healthCounters.taskAdapterErrors;
    return healthCounters;
  }

  function stop() {
    stopped = true;
  }

  return { processTick, stop };
}
```

### Change 2 — `dashboard/supervisor.mjs`

**Change 2.1** — extend supervisorHealth shape at L22-29:

**Target** (add 4 counters):

```js
supervisorHealth: {
  startedAt: null,
  lastTickAt: null,
  lastTickMs: 0,
  tickErrors: 0,
  isScanning: false,
  taskTicksProcessed: 0,
  taskTransitions: 0,
  taskCyclesCompleted: 0,
  taskAdapterErrors: 0
}
```

**Change 2.2** — add orchestrator reference + setter в closure:

После existing state setup (before router). Add:

```js
let orchestrator = null;

function setOrchestrator(next) {
  orchestrator = next;
}
```

**Change 2.3** — extend pollTick tail — call orchestrator.processTick():

**Current** pollTick end (around L175-180 approx):

```js
      state.pendingIndex = pending;
      state.supervisorHealth.lastTickAt = toUtcTimestamp();
      state.supervisorHealth.lastTickMs = Date.now() - startedAt;

      await persistPendingIndex();
      await persistHealth();
```

**Target** — add orchestrator invocation перед persistHealth:

```js
      state.pendingIndex = pending;

      if (orchestrator && typeof orchestrator.processTick === "function") {
        try {
          await orchestrator.processTick();
          await persistTasks();
        } catch (orchError) {
          logger.error("[supervisor] orchestrator.processTick failed:", orchError);
        }
      }

      state.supervisorHealth.lastTickAt = toUtcTimestamp();
      state.supervisorHealth.lastTickMs = Date.now() - startedAt;

      await persistPendingIndex();
      await persistHealth();
```

**Change 2.4** — extend return shape:

Add `setOrchestrator` to returned object.

**Change 2.5** — tighten `addTask` thread requirement (F6 post-P3-R2):

Locate `addTask` function (existing P1 helper around L209-235). Currently `thread` field is optional. Orchestrator correlation is entirely thread-based (findReplyInPendingIndex matches `entry.thread === task.thread`), so empty thread makes a task unable to correlate safely to mailbox traffic.

Replace the existing thread handling — require non-empty thread:

```js
function addTask(input = {}) {
  const thread = typeof input.thread === "string" ? input.thread.trim() : "";
  if (!thread) {
    throw new Error("addTask requires non-empty thread for orchestrator correlation");
  }
  // … rest of existing addTask logic, passing through `thread` instead of input.thread
}
```

POST `/api/tasks` в server.js передаёт body as-is; with this guard, supervisor throws → endpoint wraps в 400. No server.js change required — existing error-handling middleware surfaces thrown message.

### Change 3 — `dashboard/server.js`

**Change 3.1** — imports at top (after createSupervisor import):

```js
import { createOrchestrator } from "./orchestrator.mjs";
import { createMockAdapter } from "../scripts/adapters/mock-adapter.mjs";
```

**Change 3.2** — after `const supervisor = createSupervisor(...)` block, wire orchestrator:

```js
const orchestratorAdapter = createMockAdapter({
  recordCallsTo: path.join(runtimeRoot, "orchestrator-mock-calls.json")
});
const orchestrator = createOrchestrator({
  supervisor,
  adapter: orchestratorAdapter,
  logger: console
});
supervisor.setOrchestrator(orchestrator);
```

**Change 3.3** — shutdown hook — orchestrator.stop() before supervisor.stop():

Find existing shutdown function (Phase A pattern — SIGINT/SIGTERM handler around where app.listen). Add orchestrator.stop() call before supervisor.stop().

If existing shutdown block is:

```js
process.on("SIGINT", () => {
  supervisor.stop();
  process.exit(0);
});
```

Target:

```js
process.on("SIGINT", () => {
  orchestrator.stop();
  supervisor.stop();
  process.exit(0);
});
```

(Apply same к SIGTERM handler if present.)

### Change 4 — `local-claude-codex-mailbox-workflow.md`

Найти конец «Adapter Contract (paperclip pivot P2)» section. Вставить после неё:

```markdown

### Orchestrator Loop (paperclip pivot P3)

Paperclip-light coordinator loop wired между task queue (P1) и adapter interface (P2):

- **Entrypoint**: `createOrchestrator({supervisor, adapter, logger})` → `{processTick, stop}`.
- **Integration**: supervisor.pollTick tail calls `orchestrator.processTick()` each 3s cycle. Non-throwing — errors logged но не ломают pollTick.
- **Per-task state machine progression**:
  - `pending` → orchestrator calls `adapter.launch` → transitions `launching` → `awaiting-reply` (iteration=1, currentAgent=initialAgent).
  - `awaiting-reply` → orchestrator scans `supervisor.state.pendingIndex` для new message with `task.thread` + `to=nextAgent` → transitions `handing-off` → `adapter.resume(newCurrent)` → back к `awaiting-reply` (iteration++).
- **Break conditions** (P3 scope — subset of architecture §6 P3):
  - `task.iterations >= task.maxIterations` → `max-iter-exceeded`.
  - 3 consecutive adapter errors на same task → `failed` с stopReason=`adapter-error-threshold`.
  - User POST `/api/tasks/:id/stop` → `stopped` (guarded via transitionTask terminal-state lock).
- **Resolution break deferred к P4** (F5 honest downgrade post-R2): originally architecture §6 P3 listed thread resolution as break condition, но P3 plan не реализует mailbox archive read (orchestrator avoids direct mailbox-lib coupling). P3 tasks cannot автоматически transition к `resolved`; only max-iter/failed/stopped are terminal в P3. P4 adds resolution detection через supervisor extension или adapter.parseCompletionSignal integration.
- **Observability** — `supervisorHealth.{taskTicksProcessed, taskTransitions, taskCyclesCompleted, taskAdapterErrors}` counters.
- **Adapter plug-in**: P3 uses MockAdapter (from P2) for deterministic cycle testing. P4 replaces с real ClaudeCodeAdapter + CodexAdapter (blocking on Codex CLI live probe per research §6).
```

---

## §7 Verification phases

### Phase 1 — Codex-only (WSL)

Mandatory order: Change 1 (orchestrator) → Change 2 (supervisor wiring) → Change 3 (server bootstrap) → Change 4 (spec).

| # | Check | Expected |
|---|-------|----------|
| V1 | orchestrator.mjs parses | node --check |
| V2 | supervisor.mjs parses post-change | node --check |
| V3 | server.js parses post-change | node --check |
| V4 | Build passes | `✓ built` |
| V5 | orchestrator.mjs exports createOrchestrator | grep `^export function createOrchestrator` = 1 |
| V6 | supervisor.mjs has setOrchestrator + orchestrator invocation в pollTick | grep ≥2 |
| V7 | server.js bootstrap wires orchestrator | grep `setOrchestrator` + `createOrchestrator` count ≥2 |
| V8 | Spec section «Orchestrator Loop (paperclip pivot P3)» | grep = 1 |
| V9 | End-to-end cycle on MockAdapter (empirical) | 6 sub-probes |
| V10 | Max-iterations break condition fires | empirical |
| V11 | Adapter-error threshold triggers failed state | empirical |
| V12 | PD scan | `--scan done` |
| V13 | Whitelist drift | 3 M + 1 new + 3 handoff artefacts |
| V14 | addTask rejects empty thread (F6) | empirical throw |

Verification commands:

```bash
# V1
node --check dashboard/orchestrator.mjs && echo "V1 PASS"

# V2
node --check dashboard/supervisor.mjs && echo "V2 PASS"

# V3
node --check dashboard/server.js && echo "V3 PASS"

# V4
cd dashboard && npx vite build 2>&1 | tail -5

# V5
grep -cE '^export function createOrchestrator' dashboard/orchestrator.mjs
# Expected: 1

# V6
grep -cE 'setOrchestrator|orchestrator\.processTick' dashboard/supervisor.mjs
# Expected: >=2

# V7
grep -cE 'setOrchestrator|createOrchestrator|createMockAdapter' dashboard/server.js
# Expected: >=3

# V8
grep -c 'Orchestrator Loop (paperclip pivot P3)\|### Orchestrator Loop' local-claude-codex-mailbox-workflow.md
# Expected: 1

# V9 — end-to-end cycle on MockAdapter (in-process, no real server)
node -e "
Promise.all([
  import('./dashboard/orchestrator.mjs'),
  import('./scripts/adapters/mock-adapter.mjs'),
  import('./dashboard/supervisor.mjs')
]).then(async ([orch, mock, sup]) => {
  // Ephemeral supervisor with /tmp runtime
  const fs = await import('node:fs/promises');
  const rt = '/tmp/orch-v9-' + process.pid;
  const mb = rt + '/mailbox';
  await fs.mkdir(mb + '/to-claude', {recursive: true});
  await fs.mkdir(mb + '/to-codex', {recursive: true});
  const supervisor = sup.createSupervisor({mailboxRoot: mb, runtimeRoot: rt, pollIntervalMs: 999999});
  const adapter = mock.createMockAdapter();
  const orchestrator = orch.createOrchestrator({supervisor, adapter, logger: {error: () => {}, log: () => {}}});

  // V9a — create pending task
  const task = supervisor.addTask({project: 'workflow', thread: 'v9-thread', initialAgent: 'codex', instruction: 'test'});
  console.log('V9a create:', task.state === 'pending' ? 'PASS' : 'FAIL state=' + task.state);

  // V9b — first processTick → launch → awaiting-reply
  await orchestrator.processTick();
  const t1 = supervisor.getTask(task.id);
  console.log('V9b launched:', (t1.state === 'awaiting-reply' && t1.iterations === 1 && t1.currentAgent === 'codex') ? 'PASS' : 'FAIL ' + JSON.stringify({state:t1.state, it:t1.iterations, cur:t1.currentAgent}));

  // V9c — simulate reply to codex's thread (codex wrote to claude)
  // Post-F1: first-time Claude handoff должен использовать adapter.launch, не resume.
  supervisor.state.pendingIndex = [
    {relativePath: 'to-claude/msg-1.md', to: 'claude', from: 'codex', project: 'workflow', thread: 'v9-thread', deliverable: true, created: '2026-04-20T10:00:00Z'}
  ];
  await orchestrator.processTick();
  const t2 = supervisor.getTask(task.id);
  const hasClaudeSession = !!t2.sessionIds.claude && t2.sessionIds.claude.length > 0;
  console.log('V9c handoff:', (t2.state === 'awaiting-reply' && t2.iterations === 2 && t2.currentAgent === 'claude' && t2.lastInboundMessageId === 'to-claude/msg-1.md' && hasClaudeSession) ? 'PASS' : 'FAIL ' + JSON.stringify({state:t2.state, it:t2.iterations, cur:t2.currentAgent, in:t2.lastInboundMessageId, claudeSid:t2.sessionIds.claude}));

  // V9d — simulate reply back (claude wrote to codex)
  supervisor.state.pendingIndex = [
    {relativePath: 'to-codex/msg-2.md', to: 'codex', from: 'claude', project: 'workflow', thread: 'v9-thread', deliverable: true, created: '2026-04-20T10:01:00Z'}
  ];
  await orchestrator.processTick();
  const t3 = supervisor.getTask(task.id);
  console.log('V9d cycle back:', (t3.state === 'awaiting-reply' && t3.iterations === 3 && t3.currentAgent === 'codex') ? 'PASS' : 'FAIL ' + JSON.stringify({state:t3.state, it:t3.iterations, cur:t3.currentAgent}));

  // V9e — user stops task
  supervisor.stopTask(task.id);
  await orchestrator.processTick();
  const t4 = supervisor.getTask(task.id);
  console.log('V9e user-stop:', (t4.state === 'stopped' && t4.stopReason === 'user-stop') ? 'PASS' : 'FAIL ' + JSON.stringify({state:t4.state, reason:t4.stopReason}));

  // V9f — counters increment
  const h = supervisor.state.supervisorHealth;
  const ok = h.taskTicksProcessed > 0 && h.taskTransitions > 0 && h.taskCyclesCompleted >= 1;
  console.log('V9f counters:', ok ? 'PASS' : 'FAIL ' + JSON.stringify(h));

  // Cleanup
  await fs.rm(rt, {recursive: true, force: true});
});
" 2>&1

# V10 — max-iterations
node -e "
Promise.all([
  import('./dashboard/orchestrator.mjs'),
  import('./scripts/adapters/mock-adapter.mjs'),
  import('./dashboard/supervisor.mjs')
]).then(async ([orch, mock, sup]) => {
  const fs = await import('node:fs/promises');
  const rt = '/tmp/orch-v10-' + process.pid;
  const mb = rt + '/mailbox';
  await fs.mkdir(mb + '/to-claude', {recursive: true});
  await fs.mkdir(mb + '/to-codex', {recursive: true});
  const supervisor = sup.createSupervisor({mailboxRoot: mb, runtimeRoot: rt, pollIntervalMs: 999999});
  const orchestrator = orch.createOrchestrator({supervisor, adapter: mock.createMockAdapter(), logger: {error:()=>{}, log:()=>{}}});
  const task = supervisor.addTask({project: 'workflow', thread: 'v10', initialAgent: 'codex', instruction: 'test', maxIterations: 2});
  // Manually set iterations to exactly maxIterations
  supervisor.transitionTask(task.id, 'launching', {iterations: 2});
  supervisor.transitionTask(task.id, 'awaiting-reply');
  await orchestrator.processTick();
  const t = supervisor.getTask(task.id);
  console.log('V10:', t.state === 'max-iter-exceeded' ? 'PASS' : 'FAIL state=' + t.state);
  await fs.rm(rt, {recursive: true, force: true});
});
" 2>&1

# V11 — adapter-error threshold
node -e "
Promise.all([
  import('./dashboard/orchestrator.mjs'),
  import('./dashboard/supervisor.mjs')
]).then(async ([orch, sup]) => {
  const fs = await import('node:fs/promises');
  const rt = '/tmp/orch-v11-' + process.pid;
  const mb = rt + '/mailbox';
  await fs.mkdir(mb + '/to-claude', {recursive: true});
  await fs.mkdir(mb + '/to-codex', {recursive: true});
  const supervisor = sup.createSupervisor({mailboxRoot: mb, runtimeRoot: rt, pollIntervalMs: 999999});
  // Failing adapter — throws on launch
  const adapter = {
    async launch() { throw new Error('mock-failure'); },
    async resume() { throw new Error('mock-failure'); },
    async shutdown() { return {exitCode:0, reason:'ok'}; },
    isAlive() { return false; },
    async attachExisting() { return {processHandle:null, attached:false}; },
    async injectMessage() { return {injected:false, fellBackToResume:false}; },
    parseCompletionSignal() { return {completed:false, reason:''}; },
    classifyCrash() { return {category:'agent-error', retriable:true}; }
  };
  const orchestrator = orch.createOrchestrator({supervisor, adapter, logger: {error:()=>{}, log:()=>{}}});
  const task = supervisor.addTask({project: 'workflow', thread: 'v11', initialAgent: 'codex', instruction: 'test'});
  // 3 ticks with failing launch
  await orchestrator.processTick();
  await orchestrator.processTick();
  await orchestrator.processTick();
  const t = supervisor.getTask(task.id);
  console.log('V11:', t.state === 'failed' ? 'PASS' : 'FAIL state=' + t.state + ' stopReason=' + t.stopReason);
  await fs.rm(rt, {recursive: true, force: true});
});
" 2>&1

# V14 — addTask rejects empty/whitespace thread (F6)
node -e "
import('./dashboard/supervisor.mjs').then(async (sup) => {
  const fs = await import('node:fs/promises');
  const rt = '/tmp/orch-v14-' + process.pid;
  const mb = rt + '/mailbox';
  await fs.mkdir(mb + '/to-claude', {recursive: true});
  await fs.mkdir(mb + '/to-codex', {recursive: true});
  const supervisor = sup.createSupervisor({mailboxRoot: mb, runtimeRoot: rt, pollIntervalMs: 999999});
  let emptyErr=null, wsErr=null, ok=null;
  try { supervisor.addTask({project:'workflow', thread:'', initialAgent:'codex', instruction:'x'}); } catch(e){ emptyErr=e.message; }
  try { supervisor.addTask({project:'workflow', thread:'   ', initialAgent:'codex', instruction:'x'}); } catch(e){ wsErr=e.message; }
  try { const t=supervisor.addTask({project:'workflow', thread:'v14-ok', initialAgent:'codex', instruction:'x'}); ok=t.thread; } catch(e){ ok='THROW:'+e.message; }
  const pass = emptyErr && wsErr && ok === 'v14-ok';
  console.log('V14:', pass ? 'PASS' : 'FAIL ' + JSON.stringify({emptyErr, wsErr, ok}));
  await fs.rm(rt, {recursive:true, force:true});
});
" 2>&1

# V12 — PD scan
PD_PATTERNS='$PD_PATTERNS'
grep -riE "$PD_PATTERNS" --include="*.js" --include="*.jsx" --include="*.mjs" --include="*.html" --include="*.json" dashboard/ scripts/ .claude/ 2>/dev/null
grep -riE "$PD_PATTERNS" --include="*.md" CLAUDE.md README.md README.ru.md local-claude-codex-mailbox-workflow.md 2>/dev/null
echo "--scan done"

# V13 — whitelist drift
git status --short
# Expected: 3 M (supervisor+server+spec) + 1 new ?? (orchestrator.mjs) + 3 handoff artefacts
```

Any FAIL → STOP + §5.

### Phase 2 — user visual `[awaits user]`

| # | Check |
|---|-------|
| P2.1 | Dashboard runs, Tasks panel operational (P1 intact) |
| P2.2 | Create task via UI/curl → orchestrator launches через MockAdapter → task transitions к awaiting-reply automatically |
| P2.3 | `curl /api/runtime/state` shows new counters (taskTicksProcessed, taskTransitions, taskCyclesCompleted, taskAdapterErrors) |
| P2.4 | `cat mailbox-runtime/orchestrator-mock-calls.json` shows mock adapter invocations |
| P2.5 | User stop button → task → stopped (existing P1 flow + orchestrator respects terminal) |

### Phase 3 — cross-OS parity `[awaits user]`

Not applicable (no OS-specific code).

---

## §8 Acceptance criteria

- [ ] Phase 1 V1-V14 PASS (includes V9 6-probe cycle + V10 max-iter + V11 adapter-error threshold + V14 thread-mandatory)
- [ ] Report filled
- [ ] No files outside whitelist
- [ ] PD scan clean
- [ ] orchestrator.mjs validateAdapter check works
- [ ] supervisorHealth gets 4 new counters
- [ ] MockAdapter calls recorded к mailbox-runtime/orchestrator-mock-calls.json
- [ ] No commit/push without user command
- [ ] Phase 2 + Phase 3 awaits user

---

## §9 Out of scope

- Real Claude/Codex adapter implementations (P4)
- **Mailbox resolution break condition** — requires mailbox-lib archive read + supervisor.isThreadResolved helper (F5 honest downgrade post-R2). P3 tasks cannot auto-transition к `resolved`; only max-iter/failed/stopped are terminal paths.
- Coordinator restart recovery (P5+) — includes orchestrator crash mid-handoff recovery (F7 post-P3-R3 carryover): needs persisting `previousLastInboundMessageId` в task schema before transition к `handing-off`, so post-restart revert can restore it и enable safe retry of the same reply. P3 deliberately skips — `handing-off` state post-restart logs as unhandled и requires manual user-stop.
- Multi-task parallelism beyond sequential iteration (P5+)
- UI task timeline display (P5+)
- Task priority / reordering

---

## §10 Rollback

**До commit**:
1. `git diff --stat dashboard/orchestrator.mjs dashboard/supervisor.mjs dashboard/server.js local-claude-codex-mailbox-workflow.md`
2. Untracked: `rm -f dashboard/orchestrator.mjs`
3. `git checkout -- dashboard/supervisor.mjs dashboard/server.js local-claude-codex-mailbox-workflow.md`
4. `rm -f mailbox-runtime/orchestrator-mock-calls.json` (runtime-only)
5. Build clean.

**После commit**: `git revert <sha>`. Runtime state — orchestrator-mock-calls.json gitignored, manual delete если needed.

---

## §11 Discrepancy checkpoints (STOP)

1. P2 baseline drift >10 lines → STOP.
2. P3 adapter validation fails (P2 regression) → STOP.
3. P4 build fails → environment repair → re-run.
4. P5 orchestrator.mjs уже exists → STOP investigate.
5. Phase 1 V1-V14 any FAIL → STOP.
6. V9 cycle probes incomplete (6/6 PASS required) → STOP.
7. V10 max-iter transition doesn't fire → STOP core break logic broken.
8. V11 adapter-error threshold doesn't trigger failed → STOP error handling broken.
9. V13 whitelist drift → STOP.
10. Temptation добавить real Claude/Codex adapter → STOP + defer P4.
11. Temptation reach mailbox archive API directly — can be adversarial → STOP (use supervisor.state.pendingIndex только).

---

## §12 Self-audit checklist

- [ ] 1: P1-P5 pre-flight OK
- [ ] 2: Change 1 orchestrator.mjs created
- [ ] 3: Change 2.1 (supervisorHealth counters) applied
- [ ] 4: Change 2.2 (setOrchestrator hook) applied
- [ ] 5: Change 2.3 (pollTick tail orchestrator invocation) applied
- [ ] 6: Change 2.4 (return shape extended) applied
- [ ] 7: Change 2.5 (addTask thread mandatory) applied
- [ ] 8: Change 3 (server.js bootstrap + shutdown) applied
- [ ] 9: Change 4 (spec section) applied
- [ ] 10: V1-V14 recorded verbatim
- [ ] 11: V13 whitelist drift clean (+ V14 F6 probe)
- [ ] 12: No commit/push
- [ ] 13: Discrepancies recorded
- [ ] 14: Report §0-§10 filled
- [ ] 15: No real adapter implementations added (P4 defer)

≥13/15 OK → ready for user review.

---

## §13 Notes to Codex

- Environment: WSL, `cwd=/mnt/e/Project/workflow`.
- Baseline: HEAD=`836999d`.
- Anti-fabrication: V outputs verbatim.
- No new deps.
- Orchestrator uses MockAdapter (P2 import). **НЕ инжектить** real Claude/Codex adapter — P4 scope.
- `orchestrator.processTick()` должен быть non-throwing в pollTick context — errors logged, pollTick continues.
- `transitionTask` throws на illegal transitions (P1 ALLOWED_TRANSITIONS allow-list); orchestrator catches и marks failed после threshold.
- Mailbox reply detection на основе supervisor.state.pendingIndex `{thread, project, to}` match — НЕ прямой чтения agent-mailbox/.
- Iterations counter: each adapter.launch OR adapter.resume = +1 iteration. Cycle completion = one Codex↔Claude round-trip.

---

## §14 Commits strategy

**Single commit**:

```
feat(workflow): paperclip pivot P3 — orchestrator loop wired against MockAdapter

Phase P3 из paperclip-light rollout — coordinator loop wires task queue (P1) + adapter interface (P2) together. Exercises full cycle on MockAdapter before real adapters (P4).

Core changes:
- dashboard/orchestrator.mjs: NEW — createOrchestrator factory + processTick loop + handleTaskTick state machine progression (pending → launching → awaiting-reply → handing-off → awaiting-reply / terminal). Break conditions: max-iterations, adapter-error threshold (3 consecutive), user-stop. Counters recorded в supervisorHealth.
- dashboard/supervisor.mjs: +4 supervisorHealth counters (taskTicksProcessed/Transitions/CyclesCompleted/AdapterErrors) + setOrchestrator hook + pollTick tail orchestrator.processTick() invocation + return shape extended.
- dashboard/server.js: imports createOrchestrator + createMockAdapter; bootstrap wires orchestrator via supervisor.setOrchestrator; shutdown hook calls orchestrator.stop() before supervisor.stop().
- local-claude-codex-mailbox-workflow.md: +Orchestrator Loop (paperclip pivot P3) section describing state progression + break conditions + observability counters.

Phase P3 scope: orchestrator loop + MockAdapter cycle only. No real agent spawn (P4), no restart recovery (P5+), no UI timeline (P5+), no mailbox archive resolution detection (P4). Mock adapter calls recorded к mailbox-runtime/orchestrator-mock-calls.json для debugging.

Parent: 836999d (paperclip pivot P2 adapter contract + mock).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Push**: ждёт explicit user command.
