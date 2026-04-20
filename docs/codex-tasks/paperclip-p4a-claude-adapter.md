# Paperclip P4a — ClaudeCodeAdapter (real)

**Version**: v1
**Planning-audit**: `docs/codex-tasks/paperclip-p4a-claude-adapter-planning-audit.md`
**Report template**: `docs/codex-tasks/paperclip-p4a-claude-adapter-report.md`
**Architecture parent**: approved R4 `docs/codex-tasks/paperclip-pivot-architecture-plan.md` §6 P4
**P2 parent (contract)**: commit `836999d`
**P3 parent (orchestrator wiring)**: commit `e884a03`
**Baseline**: HEAD=`e884a03`

---

## §0 Why this plan exists

P3 wired `createOrchestrator({adapter})` against `MockAdapter` — orchestrator is alive, state machine validated by V1-V14 + P2.1-P2.5. P4 per architecture §6 splits adapter implementations:

- **P4a (this plan)** — ClaudeCodeAdapter only. All 8 AgentAdapter methods mapped against real Claude Code CLI primitives (research §1 fully documented). Not blocked.
- **P4b (separate, future)** — CodexAdapter. Blocked until live probe closes R-OQ-3/4/5 (Codex CLI prompt flag, resume semantics, output format).

P4a goal: replace `MockAdapter` в `dashboard/server.js` bootstrap with `ClaudeCodeAdapter`, behind an env switch (`DASHBOARD_ADAPTER`) so the mock remains usable for CI + smoke. Existing orchestrator code does not change (contract preserved).

---

## §1 Источники истины (hierarchy)

1. Official Claude Code CLI reference — `https://code.claude.com/docs/en/cli-reference` (fetched 2026-04-20, see §2 V-table).
2. P2 research doc `docs/codex-tasks/paperclip-pivot-adapter-contract-research.md` §1 (Claude CLI primitives) + §3 (process lifecycle).
3. P2 locked contract `scripts/adapters/agent-adapter.mjs` (typedefs + `AGENT_ADAPTER_METHODS` + `validateAdapter`).
4. Existing committed code (HEAD=`e884a03`): `scripts/adapters/mock-adapter.mjs` (reference implementation shape), `dashboard/orchestrator.mjs` (consumer), `dashboard/server.js` (bootstrap site).

Discrepancy rule: docs > code > plan. If Codex observes CLI flag drift between §2 quotes and live behavior — STOP, report as discrepancy, do not silently adapt.

---

## §2 Doc verification — Claude CLI flags

Exact quotes from `https://code.claude.com/docs/en/cli-reference` (WebFetch 2026-04-20):

| # | Flag | Verbatim description | Adapter use |
|---|------|----------------------|-------------|
| V-D1 | `--print`, `-p` | «Print response without interactive mode (see Agent SDK documentation for programmatic usage details)» | Primary mode для adapter.launch/resume — headless single-shot invocation. |
| V-D2 | `--session-id` | «Use a specific session ID for the conversation (must be a valid UUID)» | Assign orchestrator-owned UUID на first launch → persistent identifier reused via -r. |
| V-D3 | `--resume`, `-r` | «Resume a specific session by ID or name, or show an interactive picker to choose a session» | adapter.resume spawns `claude -p -r <sessionId> "<message>"`. |
| V-D4 | `--output-format` | «Specify output format for print mode (options: text, json, stream-json)» | Adapter spawns with `--output-format json` — deterministic parseCompletionSignal on final JSON. |
| V-D5 | `--max-turns` | «Limit the number of agentic turns (print mode only). Exits with an error when the limit is reached. No limit by default» | Per-invocation safety limit (adapter option, default 30). |
| V-D6 | `--append-system-prompt` | «Append custom text to the end of the default system prompt» | Optional adapter option to inject coordinator-specific context (project name + thread) without overriding CLAUDE.md. |
| V-D7 | `--permission-mode` | «Begin in a specified permission mode. Accepts default, acceptEdits, plan, auto, dontAsk, or bypassPermissions» | Adapter default `bypassPermissions` (headless must not prompt). Configurable via option. |
| V-D8 | `--no-session-persistence` | «Disable session persistence so sessions are not saved to disk and cannot be resumed (print mode only)» | **NOT used** — would break resume contract. Explicit STOP если Codex tempted to add. |
| V-D9 | `--fork-session` | «When resuming, create a new session ID instead of reusing the original (use with --resume or --continue)» | NOT used в P4a — adapter owns sessionId end-to-end. |
| V-D10 | `claude auth status` | «Exits with code 0 if logged in, 1 if not» | Pre-flight probe (optional в adapter.launch if first use); authoritative exit-code pair для auth check. |
| V-D11 | `--tools` | «Restrict which built-in tools Claude can use. Use `""` to disable all, `"default"` for all, or tool names like "Bash,Edit,Read"» | Adapter option (default unset = default tools). |

**Not documented** (honest gaps, preserved from P2 research §1.8 + §6):
- Full exit-code taxonomy beyond auth status 0/1 + `--max-turns` error exit. classifyCrash retains P2 heuristic mapping (timeout, auth, env, agent-error, unknown).
- Behavior of `--session-id UUID` when UUID already exists in store. Adapter treats as NOT retried — first launch uses fresh UUID (`crypto.randomUUID()`), subsequent turns use `-r <UUID>`; if resume fails с «session not found» stderr, classifyCrash returns `agent-error/retriable`.
- Windows `claude.exe` vs `claude.cmd` shim behavior. Adapter tries `claude` first (shell PATH resolution), falls back to explicit `.cmd` on Windows if ENOENT.

---

## §3 Pre-flight (Codex)

### P1 — Environment baseline

```bash
pwd                            # /mnt/e/Project/workflow
git status --short
git log --oneline -3
node -v                        # expect v24.x (matches P3 baseline)
```

### P2 — Claude CLI availability (smoke; NOT blocking)

```bash
command -v claude || echo "CLI-NOT-ON-PATH"
claude --version 2>&1 || true
```

If CLI not on PATH — record в report §0.2 + proceed; Phase 2 (user visual) does real invocation. Phase 1 verification relies on mock-based stub spawn (V4 below).

### P3 — HEAD matches baseline

```bash
git rev-parse HEAD             # expect e884a03
```

If different → STOP discrepancy.

### P4 — File existence

```bash
ls -la scripts/adapters/agent-adapter.mjs scripts/adapters/mock-adapter.mjs dashboard/orchestrator.mjs dashboard/server.js
test ! -f scripts/adapters/claude-code-adapter.mjs && echo "NEW-FILE-CLEAR" || echo "NEW-FILE-EXISTS-STOP"
```

### P5 — Build clean baseline

```bash
cd dashboard && npx vite build 2>&1 | tail -3
```

Expect `✓ built in …`. If FAIL → STOP.

---

## §4 Whitelist (strict)

**Создать**:
1. `scripts/adapters/claude-code-adapter.mjs` (NEW).

**Изменить**:
2. `dashboard/server.js` — env-gated adapter selection.
3. `local-claude-codex-mailbox-workflow.md` — spec append «ClaudeCodeAdapter (paperclip pivot P4a)».

**Handoff artefacts** (tracked already в working tree):
4. `docs/codex-tasks/paperclip-p4a-claude-adapter.md` (this plan)
5. `docs/codex-tasks/paperclip-p4a-claude-adapter-planning-audit.md`
6. `docs/codex-tasks/paperclip-p4a-claude-adapter-report.md`

**НЕ ТРОГАТЬ**:
- `scripts/adapters/agent-adapter.mjs` — P2 contract locked.
- `scripts/adapters/mock-adapter.mjs` — fallback, must remain intact.
- `dashboard/orchestrator.mjs` — P3 consumer, no change needed.
- `dashboard/supervisor.mjs` — no P4a-scope change.
- `dashboard/src/App.jsx`, `dashboard/src/api.js` — UI не меняется в P4a.
- `scripts/mailbox*.mjs`, `scripts/session-registry.mjs` — adjacent, no touch.
- Hooks config files (`.claude/settings*.json`) — not P4a.

---

## §5 Changes

### Change 1 — NEW `scripts/adapters/claude-code-adapter.mjs`

Factory `createClaudeCodeAdapter({ claudePath, spawnFn, spawnTimeoutMs, logger, recordCallsTo, appendSystemPrompt, permissionMode, maxTurns, outputFormat, tools, env })` returning full 8-method AgentAdapter.

**Defaults**:
- `claudePath` = `"claude"` (PATH resolution; Windows falls back to `claude.cmd`).
- `spawnFn` = `child_process.spawn` (injectable для tests).
- `spawnTimeoutMs` = `5 * 60 * 1000` (5 min).
- `logger` = `console`.
- `permissionMode` = `"bypassPermissions"` (V-D7 — headless must not prompt).
- `outputFormat` = `"json"` (V-D4 — deterministic parsing).
- `maxTurns` = `30` (V-D5 safety — hitting cap = failure per docs «Exits with an error when the limit is reached»).
- `appendSystemPrompt` = `undefined` (orchestrator may set).
- `tools` = `undefined` (default tool set).

**Internal state**:
- `Map<sessionId, { state: 'running'|'terminated', launchedAt, lastInvocationAt, project, thread, callArgs }>` — session slots (F1 post-R1: no `childProcess` field — adapter doesn't retain per-session child; see activeSpawns).
- `Set<ChildProcess>` `activeSpawns` — tracks every currently-running child from `runClaude` so `shutdown({force})` can propagate kill signals to mid-turn spawns (F2 post-R1 fix).

**Shared helper** — `runClaude(args, { stdinInput?, timeoutMs })`:
- Spawn via `spawnFn(claudePath, args, { stdio: ['pipe','pipe','pipe'], env })`.
- Add child к `activeSpawns` синхронно после spawn. Remove on `'close'` event (finally-branch semantics).
- Collect stdout / stderr buffers (UTF-8 string concat).
- Timeout: `setTimeout(..., timeoutMs).unref()`. On timeout → append `"[adapter timeout] SIGTERM"` к accumulated stderr → `child.kill('SIGTERM')` → wait 5s → if still alive `child.kill('SIGKILL')`; mark result `{ timedOut: true, exitCode: null, signal: 'SIGTERM' }`. Stderr carries the timeout marker so classifyCrash can match without contract-extension (F1 post-R1 fix).
- Resolves on `'close'` event with `{ exitCode, signal, stdout, stderr, durationMs, timedOut }`.

**Method mapping**:

1. **launch({project, thread, instruction, sessionId?})**:
   - `id = sessionId || crypto.randomUUID()`.
   - Check internal `Map.get(id)?.state === 'running'` → if args differ (project/thread/instruction first message) → throw `session-collision` (mirrors mock F2 fix).
   - Build args: `['-p', '--session-id', id, '--output-format', outputFormat, '--permission-mode', permissionMode, '--max-turns', String(maxTurns)]`; append `--append-system-prompt`, `--tools` if set.
   - Final positional arg = `instruction`.
   - Call `runClaude(args, { timeoutMs: spawnTimeoutMs })`.
   - On exit 0: capture session = `Map.set(id, {state: 'running', project, thread, launchedAt: now(), lastInvocationAt: now(), callArgs: {project, thread, firstMessage: instruction} })`; return `{processHandle: {sessionId: id, lastExit: exitCode, lastStdoutTail}, sessionId: id, launchedAt: now()}`.
   - On any non-zero exit (including max-turns — per V-D5 docs «Exits with an error when the limit is reached», F7 post-R3): throw Error with `{exitCode, stderr}` attached → orchestrator's `handleAdapterFailure` path. classifyCrash categorizes `maximum turns` stderr as `agent-error/retriable` (see step 8) — orchestrator's 3-consecutive-error threshold eventually marks task `failed` if the CLI keeps hitting the cap. Session slot NOT created for failed launch (no partial state).
   - `record("launch", {...})` via recordCallsTo (optional).

2. **resume({processHandle, sessionId, message})**:
   - If `!sessionId` → return `{messageAccepted: false, processHandle: null, sessionId: null}` + record error.
   - If `Map.get(sessionId)?.state === 'terminated'` → return `{messageAccepted: false, ...}` + record.
   - Args: `['-p', '-r', sessionId, '--output-format', outputFormat, '--permission-mode', permissionMode, '--max-turns', String(maxTurns)]` + optional system/tools + positional `message`.
   - `runClaude`. Success = exit 0 only (F7 post-R3 — max-turns is failure per V-D5 docs). Exit 0 → `{messageAccepted: true, processHandle: {sessionId, lastExit: exitCode, lastStdoutTail}, sessionId}`. Any non-zero exit (including max-turns) → `{messageAccepted: false, processHandle: processHandle || null, sessionId}`; record includes exitCode + stderr excerpt. Orchestrator handleAdapterFailure path → retriable agent-error per classifyCrash.
   - Update `Map.get(sessionId).lastInvocationAt`.

3. **shutdown({processHandle, sessionId, force=false})** (F2 post-R1):
   - Per-session semantic: `id = sessionId || processHandle?.sessionId`. If `id` provided and `Map.get(id)` present → mark `Map.get(id).state = 'terminated'`.
   - Per-adapter kill sweep: for every child в `activeSpawns` → `child.kill(force ? 'SIGKILL' : 'SIGTERM')`. When `force=false`, schedule SIGKILL after 5s для children which are still alive. Both the runClaude timeout and shutdown's SIGKILL escalation use `setTimeout(..., …).unref()` — never blocks event-loop exit.
   - Rationale: Claude spawn model = one spawn per turn, но shutdown может попасть между turns ИЛИ mid-turn. Без kill sweep SIGINT на coordinator оставляет zombie `claude` процесс до natural exit (до `--max-turns 30` ≈ минуты). Phase 2 P2.4 «no dangling claude processes» invariant требует active tracking.
   - Return `{exitCode: 0, reason: force ? 'force-shutdown-swept' : 'clean-shutdown-swept'}` (when a session id provided), or `{exitCode: 0, reason: 'adapter-sweep'}` when called без session id (global shutdown).

4. **isAlive({processHandle, sessionId})**:
   - `id = sessionId || processHandle?.sessionId`.
   - Returns `!!Map.get(id) && Map.get(id).state === 'running'`.
   - NB: «alive» = session slot open в адаптера памяти, НЕ живой child process (нет такого между turns).

5. **attachExisting({sessionId})**:
   - Best-effort stub in P4a. Research §1 notes Claude stores sessions в `~/.claude/…` (read-only externally). No spawn; return `{processHandle: null, attached: false}`.
   - Future P5+: implement session file discovery если OS-portable path resolved.

6. **injectMessage({processHandle, sessionId, message})**:
   - Per research §1.2: Claude CLI does not support stdin mid-stream injection → alias к `resume()` (like mock).
   - `id = processHandle?.sessionId || sessionId`. If none → `{injected: false, fellBackToResume: false}`.
   - Delegate: `const r = await adapter.resume({processHandle, sessionId: id, message}); return { injected: r.messageAccepted, fellBackToResume: true }`.

7. **parseCompletionSignal({recentOutput, outputFormat})**:
   - `outputFormat === 'json'`: `JSON.parse(recentOutput)` → if object has `result` или `final_message` OR (has array `messages` где last `role==='assistant'` and `stop_reason==='end_turn'`) → `{completed: true, reason: 'json-turn-complete'}`.
   - `outputFormat === 'stream-json'`: look for last event с `type==='result'` OR `subtype==='success'`; if found → completed.
   - `outputFormat === 'text'`: fallback — completed if non-empty recentOutput + no «error» в last 200 chars.
   - Invalid JSON / parse failure → `{completed: false, reason: 'parse-failed'}`.

8. **classifyCrash({exitCode, stderr})** (F1 post-R1 — contract-accurate; order fixed):
   Contract args = only `{exitCode: number, stderr: string}` per `agent-adapter.mjs` ClassifyCrashArgs typedef. Timeout info is surfaced **through stderr** (runClaude appends `[adapter timeout] SIGTERM` marker on timeout kill — see runClaude helper spec above).

   Check order — first match wins (documented precedence, F3 post-R1):
   1. `exitCode === 0` → `{category: 'unknown', retriable: false}` (non-crash baseline).
   2. `stderr` includes `maximum turns` OR `max-turns` → `{category: 'agent-error', retriable: true}`.
   3. `stderr` (case-insensitive) includes `Not authenticated` OR `login required` OR `401` → `{category: 'auth', retriable: false}`.
   4. `stderr` (case-insensitive) includes `ENOENT` OR `command not found` OR `claude: not found` → `{category: 'env', retriable: false}`.
   5. `stderr` (case-insensitive) includes `timed out` OR `timeout` OR `[adapter timeout]` OR `SIGTERM` → `{category: 'timeout', retriable: true}`.
   6. `exitCode === 1` OR `exitCode === 2` → `{category: 'agent-error', retriable: true}`.
   7. Else → `{category: 'unknown', retriable: false}`.

**Call log**: if `recordCallsTo` set, atomic write+rename `{method, args, result, ts}` records (mirrors mock).

**Top of file**: `import { AGENT_ADAPTER_METHODS } from './agent-adapter.mjs';` + runtime assertion `if (AGENT_ADAPTER_METHODS.length !== 8) throw …` (mirrors mock).

### Change 2 — `dashboard/server.js` adapter switch

**Locate** existing bootstrap block (P3, post-`supervisor = createSupervisor(...)`):

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

**Replace** with env-gated selection:

```js
import { createClaudeCodeAdapter } from "../scripts/adapters/claude-code-adapter.mjs";
// (existing import of createMockAdapter stays)

const adapterKind = (process.env.DASHBOARD_ADAPTER || "mock").toLowerCase();
let orchestratorAdapter;
if (adapterKind === "claude-code") {
  orchestratorAdapter = createClaudeCodeAdapter({
    recordCallsTo: path.join(runtimeRoot, "orchestrator-claude-calls.json"),
    logger: console
  });
  console.log("[bootstrap] adapter=claude-code (real)");
} else {
  orchestratorAdapter = createMockAdapter({
    recordCallsTo: path.join(runtimeRoot, "orchestrator-mock-calls.json")
  });
  console.log("[bootstrap] adapter=mock");
}
const orchestrator = createOrchestrator({
  supervisor,
  adapter: orchestratorAdapter,
  logger: console
});
supervisor.setOrchestrator(orchestrator);
```

**Change 2.1** (F8 post-R3) — wire `adapter.shutdown()` в server.js SIGINT/SIGTERM path. Closes Gap G8 — без этого F2 activeSpawns kill sweep остаётся dead code и Phase 2 P2.4 «no dangling claude processes» invariant недостижим.

Current `shutdown(signal)` function (server.js L349-364):

```js
function shutdown(signal) {
  process.stderr.write(`[server] ${signal} received, shutting down\n`);
  orchestrator.stop();
  supervisor.stop();
  // …
}
```

Replace invocation sequence с adapter-aware async version:

```js
async function shutdown(signal) {
  process.stderr.write(`[server] ${signal} received, shutting down\n`);
  orchestrator.stop();
  try {
    await orchestratorAdapter.shutdown({ force: false });
  } catch (error) {
    process.stderr.write(`[server] adapter.shutdown error: ${error.message}\n`);
  }
  supervisor.stop();
  if (typeof server.closeAllConnections === "function") {
    server.closeAllConnections();
  }
  server.close(() => {
    process.stderr.write("[server] clean exit\n");
    process.exit(0);
  });
  setTimeout(() => {
    process.stderr.write("[server] force exit after 3s timeout\n");
    process.exit(1);
  }, 3000);
}

process.on("SIGINT", () => { shutdown("SIGINT"); });
process.on("SIGTERM", () => { shutdown("SIGTERM"); });
```

Key changes:
- `shutdown` becomes `async`.
- `orchestratorAdapter.shutdown({force: false})` invoked between `orchestrator.stop()` and `supervisor.stop()`. Graceful-first — adapter sends SIGTERM к live children, schedules `.unref()` SIGKILL after 5s.
- Error handler ensures shutdown path continues even if adapter.shutdown() throws.
- Process handlers wrap call in `{ shutdown(...) }` (ignores returned Promise — fire-and-forget async, exit timer в shutdown() завершает процесс принудительно через 3s если clean close подвисает).

Adapter-agnostic — работает с mock (no-op shutdown is fast) и claude-code (kill sweep then fast).

### Change 3 — spec append

In `local-claude-codex-mailbox-workflow.md`, locate end of «Orchestrator Loop (paperclip pivot P3)» section. Append new section:

```markdown
### ClaudeCodeAdapter (paperclip pivot P4a)

`createClaudeCodeAdapter({claudePath, permissionMode, outputFormat, maxTurns, spawnTimeoutMs, appendSystemPrompt, tools, recordCallsTo, logger})` returns the P2 AgentAdapter shape against real Claude Code CLI.

Invocation model: one `child_process.spawn` per turn (Claude CLI doesn't support mid-stream injection per docs). First turn uses `claude -p --session-id <UUID> "<instruction>"`; subsequent turns use `claude -p -r <UUID> "<message>"`. All turns include `--output-format json --permission-mode bypassPermissions --max-turns 30` for deterministic headless execution.

Bootstrap gate: `dashboard/server.js` reads `DASHBOARD_ADAPTER` env (default `mock`; set to `claude-code` for real adapter). Mock remains the default for CI + smoke. Switching requires dashboard restart.

Shutdown: SIGINT/SIGTERM handlers in `dashboard/server.js` invoke `orchestrator.stop()` → `await orchestratorAdapter.shutdown({force:false})` → `supervisor.stop()`, so active Claude children receive SIGTERM (with 5s `.unref()`-scheduled SIGKILL escalation) instead of outliving the coordinator. This applies к both adapter kinds — mock treats shutdown() as fast no-op.

Methods:
- `launch` → fresh UUID via crypto.randomUUID or caller-provided; spawn with `--session-id`. Records into internal Map for collision detection (mirrors mock F2 fix).
- `resume` / `injectMessage` → spawn with `-r <sessionId>` + new message; injectMessage delegates to resume per research §1.2.
- `shutdown` → marks session slot terminated AND sweeps adapter-tracked activeSpawns set with SIGTERM (or SIGKILL if `force=true`), ensuring mid-turn children don't outlive coordinator SIGINT.
- `isAlive` → checks adapter-local Map slot state.
- `attachExisting` → stub `{attached: false}` (P5+ if session file discovery API surfaces).
- `parseCompletionSignal` → parses `--output-format json` response; falls back to text heuristic.
- `classifyCrash` → maps exit code + stderr to {env|auth|timeout|agent-error|unknown} + retriable flag.

CodexAdapter (P4b) deferred until live probe closes R-OQ-3/4/5 (Codex initial prompt flag, session resume, output format).
```

---

## §6 Verification phases

### Phase 1 — Codex (WSL)

| # | Check | Expected |
|---|-------|----------|
| V1 | `node --check scripts/adapters/claude-code-adapter.mjs` | PASS |
| V2 | `node --check dashboard/server.js` post-change | PASS |
| V3 | Build clean | `✓ built` |
| V4 | `createClaudeCodeAdapter` passes `validateAdapter` (stub spawn) | `{valid:true, missing:[]}` |
| V5 | `createClaudeCodeAdapter` export grep | `^export function createClaudeCodeAdapter` count = 1 |
| V6 | `AGENT_ADAPTER_METHODS.length !== 8` assertion present | grep count ≥1 |
| V7 | server.js DASHBOARD_ADAPTER gate | grep `DASHBOARD_ADAPTER` count ≥1 |
| V8 | Spec section «ClaudeCodeAdapter (paperclip pivot P4a)» added | grep count = 1 |
| V9 | Stubbed launch behavior — injectable spawnFn returns mock exit 0 + dummy json; full cycle (launch→resume→shutdown) completes without throws | empirical (6 sub-probes) |
| V10 | Session-collision throw on mismatched relaunch | empirical PASS |
| V11 | classifyCrash taxonomy coverage (auth/timeout/env/agent-error/unknown × fixtures) | empirical 5/5 PASS |
| V12 | parseCompletionSignal JSON + stream-json + text branches | empirical 3/3 PASS |
| V13 | PD scan (production paths) | `--scan done` clean |
| V14 | Whitelist drift | 1 new (claude-code-adapter.mjs) + 2 M (server.js, spec) + 3 handoff artefacts |
| V15 | shutdown kills active spawns (F2 post-R1) | empirical — stub spawn never emits 'close'; shutdown({force:true}) → child.kill called ≥1 |
| V16 | server.js SIGINT path invokes adapter.shutdown (F8 post-R3) | grep `orchestratorAdapter\.shutdown` в `dashboard/server.js` count ≥1 |

Verification commands:

```bash
# V1
node --check scripts/adapters/claude-code-adapter.mjs && echo "V1 PASS"

# V2
node --check dashboard/server.js && echo "V2 PASS"

# V3
cd dashboard && npx vite build 2>&1 | tail -3

# V4 — validateAdapter
node -e "
import('./scripts/adapters/claude-code-adapter.mjs').then(async (m) => {
  const adapter = m.createClaudeCodeAdapter({ spawnFn: () => ({ on: () => {}, stdout: { on: () => {} }, stderr: { on: () => {} }, kill: () => {} }) });
  const v = await import('./scripts/adapters/agent-adapter.mjs');
  console.log('V4:', JSON.stringify(v.validateAdapter(adapter)));
});
"

# V5
grep -cE '^export function createClaudeCodeAdapter' scripts/adapters/claude-code-adapter.mjs
# Expected: 1

# V6
grep -cE 'AGENT_ADAPTER_METHODS\.length !== 8' scripts/adapters/claude-code-adapter.mjs
# Expected: >=1

# V7
grep -cE 'DASHBOARD_ADAPTER' dashboard/server.js
# Expected: >=1

# V8
grep -c 'ClaudeCodeAdapter (paperclip pivot P4a)' local-claude-codex-mailbox-workflow.md
# Expected: 1

# V9 — stubbed full cycle (NO real claude CLI invocation)
node -e "
import('./scripts/adapters/claude-code-adapter.mjs').then(async (m) => {
  // Fake child_process that immediately emits exit 0 + valid JSON on stdout.
  function makeFakeSpawn(exitCode = 0, stdoutPayload = '{\"result\":\"ok\",\"stop_reason\":\"end_turn\"}', stderrPayload = '') {
    return function fakeSpawn() {
      const listeners = { exit: [], error: [], close: [] };
      const stdoutListeners = [];
      const stderrListeners = [];
      const child = {
        on: (ev, cb) => { listeners[ev] ||= []; listeners[ev].push(cb); },
        kill: () => {},
        stdout: { on: (ev, cb) => { if (ev === 'data') stdoutListeners.push(cb); } },
        stderr: { on: (ev, cb) => { if (ev === 'data') stderrListeners.push(cb); } }
      };
      setImmediate(() => {
        if (stdoutPayload) stdoutListeners.forEach(cb => cb(Buffer.from(stdoutPayload)));
        if (stderrPayload) stderrListeners.forEach(cb => cb(Buffer.from(stderrPayload)));
        (listeners.exit || []).forEach(cb => cb(exitCode, null));
        (listeners.close || []).forEach(cb => cb(exitCode, null));
      });
      return child;
    };
  }
  const adapter = m.createClaudeCodeAdapter({ spawnFn: makeFakeSpawn() });
  // V9a launch
  const launched = await adapter.launch({ project: 'workflow', thread: 't1', instruction: 'first' });
  console.log('V9a launch:', launched.sessionId && launched.launchedAt ? 'PASS' : 'FAIL ' + JSON.stringify(launched));
  // V9b resume accepted
  const resumed = await adapter.resume({ sessionId: launched.sessionId, message: 'second' });
  console.log('V9b resume:', resumed.messageAccepted ? 'PASS' : 'FAIL ' + JSON.stringify(resumed));
  // V9c isAlive true after launch
  console.log('V9c isAlive:', adapter.isAlive({ sessionId: launched.sessionId }) ? 'PASS' : 'FAIL');
  // V9d injectMessage delegates к resume
  const inj = await adapter.injectMessage({ processHandle: launched.processHandle, sessionId: launched.sessionId, message: 'third' });
  console.log('V9d inject:', inj.injected && inj.fellBackToResume ? 'PASS' : 'FAIL ' + JSON.stringify(inj));
  // V9e shutdown marks terminated
  const s = await adapter.shutdown({ sessionId: launched.sessionId });
  console.log('V9e shutdown:', s.exitCode === 0 ? 'PASS' : 'FAIL ' + JSON.stringify(s));
  // V9f isAlive false after shutdown
  console.log('V9f isAlive-after:', !adapter.isAlive({ sessionId: launched.sessionId }) ? 'PASS' : 'FAIL');
});
" 2>&1

# V10 — session collision
node -e "
import('./scripts/adapters/claude-code-adapter.mjs').then(async (m) => {
  function fakeSpawn() {
    const listeners = { exit: [], close: [] };
    const sdl = []; const stl = [];
    const child = { on:(e,cb)=>{listeners[e]||=[]; listeners[e].push(cb);}, kill:()=>{}, stdout:{on:(e,cb)=>{if(e==='data') sdl.push(cb);}}, stderr:{on:(e,cb)=>{if(e==='data') stl.push(cb);}} };
    setImmediate(() => { sdl.forEach(cb=>cb(Buffer.from('{\"result\":\"ok\",\"stop_reason\":\"end_turn\"}'))); (listeners.exit||[]).forEach(cb=>cb(0,null)); (listeners.close||[]).forEach(cb=>cb(0,null)); });
    return child;
  }
  const adapter = m.createClaudeCodeAdapter({ spawnFn: fakeSpawn });
  const first = await adapter.launch({ project: 'workflow', thread: 't', instruction: 'msg-A', sessionId: '11111111-1111-1111-1111-111111111111' });
  let threw = false;
  try { await adapter.launch({ project: 'workflow', thread: 't', instruction: 'msg-B', sessionId: '11111111-1111-1111-1111-111111111111' }); } catch { threw = true; }
  console.log('V10 collision:', threw ? 'PASS' : 'FAIL');
});
" 2>&1

# V11 — classifyCrash fixtures (F1+F3+F6 post-R1: +exit0 baseline + timeout marker path)
node -e "
import('./scripts/adapters/claude-code-adapter.mjs').then(async (m) => {
  const adapter = m.createClaudeCodeAdapter({ spawnFn: () => ({ on:()=>{}, stdout:{on:()=>{}}, stderr:{on:()=>{}}, kill:()=>{} }) });
  const cases = [
    [{ exitCode: 0, stderr: '' }, 'unknown'],
    [{ exitCode: 1, stderr: 'Not authenticated: login required' }, 'auth'],
    [{ exitCode: 124, stderr: 'timed out' }, 'timeout'],
    [{ exitCode: null, stderr: '[adapter timeout] SIGTERM' }, 'timeout'],
    [{ exitCode: 127, stderr: 'claude: not found' }, 'env'],
    [{ exitCode: 1, stderr: 'TypeError: something broke' }, 'agent-error'],
    [{ exitCode: 99, stderr: 'weird' }, 'unknown']
  ];
  let pass = 0;
  for (const [args, want] of cases) {
    const r = adapter.classifyCrash(args);
    if (r.category === want) pass++;
    else console.log('V11 miss:', JSON.stringify(args), '→', r.category, 'want', want);
  }
  console.log('V11:', pass === cases.length ? 'PASS' : 'FAIL ' + pass + '/' + cases.length);
});
" 2>&1

# V12 — parseCompletionSignal
node -e "
import('./scripts/adapters/claude-code-adapter.mjs').then(async (m) => {
  const a = m.createClaudeCodeAdapter({ spawnFn: () => ({ on:()=>{}, stdout:{on:()=>{}}, stderr:{on:()=>{}}, kill:()=>{} }) });
  const j = a.parseCompletionSignal({ recentOutput: '{\"result\":\"ok\",\"stop_reason\":\"end_turn\"}', outputFormat: 'json' });
  const s = a.parseCompletionSignal({ recentOutput: '{\"type\":\"result\",\"subtype\":\"success\"}', outputFormat: 'stream-json' });
  const t = a.parseCompletionSignal({ recentOutput: 'Hello there', outputFormat: 'text' });
  const pass = j.completed && s.completed && t.completed;
  console.log('V12:', pass ? 'PASS' : 'FAIL ' + JSON.stringify({ j, s, t }));
});
" 2>&1

# V13 — PD scan (production paths only)
PD_PATTERNS='$PD_PATTERNS'
grep -riE "$PD_PATTERNS" --include="*.js" --include="*.jsx" --include="*.mjs" --include="*.html" --include="*.json" dashboard/ scripts/ 2>/dev/null
grep -riE "$PD_PATTERNS" --include="*.md" CLAUDE.md README.md README.ru.md local-claude-codex-mailbox-workflow.md workflow-*.md 2>/dev/null
echo "--scan done"

# V14 — whitelist drift
git status --short
# Expected: 1 new (scripts/adapters/claude-code-adapter.mjs) + 2 M (dashboard/server.js, local-claude-codex-mailbox-workflow.md) + 3 handoff artefacts (p4a plan, audit, report).

# V15 — shutdown sweep (F2 post-R1 probe)
node -e "
import('./scripts/adapters/claude-code-adapter.mjs').then(async (m) => {
  // spawn child that never emits 'close' — simulates mid-turn live child.
  let killed = 0;
  function hangSpawn() {
    const child = { on:()=>{}, stdout:{on:()=>{}}, stderr:{on:()=>{}}, kill: (sig) => { killed++; } };
    return child;
  }
  const adapter = m.createClaudeCodeAdapter({ spawnFn: hangSpawn, spawnTimeoutMs: 999999 });
  // fire-and-forget launch; it'll hang because spawn never closes.
  const pending = adapter.launch({ project: 'w', thread: 't', instruction: 'x' });
  await new Promise(r => setImmediate(r));
  const s = await adapter.shutdown({ force: true });
  console.log('V15:', (killed >= 1 && s.exitCode === 0) ? 'PASS' : 'FAIL killed=' + killed + ' result=' + JSON.stringify(s));
  // Release pending to avoid unhandled rejection — no-op await with ignore.
  pending.catch(() => {});
});
" 2>&1

# V16 — SIGINT wiring (F8 post-R3)
grep -cE 'orchestratorAdapter\.shutdown' dashboard/server.js
# Expected: >=1
```

### Phase 2 — user visual `[awaits user]`

| # | Check |
|---|-------|
| P2.1 | Dashboard starts with `DASHBOARD_ADAPTER=mock` (default) — log shows `[bootstrap] adapter=mock`. Existing P3 Tasks panel + runtime state intact. |
| P2.2 | Dashboard restarts с `DASHBOARD_ADAPTER=claude-code` — log shows `[bootstrap] adapter=claude-code (real)`. `validateAdapter` passes on construction. |
| P2.3 | **Optional live invoke** (requires Claude CLI logged in): user creates task via UI → orchestrator spawns real Claude CLI → first-turn output appears в `mailbox-runtime/orchestrator-claude-calls.json`. User decides when to run this. |
| P2.4 | SIGINT/SIGTERM shutdown clean в обоих режимах (no dangling `claude` processes, no zombie state). |

### Phase 3 — cross-OS parity

Not required in P4a — no OS-specific code added. Same Node logic both WSL and Windows. Real Claude CLI on Windows vs WSL tested only через Phase 2 при choice пользователя.

---

## §7 Acceptance criteria

- [ ] Phase 1 V1-V16 PASS
- [ ] Report §0-§11 filled
- [ ] No files outside whitelist
- [ ] PD scan clean
- [ ] `validateAdapter(createClaudeCodeAdapter())` returns `{valid: true}`
- [ ] Mock adapter remains default; flip only via env
- [ ] No commit/push без user command
- [ ] Phase 2 + Phase 3 awaits user

---

## §8 Out of scope

- Real CodexAdapter (P4b) — separate handoff blocked на R-OQ-3/4/5 live probe.
- `attachExisting` functional implementation — remains stub.
- Long-lived Claude process reuse (one spawn per turn is contract-accurate per research §1.2).
- Coordinator restart recovery across adapter (P5+).
- Multi-task parallelism (P5+).
- UI timeline / adapter switcher in dashboard UI.
- Real-agent behavioral smoke в Phase 1 (Claude CLI invocation not guaranteed в executor env — stubbed spawnFn for determinism).
- Streaming mid-turn output surfaced to dashboard (future).

---

## §9 Rollback

**До commit**:
1. `git diff --stat dashboard/server.js local-claude-codex-mailbox-workflow.md` → verify only P4a-scope changes.
2. `rm -f scripts/adapters/claude-code-adapter.mjs` (untracked NEW).
3. `git checkout -- dashboard/server.js local-claude-codex-mailbox-workflow.md`.
4. `rm -f mailbox-runtime/orchestrator-claude-calls.json` (runtime-only).
5. Restart dashboard — default mock restored.

**После commit**: `git revert <sha>`. `mailbox-runtime/orchestrator-claude-calls.json` gitignored; manual delete если mess.

**NB** (F5 post-R1): `orchestrator-mock-calls.json` и `orchestrator-claude-calls.json` могут co-exist в `mailbox-runtime/` после DASHBOARD_ADAPTER flip — expected, оба gitignored, не шипятся.

---

## §10 Discrepancy checkpoints (STOP conditions)

1. Baseline HEAD ≠ `e884a03` → STOP.
2. `scripts/adapters/agent-adapter.mjs` modified by anyone → STOP (contract locked).
3. `scripts/adapters/mock-adapter.mjs` modified → STOP (fallback must remain).
4. `dashboard/orchestrator.mjs` modified → STOP (P3 consumer, contract stable).
5. `dashboard/supervisor.mjs` or UI files modified → STOP (outside whitelist).
6. Phase 1 V1-V14 any FAIL → STOP.
7. Temptation use `--no-session-persistence` → STOP (breaks resume contract per V-D8).
8. Temptation add WSL-specific spawn logic → STOP (same as Codex path, defer P4b).
9. Temptation implement real `attachExisting` via FS read → STOP (P5+ scope).
10. Temptation add real Claude invocation в V9 probe → STOP (stubbed spawnFn only, Claude CLI not guaranteed в executor env).
11. V13 whitelist drift → STOP.
12. PD scan hit in production paths → STOP.

---

## §11 Self-audit checklist

- [ ] 1: Pre-flight P1-P5 OK
- [ ] 2: Change 1 claude-code-adapter.mjs created (NEW)
- [ ] 3: Change 2 DASHBOARD_ADAPTER gate applied в server.js
- [ ] 4: Change 3 spec section appended
- [ ] 5: V1-V16 recorded verbatim
- [ ] 6: V13 PD scan clean
- [ ] 7: V14 whitelist drift clean
- [ ] 8: No commit/push
- [ ] 9: Discrepancies recorded
- [ ] 10: Report §0-§11 filled
- [ ] 11: mock-adapter.mjs unchanged (diff empty)
- [ ] 12: agent-adapter.mjs unchanged (diff empty)
- [ ] 13: orchestrator.mjs unchanged (diff empty)
- [ ] 14: supervisor.mjs unchanged (diff empty)

≥12/14 OK → ready for user review.

---

## §12 Notes to Codex

- Environment: WSL, `cwd=/mnt/e/Project/workflow`.
- Baseline: HEAD=`e884a03`.
- No commit/push без user command.
- No real Claude CLI invocation в Phase 1 — V9 uses `spawnFn` injection only. Real behavior = Phase 2 [awaits user].
- Anti-fabrication: V outputs verbatim в report §2.
- `--no-session-persistence` is a honeypot — V-D8 документирует «cannot be resumed» — do NOT add, violates adapter resume contract.
- Do NOT modify mock-adapter.mjs even «для consistency» — mock is CI default и reference implementation per Change 2 fallback.
- Writing new file: mirror mock-adapter.mjs patterns (record log, atomic write+rename, contract assertion at bottom).
- Session persistence is Claude's own `~/.claude/...` — adapter does NOT manage those files.
- Windows PATH resolution для `claude` command: Node spawn обычно ищет `.cmd`/`.exe` если shell option set. We spawn без shell (prefer deterministic arg arrays). If ENOENT на Windows Phase 2 live invoke — пользователь ставит absolute path через `claudePath` option.
- Safety note (F4 post-R1): default `permissionMode: 'bypassPermissions'` выбран per research doc для headless ops — это же path, которым pipe Claude Code работает в pipeline mode. Для sandboxed / destructive-safe tests override: `createClaudeCodeAdapter({permissionMode: 'default'})` — then CLI prompts для каждого tool use и spawn повисает до manual intervention (не подходит для loop, но полезно при разовой верификации).

---

## §13 Commits strategy

Single commit covering Change 1 + Change 2 + Change 3 + 3 handoff artefacts. No hunk-split.
