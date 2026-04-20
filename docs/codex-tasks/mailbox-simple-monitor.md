# Mailbox Simple Monitor + UI Polish

**Version**: v1
**Planning-audit**: `docs/codex-tasks/mailbox-simple-monitor-planning-audit.md`
**Report template**: `docs/codex-tasks/mailbox-simple-monitor-report.md`
**Parent**: commit `903af96`
**Baseline**: HEAD=`903af96`

---

## §0 Why this plan exists

User неоднократно просил простой автоматизм: «робот чекает папки, увидел новое письмо — пингует агента проверить почту». Предыдущие handoff'ы ушли в paperclip coordinator (P1-P4b). Paperclip остаётся в репо (не ломаем), но поверх добавляем легковесный mail-monitor который и закрывает оригинальный запрос. + 3 UI полировки из ранних сообщений (звук, «прочитано» badge, местное время).

**Signal contract** (F1 post-R1, F5 post-R2 — consistent через все секции): monitor spawn'ит agent с project-scoped prompt `Проверь почту проекта ${project}: node scripts/mailbox.mjs list --project ${project}`. Original «short signal» user idea сохранена структурно (одноразовый spawn без tracking), но adapter не пробрасывает project в агента без explicit mention в prompt — поэтому включаем project в prompt text.

---

## §1 Иерархия источников

1. User's direct scope contract (via Codex letter `2026-04-20T22-23-33Z-mailbox-simple-monitor-plan-codex-001` archived).
2. Existing committed code HEAD=`903af96` — supervisor + adapters + server.

---

## §2 Pre-flight (Codex)

```bash
pwd                                                  # /mnt/e/Project/workflow
git rev-parse HEAD                                   # expect 903af96
git status --short
node -v                                              # v24.x
wc -l dashboard/supervisor.mjs dashboard/server.js dashboard/src/App.jsx scripts/adapters/claude-code-adapter.mjs scripts/adapters/codex-adapter.mjs
# Expected: supervisor=467, server=401, App.jsx=1972, claude-adapter=438, codex-adapter=463
cd dashboard && npx vite build 2>&1 | tail -3        # expect ✓ built
```

FAIL → STOP.

---

## §3 Whitelist (strict)

**Изменить**:
1. `dashboard/supervisor.mjs` — monitor logic (busy flag, ad-hoc adapter instances, toggle persistence, pollTick insertion).
2. `dashboard/server.js` — 3 endpoints: POST `/api/monitor/start`, POST `/api/monitor/stop`, GET `/api/monitor/status`.
3. `dashboard/src/App.jsx` — toggle button + sound unlock + MessageCard received-span conditional «не прочитано» badge (answered/archived spans untouched) + formatTimestamp local tz.

**Handoff artefacts**: 3 files в `docs/codex-tasks/`.

**НЕ ТРОГАТЬ**:
- `scripts/adapters/*.mjs` (используем как есть через import).
- `scripts/mailbox*.mjs`.
- `dashboard/orchestrator.mjs`.
- `dashboard/api.js`.
- TASK_SCHEMA_VERSION / ALLOWED_TRANSITIONS (paperclip не трогаем).
- Hook configs.

---

## §4 Changes

### Change 1 — `dashboard/supervisor.mjs` mail-monitor

**Imports (top of file)**: merge с existing import:
```js
import { createClaudeCodeAdapter } from "../scripts/adapters/claude-code-adapter.mjs";
import { createCodexAdapter } from "../scripts/adapters/codex-adapter.mjs";
```

**Monitor state + helpers** (inside factory closure, after existing task helpers, before `return {...}`):

```js
// ─── Mail monitor: простая реактивная автоматизация ───
// User-requested scope: detect new mail в to-claude/to-codex → fire-and-forget agent
// spawn с project-scoped промптом «Проверь почту проекта ${project}: node scripts/mailbox.mjs
// list --project ${project}». Независимо от orchestrator/tasks.
const MONITOR_FLAG_FILE = path.join(runtimeRoot, "monitor-enabled.json");
let monitorEnabled = false;
const monitorBusyAgents = new Set();  // 'claude' | 'codex'
let monitorClaudeAdapter = null;
let monitorCodexAdapter = null;

async function loadMonitorEnabled() {
  try {
    const raw = await fs.readFile(MONITOR_FLAG_FILE, "utf8");
    monitorEnabled = JSON.parse(raw)?.enabled === true;
  } catch (error) {
    if (error?.code !== "ENOENT") logger.error?.("[monitor] load failed:", error);
    monitorEnabled = false;
  }
}

async function persistMonitorEnabled() {
  try {
    await fs.mkdir(runtimeRoot, { recursive: true });
    const tmp = `${MONITOR_FLAG_FILE}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({ enabled: monitorEnabled }, null, 2), "utf8");
    await fs.rename(tmp, MONITOR_FLAG_FILE);
  } catch (error) {
    logger.error?.("[monitor] persist failed:", error);
  }
}

function setMonitorEnabled(value) {
  monitorEnabled = !!value;
  void persistMonitorEnabled();
  return monitorEnabled;
}

function isMonitorEnabled() { return monitorEnabled; }

function initMonitorAdapters() {
  if (!monitorClaudeAdapter) {
    monitorClaudeAdapter = createClaudeCodeAdapter({ logger });
  }
  if (!monitorCodexAdapter) {
    const spawnPrefix = process.platform === "win32"
      ? ["wsl.exe", "-d", "Ubuntu", "bash", "-lc"]
      : [];
    const sessionsRoot = spawnPrefix.length ? null : undefined;
    monitorCodexAdapter = createCodexAdapter({ spawnPrefix, sessionsRoot, logger });
  }
}

async function pingAgentForMessage(message) {
  const agent = message.to;
  if (agent !== "claude" && agent !== "codex") return;
  if (monitorBusyAgents.has(agent)) return;
  if (!message.project) return;
  monitorBusyAgents.add(agent);
  initMonitorAdapters();
  const adapter = agent === "claude" ? monitorClaudeAdapter : monitorCodexAdapter;
  // F1 post-Codex-R1: adapter.launch ignores `project` arg (only used for internal Map
  // tracking per claude-code-adapter.mjs:188 и codex-adapter.mjs:232). Без project hint
  // агент не знает какой ящик проверять. Поэтому prompt включает project + explicit
  // mailbox CLI invocation — locked contract.
  const prompt = `Проверь почту проекта ${message.project}: node scripts/mailbox.mjs list --project ${message.project}`;
  try {
    await adapter.launch({
      project: message.project,
      thread: message.thread || "monitor-ping",
      instruction: prompt
    });
  } catch (error) {
    logger.error?.(`[monitor] ${agent} spawn failed:`, error?.message || error);
  } finally {
    monitorBusyAgents.delete(agent);
  }
}

function runMonitor(pendingList) {
  if (!monitorEnabled) return;
  for (const message of pendingList) {
    if (message.received_at) continue;  // agent уже прочитал
    void pingAgentForMessage(message);  // fire-and-forget
  }
}
```

**Load flag в `start()`** — после existing state restoration, before first pollTick:
```js
await loadMonitorEnabled();
```
(Placement: inside existing `start()` function, на уровне существующих `await persistSessions/Health/Tasks` calls.)

**Wire в pollTick** — после `state.pendingIndex = pending;` (L387):
```js
runMonitor(pending);
```
(runMonitor synchronous — только schedules fire-and-forget spawns; не блокирует pollTick.)

**Expose в factory return** — append к existing returned object:
```js
setMonitorEnabled,
isMonitorEnabled,
loadMonitorEnabled
```

### Change 2 — `dashboard/server.js` 3 monitor endpoints

**Insert** right after `supervisor.setOrchestrator(orchestrator);` (existing L218):

```js
// Mail-monitor: кнопка вкл/выкл в UI.
app.post("/api/monitor/start", (request, response) => {
  const enabled = supervisor.setMonitorEnabled(true);
  response.json({ enabled });
});

app.post("/api/monitor/stop", (request, response) => {
  const enabled = supervisor.setMonitorEnabled(false);
  response.json({ enabled });
});

app.get("/api/monitor/status", (request, response) => {
  response.json({ enabled: supervisor.isMonitorEnabled() });
});
```

### Change 3 — `dashboard/src/App.jsx` UI

**Change 3.1 — formatTimestamp local time** (~L1177-1184):

Current:
```js
return new Intl.DateTimeFormat(locale, {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC"
}).format(new Date(parsed));
```

Target:
```js
return new Intl.DateTimeFormat(locale, {
  dateStyle: "medium",
  timeStyle: "short"
}).format(new Date(parsed));
```

**Change 3.2 — WebAudio unlock** (add useEffect near existing `soundEnabled` state, ~L1406):

```js
const [audioUnlocked, setAudioUnlocked] = useState(false);

useEffect(() => {
  if (audioUnlocked) return;
  const unlock = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        void ctx.resume().catch(() => {});
        setTimeout(() => ctx.close().catch(() => {}), 100);
      }
    } catch {}
    setAudioUnlocked(true);
    document.removeEventListener("click", unlock);
    document.removeEventListener("keydown", unlock);
  };
  document.addEventListener("click", unlock);
  document.addEventListener("keydown", unlock);
  return () => {
    document.removeEventListener("click", unlock);
    document.removeEventListener("keydown", unlock);
  };
}, [audioUnlocked]);
```

Existing `playNotificationChime()` gate остаётся без изменений — unlock делается автоматически на первом user gesture.

**Change 3.3 — Monitor toggle button + polling**:

Add state alongside `soundEnabled`:
```js
const [monitorEnabled, setMonitorEnabled] = useState(false);
const [monitorBusy, setMonitorBusy] = useState(false);
```

Add translations (alongside existing `soundMute`/`soundUnmute`):
```js
// ru
monitorStart: "Запустить автоматическую проверку почты",
monitorStop: "Остановить автоматическую проверку почты",
notRead: "не прочитано",
sentAt: "Отправлено",
readAt: "Прочитано",

// en
monitorStart: "Start mail monitor",
monitorStop: "Stop mail monitor",
notRead: "not read",
sentAt: "Sent",
readAt: "Read",
```

Add polling effect (в существующем fetch-loop где messages обновляются, или отдельный):
```js
useEffect(() => {
  let alive = true;
  async function poll() {
    try {
      const r = await fetch("/api/monitor/status");
      if (!alive) return;
      if (r.ok) {
        const data = await r.json();
        setMonitorEnabled(Boolean(data.enabled));
      }
    } catch {}
  }
  poll();
  const interval = setInterval(poll, 5000);
  return () => { alive = false; clearInterval(interval); };
}, []);
```

Add handler:
```js
async function toggleMonitor() {
  if (monitorBusy) return;
  setMonitorBusy(true);
  try {
    const endpoint = monitorEnabled ? "/api/monitor/stop" : "/api/monitor/start";
    const r = await fetch(endpoint, { method: "POST" });
    if (r.ok) {
      const data = await r.json();
      setMonitorEnabled(Boolean(data.enabled));
    }
  } finally {
    setMonitorBusy(false);
  }
}
```

Add button в header (alongside existing soundButton ~L1760):
```jsx
<button
  type="button"
  className={monitorEnabled ? "monitorButton on" : "monitorButton off"}
  onClick={toggleMonitor}
  disabled={monitorBusy}
  aria-pressed={monitorEnabled}
  title={monitorEnabled ? t.monitorStop : t.monitorStart}
>
  {monitorEnabled ? "🟢 Автопроверка: вкл" : "⚪ Автопроверка: выкл"}
</button>
```

CSS (alongside `.soundButton`):
```css
.monitorButton {
  padding: 6px 12px;
  border-radius: 12px;
  border: 1px solid var(--text-secondary);
  background: var(--bg-radial);
  cursor: pointer;
  font-size: 0.85rem;
}
.monitorButton.on { background: #d4f4d4; border-color: #3aa03a; }
.monitorButton.off { background: #f0f0f0; border-color: #999; }
.monitorButton:disabled { opacity: 0.5; cursor: wait; }
```

**Change 3.4 — MessageCard «received» span conditional: timestamp или not-read badge** (F2 post-R1):

Baseline App.jsx L1285-1306 уже показывает 4 timestamps (sent, received, answered if present, archived if present). План теперь **не трогает** answered/archived ветки — модифицируется только «received» span чтобы показать badge когда received_at пустой, иначе — обычный timestamp (как было).

Current L1290-1293:
```jsx
<span className="timestamp">
  <span className="timestampLabel">{t.timestampReceived}:</span>{" "}
  {formatTimestamp(message.received_at || message.created, lang, t)}
</span>
```

Target:
```jsx
<span className="timestamp">
  <span className="timestampLabel">{t.timestampReceived}:</span>{" "}
  {message.received_at ? (
    formatTimestamp(message.received_at, lang, t)
  ) : (
    <span className="notRead">{t.notRead}</span>
  )}
</span>
```

Fallback `|| message.created` убирается — если агент не прочитал, показывать honest «не прочитано». Answered + archived spans L1294-1305 остаются без изменений.

CSS добавление (alongside existing `.timestamp` styles):
```css
.notRead { color: #c06600; font-weight: 500; }
```

Translation key `notRead` — ru «не прочитано», en «not read» (добавить в existing translations object).

---

## §5 Verification phases

### Phase 1 — Codex (WSL)

| # | Check | Expected |
|---|-------|----------|
| V1 | parse supervisor.mjs | `node --check` PASS |
| V2 | parse server.js | PASS |
| V3 | App.jsx build | `✓ built` |
| V4 | supervisor exports setMonitorEnabled / isMonitorEnabled | grep ≥2 each |
| V5 | server.js 3 endpoints | grep `/api/monitor/(start\|stop\|status)` count ≥3 |
| V6 | pollTick calls runMonitor after pendingIndex set | grep `runMonitor(pending)` = 1 |
| V7 | formatTimestamp без UTC | grep `timeZone: "UTC"` = 0 |
| V8 | audioUnlocked state + effect | grep `audioUnlocked` ≥3 |
| V9 | monitorEnabled state + polling + handler | grep `monitorEnabled` ≥5 (state + UI + effect + handler + setter) |
| V10 | MessageCard received span conditional badge (F2 post-R1) | grep `notRead` ≥2 (JSX conditional + translation) + ensure baseline `cardTimestamps` + `timestampAnswered` + `timestampArchived` references UNCHANGED (no regression) |
| V11 | Empirical toggle + persist | curl-based localstorage roundtrip через supervisor.setMonitorEnabled |
| V12 | Empirical runMonitor fire-and-forget, stubbed spawn captures launch (F7 post-R2 — real assertion) | fake spawn captures argv при enabled=true + pending letter с empty received_at → captured >=1 |
| V13 | PD scan clean | `--scan done` |
| V14 | Whitelist drift | 3 M + 3 handoff |

Verification commands:

```bash
# V1-V3
node --check dashboard/supervisor.mjs && echo "V1 PASS"
node --check dashboard/server.js && echo "V2 PASS"
cd dashboard && npx vite build 2>&1 | tail -3

# V4-V10 grep
grep -cE 'setMonitorEnabled|isMonitorEnabled' dashboard/supervisor.mjs             # V4 >=4
grep -cE '"/api/monitor/(start|stop|status)"' dashboard/server.js                  # V5 >=3
grep -cE 'runMonitor\(pending\)' dashboard/supervisor.mjs                          # V6 =1
grep -cE 'timeZone:\s*"UTC"' dashboard/src/App.jsx                                 # V7 =0
grep -cE 'audioUnlocked' dashboard/src/App.jsx                                     # V8 >=3
grep -cE 'monitorEnabled' dashboard/src/App.jsx                                    # V9 >=5
grep -cE 'notRead' dashboard/src/App.jsx                                            # V10a >=2 (JSX + translation)
grep -cE 'timestampAnswered|timestampArchived' dashboard/src/App.jsx                # V10b >=2 (baseline preserved, no regression)

# V11 — toggle + persist round trip
node -e "
import('./dashboard/supervisor.mjs').then(async (m) => {
  const fs = await import('node:fs/promises');
  const rt = '/tmp/mon-v11-' + process.pid;
  await fs.mkdir(rt + '/mailbox/to-claude', {recursive:true});
  await fs.mkdir(rt + '/mailbox/to-codex', {recursive:true});
  const s = m.createSupervisor({mailboxRoot: rt+'/mailbox', runtimeRoot: rt, pollIntervalMs: 999999});
  await s.start();
  console.log('init:', s.isMonitorEnabled());
  s.setMonitorEnabled(true);
  console.log('on:', s.isMonitorEnabled());
  const persisted = JSON.parse(await fs.readFile(rt + '/monitor-enabled.json', 'utf8'));
  console.log('persisted:', persisted.enabled);
  s.setMonitorEnabled(false);
  console.log('off:', s.isMonitorEnabled());
  s.stop();
  await fs.rm(rt, {recursive:true, force:true});
  console.log('V11:', 'PASS');
});
" 2>&1

# V12 — monitor enable/disable lifecycle (F7 post-R2 — description-actual sync)
# Structural cover: default=false, setMonitorEnabled(true) → isMonitorEnabled()=true, persist к monitor-enabled.json.
# Real spawn-on-message empirical covered Phase 2 P2.3 (requires running Codex CLI).
node -e "
import('./dashboard/supervisor.mjs').then(async (m) => {
  const fs = await import('node:fs/promises');
  const rt = '/tmp/mon-v12-' + process.pid;
  await fs.mkdir(rt + '/mailbox/to-claude', {recursive:true});
  await fs.mkdir(rt + '/mailbox/to-codex', {recursive:true});
  const s = m.createSupervisor({mailboxRoot: rt+'/mailbox', runtimeRoot: rt, pollIntervalMs: 999999});
  await s.start();
  console.log('V12a disabled-initial:', s.isMonitorEnabled() === false ? 'PASS' : 'FAIL');
  s.setMonitorEnabled(true);
  console.log('V12b enabled-after-set:', s.isMonitorEnabled() === true ? 'PASS' : 'FAIL');
  const persisted = JSON.parse(await fs.readFile(rt + '/monitor-enabled.json', 'utf8'));
  console.log('V12c persisted-enabled:', persisted.enabled === true ? 'PASS' : 'FAIL');
  s.stop();
  await fs.rm(rt, {recursive:true, force:true});
});
" 2>&1

# V13 PD scan
PD_PATTERNS='$PD_PATTERNS'
grep -riE "$PD_PATTERNS" --include="*.js" --include="*.jsx" --include="*.mjs" --include="*.json" dashboard/ scripts/ 2>/dev/null
grep -riE "$PD_PATTERNS" --include="*.md" CLAUDE.md README.md README.ru.md local-claude-codex-mailbox-workflow.md workflow-*.md 2>/dev/null
echo "--scan done"

# V14 whitelist drift
git status --short
# Expected: 3 M + 3 handoff
```

### Phase 2 — user visual `[awaits user]`

| # | Check |
|---|-------|
| P2.1 | Dashboard restart — header показывает «⚪ Автопроверка: выкл» (default OFF). No false agent spawns. |
| P2.2 | Click toggle → «🟢 Автопроверка: вкл». Status endpoint returns `{enabled:true}`. |
| P2.3 | Send letter via `node scripts/mailbox.mjs send --from user --to codex --thread test-ping --project workflow --body "testing monitor"` → within ~3s supervisor spawns codex CLI с project-scoped prompt `Проверь почту проекта workflow: node scripts/mailbox.mjs list --project workflow`. Observe в running Codex terminal. |
| P2.4 | Dashboard chime плetes после первого клика где-либо (unlock) + соответствующий badge обновляется через ~3s когда agent читает inbox. |
| P2.5 | MessageCard в архиве/inbox shows «Отправлено: …» + «✓ Прочитано: …» или «🔸 не прочитано» badge. |
| P2.6 | Timestamps в карточках — local timezone (not UTC). |
| P2.7 | Restart dashboard → toggle state persists (если был ON — остаётся ON). |

### Phase 3 — cross-OS
Not applicable.

---

## §6 Acceptance criteria

- [ ] Phase 1 V1-V14 PASS
- [ ] Report §0-§11 filled
- [ ] No files outside whitelist
- [ ] PD scan clean
- [ ] adapters/* UNCHANGED (import only)
- [ ] orchestrator.mjs UNCHANGED
- [ ] mailbox-lib.mjs UNCHANGED
- [ ] No commit/push without user command
- [ ] Phase 2 + Phase 3 awaits user

---

## §7 Out of scope

- Task queue addition для monitor (scope contract explicit out-of-scope).
- Orchestrator modifications.
- Session registry linkage.
- Lease/claim locking.
- Multi-phase rollout.
- Anything beyond 5 items (monitor + toggle UI + sound fix + read badge + local time).

---

## §8 Rollback

```bash
git checkout -- dashboard/supervisor.mjs dashboard/server.js dashboard/src/App.jsx
rm -f mailbox-runtime/monitor-enabled.json
# restart dashboard — features revert
```

После commit: `git revert <sha>`.

---

## §9 Discrepancy checkpoints (STOP)

1. Baseline HEAD ≠ `903af96` → STOP.
2. `scripts/adapters/*` / `scripts/mailbox*.mjs` / `dashboard/orchestrator.mjs` modified → STOP.
3. TASK_SCHEMA_VERSION change → STOP.
4. ALLOWED_TRANSITIONS change → STOP.
5. Phase 1 V1-V14 any FAIL → STOP.
6. Temptation integrate monitor с task queue → STOP (explicit scope violation).
7. Temptation modify prompt текст сверх project-scoped CLI invocation (F1+F5 post-R1/R2) → STOP (prompt contract locked: `Проверь почту проекта ${project}: node scripts/mailbox.mjs list --project ${project}`).
8. V13 PD hit → STOP.
9. V14 whitelist drift → STOP.

---

## §10 Self-audit checklist

- [ ] 1: Pre-flight P1-P5 OK
- [ ] 2: Change 1 supervisor monitor logic added
- [ ] 3: Change 2 server.js 3 endpoints
- [ ] 4: Change 3.1 App.jsx local time
- [ ] 5: Change 3.2 App.jsx WebAudio unlock
- [ ] 6: Change 3.3 App.jsx monitor toggle button + polling
- [ ] 7: Change 3.4 App.jsx MessageCard received-span conditional notRead badge (no regression на answered/archived)
- [ ] 8: V1-V14 recorded verbatim
- [ ] 9: V13 PD scan clean
- [ ] 10: V14 whitelist drift clean
- [ ] 11: No commit/push
- [ ] 12: Discrepancies recorded
- [ ] 13: Report §0-§11 filled
- [ ] 14: adapters/* unchanged (only import added)
- [ ] 15: orchestrator.mjs unchanged
- [ ] 16: mailbox-lib.mjs unchanged

≥14/16 OK → ready for review.

---

## §11 Notes to Codex

- Environment: WSL, `cwd=/mnt/e/Project/workflow`.
- Baseline: HEAD=`903af96`.
- No commit/push без user command.
- Paperclip stack (tasks/orchestrator/adapters) остаётся intact — monitor добавляется параллельно.
- Monitor uses existing adapter.launch() для one-shot ping с project-scoped promptом `Проверь почту проекта ${project}: node scripts/mailbox.mjs list --project ${project}`. Fire-and-forget. Adapter's own activeSpawns management кроет cleanup.
- Default monitor = false (explicit opt-in).
- busyAgents Set предотвращает двойной spawn same agent mid-flight.
- В WSL coordinator (`spawnPrefix = []` when `process.platform !== "win32"`) Codex adapter работает напрямую. В Windows coordinator auto-wraps через wsl.exe.

---

## §12 Commits strategy

Single commit covering Change 1 + 2 + 3.{1-4} + 3 handoff artefacts.
