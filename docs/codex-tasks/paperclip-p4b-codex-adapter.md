# Paperclip P4b — CodexAdapter (real)

**Version**: v1
**Planning-audit**: `docs/codex-tasks/paperclip-p4b-codex-adapter-planning-audit.md`
**Report template**: `docs/codex-tasks/paperclip-p4b-codex-adapter-report.md`
**Architecture parent**: approved R4
**P2 parent (contract)**: commit `836999d`
**P3 parent (orchestrator)**: commit `e884a03`
**P4a parent (ClaudeCodeAdapter)**: commit `0c97c14`
**Baseline**: HEAD=`0c97c14`

---

## §0 Why this plan exists

P4a delivered ClaudeCodeAdapter + `DASHBOARD_ADAPTER=mock|claude-code` env gate в server.js bootstrap. P4 per architecture §6 had **CodexAdapter** as the other half, blocked на live probe R-OQ-3/4/5/6 (Codex CLI prompt flag / resume / output-format / exit codes).

Live probe thread `paperclip-p4b-codex-adapter-live-probe` (2 Codex replies 2026-04-20) закрыл gaps:
- R-OQ-3: positional PROMPT to `codex exec` subcommand (not `-p`, not `--prompt`).
- R-OQ-4: resume via `codex exec resume --last|<id>`.
- R-OQ-5: no `--output-format` flag — text parsing only.
- R-OQ-6: `~/.codex/config.toml` config source; `-c key=value` override pattern.

P4b goal: add `scripts/adapters/codex-adapter.mjs` implementing same P2 AgentAdapter contract, extend `DASHBOARD_ADAPTER` env к `codex` value, append spec section. Existing mock + claude-code adapters preserved.

---

## §1 Иерархия источников

1. **Live Codex CLI probes** — archived `agent-mailbox/archive/paperclip-p4b-codex-adapter-live-probe/*` (2 Codex reply letters 2026-04-20 с verbatim help outputs).
2. Wiki `workflow-hybrid-hook-automation` + architecture rail #7 — Codex WSL-only stance.
3. P2 contract `scripts/adapters/agent-adapter.mjs` (locked).
4. P4a reference `scripts/adapters/claude-code-adapter.mjs` (commit `0c97c14`) — pattern template for runClaude helper, activeSpawns sweep, classifyCrash taxonomy, atomic call log.
5. Existing committed code (HEAD=`0c97c14`): `dashboard/server.js` (bootstrap L234-246 env gate), spec section «ClaudeCodeAdapter (paperclip pivot P4a)» at L>933.

Discrepancy rule: live probe docs > P4a reference code > plan spec. If Codex CLI behavior differs from probe quotes — STOP, record, do not silently adapt.

---

## §2 Doc verification — Codex CLI surface

Live quotes from probe thread (probe 6A + 6D):

| # | Surface | Verbatim quote | Adapter use |
|---|---------|----------------|-------------|
| V-C1 | `codex exec` | «Run Codex non-interactively» / «Usage: codex exec [OPTIONS] [PROMPT]» | Base command all adapter calls. |
| V-C2 | PROMPT arg | «If not provided as an argument (or if `-` is used), instructions are read from stdin. If stdin is piped and a prompt is also provided, stdin is appended as a `<stdin>` block» | Adapter passes prompt as positional. No stdin usage. |
| V-C3 | `codex exec resume` | «Resume a previous session by id or pick the most recent with --last» | Resume subcommand inside exec. Adapter: `codex exec resume <id> "<msg>"` (explicit id) OR `codex exec resume --last "<msg>"` (fallback). |
| V-C4 | `-c, --config key=value` | «Override a configuration value that would otherwise be loaded from `~/.codex/config.toml`. Use a dotted path (`foo.bar.baz`) to override nested values. The `value` portion is parsed as TOML» | Optional adapter option to inject model/sandbox/etc overrides. |
| V-C5 | `-m, --model <MODEL>` | «Model the agent should use» | Optional adapter option. |
| V-C6 | `-s, --sandbox <MODE>` | «Select the sandbox policy to use when executing model-generated shell commands. [possible values: read-only, workspace-write, danger-full-access]» | Adapter default = unset (config's default applies); configurable via option. |
| V-C7 | Sessions on disk | `~/.codex/sessions/` directory с YYYY/ year subdir (observed probe 3/6A) | Adapter uses sessions directory diff-scan to learn Codex-side session id after first exec. |
| V-C8 | JSON output | `codex exec --help` exposes **`--json`** flag AND **`-o, --output-last-message <FILE>`** (F8 post-R1 Codex adversarial — probe 4 initial grep missed these because it searched global `codex --help`, not `codex exec --help`). Same flags present on `codex exec resume --help`. | Adapter uses `--json` flag for deterministic output parsing (parallel к P4a ClaudeCodeAdapter's `--output-format json`). |

**Negative findings** (confirmed absent):
- ~~No `--output-format json|stream-json|text`~~ — **incorrect** in initial probe 4 (global help grep missed exec-level flags). CORRECTED V-C8: Codex CLI does expose `--json` на `exec` subcommand level.
- **No `--max-turns`** — no per-invocation turn cap; only wall-clock timeout.
- **No `--session-id <UUID>`** — adapter cannot pre-assign ID; must learn via directory diff.

**WSL-only** per architecture rail #7: Windows coordinator wraps spawn through `wsl.exe -d Ubuntu -- bash -lc "…"`. Adapter accepts `spawnPrefix` option (array of command prefix tokens).

---

## §3 Pre-flight (Codex)

### P1 — Environment baseline

```bash
pwd                            # /mnt/e/Project/workflow
git status --short
git log --oneline -4            # expect 0c97c14 HEAD
node -v                         # v24.x
```

### P2 — Codex CLI availability (smoke)

```bash
which codex
codex --version 2>&1
codex exec --help 2>&1 | head -30
```

Non-blocking — if missing or auth-expired, record в report §0.4; Phase 2 = user visual includes real invocation.

### P3 — HEAD matches baseline

```bash
git rev-parse HEAD             # expect 0c97c14
```

FAIL → STOP.

### P4 — File existence + absence

```bash
ls -la scripts/adapters/claude-code-adapter.mjs scripts/adapters/mock-adapter.mjs scripts/adapters/agent-adapter.mjs dashboard/server.js
test ! -f scripts/adapters/codex-adapter.mjs && echo "NEW-FILE-CLEAR" || echo "NEW-FILE-EXISTS-STOP"
```

### P5 — Baseline build

```bash
cd dashboard && npx vite build 2>&1 | tail -3
```

Expect `✓ built`. FAIL → STOP (known WSL/Windows binding drift; run `npm install` в WSL then retry).

---

## §4 Whitelist (strict)

**Создать**:
1. `scripts/adapters/codex-adapter.mjs` (NEW).

**Изменить**:
2. `dashboard/server.js` — extend env gate к three values.
3. `local-claude-codex-mailbox-workflow.md` — append spec section.
4. `docs/codex-tasks/paperclip-pivot-adapter-contract-research.md` — append §2.1 delta «P4b live-probe findings».

**Handoff artefacts**:
5. `docs/codex-tasks/paperclip-p4b-codex-adapter.md` (this plan)
6. `docs/codex-tasks/paperclip-p4b-codex-adapter-planning-audit.md`
7. `docs/codex-tasks/paperclip-p4b-codex-adapter-report.md`

**НЕ ТРОГАТЬ**:
- `scripts/adapters/agent-adapter.mjs` — P2 contract locked.
- `scripts/adapters/mock-adapter.mjs` — CI default.
- `scripts/adapters/claude-code-adapter.mjs` — P4a stable.
- `dashboard/orchestrator.mjs` — contract consumer.
- `dashboard/supervisor.mjs`, `dashboard/src/**`, `dashboard/api.js` — unrelated.
- `scripts/mailbox*.mjs`, `scripts/session-registry.mjs`.
- Hooks config `.claude/settings*.json`.

---

## §5 Changes

### Change 1 — NEW `scripts/adapters/codex-adapter.mjs`

Factory `createCodexAdapter({ codexPath, spawnPrefix, spawnFn, spawnTimeoutMs, logger, recordCallsTo, model, sandboxMode, sessionsRoot, env, configOverrides })` returning P2-contract 8-method adapter.

**Defaults**:
- `codexPath = "codex"` (shell PATH resolution).
- `spawnPrefix = []` (no prefix). On Windows — recommended `['wsl.exe', '-d', 'Ubuntu', 'bash', '-lc']` but up to caller (server.js bootstrap chooses based on platform).
- `spawnFn = child_process.spawn`.
- `spawnTimeoutMs = 10 * 60 * 1000` (**10 min** — probe 6B hit EXIT=124 at 2-min limit; Codex turns can be slow on first auth/model cold-start).
- `logger = console`.
- `model = undefined` (config default wins).
- `sandboxMode = undefined` (config default).
- `useJsonOutput = true` (F8 post-R1 — adapter passes `--json` flag on every `codex exec` / `codex exec resume` for deterministic parse; set to `false` if caller wants text mode).
- `sessionsRoot = path.join(os.homedir(), '.codex', 'sessions')` — absolute path на coordinator host. When `spawnPrefix` wraps к WSL, sessionsRoot must be Windows-visible via `/mnt/.../home/<user>/.codex/sessions` OR adapter skips directory-diff learning and uses `--last` fallback.
- `env = process.env`.
- `configOverrides = {}` — object passed as array of `-c key=value` pairs (F4 post-R1 — value TOML literalness is **caller responsibility**: adapter serializes each key/value pair verbatim as `-c key=value`. Strings must be pre-wrapped in TOML double quotes, e.g. `{model: '"o3"'}`. Non-string scalars (numbers, booleans, arrays) passed raw; Codex parses as TOML fallback к literal string per its own docs).

**Helper** — `configOverrideFlags` (R2 post-R2 explicit):
```js
const configOverrideFlags = Object.entries(configOverrides).flatMap(
  ([k, v]) => ['-c', `${k}=${v}`]
);
```
Computed once in factory closure after `configOverrides` is finalized; reused by launch / resume argv-builders.

**Internal state**:
- `Map<sessionId, { state: 'running'|'terminated', launchedAt, lastInvocationAt, project, thread, callArgs }>`.
- `Set<ChildProcess>` `activeSpawns`.
- `callLog[]` атомарно записываемый в `recordCallsTo`.

**Shared helper** — `shellEscape(token)` (F2 post-R1):
- Private helper inside adapter module.
- If token matches `/^[A-Za-z0-9_.+\-@%:=\/]+$/` → return raw (no wrap needed).
- Otherwise → wrap в single quotes; replace any inner `'` с `'"'"'` (closes quote, literal quote, reopens quote) — POSIX-safe for `bash -lc` context.

**Shared helper** — `runCodex({ args, timeoutMs })` (F1 post-R1 — explicit two-mode dispatch):

Mode A — **direct** (`spawnPrefix` empty array):
- Spawn `spawnFn(codexPath, args, { stdio: ['pipe','pipe','pipe'], env })`. Args passed as-is (Node handles argv escaping for the OS process layer).

Mode B — **shell wrap** (`spawnPrefix` non-empty, e.g. `['wsl.exe', '-d', 'Ubuntu', 'bash', '-lc']`):
- Build joined command string: `cmdString = [codexPath, ...args].map(shellEscape).join(' ')`.
- Spawn `spawnFn(spawnPrefix[0], [...spawnPrefix.slice(1), cmdString], { stdio: ['pipe','pipe','pipe'], env })`.
- Rationale: `bash -lc` requires exactly ONE argument as command string. Naive `spawn('wsl.exe', [...prefix.slice(1), codexPath, ...args])` would pass each token as SEPARATE argv, binding extras to `$0 $1 …` inside bash — broken. The shell-escape step handles user-supplied prompt text containing `'`, `"`, `$`, backticks — prevents syntax breakage AND command injection.
- NB: `spawnPrefix` convention — final element must be the `-c`/`-lc` flag that accepts single-string command payload. Caller responsibility; adapter doesn't inspect.

Common (both modes) after spawn:
- Add child к `activeSpawns`; remove on `'close'`.
- Collect stdout/stderr buffers (UTF-8 string concat).
- Timeout: `setTimeout(..., timeoutMs).unref()`; on fire → append `[adapter timeout] SIGTERM` к accumulated stderr → `child.kill('SIGTERM')` → `setTimeout(..., 5000).unref()` for SIGKILL escalation (timedOut flag surfaces through stderr marker so classifyCrash remains contract-accurate per P4a F1 pattern).
- Resolves on `'close'` event with `{ exitCode, signal, stdout, stderr, durationMs, timedOut }`.

**Rationale for 10 min `spawnTimeoutMs` default** (F6 post-R1): live probe 6B hit EXIT=124 at 2-min shell timeout during cold start (auth + model warmup). P4a default 5 min may also be borderline; 10 min gives headroom. Configurable per-adapter-instance.

**Session-id discovery helper** — `detectNewSession(beforeEntries)`:
- If `sessionsRoot === null` (F3 post-R1 explicit disable — Windows coordinator case) → return `null` immediately without filesystem access.
- Read recursive file listing from `sessionsRoot`.
- Diff vs `beforeEntries` set — the file path that appeared = new session id (stored as relative path from `sessionsRoot`).
- If 0 new entries found OR if `sessionsRoot` unreadable → return `null`.
- If >1 new entries → log warning, pick lexicographically largest (latest timestamp); orchestrator's serial-task invariant usually prevents parallel writes within the same adapter instance.

**Method mapping**:

1. **launch({project, thread, instruction, sessionId?})**:
   - If `sessionId` provided AND `Map.get(sessionId)?.state === 'running'` with args-mismatch → throw `session-collision` (mirrors P4a F2 fix).
   - Build argv: `['exec', ...(useJsonOutput ? ['--json'] : []), ...configOverrideFlags, ...(model ? ['-m', model] : []), ...(sandboxMode ? ['-s', sandboxMode] : []), instruction]` (F8 post-R1 — `--json` included when `useJsonOutput=true`). Note: `instruction` passes through runCodex's shellEscape in Mode B automatically (F2 post-R1 — no manual escape needed at callsite, runCodex owns escaping for bash -lc semantics).
   - If `sessionId` already provided by caller → use it as our tracking key; we'll update `Map` after success, but Codex-side ID learned через detectNewSession.
   - Snapshot `sessionsRoot` listing `before` — **only if `sessionsRoot` is a non-null string** (F3 post-R1). When caller passes `sessionsRoot: null` (e.g. Windows coordinator — path is WSL-internal, not Node-visible), skip snapshot и `codexSessionId` всегда остаётся null → resume forced к `--last` fallback.
   - Call `runCodex({ args: argv, timeoutMs: spawnTimeoutMs })`.
   - On exit 0: `after` listing → `codexSessionId = detectNewSession(before)`. Session slot created `{state: 'running', launchedAt, lastInvocationAt, project, thread, callArgs: {project, thread, firstMessage: instruction}, codexSessionId}`.
   - Return `{ processHandle: { sessionId: chosenId, codexSessionId, lastExit: 0, lastStdoutTail }, sessionId: chosenId, launchedAt: now() }`. **chosenId = sessionId || crypto.randomUUID()** — adapter-local tracking (orchestrator uses this). codexSessionId stored for resume path.
   - On non-zero exit → throw Error (orchestrator handleAdapterFailure path; classifyCrash categorizes).
   - `record("launch", {...})`.

2. **resume({processHandle, sessionId, message})**:
   - If `!sessionId` → `{messageAccepted: false, processHandle: null, sessionId: null}`.
   - If `Map.get(sessionId)?.state === 'terminated'` → `{messageAccepted: false, ...}`.
   - Lookup `codexSessionId = Map.get(sessionId).codexSessionId`. If present:
     - argv = `['exec', 'resume', codexSessionId, ...(useJsonOutput ? ['--json'] : []), ...configOverrideFlags, ...(model ? ['-m', model] : []), message]`.
   - Else (unknown, e.g. after restart): fall back to `--last`:
     - argv = `['exec', 'resume', '--last', ...(useJsonOutput ? ['--json'] : []), ...configOverrideFlags, ...(model ? ['-m', model] : []), message]`.
     - Log warning — this is best-effort.
   - Run. On exit 0 → `{messageAccepted: true, ...}`. Else → `{messageAccepted: false, ...}`.

3. **shutdown({processHandle, sessionId, force=false})** (mirrors P4a F2 pattern):
   - If `sessionId`-targeted slot present → mark `state = 'terminated'`.
   - Sweep `activeSpawns`: `child.kill(force ? 'SIGKILL' : 'SIGTERM')`. When `force=false`, schedule `.unref()` SIGKILL after 5s.
   - Return `{exitCode: 0, reason: 'adapter-sweep' | 'force-shutdown-swept' | 'clean-shutdown-swept'}`.
   - Gap G4 caveat: on Windows wsl.exe wrapper, inner Codex process may not receive signal cleanly. Phase 2 validates.

4. **isAlive({processHandle, sessionId})**: Map-slot check like P4a.

5. **attachExisting({sessionId})**: stub `{processHandle: null, attached: false}` (G6).

6. **injectMessage({processHandle, sessionId, message})**: delegates к resume() (mirrors P4a / research §1.2 semantic).

7. **parseCompletionSignal({recentOutput, outputFormat})** (F8 post-R1 — JSON path re-enabled given V-C8):
   - `outputFormat === 'json'`: `JSON.parse(recentOutput)` → if parse succeeds AND object contains any non-empty key (Codex `--json` output structure opaque — exact schema varies, heuristic accepts any valid-JSON-with-content as completion signal) → `{completed: true, reason: 'json-parse-ok'}`. If parse fails → fallback к text heuristic.
   - `outputFormat === 'text'`: completed if non-empty recentOutput + last 200 chars don't match `/\berror\b|\bfailed\b|\btraceback\b/i`.
   - `outputFormat === 'stream-json'`: Codex CLI doesn't document a stream-json mode (only `--json` for final output). Treat as alias for `json` branch.
   - Invalid input → `{completed: false, reason: 'parse-failed'}`.

8. **classifyCrash({exitCode, stderr})** (first-match wins; order corrected F9 post-R1):
   Stderr markers checked **before** exit-code-based defaults — because anomalous Codex cases (e.g. `stdin is not a terminal`) appear с exit 0 в live probe observations, и bare exitCode===0 heuristic должен быть последним fallback.
   1. `stderr` (case-insensitive) includes `stdin is not a terminal` → `env/non-retriable` (wrong invocation pattern — surface clearly).
   2. `stderr` (case-insensitive) includes `Not authenticated|login required|401|auth` → `auth/non-retriable`.
   3. `stderr` (case-insensitive) includes `ENOENT|command not found|codex: not found` → `env/non-retriable`.
   4. `stderr` (case-insensitive) includes `timed out|timeout|[adapter timeout]|SIGTERM` OR `exitCode === 124` → `timeout/retriable`.
   5. `exitCode === 0` → `{category: 'unknown', retriable: false}` (non-crash baseline AFTER stderr-anomaly checks).
   6. `exitCode === 1 || 2` → `agent-error/retriable`.
   7. Else → `unknown/non-retriable`.

**Bottom of file**: `if (AGENT_ADAPTER_METHODS.length !== 8) throw …` (contract assertion mirroring mock + P4a).

### Change 2 — `dashboard/server.js` env gate extension

**Locate** P4a bootstrap block (L234-L254, starting `const adapterKind = (process.env.DASHBOARD_ADAPTER || "mock").toLowerCase();`).

**Replace** `if (adapterKind === "claude-code") { … } else { … }` с three-way:

```js
import { createClaudeCodeAdapter } from "../scripts/adapters/claude-code-adapter.mjs";
import { createCodexAdapter } from "../scripts/adapters/codex-adapter.mjs";
// (existing createMockAdapter import stays)

const adapterKind = (process.env.DASHBOARD_ADAPTER || "mock").toLowerCase();
let orchestratorAdapter;
if (adapterKind === "claude-code") {
  orchestratorAdapter = createClaudeCodeAdapter({
    recordCallsTo: path.join(runtimeRoot, "orchestrator-claude-calls.json"),
    logger: console
  });
  console.log("[bootstrap] adapter=claude-code (real)");
} else if (adapterKind === "codex") {
  const spawnPrefix = process.platform === "win32"
    ? ["wsl.exe", "-d", "Ubuntu", "bash", "-lc"]
    : [];
  const sessionsRoot = spawnPrefix.length ? null : undefined;  // F3 post-R1: disable directory-diff на Windows coordinator (sessions live in WSL home, not Node-visible)
  orchestratorAdapter = createCodexAdapter({
    spawnPrefix,
    sessionsRoot,
    recordCallsTo: path.join(runtimeRoot, "orchestrator-codex-calls.json"),
    logger: console
  });
  console.log(`[bootstrap] adapter=codex (real${spawnPrefix.length ? ", via WSL, sessions --last fallback only" : ""})`);
} else {
  orchestratorAdapter = createMockAdapter({
    recordCallsTo: path.join(runtimeRoot, "orchestrator-mock-calls.json")
  });
  console.log("[bootstrap] adapter=mock");
}
// (existing createOrchestrator + setOrchestrator lines stay)
```

Existing async `shutdown()` handler (P4a Change 2.1) unchanged — `await orchestratorAdapter.shutdown({force:false})` works for any adapter kind.

### Change 3 — spec append

At end of «ClaudeCodeAdapter (paperclip pivot P4a)» section in `local-claude-codex-mailbox-workflow.md`, append:

```markdown
### CodexAdapter (paperclip pivot P4b)

`createCodexAdapter({codexPath, spawnPrefix, spawnTimeoutMs, model, sandboxMode, sessionsRoot, configOverrides, recordCallsTo, logger, env})` returns the P2 AgentAdapter shape against real Codex CLI.

Invocation model: single `child_process.spawn` per turn. Codex CLI is **WSL-only** per architecture rail #7; on Windows the adapter wraps spawn through `wsl.exe -d Ubuntu -- bash -lc "…"` via `spawnPrefix`. First turn uses `codex exec --json "<instruction>"` (positional PROMPT per live probe 2026-04-20; `--json` per `codex exec --help` F8 post-R1 correction); subsequent turns use `codex exec resume <codexSessionId|--last> --json "<message>"`. `--json` is default via `useJsonOutput: true` option — deterministic JSON parse path in parseCompletionSignal; text heuristic retained as fallback.

Key differences vs P4a ClaudeCodeAdapter:
- No `--session-id UUID`: adapter learns Codex-side session id by diffing `~/.codex/sessions/` listing before/after first exec.
- No `--max-turns`: wall-clock `spawnTimeoutMs` (default **10 min**) is only safety — probes showed 2-min default too short for cold-start.
- JSON output via `--json` (exec subcommand level, not global) — exact schema opaque, adapter treats any valid JSON with content as completion signal; text branch remains fallback.

Bootstrap: `DASHBOARD_ADAPTER=codex` в env. Windows coordinator auto-wraps к WSL.

CodexAdapter methods otherwise mirror the P4a contract — launch / resume (routed through `exec resume`) / shutdown (activeSpawns SIGTERM+SIGKILL sweep с `.unref()` timers) / isAlive (Map slot) / attachExisting (stub) / injectMessage (alias to resume) / parseCompletionSignal (json primary / text fallback) / classifyCrash (7-step first-match — stderr anomalies precede exit 0 default; exit 124 → timeout).
```

### Change 4 — research doc delta

At end of `docs/codex-tasks/paperclip-pivot-adapter-contract-research.md` §2 (Codex CLI primitives), append section §2.1:

```markdown
### §2.1 Live-probe findings (2026-04-20)

R-OQ-3/4/5/6 resolved via mailbox thread `paperclip-p4b-codex-adapter-live-probe` (2 Codex reply letters, archived).

- **Initial prompt delivery** (R-OQ-3): `codex exec [PROMPT]` positional argument (NOT `-p`, NOT `--prompt`). Stdin `-` accepted. Bare `codex "prompt"` wrongly attempts TUI and errors «stdin is not a terminal».
- **Session resume** (R-OQ-4): `codex exec resume <session-id>|--last "<prompt>"` — resume is subcommand **inside exec**, not global. Global `codex resume` requires TTY and is interactive-only.
- **Output format** (R-OQ-5): **corrected post-Codex-R1 adversarial finding** — `codex exec --help` exposes **`--json`** flag and **`-o, --output-last-message <FILE>`** (and similarly on `codex exec resume --help`). Initial probe 4 missed these because it grep'd only global `codex --help`, not exec subcommand. Adapter sets `useJsonOutput=true` default and passes `--json` flag; parseCompletionSignal parses JSON payload (any valid JSON with content = completion signal), fallback к text heuristic if parse fails.
- **Config / model / sandbox flags** (R-OQ-6): `-c key=value` override, `-m --model`, `-s --sandbox <read-only|workspace-write|danger-full-access>`. `~/.codex/config.toml` as default source.
- **Session storage**: `~/.codex/sessions/YYYY/…` observed; exact per-session filename structure opaque. Adapter learns ID by directory-diff before/after first exec.
- **Exit codes observed**: 0 = success; 124 = timeout (from `timeout`-style wrapper OR model hang); «stdin is not a terminal» prints to stderr с exit 0 when wrong invocation style used (confusing — adapter classifyCrash treats this as env/non-retriable).
- **No `--max-turns`**: no turn cap analogue to Claude CLI — adapter relies on wall-clock timeout only.
- **Windows-native**: remains disabled per rail #7; WSL wrapper required.

Empirical gaps (Phase 2 validation):
- Probe 6B hit EXIT=124 — session-write на exec success not empirically confirmed (docs imply, but timeout cut short).
- SIGTERM/SIGKILL propagation through `wsl.exe` wrapper к inner codex process not tested live.
```

---

## §6 Verification phases

### Phase 1 — Codex (WSL)

| # | Check | Expected |
|---|-------|----------|
| V1 | `node --check scripts/adapters/codex-adapter.mjs` | PASS |
| V2 | `node --check dashboard/server.js` post-change | PASS |
| V3 | Build clean | `✓ built` |
| V4 | `createCodexAdapter` passes `validateAdapter` (stub spawn) | `{valid:true, missing:[]}` |
| V5 | `createCodexAdapter` export grep | count = 1 |
| V6 | `AGENT_ADAPTER_METHODS.length !== 8` assertion present | ≥1 |
| V7 | server.js three-way gate | grep `adapterKind === "codex"` count ≥1 |
| V8 | Spec section «CodexAdapter (paperclip pivot P4b)» added | = 1 |
| V9 | Research doc §2.1 section added | grep «Live-probe findings (2026-04-20)» = 1 |
| V10 | Stubbed cycle 6 sub-probes (launch / resume / isAlive / inject / shutdown / isAlive-after) | 6/6 PASS |
| V11 | Session-collision throw | PASS |
| V12 | classifyCrash taxonomy 8 fixtures (+ exit 124 + «stdin is not a terminal») | 8/8 PASS |
| V13 | parseCompletionSignal text branch + JSON fallback | PASS |
| V14 | shutdown activeSpawns sweep | PASS child.kill ≥1 |
| V15 | `wsl.exe` shell-wrap mode (capture argv; F1+F5 post-R1) | `argv[0]==='wsl.exe'`, `argv.includes('-lc')`, last arg begins `codex exec ` |
| V16 | shell-escape safety — prompt с spaces/quotes/dollar joined correctly (F2 post-R1) | PASS — last argv contains single-quote-wrapped prompt AND no unescaped `$` leakage |
| V17 | PD scan (production paths) | `--scan done` clean |
| V18 | Whitelist drift | 1 new + 3 M (server.js + spec + research) + 3 handoff |

Verification commands:

```bash
# V1-V3
node --check scripts/adapters/codex-adapter.mjs && echo "V1 PASS"
node --check dashboard/server.js && echo "V2 PASS"
cd dashboard && npx vite build 2>&1 | tail -3

# V4 — validateAdapter
node -e "
import('./scripts/adapters/codex-adapter.mjs').then(async (m) => {
  const adapter = m.createCodexAdapter({ spawnFn: () => ({ on:()=>{}, stdout:{on:()=>{}}, stderr:{on:()=>{}}, kill:()=>{} }) });
  const v = await import('./scripts/adapters/agent-adapter.mjs');
  console.log('V4:', JSON.stringify(v.validateAdapter(adapter)));
});
"

# V5
grep -cE '^export function createCodexAdapter' scripts/adapters/codex-adapter.mjs

# V6
grep -cE 'AGENT_ADAPTER_METHODS\.length !== 8' scripts/adapters/codex-adapter.mjs

# V7
grep -cE 'adapterKind === "codex"' dashboard/server.js

# V8
grep -c 'CodexAdapter (paperclip pivot P4b)' local-claude-codex-mailbox-workflow.md

# V9
grep -c 'Live-probe findings (2026-04-20)' docs/codex-tasks/paperclip-pivot-adapter-contract-research.md

# V10 — stubbed cycle
node -e "
import('./scripts/adapters/codex-adapter.mjs').then(async (m) => {
  function makeFakeSpawn(exitCode = 0, stdout = 'Session created. Done.\n', stderr = '') {
    return function () {
      const listeners = { exit: [], error: [], close: [] };
      const sdl = []; const stl = [];
      const child = {
        on: (ev, cb) => { listeners[ev] ||= []; listeners[ev].push(cb); },
        kill: () => {},
        stdout: { on: (ev, cb) => { if (ev === 'data') sdl.push(cb); } },
        stderr: { on: (ev, cb) => { if (ev === 'data') stl.push(cb); } }
      };
      setImmediate(() => {
        if (stdout) sdl.forEach(cb => cb(Buffer.from(stdout)));
        if (stderr) stl.forEach(cb => cb(Buffer.from(stderr)));
        (listeners.exit || []).forEach(cb => cb(exitCode, null));
        (listeners.close || []).forEach(cb => cb(exitCode, null));
      });
      return child;
    };
  }
  const adapter = m.createCodexAdapter({ spawnFn: makeFakeSpawn(), sessionsRoot: '/tmp/non-existent-sessions-' + process.pid });
  const launched = await adapter.launch({ project: 'workflow', thread: 't1', instruction: 'first' });
  console.log('V10a:', launched.sessionId && launched.launchedAt ? 'PASS' : 'FAIL');
  const resumed = await adapter.resume({ sessionId: launched.sessionId, message: 'second' });
  console.log('V10b:', resumed.messageAccepted ? 'PASS' : 'FAIL');
  console.log('V10c:', adapter.isAlive({ sessionId: launched.sessionId }) ? 'PASS' : 'FAIL');
  const inj = await adapter.injectMessage({ processHandle: launched.processHandle, sessionId: launched.sessionId, message: 'third' });
  console.log('V10d:', inj.injected && inj.fellBackToResume ? 'PASS' : 'FAIL');
  const s = await adapter.shutdown({ sessionId: launched.sessionId });
  console.log('V10e:', s.exitCode === 0 ? 'PASS' : 'FAIL');
  console.log('V10f:', !adapter.isAlive({ sessionId: launched.sessionId }) ? 'PASS' : 'FAIL');
});
" 2>&1

# V11 — session collision
node -e "
import('./scripts/adapters/codex-adapter.mjs').then(async (m) => {
  function fakeSpawn() {
    const listeners = { exit: [], close: [] };
    const sdl = []; const stl = [];
    const child = { on:(e,cb)=>{listeners[e]||=[]; listeners[e].push(cb);}, kill:()=>{}, stdout:{on:(e,cb)=>{if(e==='data') sdl.push(cb);}}, stderr:{on:(e,cb)=>{if(e==='data') stl.push(cb);}} };
    setImmediate(() => { sdl.forEach(cb=>cb(Buffer.from('ok\n'))); (listeners.exit||[]).forEach(cb=>cb(0,null)); (listeners.close||[]).forEach(cb=>cb(0,null)); });
    return child;
  }
  const adapter = m.createCodexAdapter({ spawnFn: fakeSpawn, sessionsRoot: '/tmp/none-' + process.pid });
  await adapter.launch({ project: 'workflow', thread: 't', instruction: 'msg-A', sessionId: '11111111-1111-1111-1111-111111111111' });
  let threw = false;
  try { await adapter.launch({ project: 'workflow', thread: 't', instruction: 'msg-B', sessionId: '11111111-1111-1111-1111-111111111111' }); } catch { threw = true; }
  console.log('V11:', threw ? 'PASS' : 'FAIL');
});
" 2>&1

# V12 — classifyCrash 8 fixtures
node -e "
import('./scripts/adapters/codex-adapter.mjs').then(async (m) => {
  const a = m.createCodexAdapter({ spawnFn: () => ({ on:()=>{}, stdout:{on:()=>{}}, stderr:{on:()=>{}}, kill:()=>{} }) });
  const cases = [
    [{ exitCode: 0, stderr: '' }, 'unknown'],
    [{ exitCode: 1, stderr: 'Not authenticated: login required' }, 'auth'],
    [{ exitCode: 127, stderr: 'codex: not found' }, 'env'],
    [{ exitCode: 124, stderr: 'timed out' }, 'timeout'],
    [{ exitCode: null, stderr: '[adapter timeout] SIGTERM' }, 'timeout'],
    [{ exitCode: 0, stderr: 'Error: stdin is not a terminal' }, 'env'],
    [{ exitCode: 1, stderr: 'TypeError: boom' }, 'agent-error'],
    [{ exitCode: 99, stderr: 'weird' }, 'unknown']
  ];
  let pass = 0;
  for (const [args, want] of cases) {
    const r = a.classifyCrash(args);
    if (r.category === want) pass++;
    else console.log('V12 miss:', JSON.stringify(args), '->', r.category, 'want', want);
  }
  console.log('V12:', pass === cases.length ? ('PASS ' + pass + '/' + cases.length) : ('FAIL ' + pass + '/' + cases.length));
});
" 2>&1

# V13 — parseCompletionSignal
node -e "
import('./scripts/adapters/codex-adapter.mjs').then(async (m) => {
  const a = m.createCodexAdapter({ spawnFn: () => ({ on:()=>{}, stdout:{on:()=>{}}, stderr:{on:()=>{}}, kill:()=>{} }) });
  const t1 = a.parseCompletionSignal({ recentOutput: 'Task completed.', outputFormat: 'text' });
  const t2 = a.parseCompletionSignal({ recentOutput: '', outputFormat: 'text' });
  const t3 = a.parseCompletionSignal({ recentOutput: 'Traceback: failed', outputFormat: 'text' });
  const pass = t1.completed && !t2.completed && !t3.completed;
  console.log('V13:', pass ? 'PASS' : 'FAIL ' + JSON.stringify({ t1, t2, t3 }));
});
" 2>&1

# V14 — shutdown sweep
node -e "
import('./scripts/adapters/codex-adapter.mjs').then(async (m) => {
  let killed = 0;
  function hangSpawn() { return { on:()=>{}, stdout:{on:()=>{}}, stderr:{on:()=>{}}, kill:() => { killed++; } }; }
  const a = m.createCodexAdapter({ spawnFn: hangSpawn, spawnTimeoutMs: 999999, sessionsRoot: '/tmp/none-' + process.pid });
  const pending = a.launch({ project: 'w', thread: 't', instruction: 'x' });
  await new Promise(r => setImmediate(r));
  const s = await a.shutdown({ force: true });
  console.log('V14:', (killed >= 1 && s.exitCode === 0) ? 'PASS' : 'FAIL killed=' + killed);
  pending.catch(() => {});
});
" 2>&1

# V15 — wsl.exe shell-wrap mode (F1+F5 post-R1)
node -e "
import('./scripts/adapters/codex-adapter.mjs').then(async (m) => {
  let capturedArgv = null;
  function capturingSpawn(bin, args) {
    capturedArgv = [bin, ...args];
    const listeners = { exit:[], close:[] };
    const sdl = []; const stl = [];
    const child = { on:(e,cb)=>{listeners[e]||=[]; listeners[e].push(cb);}, kill:()=>{}, stdout:{on:(e,cb)=>{if(e==='data') sdl.push(cb);}}, stderr:{on:(e,cb)=>{if(e==='data') stl.push(cb);}} };
    setImmediate(() => { sdl.forEach(cb=>cb(Buffer.from('ok\n'))); (listeners.exit||[]).forEach(cb=>cb(0,null)); (listeners.close||[]).forEach(cb=>cb(0,null)); });
    return child;
  }
  const a = m.createCodexAdapter({ spawnFn: capturingSpawn, spawnPrefix: ['wsl.exe', '-d', 'Ubuntu', 'bash', '-lc'], sessionsRoot: null });
  await a.launch({ project: 'w', thread: 't', instruction: 'hi' });
  const ok = capturedArgv && capturedArgv[0] === 'wsl.exe' && capturedArgv.includes('-lc') && capturedArgv[capturedArgv.length - 1].startsWith('codex exec ');
  console.log('V15:', ok ? 'PASS' : 'FAIL ' + JSON.stringify(capturedArgv));
});
" 2>&1

# V16 — shell-escape safety (F2 post-R1)
node -e "
import('./scripts/adapters/codex-adapter.mjs').then(async (m) => {
  let capturedArgv = null;
  function capturingSpawn(bin, args) {
    capturedArgv = [bin, ...args];
    const listeners = { exit:[], close:[] };
    const sdl = []; const stl = [];
    const child = { on:(e,cb)=>{listeners[e]||=[]; listeners[e].push(cb);}, kill:()=>{}, stdout:{on:(e,cb)=>{if(e==='data') sdl.push(cb);}}, stderr:{on:(e,cb)=>{if(e==='data') stl.push(cb);}} };
    setImmediate(() => { sdl.forEach(cb=>cb(Buffer.from('ok\n'))); (listeners.exit||[]).forEach(cb=>cb(0,null)); (listeners.close||[]).forEach(cb=>cb(0,null)); });
    return child;
  }
  const a = m.createCodexAdapter({ spawnFn: capturingSpawn, spawnPrefix: ['wsl.exe', '-d', 'Ubuntu', 'bash', '-lc'], sessionsRoot: null });
  // Prompt со spaces, inner single-quotes, double-quotes, dollar, backticks — shellEscape должен обрабатывать
  const hostile = 'hello \\'world\\' \"with quotes\" and \$HOME and \`cmd\`';
  await a.launch({ project: 'w', thread: 't', instruction: hostile });
  const cmdString = capturedArgv[capturedArgv.length - 1];
  // Structural assertions (F2 post-R1, R2 fix — dollar-regex was broken because $HOME внутри outer single-quote region):
  // (a) begins with 'codex exec '; (b) shellEscape wrapped prompt в outer single quotes; (c) inner `'` escaped via POSIX idiom `'\"'\"'` — hostile prompt contains 2 inner quotes → ≥2 escape sequences
  const hasExec = cmdString.startsWith('codex exec ');
  const escapeSeq = (cmdString.match(/'\"'\"'/g) || []).length;
  const wrappedPrompt = cmdString.includes(\"'hello \");
  const ok = hasExec && escapeSeq >= 2 && wrappedPrompt;
  console.log('V16:', ok ? 'PASS' : 'FAIL ' + JSON.stringify({hasExec, escapeSeq, wrappedPrompt, cmdString}));
});
" 2>&1

# V17 — PD scan
PD_PATTERNS='$PD_PATTERNS'
grep -riE "$PD_PATTERNS" --include="*.js" --include="*.jsx" --include="*.mjs" --include="*.html" --include="*.json" dashboard/ scripts/ 2>/dev/null
grep -riE "$PD_PATTERNS" --include="*.md" CLAUDE.md README.md README.ru.md local-claude-codex-mailbox-workflow.md workflow-*.md 2>/dev/null
echo "--scan done"

# V18 — whitelist drift
git status --short
# Expected: 1 new (scripts/adapters/codex-adapter.mjs) + 3 M (dashboard/server.js, local-claude-codex-mailbox-workflow.md, docs/codex-tasks/paperclip-pivot-adapter-contract-research.md) + 3 handoff artefacts (p4b plan, audit, report).
```

### Phase 2 — user visual `[awaits user]`

| # | Check |
|---|-------|
| P2.1 | Dashboard `DASHBOARD_ADAPTER=mock` (default) — log `[bootstrap] adapter=mock`. No regression. |
| P2.2 | Dashboard `DASHBOARD_ADAPTER=claude-code` — log `[bootstrap] adapter=claude-code (real)`. P4a still works. |
| P2.3 | Dashboard `DASHBOARD_ADAPTER=codex` (Windows) — log `[bootstrap] adapter=codex (real, via WSL)`. validateAdapter PASS at construction. |
| P2.4 | (Optional live invoke) Create task через UI — orchestrator spawns real codex → first turn writes к `orchestrator-codex-calls.json` + session appears in `~/.codex/sessions/`. User decides when. |
| P2.5 | SIGINT shutdown sweep — no lingering codex processes after dashboard exit (empirical; gap G4 validates here). |

### Phase 3 — cross-OS parity

Codex WSL-only per rail #7. Windows coordinator uses `wsl.exe` wrapper (tested structurally via V15). Linux/WSL coordinator uses direct spawn. No other cross-OS surfaces.

---

## §7 Acceptance criteria

- [ ] Phase 1 V1-V18 PASS
- [ ] Report §0-§11 filled
- [ ] No files outside whitelist
- [ ] PD scan clean
- [ ] `validateAdapter(createCodexAdapter())` returns `{valid:true}`
- [ ] Mock remains default; claude-code + codex via env
- [ ] No commit/push без user command
- [ ] Phase 2 + Phase 3 awaits user

---

## §8 Out of scope

- Long-lived Codex process reuse.
- `attachExisting` real implementation (session-file discovery) — P5+.
- Coordinator restart recovery adapter-level — P5+.
- Multi-task parallelism — P5+.
- UI adapter switcher — P5+.
- Windows-native Codex (kept WSL-only per architecture rail #7).
- Real Codex invocation в Phase 1 — stubbed spawnFn only (CLI may be auth-expired в executor env; Phase 2 validates).
- Authentication flow (`codex login` etc.) — user responsibility.

---

## §9 Rollback

**До commit**:
1. `git diff --stat dashboard/server.js local-claude-codex-mailbox-workflow.md docs/codex-tasks/paperclip-pivot-adapter-contract-research.md`.
2. `rm -f scripts/adapters/codex-adapter.mjs`.
3. `git checkout -- dashboard/server.js local-claude-codex-mailbox-workflow.md docs/codex-tasks/paperclip-pivot-adapter-contract-research.md`.
4. `rm -f mailbox-runtime/orchestrator-codex-calls.json` (gitignored).
5. Restart dashboard — mock или claude-code restored.

**После commit**: `git revert <sha>`.

**NB**: `orchestrator-mock-calls.json`, `orchestrator-claude-calls.json`, `orchestrator-codex-calls.json` могут co-exist — gitignored, не шипятся.

---

## §10 Discrepancy checkpoints (STOP)

1. Baseline HEAD ≠ `0c97c14` → STOP.
2. `scripts/adapters/agent-adapter.mjs` / `mock-adapter.mjs` / `claude-code-adapter.mjs` modified → STOP (contract locked + P4a stable).
3. `dashboard/orchestrator.mjs` / `supervisor.mjs` / `src/**` modified → STOP (outside whitelist).
4. Phase 1 V1-V18 any FAIL → STOP.
5. Temptation add `--output-format` flag → STOP (probe 4 confirms no such flag).
6. Temptation add `--max-turns` flag → STOP (doesn't exist).
7. Temptation add `--session-id UUID` flag → STOP (doesn't exist — directory-diff only).
8. Temptation add real `attachExisting` session discovery → STOP (P5+).
9. Temptation run real `codex exec` в V1-V18 (burn tokens/auth-hang) → STOP (stubbed spawnFn only).
10. Temptation add Windows-native codex path → STOP (rail #7 WSL-only).
11. Temptation skip shellEscape helper для «production-ready shortcuts» → STOP (bash -lc requires it; F2 post-R1).
12. V17 PD scan hit in production paths → STOP.
13. V18 whitelist drift → STOP.

---

## §11 Self-audit checklist

- [ ] 1: Pre-flight P1-P5 OK
- [ ] 2: Change 1 codex-adapter.mjs created (NEW)
- [ ] 3: Change 2 server.js three-way gate
- [ ] 4: Change 3 spec section appended
- [ ] 5: Change 4 research doc §2.1 appended
- [ ] 6: V1-V18 recorded verbatim
- [ ] 7: V17 PD scan clean
- [ ] 8: V18 whitelist drift clean
- [ ] 9: No commit/push
- [ ] 10: Discrepancies recorded
- [ ] 11: Report §0-§11 filled
- [ ] 12: mock-adapter.mjs unchanged (diff empty)
- [ ] 13: agent-adapter.mjs unchanged (diff empty)
- [ ] 14: claude-code-adapter.mjs unchanged (diff empty)
- [ ] 15: orchestrator.mjs unchanged (diff empty)
- [ ] 16: supervisor.mjs unchanged (diff empty)

≥14/16 OK → ready for user review.

---

## §12 Notes to Codex

- Environment: WSL, `cwd=/mnt/e/Project/workflow`.
- Baseline: HEAD=`0c97c14`.
- No commit/push без user command.
- No real Codex CLI invocation в Phase 1 — V probes use stubbed spawnFn. Real behavior = Phase 2 [awaits user].
- Anti-fabrication: V outputs verbatim в report §2.
- Mirror P4a `claude-code-adapter.mjs` patterns (runCodex helper, activeSpawns Set, atomic call log, contract assertion at bottom).
- `codex exec` positional PROMPT is CRITICAL — do NOT use `-p` or `--prompt` (both fail per live probe).
- Session-id learning via sessionsRoot directory diff is best-effort; fallback к `--last` when сохранённый codexSessionId отсутствует.
- Windows coordinator auto-wraps к `wsl.exe -d Ubuntu -- bash -lc` — bash script invocation. `sessionsRoot` path на Windows должен указывать на WSL home через `/mnt/c/Users/.../Wsl/... /home/<user>/.codex/sessions` OR skip detectNewSession gracefully (adapter treats unreadable sessionsRoot as «no diff data, fallback к --last on resume»).
- `-c key=value` TOML overrides: caller responsibility для TOML-valid `value` (strings must be `"…"`-wrapped in caller-supplied object). Adapter passes verbatim.
- Sensitive: do NOT include any Codex config file content (`~/.codex/config.toml`) in code or logs. Adapter reads sessions directory listing only (filename/path level).
- **shellEscape MUST be applied по всему argv tail в Mode B** (F2 post-R1) — runCodex owns escaping; callsites pass raw tokens. Never construct bash command string via naive `.join(' ')` without escape — exposes injection + breaks на prompts с spaces/quotes.
- **G4 mitigation note**: if Phase 2 P2.5 observes lingering codex processes на Windows после SIGINT через wsl.exe wrapper — document as P5+ refinement (candidate: `wsl.exe --shutdown` fallback OR explicit `pkill codex` через wsl.exe перед exit). Do NOT implement в P4b; flag only.

---

## §13 Commits strategy

Single commit covering Change 1 + Change 2 + Change 3 + Change 4 + 3 handoff artefacts. No hunk-split.
