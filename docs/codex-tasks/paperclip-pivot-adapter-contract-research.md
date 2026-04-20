# Paperclip Pivot — Adapter Contract Research

**Purpose**: Extract what Claude Code CLI + Codex CLI support для programmatic launch, resume, shutdown, liveness, and output parsing. Used as primary input для shaping `scripts/adapters/agent-adapter.mjs` interface в Phase P2.

**Sources**:
- Claude Code CLI docs (`https://code.claude.com/docs/en/cli`) — fetched 2026-04-20 R1.
- Claude Code headless docs (referenced: `/en/headless`) — mentioned in CLI doc.
- Claude Code hooks docs (`/en/hooks`) — prior WebFetch (cached from Phase B/C).
- Codex CLI config reference (`https://developers.openai.com/codex/config-reference`) — fetched 2026-04-20 R1 (partial).
- Codex command-line reference (`https://developers.openai.com/codex/cli/reference`) — **NOT fully extracted** per gap G1; needs live probe в P4.

---

## §1 Claude Code CLI primitives

### 1.1 Headless / non-interactive launch

- `claude -p "prompt"` или `claude --print "prompt"` — single-shot query, print response, exit.
- `cat file | claude -p "prompt"` — piped content as additional context.
- `claude -p --output-format json "prompt"` — structured output с turn messages + tool calls.
- `claude -p --output-format stream-json "prompt"` — streaming events (progressive output).
- `claude -p --max-turns N "prompt"` — limit agent turns (P2 useful для loop control).
- `claude -p --no-session-persistence "prompt"` — don't save session (ephemeral runs).
- `claude --bare -p "prompt"` — skip hooks/skills/plugins/CLAUDE.md для faster startup + minimal context.

**Exit behavior**: `-p` exits 0 on success, non-zero on error (exact codes TBD live probe). `--max-turns` limit → exits с error.

### 1.2 Session control

- `claude --session-id "UUID" "prompt"` — assign specific UUID к session (controllable ID).
- `claude -r "<session-id-or-name>" "prompt"` — resume existing session (or interactive picker if no arg).
- `claude -c "prompt"` — continue latest session в current dir.
- `claude -n "name"` — display name; `claude --resume "name"` resumes by name.
- `claude --fork-session` — когда combined с `--resume`, создаёт new session ID but keeps context.

**Session persistence**: saved к disk по умолчанию (без `--no-session-persistence`). Resume через ID или name works.

**Key insight**: Claude Code **не supports** mid-stream stdin injection of new messages. Each turn = new invocation с `-r` (or interactive). Adapter `injectMessage` method → treated как `resume()` semantically.

### 1.3 Output formats

Three modes via `--output-format`:
- `text` (default) — plain text response.
- `json` — full turn structure as JSON.
- `stream-json` — streaming events (partial messages через `--include-partial-messages`).

For adapter integration, `json` или `stream-json` recommended — structured parsing avoids text regex heuristics.

### 1.4 Completion detection

With `--output-format json`:
- Final JSON включает complete turn list.
- Tool call boundaries visible.
- End-of-turn = JSON parse complete + exit code 0.

With `--output-format stream-json`:
- Events stream, final event indicates completion.
- `--include-hook-events` + `--include-partial-messages` give full trace.

Heuristic plan для `parseCompletionSignal`:
- If `--output-format=json` → parse final JSON, check for `final_message` или similar marker.
- If `--output-format=stream-json` → track stream events, detect terminal event.
- If `text` → fallback to exit-code-only detection + timeout.

### 1.5 System prompt injection

- `--system-prompt "text"` — replace entire system prompt.
- `--system-prompt-file path` — load from file.
- `--append-system-prompt "text"` — append to default.
- `--append-system-prompt-file path` — append from file.

Adapter can inject project-specific instructions через append (preserves CLAUDE.md + rules).

### 1.6 Session file artifacts

Per Claude Code hooks docs (Phase B R1): SessionStart hook stdin includes `session_id` + `transcript_path` (JSONL file path). Transcript = ground truth для session state. Adapter может read transcript для verifying state или extracting intermediate messages.

### 1.7 Cross-platform notes

Claude Code CLI works Windows native + WSL + IDE. Adapter spawn через child_process.spawn:
- Windows: `claude.cmd` (shim script) или `claude.exe` direct.
- WSL: `claude` binary в WSL PATH.
- Cross-process: Windows coordinator spawning WSL Claude → use `wsl.exe -d Ubuntu -- claude -p "..."` per wiki windows-wsl-process-launcher.

### 1.8 Open questions для Claude Code

- OQ-1: Exact exit code taxonomy (timeout vs crash vs user stop vs model error). Live probe в P4.
- OQ-2: Does `--session-id UUID` conflict if UUID already exists? Overwrite или error? Live probe.
- OQ-3: Max concurrent sessions on single Claude Code install? Per-user rate limits?

---

## §2 Codex CLI primitives

**Caveat**: Codex CLI command-line reference not fully extracted в R1 fetch. Section based on config reference + known behaviors from wiki concepts. Live probe в P4.

### 2.1 Batch / non-interactive mode

- `approval_policy = "never"` в config → suppresses interactive prompts.
- `history.persistence = "none"` → disable transcript save (for ephemeral batch).
- Config location: `~/.codex/config.toml` (user-level) или project override.

### 2.2 Initial prompt delivery

- **Partial evidence** (requires live probe): Codex CLI likely accepts initial prompt as argument или stdin pipe, similar to Claude.
- Need P4 live probe: `codex --help` output, test `codex "prompt"` vs `codex run "prompt"` vs `echo "prompt" | codex -` etc.

### 2.3 Session resume

- **Unknown** в extracted docs. Codex CLI session semantics TBD live probe.

### 2.4 Output format

- **Unknown** в extracted docs. Need live probe: `--output-format json` или similar?

### 2.5 Cross-platform stance

- Codex CLI = experimental on Windows native per wiki `workflow-hybrid-hook-automation` + architecture plan rail #7.
- **Supported**: Linux / WSL.
- Windows Codex = degraded mode: manual user spawn или coordinator skips.

### 2.6 Spawn strategy (Windows coordinator → WSL Codex)

Per wiki `windows-wsl-process-launcher`:
```
cmd.exe /c start /min "" wsl.exe -d Ubuntu bash -lc "cd /mnt/e/project && codex <args>"
```

Alternative без launch window:
```
wsl.exe -d Ubuntu bash -lc "cd /mnt/e/project && codex <args>"
```

Node `child_process.spawn("wsl.exe", ["-d", "Ubuntu", "bash", "-lc", cmd])` pattern.

### 2.7 Open questions для Codex

- OQ-1: CLI flag для initial prompt (positional? stdin? `--prompt`?).
- OQ-2: Session persistence + resume flags.
- OQ-3: Output format control.
- OQ-4: Exit code taxonomy.
- OQ-5: Windows-native support status (current docs say disabled; verify).

All flagged для **P4 live probe** при real adapter implementation.

---

## §3 Process lifecycle gotchas (both agents)

Per wiki `windows-wsl-process-launcher` + `wsl-windows-native-binding-drift`:

### 3.1 Spawn primitives

Node `child_process.spawn(command, args, { cwd, env, stdio })`:
- `stdio: 'pipe'` — adapter captures stdout/stderr.
- `stdio: 'ignore'` — fire-and-forget (не recommended — lose completion signal).
- `stdio: 'inherit'` — child uses parent terminal (not suitable для coordinator-owned).

Recommended: `stdio: ['pipe', 'pipe', 'pipe']` — capture stderr for crash classification.

### 3.2 Zombie prevention

- `process.on('exit', cleanup)` parent-side — ensure spawned children tracked.
- Adapter maintains Map<sessionId, childProcess> для explicit termination.
- Coordinator shutdown handler (Phase A pattern) должен kill все tracked children.

### 3.3 Signal handling

- SIGTERM graceful → agent gets time to flush.
- SIGKILL force → immediate termination.
- Adapter `shutdown({force:true})` → SIGKILL сразу; otherwise SIGTERM + 5s timeout → SIGKILL fallback.
- Cross-platform: SIGTERM на Windows emulated через Node, работает для child processes.

### 3.4 Long-running sessions

Claude Code `-p` single-shot → exits quickly.
Claude Code interactive → long-running; adapter spawns + injects, но `injectMessage` ограничен (см. §1.2 insight).
Codex — unknown long-running behavior в batch mode.

**Adapter strategy**: single-shot invocation per-turn. State = persisted session ID + conversation history файл. Each iteration = fresh child process spawn с `-r session-id`.

### 3.5 Timeout handling

- Default адаptor timeout: 5 minutes per invocation (configurable).
- Exceeds → adapter kills child + marks task `failed` с reason=`timeout`.
- Cross-OS timer = setTimeout + .unref() cleanup.

---

## §4 Proposed `AgentAdapter` interface (JSDoc-ready)

```js
/**
 * Abstract agent adapter interface.
 * Real implementations (ClaudeCodeAdapter, CodexAdapter) come в P4;
 * MockAdapter реализация в P2 для P3 orchestrator development.
 */

/**
 * launch: start fresh agent session with initial instruction.
 * @param {Object} args
 * @param {string} args.project - project name (baseline isolation)
 * @param {string} args.thread - mailbox thread slug
 * @param {string} args.instruction - initial prompt
 * @param {string} [args.sessionId] - optional preset session UUID
 * @returns {Promise<{processHandle: any, sessionId: string, launchedAt: string}>}
 */

/**
 * resume: continue existing session with new message. This is primary message
 * delivery mechanism — Claude Code doesn't support mid-stream injection, so
 * each follow-up = fresh spawn via -r session-id.
 * @param {Object} args
 * @param {any} [args.processHandle] - prior processHandle (may be dead)
 * @param {string} args.sessionId - session ID for -r flag
 * @param {string} args.message - message to deliver
 * @returns {Promise<{messageAccepted: boolean, processHandle: any, sessionId: string}>}
 */

/**
 * shutdown: terminate running agent process.
 * @param {Object} args
 * @param {any} [args.processHandle]
 * @param {string} [args.sessionId]
 * @param {boolean} [args.force=false] - SIGKILL vs SIGTERM graceful
 * @returns {Promise<{exitCode: number|null, reason: string}>}
 */

/**
 * isAlive: check whether session's process still running.
 * @param {Object} args
 * @param {any} [args.processHandle]
 * @param {string} [args.sessionId]
 * @returns {boolean}
 */

/**
 * attachExisting: best-effort reconnect to pre-existing user-opened session.
 * Primary path (coordinator-owned) doesn't require this; optional для
 * cases когда user уже has live Claude Code session open.
 * @param {Object} args
 * @param {string} args.sessionId
 * @returns {Promise<{processHandle: any|null, attached: boolean}>}
 */

/**
 * injectMessage: mid-life inject. For Claude Code = alias for resume()
 * because CLI doesn't support stdin injection. For future adapter types
 * с stdin IPC support — real mid-stream delivery.
 * Accepts optional sessionId fallback (post-F1 fix) — после coordinator restart
 * processHandle может быть lost, но sessionId persists и unblocks delegated resume.
 * @param {Object} args
 * @param {any} [args.processHandle] - preferred if still alive in-memory
 * @param {string} [args.sessionId] - fallback persistent identifier
 * @param {string} args.message
 * @returns {Promise<{injected: boolean, fellBackToResume: boolean}>}
 */

/**
 * parseCompletionSignal: heuristic detection that agent finished its work.
 * Analyzes recent output (JSON/stream-JSON/text) для terminal markers.
 * @param {Object} args
 * @param {string} args.recentOutput - stdout captured recently
 * @param {string} [args.outputFormat='text'] - 'text'|'json'|'stream-json'
 * @returns {{completed: boolean, reason: string}}
 */

/**
 * classifyCrash: normalize exit failure into actionable category.
 * @param {Object} args
 * @param {number} args.exitCode
 * @param {string} args.stderr
 * @returns {{category: 'env'|'auth'|'timeout'|'agent-error'|'unknown', retriable: boolean}}
 */
```

---

## §5 Mock implementation behavior spec

`MockAdapter` для P3 orchestrator development:

- Всё state в memory (`Map<sessionId, mockState>`).
- `launch()` → generates UUID (crypto.randomUUID), records call, returns preset.
- `resume()` → records call, updates mockState.lastMessage.
- `shutdown()` → marks state terminated, returns exit code 0.
- `isAlive()` → returns state !== terminated.
- `attachExisting()` → always returns {attached: false} (mock has no pre-existing).
- `injectMessage()` → alias calls resume().
- `parseCompletionSignal()` → returns {completed: true, reason: 'mock-always-completes'} if recentOutput contains 'COMPLETE' substring; else {completed: false}.
- `classifyCrash()` → simple exit code mapping: 0 → non-crash; 124 → timeout; 1 → agent-error; else unknown.

Mock calls recorded к `mailbox-runtime/mock-adapter-calls.json` для debugging + P3 test assertions.

---

## §6 Open research items (for P4 live probe)

| # | Item | Blocker? |
|---|------|---------|
| R-OQ-1 | Claude Code exit code taxonomy | No — use classifyCrash defaults in mock |
| R-OQ-2 | Claude Code `--session-id UUID` conflict behavior | No — adapter checks UUID collision via list |
| R-OQ-3 | Codex CLI exact initial prompt flag | **Yes для P4** — real Codex adapter blocked until known |
| R-OQ-4 | Codex CLI session resume semantics | **Yes для P4** |
| R-OQ-5 | Codex CLI output format control | **Yes для P4** — parseCompletionSignal needs это |
| R-OQ-6 | Codex CLI exit codes | No — classifyCrash heuristic OK |
| R-OQ-7 | Codex Windows native actual status | No — rail #7 treats as degraded regardless |

P3 orchestrator development uses MockAdapter → not blocked by R-OQ-3/4/5. P4 real Codex adapter implementation **is blocked** until live probe.

---

## §7 Adoption plan

1. P2 (this handoff): interface contract + mock + research doc. Contract signed-off by Codex adversarial review.
2. P3: orchestrator wires interface calls against MockAdapter. All 8 methods exercised.
3. P4: ClaudeCodeAdapter implemented first (all CLI primitives documented). CodexAdapter after live probe closes R-OQ-3/4/5.
4. P5+: refinements based on real adapter observations — interface может nedry expand (additive, non-breaking).

---

## §8 Non-negotiable invariants

- Interface methods are **contracts** — implementations must match signatures + return shapes. Any real-agent quirk (e.g., Codex без `resume`) accomodated через internal adapter logic, не exposed в interface.
- All 8 methods present in every implementation (mock + real); missing method = contract violation.
- `sessionId` = primary persistent identifier (survives restarts). `processHandle` = in-memory only.
- All `Promise<>` returning methods reject with typed errors (category matches classifyCrash если crash-related).
- Cross-OS: adapter implementations wrap platform specifics internally; interface itself is OS-agnostic.
