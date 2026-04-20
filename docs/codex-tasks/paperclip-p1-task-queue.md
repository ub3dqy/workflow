# Paperclip P1 — Task Queue Foundation — Execution Plan

**Version**: v1
**Planning-audit**: `docs/codex-tasks/paperclip-p1-task-queue-planning-audit.md`
**Report template**: `docs/codex-tasks/paperclip-p1-task-queue-report.md`
**Architecture parent**: `docs/codex-tasks/paperclip-pivot-architecture-plan.md` (approved R4)
**Baseline**: HEAD=`94c6749`
**Target executor**: Codex (WSL + Windows parity)
**Planner**: Claude (Windows)
**Scope**: Phase P1 из paperclip pivot rollout — persistent task queue с rich schema + atomic checkout + CRUD endpoints + read-only UI list. No adapter integration (P2+).

---

## §0 Compat rails + architecture commitments

- Rail #1 (cross-OS) ✅ pure Node + fs/promises + atomic rename (Phase A proven).
- Rail #3 (project isolation — baseline scope): tasks имеют mandatory `project` field; POST endpoint validates non-empty; list endpoint filters by project query param (optional).
- Rail #4 (thin layer): P1 = storage + CRUD. No agent logic, no process spawn.
- Rail #5-8 unchanged (no hook modifications в P1).
- Rail #10 (unsupported marking): Codex Windows native coordinator degraded — inherited, no new claims в P1.
- Architecture §1.0 commitment: coordinator-owned execution model — P1 задаёт storage foundation; P2+ добавят adapter + orchestrator поверх.

---

## §1 Why this plan exists

Architecture plan approved → P1 = first executable foundation. Task Queue storage + CRUD без adapter. Позволяет user видеть tasks в dashboard, future phases (P2-P4) добавят loop logic поверх existing persisted state.

---

## §2 Hierarchy of sources of truth

1. Architecture plan §6 P1 canonical task schema + state machine.
2. Phase A supervisor state + atomic persist pattern (proven).
3. Existing dashboard endpoints pattern (server.js routes).
4. This plan — derived.
5. Discrepancy → STOP + §5.

---

## §3 Doc verification

### §V1 — atomic writeJson pattern

Phase A §V1+V2 + P3 empirical PASS. Reuse verbatim for `persistTasks()`.

### §V2 — supervisor.state export

`return {router, start, stop, state}` at supervisor.mjs L205. server.js already accesses `supervisor.state.sessions` + `.pendingIndex` (Phase B + Phase C committed). Adding `supervisor.state.taskRegistry` — same pattern.

### §V3 — Express route handler conventions

Existing handlers use `async (request, response)` signature с `request.body`, `response.status(N).json({...})`. Reuse.

### §V4 — React Tasks panel pattern

Existing Phase A `runtimePanel` JSX + CSS — extend с аналогичный `tasksPanel`. App.jsx uses `t.labelKey` translations dict для ru/en.

### §V5 — Node 18+ `fetch()` и React useState/useEffect reuse

Phase A-C proven patterns. No new deps.

---

## §4 Pre-flight verification (Codex execute BEFORE any change)

### P1 — environment baseline

```bash
node --version
git rev-parse --short HEAD
git status --short
```

**Expected**: Node ≥20.19, HEAD=`94c6749` или newer. Baseline drift model per Phase A.

### P2 — baseline line counts

```bash
wc -l dashboard/server.js dashboard/supervisor.mjs dashboard/src/App.jsx dashboard/src/api.js .gitignore local-claude-codex-mailbox-workflow.md
```

Expected (post-`94c6749`):

| File | Lines |
|------|-------|
| `dashboard/server.js` | 305 |
| `dashboard/supervisor.mjs` | 206 |
| `dashboard/src/App.jsx` | 1781 |
| `dashboard/src/api.js` | 82 |
| `.gitignore` | 17 |
| `local-claude-codex-mailbox-workflow.md` | 881 |

Drift >5 → STOP.

### P3 — Phase A runtime state live check

```bash
TMPV7_PORT=$(ss -ltn 2>/dev/null | awk '{print $4}' | grep -c ':3003$')
if [ "$TMPV7_PORT" = "0" ]; then
  echo "P3 INFO: dashboard not running — запустить перед V8/V9"
else
  curl -s http://127.0.0.1:3003/api/runtime/state | node -e "
    const s = require('fs').readFileSync(0, 'utf8');
    const j = JSON.parse(s);
    console.log('sessions:', Array.isArray(j.sessions));
    console.log('pendingIndex:', Array.isArray(j.pendingIndex));
    console.log('supervisorHealth:', typeof j.supervisorHealth);
  "
fi
```

Expected: sessions + pendingIndex arrays, supervisorHealth object. FAIL → Phase A regression.

### P4 — baseline build

```bash
cd dashboard && npx vite build 2>&1 | tail -5
```

Expected: `✓ built`. FAIL → repair (wiki wsl-windows-native-binding-drift).

### P5 — existing routes sanity

```bash
grep -nE "app\.(get|post|use)\(" dashboard/server.js | head -20
```

Expected (post-`94c6749`):
- middleware (no-store)
- express.json
- /api/messages (GET ×2)
- /api/archive (POST)
- /api/notes (POST)
- /api/agent (agentRouter mount)
- /api/runtime (supervisor router mount)
- app.listen

Новый `/api/tasks` prefix unique.

---

## §5 Whitelist — only these files may be created/modified

| File | Purpose | Status |
|------|---------|--------|
| `dashboard/supervisor.mjs` | +state.taskRegistry Map + persistTasks() + addTask/transitionTask/listTasks/getTask/stopTask methods + load on start | modify |
| `dashboard/server.js` | +4 endpoints: POST /api/tasks, GET /api/tasks, GET /api/tasks/:id, POST /api/tasks/:id/stop | modify |
| `dashboard/src/api.js` | +4 fetch wrappers: createTask, fetchTasks, fetchTask, stopTask | modify |
| `dashboard/src/App.jsx` | +Tasks state + polling effect + tasksPanel JSX + CSS + translations (ru/en) | modify |
| `local-claude-codex-mailbox-workflow.md` | +«Task Queue (paperclip pivot P1)» section | modify |

**НЕ ТРОГАТЬ**:
- `scripts/*.mjs` — unchanged (no agent logic в P1)
- `dashboard/package.json` — no new deps
- `dashboard/vite.config.js`, `dashboard/index.html`
- `.gitignore` — no changes (mailbox-runtime/ already covers tasks.json)
- `agent-mailbox/**`
- `.claude/settings.local.json` — no hook changes
- `docs/codex-tasks/*` except P1 handoff trio
- `.github/workflows/ci.yml`
- `CLAUDE.md`, `README.md`, `README.ru.md`, `LICENSE`

---

## §6 Changes

### Change 1 — `dashboard/supervisor.mjs`

**Change 1.1** — extend state shape (L19-29 post-`94c6749`):

**Target**:

```js
const state = {
  sessions: new Map(),
  pendingIndex: [],
  taskRegistry: new Map(), // key = task.id, value = full task object per architecture §6 P1 schema
  supervisorHealth: {
    startedAt: null,
    lastTickAt: null,
    lastTickMs: 0,
    tickErrors: 0,
    isScanning: false
  }
};
```

**Change 1.2** — add `persistTasks` helper near existing persist* (after L134):

```js
async function persistTasks() {
  await atomicWriteJson(
    path.join(runtimeRoot, "tasks.json"),
    Array.from(state.taskRegistry.values())
  );
}
```

**Change 1.3** — add task helper functions (place before `return` at end of createSupervisor):

```js
const TASK_SCHEMA_VERSION = 1;

const TASK_STATES = new Set([
  "pending",
  "launching",
  "awaiting-reply",
  "handing-off",
  "resolved",
  "failed",
  "stopped",
  "max-iter-exceeded"
]);

const TERMINAL_STATES = new Set(["resolved", "failed", "stopped", "max-iter-exceeded"]);

// Explicit allow-list transitions (F1 fix post-Codex R1): only documented flows,
// prevents nonsensical jumps (pending → resolved etc.).
const ALLOWED_TRANSITIONS = {
  pending: new Set(["launching", "stopped", "failed"]),
  launching: new Set(["awaiting-reply", "failed", "stopped"]),
  "awaiting-reply": new Set(["handing-off", "failed", "stopped", "max-iter-exceeded", "resolved"]),
  "handing-off": new Set(["awaiting-reply", "resolved", "failed", "stopped", "max-iter-exceeded"])
  // terminal states have no outgoing transitions (guarded separately)
};

function buildTaskId(slug) {
  const ts = toUtcTimestamp().replace(/[:-]/g, "").replace(/\..*Z$/, "Z");
  const safeSlug = String(slug || "task").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40).replace(/^-|-$/g, "") || "task";
  return `task-${ts}-${safeSlug}`;
}

function normalizeAgent(value) {
  if (value === "claude" || value === "codex") return value;
  return null;
}

function addTask(input) {
  const project = typeof input.project === "string" ? input.project.trim() : "";
  if (!project) {
    throw new Error("task requires project");
  }
  const initialAgent = normalizeAgent(input.initialAgent);
  if (!initialAgent) {
    throw new Error("task requires initialAgent claude|codex");
  }
  const instruction = typeof input.instruction === "string" ? input.instruction.trim() : "";
  if (!instruction) {
    throw new Error("task requires instruction");
  }
  const maxIter = Number.isFinite(input.maxIterations)
    ? Math.max(1, Math.min(100, Math.floor(input.maxIterations)))
    : 10;
  const now = toUtcTimestamp();
  const task = {
    schemaVersion: TASK_SCHEMA_VERSION,
    id: buildTaskId(input.slug || instruction.slice(0, 40)),
    project,
    thread: typeof input.thread === "string" ? input.thread.trim() : "",
    instruction,
    initialAgent,
    currentAgent: null,
    nextAgent: initialAgent,
    sessionIds: { claude: "", codex: "" },
    lastInboundMessageId: "",
    lastOutboundMessageId: "",
    iterations: 0,
    maxIterations: maxIter,
    state: "pending",
    stopReason: "",
    error: "",
    createdAt: now,
    lastActivityAt: now,
    resolvedAt: ""
  };
  state.taskRegistry.set(task.id, task);
  return task;
}

function transitionTask(id, nextState, patch = {}) {
  const task = state.taskRegistry.get(id);
  if (!task) throw new Error(`unknown task id ${id}`);
  if (!TASK_STATES.has(nextState)) throw new Error(`invalid state ${nextState}`);
  if (TERMINAL_STATES.has(task.state)) {
    throw new Error(`task ${id} already terminal (${task.state})`);
  }
  const allowed = ALLOWED_TRANSITIONS[task.state];
  if (!allowed || !allowed.has(nextState)) {
    throw new Error(`illegal transition ${task.state} → ${nextState} for task ${id}`);
  }
  const next = { ...task, ...patch, state: nextState, lastActivityAt: toUtcTimestamp() };
  if (TERMINAL_STATES.has(nextState) && !next.resolvedAt) {
    next.resolvedAt = next.lastActivityAt;
  }
  state.taskRegistry.set(id, next);
  return next;
}

function stopTask(id, reason = "user-stop") {
  const task = state.taskRegistry.get(id);
  if (!task) throw new Error(`unknown task id ${id}`);
  if (TERMINAL_STATES.has(task.state)) return task;
  return transitionTask(id, "stopped", { stopReason: reason });
}

function listTasks(filters = {}) {
  const arr = Array.from(state.taskRegistry.values());
  const { project, state: stateFilter } = filters;
  return arr.filter((t) => {
    if (project && t.project !== project) return false;
    if (stateFilter && t.state !== stateFilter) return false;
    return true;
  }).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function getTask(id) {
  return state.taskRegistry.get(id) || null;
}
```

**Change 1.4** — extend `start()` to restore tasks from `tasks.json` (insert in existing load block near deliveries-style restore — follow same try/catch pattern used for other persisted state). Insert before `await persistSessions():`

```js
  try {
    const raw = await fs.readFile(path.join(runtimeRoot, "tasks.json"), "utf8");
    const persisted = JSON.parse(raw);
    if (Array.isArray(persisted)) {
      for (const entry of persisted) {
        if (!entry || typeof entry.id !== "string") continue;
        // Schema version check: P1 accepts only v1. Future P2+ добавит migration логику здесь.
        const version = typeof entry.schemaVersion === "number" ? entry.schemaVersion : 0;
        if (version !== TASK_SCHEMA_VERSION) {
          logger.error(`[supervisor] task ${entry.id} has schemaVersion=${version}, expected ${TASK_SCHEMA_VERSION}; skipping (add migration in future phase)`);
          continue;
        }
        state.taskRegistry.set(entry.id, entry);
      }
    }
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      logger.error("[supervisor] tasks.json restore failed:", error);
    }
  }
```

**Change 1.5** — `start()` adds `await persistTasks()` initialization (after `await persistHealth()`, before `await pollTick()`):

```js
  await persistSessions();
  await persistHealth();
  await persistTasks();
  await pollTick();
```

**Change 1.6** — extend `return` shape at end of createSupervisor:

```js
return {
  router,
  start,
  stop,
  state,
  addTask,
  transitionTask,
  stopTask,
  listTasks,
  getTask,
  persistTasks
};
```

### Change 2 — `dashboard/server.js`

**Change 2.0** — add 4 task endpoints. Insert после existing `/api/runtime` mount block (после `app.use("/api/runtime", supervisor.router);`). Endpoints operate directly на `supervisor.*` methods (taskRegistry не exposed for agent-path — this is user-path).

```js
app.post("/api/tasks", async (request, response) => {
  try {
    const task = supervisor.addTask(request.body || {});
    await supervisor.persistTasks();
    response.status(201).json({ task });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/tasks", (request, response) => {
  const project = typeof request.query.project === "string" ? request.query.project.trim() : undefined;
  const stateFilter = typeof request.query.state === "string" ? request.query.state.trim() : undefined;
  const tasks = supervisor.listTasks({ project, state: stateFilter });
  response.setHeader("Cache-Control", "no-store");
  response.json({ tasks });
});

app.get("/api/tasks/:id", (request, response) => {
  const task = supervisor.getTask(request.params.id);
  if (!task) {
    response.status(404).json({ error: "task not found" });
    return;
  }
  response.setHeader("Cache-Control", "no-store");
  response.json({ task });
});

app.post("/api/tasks/:id/stop", async (request, response) => {
  try {
    const reason = typeof request.body?.reason === "string" ? request.body.reason.trim() : "user-stop";
    const task = supervisor.stopTask(request.params.id, reason || "user-stop");
    await supervisor.persistTasks();
    response.json({ task });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.startsWith("unknown task id") ? 404 : 400;
    response.status(status).json({ error: message });
  }
});
```

### Change 3 — `dashboard/src/api.js`

Add wrappers at end of file:

```js
export async function createTask(body, signal) {
  const response = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
    cache: "no-store",
    signal
  });
  return parseJsonResponse(response, `Tasks API returned ${response.status}`);
}

export async function fetchTasks(params = {}, signal) {
  const query = new URLSearchParams();
  if (params.project) query.set("project", params.project);
  if (params.state) query.set("state", params.state);
  const qs = query.toString();
  const url = qs ? `/api/tasks?${qs}` : "/api/tasks";
  const response = await fetch(url, { cache: "no-store", signal });
  return parseJsonResponse(response, `Tasks API returned ${response.status}`);
}

export async function fetchTask(id, signal) {
  const response = await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
    cache: "no-store",
    signal
  });
  return parseJsonResponse(response, `Tasks API returned ${response.status}`);
}

export async function stopTask(id, reason, signal) {
  const response = await fetch(`/api/tasks/${encodeURIComponent(id)}/stop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: reason || "user-stop" }),
    cache: "no-store",
    signal
  });
  return parseJsonResponse(response, `Tasks API returned ${response.status}`);
}
```

### Change 4 — `dashboard/src/App.jsx`

**Change 4.1** — import update (top, line 2 post-`94c6749`). **Current** similar к: `import { archiveMessage, fetchMessages, fetchRuntimeState, postNote } from "./api.js";` — add 4 new:

```jsx
import { archiveMessage, createTask, fetchMessages, fetchRuntimeState, fetchTasks, postNote, stopTask } from "./api.js";
```

**Change 4.2** — translations (ru, добавить после existing keys):

```js
// ru
tasksTitle: "Задачи",
tasksEmpty: "Задач нет.",
tasksStart: "Создать задачу",
tasksProjectLabel: "Проект",
tasksAgentLabel: "Начинает",
tasksInstructionLabel: "Задание",
tasksIterationsLabel: "Итерации",
tasksStopAction: "Остановить",
tasksRefreshAction: "Обновить",
tasksStateLabel: "Статус",
```

And English:

```js
// en
tasksTitle: "Tasks",
tasksEmpty: "No tasks.",
tasksStart: "Start task",
tasksProjectLabel: "Project",
tasksAgentLabel: "Starts",
tasksInstructionLabel: "Instruction",
tasksIterationsLabel: "Iterations",
tasksStopAction: "Stop",
tasksRefreshAction: "Refresh",
tasksStateLabel: "State",
```

**Change 4.3** — state + polling. Near existing `runtimeState` state + effect:

```js
const [tasksState, setTasksState] = useState({ tasks: [], lastUpdatedAt: null });

useEffect(() => {
  const controller = new AbortController();
  async function load() {
    try {
      const data = await fetchTasks({}, controller.signal);
      setTasksState({
        tasks: Array.isArray(data.tasks) ? data.tasks : [],
        lastUpdatedAt: new Date().toISOString()
      });
    } catch (loadError) {
      if (!(loadError instanceof DOMException && loadError.name === "AbortError")) {
        // non-fatal
      }
    }
  }
  void load();
  const intervalId = window.setInterval(load, pollIntervalMs);
  return () => {
    controller.abort();
    window.clearInterval(intervalId);
  };
}, []);
```

**Change 4.4** — JSX Tasks panel. Insert **after** existing `runtimePanel` section (после closing `</section>` of runtimePanel, before conditional error banner OR grid — follow runtimePanel insertion point pattern):

```jsx
<section className="tasksPanel">
  <div className="tasksHeader">
    <h2>{t.tasksTitle} ({tasksState.tasks.length})</h2>
  </div>
  {tasksState.tasks.length === 0 ? (
    <p className="columnHint">{t.tasksEmpty}</p>
  ) : (
    <ul className="tasksList">
      {tasksState.tasks.map((task) => (
        <li key={task.id} className="tasksItem">
          <div className="tasksTopRow">
            <span className="chip">{task.state}</span>
            <span className="chip chipProject">{task.project}</span>
            <span className="chip">{task.currentAgent || task.nextAgent || task.initialAgent}</span>
            <span className="mono tasksIdMono">{task.id}</span>
          </div>
          <div className="tasksInstruction">{task.instruction}</div>
          <div className="tasksMeta">
            <span>{t.tasksIterationsLabel}: {task.iterations}/{task.maxIterations}</span>
            <span className="timestamp">{formatTimestamp(task.lastActivityAt || task.createdAt, lang, t)}</span>
            {task.stopReason ? <span className="chip">{task.stopReason}</span> : null}
          </div>
          {task.state !== "resolved" && task.state !== "failed" && task.state !== "stopped" && task.state !== "max-iter-exceeded" ? (
            <button
              type="button"
              className="tasksStopButton"
              onClick={async () => {
                try {
                  await stopTask(task.id);
                } catch {}
              }}
            >
              {t.tasksStopAction}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  )}
</section>
```

**Change 4.5** — CSS in styles template string:

```css
.tasksPanel {
  margin: 0 0 24px;
  padding: 16px;
  border: 1px solid var(--border-soft);
  border-radius: 16px;
  background: var(--surface-stat);
}
.tasksHeader h2 {
  margin: 0 0 12px;
  font-size: 14px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-accent);
}
.tasksList {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}
.tasksItem {
  padding: 10px;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  background: var(--surface);
  display: grid;
  gap: 6px;
  font-size: 12px;
}
.tasksTopRow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.tasksIdMono {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.7;
}
.tasksInstruction {
  font-size: 13px;
  line-height: 1.4;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}
.tasksMeta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
}
.tasksStopButton {
  justify-self: start;
  padding: 4px 10px;
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
}
.tasksStopButton:hover {
  background: var(--surface-stat);
}
```

### Change 5 — `local-claude-codex-mailbox-workflow.md`

Найти конец «Phase C — Agent delivery endpoint» section (после «Codex Windows native Codex = degraded» paragraph — примерно L375 post-cleanup). Вставить после неё новую section:

```markdown

### Task Queue (paperclip pivot P1)

Paperclip-light pivot стартует с persistent task queue в supervisor backend (см. `docs/codex-tasks/paperclip-pivot-architecture-plan.md`):

- **Runtime file**: `mailbox-runtime/tasks.json` — atomic write+rename, survives coordinator restart. Schema per architecture §6 P1 (14 fields + 8-state enum).
- **Endpoints** (user-path, `/api/tasks`):
  - `POST /api/tasks` — create task with `{project, initialAgent, instruction, thread?, maxIterations?}`
  - `GET /api/tasks` — list (optional `?project=X&state=Y` filters)
  - `GET /api/tasks/:id` — detail
  - `POST /api/tasks/:id/stop` — user stop, transitions к `stopped` state
- **State machine** (P1 transitions are storage-only; P3 orchestrator добавит active transitions):
  - `pending → launching → awaiting-reply → handing-off → (awaiting-reply | resolved | failed | stopped | max-iter-exceeded)`
  - Terminal states: `resolved`, `failed`, `stopped`, `max-iter-exceeded`
- **UI**: Tasks panel в dashboard — read-only list + Stop button per active task.
- **Out of scope P1**: adapter launch (P2), orchestrator loop (P3), real agent spawn (P4), coordinator restart recovery (P5+).
- **Project isolation baseline**: task `project` mandatory, list filter respects query. No new leak vectors; existing follow-up (memory `project_isolation_open_followup.md`) post-P4.
```

---

## §7 Verification phases

### Phase 1 — Codex-only (WSL execution)

**Mandatory order**: Change 1 (supervisor additions) → Change 2 (server endpoints, depend on supervisor methods) → Change 3 (api.js wrappers) → Change 4 (App.jsx UI) → Change 5 (spec).

| # | Check | Expected |
|---|-------|----------|
| V1 | supervisor.mjs parses | `node --check` OK |
| V2 | server.js parses | `node --check` OK |
| V3 | Build passes | `✓ built` |
| V4 | supervisor exports task helpers | grep ≥5 export-ish patterns |
| V5 | server.js has 4 task endpoints | grep =4 |
| V6 | api.js has 4 wrapper exports | grep =4 |
| V7 | App.jsx has tasksPanel + Tasks import | grep ≥3 |
| V8 | Spec section «Task Queue (paperclip pivot P1)» | grep =1 |
| V9 | Empirical CRUD end-to-end | 6 sub-probes (create/list/get/stop/persist + illegal-transition guard) |
| V10 | PD scan | `--scan done` |
| V11 | Whitelist drift | 5 M + 3 handoff artefacts |

Verification commands:

```bash
# V1
node --check dashboard/supervisor.mjs && echo "V1 PASS"

# V2
node --check dashboard/server.js && echo "V2 PASS"

# V3
cd dashboard && npx vite build 2>&1 | tail -5

# V4 — task helpers присутствуют в return
grep -cE 'addTask|transitionTask|stopTask|listTasks|getTask' dashboard/supervisor.mjs
# Expected: ≥10 (declarations + return listing)

# V5
grep -cE '"/api/tasks(/:id(/stop)?)?"' dashboard/server.js
# Expected: 4

# V6
grep -cE '^export async function (createTask|fetchTasks|fetchTask|stopTask)' dashboard/src/api.js
# Expected: 4

# V7
grep -cE 'tasksPanel|fetchTasks|tasksTitle' dashboard/src/App.jsx
# Expected: ≥3

# V8
grep -c 'Task Queue (paperclip pivot P1)\|### Task Queue' local-claude-codex-mailbox-workflow.md
# Expected: 1

# V9 — empirical CRUD (requires dashboard running)
TMPV9_PORT=$(ss -ltn 2>/dev/null | awk '{print $4}' | grep -c ':3003$')
if [ "$TMPV9_PORT" = "0" ]; then
  echo "V9 SKIP: dashboard not running — user runs V9 during Phase 2"
else
  # 9a — create
  RESP_9A=$(curl -s -X POST -H "Content-Type: application/json" -d '{"project":"workflow","initialAgent":"codex","instruction":"P1 V9 smoke test task"}' http://127.0.0.1:3003/api/tasks)
  TASK_ID=$(echo "$RESP_9A" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(d.task && d.task.id || '');")
  if [ -n "$TASK_ID" ]; then
    echo "V9a PASS: created $TASK_ID"
  else
    echo "V9a FAIL: no task id in response: $RESP_9A"
  fi

  # 9b — list includes
  LIST_9B=$(curl -s "http://127.0.0.1:3003/api/tasks?project=workflow")
  HAS=$(echo "$LIST_9B" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(d.tasks.some((t) => t.id === '$TASK_ID'));")
  if [ "$HAS" = "true" ]; then
    echo "V9b PASS: task appears in list"
  else
    echo "V9b FAIL"
  fi

  # 9c — get single
  GET_9C=$(curl -s "http://127.0.0.1:3003/api/tasks/$TASK_ID")
  STATE_9C=$(echo "$GET_9C" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(d.task && d.task.state);")
  if [ "$STATE_9C" = "pending" ]; then
    echo "V9c PASS: state=pending"
  else
    echo "V9c FAIL: state=$STATE_9C"
  fi

  # 9d — stop
  STOP_9D=$(curl -s -X POST -H "Content-Type: application/json" -d '{"reason":"v9d-smoke"}' "http://127.0.0.1:3003/api/tasks/$TASK_ID/stop")
  STOP_STATE=$(echo "$STOP_9D" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(d.task && d.task.state);")
  if [ "$STOP_STATE" = "stopped" ]; then
    echo "V9d PASS: state=stopped"
  else
    echo "V9d FAIL: state=$STOP_STATE"
  fi

  # 9e — persist verified (+schemaVersion check post-F2)
  if [ -f mailbox-runtime/tasks.json ]; then
    HAS_PERSIST=$(node -e "const d=JSON.parse(require('fs').readFileSync('mailbox-runtime/tasks.json','utf8')); console.log(Array.isArray(d) && d.some((t) => t.id === '$TASK_ID' && t.state === 'stopped' && t.schemaVersion === 1));")
    if [ "$HAS_PERSIST" = "true" ]; then
      echo "V9e PASS: tasks.json has stopped task with schemaVersion=1"
    else
      echo "V9e FAIL: not persisted or schemaVersion missing/mismatched"
    fi
  else
    echo "V9e FAIL: tasks.json missing"
  fi

  # 9f — illegal transition guard (F1 fix) — attempt stop on already-stopped task → 400 from API (transitionTask throws)
  STOP_AGAIN=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{"reason":"double-stop"}' "http://127.0.0.1:3003/api/tasks/$TASK_ID/stop")
  # Plan: stopTask returns early if already terminal (no throw) so API returns 200 with unchanged task.
  # For illegal-transition probe, we need different test: create a NEW task, attempt direct illegal transition via API if endpoint exposes it.
  # Since API only exposes POST/stop (allowed transition), direct illegal jump isn't achievable via public API в P1.
  # We test via supervisor.transitionTask directly using node -e probe.
  ILLEGAL_PROBE=$(node -e "
    import('./dashboard/supervisor.mjs').then(async (m) => {
      const sup = m.createSupervisor({mailboxRoot: '/tmp/noop', runtimeRoot: '/tmp/noop-rt', pollIntervalMs: 99999});
      const t = sup.addTask({project: 'workflow', initialAgent: 'codex', instruction: 'illegal-test'});
      try {
        sup.transitionTask(t.id, 'resolved');
        console.log('FAIL: illegal transition pending→resolved was allowed');
      } catch (e) {
        if (e.message.includes('illegal transition')) {
          console.log('PASS: illegal transition rejected:', e.message);
        } else {
          console.log('FAIL: wrong error:', e.message);
        }
      }
    }).catch((e) => console.log('LOAD_FAIL:', e.message));
  " 2>&1)
  echo "V9f: $ILLEGAL_PROBE"
fi

# V10 — PD scan
PD_PATTERNS='$PD_PATTERNS'
grep -riE "$PD_PATTERNS" --include="*.js" --include="*.jsx" --include="*.mjs" --include="*.html" --include="*.json" dashboard/ scripts/ .claude/ 2>/dev/null
grep -riE "$PD_PATTERNS" --include="*.md" CLAUDE.md README.md README.ru.md local-claude-codex-mailbox-workflow.md 2>/dev/null
echo "--scan done"

# V11 — whitelist drift
git status --short
# Expected: 5 M (supervisor + server.js + api.js + App.jsx + spec) + 3 handoff artefacts + possibly M mailbox-runtime/tasks.json (runtime; gitignored)
```

Any FAIL → STOP + §5.

### Phase 2 — user visual `[awaits user]`

| # | Check |
|---|-------|
| P2.1 | Dashboard запустить → Tasks panel visible, empty state («Задач нет.») |
| P2.2 | Create task через curl (см. V9a payload) → refresh dashboard → task видна с state=pending |
| P2.3 | Click «Остановить» → state transitions к stopped |
| P2.4 | `ls mailbox-runtime/tasks.json && cat mailbox-runtime/tasks.json` — json non-empty |
| P2.5 | Restart coordinator (stop+start dashboard) → Tasks panel reloads same task from persisted state |

### Phase 3 — cross-OS parity `[awaits user]`

| # | Check |
|---|-------|
| P3.1 | Windows native: tasks panel works identically |
| P3.2 | WSL: tasks panel works identically |
| P3.3 | Coordinator restart recovery = task records only (not loop — acknowledged out-of-scope P5+) |

---

## §8 Acceptance criteria

- [ ] Phase 1 V1-V11 PASS
- [ ] Report filled
- [ ] No files outside whitelist
- [ ] PD scan clean
- [ ] tasks.json создаётся + persists
- [ ] State machine guards: terminal → terminal blocked (via transitionTask throws)
- [ ] UI panel shows list + Stop button
- [ ] Baseline project isolation preserved (no new leak vectors)
- [ ] No commit/push без user command
- [ ] Phase 2 + Phase 3 awaits user

---

## §9 Out of scope

- Adapter interface (P2).
- Orchestrator loop (P3).
- Real agent spawn (P4).
- Coordinator restart recovery for in-flight tasks (P5+).
- Task priority / ordering.
- Task deletion / archiving (P5+).
- Multi-task concurrency optimization (P5+).
- Full project isolation follow-up (post-P4 per memory).

---

## §10 Rollback

**До commit**:
1. `git diff --stat dashboard/supervisor.mjs dashboard/server.js dashboard/src/api.js dashboard/src/App.jsx local-claude-codex-mailbox-workflow.md`
2. `git stash push -m "paperclip-p1-rollback" -- dashboard/supervisor.mjs dashboard/server.js dashboard/src/api.js dashboard/src/App.jsx local-claude-codex-mailbox-workflow.md`
3. `rm -f mailbox-runtime/tasks.json` (runtime-only gitignored)
4. `cd dashboard && npx vite build` — baseline clean

**После commit**: `git revert <sha>`. `mailbox-runtime/tasks.json` — runtime, manual delete если нужно.

---

## §11 Discrepancy checkpoints (STOP)

1. P2 baseline drift >5 → STOP.
2. P3 live state probe не показывает sessions/pendingIndex/supervisorHealth → Phase A regression.
3. P4 build fails → environment repair → re-run.
4. P5 existing routes conflict (`/api/tasks` уже present) → STOP + investigate.
5. Phase 1 V1-V11 any FAIL → STOP.
6. V9a returns empty task id → supervisor state corruption → STOP.
7. V11 whitelist drift → STOP.
8. Modification `scripts/*.mjs` / `mailbox-lib.mjs` / `.claude/settings.local.json` → STOP (out of P1 scope).
9. Temptation adding adapter/orchestrator logic → STOP + defer P2+.

---

## §12 Self-audit checklist

- [ ] 1: P1-P5 pre-flight OK
- [ ] 2: Change 1.1 (state.taskRegistry) applied
- [ ] 3: Change 1.2 (persistTasks) applied
- [ ] 4: Change 1.3 (task helper functions) applied
- [ ] 5: Change 1.4+1.5 (start restore + init) applied
- [ ] 6: Change 1.6 (return shape extended) applied
- [ ] 7: Change 2 (4 server endpoints) applied
- [ ] 8: Change 3 (api.js 4 wrappers) applied
- [ ] 9: Change 4 (App.jsx UI) applied — 5 substeps
- [ ] 10: Change 5 (spec section) applied
- [ ] 11: V1-V11 recorded verbatim
- [ ] 12: V11 whitelist drift clean
- [ ] 13: No commit/push
- [ ] 14: Discrepancies recorded
- [ ] 15: No adapter/orchestrator code added (P2+ scope)

≥13/15 OK → ready for user review.

---

## §13 Notes to Codex

- Environment: WSL, `cwd=/mnt/e/Project/workflow`.
- Baseline: HEAD=`94c6749`. Newer master touching whitelist → STOP.
- Anti-fabrication: V outputs verbatim.
- No new deps.
- Project isolation: validate `project` field mandatory на create; list filter respects query. Don't introduce cross-project leak.
- Task ID slug generation: lowercase alphanumeric + hyphens only; truncate к 40 chars. Avoid collision через UTC timestamp prefix.
- State machine guards: terminal transitions throw — test case V9 проверяет stop на pending (allowed), не на resolved (would throw).
- MockAdapter / real agent spawn — **explicitly out of P1**. Tempting к add fake currentAgent transitions в P1 для UI demo — НЕ делать, orchestrator P3 handles state transitions mid-loop.

---

## §14 Commits strategy

**Single commit**:

```
feat(workflow): paperclip pivot P1 — persistent task queue foundation

Core changes:
- dashboard/supervisor.mjs: +state.taskRegistry Map + persistTasks() + addTask/transitionTask/stopTask/listTasks/getTask helpers + tasks.json restore on start. State machine 8-state enum + TERMINAL_STATES guard.
- dashboard/server.js: +4 endpoints POST/GET/:id/stop operating on supervisor.* task helpers.
- dashboard/src/api.js: +4 fetch wrappers (createTask, fetchTasks, fetchTask, stopTask).
- dashboard/src/App.jsx: +tasksState + polling effect + Tasks panel JSX + CSS + ru/en translations (Stop button per active task).
- local-claude-codex-mailbox-workflow.md: +Task Queue (paperclip pivot P1) section.

Phase P1 scope: persistent storage + CRUD + read-only UI. No adapter (P2), no orchestrator (P3), no real agent spawn (P4). Coordinator restart recovery for in-flight tasks = P5+.

Baseline project isolation preserved (task project mandatory + list filter). Full isolation follow-up remains post-P4 (memory project_isolation_open_followup.md).

Parent: 94c6749 (revert broken Stop hook delivery — paperclip pivot baseline).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Push: ждёт explicit user command.
