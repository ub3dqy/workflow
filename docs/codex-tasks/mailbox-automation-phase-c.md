# Mailbox Automation Phase C — Execution Plan (delivery signal via Stop hook)

**Version**: v1
**Planning-audit**: `docs/codex-tasks/mailbox-automation-phase-c-planning-audit.md`
**Report template**: `docs/codex-tasks/mailbox-automation-phase-c-report.md`
**Phase A parent**: commit `2927af7`
**Phase B parent**: commit `f2e76ee`
**Target executor**: Codex (WSL, с Windows parity)
**Planner**: Claude (Windows)
**Scope**: Phase C per ТЗ — delivery signal. Supervisor computes pending-per-session, Stop hook injects «Есть новое письмо ...» в transcript. No auto-read, no claim, no lease.

---

## §0 Compat rails inheritance

Phase A + Phase B rails остаются в силе. Phase C:

- Rail #3 **(content-level)** Agent delivery filter: GET /deliveries returns pendingIndex entries where `(to === session.agent && project === session.project)`. Содержимое response никогда не содержит cross-project rows.
- Rail #4 ✅ Thin layer: Stop hook только GET + stdout JSON. Никакого auto-read / spawn.
- Rail #5 ✅ Claude hooks в качестве signal transport.
- Rail #8 ✅ No UserPromptSubmit.
- Rail #9 **(agent-path + accidental-mismatch protection)**. Путь под `/api/agent/*` + mandatory `project` query param + server-side `session.project === query.project` validation. **Honest scope**: это protection от **accidental mismatch** (hook с неправильным `--project` flag в чужом repo's settings.local.json). Это **НЕ security boundary** против foreign-session discovery через global `/api/runtime/state` — в single-user localhost trust model `/state` показывает ВСЕ sessions (rail #2 dashboard requirement), так что attacker с localhost доступом может прочитать pair `{session_id, project}` и legit вызвать `/deliveries` по ним. Single-user localhost trust = design assumption, не flaw; real multi-user hardening — Phase D или later.
- Rail #10 ✅ Codex Windows native degraded — Phase A §9.3 actionable (manual curl).

---

## §1 Why this plan exists

Phase A и B дают visibility (dashboard) + session registration. Но agent сам не узнаёт о pending mail между turn'ами без manual `check mail`. Phase C закрывает automation loop:

- Supervisor matches active session(agent, project) ↔ pendingIndex(to, project).
- На Stop (end-of-turn) hook query'ит supervisor — «есть ли для меня письма?».
- Если да → transcript injection «Есть новое письмо по project X. Проверь почту.» → agent на следующем turn'е инициирует обычный mailbox workflow.

**НЕ делаем:**
- Auto-read (agent сам решает, когда читать).
- Auto-reply.
- Claim tracking (Phase D).
- Mutation mailbox state (never).

---

## §2 Hierarchy of sources of truth

1. Claude Code hooks docs (Stop schema) — planning-audit §4.
2. Live code post-`f2e76ee` — supervisor + session-register patterns.
3. ТЗ `mailbox-auto-pickup-supervisor-tz.md` §Phase C.
4. 10 compat rails.
5. This plan — derived.
6. Discrepancy → STOP + report §5.

---

## §3 Doc verification

### §V1 — Stop hook stdout JSON

Per Claude Code hooks docs (cached Phase B R1):

```json
{
  "hookSpecificOutput": {
    "hookEventName": "Stop",
    "additionalContext": "Есть новое письмо по project X. Проверь почту."
  }
}
```

Exit 0 + JSON на stdout → Claude Code appends `additionalContext` в transcript.

### §V2 — Stop hook does NOT block

Omit `decision` field → stop action allowed (default). Phase C НЕ блокирует agent completion.

### §V3 — Supervisor state access

`supervisor.state.sessions` и `supervisor.state.pendingIndex` — internal. Expose через router handler как new read-only endpoint `/deliveries`.

### §V4 — Node 18+ `fetch()`

Reused from Phase B. Global fetch для GET localhost endpoint.

---

## §4 Pre-flight verification

### P1 — environment baseline

```bash
node --version
git rev-parse --short HEAD
git status --short
```

**Expected**: Node ≥20.19, HEAD=`f2e76ee` или newer. Baseline drift model per Phase A §4 P1.

### P2 — baseline line counts

```bash
wc -l dashboard/supervisor.mjs dashboard/server.js scripts/mailbox-session-register.mjs .claude/settings.local.json local-claude-codex-mailbox-workflow.md
```

Expected (post-`f2e76ee`):

| File | Lines |
|------|-------|
| `dashboard/supervisor.mjs` | 206 |
| `dashboard/server.js` | 249 |
| `scripts/mailbox-session-register.mjs` | 135 |
| `.claude/settings.local.json` | 32 |
| `local-claude-codex-mailbox-workflow.md` | 864 |

Drift >5 lines на whitelist file → STOP.

### P3 — Phase B endpoint liveness

```bash
TMPV7_PORT=$(ss -ltn 2>/dev/null | awk '{print $4}' | grep -c ':3003$')
if [ "$TMPV7_PORT" = "0" ]; then
  echo "P3 INFO: dashboard not running — запустить перед P3 или skip к V4 structural"
else
  STATE=$(curl -s http://127.0.0.1:3003/api/runtime/state)
  echo "$STATE" | node -e "
    const s = require('fs').readFileSync(0, 'utf8');
    const json = JSON.parse(s);
    console.log('sessions keys:', Array.isArray(json.sessions) ? 'array' : typeof json.sessions);
    console.log('pendingIndex keys:', Array.isArray(json.pendingIndex) ? 'array' : typeof json.pendingIndex);
  "
fi
```

**Expected если dashboard running**: `sessions keys: array` + `pendingIndex keys: array`. FAIL → Phase A/B regression.

### P4 — baseline build

```bash
cd dashboard && npx vite build 2>&1 | tail -5
```

Expected: `✓ built`. FAIL → repair (wiki wsl-windows-native-binding-drift).

### P5 — existing routes sanity

```bash
grep -n "router.get\|router.post\|router.delete" dashboard/supervisor.mjs
```

Expected: GET `/state`, POST `/sessions`, DELETE `/sessions/:id`. New GET `/deliveries` — prefix unique, не конфликтует.

---

## §5 Whitelist — only these files may be created/modified

| File | Purpose | Status |
|------|---------|--------|
| `dashboard/server.js` | Hoist `const supervisor = createSupervisor(...)` выше `agentRouter` definition + add `agentRouter.get("/runtime/deliveries", ...)` handler (mandatory `session_id` + `project` query params, validates session.project === query.project, scoped filter) | modify |
| `scripts/mailbox-stop-delivery.mjs` | **NEW** — Stop hook: reads `--project` CLI flag + stdin session_id, GET `/api/agent/runtime/deliveries?session_id=X&project=Y`, stdout JSON additionalContext injection if non-empty | create |
| `.claude/settings.local.json` | +2nd entry в Stop block — `stop-delivery.mjs --project workflow` | modify |
| `local-claude-codex-mailbox-workflow.md` | +«Phase C: Delivery signals» section после Phase B section | modify |

**НЕ ТРОГАТЬ**:
- `dashboard/supervisor.mjs` (read-only access via `supervisor.state`, handler живёт в agentRouter)
- `dashboard/src/**` (no frontend changes)
- `dashboard/package.json`, lockfile (no new deps)
- `scripts/mailbox-session-register.mjs`, `scripts/mailbox-status.mjs`, `scripts/mailbox-lib.mjs`, `scripts/mailbox.mjs` (read-only reference)
- `.gitignore`, `CLAUDE.md`, README files
- `agent-mailbox/**`, `mailbox-runtime/**`
- `docs/codex-tasks/*` кроме этой handoff-тройки
- `.github/workflows/ci.yml`

---

## §6 Changes

### Change 1 — `dashboard/server.js` — add `agentRouter.get("/runtime/deliveries", ...)` handler

**Post-F1 fix (Codex R1 blocker) + F3 honest weakening (R2)**: endpoint переехал с `/api/runtime/deliveries` (global supervisor router) на `/api/agent/runtime/deliveries` (existing agentRouter). Требует mandatory `project` query param + validation `session.project === query.project`. **Honest scope**: это protects от accidental mismatch (hook с неправильным `--project` flag в чужом repo's settings); НЕ protects от foreign-session discovery — global `/api/runtime/state` exposes все `{session_id, project}` pairs (rail #2 dashboard UI), так что legit attacker может pair'ить чужую session и вызвать /deliveries с корректным project. Single-user localhost trust model = design assumption.

**Current** server.js structure (post-`f2e76ee`, approximate):

```js
const agentRouter = express.Router();
agentRouter.use(...);
agentRouter.get("/messages", ...);
app.use("/api/agent", agentRouter);

const supervisor = createSupervisor({...});
app.use("/api/runtime", supervisor.router);
```

**Target — Sub-change 1a**: hoist `const supervisor = createSupervisor({...})` **до** блока `const agentRouter = express.Router()`. Это гарантирует, что `supervisor.state` доступен в scope когда agentRouter handlers определяются.

**Target — Sub-change 1b**: добавить handler внутри agentRouter block (после existing `agentRouter.get("/messages", ...)`):

```js
agentRouter.get("/runtime/deliveries", (request, response) => {
  const sessionId = typeof request.query.session_id === "string"
    ? request.query.session_id.trim()
    : "";
  const project = typeof request.query.project === "string"
    ? request.query.project.trim()
    : "";

  if (!sessionId) {
    response.status(400).json({ error: "session_id query param required" });
    return;
  }
  if (!project) {
    response.status(400).json({ error: "project query param required (agent-path)" });
    return;
  }

  const session = supervisor.state.sessions.get(sessionId);
  if (!session) {
    response.status(404).json({ error: "session not found" });
    return;
  }

  if (session.project !== project) {
    response.status(403).json({ error: "project scope mismatch for session" });
    return;
  }

  const SESSION_STALE_MS = 60_000;
  const isActive = Date.now() - Date.parse(session.last_seen) <= SESSION_STALE_MS;
  if (!isActive) {
    response.setHeader("Cache-Control", "no-store");
    response.json({ deliveries: [], session_expired: true });
    return;
  }

  const deliveries = supervisor.state.pendingIndex.filter(
    (item) => item.deliverable === true
      && item.to === session.agent
      && item.project === session.project
  );

  response.setHeader("Cache-Control", "no-store");
  response.json({
    deliveries,
    session: {
      session_id: session.session_id,
      agent: session.agent,
      project: session.project
    },
    session_expired: false
  });
});
```

**Rationale**:
- **Path under `/api/agent/*`** — consistent с spec L304 (agent-facing endpoints требуют mandatory project).
- **Mandatory `project` query param + server-side validation** `session.project === query.project`: защищает от **accidental mismatch** — hook script с `--project wrong-name` в чужом repo's settings.local.json получит 403, не случайно leaked chunk. **Honest limitation**: НЕ защищает от foreign-session discovery через `/api/runtime/state` (тот exposes все `{session_id, project}` pairs globally для dashboard rail #2). Single-user localhost = trust model, real auth — future hardening.
- **Strict filter** (rail #3): `to === agent && project === session.project && deliverable === true`.
- **`session_expired` short-circuit** — expired sessions get empty response.
- **Stateless** — fresh filter on each call (Phase C design).
- `SESSION_STALE_MS` duplicated local const (60_000ms) — supervisor.mjs экспортирует state only, не const; alternative: supervisor.mjs export SESSION_STALE_MS, but это scope creep — local duplication acceptable.
- Cache-Control: no-store.

**Mount order preserved**: `app.use("/api/agent", agentRouter)` и `app.use("/api/runtime", supervisor.router)` остаются; просто supervisor creation hoisted выше agentRouter definition.

### Change 2 — **NEW** `scripts/mailbox-stop-delivery.mjs`

Создать новый файл. Hook script: read `--project` CLI flag + stdin session_id → GET `/api/agent/runtime/deliveries?session_id=X&project=Y` → stdout JSON injection if any.

**Post-F1 fix**: script requires `--project` CLI flag (per-repo opt-in, analog к session-register.mjs). Missing flag → silent exit 0.

```js
const SUPERVISOR_ENDPOINT = "http://127.0.0.1:3003/api/agent/runtime/deliveries";
const GET_TIMEOUT_MS = 3000;

function logError(error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[mailbox-stop-delivery] ${message}\n`);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
  }
  return chunks.join("").trim();
}

function normalizeProject(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function parseProjectArg(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--project" && typeof argv[i + 1] === "string") {
      return normalizeProject(argv[i + 1]);
    }
    if (typeof arg === "string" && arg.startsWith("--project=")) {
      return normalizeProject(arg.slice("--project=".length));
    }
  }
  return "";
}

async function getWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal
    });
    if (!response.ok) {
      return { ok: false, status: response.status, data: null };
    }
    const data = await response.json();
    return { ok: true, status: response.status, data };
  } finally {
    clearTimeout(timer);
  }
}

function buildSummary(deliveries, project) {
  if (!Array.isArray(deliveries) || deliveries.length === 0) {
    return "";
  }
  const count = deliveries.length;
  const plural = count === 1 ? "письмо" : count < 5 ? "письма" : "писем";
  const threadPreview = deliveries
    .slice(0, 3)
    .map((item) => `[${item.thread}] from ${item.from}`)
    .join(", ");
  const suffix = count > 3 ? ` (всего ${count})` : "";
  return `Есть ${count} ${plural} по project ${project}: ${threadPreview}${suffix}. Проверь почту.`;
}

async function main() {
  const project = parseProjectArg(process.argv.slice(2));
  if (!project) {
    // No --project flag → per-repo opt-in not enabled. Silent exit.
    process.exit(0);
  }

  const raw = await readStdin();
  if (!raw) {
    process.exit(0);
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const sessionId = typeof payload.session_id === "string" ? payload.session_id.trim() : "";
  if (!sessionId) {
    process.exit(0);
  }

  const url = `${SUPERVISOR_ENDPOINT}?session_id=${encodeURIComponent(sessionId)}&project=${encodeURIComponent(project)}`;

  let result;
  try {
    result = await getWithTimeout(url, GET_TIMEOUT_MS);
  } catch (error) {
    logError(`GET /deliveries failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(0);
  }

  if (!result.ok || !result.data) {
    // 400 (missing params) / 404 (session missing) / 403 (project mismatch) / server error — silent.
    process.exit(0);
  }

  if (result.data.session_expired === true) {
    process.exit(0);
  }

  const deliveries = Array.isArray(result.data.deliveries) ? result.data.deliveries : [];
  if (deliveries.length === 0) {
    process.exit(0);
  }

  const summary = buildSummary(deliveries, project);
  if (!summary) {
    process.exit(0);
  }

  const output = {
    hookSpecificOutput: {
      hookEventName: "Stop",
      additionalContext: summary
    }
  };

  process.stdout.write(JSON.stringify(output));
  process.exit(0);
}

try {
  await main();
} catch (error) {
  logError(error);
  process.exit(0);
}
```

**Rationale**:
- **`--project` CLI flag per-repo opt-in** (analog к session-register.mjs). Missing → silent exit; per-repo settings.local.json opt-in.
- Reads session_id from stdin (Stop hook payload).
- URL builds both `session_id` + `project` query params — mandatory per Change 1 validation.
- **Fail-safe**: 400/404/403/network/empty → silent exit 0. Agent session не ломается.
- `session_expired` branch → no injection.
- Summary in ru с preview 3 thread names + count suffix.
- stdout JSON per docs → transcript injection.

### Change 3 — `.claude/settings.local.json`

**Current** (32 lines post-`f2e76ee`):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {"type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/scripts/mailbox-status.mjs\"", "timeout": 3},
          {"type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/scripts/mailbox-session-register.mjs\" --project workflow", "timeout": 5}
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {"type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/scripts/mailbox-session-register.mjs\" --project workflow", "timeout": 5}
        ]
      }
    ]
  }
}
```

(formatted для compactness; actual file uses multi-line per entry).

**Target** — add 2nd entry в Stop block pointing to stop-delivery.mjs с `--project workflow`:

```json
"Stop": [
  {
    "hooks": [
      {"type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/scripts/mailbox-session-register.mjs\" --project workflow", "timeout": 5},
      {"type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/scripts/mailbox-stop-delivery.mjs\" --project workflow", "timeout": 5}
    ]
  }
]
```

**Rationale**:
- Stop block now has 2 entries fire sequentially per docs:
  1. `session-register.mjs --project workflow` — heartbeat refresh (Phase B).
  2. `stop-delivery.mjs --project workflow` — delivery check (Phase C).
- **Order matters**: heartbeat first, чтобы delivery GET видел fresh session. Stateless filter server-side means order не strictly critical для результата, но logically heartbeat ≺ delivery check.
- **`stop-delivery.mjs` принимает `--project workflow` flag** (post-F1) — per-repo opt-in consistent с session-register. Script uses flag для build URL с `?project=workflow` query param. Server validates match против stored session.project.

### Change 4 — `local-claude-codex-mailbox-workflow.md`

Найти существующую «### Phase B — Session lifecycle hooks (Claude)» section (рядом с L344 post-`f2e76ee`). **Вставить после неё**:

```markdown

### Phase C — Delivery signals (Claude)

Supervisor matches active sessions ↔ pending mail и сигнализирует агенту при Stop:

- **`GET /api/agent/runtime/deliveries?session_id=X&project=Y`** — agent-path endpoint (consistent spec L304 mandatory-project rule). Validates: (a) both query params required (400); (b) session exists в supervisor state (404); (c) `session.project === query.project` (403 — protection against accidental `--project` flag mismatch в hook config; **НЕ** защита от foreign-session discovery через global `/api/runtime/state` — single-user localhost trust model); (d) session active по TTL. Возвращает pendingIndex entries где `to === session.agent && project === session.project && deliverable === true`. Expired session → empty array + `session_expired: true`. **No mutation** — stateless read.

  **Trust model**: dashboard runs localhost-only (127.0.0.1:3003). `/api/runtime/state` globally exposes все active sessions (rail #2 single-dashboard requirement). Agent isolation = **logical separation** (hook script configured с explicit --project flag per repo) + **content-level scope** в response (deliveries filter by session.agent+project). Real multi-user/adversarial hardening (auth, per-session tokens) — future work beyond Phase C/D.
- **Stop hook `mailbox-stop-delivery.mjs --project <repo>`** — на end-of-turn читает stdin session_id + CLI `--project` flag (per-repo opt-in), GET `/api/agent/runtime/deliveries` с обоими params. Если non-empty → stdout JSON `hookSpecificOutput.additionalContext` с текстом «Есть N писем по project X: [thread] from codex, ... Проверь почту.». Текст injected в transcript, agent на next turn инициирует `check mail` workflow.
- **No auto-execution**: hook только signals — agent сам decides что и когда читать.
- **Silent fail**: supervisor down / 400 / 403 / 404 / empty → Stop hook exits 0 без injection. Agent session нормально completes.

**Scope boundaries** (rail #4):
- Phase C = signal only. No claim, no lease, no expiration tracking → все это Phase D.
- Same delivery виден agent'у каждый Stop, пока message не archived/received. Дедупликация — Phase D.
- Multi-window: если two Claude Code окна открыты по одному project, оба увидят тот же delivery. Acceptable — signal не действие. Phase D lease prevents double-claim.

**Codex hooks**:
- Linux/WSL: reuse `/deliveries` endpoint — agent-agnostic. Отдельный script + config когда Codex hooks ship Linux support.
- Windows native Codex: degraded (rail #7). Может вручную curl GET `/api/runtime/deliveries?session_id=<id>` для same data.
```

---

## §7 Verification phases

### Phase 1 — Codex-only (WSL execution)

**Mandatory order**: Change 1 (supervisor endpoint) first — иначе Change 2 script'у нечего call'ить в тестах. Затем Change 2 (script) → Change 3 (settings) → Change 4 (spec).

| # | Check | Expected |
|---|-------|----------|
| V1 | stop-delivery.mjs parses | no syntax error |
| V2 | Script exits 0 на empty stdin | exit 0 |
| V3 | Script exits 0 на malformed JSON | exit 0 |
| V4 | server.js has agentRouter.get("/runtime/deliveries") handler | grep ≥1 |
| V5 | Stop block has 2 entries in settings.local.json (both с `--project workflow`) | structure check |
| V6 | Spec section «Phase C: Delivery signals» present | grep = 1 |
| V7 | Empirical: /api/agent/runtime/deliveries behavior | 6 sub-probes PASS |
| V8 | Empirical: stop-delivery end-to-end с deterministic fixture (8a no-flag silent + 8b happy-path injection verified) | both PASS (V8b requires valid injection JSON, not PASS-noop) |
| V9 | Personal data scan | `--scan done` |
| V10 | Whitelist drift | только 2 M + 1 new + 3 handoff artefacts |

Verification commands:

```bash
# V1
node --check scripts/mailbox-stop-delivery.mjs && echo "V1 PASS"
# Expected: V1 PASS

# V2
echo -n "" | node scripts/mailbox-stop-delivery.mjs
echo "V2 exit: $?"
# Expected: V2 exit: 0

# V3
echo -n "not json" | node scripts/mailbox-stop-delivery.mjs
echo "V3 exit: $?"
# Expected: V3 exit: 0

# V4
grep -cE 'agentRouter\.get\("/runtime/deliveries"' dashboard/server.js
# Expected: 1

# V5 — settings.local.json Stop block entries + --project flag check
node -e "
const config = JSON.parse(require('fs').readFileSync('.claude/settings.local.json', 'utf8'));
const stopEntries = config.hooks.Stop[0].hooks.length;
console.log('Stop entries:', stopEntries);
const stopDeliveryEntry = config.hooks.Stop[0].hooks.find((h) => h.command.includes('mailbox-stop-delivery'));
console.log('has stop-delivery:', !!stopDeliveryEntry);
console.log('stop-delivery --project present:', stopDeliveryEntry ? /--project\s+workflow/.test(stopDeliveryEntry.command) : false);
"
# Expected: Stop entries: 2, has stop-delivery: true, stop-delivery --project present: true

# V6
grep -c 'Phase C: Delivery signals\|Phase C — Delivery signals' local-claude-codex-mailbox-workflow.md
# Expected: 1

# V7 — empirical /api/agent/runtime/deliveries endpoint (dashboard must be running)
TMPV7_PORT=$(ss -ltn 2>/dev/null | awk '{print $4}' | grep -c ':3003$')
if [ "$TMPV7_PORT" = "0" ]; then
  echo "V7 SKIP: dashboard not running — user runs V7 during Phase 2 visual check"
else
  TEST_SID="test-c-v7-$$"
  TEST_SID_OTHER="test-c-v7-other-$$"
  ENDPOINT="http://127.0.0.1:3003/api/agent/runtime/deliveries"

  # 7a — no session_id → 400
  STATUS_7A=$(curl -s -o /dev/null -w "%{http_code}" "$ENDPOINT?project=workflow")
  if [ "$STATUS_7A" = "400" ]; then
    echo "V7a PASS: missing session_id → 400"
  else
    echo "V7a FAIL: expected 400, got $STATUS_7A"
  fi

  # 7b — no project → 400
  STATUS_7B=$(curl -s -o /dev/null -w "%{http_code}" "$ENDPOINT?session_id=nonexistent-$$")
  if [ "$STATUS_7B" = "400" ]; then
    echo "V7b PASS: missing project → 400"
  else
    echo "V7b FAIL: expected 400, got $STATUS_7B"
  fi

  # 7c — unknown session → 404
  STATUS_7C=$(curl -s -o /dev/null -w "%{http_code}" "$ENDPOINT?session_id=nonexistent-$$&project=workflow")
  if [ "$STATUS_7C" = "404" ]; then
    echo "V7c PASS: unknown session → 404"
  else
    echo "V7c FAIL: expected 404, got $STATUS_7C"
  fi

  # 7d — register workflow session, then query with mismatched project → 403 (accidental-mismatch protection)
  # Honest note: это protects only against accidental --project flag mismatch, не против foreign-session discovery через /state (see §0 rail #9).
  curl -s -X POST -H "Content-Type: application/json" -d "{\"session_id\":\"$TEST_SID\",\"agent\":\"claude\",\"project\":\"workflow\",\"cwd\":\"/tmp\",\"transport\":\"test\"}" http://127.0.0.1:3003/api/runtime/sessions >/dev/null
  STATUS_7D=$(curl -s -o /dev/null -w "%{http_code}" "$ENDPOINT?session_id=$TEST_SID&project=other-project")
  if [ "$STATUS_7D" = "403" ]; then
    echo "V7d PASS: session.project != query.project → 403 (accidental mismatch caught)"
  else
    echo "V7d FAIL: expected 403, got $STATUS_7D"
  fi

  # 7e — legit fetch (project matches) → scoped result + no cross-project rows
  RESP_7E=$(curl -s "$ENDPOINT?session_id=$TEST_SID&project=workflow")
  CHECK_7E=$(echo "$RESP_7E" | node -e "
    const s = require('fs').readFileSync(0, 'utf8');
    const d = JSON.parse(s);
    const isArray = Array.isArray(d.deliveries);
    const hasSession = d.session && d.session.agent === 'claude' && d.session.project === 'workflow';
    const notExpired = d.session_expired === false;
    const leak = d.deliveries.some((x) => x.project !== 'workflow' || x.to !== 'claude');
    console.log('array:' + isArray + ',session:' + hasSession + ',active:' + notExpired + ',leak:' + leak);
  ")
  echo "V7e CHECK: $CHECK_7E"
  if echo "$CHECK_7E" | grep -q "array:true,session:true,active:true,leak:false"; then
    echo "V7e PASS: scoped + active + no cross-project leak"
  else
    echo "V7e FAIL: $CHECK_7E"
  fi

  # 7f — wait 61s for expire, query → session_expired=true (gated behind ENABLE_LONG=1)
  if [ "$ENABLE_LONG" = "1" ]; then
    sleep 62
    RESP_7F=$(curl -s "$ENDPOINT?session_id=$TEST_SID&project=workflow")
    EXPIRED=$(echo "$RESP_7F" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(d.session_expired);")
    if [ "$EXPIRED" = "true" ]; then
      echo "V7f PASS: session_expired=true after 62s"
    else
      echo "V7f FAIL: expected expired=true, got $EXPIRED"
    fi
  else
    echo "V7f SKIP: ENABLE_LONG=1 для 62s expire probe (defer к Phase 2 user visual)"
  fi

  # Cleanup
  curl -s -X DELETE "http://127.0.0.1:3003/api/runtime/sessions/$TEST_SID" >/dev/null
fi

# V8 — end-to-end: stop-delivery script with deterministic fixture для happy-path verification
# Post-F4: создаём deterministic pending message через mailbox.mjs send CLI (NOT programmatic file edit).
# Supervisor pollTick interval=3s, so sleep 4s для state update.
TMPV8_PORT=$(ss -ltn 2>/dev/null | awk '{print $4}' | grep -c ':3003$')
if [ "$TMPV8_PORT" = "0" ]; then
  echo "V8 SKIP: dashboard not running"
else
  TEST_SID="test-c-v8-$$"
  TEST_FIXTURE_THREAD="test-c-v8-fixture-$$"
  curl -s -X POST -H "Content-Type: application/json" -d "{\"session_id\":\"$TEST_SID\",\"agent\":\"claude\",\"project\":\"workflow\",\"cwd\":\"/tmp\",\"transport\":\"test\"}" http://127.0.0.1:3003/api/runtime/sessions >/dev/null
  STDIN_PAYLOAD="{\"session_id\":\"$TEST_SID\",\"cwd\":\"/tmp\",\"hook_event_name\":\"Stop\"}"

  # 8a — no --project flag → silent exit, no stdout
  STDOUT_8A=$(echo -n "$STDIN_PAYLOAD" | node scripts/mailbox-stop-delivery.mjs 2>/dev/null)
  EXIT_8A=$?
  if [ "$EXIT_8A" = "0" ] && [ -z "$STDOUT_8A" ]; then
    echo "V8a PASS: no --project → silent exit (exit 0, no stdout)"
  else
    echo "V8a FAIL: exit=$EXIT_8A stdout=$STDOUT_8A"
  fi

  # 8b — deterministic fixture happy-path: send message → wait poll → invoke script → verify injection JSON
  node scripts/mailbox.mjs send --project workflow --from codex --to claude --thread "$TEST_FIXTURE_THREAD" --body "Phase C V8b fixture body $$" >/dev/null
  sleep 4 # await supervisor pollTick (3s interval + margin)

  STDOUT_8B=$(echo -n "$STDIN_PAYLOAD" | node scripts/mailbox-stop-delivery.mjs --project workflow 2>/dev/null)
  EXIT_8B=$?
  if [ "$EXIT_8B" != "0" ]; then
    echo "V8b FAIL: exit $EXIT_8B (should be 0)"
  elif [ -z "$STDOUT_8B" ]; then
    echo "V8b FAIL: fixture sent + polled but stdout empty — supervisor pollTick или filter broken"
  else
    VALIDATE=$(echo "$STDOUT_8B" | node -e "
      const s = require('fs').readFileSync(0, 'utf8');
      const d = JSON.parse(s);
      const valid = d.hookSpecificOutput
        && d.hookSpecificOutput.hookEventName === 'Stop'
        && typeof d.hookSpecificOutput.additionalContext === 'string'
        && d.hookSpecificOutput.additionalContext.includes('workflow');
      console.log(valid ? 'valid' : 'invalid');
    ")
    if [ "$VALIDATE" = "valid" ]; then
      echo "V8b PASS: non-empty injection JSON с project=workflow reference"
    else
      echo "V8b FAIL: malformed injection JSON: $STDOUT_8B"
    fi
  fi

  # Cleanup: archive fixture message (не mutate runtime state — use public CLI)
  FIXTURE_PATH=$(find agent-mailbox/to-claude -name "*${TEST_FIXTURE_THREAD}*.md" -type f 2>/dev/null | head -1)
  if [ -n "$FIXTURE_PATH" ]; then
    REL_PATH=${FIXTURE_PATH#agent-mailbox/}
    node scripts/mailbox.mjs archive --path "$REL_PATH" --project workflow --resolution no-reply-needed >/dev/null 2>&1 || true
  fi

  curl -s -X DELETE "http://127.0.0.1:3003/api/runtime/sessions/$TEST_SID" >/dev/null
fi

# V9 — PD scan
PD_PATTERNS='$PD_PATTERNS'
grep -riE "$PD_PATTERNS" --include="*.js" --include="*.jsx" --include="*.mjs" --include="*.html" --include="*.json" dashboard/ scripts/ .claude/ 2>/dev/null
grep -riE "$PD_PATTERNS" --include="*.md" CLAUDE.md README.md README.ru.md local-claude-codex-mailbox-workflow.md 2>/dev/null
echo "--scan done"

# V10 — Whitelist drift
git status --short
# Expected: 2 M (server.js + settings.local.json) + 1 new ?? (stop-delivery.mjs) + M spec + 3 handoff artefacts
```

Any FAIL → STOP + report §5.

### Phase 2 — user visual `[awaits user]`

| # | Check |
|---|-------|
| P2.1 | Clean Claude Code restart в workflow dir → SessionStart + Stop hooks fire; supervisor видит session active |
| P2.2 | Имеется ≥1 pending mail `to: claude, project: workflow` (existing messages в inbox OK) |
| P2.3 | End-of-turn: Claude Code transcript содержит injection «Есть N писем по project workflow: ...» |
| P2.4 | Claude на next turn реагирует на hint (или ignored — оба OK; signal only, agent free to defer) |
| P2.5 | Dashboard down сценарий — restart Claude Code, end-of-turn → no hang, no error banner в transcript |

### Phase 3 — Cross-OS parity `[awaits user]`

| # | Check |
|---|-------|
| P3.1 | Windows native Claude Code: stop-delivery works (same behavior) |
| P3.2 | WSL Claude Code если применимо — platform check via session record |
| P3.3 | Codex Linux/WSL — out-of-scope (separate handoff когда Codex hooks ship) |
| P3.4 | Codex Windows native — degraded per Phase A §9.3 |

---

## §8 Acceptance criteria

- [ ] Phase 1 V1-V10 PASS
- [ ] Report template filled
- [ ] No files outside §5 whitelist
- [ ] PD scan clean (V9)
- [ ] `/deliveries` endpoint path under /api/agent/* + 403 accidental-mismatch (V7d) + content-level no-leak (V7e). Honest: не foreign-session discovery защита.
- [ ] stop-delivery script silent-fail invariant (V8 exit 0 always)
- [ ] Settings Stop block has 2 entries in order (heartbeat → delivery)
- [ ] Spec updated (Phase C section)
- [ ] Codex не commits/pushes без user command
- [ ] Phase 2 + Phase 3 awaits user

---

## §9 Out of scope

### §9.1 Phase D — Lease/claim hardening

- Delivery state machine: `pending-signal` / `signaled` / `claimed` / `expired`.
- Claim endpoint (POST /deliveries/:id/claim).
- TTL-based lease expiration.
- Multi-window protection.
- Stale lease recovery.
- Observability counters (missed delivery count, double-signal count).
- Persistent runtime file `deliveries.json`.

### §9.2 Codex Linux/WSL hooks

Отдельный handoff когда OpenAI ships Codex hooks support. Will reuse `/deliveries` endpoint.

### §9.3 Other defers

- UserPromptSubmit (rail #8, excluded).
- Session TTL tuning (60s → maybe longer after field observation).
- `CwdChanged` hook (observability, отдельный handoff).
- Agent-authored delivery annotations (agent marks delivery как «seen»).
- Delivery priority (unread / newest / threaded).
- Frontend display of per-session deliveries (dashboard enhancement).

---

## §10 Rollback

**До commit** — non-destructive:

1. `git diff --stat dashboard/server.js scripts/mailbox-stop-delivery.mjs .claude/settings.local.json local-claude-codex-mailbox-workflow.md` — sanity.
2. `git stash push -m "phase-c-rollback" -- dashboard/server.js scripts/mailbox-stop-delivery.mjs .claude/settings.local.json local-claude-codex-mailbox-workflow.md`.
3. Mixed changes → STOP + surface.
4. `cd dashboard && npx vite build 2>&1 | tail -5` — baseline build clean (Phase C не трогает frontend).

**После commit**: `git revert <sha>`. Runtime state: supervisor sessions остаются до 60s TTL, затем пропадают. Нет persistent state damage.

---

## §11 Discrepancy checkpoints (STOP conditions)

1. P2 baseline drift >5 → STOP.
2. P3 endpoint probe не показывает pendingIndex/sessions → Phase A/B regression, STOP.
3. P4 build fails → repair, re-run.
4. P5 existing `/api/agent/runtime/deliveries` route уже present → STOP + Discrepancy.
5. Phase 1 V1-V10 any FAIL → STOP.
6. V7d 403 NOT returned на project mismatch (accidental-mismatch protection broken) → STOP, rail #9 validation path broken.
7. V7e leak:true detected (same-session cross-project row) → STOP, rail #3 breach.
8. V10 whitelist drift → STOP.
9. Modification `scripts/mailbox-session-register.mjs` / `scripts/mailbox-status.mjs` / `mailbox-lib.mjs` / `dashboard/supervisor.mjs` → STOP (reference-only).
9. Temptation добавить claim/lease logic → STOP + Phase D defer.
10. Temptation добавить UserPromptSubmit hook → STOP (rail #8).

---

## §12 Self-audit checklist

- [ ] 1: P1-P5 pre-flight OK
- [ ] 2: Change 1 (server.js agentRouter GET /runtime/deliveries) added + mandatory session_id+project + session.project == query.project validation + scoped filter + session_expired branch
- [ ] 3: Change 2 (stop-delivery.mjs) created + `--project` CLI flag + silent-fail + stdout JSON injection
- [ ] 4: Change 3 (settings Stop block) applied — 2 entries, обе с `--project workflow`, order heartbeat → delivery
- [ ] 5: Change 4 (spec) applied — Phase C section
- [ ] 6: V1-V10 recorded verbatim
- [ ] 7: V10 whitelist drift clean
- [ ] 8: No commit/push
- [ ] 9: Discrepancies recorded
- [ ] 10: Report §0-§10 filled
- [ ] 11: No claim/lease logic (Phase D deferred)
- [ ] 12: Script silent-fail invariant (exit 0 in all error paths)
- [ ] 13: `/deliveries` filters by `deliverable === true` (Phase A rail #3 prereq honored)
- [ ] 14: Accidental mismatch protection — V7d 403 на `session.project !== query.project` passes. **Honest scope**: защита только от misconfiguration `--project` flag; foreign-session discovery через `/state` остаётся в single-user localhost trust model.

≥12/14 OK → ready for user review.

---

## §13 Notes to Codex

- **Environment**: WSL execution, `cwd=/mnt/e/Project/workflow`.
- **Planning snapshot**: HEAD=`f2e76ee`. Newer master touching whitelist → STOP + Discrepancy.
- **Anti-fabrication**: V1-V10 outputs verbatim.
- **No new deps**.
- **Script thin-layer (rail #4)**: stop-delivery.mjs только GET + stdout JSON. Никакого mailbox read / file mutation / process spawn.
- **Stateless delivery (Phase C)**: `/deliveries` — pure filter. Persistence + claim tracking — Phase D.
- **Order в Stop block matters**: heartbeat (session-register) before delivery (stop-delivery).
- **Test session_id prefix**: `test-c-` с $$ suffix для uniqueness. Cleanup через DELETE.
- **V7d long-running probe** (62s expire) gated behind `ENABLE_LONG=1` env var. По умолчанию SKIP — defer к Phase 2 user visual.
- **V8b требует deterministic fixture** (post-F4). Script sends message via `mailbox.mjs send`, sleeps 4s awaiting supervisor pollTick (3s interval + margin), проверяет valid injection JSON, затем archives fixture через public CLI. PASS-noop больше не acceptable — core happy-path MUST be verified. Если Codex сталкивается с environment issue blocking fixture flow, это discrepancy → STOP + surface.

---

## §14 Commits strategy

**Single commit** preferred:

```
feat(mailbox): Phase C — delivery signal via Stop hook injection

Core changes:
- dashboard/server.js: hoist supervisor creation + add agentRouter.get("/runtime/deliveries") handler. Requires mandatory session_id + project query params; validates session.project === query.project (403 mismatch — accidental-mismatch protection; НЕ foreign-session discovery защита, см. §0 rail #9). Content-scoped filter (to === session.agent && project === session.project && deliverable === true) — no cross-project rows в response. Expired session → empty + session_expired:true. Stateless read под agent-path.
- scripts/mailbox-stop-delivery.mjs: NEW Stop hook script. Reads --project CLI flag + stdin session_id, GETs /api/agent/runtime/deliveries?session_id=X&project=Y, emits stdout JSON hookSpecificOutput.additionalContext («Есть N писем по project X: ...») если non-empty. Silent fail all error paths (exit 0).
- .claude/settings.local.json: Stop block +2nd entry с `--project workflow`. Order: heartbeat (session-register) → delivery (stop-delivery). Both с per-repo opt-in flag.
- local-claude-codex-mailbox-workflow.md: Phase C Delivery signals section.

Phase C scope: signal only. No claim, no lease, no expiration tracking — Phase D. No auto-read/reply — agent decides manually on next turn. Codex hooks Linux/WSL — отдельный handoff когда OpenAI ships. Codex Windows native = degraded per Phase A §9.3.

Parent: f2e76ee (Phase B hooks).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Push**: ждёт explicit user command.
