# Mailbox Automation Phase B — Execution Plan (Claude SessionStart/Stop hooks)

**Version**: v1
**Planning-audit**: `docs/codex-tasks/mailbox-automation-phase-b-planning-audit.md`
**Report template**: `docs/codex-tasks/mailbox-automation-phase-b-report.md`
**Phase A parent**: commit `2927af7` (supervisor + runtime-state + /api/runtime endpoints)
**Target executor**: Codex (WSL, c parity-smokes на Windows native)
**Planner**: Claude (Windows)
**Scope**: Phase B per ТЗ — passive hook integration для Claude. SessionStart + Stop → POST /api/runtime/sessions. Session discovery. Без delivery signals, без lease.

---

## §0 Compat rails inheritance

Phase A rails (§0 Phase A plan) остаются в силе. Phase B добавляет:

- Rail #5 ✅ Claude Code hooks используются как transport.
- Rail #6-7: Codex hooks — **out-of-scope этого handoff**. Documented как degraded path in §9.4 Phase A. Отдельный handoff если/когда OpenAI ships Codex Linux/WSL hooks support.
- Rail #8 ✅ No UserPromptSubmit. Только SessionStart + Stop.
- Rail #9 ✅ Agents регистрируют **scoped** project via hook payload. Global visibility в dashboard остаётся.
- Rail #10 ✅ Codex Windows native degraded mode — manual curl POST per Phase A §9.3 таблица.

---

## §1 Why this plan exists

Phase A dashboard видит pending messages + registered sessions, но sessions регистрируются **вручную** (curl POST). Phase B автоматизирует registration через Claude hooks:

- При SessionStart agent автоматически регистрируется в supervisor (session_id, agent=claude, project, cwd, transport=claude-hooks, platform).
- При Stop agent отправляет heartbeat (refresh last_seen) — чтобы session оставалась «активной» пока agent работает.
- Если Claude Code завершается без Stop (crash/kill) — session auto-expires через 60s TTL supervisor.

Preconditions:
- Phase A endpoints live (/api/runtime/sessions POST/DELETE).
- Dashboard running (127.0.0.1:3003).
- `scripts/mailbox-status.mjs` existing SessionStart hook — pattern reuse.

---

## §2 Hierarchy of sources of truth

1. Official Claude Code hooks docs (`https://code.claude.com/docs/en/hooks`) — stdin/stdout schema + settings.json — planning-audit §4.
2. Live code post-`2927af7` — supervisor.mjs endpoints, mailbox-status.mjs patterns.
3. ТЗ `mailbox-auto-pickup-supervisor-tz.md` section Phase B.
4. 10 cross-OS compat rails.
5. This plan — derived.
6. **Discrepancy rule**: STOP + report §5.

---

## §3 Doc verification

### §V1 — SessionStart stdin

Claude Code docs confirm (WebFetch):

```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/path/to/cwd",
  "hook_event_name": "SessionStart",
  "source": "startup|resume|clear|compact",
  "model": "claude-sonnet-4-6"
}
```

### §V2 — Stop stdin

```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/path/to/cwd",
  "permission_mode": "default",
  "hook_event_name": "Stop"
}
```

### §V3 — Hook output

Exit 0 + optional stdout JSON `{hookSpecificOutput:{hookEventName,additionalContext}}`. Phase B hook script — silent success (no additional context), exit 0 always (silent fail on server down).

### §V4 — settings.json multi-hook

Multiple hooks в массиве на один event — оба запускаются последовательно per docs. SessionStart уже имеет 1 entry (mailbox-status.mjs). Phase B добавляет 2nd entry (session-register).

### §V5 — Hook timeout

Default 600s command type. Explicit timeout в seconds integer. Phase B: 5s (POST на localhost, с буфером если supervisor slow initial poll).

### §V6 — Node 18+ `fetch()`

Global `fetch()` available в Node ≥18. Baseline Node 24.13/24.14.1 → guaranteed.

---

## §4 Pre-flight verification

### P1 — environment baseline

```bash
node --version
git rev-parse --short HEAD
git status --short
```

**Expected**: Node ≥20.19, HEAD=`2fc5325` или newer. Baseline drift model — как Phase A §4 P1.

### P2 — baseline line counts

```bash
wc -l scripts/mailbox-status.mjs dashboard/supervisor.mjs dashboard/server.js .claude/settings.local.json local-claude-codex-mailbox-workflow.md
```

Expected (post-`2fc5325`):

| File | Lines |
|------|-------|
| `scripts/mailbox-status.mjs` | 262 |
| `dashboard/supervisor.mjs` | 206 |
| `dashboard/server.js` | 249 |
| `.claude/settings.local.json` | 16 |
| `local-claude-codex-mailbox-workflow.md` | 845 |

Drift >5 lines на whitelist file → STOP.

### P3 — Phase A endpoint liveness

```bash
# Supervisor POST /sessions live smoke — isolated probe, does NOT touch production state beyond single session record with test-b- prefix
TMPV7_PORT_CHECK=$(ss -ltn 2>/dev/null | awk '{print $4}' | grep -c ':3003$')
if [ "$TMPV7_PORT_CHECK" = "0" ]; then
  echo "P3 INFO: dashboard not running; P3 requires running dashboard — start before running P3 or skip to V4 structural check"
else
  TEST_SID="test-b-preflight-$$"
  RESP=$(curl -s -m 3 -X POST -H "Content-Type: application/json" -d "{\"session_id\":\"$TEST_SID\",\"agent\":\"claude\",\"project\":\"workflow\",\"cwd\":\"/tmp\",\"transport\":\"manual\",\"platform\":\"preflight\"}" http://127.0.0.1:3003/api/runtime/sessions)
  echo "POST response: $RESP"
  # Cleanup — DELETE test session
  curl -s -m 3 -X DELETE "http://127.0.0.1:3003/api/runtime/sessions/$TEST_SID" >/dev/null
  echo "cleanup done"
fi
```

**Expected if dashboard running**: `{"ok":true,"session":{...}}` + `cleanup done`. FAIL (connection refused / non-201) → dashboard issue, not Phase B scope, STOP + mention in §5.

### P4 — baseline build

```bash
cd dashboard && npx vite build 2>&1 | tail -5
```

Expected: `✓ built`. No frontend changes в Phase B, но check baseline clean. FAIL → environment repair (wiki `wsl-windows-native-binding-drift`).

### P5 — existing hooks config sanity

```bash
cat .claude/settings.local.json
```

**Expected**: SessionStart block с mailbox-status.mjs entry. Phase B добавит 2-й entry в тот же block + Stop block.

---

## §5 Whitelist — only these files may be created/modified

| File | Purpose | Status |
|------|---------|--------|
| `scripts/mailbox-session-register.mjs` | **NEW** — hook script: POST /api/runtime/sessions с session_id/agent=claude/project/cwd/transport/platform | create |
| `.claude/settings.local.json` | +2nd SessionStart entry (session-register) + new Stop block (session-register) | modify |
| `local-claude-codex-mailbox-workflow.md` | +new «Phase B: Session lifecycle hooks» section explaining hook flow + rail #7 note | modify |

**НЕ ТРОГАТЬ** (Phase B не требует backend/frontend изменений):
- `scripts/mailbox.mjs`, `scripts/mailbox-lib.mjs`, `scripts/mailbox-status.mjs` — read-only reference (existing hook stays unchanged)
- `dashboard/*.{js,jsx,mjs}` — Phase A delivered, no new endpoints
- `dashboard/package.json`, `dashboard/package-lock.json` — no new deps
- `.gitignore` — no changes
- `agent-mailbox/**`, `mailbox-runtime/**`
- `docs/codex-tasks/*` кроме этой handoff-тройки
- `CLAUDE.md`, `README.md`, `README.ru.md`, `LICENSE`
- `.github/workflows/ci.yml`

---

## §6 Changes

### Change 1 — **NEW** `scripts/mailbox-session-register.mjs`

Создать новый файл. Hook script: read stdin + CLI `--project` flag → POST /api/runtime/sessions. Silent fail on server down или missing flag.

**КРИТИЧНО** (rail #3 + spec L306): project передаётся **ТОЛЬКО** через explicit CLI `--project <name>` флаг. Никакого cwd-derivation. Отсутствие флага → silent exit 0 (script opt-in per settings.local.json).

```js
import path from "node:path";

const SUPERVISOR_ENDPOINT = "http://127.0.0.1:3003/api/runtime/sessions";
const POST_TIMEOUT_MS = 3000;

function logError(error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[mailbox-session-register] ${message}\n`);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
  }
  return chunks.join("").trim();
}

function toHostPath(rawCwd) {
  if (typeof rawCwd !== "string") return "";
  const trimmed = rawCwd.trim();
  if (!trimmed) return "";
  if (process.platform !== "win32") {
    const windowsMatch = trimmed.match(/^([A-Za-z]):[\\/](.*)$/);
    if (windowsMatch) {
      const drive = windowsMatch[1].toLowerCase();
      const remainder = windowsMatch[2].replace(/[\\]+/g, "/");
      return path.posix.join("/mnt", drive, remainder);
    }
    return trimmed;
  }
  const wslMatch = trimmed.match(/^\/mnt\/([A-Za-z])\/(.*)$/);
  if (wslMatch) {
    const drive = wslMatch[1].toUpperCase();
    const remainder = wslMatch[2].replace(/\//g, "\\");
    return `${drive}:\\${remainder}`;
  }
  return trimmed;
}

function normalizeProject(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function parseProjectArg(argv) {
  // Accept both `--project <name>` and `--project=<name>`. Strictly from CLI, never cwd.
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

function detectPlatform() {
  if (process.platform === "win32") return "windows";
  if (process.platform === "linux") {
    if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) return "wsl";
    return "linux";
  }
  return process.platform;
}

async function postWithTimeout(url, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    return { ok: response.ok, status: response.status };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const project = parseProjectArg(process.argv.slice(2));
  if (!project) {
    // No --project flag → script is opt-in per-repo settings.local.json. Exit silently.
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

  const session_id = typeof payload.session_id === "string" ? payload.session_id.trim() : "";
  if (!session_id) {
    process.exit(0);
  }

  const cwd = toHostPath(payload.cwd);

  const body = {
    session_id,
    agent: "claude",
    project,
    cwd,
    transport: "claude-hooks",
    platform: detectPlatform()
  };

  try {
    const result = await postWithTimeout(SUPERVISOR_ENDPOINT, body, POST_TIMEOUT_MS);
    if (!result.ok) {
      logError(`POST /sessions returned ${result.status}`);
    }
  } catch (error) {
    logError(`POST /sessions failed: ${error instanceof Error ? error.message : String(error)}`);
  }

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
- **Project binding = explicit CLI flag** (rail #3 + spec L306). Никакого cwd-walk, никакого findProjectRoot. Отсутствие флага → silent exit 0 — это opt-in per-repo mechanism: каждый репо, который хочет Phase B hooks, добавляет в свой `.claude/settings.local.json` команду с `--project <own-name>`.
- cwd передаётся в POST body для informational purposes (dashboard UI может показать), но НЕ используется для derivation project — валидация в supervisor уже требует normalized project truthy.
- `fetch()` global (Node 18+). No new deps.
- `AbortController` timeout = 3s — safe для localhost POST.
- Silent fail: all error paths → `process.exit(0)`. stderr writes для transcript visibility (non-blocking, exit 0 в Claude Code = non-error path per docs).
- Platform detection: WSL_DISTRO_NAME/WSL_INTEROP env → `"wsl"`; win32 → `"windows"`; else → platform string.
- **Same script works для SessionStart и Stop** — supervisor POST upsert by session_id:
  - SessionStart → create record (new session_id) или refresh (existing).
  - Stop → refresh last_seen (heartbeat). НЕ создаёт duplicate record (Map.set на тот же key).
- Script не читает `hook_event_name` — idempotent POST handles both semantics identically.

### Change 2 — `.claude/settings.local.json`

**Current** (16 lines, post-`2fc5325`):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/scripts/mailbox-status.mjs\"",
            "timeout": 3
          }
        ]
      }
    ]
  }
}
```

**Target** — add 2nd SessionStart hook entry + new Stop block. **Explicit `--project workflow`** в обеих командах (rail #3 + spec L306):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/scripts/mailbox-status.mjs\"",
            "timeout": 3
          },
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/scripts/mailbox-session-register.mjs\" --project workflow",
            "timeout": 5
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/scripts/mailbox-session-register.mjs\" --project workflow",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

**Rationale**:
- **`--project workflow`** — explicit CLI flag, per-repo opt-in. Каждый другой repo, который хочет Phase B hooks для Claude, добавляет своё значение в свой `.claude/settings.local.json`.
- Второй entry в том же SessionStart block — два hook scripts fire sequentially per docs.
- Stop block новый — matcher не supported per docs, одна hooks array.
- timeout 5s для session-register (POST localhost + Node startup); mailbox-status оставляем 3s.

### Change 3 — `local-claude-codex-mailbox-workflow.md`

Найти существующую «### Archive timeline completeness» section (рядом с line 332 от Phase A) и **добавить после** новую section:

```markdown

### Phase B — Session lifecycle hooks (Claude)

Claude Code автоматически регистрирует свою session в supervisor через hook chain:

- **`SessionStart`** → POST `/api/runtime/sessions` с `{session_id, agent:"claude", project, cwd, transport:"claude-hooks", platform:"windows|linux|wsl"}`. Project приходит **только** из explicit `--project <name>` CLI flag в hook command в `.claude/settings.local.json` (per-repo opt-in; соответствует spec L306 — agent session project = explicit bound flag, никогда cwd). Missing flag → script silently exits (no registration). Регистрация fires сразу после старта сессии.
- **`Stop`** → тот же POST (upsert via session_id). Refresh `last_seen` → session остаётся «активной» в dashboard. Каждый end-of-turn обновляет heartbeat.
- Если dashboard down — hook silently fails (exit 0, stderr warning в transcript). Agent session не ломается.
- Session auto-expires через 60s TTL если heartbeat не приходит. Это чище чем DELETE на Stop: end-of-turn ≠ end-of-session.

**Codex hooks**:
- **Linux/WSL Codex**: equivalent scripts появятся в отдельном handoff если/когда OpenAI ships cross-platform hooks support.
- **Windows native Codex**: **degraded** (rail #7). Autoregistration unsupported; user может вручную вызвать `curl -X POST ...` для session record.

**Scope boundaries** (rail #4 thin layer):
- Hook scripts **only** POST session — не читают mail, не исполняют письма, не spawn-ят heavy processes.
- Delivery signals + continuation prompts — Phase C (separate handoff).
- Lease/claim multi-window protection — Phase D.
- `UserPromptSubmit` **НЕ используется** (rail #8).
```

---

## §7 Verification phases

### Phase 1 — Codex-only (WSL execution)

**Mandatory order**: нет специального — Changes 1-3 независимы, но logic: Change 1 (script) сначала, затем Change 2 (config references script), Change 3 (spec documenting).

| # | Check | Expected |
|---|-------|----------|
| V1 | mailbox-session-register.mjs loads + parses | no syntax error |
| V2 | Script exits 0 на empty stdin | exit 0 |
| V3 | Script exits 0 с malformed JSON stdin | exit 0 |
| V4 | settings.local.json valid JSON + 2 SessionStart entries + 1 Stop entry | jq validates |
| V5 | Spec section «Phase B: Session lifecycle hooks» present | grep = 1 |
| V6 | Empirical: (6a) no --project → silent exit, (6b) initial register, (6c) heartbeat refresh last_seen without duplicate | all 3 PASS |
| V7 | Silent fail invariant (exit 0 always). Dashboard down → stderr warning. Dashboard up → POST succeeds, no stderr. `--project` flag required в команде. | exit 0 |
| V8 | Personal data scan | `--scan done` |
| V9 | Whitelist drift | только 3 whitelist files M/?? + 3 handoff artefacts |

Verification commands:

```bash
# V1 — script parses
node --check scripts/mailbox-session-register.mjs && echo "V1 PASS"
# Expected: V1 PASS

# V2 — empty stdin
echo -n "" | node scripts/mailbox-session-register.mjs
echo "V2 exit: $?"
# Expected: V2 exit: 0

# V3 — malformed JSON
echo -n "not json" | node scripts/mailbox-session-register.mjs
echo "V3 exit: $?"
# Expected: V3 exit: 0

# V4 — settings.local.json structure
node -e "
const raw = require('fs').readFileSync('.claude/settings.local.json', 'utf8');
const config = JSON.parse(raw);
const ss = config.hooks.SessionStart[0].hooks.length;
const stop = config.hooks.Stop[0].hooks.length;
console.log('V4 SessionStart entries:', ss);
console.log('V4 Stop entries:', stop);
"
# Expected: SessionStart entries: 2; Stop entries: 1

# V5 — spec section
grep -c "Phase B: Session lifecycle hooks\|Phase B — Session lifecycle hooks" local-claude-codex-mailbox-workflow.md
# Expected: 1

# V6 — empirical registration + heartbeat semantics (requires dashboard running)
# Проверяем: (a) initial register, (b) heartbeat refresh last_seen без duplicate record, (c) --project flag enforcement.
TMPV6_PORT=$(ss -ltn 2>/dev/null | awk '{print $4}' | grep -c ':3003$')
if [ "$TMPV6_PORT" = "0" ]; then
  echo "V6 SKIP: dashboard not running — user runs V6 during Phase 2 visual check"
else
  TEST_SID="test-b-v6-$$"
  TEST_CWD="$(pwd)"
  PAYLOAD="{\"session_id\":\"$TEST_SID\",\"cwd\":\"$TEST_CWD\",\"hook_event_name\":\"SessionStart\",\"source\":\"startup\"}"

  # 6a — no --project flag → silent exit 0, NO registration
  echo -n "$PAYLOAD" | node scripts/mailbox-session-register.mjs
  EXIT_A=$?
  STATE_A=$(curl -s http://127.0.0.1:3003/api/runtime/state)
  if echo "$STATE_A" | grep -q "$TEST_SID"; then
    echo "V6a FAIL: session registered WITHOUT --project flag (should be silent exit)"
  else
    echo "V6a PASS: no --project → silent exit (exit $EXIT_A)"
  fi

  # 6b — with --project → initial create
  echo -n "$PAYLOAD" | node scripts/mailbox-session-register.mjs --project workflow
  EXIT_B=$?
  STATE_B=$(curl -s http://127.0.0.1:3003/api/runtime/state)
  LAST_SEEN_1=$(echo "$STATE_B" | node -e "
    const s = require('fs').readFileSync(0, 'utf8');
    const json = JSON.parse(s);
    const sess = json.sessions.find((item) => item.session_id === '$TEST_SID');
    console.log(sess ? sess.last_seen : 'MISSING');
  ")
  if [ "$LAST_SEEN_1" = "MISSING" ]; then
    echo "V6b FAIL: session NOT registered with --project (exit $EXIT_B)"
  else
    echo "V6b PASS: registered last_seen=$LAST_SEEN_1 (exit $EXIT_B)"
  fi

  # 6c — heartbeat: sleep 1.5s, POST again, verify last_seen refreshed AND single record
  sleep 2
  echo -n "$PAYLOAD" | node scripts/mailbox-session-register.mjs --project workflow
  EXIT_C=$?
  STATE_C=$(curl -s http://127.0.0.1:3003/api/runtime/state)
  HEARTBEAT_CHECK=$(echo "$STATE_C" | node -e "
    const s = require('fs').readFileSync(0, 'utf8');
    const json = JSON.parse(s);
    const matches = json.sessions.filter((item) => item.session_id === '$TEST_SID');
    if (matches.length !== 1) {
      console.log('DUPLICATE:' + matches.length);
    } else if (matches[0].last_seen === '$LAST_SEEN_1') {
      console.log('STALE:' + matches[0].last_seen);
    } else {
      console.log('REFRESHED:' + matches[0].last_seen);
    }
  ")
  case "$HEARTBEAT_CHECK" in
    REFRESHED:*) echo "V6c PASS: heartbeat refreshed $HEARTBEAT_CHECK (exit $EXIT_C)" ;;
    STALE:*)     echo "V6c FAIL: last_seen NOT updated after 2nd POST ($HEARTBEAT_CHECK)" ;;
    DUPLICATE:*) echo "V6c FAIL: duplicate session records ($HEARTBEAT_CHECK)" ;;
    *)           echo "V6c FAIL: unexpected check output ($HEARTBEAT_CHECK)" ;;
  esac

  # Cleanup
  curl -s -X DELETE "http://127.0.0.1:3003/api/runtime/sessions/$TEST_SID" >/dev/null
fi
# Expected: V6a PASS + V6b PASS + V6c PASS (all three).

# V7 — silent fail (dashboard down) OR silent success (dashboard up); both → exit 0
# ВАЖНО: после F3/F4 fix script требует --project flag. Без флага script exits ДО POST attempt,
# не testing silent-fail path. Flag обязателен для V7 чтобы exercise full POST path.
PAYLOAD='{"session_id":"test-v7","cwd":"/tmp","hook_event_name":"SessionStart"}'

TMPV7_PORT=$(ss -ltn 2>/dev/null | awk '{print $4}' | grep -c ':3003$')
echo -n "$PAYLOAD" | node scripts/mailbox-session-register.mjs --project workflow 2> /tmp/v7-stderr.log
EXIT=$?
STDERR=$(cat /tmp/v7-stderr.log 2>/dev/null)
rm -f /tmp/v7-stderr.log

if [ "$EXIT" != "0" ]; then
  echo "V7 FAIL: exit $EXIT (should be 0 — silent fail invariant breached)"
elif [ "$TMPV7_PORT" = "0" ]; then
  # Dashboard down — expect stderr warning present
  if echo "$STDERR" | grep -q "POST /sessions failed"; then
    echo "V7 PASS: dashboard down + stderr warning present + exit 0"
  else
    echo "V7 FAIL: dashboard down but stderr warning missing (silent-fail path broken)"
  fi
else
  # Dashboard up — POST succeeded, no stderr expected. Cleanup test session.
  if [ -z "$STDERR" ]; then
    echo "V7 PASS: dashboard up + exit 0 + no stderr (POST succeeded)"
    curl -s -X DELETE "http://127.0.0.1:3003/api/runtime/sessions/test-v7" >/dev/null
  else
    echo "V7 PASS-warning: exit 0 but unexpected stderr content: $STDERR"
  fi
fi
# Expected: V7 PASS (dashboard up OR down — оба acceptable; exit 0 invariant критичен).

# V8 — PD scan
PD_PATTERNS='$PD_PATTERNS'
grep -riE "$PD_PATTERNS" --include="*.js" --include="*.jsx" --include="*.mjs" --include="*.html" --include="*.json" dashboard/ scripts/ 2>/dev/null
grep -riE "$PD_PATTERNS" --include="*.md" CLAUDE.md README.md README.ru.md local-claude-codex-mailbox-workflow.md workflow-instructions-*.md 2>/dev/null
echo "--scan done"

# V9 — Whitelist drift
git status --short
# Expected: 2 whitelist M (settings.local.json + spec) + 1 new ?? (mailbox-session-register.mjs) + 3 handoff artefacts
```

Any FAIL → STOP + report §5.

### Phase 2 — user visual `[awaits user]`

| # | Check |
|---|-------|
| P2.1 | User restarts Claude Code в этой workflow dir (trigger SessionStart) → dashboard «Активные сессии» содержит запись agent=claude, project=workflow, transport=claude-hooks, platform correct OS |
| P2.2 | User работает в Claude Code несколько turns → каждый turn trigger Stop → session остаётся в «Активные» (last_seen обновляется) |
| P2.3 | User ждёт 90s без Stop → session auto-expires (пропадает из активных) |
| P2.4 | Dashboard down сценарий: stop dashboard, restart Claude Code → agent session start не зависает, агент работает нормально. Опционально: grep transcript для stderr warning |

### Phase 3 — Cross-OS parity `[awaits user]`

| # | Check |
|---|-------|
| P3.1 | Windows native Claude Code: SessionStart registers session с platform="windows" |
| P3.2 | WSL Claude Code (если применимо): session platform="wsl" или "linux" |
| P3.3 | Codex Linux/WSL: **out-of-scope** этого handoff. Documented в спеке § rail #7. |
| P3.4 | Codex Windows native: **degraded** per §9.3 Phase A. User может manual curl POST для visibility. |

---

## §8 Acceptance criteria

- [ ] Phase 1 V1-V9 PASS
- [ ] Report template filled
- [ ] No files outside §5 whitelist
- [ ] PD scan clean (V8)
- [ ] `scripts/mailbox-session-register.mjs` новый extractable hook script
- [ ] `.claude/settings.local.json` valid JSON с корректной structure
- [ ] Spec updated (Phase B section)
- [ ] Codex не commits/pushes без user command
- [ ] Phase 2 + Phase 3 awaits user

---

## §9 Out of scope

### §9.1 Phase C — Delivery signals (framework)

- Supervisor generates delivery records matching session(agent,project) → pendingIndex(to,project).
- `GET /api/agent/runtime/deliveries` — scoped per project (rail #3).
- Stop hook injects continuation «Есть новое письмо по project X. Проверь почту.» via stdout JSON `hookSpecificOutput.additionalContext`.

### §9.2 Phase D — Lease/claim hardening (framework)

- Multi-window lease protection (TTL-based).
- Stale lease recovery.
- Observability counters.

### §9.3 Codex hooks

- Linux/WSL: отдельный handoff когда Codex shipping hooks support.
- Windows native: **degraded** — manual curl POST (§9.4 Phase A таблица).

### §9.4 Other defers

- UserPromptSubmit — excluded (rail #8).
- Project detection unification (Q3 ТЗ) — будущий handoff при cross-agent design review.
- CLI parity `scripts/mailbox.mjs runtime` subcommand — не нужно для passive hooks.
- Tests / unit tests — нет test harness; verification via empirical + user visual.
- SessionStart `source=resume/clear/compact` fine-grained semantics — upsert handles все cases одинаково (Gap G3).
- `CwdChanged` hook — Phase C/D (Gap G5).

---

## §10 Rollback

**До commit** — non-destructive:
1. `git diff --stat .claude/settings.local.json local-claude-codex-mailbox-workflow.md scripts/mailbox-session-register.mjs` — sanity.
2. `git stash push -m "phase-b-rollback" -- .claude/settings.local.json local-claude-codex-mailbox-workflow.md scripts/mailbox-session-register.mjs`.
3. Mixed changes → STOP + surface.
4. `cd dashboard && npx vite build 2>&1 | tail -5` — baseline clean (Phase B не трогает build).

**После commit**: `git revert <sha>`. Supervisor state: existing sessions остаются до 60s TTL, after пропадут. Нет persistent state damage.

---

## §11 Discrepancy checkpoints (STOP conditions)

1. P2 baseline drift >5 lines → STOP.
2. P3 endpoint probe non-201 (dashboard issues) → STOP + investigate otherside.
3. P4 baseline build fails → STOP + environment repair.
4. P5 settings.local.json malformed → STOP.
5. Phase 1 V1-V9 any FAIL → STOP.
6. V9 whitelist drift → STOP.
7. Modification of `dashboard/**` (except whitelist) или `scripts/mailbox-{status,lib,.mjs}` → STOP (reference-only).
8. Temptation добавить Phase C delivery logic → STOP + defer.
9. Temptation добавить UserPromptSubmit hook → STOP (rail #8 breach).
10. Hook script breaks existing mailbox-status.mjs chain — new script adds, не replaces → STOP если mailbox-status.mjs diff появляется.

---

## §12 Self-audit checklist

- [ ] 1: P1-P5 pre-flight OK
- [ ] 2: Change 1 (mailbox-session-register.mjs) created с patterns reuse
- [ ] 3: Change 2 (.claude/settings.local.json) applied — 2 SessionStart entries + 1 Stop entry
- [ ] 4: Change 3 (spec) applied — Phase B section added
- [ ] 5: V1-V9 recorded verbatim
- [ ] 6: V9 whitelist drift clean
- [ ] 7: No commit/push performed
- [ ] 8: Discrepancies recorded
- [ ] 9: Report §0-§10 filled
- [ ] 10: No hooks outside SessionStart + Stop (rail #8)
- [ ] 11: Script transport value = "claude-hooks"
- [ ] 12: Platform detection includes wsl

≥11/12 OK → ready for user review.

---

## §13 Notes to Codex

- **Environment**: WSL execution, `cwd=/mnt/e/Project/workflow`.
- **Planning snapshot**: HEAD=`2fc5325`. Newer master touching whitelist → STOP + Discrepancy.
- **Anti-fabrication**: V1-V9 outputs verbatim.
- **No new deps**: hook script uses global `fetch()` + `node:fs/promises` + `node:path`.
- **Script reuse**: из mailbox-status.mjs берётся только `toHostPath` pattern (для cwd normalization в POST body) + `normalizeProject` helper. `findProjectRoot`/`inferProjectFromCwd` **НЕ используются** — project binding идёт через explicit `--project` CLI flag per spec L306. Hook остаётся полностью standalone per TZ thin-layer principle (no shared module import).
- **Multi-hook SessionStart**: 2 entries fire sequentially per docs. mailbox-status.mjs first (providing context to transcript), session-register.mjs second (silent POST).
- **Stop matcher**: не supported per docs — omit matcher field.
- **Test session_id prefix**: use `test-b-` prefix в любых V6/V7 probes, plus `rand` / $$ suffix для uniqueness. Cleanup через DELETE in probes.
- **Silent fail requirement**: agent session НЕ ломается если dashboard down. Script always exits 0.

---

## §14 Commits strategy

**Single commit** preferred:

```
feat(mailbox): Phase B — Claude SessionStart/Stop session-register hooks

Core changes:
- scripts/mailbox-session-register.mjs: hook script posting session metadata to /api/runtime/sessions (upsert on session_id; registers на SessionStart + heartbeat на Stop)
- .claude/settings.local.json: +2nd SessionStart hook entry + new Stop hook block pointing к session-register.mjs (timeout 5s each)
- local-claude-codex-mailbox-workflow.md: Phase B Session lifecycle hooks section + Codex degraded mode note

Silent fail if dashboard down (stderr warning, exit 0) — rail «graceful degradation». Session auto-expires через 60s TTL при отсутствии Stop heartbeat.

Phase B scope: passive hook integration только Claude. Codex Linux/WSL hooks — отдельный handoff когда OpenAI ships. Codex Windows native — degraded per Phase A §9.3.

Parent: 2927af7 (Phase A supervisor + runtime-state).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Push**: ждёт user command.
