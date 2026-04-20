# Paperclip P2 — Adapter Contract + Mock — Execution Plan

**Version**: v1
**Planning-audit**: `docs/codex-tasks/paperclip-p2-adapter-contract-planning-audit.md`
**Research**: `docs/codex-tasks/paperclip-pivot-adapter-contract-research.md`
**Report template**: `docs/codex-tasks/paperclip-p2-adapter-contract-report.md`
**Architecture parent**: approved R4
**P1 parent**: commit `f3d065d`
**Baseline**: HEAD=`f3d065d`
**Target executor**: Codex (WSL + Windows parity)
**Scope**: contract interface + mock implementation + research artefact + spec section. **No orchestrator integration (P3), no real adapter implementations (P4)**.

---

## §0 Compat rails inheritance

- Rail #1 (cross-OS): contract OS-agnostic; mock в-memory. Real OS-specifics deferred P4.
- Rail #3 (baseline isolation): adapter `launch` accepts project arg; mock records it.
- Rail #4 (thin layer): P2 delivers contract + mock only — no live agent logic.
- Rail #7-10 unchanged (inherited).
- Architecture §1.0 coordinator-owned commitment: contract shaped for coordinator-spawned lifecycle.

---

## §1 Why this plan exists

Architecture §6 P2 (post-F4 fix) требует contract research + mock **до** orchestrator development (P3), чтобы interface locked против real-agent constraints, а не заточен под mock-only thinking. Research doc captures Claude Code CLI primitives + flags Codex CLI gaps для P4 live probe.

---

## §2 Hierarchy of sources of truth

1. Architecture §6 P2 canonical interface list.
2. Claude Code CLI docs (WebFetch R1 verbatim).
3. Codex CLI config docs (partial; gaps flagged в research §2).
4. Wiki `windows-wsl-process-launcher` + `wsl-windows-native-binding-drift` — process lifecycle gotchas.
5. This plan — derived.
6. Discrepancy → STOP + §5.

---

## §3 Doc verification

### §V1 — Claude Code CLI primitives

WebFetch R1 confirmed: `-p` print mode, `--session-id UUID`, `-r session-id`, `-c` continue, `--output-format json|stream-json|text`, `--max-turns N`, stdin piping.

### §V2 — Node `child_process.spawn`

Standard Node primitive. Adapter uses for both Windows + WSL spawn. `stdio:pipe` for stdout/stderr capture.

### §V3 — `crypto.randomUUID()`

Node 14.17+ global. Mock uses for sessionId generation.

### §V4 — Claude Code hooks stdin session_id

From Phase B WebFetch: SessionStart includes session_id в stdin JSON. Adapter может correlate spawn с session registry entry (for future P5+ recovery).

### §V5 — WSL spawn pattern

Wiki `windows-wsl-process-launcher`: `wsl.exe -d Ubuntu bash -lc "..."` proven. Adapter CodexAdapter (P4) will use; P2 mock doesn't spawn, only records.

---

## §4 Pre-flight verification

### P1 — environment baseline

```bash
node --version
git rev-parse --short HEAD
git status --short
```

**Expected**: Node ≥20.19, HEAD=`f3d065d` или newer. Baseline drift: pre-existing M outside whitelist accepted if recorded в §0.4 report; новый M вне whitelist → STOP.

### P2 — baseline line counts

```bash
wc -l scripts/mailbox-lib.mjs scripts/mailbox.mjs scripts/mailbox-session-register.mjs scripts/mailbox-status.mjs local-claude-codex-mailbox-workflow.md dashboard/supervisor.mjs dashboard/server.js
```

Expected (post-`f3d065d`):

| File | Lines |
|------|-------|
| `scripts/mailbox-lib.mjs` | 745 |
| `scripts/mailbox.mjs` | 392 |
| `scripts/mailbox-session-register.mjs` | 135 |
| `scripts/mailbox-status.mjs` | 262 |
| `local-claude-codex-mailbox-workflow.md` | ~898 (post-P1 spec section) |
| `dashboard/supervisor.mjs` | ~416 (post-P1 additions) |
| `dashboard/server.js` | ~355 (post-P1 additions) |

(Note: post-P1 line counts approximate; Codex verifies verbatim. Exact numbers dependent on Codex's P1 implementation sizes — plan tolerates ±20 lines от expected here since P1 committed в `f3d065d` just done.)

Drift >20 lines (vs Codex's own `wc -l`) → STOP. Expected numbers не hard-coded — Codex pulls actual post-P1 баseline.

### P3 — `ls scripts/`

Expected: `mailbox-lib.mjs, mailbox.mjs, mailbox-session-register.mjs, mailbox-status.mjs`. **`adapters/` directory отсутствует** (will be new).

### P4 — baseline build

```bash
cd dashboard && npx vite build 2>&1 | tail -5
```

Expected: `✓ built`. FAIL → rolldown binding repair per wiki.

### P5 — research doc exists

```bash
ls docs/codex-tasks/paperclip-pivot-adapter-contract-research.md
```

Expected: file present (created as part of this handoff).

---

## §5 Whitelist

| File | Purpose | Status |
|------|---------|--------|
| `scripts/adapters/agent-adapter.mjs` | **NEW** — interface definition via JSDoc, exports named typedef object с method signatures | create |
| `scripts/adapters/mock-adapter.mjs` | **NEW** — full 8-method mock implementation | create |
| `docs/codex-tasks/paperclip-pivot-adapter-contract-research.md` | research artefact (Claude/Codex/gotchas/gaps) | create (ALREADY authored by Claude planner; Codex verifies shape + extends if needed) |
| `local-claude-codex-mailbox-workflow.md` | +Adapter Contract (paperclip pivot P2) section | modify |

**НЕ ТРОГАТЬ**:
- `dashboard/**` (no orchestrator/server integration в P2)
- `scripts/*` кроме `adapters/` subdir
- `.claude/settings.local.json`
- `.gitignore`
- `agent-mailbox/**`, `mailbox-runtime/**`
- `docs/codex-tasks/*` кроме этой handoff trio (+research)
- `.github/workflows/ci.yml`

---

## §6 Changes

### Change 1 — **NEW** `scripts/adapters/agent-adapter.mjs`

Interface definition as JSDoc + exported symbol `AGENT_ADAPTER_METHODS` (array of method names для introspection). No runtime logic.

```js
/**
 * Agent Adapter Interface — contract для pair Claude Code / Codex CLI / Mock.
 * Implementations must provide all 8 methods below. See:
 *   docs/codex-tasks/paperclip-pivot-adapter-contract-research.md
 *
 * Shape details (JSDoc typedefs follow):
 */

/**
 * @typedef {Object} LaunchArgs
 * @property {string} project
 * @property {string} thread
 * @property {string} instruction
 * @property {string} [sessionId]
 */

/**
 * @typedef {Object} LaunchResult
 * @property {any} processHandle
 * @property {string} sessionId
 * @property {string} launchedAt
 */

/**
 * @typedef {Object} ResumeArgs
 * @property {any} [processHandle]
 * @property {string} sessionId
 * @property {string} message
 */

/**
 * @typedef {Object} ResumeResult
 * @property {boolean} messageAccepted
 * @property {any} processHandle
 * @property {string} sessionId
 */

/**
 * @typedef {Object} ShutdownArgs
 * @property {any} [processHandle]
 * @property {string} [sessionId]
 * @property {boolean} [force]
 */

/**
 * @typedef {Object} ShutdownResult
 * @property {number|null} exitCode
 * @property {string} reason
 */

/**
 * @typedef {Object} IsAliveArgs
 * @property {any} [processHandle]
 * @property {string} [sessionId]
 */

/**
 * @typedef {Object} AttachExistingArgs
 * @property {string} sessionId
 */

/**
 * @typedef {Object} AttachExistingResult
 * @property {any|null} processHandle
 * @property {boolean} attached
 */

/**
 * @typedef {Object} InjectMessageArgs
 * @property {any} [processHandle] - in-memory handle; preferred if still alive
 * @property {string} [sessionId] - fallback persistent identifier (used when processHandle lost across restart/reattach; delegates to resume)
 * @property {string} message
 * @description either processHandle OR sessionId must be provided; if both, processHandle tried first
 */

/**
 * @typedef {Object} InjectMessageResult
 * @property {boolean} injected
 * @property {boolean} fellBackToResume
 */

/**
 * @typedef {Object} ParseCompletionSignalArgs
 * @property {string} recentOutput
 * @property {('text'|'json'|'stream-json')} [outputFormat]
 */

/**
 * @typedef {Object} ParseCompletionSignalResult
 * @property {boolean} completed
 * @property {string} reason
 */

/**
 * @typedef {Object} ClassifyCrashArgs
 * @property {number} exitCode
 * @property {string} stderr
 */

/**
 * @typedef {Object} ClassifyCrashResult
 * @property {('env'|'auth'|'timeout'|'agent-error'|'unknown')} category
 * @property {boolean} retriable
 */

/**
 * @typedef {Object} AgentAdapter
 * @property {(args: LaunchArgs) => Promise<LaunchResult>} launch
 * @property {(args: ResumeArgs) => Promise<ResumeResult>} resume
 * @property {(args: ShutdownArgs) => Promise<ShutdownResult>} shutdown
 * @property {(args: IsAliveArgs) => boolean} isAlive
 * @property {(args: AttachExistingArgs) => Promise<AttachExistingResult>} attachExisting
 * @property {(args: InjectMessageArgs) => Promise<InjectMessageResult>} injectMessage
 * @property {(args: ParseCompletionSignalArgs) => ParseCompletionSignalResult} parseCompletionSignal
 * @property {(args: ClassifyCrashArgs) => ClassifyCrashResult} classifyCrash
 */

export const AGENT_ADAPTER_METHODS = Object.freeze([
  "launch",
  "resume",
  "shutdown",
  "isAlive",
  "attachExisting",
  "injectMessage",
  "parseCompletionSignal",
  "classifyCrash"
]);

/**
 * Validate что candidate object реализует все required methods.
 * Used by orchestrator (P3) + tests.
 * @param {any} candidate
 * @returns {{valid: boolean, missing: string[]}}
 */
export function validateAdapter(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return { valid: false, missing: [...AGENT_ADAPTER_METHODS] };
  }
  const missing = AGENT_ADAPTER_METHODS.filter((name) => typeof candidate[name] !== "function");
  return { valid: missing.length === 0, missing };
}
```

### Change 2 — **NEW** `scripts/adapters/mock-adapter.mjs`

Full mock implementation. All 8 methods present. In-memory state, optional call recording к `mailbox-runtime/mock-adapter-calls.json` для debugging.

```js
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { AGENT_ADAPTER_METHODS } from "./agent-adapter.mjs";

export function createMockAdapter({ recordCallsTo } = {}) {
  /** @type {Map<string, {state: string, project: string, thread: string, messages: string[], launchedAt: string, terminatedAt?: string}>} */
  const mockState = new Map();
  const callLog = [];

  async function writeCallLog() {
    if (!recordCallsTo) return;
    try {
      const dir = path.dirname(recordCallsTo);
      await fs.mkdir(dir, { recursive: true });
      const tmp = `${recordCallsTo}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(callLog, null, 2), "utf8");
      await fs.rename(tmp, recordCallsTo);
    } catch (error) {
      // Non-fatal для mock — logging failure не должен прерывать adapter.
      process.stderr.write(`[mock-adapter] recordCallsTo failed: ${error.message}\n`);
    }
  }

  function record(method, args, result) {
    callLog.push({
      method,
      args,
      result,
      ts: new Date().toISOString()
    });
    void writeCallLog();
  }

  /** @type {import('./agent-adapter.mjs').AgentAdapter} */
  const adapter = {
    async launch({ project, thread, instruction, sessionId }) {
      const id = sessionId || randomUUID();
      const now = new Date().toISOString();
      if (mockState.has(id)) {
        const existing = mockState.get(id);
        if (existing.state !== "terminated") {
          // F2 fix post-Codex R1: throw on mismatched relaunch of live session.
          // Silent reuse hides session-collision bugs (different task reusing same sessionId).
          const firstMessage = existing.messages[0];
          const argsMatch = existing.project === project
            && existing.thread === thread
            && firstMessage === instruction;
          if (!argsMatch) {
            record("launch", { project, thread, instruction, sessionId }, {
              error: "session-collision: sessionId already live with different launch args"
            });
            throw new Error(`session-collision: sessionId ${id} already live with different launch args (project/thread/instruction mismatch)`);
          }
          const result = { processHandle: { mockSession: id }, sessionId: id, launchedAt: existing.launchedAt };
          record("launch", { project, thread, instruction, sessionId }, { reused: true, result });
          return result;
        }
      }
      const entry = {
        state: "running",
        project,
        thread,
        messages: [instruction],
        launchedAt: now
      };
      mockState.set(id, entry);
      const result = { processHandle: { mockSession: id }, sessionId: id, launchedAt: now };
      record("launch", { project, thread, instruction, sessionId }, { reused: false, result });
      return result;
    },

    async resume({ processHandle, sessionId, message }) {
      const entry = mockState.get(sessionId);
      if (!entry) {
        const err = { messageAccepted: false, processHandle: null, sessionId };
        record("resume", { sessionId, message }, { error: "session not found", ...err });
        return err;
      }
      if (entry.state === "terminated") {
        const err = { messageAccepted: false, processHandle: processHandle || null, sessionId };
        record("resume", { sessionId, message }, { error: "session terminated", ...err });
        return err;
      }
      entry.messages.push(message);
      const result = { messageAccepted: true, processHandle: { mockSession: sessionId }, sessionId };
      record("resume", { sessionId, message }, result);
      return result;
    },

    async shutdown({ processHandle, sessionId, force = false }) {
      const id = sessionId || processHandle?.mockSession;
      if (!id) {
        const res = { exitCode: null, reason: "no-identifier" };
        record("shutdown", { sessionId, force }, res);
        return res;
      }
      const entry = mockState.get(id);
      if (!entry || entry.state === "terminated") {
        const res = { exitCode: 0, reason: "already-terminated" };
        record("shutdown", { sessionId: id, force }, res);
        return res;
      }
      entry.state = "terminated";
      entry.terminatedAt = new Date().toISOString();
      const res = { exitCode: force ? 137 : 0, reason: force ? "SIGKILL-mock" : "clean-shutdown-mock" };
      record("shutdown", { sessionId: id, force }, res);
      return res;
    },

    isAlive({ processHandle, sessionId }) {
      const id = sessionId || processHandle?.mockSession;
      if (!id) return false;
      const entry = mockState.get(id);
      return !!entry && entry.state !== "terminated";
    },

    async attachExisting({ sessionId }) {
      // Mock doesn't simulate pre-existing user sessions.
      const result = { processHandle: null, attached: false };
      record("attachExisting", { sessionId }, result);
      return result;
    },

    async injectMessage({ processHandle, sessionId, message }) {
      // F1 fix post-Codex R1: accept optional sessionId fallback для restart/reattach scenarios.
      const id = processHandle?.mockSession || sessionId;
      if (!id) {
        const res = { injected: false, fellBackToResume: false };
        record("injectMessage", { message }, res);
        return res;
      }
      // Mock aliases к resume (semantically same per Claude CLI constraint).
      // If processHandle lost но sessionId present — resume recovers через sessionId.
      const resumeRes = await adapter.resume({ processHandle, sessionId: id, message });
      const res = { injected: resumeRes.messageAccepted, fellBackToResume: true };
      record("injectMessage", { sessionId: id, message }, res);
      return res;
    },

    parseCompletionSignal({ recentOutput, outputFormat = "text" }) {
      if (typeof recentOutput !== "string") {
        return { completed: false, reason: "invalid-input" };
      }
      // Simple heuristic: "COMPLETE" substring = done.
      if (recentOutput.includes("COMPLETE")) {
        return { completed: true, reason: "mock-complete-marker-found" };
      }
      // JSON mode: try parse final, check for `final_message` key (placeholder).
      if (outputFormat === "json") {
        try {
          const obj = JSON.parse(recentOutput);
          if (obj && obj.final_message) {
            return { completed: true, reason: "mock-json-final-message" };
          }
        } catch {
          // not valid JSON yet
        }
      }
      return { completed: false, reason: "no-signal" };
    },

    classifyCrash({ exitCode, stderr }) {
      if (exitCode === 0) {
        return { category: "unknown", retriable: false };
      }
      const text = String(stderr || "").toLowerCase();
      if (exitCode === 124 || text.includes("timed out") || text.includes("timeout")) {
        return { category: "timeout", retriable: true };
      }
      if (text.includes("not authenticated") || text.includes("auth") || text.includes("login required")) {
        return { category: "auth", retriable: false };
      }
      if (text.includes("cannot find module") || text.includes("rolldown") || text.includes("enoent")) {
        return { category: "env", retriable: false };
      }
      if (exitCode === 1 || exitCode === 2) {
        return { category: "agent-error", retriable: true };
      }
      return { category: "unknown", retriable: false };
    }
  };

  return adapter;
}
```

### Change 3 — `local-claude-codex-mailbox-workflow.md`

Найти end of Task Queue section (P1, post-`f3d065d`). Вставить после неё:

```markdown

### Adapter Contract (paperclip pivot P2)

Paperclip-light coordinator-owned execution требует abstract agent adapter для spawn/resume/shutdown/lifecycle. Phase P2 вводит contract interface + mock implementation:

- **Interface**: `scripts/adapters/agent-adapter.mjs` — JSDoc typedefs + `AGENT_ADAPTER_METHODS` canonical list + `validateAdapter(candidate)` helper. No runtime logic.
- **Mock**: `scripts/adapters/mock-adapter.mjs` — full 8-method implementation. In-memory mock state + optional call recording к `mailbox-runtime/mock-adapter-calls.json` для debugging. Used by P3 orchestrator tests.
- **Methods** (signatures в research doc + JSDoc):
  - `launch` — fresh session with initial prompt
  - `resume` — continue session with new message (Claude CLI primary delivery mechanism)
  - `shutdown` — SIGTERM graceful или force SIGKILL
  - `isAlive` — process liveness probe
  - `attachExisting` — reconnect к user-opened session (best-effort)
  - `injectMessage` — mid-life inject (falls back к resume для Claude CLI)
  - `parseCompletionSignal` — heuristic detection of agent done (text/json/stream-json)
  - `classifyCrash` — normalize exit failure → {env|auth|timeout|agent-error|unknown}
- **Research**: `docs/codex-tasks/paperclip-pivot-adapter-contract-research.md` — Claude Code CLI primitives extracted, Codex CLI gaps flagged для P4 live probe.
- **Out of scope P2**: orchestrator integration (P3), real ClaudeCodeAdapter/CodexAdapter (P4).
```

---

## §7 Verification phases

### Phase 1 — Codex-only

**Mandatory order**: Change 1 (interface) → Change 2 (mock depends on interface) → Change 3 (spec). Research doc already present (authored Claude-side).

| # | Check | Expected |
|---|-------|----------|
| V1 | agent-adapter.mjs parses | node --check |
| V2 | mock-adapter.mjs parses | node --check |
| V3 | agent-adapter.mjs exports AGENT_ADAPTER_METHODS с 8 items | grep/node -e |
| V4 | mock-adapter.mjs default export реализует все 8 methods | validateAdapter returns valid:true |
| V5 | Mock launch → returns sessionId UUID + launchedAt | empirical node -e probe |
| V6 | Mock isAlive после launch true, после shutdown false | empirical |
| V7 | Mock classifyCrash категории для typical codes | 5 sub-probes |
| V7b | F2: Mock launch throws session-collision on mismatched relaunch | probe PASS |
| V7c | F1: Mock injectMessage falls back via sessionId (processHandle lost) | probe PASS |
| V8 | Mock recordCallsTo writes call log | empirical (optional — if recordCallsTo provided) |
| V9 | Research doc present + non-empty | file check + grep for sections |
| V10 | Spec section «Adapter Contract (paperclip pivot P2)» | grep = 1 |
| V11 | PD scan | `--scan done` |
| V12 | Whitelist drift | 2 new files в scripts/adapters/ + 1 M spec + 3 handoff artefacts (+research file already from planner side) |

Verification commands:

```bash
# V1
node --check scripts/adapters/agent-adapter.mjs && echo "V1 PASS"

# V2
node --check scripts/adapters/mock-adapter.mjs && echo "V2 PASS"

# V3
node -e "
import('./scripts/adapters/agent-adapter.mjs').then((m) => {
  const ok = Array.isArray(m.AGENT_ADAPTER_METHODS) && m.AGENT_ADAPTER_METHODS.length === 8;
  console.log(ok ? 'V3 PASS (8 methods)' : 'V3 FAIL count=' + (m.AGENT_ADAPTER_METHODS || []).length);
});
"

# V4
node -e "
Promise.all([
  import('./scripts/adapters/agent-adapter.mjs'),
  import('./scripts/adapters/mock-adapter.mjs')
]).then(([iface, mock]) => {
  const adapter = mock.createMockAdapter();
  const v = iface.validateAdapter(adapter);
  console.log(v.valid ? 'V4 PASS' : 'V4 FAIL missing=' + v.missing.join(','));
});
"

# V5
node -e "
import('./scripts/adapters/mock-adapter.mjs').then(async (m) => {
  const adapter = m.createMockAdapter();
  const res = await adapter.launch({project:'workflow', thread:'v5', instruction:'test'});
  const uuidish = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(res.sessionId);
  const hasLaunchedAt = typeof res.launchedAt === 'string' && res.launchedAt.length > 0;
  console.log(uuidish && hasLaunchedAt ? 'V5 PASS' : 'V5 FAIL res=' + JSON.stringify(res));
});
"

# V6
node -e "
import('./scripts/adapters/mock-adapter.mjs').then(async (m) => {
  const adapter = m.createMockAdapter();
  const launched = await adapter.launch({project:'workflow', thread:'v6', instruction:'test'});
  const aliveBefore = adapter.isAlive({sessionId: launched.sessionId});
  await adapter.shutdown({sessionId: launched.sessionId});
  const aliveAfter = adapter.isAlive({sessionId: launched.sessionId});
  console.log((aliveBefore && !aliveAfter) ? 'V6 PASS' : 'V6 FAIL before=' + aliveBefore + ' after=' + aliveAfter);
});
"

# V7 — classifyCrash 5 probes
node -e "
import('./scripts/adapters/mock-adapter.mjs').then((m) => {
  const adapter = m.createMockAdapter();
  const cases = [
    {exit: 0, stderr: '', expect: 'unknown'},
    {exit: 124, stderr: 'timed out', expect: 'timeout'},
    {exit: 1, stderr: 'not authenticated', expect: 'auth'},
    {exit: 1, stderr: 'Cannot find module rolldown', expect: 'env'},
    {exit: 1, stderr: 'some agent error', expect: 'agent-error'}
  ];
  let passed = 0;
  cases.forEach((c, i) => {
    const res = adapter.classifyCrash({exitCode: c.exit, stderr: c.stderr});
    const ok = res.category === c.expect;
    console.log(\`V7.\${i+1} \${ok ? 'PASS' : 'FAIL'} expected=\${c.expect} got=\${res.category}\`);
    if (ok) passed++;
  });
  console.log('V7 TOTAL:', passed + '/5');
});
"

# V7b — F2 mock launch session-collision throws on mismatched relaunch
node -e "
import('./scripts/adapters/mock-adapter.mjs').then(async (m) => {
  const adapter = m.createMockAdapter();
  const first = await adapter.launch({project:'workflow', thread:'v7b-a', instruction:'task-A'});
  try {
    await adapter.launch({project:'workflow', thread:'v7b-b', instruction:'task-B', sessionId: first.sessionId});
    console.log('V7b FAIL: mismatched relaunch should have thrown session-collision');
  } catch (e) {
    if (e.message.includes('session-collision')) {
      console.log('V7b PASS: session-collision thrown as expected');
    } else {
      console.log('V7b FAIL: wrong error:', e.message);
    }
  }
});
"

# V7c — F1 injectMessage fallback via sessionId (processHandle lost scenario)
node -e "
import('./scripts/adapters/mock-adapter.mjs').then(async (m) => {
  const adapter = m.createMockAdapter();
  const launched = await adapter.launch({project:'workflow', thread:'v7c', instruction:'test'});
  // Simulate processHandle lost: call injectMessage with only sessionId
  const res = await adapter.injectMessage({sessionId: launched.sessionId, message: 'mid-life msg'});
  if (res.injected && res.fellBackToResume) {
    console.log('V7c PASS: injectMessage fellback via sessionId (injected+fellBackToResume true)');
  } else {
    console.log('V7c FAIL: injected=' + res.injected + ' fellBackToResume=' + res.fellBackToResume);
  }
});
"

# V8 — recordCallsTo write
TMPLOG=/tmp/mock-calls-v8.json
node -e "
import('./scripts/adapters/mock-adapter.mjs').then(async (m) => {
  const adapter = m.createMockAdapter({recordCallsTo: '$TMPLOG'});
  await adapter.launch({project:'workflow', thread:'v8', instruction:'test'});
  // Wait tick for async write
  await new Promise(r => setTimeout(r, 50));
  const fs = await import('node:fs/promises');
  const raw = await fs.readFile('$TMPLOG', 'utf8');
  const log = JSON.parse(raw);
  console.log(Array.isArray(log) && log.length >= 1 && log[0].method === 'launch' ? 'V8 PASS' : 'V8 FAIL');
}).catch((e) => console.log('V8 FAIL error=' + e.message));
" && rm -f "$TMPLOG"

# V9
ls docs/codex-tasks/paperclip-pivot-adapter-contract-research.md && grep -cE '^## §[0-9]' docs/codex-tasks/paperclip-pivot-adapter-contract-research.md
# Expected: file exists + ≥5 sections

# V10
grep -c 'Adapter Contract (paperclip pivot P2)\|### Adapter Contract' local-claude-codex-mailbox-workflow.md
# Expected: 1

# V11 — PD scan
PD_PATTERNS='$PD_PATTERNS'
grep -riE "$PD_PATTERNS" --include="*.js" --include="*.jsx" --include="*.mjs" --include="*.html" --include="*.json" dashboard/ scripts/ .claude/ 2>/dev/null
grep -riE "$PD_PATTERNS" --include="*.md" CLAUDE.md README.md README.ru.md local-claude-codex-mailbox-workflow.md 2>/dev/null
echo "--scan done"

# V12 — whitelist drift
git status --short
# Expected: 2 new ?? (scripts/adapters/agent-adapter.mjs + mock-adapter.mjs) + 1 M spec + 3 ?? handoff artefacts + 1 ?? research doc (already authored by planner)
```

Any FAIL → STOP + §5.

### Phase 2 — user visual `[awaits user]`

P2 = contract + mock, нет user-facing UI changes. Phase 2 minimal:

| # | Check |
|---|-------|
| P2.1 | Files exist: scripts/adapters/{agent-adapter,mock-adapter}.mjs + research doc |
| P2.2 | Spec section readable в dashboard (if user opens spec file via mailbox UI) — нет, spec просто markdown |
| P2.3 | Research doc content accurate — user reviews gap list + agrees с OQ priorities |

### Phase 3 — cross-OS parity `[awaits user]`

Not applicable для P2 — mock runs anywhere Node works. Real adapter OS-specifics — P4.

---

## §8 Acceptance criteria

- [ ] Phase 1 V1-V12 (+V7b + V7c) PASS
- [ ] Report template filled
- [ ] No files outside whitelist
- [ ] PD scan clean
- [ ] Mock adapter validates против interface (V4)
- [ ] Research doc contains 6 sections + Open Questions list
- [ ] No commit/push без user command
- [ ] Phase 2 user review (research doc content + gap priorities)

---

## §9 Out of scope

- Orchestrator wiring (P3).
- Real ClaudeCodeAdapter (P4).
- Real CodexAdapter (P4 — blocked on Codex CLI live probe).
- Restart recovery (P5+).
- Interface extensions based на real-agent observations (P4+ additive).
- Mock non-determinism / flakiness simulation (not needed for P3).

---

## §10 Rollback

**До commit**:
1. `git diff --stat scripts/adapters/ local-claude-codex-mailbox-workflow.md`
2. Untracked: `rm -f scripts/adapters/agent-adapter.mjs scripts/adapters/mock-adapter.mjs`
3. If scripts/adapters/ dir empty: `rmdir scripts/adapters/`
4. `git checkout -- local-claude-codex-mailbox-workflow.md`
5. Build clean.

**После commit**: `git revert <sha>`. No runtime state side effects — mock-adapter-calls.json только при usage (gitignored).

---

## §11 Discrepancy checkpoints (STOP)

1. P2 baseline drift >20 lines на whitelist → STOP.
2. P3 scripts/adapters/ уже exists → STOP + investigate.
3. P4 build fails → environment repair → re-run.
4. P5 research doc absent → STOP (planner side authored; Codex expects it).
5. Phase 1 V1-V12 (+V7b + V7c) any FAIL → STOP.
6. V4 validateAdapter returns invalid → contract violation → STOP.
7. V7 any of 5 classifyCrash probes FAIL → STOP (heuristic wrong).
8. V12 (whitelist) drift → STOP.
9. Modification `dashboard/**` / `scripts/mailbox-*` / `.claude/settings.local.json` → STOP (out of P2 scope).
10. Temptation добавить ClaudeCodeAdapter или CodexAdapter stub → STOP + defer P4.
11. Temptation wire mock к orchestrator → STOP + defer P3.

---

## §12 Self-audit checklist

- [ ] 1: P1-P5 pre-flight OK
- [ ] 2: Change 1 (agent-adapter.mjs interface) applied — все 8 methods в AGENT_ADAPTER_METHODS
- [ ] 3: Change 2 (mock-adapter.mjs) applied — validateAdapter returns valid
- [ ] 4: Change 3 (spec Adapter Contract section) applied
- [ ] 5: Research doc presence verified (V9)
- [ ] 6: V1-V12 (+V7b + V7c) recorded verbatim
- [ ] 7: V12 (whitelist) drift clean
- [ ] 8: No commit/push
- [ ] 9: Discrepancies recorded
- [ ] 10: Report §0-§10 filled
- [ ] 11: No real adapter implementations added (P4 defer)
- [ ] 12: No orchestrator wiring added (P3 defer)

≥10/12 OK → ready for user review.

---

## §13 Notes to Codex

- Environment: WSL, cwd=`/mnt/e/Project/workflow`.
- Baseline: HEAD=`f3d065d`. Newer master touching whitelist → STOP.
- Anti-fabrication: V outputs verbatim.
- No new deps.
- **Contract is authoritative** — method signatures + shape contracts NOT negotiable в implementation phase P4 без re-review here.
- **Mock limitations explicit** — `attachExisting` returns attached:false always, `parseCompletionSignal` use simple "COMPLETE" substring marker, `classifyCrash` uses stderr substring heuristics. Real adapters заточат semantics к agent-specific output formats.
- Research doc already authored (Claude planner side) — Codex verifies content, can propose extensions в review, but creating new research doc is out of P2 scope.
- `injectMessage` fallback к resume — document clearly в Mock implementation (research §1.2 insight про Claude CLI constraint).

---

## §14 Commits strategy

**Single commit**:

```
feat(workflow): paperclip pivot P2 — agent adapter contract + mock

Core changes:
- scripts/adapters/agent-adapter.mjs: NEW — interface JSDoc typedefs + AGENT_ADAPTER_METHODS canonical 8-method list + validateAdapter(candidate) helper. No runtime logic — pure contract.
- scripts/adapters/mock-adapter.mjs: NEW — full 8-method implementation with in-memory state + optional recordCallsTo call log. injectMessage aliases to resume (Claude CLI constraint per research §1.2).
- local-claude-codex-mailbox-workflow.md: +Adapter Contract (paperclip pivot P2) section with 8-method description + research doc reference.
- docs/codex-tasks/paperclip-pivot-adapter-contract-research.md: NEW — Claude Code CLI primitives extracted (verified via WebFetch), Codex CLI gaps flagged (OQ-3/4/5 blocked P4 live probe), process lifecycle gotchas per wiki.

Phase P2 scope: contract + mock + research only. No orchestrator integration (P3), no real adapter implementations (P4). Mock used by P3 orchestrator tests. Real adapter development after Codex CLI open questions resolved via live probe.

Parent: f3d065d (paperclip pivot P1 task queue).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Push**: ждёт explicit user command.
