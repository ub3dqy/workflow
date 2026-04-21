# Mailbox Corporate Isolation — закрыть agent-side cross-project leakage

**Version**: v8 (post-Codex R7 adversarial — report header v6→v8, non-history v3 refs cleaned in audit)
**Planning-audit**: `docs/codex-tasks/mailbox-corporate-isolation-planning-audit.md`
**Report template**: `docs/codex-tasks/mailbox-corporate-isolation-report.md`
**Parent**: Codex follow-up letter `2026-04-19T17-41-13Z-mailbox-automation-project-isolation-followup-codex-001`
**Prior Codex review**: `2026-04-21T09-52-11Z-codex-001` (4 blockers + 1 high + 1 open) — all applied in v2
**Baseline**: HEAD=`092c725` + уже dirty `dashboard/src/App.jsx` (sound-fix in progress)
**Prior Codex reviews**: R1 `2026-04-21T09-52-11Z-codex-001`, R2 `2026-04-21T10-02-17Z-codex-002`, R3 `2026-04-21T10-13-43Z-codex-003` — все findings applied.

---

## §0 Why this plan exists

User scope (2026-04-21): «полная изоляция каждого проекта, как корпоративная почта — агенты одного проекта не видят писем других». **Corporate-email analogy** читается как:
- **User = IT-admin** системы → legitimate cross-project view через dashboard;
- **Агенты = employees** привязанные к проекту → видят только свой project.

Draft v1 ошибочно закрывал user-facing dashboard endpoints, ломая legitimate admin view. Codex adversarial R1 flagged это как Blocker 1. V2 отменяет эти закрытия и фокусируется ТОЛЬКО на agent-путях.

**Что уже изолировано** (не трогать):
- CLI `scripts/mailbox.mjs` list/reply/archive/recover/send — все требуют `--project`, `validateProjectScope` wired.
- `/api/agent/*` router middleware — requires project query/body, filters results.
- `/api/agent/runtime/deliveries` — session-scope check (403 on mismatch).

**Что действительно открыто** (post-R1 анализ):
| # | Зазор | Severity |
|---|-------|----------|
| G4 | `handleSend` в `scripts/mailbox.mjs` — принимает `--project` as-is без cross-check против session binding; агент может случайно/намеренно подписать письмо не тем проектом | 🟠 medium |
| G5 | Codex-side session registration отсутствует (`.codex` — 0-byte marker file; только Claude имеет `.claude/settings.local.json` SessionStart hook → `mailbox-session-register.mjs`) — для Codex sessions.json пуст → G4 session-binding не защищает Codex агентов | 🔴 high (без этого G4 — защита только для Claude) |
| G6 | Discipline contract: агент должен использовать `/api/agent/*`, а не admin `/api/messages*`. Enforcement на уровне кода невозможен без auth. Решение: документация + smoke-test в агентской инструкции | 🟡 low (mitigation via docs) |

---

## §1 Source hierarchy

1. User direct scope (2026-04-21): «корпоративная почта, агенты не видят чужие проекты».
2. Codex adversarial R1 review (archived letter `2026-04-21T09-52-11Z-codex-001`): scope correction + toHostPath reuse.
3. Wiki `mailbox-project-isolation.md` Q3 — «/api/messages остаётся user-facing (multi-project), agent-side only через новые /api/agent/* endpoints».
4. Wiki `workflow-hybrid-hook-automation.md` — «Codex automation = Linux/WSL only», Claude hooks работают everywhere.
5. Code at HEAD=`092c725`.

---

## §2 Pre-flight (Codex)

```bash
pwd                                   # /mnt/e/Project/workflow
git rev-parse HEAD                    # expect 092c725
git status --short                    # expect ONLY: M dashboard/src/App.jsx (sound-fix WIP)
                                      # + untracked docs/codex-tasks/mailbox-corporate-isolation*.md
                                      # + untracked docs/codex-tasks/mailbox-simple-monitor-planning-audit.md
node -v                               # v24.x
wc -l scripts/mailbox.mjs scripts/mailbox-lib.mjs scripts/mailbox-session-register.mjs
# Expected: mailbox.mjs=392, mailbox-lib.mjs=745, session-register=135
cd dashboard && npx vite build 2>&1 | tail -3     # expect ✓ built
```

**Baseline drift tolerance**: `dashboard/src/App.jsx` может уже быть modified (sound-fix, отдельный коммит вне этого plan). Если drift ТОЛЬКО на App.jsx — proceed. Иначе → STOP.

### §2.0 Execute shell precondition (HARD — Codex R5 High 4)

Wiki `concepts/codex-cli-sandbox-behavior` indicates that Codex session regenerates `.codex` marker mid-session. Если execute этого плана происходит из Codex session **which itself was started in this workflow repo**, то шаг «rm .codex && mkdir .codex» может конфликтовать с Codex'ом пересоздающим маркер.

**Precondition**: Codex session который выполняет этот plan **ОБЯЗАН** быть запущен **вне** `E:/Project/workflow`. Recommended: user starts Codex в `~/` or любом другом dir, then Codex `cd /mnt/e/Project/workflow` для работы. Codex session-marker `.codex` тогда живёт в стартовом dir (не в workflow), и workflow/`.codex` manipulation safe.

Verify:
```bash
# В начале execute:
CODEX_CWD="$HOME/.codex"   # where Codex wrote its own marker
ls -la "$CODEX_CWD" 2>/dev/null
# Session marker ожидается здесь, не в текущем workflow cwd.

# If current Codex session was started IN workflow (0-byte .codex файл в workflow root):
stat -c '%a %N' .codex 2>&1
# Expect: 444 '.codex' (empty marker from prior history) OR "No such file" after Step 1.
# If actively regenerated during execute → STOP, user restarts Codex из external dir.
```

**Если execute startup cwd = workflow**: STOP с instruction «Restart Codex from ~/ or /tmp; cd /mnt/e/Project/workflow внутри; retry execute».

### §2.1 Live server prerequisite (V13-V14 require)

V13/V13b/V14 probes упираются в `http://127.0.0.1:3003` (supervisor POST sessions + user-facing dashboard). Codex должен **перед этими probes** запустить server:

```bash
# В отдельном WSL окне ИЛИ background:
cd dashboard && node server.js &
DASHBOARD_PID=$!
# wait for ready:
until curl -s -o /dev/null http://127.0.0.1:3003/api/messages?project=workflow; do sleep 0.3; done
# run V3-V16 probes here
# cleanup after Phase 1:
kill $DASHBOARD_PID 2>/dev/null
```

Если dashboard уже запущен user'ом — skip start, использовать running instance. Codex проверяет `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3003/api/messages?project=workflow` — если 200, proceed без start; если connection refused — start.

---

## §3 Whitelist (strict)

**Изменить**:
1. `scripts/mailbox-lib.mjs` — export `resolveCallerProject` (ancestor-walk) + shared `toHostPath`.
2. `scripts/mailbox-session-register.mjs` — импорт `toHostPath` из lib + `--agent claude|codex` CLI arg (default `claude`).
3. `scripts/mailbox.mjs` — `handleSend` **universal fail-closed** + убрать `"user"` из usage text (sender remainder `<claude|codex>`).
4. `scripts/mailbox-lib.mjs` — **`validateSender` allowedSenders** изменить с `["user","claude","codex"]` на `["claude","codex"]` (Codex R5 B1: sender-level closure, не только bind-level).
5. `.gitignore` — `.codex` → `.codex/sessions/`.
6. `.codex/` directory — `config.toml` + `hooks.json` (abs command path).
7. `local-claude-codex-mailbox-workflow.md` — discipline contract + `codex_hooks=true` prereq + updated sender list.

**Windows-native Codex note**: Codex hooks официально disabled на Windows native (per OpenAI docs). User запускает Codex через `start-workflow-codex.cmd` → WSL → hooks работают. Windows-native Codex (если кто-то запустит напрямую через Windows `codex.exe`) не защищён — документируем в §7 как known limitation.

**Handoff artefacts**: 3 файла в `docs/codex-tasks/`.

**НЕ ТРОГАТЬ**:
- `dashboard/server.js` — все user-facing endpoints остаются multi-project (Codex R1 Blocker 1).
- `dashboard/supervisor.mjs` `/state` — остаётся unfiltered (human admin view).
- `dashboard/src/App.jsx` — kept as-is для user dashboard (sound-fix отдельным коммитом).
- `dashboard/src/api.js` — `fetchMessages`, `fetchRuntimeState` не меняем.
- Frontmatter schema.
- Archive FS layout.
- `.claude/settings.local.json` (уже корректно настроен).

---

## §4 Changes

### Change 1 — `scripts/mailbox-lib.mjs` — shared helpers

**Вынести `toHostPath` из session-register в lib** (single source of truth для cross-OS path normalization):

```js
export function toHostPath(rawCwd) {
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

export async function resolveCallerProject({ cwd, runtimeRoot }) {
  const sessionsPath = path.join(runtimeRoot, "sessions.json");
  let raw;
  try {
    raw = await fs.readFile(sessionsPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
  let list;
  try {
    list = JSON.parse(raw);
  } catch {
    return "";
  }
  if (!Array.isArray(list)) return "";
  // `cwd` может прийти как Windows (C:\...) или POSIX (/mnt/c/...);
  // session register пишет entry.cwd через toHostPath для текущей платформы.
  // Нормализуем обе стороны к host-path ТЕКУЩЕЙ платформы.
  const targetHost = toHostPath(cwd);
  if (!targetHost) return "";
  const targetNormalized = path.normalize(targetHost).replace(/[\\/]+$/, "");
  const caseFold = (s) => process.platform === "win32" ? s.toLowerCase() : s;
  const targetFolded = caseFold(targetNormalized);
  // Ancestor-walk: binding matches если session.cwd = current.cwd ИЛИ
  // session.cwd is ancestor of current.cwd. Fixes subdir case (agent cd'd в scripts/).
  // Per Codex R3 Blocker 5: exact-cwd drift violated wiki spec "canonical project source =
  // explicit bound project through hook flag".
  for (const entry of list) {
    if (!entry?.cwd) continue;
    const entryHost = toHostPath(entry.cwd);
    if (!entryHost) continue;
    const entryNormalized = path.normalize(entryHost).replace(/[\\/]+$/, "");
    const entryFolded = caseFold(entryNormalized);
    if (targetFolded === entryFolded) {
      return normalizeProject(entry.project) || "";
    }
    // ancestor check: target starts with entry + separator
    const separator = entryFolded.includes("\\") ? "\\" : "/";
    if (targetFolded.startsWith(entryFolded + separator)) {
      return normalizeProject(entry.project) || "";
    }
  }
  return "";
}
```

(Imports `path` + `fs` уже присутствуют.)

`validateRelativeInboxPath` уже exported; ничего дополнительного не нужно.

### Change 2 — `scripts/mailbox-session-register.mjs` — shared toHostPath + --agent CLI arg

**Удалить** локальное определение `function toHostPath(...)` (L19-39) и `function normalizeProject(...)` (L41-44).

**Импорт** из lib (добавить):
```js
import { toHostPath, normalizeProject } from "./mailbox-lib.mjs";
```

**Добавить `parseAgentArg`** (рядом с existing `parseProjectArg` L46-57):

```js
function parseAgentArg(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--agent" && typeof argv[i + 1] === "string") {
      const value = argv[i + 1].trim();
      if (value === "claude" || value === "codex") return value;
    }
    if (typeof arg === "string" && arg.startsWith("--agent=")) {
      const value = arg.slice("--agent=".length).trim();
      if (value === "claude" || value === "codex") return value;
    }
  }
  return "claude"; // backward-compat default
}
```

**В `main()`** — заменить hardcoded `agent: "claude"` (L111) на parameterized:

```js
async function main() {
  const project = parseProjectArg(process.argv.slice(2));
  const agent = parseAgentArg(process.argv.slice(2));
  if (!project) {
    process.exit(0);
  }
  // ... existing stdin parse ...
  const body = {
    session_id,
    agent,  // ← was hardcoded "claude"
    project,
    cwd,
    transport: agent === "codex" ? "codex-hooks" : "claude-hooks",
    platform: detectPlatform()
  };
  // ... rest unchanged ...
}
```

Backward compatibility: existing `.claude/settings.local.json` вызывает `mailbox-session-register.mjs --project workflow` (без `--agent`). Default `"claude"` сохраняет существующее поведение.

### Change 3a — `scripts/mailbox-lib.mjs` — remove `user` from allowedSenders (Codex R5 B1)

В `scripts/mailbox-lib.mjs` найти `validateSender`:

```js
// Before:
const allowedSenders = new Set(["user", "claude", "codex"]);
// ...
throw new ClientError(400, 'from must be "user", "claude", or "codex"');

// After:
const allowedSenders = new Set(["claude", "codex"]);
// ...
throw new ClientError(400, 'from must be "claude" or "codex" (corporate isolation — user sender removed)');
```

### Change 3b — `scripts/mailbox.mjs` — handleSend universal fail-closed + usage text

v4 carve-out для `--from user` удалён (Codex R4 Blocker 2): wiki говорит что send-time validation должна быть uniform; введение third sender-bypass path создаёт backdoor. Все senders теперь требуют bound session.

В `handleSend` (L116) после `const from = validateSender(options.from);`:

```js
const project = normalizeProject(options.project);
const sessionProject = await resolveCallerProject({
  cwd: process.cwd(),
  runtimeRoot: path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "mailbox-runtime"
  )
});
if (!sessionProject) {
  throw new ClientError(
    403,
    `send requires bound session (from=${from}); no registry entry found for cwd=${process.cwd()} or its ancestors. To register manually: echo '{"session_id":"manual-'$$'","cwd":"'$(pwd)'"}' | node scripts/mailbox-session-register.mjs --project <name> --agent claude. SessionStart hooks: .claude/settings.local.json (Claude) / .codex/hooks.json (Codex).`
  );
}
if (project && project !== sessionProject) {
  throw new ClientError(
    400,
    `session bound to project "${sessionProject}" but --project="${project}" given (corporate isolation contract)`
  );
}
const effectiveProject = sessionProject;
```

Заменить последующие ссылки `project` в `handleSend` на `effectiveProject` (grep: `threadExists`, `generateMessageFile`).

**Semantic contract v5**:
| Registry state | Behavior |
|---|---|
| binding found | accept if `--project` matches OR omitted; reject if mismatch |
| no binding | **REJECT 403** (universal fail-closed) |

**Import update для mailbox.mjs**:
```js
// В existing import block from "./mailbox-lib.mjs":
resolveCallerProject,
```

**Manual-testing workflow**: seed a session first via stdin-piped register as `claude` or `codex` (user-sender больше не существует), then send. Documented в error message + `local-*.md`.

**Usage text update** в `scripts/mailbox.mjs` L107 (usageText):
```diff
-  "  node scripts/mailbox.mjs send --from <user|claude|codex> --to <claude|codex> ..."
+  "  node scripts/mailbox.mjs send --from <claude|codex> --to <claude|codex> ..."
```

### Change 4 — Codex-side session registration via hooks

**Problem**: `.codex` — 0-byte marker file; реально Codex hooks в репо нет. Claude sessions регистрируются через `.claude/settings.local.json` SessionStart hook, а Codex sessions — не регистрируются. Без registry `resolveCallerProject` возвращает "" для Codex cwd → `handleSend` fallback на `--project` as-is → G4 защита для Codex не работает.

**Solution (Option A only — Option B launcher-pre-population dropped per Codex R2 Blocker 1)**:

**Rationale для drop Option B**: `mailbox-session-register.mjs` читает stdin (see L90-105) и exit'ит при пустом raw или отсутствии `session_id`. Launcher вызов `node mailbox-session-register.mjs --project workflow <nul` не отправляет session payload → script тихо exits без регистрации. V-probe «grep command string in launcher» = false positive.

**Решение**: используем Codex CLI hooks на WSL. Per wiki `sources/openai-codex-hooks-docs` (verified 2026-04-16 official docs): `SessionStart` event получает stdin `{session_id, cwd, hook_event_name, source, model}`, что идентично contract'у `mailbox-session-register.mjs` expects. Feature gate: `codex_hooks = true` в `[features]`.

**Шаги**:

### 0. Gitignore carve-out (Codex R4 Blocker 1)

Current `.gitignore:17` has `.codex` (blanket ignore). Per git spec: «It is not possible to re-include a file if a parent directory of that file is excluded» — значит `!.codex/config.toml` не сработает. Решение: заменить blanket ignore на **session-state only**:

Diff для `.gitignore`:
```diff
-# Codex CLI sandbox state (personal, per-session)
-.codex
+# Codex CLI session state (personal, per-session) — keep config.toml + hooks.json tracked
+.codex/sessions/
```

После этого `.codex/` directory становится tracked; только `.codex/sessions/` (per-user Codex state) остаётся ignored.

### 1. `.codex` file-to-directory migration:

0-byte marker `.codex` is UNTRACKED (gitignored). `git rm` fails с «did not match any files». Правильный подход — regular fs operations:

```bash
# Verify current state:
git check-ignore -v .codex      # expect match (gitignored)
git ls-files .codex              # expect empty (untracked)

# Remove ignored marker file; then (after .gitignore edit) repopulate as dir:
rm .codex                        # untracked file removal, no git concern
mkdir -p .codex                  # create directory
# → git add .gitignore .codex/config.toml .codex/hooks.json (after files created)
```

Если `rm .codex` fails с EBUSY / file-lock (Windows NTFS + running Codex держит handle) → **STOP**. User kills all Codex processes (Windows `codex.exe`, WSL `codex`), retry.

2. Создать `.codex/config.toml`:


```toml
# Per-project Codex CLI config for workflow repo
# Enables hooks system (experimental per OpenAI docs; stable on WSL)
[features]
codex_hooks = true
```

3. Создать `.codex/hooks.json` **с absolute command path** (Codex R4 High 3 — relative `node scripts/...` breaks если hook fires с subdir cwd):

```bash
# На execute Codex вычисляет absolute repo path:
REPO_ABS="$(pwd)"                # = /mnt/e/Project/workflow в WSL
cat > .codex/hooks.json <<JSON
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          {
            "type": "command",
            "command": "node $REPO_ABS/scripts/mailbox-session-register.mjs --project workflow --agent codex",
            "timeout": 5
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node $REPO_ABS/scripts/mailbox-session-register.mjs --project workflow --agent codex",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
JSON
```

**Known limitation**: hardcoded absolute path means если user relocates repo → `.codex/hooks.json` must be regenerated. Document в §7 Out of scope + user-level `local-*.md`.

4. **User-level prerequisite** — если user's `~/.codex/config.toml` ещё не имеет `codex_hooks = true` в `[features]`, project-level может быть недостаточно (per docs config hierarchy). Document в §11 Notes + в `local-claude-codex-mailbox-workflow.md` Change 5 — pre-setup step для user. Not auto-installable (touch user-global config = out of scope).

**Windows-native Codex**: hooks disabled (per OpenAI docs) → G5 closure conditional на WSL. Known limitation — document в §7.

### Change 5 — `local-claude-codex-mailbox-workflow.md` — agent-discipline contract

Добавить секцию (в конец, перед EOF):

```markdown
## Agent isolation contract (corporate-style)

Агент в своём проекте **обязан** использовать ТОЛЬКО следующие data paths:

| Канал | Путь | Автоматически scoped |
|---|---|---|
| CLI | `node scripts/mailbox.mjs <cmd> --project <own-project>` | ✅ validation + session-binding |
| HTTP | `/api/agent/messages?project=<own>` | ✅ middleware |
| HTTP delivery | `/api/agent/runtime/deliveries?session_id=...&project=<own>` | ✅ session scope check |

Агент **не обязан** использовать:
- `/api/messages*` — user admin endpoints (multi-project view для human reviewer).
- `/api/runtime/state` без session — админ-обзор.
- Direct FS reads под `agent-mailbox/` — read-only fallback, skip validation.

Если агент случайно дёрнет admin endpoint — он получит letters чужих проектов. Discipline contract: **не делать этого**. Corporate-isolation closure строится на CLI + `/api/agent/*` paths, остальное — human admin domain.
```

---

## §5 Verification phases

### Phase 1 — Codex (WSL)

| # | Check | Expected |
|---|-------|----------|
| V1 | `node --check` on modified JS | PASS for mailbox-lib, mailbox, session-register |
| V2 | `cd dashboard && npx vite build` | ✓ built (unchanged — UI не трогаем) |
| V3 | grep `toHostPath` export в mailbox-lib | ≥1 |
| V4 | grep `resolveCallerProject` export в mailbox-lib | ≥1 |
| V5 | grep `import { toHostPath` (or similar) в session-register | =1 |
| V6 | session-register не содержит own `function toHostPath` | count=0 |
| V7 | `handleSend` contains `resolveCallerProject` invocation | ≥1 |
| V8 | Empirical agent mismatch: `mailbox.mjs send --from claude --project other-proj` из cwd=workflow с registry bound to workflow → reject | exit≠0, stderr mentions «session bound» |
| V9 | Empirical agent match: `mailbox.mjs send --from claude --project workflow` из cwd=workflow с matching registry → success | exit=0, relativePath printed |
| V10 | **Universal fail-closed empty-registry**: `mailbox.mjs send --from <any> --project workflow` с empty registry → REJECT 403 (все senders) | exit≠0, stderr «requires bound session» |
| V10b | **`--from user` removed entirely**: `mailbox.mjs send --from user ...` → REJECT 400 «from must be claude or codex» (sender-level closure per R5 B1) | exit≠0, «from must be "claude" or "codex"» |
| V10c | Ancestor-walk: registry cwd=/mnt/e/Project/workflow; `cd scripts && mailbox.mjs send --from claude --project workflow` → success | exit=0 |
| V10d | Manual-test workflow (v7 syntax): seed session via stdin-piped register, then `--from claude` send → success | exit=0 |
| V11 | `resolveCallerProject` cross-OS path match + ancestor walk — session entry cwd=Windows-form, resolve called from POSIX subdir → returns project | node script PASS |
| V12 | `.codex` replaced с directory; `.codex/config.toml` contains `codex_hooks = true`; `.codex/hooks.json` parseable JSON с SessionStart + Stop entries invoking `--agent codex` | test -d + grep `codex_hooks = true` + jq parse + grep `--agent codex` |
| V13 | session-register `--agent` default backward-compat: `echo '{"session_id":"t1","cwd":"/mnt/e/Project/workflow"}' \| node scripts/mailbox-session-register.mjs --project workflow` → registers entry с `agent:"claude"` (no --agent arg). И `--agent codex` variant → `agent:"codex"` | both entries present с правильным agent field |
| V13b | Empirical via mock stdin: `--agent codex` path writes `agent: "codex"` в sessions.json | jq `.sessions[] \| select(.agent=="codex") \| .project == "workflow"` → true |
| V14 | Existing user-facing endpoints unchanged: `curl /api/messages` без project → 200 (multi-project) | HTTP 200, response includes all projects |
| V15 | PD scan clean | `--scan done` |
| V16 | Whitelist drift | only whitelisted files + 3 handoff |

Verification commands:

```bash
# V1-V2
node --check scripts/mailbox-lib.mjs && node --check scripts/mailbox.mjs \
  && node --check scripts/mailbox-session-register.mjs && echo "V1 PASS"
cd dashboard && npx vite build 2>&1 | tail -3

# V3-V7 grep
grep -cE '^export function toHostPath' scripts/mailbox-lib.mjs              # V3 =1
grep -cE '^export async function resolveCallerProject' scripts/mailbox-lib.mjs  # V4 =1
grep -cE 'toHostPath' scripts/mailbox-session-register.mjs                  # V5 ≥1 (import or usage)
grep -cE '^function toHostPath' scripts/mailbox-session-register.mjs         # V6 =0
grep -cE 'resolveCallerProject' scripts/mailbox.mjs                          # V7 ≥1

# V8-V10c — CLI send binding
RT=mailbox-runtime
mkdir -p $RT
CWD_HOST=$(pwd)
echo "[{\"session_id\":\"test-x\",\"agent\":\"claude\",\"project\":\"workflow\",\"cwd\":\"$CWD_HOST\",\"last_seen\":\"$(date -u +%FT%TZ)\"}]" > $RT/sessions.json

# V8 — agent mismatch rejected
node scripts/mailbox.mjs send --from claude --to codex --thread corp-iso-v8 --project other-proj --body x 2>&1 | tail -3
# expect «session bound to project "workflow"...»

# V9 — agent match accepted
node scripts/mailbox.mjs send --from claude --to codex --thread corp-iso-v9 --project workflow --body y 2>&1 | tail -3
# expect relativePath

# V10 — fail-closed empty registry (agent path)
mv $RT/sessions.json $RT/sessions.json.bak
node scripts/mailbox.mjs send --from claude --to codex --thread corp-iso-v10 --project workflow --body z 2>&1 | tail -3
# expect «requires bound session» — exit≠0

# V10b — user sender removed entirely
node scripts/mailbox.mjs send --from user --to codex --thread corp-iso-v10b --project workflow --body w 2>&1 | tail -3
# expect «from must be "claude" or "codex"» — exit≠0 (sender-level closure)

# V10d — manual-test workflow: seed session then send as claude (v7: user sender removed)
echo "[{\"session_id\":\"manual-test\",\"agent\":\"claude\",\"project\":\"workflow\",\"cwd\":\"$(pwd)\",\"last_seen\":\"$(date -u +%FT%TZ)\"}]" > $RT/sessions.json
node scripts/mailbox.mjs send --from claude --to codex --thread corp-iso-v10d --project workflow --body m 2>&1 | tail -3
# expect relativePath

# V10c — ancestor walk: restore registry, cd scripts, send agent
mv $RT/sessions.json.bak $RT/sessions.json
(cd scripts && node mailbox.mjs send --from claude --to codex --thread corp-iso-v10c --project workflow --body a 2>&1 | tail -3)
# expect relativePath (ancestor binding matches)

# V11 — cross-OS path + ancestor
node -e "
import('./scripts/mailbox-lib.mjs').then(async (m) => {
  const fs = await import('node:fs/promises');
  const rt = '/tmp/mon-v11-' + process.pid;
  await fs.mkdir(rt, {recursive:true});
  const winCwd = 'E:\\\\Project\\\\workflow';
  await fs.writeFile(rt + '/sessions.json', JSON.stringify([{
    session_id:'t', agent:'claude', project:'workflow', cwd: winCwd, last_seen: new Date().toISOString()
  }]));
  // subdir POSIX cwd (ancestor of entry's Windows form via toHostPath):
  const posixSubdir = '/mnt/e/Project/workflow/scripts';
  const got = await m.resolveCallerProject({ cwd: posixSubdir, runtimeRoot: rt });
  console.log('V11:', got === 'workflow' ? 'PASS' : 'FAIL got=' + got);
  await fs.rm(rt, {recursive:true, force:true});
});
" 2>&1

# V12 — codex hooks artefact
test -d .codex && echo "V12a: .codex is directory"
grep -qE 'codex_hooks\s*=\s*true' .codex/config.toml && echo "V12b: codex_hooks=true"
node -e "JSON.parse(require('fs').readFileSync('.codex/hooks.json','utf8'))" && echo "V12c: hooks.json valid JSON"
grep -q -- '--agent codex' .codex/hooks.json && echo "V12d: --agent codex wired"

# V13 — session-register agent param + backward compat
# Mock POST endpoint для проверки (supervisor running):
echo '{"session_id":"v13-claude","cwd":"'$(pwd)'"}' | node scripts/mailbox-session-register.mjs --project workflow 2>&1
echo '{"session_id":"v13-codex","cwd":"'$(pwd)'"}' | node scripts/mailbox-session-register.mjs --project workflow --agent codex 2>&1
sleep 1
# Inspect persisted runtime sessions.json (write from supervisor)
jq '.[] | {session_id, agent}' mailbox-runtime/sessions.json 2>&1
# expect: v13-claude → claude, v13-codex → codex

# V13b — aggregate check
jq '[.[] | {session_id, agent, project}] | map(select(.session_id=="v13-codex")) | .[0].agent' mailbox-runtime/sessions.json
# expect: "codex"

# V14 — user dashboard unchanged
curl -s http://127.0.0.1:3003/api/messages | jq '.toClaude|length, .toCodex|length'
# expect numbers (not 400)

# V15 PD scan
PD_PATTERNS='$PD_PATTERNS'
grep -riE "$PD_PATTERNS" --include="*.js" --include="*.jsx" --include="*.mjs" --include="*.json" dashboard/ scripts/ 2>/dev/null
grep -riE "$PD_PATTERNS" --include="*.md" CLAUDE.md README.md README.ru.md local-*.md workflow-*.md 2>/dev/null
echo "--scan done"

# V16 whitelist drift
git status --short
```

### Phase 2 — user visual `[awaits user]`

| # | Check |
|---|-------|
| P2.1 | Dashboard unchanged — «All projects» view работает, admin endpoints 200 OK (backwards compat). |
| P2.2 | В Codex-терминале (пусть cwd=project1) попытаться отправить письмо `--project project2` → CLI rejects с «session bound» error. |
| P2.3 | Codex registration: после перезапуска Codex session, `cat mailbox-runtime/sessions.json \| jq` показывает Codex entry с правильным project. |

### Phase 3 — cross-OS
V11 cover'ит Windows↔WSL path match. Reboot test не нужен.

---

## §6 Acceptance criteria

- [ ] Phase 1 V1-V16 PASS
- [ ] Report §0-§11 filled
- [ ] No files outside whitelist
- [ ] PD scan clean
- [ ] `dashboard/server.js` UNCHANGED
- [ ] `dashboard/supervisor.mjs` UNCHANGED
- [ ] `dashboard/src/api.js` UNCHANGED
- [ ] Frontmatter schema UNCHANGED
- [ ] Archive FS layout UNCHANGED
- [ ] No commit/push без user command
- [ ] Phase 2 awaits user

---

## §7 Out of scope

- User-facing dashboard endpoints (`/api/messages*`, `/api/runtime/state`) — legitimate admin view, не закрываем.
- UI «All projects» dropdown — keep.
- FS-level isolation (`archive/<project>/<thread>/`) — defense-in-depth, отдельная фаза.
- Auth (127.0.0.1 only).
- Per-project FS encryption.
- **Windows-native Codex** session registration — hooks disabled на Windows native. WSL Codex → covered; direct `codex.exe` → unprotected.
- Auto-install `codex_hooks = true` в user-level `~/.codex/config.toml` — manual.
- **Repo-relocation**: `.codex/hooks.json` hardcodes absolute path at generation time. Relocating repo → regenerate hooks.json. Manual step.

---

## §8 Rollback

```bash
git checkout -- scripts/mailbox.mjs scripts/mailbox-lib.mjs scripts/mailbox-session-register.mjs
rm -rf .codex && touch .codex  # restore 0-byte marker (git-tracked)
git checkout -- local-claude-codex-mailbox-workflow.md
```

Launcher `start-workflow-codex.cmd` не трогаем, поэтому нечего откатывать.

После commit: `git revert <sha>`.

---

## §9 Discrepancy checkpoints (STOP)

1. Baseline HEAD ≠ `092c725` → STOP.
2. Dirty files beyond `dashboard/src/App.jsx` (или expected untracked docs) → STOP (user должен rebase).
3. `dashboard/server.js` / `supervisor.mjs` / `api.js` / `App.jsx` (кроме sound-fix scope) modified → STOP — violates «unchanged» contract.
4. Frontmatter schema change → STOP.
5. Archive FS layout change → STOP.
6. Phase 1 V1-V16 any FAIL → STOP.
7. V8 cross-project send not rejected → STOP (G4 regression).
8. V10 empty-registry agent send returns success → STOP (fail-closed violation).
8b. V10b user path empty-registry rejected → STOP (admin path regression).
8c. V10c ancestor-walk send fails → STOP (subdir case broken).
8d. V10b `--from user` accepts → STOP (sender-level closure broken per R5 B1).
9. V14 user-facing /api/messages returns 400 → STOP (we'd be re-breaking user UX).
10. V15 PD hit → STOP.
11. V16 whitelist drift → STOP.

---

## §10 Self-audit checklist

- [ ] 1: Pre-flight P1-P5 OK (only App.jsx + docs dirty)
- [ ] 2: Change 1 — mailbox-lib exports toHostPath + resolveCallerProject
- [ ] 3: Change 2 — session-register imports toHostPath (local copy removed)
- [ ] 4: Change 3 — mailbox.mjs handleSend session-binding
- [ ] 5: Change 4 — Codex hooks (`.codex/` directory + config.toml + hooks.json)
- [ ] 6: Change 5 — agent-discipline contract в local-*.md
- [ ] 7: V1-V16 recorded verbatim
- [ ] 8: V15 PD scan clean
- [ ] 9: V16 whitelist drift clean
- [ ] 10: No commit/push
- [ ] 11: Discrepancies recorded
- [ ] 12: Report §0-§11 filled
- [ ] 13: dashboard/server.js UNCHANGED
- [ ] 14: dashboard/supervisor.mjs UNCHANGED
- [ ] 15: dashboard/src/api.js UNCHANGED
- [ ] 16: App.jsx drift only на sound-fix lines (выйти за них = STOP)

≥14/16 OK → ready for review.

---

## §11 Notes to Codex

- Environment: WSL, `cwd=/mnt/e/Project/workflow`.
- Baseline: HEAD=`092c725`. `dashboard/src/App.jsx` уже dirty (sound-fix WIP, не твой scope).
- No commit/push без user command.
- Этот план закрывает `project_isolation_open_followup.md` memory-flag для **CLI+agent** путей. User-facing dashboard остаётся intentionally open (human admin view).
- Change 4: Option A only (Codex hooks on WSL). Option B launcher-pre-population dropped — non-functional (register читает stdin). Confirmed via wiki `sources/openai-codex-hooks-docs` (verified OpenAI official docs 2026-04-16): SessionStart stdin payload совместим с тем что register expects.
- `resolveCallerProject` полагается на `mailbox-runtime/sessions.json` + shared `toHostPath`. V11 empirical покрывает cross-OS path match — ensure passes.
- Если V12 Option B (launcher update) — и launcher сейчас использует `call %~dp0start-workflow.cmd`, вставь register-command **перед** call (не после).
- Не создавай новых top-level files вне whitelist.
- Error bodies следуют existing `{error: string}` схеме.

---

## §12 Commits strategy

Single commit covering Changes 1-5 + 3 handoff artefacts. Message: `feat(mailbox): corporate isolation — agent-path cross-project guard + Codex registration`.
