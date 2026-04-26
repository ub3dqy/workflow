# mailbox-codex-app-server-bridge — Planning audit

**Plan**: `docs/codex-tasks/mailbox-codex-app-server-bridge.md`
**Stage**: 7A
**Planner**: Claude
**Audit mode**: pre-exec
**Version**: 1

---

## 1.0 Base-state check

Before code execution begins, confirm the bridge surface is clean:

```bash
git rev-parse HEAD
git status --short -- \
  dashboard/server.js \
  dashboard/codex-bridge.mjs \
  scripts/codex-app-server-client.mjs \
  scripts/codex-app-server-smoke.mjs \
  test/codex-app-server-client.test.mjs \
  test/codex-bridge.test.mjs \
  docs/codex-tasks/mailbox-codex-app-server-bridge.md \
  docs/codex-tasks/mailbox-codex-app-server-bridge-planning-audit.md \
  docs/codex-tasks/mailbox-codex-app-server-bridge-report.md \
  docs/codex-tasks/mailbox-codex-app-server-bridge-work-verification.md
```

Expected for the actual execution start:

- current `master` plus the approved docs commit;
- no unrelated dirty changes inside the Stage 7A code surface;
- unrelated user work outside this path does not block execution.

## 1. Pre-exec research

### 1.1 Official Codex docs (verified 2026-04-24)

The current official OpenAI docs confirm:

- app-server lifecycle is `initialize -> initialized -> thread/start|thread/resume -> turn/start -> optional turn/steer`;
- `thread/loaded/list`, `thread/read`, `thread/resume`, `turn/start`, and `turn/steer` are first-class app-server methods;
- WebSocket transport is experimental and should stay loopback-local;
- Codex hooks are experimental and currently disabled on Windows.

Implications for this plan:

- WSL is the supported Codex path for this repo;
- plain CLI still has no inbound API;
- `app-server + --remote` is the only confirmed Codex path for a live-chat reminder;
- the bridge must treat non-loopback WebSocket deployment as out of scope.

### 1.2 Local code anchors in the repo

| File | Lines | Finding |
|---|---|---|
| `dashboard/supervisor.mjs` | `36-45` | `/api/runtime/state` already exposes `sessions`, `activeSessions`, `pendingIndex`, and `supervisorHealth`. |
| `dashboard/supervisor.mjs` | `48-95` | Session registry already exists and persists `session_id`, `agent`, `project`, `cwd`, `transport`, `platform`, `last_seen`. |
| `dashboard/supervisor.mjs` | `150-178` | Pending mailbox index already exists and is refreshed every poll tick. |
| `dashboard/server.js` | `249-302` | Existing agent-path `/api/agent/runtime/deliveries` already defines the correct delivery vocabulary: scope by `session.agent + session.project`, no mailbox mutation. |
| `scripts/mailbox-session-register.mjs` | `72-116` | Codex/Claude hooks already post session registration to supervisor. The bridge must reuse this registry instead of inventing a new one. |
| `scripts/codex-app-server-smoke.mjs` | `312-354` | Existing smoke tool already proved the required protocol sequence: `thread/loaded/list`, `thread/resume`, `turn/start`, optional `turn/steer`. |

### 1.3 Critical prior decisions from wiki

The new stage must remain consistent with these already-extracted rules:

- **Hybrid automation**: business logic stays in `workflow` backend; hooks stay thin.
- **No scope creep**: do not rebuild another coordinator/orchestrator layer.
- **Plain CLI no inbound API**: still true; the new path works only because app-server changes the architecture.
- **Docs -> proof -> plan -> code**: already satisfied here, because official docs were checked and the user validated a live WSL proof before the plan.

Also carry the explicit user-side operating assumption from 2026-04-24:

- one Claude + one Codex per project;
- mailbox handoff is sequential (`Claude -> Codex -> Claude -> ...`);
- same-project concurrent Codex windows are exceptional, not the target workflow.

Also carry the UX requirement added on 2026-04-24:

- dashboard should become the operator control page for support processes;
- human should not need extra visible terminals for backend/app-server/bridge;
- hidden launch should reuse the existing Windows->WSL launcher pattern rather than inventing a new orchestration stack.
- hidden launch should be the default user path, not a niche side wrapper;
- dashboard should expose a close/shutdown action because hidden support terminals cannot be closed manually by watching the launcher window.

## 2. Hard constraints for implementation

1. **Loopback only in v1.** Accept only `ws://127.0.0.1:*` or `ws://localhost:*`. Reject anything else.
2. **No mailbox mutation from the bridge.** The bridge must never call `markMessageReceived`, `reply`, `archive`, or write mailbox message files.
3. **No automatic active-turn interruption.** The bridge uses `turn/start` only. `turn/steer` stays manual/smoke-only in v1.
4. **No `thread/inject_items` in the automatic path.** Local testing already showed it is less reliable and unnecessary for this use case.
5. **Fail closed on ambiguous project targeting.** If the bridge cannot prove a unique loaded thread for the session/project, it must not inject anything.
6. **Dedup must survive restart.** Delivery suppression cannot live only in memory.
7. **Reuse current session binding semantics.** Matching between session `cwd` and thread `cwd` must use the same case-folded `/mnt/<drive>/...` logic already used by mailbox session resolution.
8. **Support processes should be dashboard-managed.** Manual shell commands stay as debug fallback, not as the primary operator workflow.
9. **Do not promise a web replacement for Codex chat.** Actual Codex interactive work surface remains the remote TUI window; this stage only hides/manages support processes.

## 3. Concrete change list

### 3.1 `scripts/codex-app-server-client.mjs`

Create a reusable client module extracted from the smoke script:

- WebSocket transport only in v1.
- Request/response correlation with timeouts.
- Notification buffering and `waitForNotification(...)`.
- Thin wrappers for:
  - `initialize`
  - `thread/loaded/list`
  - `thread/read`
  - `thread/resume`
  - `turn/start`

No bridge policy lives here. This module is transport-only.

### 3.2 `scripts/codex-app-server-smoke.mjs`

Refactor the existing smoke tool to import the new client module and keep its current operator workflow unchanged:

- still supports `--list-loaded`;
- still supports reusing `--thread-id`;
- still supports explicit `--cwd`;
- still supports manual `--steer`.

This script remains the manual proof tool for real app-server sessions after code changes.

### 3.3 `dashboard/codex-bridge.mjs`

Create a small bridge worker with the following shape:

```js
export function createCodexBridge({
  runtimeRoot,
  wsUrl,
  getSupervisorSnapshot,
  createClient,
  pollIntervalMs = 3000,
  logger = console,
}) { ... }
```

Responsibilities:

- keep a small `health` object;
- persist `deliveries.json` and `codex-bridge-health.json` atomically;
- derive project-scoped reminder batches from supervisor snapshot;
- query app-server only when there is pending Codex work worth checking;
- match loaded threads to active Codex sessions by `cwd`;
- record blocked states when delivery is unsafe;
- call `thread/resume` + `turn/start` only for a unique idle match;
- suppress duplicate sends for already-signaled mailbox files.

The bridge does **not** own mailbox truth. It is a transport adapter over existing supervisor state.

### 3.4 `dashboard/codex-app-server-manager.mjs`

Create a small process manager for the hidden support transport:

- start/stop/status lifecycle for Codex app-server;
- loopback-only `ws://127.0.0.1:<port>` or `ws://localhost:<port>`;
- readiness via app-server `readyz`/`healthz`, not mere process existence;
- idempotent start: if already healthy, return current status instead of starting duplicates;
- Windows path uses the proven `wsl.exe` launcher pattern from wiki;
- WSL/Linux path may spawn `codex app-server` directly;
- optional persisted diagnostic metadata under `mailbox-runtime/`, but no new source of truth.

### 3.5 `dashboard/server.js`

Wire the new bridge into the existing dashboard/server lifecycle:

- construct supervisor, app-server manager, then bridge;
- pass `runtimeRoot` and a small `getSupervisorSnapshot()` callback;
- start bridge after `await supervisor.start()`;
- stop bridge and app-server manager during shutdown;
- add `GET /api/runtime/codex-bridge` returning:

```json
{
  "health": { ... },
  "deliveries": [ ... ]
}
```

Add dashboard control endpoints:

- `GET /api/runtime/codex-transport`
- `POST /api/runtime/codex-transport/start`
- `POST /api/runtime/codex-transport/stop`
- `POST /api/runtime/codex-transport/restart`

These endpoints manage hidden support processes only. They do not launch or replace the visible Codex chat window.

### 3.6 `dashboard/src/api.js` + `dashboard/src/App.jsx`

Add a small operator panel to the runtime section:

- transport status label (`stopped`, `starting`, `ready`, `degraded`, `error`);
- last health tick / last error;
- action buttons `Start`, `Stop`, `Restart`;
- short help text clarifying that dashboard manages support processes, while the actual Codex project chat remains a separate visible window.

Scope discipline:

- no card-grid redesign;
- no mailbox interaction semantics changed;
- no full-screen control console.

### 3.7 Tests

Automated coverage:

- `test/codex-app-server-client.test.mjs`
- `test/codex-app-server-manager.test.mjs`
- `test/codex-bridge.test.mjs`

Manager/bridge tests use fakes and do not depend on a live Codex app-server.

Manual operator proof after implementation:

- existing `scripts/codex-app-server-smoke.mjs`;
- real WSL `codex app-server`;
- real `codex --remote`.

## 4. Delivery algorithm (exact)

Per tick:

1. Load persisted delivery ledger.
2. Read supervisor snapshot:
   - active sessions = `sessions` filtered by 60s TTL and `agent === "codex"`;
   - pending entries = `pendingIndex` filtered by `to === "codex"` and `deliverable === true`.
3. Prune ledger rows whose `relativePath` is no longer pending.
4. If no pending Codex entries remain, persist cleanup and stop.
5. If `wsUrl` is missing or rejected by policy, write disabled health and stop.
6. If transport manager reports app-server not ready, write blocked health and stop without bridge delivery attempts.
7. Connect client and run `initialize`.
8. Call `thread/loaded/list`.
9. For each loaded thread id, call `thread/read` and build a `cwd -> thread` candidate map.
10. Group pending mailbox rows by project.
11. For each project batch:
    - find active Codex sessions for that project;
    - if none: mark each unsignaled row `blocked_no_session`;
    - else find loaded threads whose `cwd` matches one of those session `cwd` values;
    - if zero: `blocked_no_thread`;
    - if more than one unique thread: `blocked_ambiguous_thread`;
    - if exactly one but `thread.status.type !== "idle"`: `blocked_active_turn`;
    - else:
      - skip rows already `signaled`;
      - build one deterministic reminder prompt for the remaining rows;
      - `thread/resume(threadId, cwd)` for this connection;
      - `turn/start(threadId, cwd, input=[prompt])`;
      - mark every delivered row `signaled` with `threadId`, `turnId`, `deliveredAt`.
12. Persist ledger + health.

Important execution semantic: this algorithm is **project-local**. A blocked batch for project `B` must not prevent delivery attempts for projects `A/C/D` in the same tick.

Important operating semantic: the expected happy path is a unique idle Codex thread per project when that project has pending Codex mail, because Claude and Codex normally work the same project in alternation rather than simultaneously.

## 5. Acceptance Criteria

| AC | Requirement | Verification strategy |
|---|---|---|
| AC-1 | Shared client module can correlate requests, responses, and notifications correctly | Automated fake-transport test |
| AC-2 | Smoke script still supports `--list-loaded`, `--thread-id`, `--prompt`, `--steer`, `--cwd` after refactor | `node --check` + local script test |
| AC-3 | Dashboard transport manager can report `stopped` state without requiring manual service terminals | Automated manager test |
| AC-4 | Dashboard transport manager starts loopback app-server idempotently and detects readiness by health endpoint | Automated manager test |
| AC-5 | Dashboard transport manager rejects non-loopback URLs in v1 | Automated manager test |
| AC-6 | Bridge stays disabled when transport manager is not ready | Automated bridge test |
| AC-7 | No active Codex session for the project -> `blocked_no_session`, no app-server call | Automated bridge test |
| AC-8 | Active session exists but no loaded thread matches -> `blocked_no_thread`, no `turn/start` | Automated bridge test |
| AC-9 | More than one loaded thread matches -> `blocked_ambiguous_thread`, no `turn/start` | Automated bridge test |
| AC-10 | Exactly one idle loaded thread matches -> bridge calls `thread/resume` then `turn/start` once, batched by project | Automated bridge test |
| AC-11 | Delivered mailbox files are not re-signaled after bridge restart while they remain pending | Automated persistence test |
| AC-12 | Delivery rows are pruned when their mailbox files leave pending state | Automated bridge test |
| AC-13 | Automatic bridge path never calls `turn/steer` or `thread/inject_items` | Code inspection + test spy |
| AC-14 | Automatic bridge path never mutates mailbox files or `received_at` | Code inspection + fixture diff |
| AC-15 | Dashboard page exposes transport status with safe Start control plus a confirmed Force-stop emergency action; legacy Stop/Restart API calls fail closed without disconnecting live `codex --remote` sessions | Browser/manual UI probe + route regression |
| AC-16 | `GET /api/runtime/codex-bridge` and transport status endpoints return coherent health data | HTTP probe |
| AC-17 | Real WSL smoke after implementation still injects a live reminder into `codex --remote` TUI, while support processes can be run hidden from the operator | Manual proof |

## 6. Major risks and how the plan handles them

### R1 — wrong launch `cwd`

If the remote Codex TUI is started from `/home/...` instead of the project root, thread `cwd` will not match the mailbox session/project binding and the bridge will never target it.

Plan response:

- treat this as `blocked_no_thread`, not as a silent fallback;
- keep operator setup explicit in the brief;
- preserve the smoke tool so the operator can inspect loaded threads quickly.

### R2 — same-project multi-window duplication

Two remote Codex windows for the same project create a real ambiguity problem.

Plan response:

- v1 does not guess;
- `blocked_ambiguous_thread` is explicit and fail-closed;
- roadmap point 8 remains the place for lease/claim hardening if this becomes operationally painful.

This ambiguity is also **local to that project only**. It must not downgrade or pause delivery for other projects that still have a unique idle Codex thread.

Because the user's normal workflow is one Codex per project, this remains a defensive edge case rather than a primary design center for Stage 7A.

### R3 — WebSocket transport is experimental

Official docs still mark app-server WebSocket transport as experimental.

Plan response:

- keep scope loopback-local;
- keep the bridge small and stateless between ticks except for the delivery ledger;
- preserve the standalone smoke client as the operator-level proof tool.

### R4 — dashboard-control UX can sprawl into a new product

The user asked for a dashboard-first experience, but this can easily turn into “build a full web replacement for Codex”.

Plan response:

- dashboard controls only hidden support services;
- actual Codex chat window remains the real work surface;
- UI scope is one small runtime/transport panel, not a redesign.

### R5 — prior mailbox `received_at` traps

The repo already documents that display-facing `received_at` fields can be derived for some surfaces and are not always safe as unread truth.

Plan response:

- bridge dedup uses its own persistent delivery ledger keyed by mailbox file path;
- this stage does not depend on raw `received_at` transitions to suppress duplicate reminders.

### R6 — shutdown / crash consistency

If the bridge crashes after sending a turn but before persisting state, duplicate reminders can happen after restart.

Plan response:

- persist the ledger immediately after successful delivery;
- use atomic write semantics identical to supervisor runtime files.

## 7. Execution order

1. Create shared app-server client module.
2. Refactor smoke tool onto the shared client.
3. Implement hidden app-server manager with fake tests.
4. Implement bridge worker with fake-client-driven unit tests.
5. Wire manager + bridge into `dashboard/server.js` and add control/status endpoints.
6. Add the small dashboard runtime/transport panel.
7. Run automated tests.
8. Run live proof with hidden support processes + visible remote Codex work surface.
9. Fill execution report.
10. Hand package to Codex for review and verification.

## 8. Verdict

The stage is implementation-ready.

It is deliberately narrower than the abandoned monitor/orchestrator work:

- no launcher,
- no hidden Codex background process pretending to replace the real interactive session,
- no mailbox mutation,
- no UI sprawl beyond a small operator panel,
- no active-turn interruption,
- no multi-window guessing.

It uses the one path that is both officially documented and already proven live in the user's actual WSL workflow, while aligning with the user's “one dashboard page, hidden support processes” launch preference.
