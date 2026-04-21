# Mailbox Supervisor Phase A — Execution Plan

**Version**: v1
**Planning-audit**: `docs/codex-tasks/mailbox-supervisor-phase-a-planning-audit.md`
**Report template**: `docs/codex-tasks/mailbox-supervisor-phase-a-report.md`
**ТЗ source**: `docs/codex-tasks/mailbox-auto-pickup-supervisor-tz.md`
**Target executor**: Codex (WSL)
**Planner**: Claude (Windows)
**Scope**: Phase A из 4-phase rollout — visibility only. Supervisor polling + runtime session registry + dashboard section. No hooks, no delivery signals, no lease/claim.

---

## §1 Why this plan exists

ТЗ §«Предлагаемый rollout» разбивает feature на 4 фазы (A→D). Phase A даёт visibility: доказать что картина по нескольким проектам читается. Hooks и delivery automation — следующие handoff'ы.

Design negotiation (Q1, Q2 из ТЗ §«Open design questions») прошла через mailbox thread `mailbox-auto-pickup-supervisor-tz` с Codex:

- **Q1 — runtime-state location**: `mailbox-runtime/` в workflow repo, gitignored.
- **Q2 — supervisor process**: встроен в dashboard backend, **с жёстким условием** — supervisor logic живёт в отдельном extractable `dashboard/supervisor.mjs` module (не размазан по server.js). Codex requirement.
- **Q3/Q4/Q5** отложены до Phase B/C.

Evidence chain: planning-audit §4 (Doc Verification), §6 (empirical test), §10 (gaps with mitigations).

---

## §2 Hierarchy of sources of truth

1. Official docs (Node.js 24 fs/timers, Express 5 router) — planning-audit §4.
2. Live code (`scripts/mailbox-lib.mjs`, `dashboard/server.js`) — planning-audit §3.
3. ТЗ (`docs/codex-tasks/mailbox-auto-pickup-supervisor-tz.md`) — constraints, architecture direction.
4. Design agreement thread (archived) — Q1, Q2 decisions.
5. This plan — derived from 1-4.
6. **Discrepancy rule**: Codex в pre-flight обнаружит конфликт → STOP + report §5 Discrepancies.

---

## §3 Doc verification (§V1–§V6)

### §V1 — `fs.writeFile`

> "Asynchronously writes data to a file, replacing the file if it already exists. … Defaults: encoding `'utf8'`, mode `0o666`, flag `'w'`. Repeatedly calling `fs.writeFile()` without waiting for the callback is considered unsafe."
>
> — nodejs.org/docs/latest-v24.x/api/fs

**Использование**: supervisor пишет runtime state через `fs.promises.writeFile(tmpPath, json, "utf8")` + `fs.promises.rename(tmp, final)` — atomic swap. Sequential awaits, no concurrent writes на одном файле.

### §V2 — `fs.rename`

> "Asynchronously rename file at oldPath to the pathname provided as newPath. In the case that newPath already exists, it will be overwritten."
>
> — nodejs.org/docs/latest-v24.x/api/fs

**Использование**: overwrite-on-rename = atomic state swap на POSIX + NTFS.

### §V3 — `setInterval` / `clearInterval`

> "Schedules repeated execution of a callback function every delay milliseconds." / "Clears an interval timer set with `setInterval()`."
>
> — nodejs.org/docs/latest-v24.x/api/globals

**Использование**: poll loop = `const timer = setInterval(pollTick, pollIntervalMs)`. Graceful shutdown = `clearInterval(timer)` в SIGTERM handler.

### §V4 — Express `Router`

> "The Express Router allows for the creation of modular, mountable route handlers. This is useful for organizing routes into separate files and modules."
>
> — context7.com/expressjs/express/llms.txt

**Использование**: supervisor module экспортирует `createSupervisor({ mailboxRoot, runtimeRoot, pollIntervalMs })` который возвращает `{router, start, stop}`. server.js: `const sup = createSupervisor(...); app.use("/api/runtime", sup.router); sup.start();` + signal handler `sup.stop()`.

### §V5 — `fs.readdir({ withFileTypes: true })`

Pattern reused из `scripts/mailbox-lib.mjs:217` (`collectMarkdownFiles`). In-repo precedent validated.

### §V6 — Graceful shutdown [⚠️ implementation-knowledge]

Standard Node pattern: `process.on("SIGINT", shutdown)`, `process.on("SIGTERM", shutdown)`, `server.close()`, `clearInterval(timer)`. Codex empirical verification в pre-flight: start dashboard → send SIGINT → verify poll stopped + no orphaned handles.

---

## §4 Pre-flight verification (Codex execute BEFORE any change)

Codex запускает в WSL, `cwd=/mnt/e/Project/workflow`. Outputs verbatim в report §0.

### P1 — environment baseline

```bash
node --version
(cd dashboard && node --version && npm --version)
git -C /mnt/e/Project/workflow rev-parse --short HEAD
git -C /mnt/e/Project/workflow status --short
```

**Expected**:
- Node ≥ 20.19.
- HEAD = `44a704c` (planning snapshot) или newer commit на master.
- **Baseline drift model** (same as prior handoff): Codex записывает actual baseline verbatim в §0.4; pre-existing `M` outside whitelist acceptable if зафиксирован + не трогается + §9 identical; только **новый** M/?? outside whitelist вводимый во время execution → STOP.

### P2 — read whitelist files

```bash
wc -l dashboard/server.js dashboard/src/App.jsx dashboard/src/api.js .gitignore dashboard/package.json scripts/mailbox-lib.mjs
```

Expected baseline (post-`92231a4 fix(mailbox): remove implicit user reply sender`):

| File | Lines |
|------|-------|
| `dashboard/server.js` | 159 |
| `dashboard/src/App.jsx` | 1544 |
| `dashboard/src/api.js` | 61 |
| `.gitignore` | 16 |
| `dashboard/package.json` | 26 |
| `scripts/mailbox-lib.mjs` | 674 (read-only reference, NOT modified) |

Drift >5 lines на любом whitelist file → STOP + report §5 Discrepancies.

### P3 — empirical atomic write pattern

```bash
cd dashboard && node -e "
const fs = require('fs');
const tmp = '/tmp/supv-atomic.json';
const final = '/tmp/supv-atomic-final.json';
fs.writeFileSync(tmp, JSON.stringify({a:1}));
fs.renameSync(tmp, final);
console.log('atomic rename ok:', fs.readFileSync(final, 'utf8'));
fs.unlinkSync(final);
"
```

**Expected**: `atomic rename ok: {"a":1}`. Если FAIL — WSL `/tmp` mount problem → используем `mailbox-runtime/tmp-*` в repo вместо `/tmp`.

### P4 — baseline build

```bash
cd dashboard && npx vite build 2>&1 | tail -5
```

**Expected**: `✓ built` без ошибок. Baseline size 224.82 kB (±5 kB).

### P5 — existing routes sanity

```bash
grep -n "app.post\|app.get\|app.listen" dashboard/server.js
```

**Expected** (post-`92231a4` baseline — `/api/reply` уже удалён):
- `/api/messages` (GET), `/api/messages/:dir` (GET), `/api/archive` (POST), `/api/notes` (POST), `app.listen`.

Новая mount `app.use("/api/runtime", ...)` не конфликтует (prefix unique).

---

## §5 Whitelist — only these files may be created/modified

| File | Purpose | Status |
|------|---------|--------|
| `dashboard/supervisor.mjs` | **NEW** — extractable supervisor module (poll, state, router factory) | create |
| `dashboard/server.js` | +import supervisor, +mount `/api/runtime`, +signal handlers | modify |
| `dashboard/src/api.js` | +`fetchRuntimeState()` wrapper | modify |
| `dashboard/src/App.jsx` | +2 dashboard sections (active sessions + pending index) + state + fetch | modify |
| `.gitignore` | +line `mailbox-runtime/` | modify |

**НЕ ТРОГАТЬ**:
- `scripts/mailbox-lib.mjs` (read-only reference — no API changes)
- `scripts/mailbox.mjs` (CLI — Phase A не трогает)
- `local-claude-codex-mailbox-workflow.md` (spec — no Phase A update)
- `dashboard/package.json`, `dashboard/package-lock.json` (no new deps)
- `dashboard/vite.config.js`, `dashboard/index.html`
- `agent-mailbox/**` (runtime data)
- `docs/codex-tasks/*` кроме этой handoff-тройки
- `CLAUDE.md`, `README.md`, `README.ru.md`, `LICENSE`
- `.github/workflows/ci.yml`
- любые новые файлы вне `dashboard/supervisor.mjs`

---

## §6 Changes

### Change 1 — **NEW** `dashboard/supervisor.mjs`

Создать новый файл. Module exports factory `createSupervisor({mailboxRoot, runtimeRoot, pollIntervalMs, logger})`:

```js
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import {
  collectMailboxMessages
} from "../scripts/mailbox-lib.mjs";

const SESSION_STALE_MS = 60_000;

export function createSupervisor({
  mailboxRoot,
  runtimeRoot,
  pollIntervalMs = 3000,
  logger = console
}) {
  const state = {
    sessions: new Map(), // session_id -> {agent, project, session_id, cwd, transport, last_seen}
    pendingIndex: [],    // [{relativePath, to, project, thread, created}]
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
    if (!body.session_id || !body.agent || !body.project) {
      response.status(400).json({ error: "session_id, agent, project required" });
      return;
    }
    const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const existing = state.sessions.get(body.session_id) || {};
    const record = {
      ...existing,
      session_id: body.session_id,
      agent: body.agent,
      project: body.project,
      cwd: body.cwd || existing.cwd || "",
      transport: body.transport || existing.transport || "manual",
      last_seen: now
    };
    state.sessions.set(body.session_id, record);
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
      return; // guard: skip if previous tick running
    }
    state.supervisorHealth.isScanning = true;
    const startedAt = Date.now();
    try {
      const messages = await collectMailboxMessages(mailboxRoot);
      state.pendingIndex = messages
        .filter((m) => m.bucket === "to-claude" || m.bucket === "to-codex")
        .map((m) => ({
          relativePath: m.relativePath,
          to: m.to,
          project: m.project,
          thread: m.thread,
          created: m.created
        }));
      state.supervisorHealth.lastTickAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
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
    state.supervisorHealth.startedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    await pollTick(); // immediate first tick
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
- Modular boundary satisfies Q2 condition — supervisor logic fully inside this file, server.js только mounts и controls lifecycle.
- `atomicWriteJson` = writeFile + rename pattern (§V1, §V2, §V6 E1).
- `isScanning` guard = G4 mitigation.
- No `fs.watch` — polling (§V3).
- `state` exposed for testing/inspection (не documented API).

### Change 2 — `dashboard/server.js`

**Current** imports (line 1-18 post-`92231a4`):

```js
import express from "express";
import {
  archiveMessageFile,
  appendNoteToMessageFile,
  collectProjectValues,
  ClientError,
  defaultMailboxRoot,
  filterMessagesByProject,
  host,
  isKnownBucket,
  normalizeProject,
  port,
  readBucket,
  sanitizeString,
  validateRelativeInboxPath,
  validateResolution
} from "../scripts/mailbox-lib.mjs";
```

**Target** — **preserve all 14 existing named imports** из `../scripts/mailbox-lib.mjs` (archiveMessageFile, appendNoteToMessageFile, collectProjectValues, ClientError, defaultMailboxRoot, filterMessagesByProject, host, isKnownBucket, normalizeProject, port, readBucket, sanitizeString, validateRelativeInboxPath, validateResolution — unchanged). Add **только** 3 new imports + 2 локальные константы в начало файла:

```js
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSupervisor } from "./supervisor.mjs";
import express from "express";
import {
  archiveMessageFile,
  appendNoteToMessageFile,
  collectProjectValues,
  ClientError,
  defaultMailboxRoot,
  filterMessagesByProject,
  host,
  isKnownBucket,
  normalizeProject,
  port,
  readBucket,
  sanitizeString,
  validateRelativeInboxPath,
  validateResolution
} from "../scripts/mailbox-lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runtimeRoot = path.resolve(__dirname, "../mailbox-runtime");
```

**Target** — **заменить** существующий блок `app.listen(port, host, () => {...})` (текущие строки 157-159):

```js
app.listen(port, host, () => {
  console.log(`Server listening on ${host}:${port}`);
});
```

на расширенный блок (НЕ дописать к существующему — полностью замена, иначе получится двойной `app.listen` → `EADDRINUSE`):

```js
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
  console.log(`[server] ${signal} received, shutting down`);
  supervisor.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
```

**Rationale**: top-level `await` работает в ESM module (package.json `"type": "module"`). Signal handlers обеспечивают graceful shutdown. `supervisor.start()` может throw (mkdir failure, permission error) — это fail-fast, server.js не catches; acceptable для startup phase, user видит ошибку сразу.

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

### Change 4 — `dashboard/src/App.jsx`

Surgical:

1. Import update (top, line 2) — add `fetchRuntimeState`:
   ```jsx
   import { archiveMessage, fetchMessages, fetchRuntimeState, postNote } from "./api.js";
   ```
   **Current** (post-`92231a4`): `import { archiveMessage, fetchMessages, postNote } from "./api.js";` — **no `postReply`** (removed с удалением reply feature).

2. Добавить translations (в `ru` и `en`, после existing notes блока):
   ```js
   // ru
   activeSessionsTitle: "Активные сессии",
   noActiveSessions: "Нет активных сессий.",
   pendingIndexTitle: "Незабранные сообщения",
   noPendingMessages: "Нет pending-сообщений.",
   supervisorHealthLabel: "Supervisor",
   supervisorLastTick: "Последний цикл",
   // en
   activeSessionsTitle: "Active sessions",
   noActiveSessions: "No active sessions.",
   pendingIndexTitle: "Undelivered messages",
   noPendingMessages: "No pending messages.",
   supervisorHealthLabel: "Supervisor",
   supervisorLastTick: "Last tick"
   ```

3. State в `App()`:
   ```js
   const [runtimeState, setRuntimeState] = useState({
     activeSessions: [],
     pendingIndex: [],
     supervisorHealth: { lastTickAt: null, tickErrors: 0 }
   });
   ```

4. Effect (polling same 3s interval as messages):
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

5. JSX section — добавить **сразу после** закрывающего тега `</section>` секции `hero` и **перед** условной `{error ? <div className="errorBanner">...` (baseline ~line 1667). Порядок после вставки: `hero` → `runtimePanel` → `errorBanner` (conditional) → `grid`. Это гарантирует что runtimePanel всегда видим, даже когда error-banner активен:
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
               <span className="chip">{s.project}</span>
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

6. CSS (в styles template string) — добавить:
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

### Change 5 — `.gitignore`

**Current**:
```
# Mailbox is local working memory, not a project artifact.
agent-mailbox/

# Dependencies
node_modules/
dashboard/node_modules/
...
```

**Target** — добавить после `agent-mailbox/`:
```
# Mailbox runtime state (supervisor: sessions, pending-index, health)
mailbox-runtime/
```

---

## §7 Verification phases

### Phase 1 — Codex-only

**Mandatory order**: Change 5 (`.gitignore` добавление `mailbox-runtime/`) должен быть **first applied change** перед любым запуском `supervisor.start()` в V7. Иначе `mailbox-runtime/` появится в `git status --short` как untracked directory → V9 провалится как "new `??` outside whitelist". Порядок apply: Change 5 → Change 1 → Change 2 → Change 3 → Change 4 → V1-V9.

| # | Check | Command | Expected |
|---|-------|---------|----------|
Команды для V3, V4, V5, V6, V8 приводятся в fenced блоках **ниже таблицы** (markdown-pipe в table cells небезопасен — shell видит backslash как literal, см. handoff trap). В таблице — только суть + pass-criteria.

| # | Check | Expected |
|---|-------|----------|
| V1 | Supervisor module loads | `function` |
| V2 | createSupervisor shape | `router,start,state,stop` |
| V3 | Build passes | `✓ built` без ошибок |
| V4 | `/api/runtime/state` route registered | ≥3 matches |
| V5 | `.gitignore` has `mailbox-runtime/` | `1` |
| V6 | Dashboard UI compiled | ≥4 matches across files |
| V7 | Graceful shutdown empirical | 200 JSON + clean exit ≤5s |
| V8 | Personal data scan | только `--scan done` |
| V9 | Whitelist respected | 5 whitelist files + 3 handoff artefacts only |

```bash
# V1
cd dashboard && node -e "import('./supervisor.mjs').then(m => console.log(typeof m.createSupervisor))"

# V2
cd dashboard && node -e "import('./supervisor.mjs').then(m => { const s = m.createSupervisor({mailboxRoot: '/tmp/mbox', runtimeRoot: '/tmp/rt', pollIntervalMs: 3000}); console.log(Object.keys(s).sort().join(',')); })"

# V3
cd dashboard && npx vite build 2>&1 | tail -5

# V4
grep -n 'api/runtime\|createSupervisor' dashboard/server.js

# V5
grep -c '^mailbox-runtime/' .gitignore

# V6
grep -c 'runtimePanel\|fetchRuntimeState\|activeSessionsTitle' dashboard/src/App.jsx dashboard/src/api.js

# V7 — PID-based capture, не через concurrently
cd dashboard && node server.js > /tmp/supv-v7.log 2>&1 &
SUPV_PID=$!
sleep 2
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3003/api/runtime/state
kill -INT $SUPV_PID
wait $SUPV_PID 2>/dev/null
echo "exit code: $?"

# V8
PD_PATTERNS='$PD_PATTERNS'
grep -riE "$PD_PATTERNS" --include="*.js" --include="*.jsx" --include="*.mjs" --include="*.html" --include="*.json" dashboard/ scripts/ 2>/dev/null
grep -riE "$PD_PATTERNS" --include="*.md" CLAUDE.md README.md README.ru.md local-claude-codex-mailbox-workflow.md workflow-*.md 2>/dev/null
echo "--scan done"

# V9
git status --short
```

Any FAIL → STOP + report §5.

### Phase 2 — user visual check `[awaits user]`

| # | Check | How |
|---|-------|-----|
| P2.1 | Dashboard поднимается | `cd dashboard && npm run dev`; открыть `http://127.0.0.1:9119/` |
| P2.2 | Секция «Активные сессии» видна, говорит «Нет активных сессий» | user observes |
| P2.3 | Секция «Незабранные сообщения» показывает current pending count из mailbox | user observes; должно совпадать с top-of-columns counts |
| P2.4 | POST /api/runtime/sessions создаёт session record | `curl -X POST -H "Content-Type: application/json" -d '{"session_id":"test-1","agent":"claude","project":"workflow","cwd":"/tmp"}' http://127.0.0.1:3003/api/runtime/sessions` → 201; через 3s refresh dashboard — session появляется в «Активные» |
| P2.5 | Session auto-expires по `last_seen > 60s` | user ждёт 60+s, не рефрешит session через POST → session пропадает из активных (но остаётся в полном state) |
| P2.6 | `mailbox-runtime/*.json` создаются и обновляются | user проверяет `ls mailbox-runtime/` → видит `sessions.json`, `pending-index.json`, `supervisor-health.json` |

### Phase 3 — `[awaits N-day]`

Не применимо для Phase A.

---

## §8 Acceptance criteria

- [ ] Phase 1 V1-V9 PASS
- [ ] Report template заполнен
- [ ] No files outside §5 whitelist modified
- [ ] Build size growth ≤10 kB (baseline 224.82 kB → max ~235 kB)
- [ ] No new personal data leaks (V8)
- [ ] `mailbox-runtime/` создаётся runtime и gitignored (V5)
- [ ] `dashboard/supervisor.mjs` — отдельный extractable module (Codex Q2 requirement)
- [ ] Supervisor logic НЕ размазан по server.js (server.js только mounts + lifecycle)
- [ ] Graceful shutdown работает (V7)
- [ ] Codex не коммитит и не пушит без explicit user command

---

## §9 Out of scope

- **Hooks integration**: SessionStart/Stop registration (Phase B separate handoff).
- **Delivery signals**: supervisor-generated delivery records, continuation prompts (Phase C).
- **Lease/claim**: multi-window protection (Phase D).
- **Project detection unification**: Q3 (Phase B/C).
- **CLI parity**: `scripts/mailbox.mjs runtime` subcommand — не нужен для visibility only.
- **Dashboard auth**: ТЗ §«UI / dashboard» подтверждает localhost-only — current state.
- **Tests / unit tests**: нет test harness'а — verification via empirical node -e + curl + user visual.
- **chokidar / fs.watch**: ТЗ explicit preference polling; не добавляем dep.
- **`scripts/mailbox-lib.mjs` API changes**: read-only use only.

---

## §10 Rollback

**До commit** — non-destructive:

1. `git diff --stat dashboard/supervisor.mjs dashboard/server.js dashboard/src/api.js dashboard/src/App.jsx .gitignore` — убедиться что нет unrelated changes.
2. `git stash push -m "supervisor-phase-a-rollback" -- dashboard/supervisor.mjs dashboard/server.js dashboard/src/api.js dashboard/src/App.jsx .gitignore`.
3. Смешанные changes в worktree → STOP + surface к user.
4. Delete `mailbox-runtime/` если создана (runtime only, gitignored): `rm -rf mailbox-runtime`.
5. `cd dashboard && npx vite build 2>&1 | tail -5` — baseline build clean.

**После commit**: `git revert <sha>`. `mailbox-runtime/` содержимое — это runtime, может быть удалено вручную если надо.

---

## §11 Discrepancy checkpoints (STOP conditions)

1. P2 baseline line count drift >5 lines на whitelist → STOP.
2. P3 atomic write empirical FAIL → STOP. Use `mailbox-runtime/tmp-*` fallback (обсудить с планировщиком).
3. P4 baseline build FAIL → STOP.
4. P5 existing routes conflict (прямое `/api/runtime` route предсуществует) → STOP.
5. Phase 1 V1-V9 any FAIL → STOP.
6. V7 graceful shutdown не работает → STOP; signal handlers не registered или `server.close()` висит.
7. V9 whitelist drift → STOP.
8. Any modification of `scripts/mailbox-lib.mjs` или `scripts/mailbox.mjs` во время execution → STOP (reference-only).
9. Новый `M` outside whitelist not в §0.4 baseline → STOP + surface to user.

---

## §12 Self-audit checklist

- [ ] 1: P1-P5 pre-flight OK
- [ ] 2: Change 1 (supervisor.mjs) created; `createSupervisor` exported
- [ ] 3: Change 2 (server.js) applied; import + mount + lifecycle
- [ ] 4: Change 3 (api.js) applied; `fetchRuntimeState` exported
- [ ] 5: Change 4 (App.jsx) applied; 6 substeps
- [ ] 6: Change 5 (.gitignore) applied
- [ ] 7: V1-V9 recorded verbatim
- [ ] 8: V9 whitelist drift clean
- [ ] 9: No commit/push performed
- [ ] 10: Discrepancies recorded
- [ ] 11: Report §0-§11 filled
- [ ] 12: Supervisor module Q2 requirement verified (logic fully inside supervisor.mjs, server.js only mounts)

≥10/12 OK → ready for user review.

---

## §13 Notes to Codex

- **Environment**: WSL, cwd=`/mnt/e/Project/workflow`. Baseline drift model: §4 P1 Expected.
- **Planning snapshot**: HEAD=`92231a4`. If drift from newer master commit touching whitelist files → STOP + Discrepancy.
- **Anti-fabrication**: все V1-V9 outputs verbatim. No summaries.
- **No new deps**: `dashboard/package.json` + lockfile — not in whitelist. If reviewer thinks dep нужна (e.g. for atomic FS op) — это STOP, обсуждение в mailbox.
- **Modular boundary (Q2)**: всю новую supervisor logic — в `dashboard/supervisor.mjs`. server.js — только import, mount, start/stop lifecycle.
- **No hooks**: Phase A visibility only. Если reviewer видит temptation добавить SessionStart hook — это Phase B, STOP + out-of-scope reply.

---

## §14 Commits strategy

**Single commit** preferred:

```
feat(dashboard): mailbox supervisor Phase A — visibility only

Core changes:
- dashboard/supervisor.mjs: extractable module (poll loop, runtime state, Express router factory)
- dashboard/server.js: import + mount /api/runtime + graceful SIGINT/SIGTERM shutdown
- dashboard/src/api.js: fetchRuntimeState wrapper
- dashboard/src/App.jsx: active-sessions + pending-index panel
- .gitignore: mailbox-runtime/

Phase A scope: visibility only. No hooks, no delivery signals, no lease/claim — these are Phase B/C/D separate handoffs.

Design agreed with Codex (thread mailbox-auto-pickup-supervisor-tz): Q1 runtime-state в mailbox-runtime/ gitignored; Q2 supervisor in dashboard backend but as extractable dashboard/supervisor.mjs module.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Push**: ждёт explicit user command `пуш`.


## Legacy Workflow Note (2026-04-21)

This file is preserved as a historical artifact from an earlier workflow revision.

It may mention legacy patterns such as `Claude planner / Codex executor`, user relay, `compact prompt`, or older handoff shapes.

Do not use it as the live operating template. Current contract: `docs/codex-system-prompt.md`, `AGENTS.md`, `workflow-role-distribution.md`, `workflow-instructions-claude.md`, and `workflow-instructions-codex.md`.
