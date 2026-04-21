# Mailbox Automation Compat — Execution Plan (Phase A + architecture frame for B-D)

**Version**: v1
**Planning-audit**: `docs/codex-tasks/mailbox-automation-compat-planning-audit.md`
**Report template**: `docs/codex-tasks/mailbox-automation-compat-report.md`
**ТЗ sources**: `docs/codex-tasks/mailbox-auto-pickup-supervisor-tz.md` + archived `workflow-automation-compat-requirements` (10 hard rails)
**Supersedes**: `docs/codex-tasks/mailbox-supervisor-phase-a.md` (committed deferred; baseline drifted). Этот план — rewrite с учётом 10 compat constraints на current baseline HEAD=`458552b`.
**Target executor**: Codex (WSL, с parity-smokes на Windows native)
**Planner**: Claude (Windows)
**Scope**: Phase A — global visibility section + supervisor polling + runtime-state registry. Phase B/C/D — architectural frame only (out-of-execution в этом handoff).

---

## §0 Ten compat rails (non-negotiable frame)

Constraints from Codex must be hard rails, не optional notes:

1. **Universal core**: backend, mailbox scripts, runtime-state, dashboard — одинаково на Windows и Linux.
2. **Single dashboard** для user; IDE/CLI не меняют модель.
3. **Strict agent project isolation**: agent(A) не видит писем project(B).
4. **Thin auto-pickup layer** поверх backend; не сложная логика в hooks.
5. Claude Code hooks **разрешены** как transport.
6. Codex hooks **НЕ обязательная основа** Windows native — experimental + Windows support disabled.
7. Codex automation supported только Linux/WSL; Windows native Codex → graceful degraded mode без hook path.
8. **No UserPromptSubmit** для mailbox. Только SessionStart и Stop.
9. Split visibility (dashboard global) vs delivery (agent scoped).
10. Explicit unsupported/degraded marking — если не одинаково надёжно в (Windows, Linux, IDE, CLI, WSL, direct Linux), прямо отметить.

### Phase A compliance map

| # | Constraint | Phase A coverage |
|---|-----------|------------------|
| 1 | Universal core | ✅ Supervisor — pure Node + `fs/promises` + `setInterval` + Express Router. No platform-specific deps. Empirical atomic rename verified в P3 для обоих OS. |
| 2 | Single dashboard | ✅ Расширение существующего `dashboard/server.js` + `App.jsx`. Новый UI блок в том же инстансе. |
| 3 | Agent isolation | ✅ `/api/runtime/state` — user view (global). Agent scoped runtime view deferred до Phase B /api/agent/runtime path (constraint 9 split). pendingIndex ДОЛЖЕН содержать `project` для downstream Phase B filtering. |
| 4 | Thin layer | ✅ Phase A = только polling + persist. Нет hook logic. |
| 5 | Claude hooks allowed | ✅ framework declared §9.3 — Phase B. |
| 6 | Codex hooks not required | ✅ framework declared §9.3 — degraded mode. |
| 7 | Codex Linux/WSL only | ✅ §9.3 Windows native Codex = degraded. |
| 8 | No UserPromptSubmit | ✅ §9.3 excluded explicitly. |
| 9 | Split visibility vs delivery | ✅ Phase A = visibility; delivery endpoints Phase B. |
| 10 | Explicit unsupported marking | ✅ §9.3 table documents degraded paths. |

---

## §1 Why this plan exists

ТЗ `mailbox-auto-pickup-supervisor-tz.md` разбивает feature на 4 phase (A→D). Codex amended requirements добавили 10 cross-OS rails. Предыдущий `mailbox-supervisor-phase-a.md` committed но не executed; baseline drifted на 5+ commits (`458552b`). Этот план — rewrite Phase A execution с rails как hard frame + architectural declaration для Phase B-D.

Design decisions inherited (из archived threads):
- **Q1 runtime-state location**: `mailbox-runtime/` внутри workflow repo, gitignored.
- **Q2 supervisor process**: bundled с dashboard backend, но logic в отдельном extractable `dashboard/supervisor.mjs` module.
- Q3/Q4/Q5 defer до Phase B/C.

---

## §2 Hierarchy of sources of truth

1. Official Node 24 docs — §3 Doc verification.
2. Live code post-`458552b` — §3.
3. Codex 10 rails (§0) + ТЗ + compat amendment.
4. Design agreement thread (archived Q1/Q2).
5. This plan — derived from 1-4.
6. **Discrepancy rule**: STOP + report §5.

---

## §3 Doc verification

### §V1 — `fs.promises.writeFile` + atomic rename (POSIX + NTFS)

> "Asynchronously writes data to a file, replacing the file if it already exists." / "Asynchronously rename file at oldPath to the pathname provided as newPath. In the case that newPath already exists, it will be overwritten."
>
> — nodejs.org/docs/latest-v24.x/api/fs

NTFS (Windows) поддерживает atomic rename-with-overwrite с Node 16+. Empirical в P3 подтверждает оба OS.

### §V2 — `setInterval` / `clearInterval`

> "Schedules repeated execution of a callback function every delay milliseconds."
>
> — nodejs.org/docs/latest-v24.x/api/globals

Same semantics Windows + Linux.

### §V3 — Express `Router` (reuse prior handoff Phase A)

Modular mount: `const sup = createSupervisor(...); app.use("/api/runtime", sup.router); sup.start();`.

### §V4 — `fs.readdir({withFileTypes: true})`

Pattern reused из `scripts/mailbox-lib.mjs` (`collectMarkdownFiles`). Cross-OS proven in-repo.

### §V5 — Graceful shutdown

`process.on("SIGINT"/"SIGTERM")` + `server.close()` + `clearInterval`. Windows получает SIGINT через Ctrl+C; SIGTERM не native на Windows но Node эмулирует для parity. Empirical V7.

### §V6 — `path.resolve` normalization

Path separator normalization handled by Node. Runtime-state paths через `path.resolve(__dirname, "../mailbox-runtime")` работает в обоих OS.

---

## §4 Pre-flight verification (Codex execute BEFORE any change)

Codex запускает в WSL. Outputs verbatim в report §0.

### P1 — environment baseline

```bash
node --version
(cd dashboard && node --version && npm --version)
git rev-parse --short HEAD
git status --short
```

**Expected**:
- Node ≥20.19.
- HEAD = `458552b` (planning snapshot) или newer master commit.
- Baseline drift model: pre-existing `M` outside whitelist OK if recorded в §0.4 report; новый M/?? outside whitelist во время execution → STOP.

### P2 — baseline line counts

```bash
wc -l dashboard/server.js dashboard/src/App.jsx dashboard/src/api.js .gitignore dashboard/package.json scripts/mailbox-lib.mjs
```

Expected (post-`458552b`):

| File | Lines |
|------|-------|
| `dashboard/server.js` | 215 |
| `dashboard/src/App.jsx` | 1628 |
| `dashboard/src/api.js` | 73 |
| `.gitignore` | 16 |
| `dashboard/package.json` | 28 |
| `scripts/mailbox-lib.mjs` | 745 (read-only reference) |

Drift >5 lines на whitelist file → STOP + Discrepancy.

### P3 — empirical atomic write (cross-OS rail §0 #1)

```bash
cd dashboard && node -e "
const fs = require('fs');
const os = require('os');
const path = require('path');
const tmp = path.join(os.tmpdir(), 'supv-atomic.json');
const final = path.join(os.tmpdir(), 'supv-atomic-final.json');
fs.writeFileSync(tmp, JSON.stringify({a:1}));
fs.renameSync(tmp, final);
console.log('atomic rename ok:', fs.readFileSync(final, 'utf8'));
fs.unlinkSync(final);
"
```

**Expected**: `atomic rename ok: {"a":1}`. `os.tmpdir()` cross-OS safe. FAIL → STOP (rail #1 breach).

### P4 — baseline build

```bash
cd dashboard && npx vite build 2>&1 | tail -5
```

**Expected**: `✓ built`. FAIL → environment repair (wiki `wsl-windows-native-binding-drift`) → re-run.

### P5 — existing routes sanity

```bash
grep -n "app.use\|app.post\|app.get\|app.listen" dashboard/server.js
```

**Expected** (post-`458552b`):
- `app.use((request,response,next)=>...)` middleware (no-store)
- `app.use(express.json())`
- `/api/messages` GET (2x + dir)
- `/api/archive` POST
- `/api/notes` POST
- `app.use("/api/agent", agentRouter)`
- `app.listen(port, host, ...)`

Новый mount `app.use("/api/runtime", ...)` — prefix unique, не конфликтует.

---

## §5 Whitelist — only these files may be created/modified

| File | Purpose | Status |
|------|---------|--------|
| `dashboard/supervisor.mjs` | **NEW** — extractable supervisor module (poll, state, Express router factory) | create |
| `dashboard/server.js` | +3 imports (path already imported), +runtimeRoot const, +supervisor mount, +supervisor.start(), +SIGINT/SIGTERM shutdown. Replace bare `app.listen` с server ref + shutdown handlers. | modify |
| `dashboard/src/api.js` | +`fetchRuntimeState()` wrapper | modify |
| `dashboard/src/App.jsx` | +2 dashboard sections (active sessions + pending index) + state + polling + translations + CSS | modify |
| `.gitignore` | +line `mailbox-runtime/` | modify |

**НЕ ТРОГАТЬ**:
- `scripts/mailbox-lib.mjs` (read-only reference — no API changes)
- `scripts/mailbox.mjs` (CLI — Phase A не трогает)
- `local-claude-codex-mailbox-workflow.md` (spec update defer до Phase B когда hooks layer добавляется)
- `dashboard/package.json`, `dashboard/package-lock.json` (no new deps)
- `dashboard/vite.config.js`, `dashboard/index.html`
- `agent-mailbox/**` (runtime data)
- `docs/codex-tasks/*` кроме этой handoff-тройки
- `CLAUDE.md`, `README.md`, `README.ru.md`, `LICENSE`
- `.github/workflows/ci.yml`
- любые новые файлы вне `dashboard/supervisor.mjs` и `mailbox-runtime/` (runtime-only, gitignored)

---

## §6 Changes

### Change 1 — **NEW** `dashboard/supervisor.mjs`

Создать новый файл. Factory `createSupervisor({mailboxRoot, runtimeRoot, pollIntervalMs, logger})`:

```js
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import {
  normalizeProject,
  readBucket,
  sanitizeString,
  toUtcTimestamp
} from "../scripts/mailbox-lib.mjs";

const SESSION_STALE_MS = 60_000;

export function createSupervisor({
  mailboxRoot,
  runtimeRoot,
  pollIntervalMs = 3000,
  logger = console
}) {
  const state = {
    sessions: new Map(),
    pendingIndex: [],
    supervisorHealth: {
      startedAt: null,
      lastTickAt: null,
      lastTickMs: 0,
      tickErrors: 0,
      isScanning: false
    }
  };

  let timer = null;
  const router = express.Router();

  router.use(express.json());

  router.get("/state", (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.json({
      sessions: Array.from(state.sessions.values()),
      activeSessions: Array.from(state.sessions.values()).filter(
        (s) => Date.now() - Date.parse(s.last_seen) <= SESSION_STALE_MS
      ),
      pendingIndex: state.pendingIndex,
      supervisorHealth: state.supervisorHealth
    });
  });

  router.post("/sessions", async (request, response) => {
    const body = request.body || {};
    const session_id = sanitizeString(body.session_id);
    const agent = sanitizeString(body.agent);
    const project = sanitizeString(body.project);
    if (!session_id || !agent || !project) {
      response.status(400).json({ error: "session_id, agent, project required" });
      return;
    }
    if (agent !== "claude" && agent !== "codex") {
      response.status(400).json({ error: "agent must be claude or codex" });
      return;
    }
    const normalizedProject = normalizeProject(project);
    if (!normalizedProject) {
      response.status(400).json({ error: "project is required" });
      return;
    }
    const existing = state.sessions.get(session_id) || {};
    const record = {
      ...existing,
      session_id,
      agent,
      project: normalizedProject,
      cwd: sanitizeString(body.cwd) || existing.cwd || "",
      transport: sanitizeString(body.transport) || existing.transport || "manual",
      platform: sanitizeString(body.platform) || existing.platform || "",
      last_seen: toUtcTimestamp()
    };
    state.sessions.set(session_id, record);
    try {
      await persistSessions();
    } catch (error) {
      logger.error("[supervisor] persistSessions failed:", error);
      response.status(500).json({
        error: "Failed to persist session",
        details: error instanceof Error ? error.message : String(error)
      });
      return;
    }
    response.status(201).json({ ok: true, session: record });
  });

  router.delete("/sessions/:id", async (request, response) => {
    state.sessions.delete(request.params.id);
    try {
      await persistSessions();
    } catch (error) {
      logger.error("[supervisor] persistSessions failed:", error);
      response.status(500).json({
        error: "Failed to persist session delete",
        details: error instanceof Error ? error.message : String(error)
      });
      return;
    }
    response.json({ ok: true });
  });

  async function persistSessions() {
    await atomicWriteJson(
      path.join(runtimeRoot, "sessions.json"),
      Array.from(state.sessions.values())
    );
  }

  async function persistPendingIndex() {
    await atomicWriteJson(
      path.join(runtimeRoot, "pending-index.json"),
      state.pendingIndex
    );
  }

  async function persistHealth() {
    await atomicWriteJson(
      path.join(runtimeRoot, "supervisor-health.json"),
      state.supervisorHealth
    );
  }

  async function atomicWriteJson(finalPath, data) {
    const tmpPath = `${finalPath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(tmpPath, finalPath);
  }

  async function pollTick() {
    if (state.supervisorHealth.isScanning) {
      return;
    }
    state.supervisorHealth.isScanning = true;
    const startedAt = Date.now();
    try {
      const [toClaude, toCodex] = await Promise.all([
        readBucket("to-claude", mailboxRoot),
        readBucket("to-codex", mailboxRoot)
      ]);
      const pending = [...toClaude, ...toCodex]
        .filter((m) => m.status === "pending")
        .map((m) => {
          const normalized = (m.project || "").trim();
          return {
            relativePath: m.relativePath,
            to: m.to,
            from: m.from,
            project: normalized,
            projectMissing: normalized === "",
            deliverable: normalized !== "",
            thread: m.thread,
            created: m.created,
            received_at: m.received_at || ""
          };
        });
      state.pendingIndex = pending;
      state.supervisorHealth.lastTickAt = toUtcTimestamp();
      state.supervisorHealth.lastTickMs = Date.now() - startedAt;
      await persistPendingIndex();
      await persistHealth();
    } catch (error) {
      state.supervisorHealth.tickErrors += 1;
      logger.error("[supervisor] tick failed:", error);
    } finally {
      state.supervisorHealth.isScanning = false;
    }
  }

  async function start() {
    await fs.mkdir(runtimeRoot, { recursive: true });
    state.supervisorHealth.startedAt = toUtcTimestamp();
    await pollTick();
    timer = setInterval(() => {
      void pollTick();
    }, pollIntervalMs);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return { router, start, stop, state };
}
```

**Rationale**:
- Modular boundary (Q2 requirement): всё внутри `supervisor.mjs`, server.js только mounts.
- `atomicWriteJson` = writeFile + rename (§V1) — cross-OS (rail #1).
- `isScanning` guard prevents overlapping ticks.
- Poll only (no fs.watch) — wiki `windows-wsl-process-launcher` `/mnt/e/...` unreliable events.
- `normalizeProject` imported from lib + truthy check: prevents empty/garbage project values в sessions → supports rail #3 (isolation prerequisite; sessions записи должны иметь valid project). (Note: full `validateProjectScope(currentProject, message)` — 2-arg для message-level checks; здесь session registration только validates string not empty.)
- **Legacy pending без project policy** (rail #3 prereq hardening): pendingIndex сохраняет projectless messages для visibility, но помечает их `projectMissing: true` + `deliverable: false`. Phase B/C delivery logic ДОЛЖНА filter по `deliverable === true` перед матчем с session → projectless messages никогда не matchятся на agent delivery. UI counter показывает их как «pending без project» для user awareness.
- `readBucket` used вместо recursive collect — pure pending read, не хранит archived noise.

### Change 2 — `dashboard/server.js`

**Current** imports (lines 1-20 post-`458552b`):

```js
import express from "express";
import path from "node:path";
import {
  archiveMessageFile,
  appendNoteToMessageFile,
  collectProjectValues,
  ClientError,
  defaultMailboxRoot,
  filterMessagesByProject,
  host,
  isKnownBucket,
  markMessageReceived,
  normalizeProject,
  port,
  readBucket,
  sanitizeString,
  validateProjectScope,
  validateRelativeInboxPath,
  validateResolution
} from "../scripts/mailbox-lib.mjs";
```

**Target** — **preserve все 15 existing named imports** (+1 `path` top-level). Добавить 2 new top-level imports:

```js
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSupervisor } from "./supervisor.mjs";
import {
  archiveMessageFile,
  appendNoteToMessageFile,
  collectProjectValues,
  ClientError,
  defaultMailboxRoot,
  filterMessagesByProject,
  host,
  isKnownBucket,
  markMessageReceived,
  normalizeProject,
  port,
  readBucket,
  sanitizeString,
  validateProjectScope,
  validateRelativeInboxPath,
  validateResolution
} from "../scripts/mailbox-lib.mjs";
```

**Current** `mailboxRoot` block (line 22):

```js
const mailboxRoot = defaultMailboxRoot;
```

**Target** — add runtimeRoot + __dirname derivation:

```js
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mailboxRoot = defaultMailboxRoot;
const runtimeRoot = path.resolve(__dirname, "..", "mailbox-runtime");
```

**Current** tail (lines 211-215):

```js
app.use("/api/agent", agentRouter);

app.listen(port, host, () => {
  console.log(`Server listening on ${host}:${port}`);
});
```

**Target** — replace с supervisor mount + lifecycle:

```js
app.use("/api/agent", agentRouter);

const supervisor = createSupervisor({
  mailboxRoot,
  runtimeRoot,
  pollIntervalMs: 3000,
  logger: console
});
app.use("/api/runtime", supervisor.router);

await supervisor.start();

const server = app.listen(port, host, () => {
  console.log(`Server listening on ${host}:${port}`);
});

function shutdown(signal) {
  // process.stderr.write — synchronous, always flushes to fd даже если event loop busy.
  // console.log buffering мог проглотить log line при shutdown hang в R8 rerun.
  process.stderr.write(`[server] ${signal} received, shutting down\n`);
  supervisor.stop();
  // Node 20+: server.close() НЕ закрывает idle keep-alive connections —
  // event loop остаётся alive пока TCP keep-alive timeout не истечёт (минуты).
  // closeAllConnections immediately — force-close both idle + active sockets.
  if (typeof server.closeAllConnections === "function") {
    server.closeAllConnections();
  }
  server.close(() => {
    process.stderr.write("[server] clean exit\n");
    process.exit(0);
  });
  // Hard fallback — НЕ .unref(), должен fire даже при idle event loop.
  setTimeout(() => {
    process.stderr.write("[server] force exit after 3s timeout\n");
    process.exit(1);
  }, 3000);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
```

**Rationale**: top-level `await` в ESM (package.json `"type": "module"`). Shutdown handler cross-OS via Node emulation SIGTERM. `supervisor.start()` может throw (mkdir fail) — fail-fast startup acceptable.

**Shutdown handler robustness (post-R8 Codex rerun):**
- `process.stderr.write` (sync) вместо `console.log` — log line всегда flushes даже при shutdown hang.
- `closeAllConnections()` immediately (до `server.close()`) — Node 20+ не закрывает idle keep-alive sockets автоматически, что держит event loop alive пока TCP timeout не истечёт (минуты). Force-close всех sockets разом.
- `setTimeout(process.exit(1), 3000)` **без `.unref()`** — должен fire даже если event loop идёт в idle. Это hard fallback если server.close callback никогда не fires.
- Итого: graceful exit ≤3s гарантирован.

### Change 3 — `dashboard/src/api.js`

Добавить wrapper в конец файла:

```js
export async function fetchRuntimeState(signal) {
  const response = await fetch("/api/runtime/state", {
    cache: "no-store",
    signal
  });
  return parseJsonResponse(response, `Runtime API returned ${response.status}`);
}
```

**Rationale**: mirrors existing `fetchMessages`/`postNote` patterns. Reuses `parseJsonResponse` helper.

### Change 4 — `dashboard/src/App.jsx`

**Change 4.1** — import update (line 2 post-`458552b`):

**Current** (exact match):
```jsx
import { archiveMessage, fetchMessages, postNote } from "./api.js";
```

**Target**:
```jsx
import { archiveMessage, fetchMessages, fetchRuntimeState, postNote } from "./api.js";
```

**Change 4.2** — добавить translations (найти существующий block `ru = {...}`, добавить keys после последнего timestamp/status key; аналогично `en`):

```js
// ru block — add
activeSessionsTitle: "Активные сессии",
noActiveSessions: "Нет активных сессий.",
pendingIndexTitle: "Незабранные сообщения",
noPendingMessages: "Нет pending-сообщений.",
supervisorHealthLabel: "Supervisor",
supervisorLastTick: "Последний цикл",

// en block — add
activeSessionsTitle: "Active sessions",
noActiveSessions: "No active sessions.",
pendingIndexTitle: "Undelivered messages",
noPendingMessages: "No pending messages.",
supervisorHealthLabel: "Supervisor",
supervisorLastTick: "Last tick",
```

**Change 4.3** — в `App()` функции (рядом с existing messages state):

```js
const [runtimeState, setRuntimeState] = useState({
  activeSessions: [],
  pendingIndex: [],
  supervisorHealth: { lastTickAt: null, tickErrors: 0 }
});
```

**Change 4.4** — useEffect для polling runtime (отдельный effect, рядом с messages polling):

```js
useEffect(() => {
  const controller = new AbortController();
  async function load() {
    try {
      const data = await fetchRuntimeState(controller.signal);
      setRuntimeState({
        activeSessions: Array.isArray(data.activeSessions) ? data.activeSessions : [],
        pendingIndex: Array.isArray(data.pendingIndex) ? data.pendingIndex : [],
        supervisorHealth: data.supervisorHealth || { lastTickAt: null, tickErrors: 0 }
      });
    } catch (loadError) {
      if (!(loadError instanceof DOMException && loadError.name === "AbortError")) {
        // non-fatal — supervisor может быть down; не спамим error banner
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

**Change 4.5** — JSX section: найти `<section className="hero">...</section>` close tag и вставить **сразу после** (перед conditional error banner / grid). Порядок гарантирует видимость даже при error:

```jsx
<section className="runtimePanel">
  <div className="runtimeBlock">
    <h2>{t.activeSessionsTitle}</h2>
    {runtimeState.activeSessions.length === 0 ? (
      <p className="columnHint">{t.noActiveSessions}</p>
    ) : (
      <ul className="runtimeList">
        {runtimeState.activeSessions.map((s) => (
          <li key={s.session_id}>
            <span className="chip">{s.agent}</span>
            <span className="chip chipProject">{s.project}</span>
            <span className="mono">{s.session_id}</span>
            <span className="timestamp">{formatTimestamp(s.last_seen, lang, t)}</span>
          </li>
        ))}
      </ul>
    )}
  </div>
  <div className="runtimeBlock">
    <h2>{t.pendingIndexTitle} ({runtimeState.pendingIndex.length})</h2>
    {runtimeState.pendingIndex.length === 0 ? (
      <p className="columnHint">{t.noPendingMessages}</p>
    ) : (
      <ul className="runtimeList">
        {runtimeState.pendingIndex.map((m) => (
          <li key={m.relativePath}>
            <span className="chip">{m.to}</span>
            {m.project ? <span className="chip chipProject">{m.project}</span> : null}
            <span className="mono">{m.thread}</span>
            <span className="timestamp">{formatTimestamp(m.created, lang, t)}</span>
          </li>
        ))}
      </ul>
    )}
  </div>
  <p className="supervisorFooter">
    <strong>{t.supervisorHealthLabel}</strong>
    {" · "}
    {t.supervisorLastTick}: {runtimeState.supervisorHealth.lastTickAt
      ? formatTimestamp(runtimeState.supervisorHealth.lastTickAt, lang, t)
      : "—"}
  </p>
</section>
```

**Change 4.6** — CSS (в styles template string) — добавить:

```css
.runtimePanel {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin: 0 0 24px;
  padding: 16px;
  border: 1px solid var(--border-soft);
  border-radius: 16px;
  background: var(--surface-stat);
}
.runtimeBlock h2 {
  margin: 0 0 10px;
  font-size: 14px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-accent);
}
.runtimeList {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.runtimeList li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.supervisorFooter {
  grid-column: 1 / -1;
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}
@media (max-width: 900px) {
  .runtimePanel {
    grid-template-columns: 1fr;
  }
}
```

**Rationale**: reuses existing design tokens (`--border-soft`, `--surface-stat`, `--text-accent`, `--text-muted`). Responsive fallback для narrow viewport.

### Change 5 — `.gitignore`

**Current** (full file, 16 lines):

```
# Mailbox is local working memory, not a project artifact.
agent-mailbox/

# Dependencies
node_modules/
dashboard/node_modules/

# Build output
dashboard/dist/

# OS
.DS_Store
Thumbs.db

# Codex CLI sandbox state (personal, per-session)
.codex
```

**Target** — добавить после `agent-mailbox/`:

```
# Mailbox is local working memory, not a project artifact.
agent-mailbox/

# Mailbox runtime state (supervisor: sessions, pending-index, health) — gitignored
mailbox-runtime/

# Dependencies
...
```

---

## §7 Verification phases

### Phase 1 — Codex-only (WSL execution)

**Mandatory order**: Change 5 (.gitignore) **first** — иначе `mailbox-runtime/` появляется как untracked → V10 fails. Apply order: Change 5 → Change 1 → Change 2 → Change 3 → Change 4 → V1-V10.

| # | Check | Expected |
|---|-------|----------|
| V1 | Supervisor module loads | `function` |
| V2 | createSupervisor shape | `router,start,state,stop` |
| V3 | Build passes | `✓ built` без ошибок |
| V4 | `/api/runtime` mount + createSupervisor call | ≥3 matches в server.js |
| V5 | `.gitignore` contains `mailbox-runtime/` | `1` |
| V6 | Dashboard UI wired (api.js fetchRuntimeState + App.jsx references) | ≥4 matches across files |
| V7 | Graceful shutdown empirical (port-readiness loop + timeouts) | http: 200 + exit 0 or 1 (not force-killed) |
| V8 | pendingIndex содержит `project` + `deliverable` + `projectMissing` fields (rail #3 prereq hardening) | ≥3 matches |
| V9 | Personal data scan | только `--scan done` |
| V10 | Whitelist respected | 5 whitelist files + 3 handoff artefacts only |

Verification commands:

```bash
# V1
cd dashboard && node -e "import('./supervisor.mjs').then(m => console.log(typeof m.createSupervisor))"
# Expected: function

# V2
cd dashboard && node -e "import('./supervisor.mjs').then(m => { const s = m.createSupervisor({mailboxRoot: '/tmp/mbox', runtimeRoot: '/tmp/rt', pollIntervalMs: 3000}); console.log(Object.keys(s).sort().join(',')); })"
# Expected: router,start,state,stop

# V3
cd dashboard && npx vite build 2>&1 | tail -5

# V4
grep -cE "api/runtime|createSupervisor" dashboard/server.js
# Expected: >=3

# V5
grep -c "^mailbox-runtime/" .gitignore
# Expected: 1

# V6
grep -cE "runtimePanel|fetchRuntimeState|activeSessionsTitle" dashboard/src/App.jsx dashboard/src/api.js
# Expected: >=4

# V7 — PID-capture graceful shutdown probe (runs against real agent-mailbox/)
# Safety: supervisor pollTick uses readBucket (read-only) + writes ONLY to mailbox-runtime/ (gitignored, isolated).
# GET /api/runtime/state is pure read. POST/DELETE /sessions не called в этом тесте.
# Fragility notes (post-R5 execution): WSL /mnt/e/ I/O может быть медленным для initial pollTick;
# curl без -m timeout + fixed sleep могут race. Решение: port-readiness loop + explicit timeouts.

# Port sanity — если 3003 занят, curl может вернуть 200 от другого сервера → false PASS.
if lsof -i :3003 >/dev/null 2>&1 || ss -ltn 2>/dev/null | awk '{print $4}' | grep -q ':3003$'; then
  echo "V7 FAIL: port 3003 already occupied — STOP, kill existing listener first"
  exit 1
fi

# ВАЖНО: split cd из background команды. `cd X && node Y &` в bash даёт $! = subshell PID,
# не node PID → kill -INT уходит в wrong process → node никогда не получает SIGINT.
cd dashboard
node server.js > /tmp/supv-v7.log 2>&1 &
SUPV_PID=$!

# Port readiness loop (≤15s) — ждём пока server actually listens
HTTP_CODE="000"
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if ! kill -0 $SUPV_PID 2>/dev/null; then
    echo "V7 FAIL: server process exited during startup"
    tail -20 /tmp/supv-v7.log
    exit 1
  fi
  HTTP_CODE=$(curl -s -m 2 -o /dev/null -w "%{http_code}" http://127.0.0.1:3003/api/runtime/state 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    break
  fi
  sleep 1
done
echo "http: $HTTP_CODE"

# Graceful shutdown — SIGINT + wait loop ≤7s (plan setTimeout fallback 5s + margin)
kill -INT $SUPV_PID 2>/dev/null
EXIT=""
for i in 1 2 3 4 5 6 7; do
  if ! kill -0 $SUPV_PID 2>/dev/null; then
    wait $SUPV_PID 2>/dev/null
    EXIT=$?
    break
  fi
  sleep 1
done
if [ -z "$EXIT" ]; then
  kill -KILL $SUPV_PID 2>/dev/null
  wait $SUPV_PID 2>/dev/null
  echo "exit: force-killed (graceful shutdown hung >7s)"
else
  echo "exit: $EXIT"
fi
# Expected: http: 200, exit: 0 (или exit: 1 if setTimeout fallback triggered — still acceptable,
# indicates handler fired). "force-killed" → FAIL, shutdown handler не работает.

# V8 — pendingIndex project + deliverable + projectMissing hardening (rail #3 prereq)
grep -cE "project: normalized|deliverable:|projectMissing:" dashboard/supervisor.mjs
# Expected: >=3 (single map returns all three keys в pollTick)

# V9 — Personal data scan
PD_PATTERNS='$PD_PATTERNS'
grep -riE "$PD_PATTERNS" --include="*.js" --include="*.jsx" --include="*.mjs" --include="*.html" --include="*.json" dashboard/ scripts/ 2>/dev/null
grep -riE "$PD_PATTERNS" --include="*.md" CLAUDE.md README.md README.ru.md local-claude-codex-mailbox-workflow.md workflow-instructions-*.md 2>/dev/null
echo "--scan done"

# V10 — Whitelist drift
git status --short
# Expected: only whitelist M + 3 handoff artefacts (?? docs/codex-tasks/mailbox-automation-compat*)
```

Any FAIL → STOP + report §5.

### Phase 2 — user visual check `[awaits user]`

| # | Check |
|---|-------|
| P2.1 | Dashboard loads: `cd dashboard && npm run dev` → `http://127.0.0.1:9119/` |
| P2.2 | Секция «Активные сессии» visible, говорит «Нет активных сессий» |
| P2.3 | Секция «Незабранные сообщения» shows pending count matching current mailbox |
| P2.4 | POST /api/runtime/sessions creates session record: `curl -X POST -H "Content-Type: application/json" -d '{"session_id":"test-1","agent":"claude","project":"workflow","cwd":"/tmp"}' http://127.0.0.1:3003/api/runtime/sessions` → 201; через 3s refresh → session в «Активные» |
| P2.5 | Session auto-expires по `last_seen > 60s` — session пропадает из активных через минуту без refresh POST |
| P2.6 | `mailbox-runtime/*.json` создаются + обновляются — `ls mailbox-runtime/` shows sessions.json, pending-index.json, supervisor-health.json |

### Phase 3 — Cross-OS parity `[awaits user, Windows native]`

Rail #1 требует identical behavior Windows + Linux. Codex не может тестировать Windows native в handoff; user validates:

| # | Check |
|---|-------|
| P3.1 | Windows native: запустить dashboard через `start-workflow.cmd`; верифицировать что `mailbox-runtime/` создаётся и JSON files correct |
| P3.2 | Windows native: POST session + verify persist + auto-expire parity |
| P3.3 | Windows native: Ctrl+C shutdown — clean exit без orphaned handles |

---

## §8 Acceptance criteria

- [ ] Phase 1 V1-V10 PASS
- [ ] Report template filled
- [ ] No files outside §5 whitelist
- [ ] Build size growth ≤10 kB
- [ ] PD scan clean (V9)
- [ ] `mailbox-runtime/` runtime-only + gitignored (V5)
- [ ] `dashboard/supervisor.mjs` — extractable module (Q2)
- [ ] Supervisor logic НЕ размазан по server.js
- [ ] Graceful shutdown (V7)
- [ ] pendingIndex preserves project field (rail #3 prerequisite)
- [ ] Codex не commits/pushes без user command
- [ ] Phase 2 + Phase 3 parity checks passed under user observation

---

## §9 Out of scope

### §9.1 Phase B — Passive hook integration (framework)

**Phase B out of execution в этом handoff.** Framework declaration:

- `SessionStart` hook (Claude only per rail #5): `POST /api/runtime/sessions` with `session_id`, `agent=claude`, `project` (from cwd mapping), `cwd`, `transport=claude-hooks`, `platform=(windows|linux|wsl)`.
- `Stop` hook (Claude only): heartbeat `POST /api/runtime/sessions` refresh + optional delivery check `GET /api/runtime/deliveries?session_id=...&project=...`.
- Codex Linux/WSL: equivalent hooks если/когда OpenAI ships hooks support.
- **No UserPromptSubmit** (rail #8) — excluded.

### §9.2 Phase C — Delivery signals (framework)

- Supervisor generates delivery records когда `pendingIndex` contains message matching active session (agent+project match).
- `GET /api/agent/runtime/deliveries` returns ONLY deliveries for agent's project (rail #3 — scoped).
- Stop hook injects continuation "Есть новое письмо по project X. Проверь почту." — NOT auto-read, NOT auto-reply.

### §9.3 Phase D — Lease/claim hardening (framework)

- Multi-window lease protection (TTL-based).
- Stale lease recovery.
- Observability (missed delivery counters).

### §9.4 Codex Windows native degraded mode (rail #7 explicit marking)

| Path | Windows native Codex | Linux/WSL Codex | Claude Windows | Claude Linux/WSL |
|------|----------------------|-----------------|----------------|------------------|
| Phase A dashboard visibility | ✅ works (pure dashboard) | ✅ works | ✅ works | ✅ works |
| Phase B SessionStart auto-register | ⚠️ **degraded** — no hook path; user must manually `curl POST /api/runtime/sessions` | ✅ if/when Codex hooks ship | ✅ hook-driven | ✅ hook-driven |
| Phase B Stop heartbeat | ⚠️ **degraded** — manual | ✅ if/when shipped | ✅ auto | ✅ auto |
| Phase C delivery signal | ❌ **unsupported** — no hook injection point | ✅ if/when shipped | ✅ | ✅ |
| Phase D lease/claim | ⚠️ **works** on API level, но delivery не triggered | ✅ | ✅ | ✅ |

Rail #10 explicit: Codex Windows native автоматика **unsupported** до OpenAI ships cross-platform hooks. Degraded path = manual session registration via curl или CLI helper (deferred).

### §9.5 Other defers

- Project detection unification (Q3) — Phase B decision.
- CLI parity `scripts/mailbox.mjs runtime` subcommand — not needed для visibility-only.
- Dashboard auth — localhost-only (ТЗ confirmed).
- `chokidar`/`fs.watch` — ТЗ explicit polling preference.
- Tests — нет test harness; verification via empirical node -e + curl + user visual.
- `scripts/mailbox-lib.mjs` API additions — read-only в Phase A.

---

## §10 Rollback

**До commit** — non-destructive:
1. `git diff --stat dashboard/supervisor.mjs dashboard/server.js dashboard/src/api.js dashboard/src/App.jsx .gitignore` — sanity check.
2. `git stash push -m "automation-compat-rollback" -- dashboard/supervisor.mjs dashboard/server.js dashboard/src/api.js dashboard/src/App.jsx .gitignore`.
3. Mixed changes в worktree → STOP + surface.
4. `rm -rf mailbox-runtime` (runtime-only, gitignored).
5. `cd dashboard && npx vite build 2>&1 | tail -5` — baseline clean.

**После commit**: `git revert <sha>`. `mailbox-runtime/` — runtime, manual delete если нужно.

---

## §11 Discrepancy checkpoints (STOP conditions)

1. P2 baseline line count drift >5 lines на whitelist → STOP.
2. P3 atomic write FAIL (rail #1 breach) → STOP.
3. P4 build FAIL → STOP → environment repair → re-run.
4. P5 existing `/api/runtime` route conflict → STOP.
5. Phase 1 V1-V10 any FAIL → STOP.
6. V7 graceful shutdown hanging → STOP; signal handlers не registered или server.close() висит >5s.
7. V10 whitelist drift → STOP.
8. Modification of `scripts/mailbox-lib.mjs` / `scripts/mailbox.mjs` во время execution → STOP (reference-only).
9. Новый `M` outside whitelist не в §0.4 baseline → STOP + surface.
10. Any Codex temptation добавить SessionStart hook code — STOP + defer Phase B.

---

## §12 Self-audit checklist

- [ ] 1: P1-P5 pre-flight OK
- [ ] 2: Change 1 (supervisor.mjs) created; `createSupervisor` exported; atomicWriteJson pattern
- [ ] 3: Change 2 (server.js) applied; imports + runtimeRoot + supervisor mount + shutdown handlers
- [ ] 4: Change 3 (api.js) applied; `fetchRuntimeState` exported
- [ ] 5: Change 4 (App.jsx) applied — 6 substeps (import, translations, state, effect, JSX, CSS)
- [ ] 6: Change 5 (.gitignore) applied
- [ ] 7: V1-V10 recorded verbatim
- [ ] 8: V10 whitelist drift clean
- [ ] 9: No commit/push performed
- [ ] 10: Discrepancies recorded verbatim
- [ ] 11: Report §0-§11 filled
- [ ] 12: Supervisor module Q2 requirement verified (logic fully в supervisor.mjs)
- [ ] 13: pendingIndex preserves `project` для rail #3 downstream

≥11/13 OK → ready for user review.

---

## §13 Notes to Codex

- **Environment**: WSL, `cwd=/mnt/e/Project/workflow`. Baseline drift model: §4 P1.
- **Planning snapshot**: HEAD=`458552b`. Drift от newer master → STOP + Discrepancy.
- **Anti-fabrication**: все V1-V10 outputs verbatim.
- **No new deps**: `package.json`/lockfile не в whitelist. Temptation добавить dep (atomic FS op, etc) — STOP, mailbox discussion.
- **Modular boundary (Q2)**: supervisor logic fully в `dashboard/supervisor.mjs`. server.js — только import, mount, lifecycle.
- **No hooks в Phase A** (rail #4-8). Temptation добавить SessionStart code — STOP + out-of-scope reply.
- **Cross-OS rail #1**: P3 empirical обязателен; если fails — STOP (не suppress).
- **Rail #3 prerequisite**: pendingIndex.map() must include `project` field. V8 grep verifies.
- **Rail #10 marking**: §9.3 — degraded paths explicit.

---

## §14 Commits strategy

**Single commit** preferred:

```
feat(dashboard): mailbox automation compat — Phase A visibility (cross-OS + compat rails)

Core changes:
- dashboard/supervisor.mjs: extractable module (poll loop, runtime state, atomic writes, Express router)
- dashboard/server.js: import + mount /api/runtime + SIGINT/SIGTERM graceful shutdown
- dashboard/src/api.js: fetchRuntimeState wrapper
- dashboard/src/App.jsx: active-sessions + pending-index panel + translations + CSS
- .gitignore: mailbox-runtime/

Phase A scope: global visibility only. 10 cross-OS compat rails from Codex enforced:
- Universal core (pure Node + fs/promises), atomic rename cross-OS verified
- Single dashboard extended
- pendingIndex carries project field (prerequisite for Phase B agent isolation)
- No hooks, no UserPromptSubmit, no delivery signals — Phase B/C/D separate handoffs

Supersedes deferred mailbox-supervisor-phase-a.md (baseline drifted to HEAD=458552b).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Push**: ждёт explicit user command.


## Legacy Workflow Note (2026-04-21)

This file is preserved as a historical artifact from an earlier workflow revision.

It may mention legacy patterns such as `Claude planner / Codex executor`, user relay, `compact prompt`, or older handoff shapes.

Do not use it as the live operating template. Current contract: `docs/codex-system-prompt.md`, `AGENTS.md`, `workflow-role-distribution.md`, `workflow-instructions-claude.md`, and `workflow-instructions-codex.md`.
