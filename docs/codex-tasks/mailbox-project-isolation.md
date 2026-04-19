# Mailbox Project Isolation — Execution Plan

**Version**: v1
**Planning-audit**: `docs/codex-tasks/mailbox-project-isolation-planning-audit.md`
**Report template**: `docs/codex-tasks/mailbox-project-isolation-report.md`
**ТЗ source**: `docs/codex-tasks/mailbox-project-isolation-tz.md`
**Target executor**: Codex (WSL)
**Planner**: Claude (Windows)
**Scope**: ввести строгую project isolation для agent-path mailbox access при сохранении общего multi-project user dashboard. Плюс добавить `received_at` frontmatter field и 3-timestamp card rendering.

---

## §1 Why this plan exists

User отчитал проблему: agent в проекте A получал письма B/C/D. ТЗ `mailbox-project-isolation-tz.md` requires hard separation: user visibility layer может быть multi-project, agent delivery layer строго single-project.

Design agreed через mailbox thread `mailbox-project-isolation-tz` (archived 2026-04-18):

- **Q1** canonical project source = explicit `--project` CLI arg, no cwd autodetect on agent path.
- **Q2** central gate `validateProjectScope` в `mailbox-lib.mjs` shared across CLI/backend/hooks.
- **Q3** split API: `/api/messages` user-facing (multi-project), new `/api/agent/*` agent-only (mandatory project).
- **Q4** 400 + ClientError при missing/mismatched project.
- **Q5** new frontmatter field `received_at` с legacy fallback `received_at = created`.

Plus obligatory UI requirement (Codex reinforced): карточки показывают `thread / created / received_at / archived_at`.

---

## §2 Hierarchy of sources of truth

1. Official docs (Express 5 router, Node fs timestamps, gray-matter field addition) — planning-audit §4.
2. Live code (`scripts/mailbox-lib.mjs`, `scripts/mailbox.mjs`, `dashboard/server.js`, `dashboard/src/api.js`, `dashboard/src/App.jsx`, `local-claude-codex-mailbox-workflow.md`) — planning-audit §3.
3. ТЗ (`docs/codex-tasks/mailbox-project-isolation-tz.md`) — constraints, acceptance criteria.
4. Design agreement thread (archived).
5. This plan — derived.
6. **Discrepancy rule**: Codex обнаружит конфликт → STOP + report §5 Discrepancies.

---

## §3 Doc verification (§V1–§V5)

### §V1 — Express `Router` modular mount

> "The Express Router allows for the creation of modular, mountable route handlers … Routers can be mounted at specific paths using middleware."
>
> — context7.com/expressjs/express/llms.txt (ID `/expressjs/express/v5.2.0`)

**Использование**: `const agentRouter = express.Router(); app.use("/api/agent", agentRouter)`. Agent router валидирует `project` на middleware-level перед каждым handler.

### §V2 — `fs.writeFile` + `fs.rename` atomic

Prior verification (append-notes и supervisor handoffs §V1+V2). Atomic schema write: `writeFile(tmp) → rename(tmp, final)`.

### §V3 — gray-matter field addition backward-compatible

Prior verification (append-notes handoff §V3). Adding `received_at` field к frontmatter не ломает existing parse; missing field = `undefined`; reader provides fallback.

### §V4 — Express 5 try/catch + sendClientError pattern

Prior. New `/api/agent/*` handlers mirror existing pattern from `dashboard/server.js` (lines 41, 90, 128, 166).

### §V5 — `ClientError(400, ...)` in-repo

`scripts/mailbox-lib.mjs:42`. Existing mechanism, used by все validators.

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
- HEAD = `92231a4` или newer. Если newer touches whitelist → STOP + Discrepancy.
- Baseline drift model (precedent-confirmed): preserved `M` outside whitelist OK если verbatim в §0.4 и не трогается; **новый** M/?? outside whitelist во время execution → STOP.

### P2 — baseline line counts

```bash
wc -l scripts/mailbox-lib.mjs scripts/mailbox.mjs dashboard/server.js dashboard/src/api.js dashboard/src/App.jsx local-claude-codex-mailbox-workflow.md .gitignore dashboard/package.json
```

Expected (post-`92231a4`):

| File | Lines |
|------|-------|
| `scripts/mailbox-lib.mjs` | 674 |
| `scripts/mailbox.mjs` | 322 |
| `dashboard/server.js` | 159 |
| `dashboard/src/api.js` | 61 |
| `dashboard/src/App.jsx` | 1544 |
| `local-claude-codex-mailbox-workflow.md` | 796 |
| `.gitignore` | 16 |
| `dashboard/package.json` | 26 |

Drift >5 lines на любом whitelist file → STOP.

### P3 — empirical received_at fallback

```bash
cd dashboard && node -e "
const matter = require('gray-matter');
function toTs(v) {
  if (typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString().replace(/\.\d{3}Z\$/, 'Z');
  return '';
}
const legacy = '---\nthread: t\nfrom: claude\nto: codex\ncreated: 2026-04-18T10:00:00Z\nproject: workflow\n---\nBody';
const p = matter(legacy);
const createdStr = toTs(p.data.created);
const receivedAt = typeof p.data.received_at === 'string' ? p.data.received_at : createdStr;
console.log('legacy fallback ok:', receivedAt === '2026-04-18T10:00:00Z');
"
```

**Expected**: `legacy fallback ok: true`. FAIL → STOP.

### P4 — baseline build

```bash
cd dashboard && npx vite build 2>&1 | tail -5
```

**Expected**: `✓ built`. Baseline size ≈ 224.82 kB.

### P5 — existing routes sanity

```bash
grep -n 'app.post\|app.get\|app.listen' dashboard/server.js
```

**Expected** (post-`92231a4`):
- `/api/messages` (GET), `/api/messages/:dir` (GET), `/api/archive` (POST), `/api/notes` (POST), `app.listen`.

New `app.use("/api/agent", agentRouter)` mount не конфликтует.

---

## §5 Whitelist — only these files may be modified

| File | Purpose | Status |
|------|---------|--------|
| `scripts/mailbox-lib.mjs` | +`validateProjectScope` gate; +`received_at` emit в `generateMessageFile`; +`received_at` read+fallback в `readMessage` | modify |
| `scripts/mailbox.mjs` | remove cwd fallback; `--project` mandatory на `send`/`list`/`recover`; pass через `validateProjectScope` | modify |
| `dashboard/server.js` | +`/api/agent` router mount с mandatory `project` query-param validation; existing `/api/messages` user-facing сохраняется | modify |
| `dashboard/src/api.js` | +`fetchAgentMessages({project})` wrapper | modify |
| `dashboard/src/App.jsx` | Card rendering: 3-timestamp block (created / received_at / archived_at) с localized labels; translations ru+en | modify |
| `local-claude-codex-mailbox-workflow.md` | Spec carve-out: project mandatory rule + `received_at` schema section | modify |

**НЕ ТРОГАТЬ**:
- `dashboard/package.json`, `package-lock.json` (no new deps)
- `dashboard/vite.config.js`, `dashboard/index.html`, `dashboard/public/*`
- `agent-mailbox/**` (runtime data — migration не делается)
- `docs/codex-tasks/*` кроме этой handoff-тройки
- `CLAUDE.md`, `README.md`, `README.ru.md`, `LICENSE`
- `.github/workflows/ci.yml`
- Supervisor Phase A artefacts (остаются на hold)
- любые новые файлы

---

## §6 Changes

### Change 1 — `scripts/mailbox-lib.mjs`

**Change 1.1** — добавить `validateProjectScope` после `normalizeProject` (после line 64):

```js
export function validateProjectScope(currentProject, message) {
  const nextCurrent = normalizeProject(currentProject);

  if (!nextCurrent) {
    throw new ClientError(400, "project is required for agent-path operations");
  }

  const messageProject = normalizeProject(message?.project);

  if (!messageProject) {
    throw new ClientError(400, "target message has no project — cannot validate scope");
  }

  if (nextCurrent !== messageProject) {
    throw new ClientError(
      400,
      `project scope mismatch: agent bound to "${nextCurrent}", message belongs to "${messageProject}"`
    );
  }

  return {
    project: nextCurrent
  };
}
```

**Change 1.2** — `readMessage` (line ~374) добавить нормализованный `received_at`:

**Current** (fragment around line 374 post-baseline):

```js
    project:
      typeof parsed.data.project === "string"
        ? normalizeProject(parsed.data.project)
        : "",
    status: typeof parsed.data.status === "string" ? parsed.data.status : "pending",
    resolution:
      typeof parsed.data.resolution === "string" ? parsed.data.resolution : "",
    created,
```

**Target** — добавить `received_at` строку после `created`:

```js
    project:
      typeof parsed.data.project === "string"
        ? normalizeProject(parsed.data.project)
        : "",
    status: typeof parsed.data.status === "string" ? parsed.data.status : "pending",
    resolution:
      typeof parsed.data.resolution === "string" ? parsed.data.resolution : "",
    created,
    received_at: toMessageTimestamp({
      data: { created: parsed.data.received_at ?? parsed.data.created }
    }),
```

**Rationale**: `toMessageTimestamp` уже обрабатывает Date/string дуализм. Fallback к `parsed.data.created` если `received_at` отсутствует (legacy messages). Normalized output consistent с `created` format.

**Change 1.3** — `generateMessageFile` (line ~476) записывать `received_at` в frontmatter:

Внутри build `data` object (поиском по `const data = {`):

```js
  const data = {
    id,
    thread: nextThread,
    from: nextFrom,
    to: nextTarget,
    status: "pending",
    created,
    received_at: created
  };
```

(В file-based режиме без отдельного delivery layer `received_at = created` initially. Поле явно присутствует во frontmatter — schema-ready для later delivery-layer populate.)

**Change 1.4** — `recoverOrphans` (line ~666) добавить `project` в returned items:

**Current**:

```js
    recovered.push({
      relativePath: message.relativePath,
      archivedTo: archived.archivedTo,
      answerMessageId: matchingReply.id
    });
```

**Target**:

```js
    recovered.push({
      relativePath: message.relativePath,
      archivedTo: archived.archivedTo,
      answerMessageId: matchingReply.id,
      project: message.project || ""
    });
```

**Rationale**: `handleRecover` в Change 2.3 фильтрует по `item.project`; без этого поля filter всегда вернёт empty. Это prerequisite для 2.3.

### Change 2 — `scripts/mailbox.mjs`

**Change 2.1** — усилить `handleSend` (удалить cwd fallback):

**Current** (lines 125-128):

```js
  const from = validateSender(options.from);
  const thread = validateThread(options.thread);
  const explicitProject = normalizeProject(options.project);
  const project = explicitProject || path.basename(process.cwd());
```

**Target**:

```js
  const from = validateSender(options.from);
  const thread = validateThread(options.thread);
  const project = normalizeProject(options.project);
  if (!project) {
    throw new ClientError(
      64,
      '--project is required (agent-path isolation); cwd autodetect removed per ТЗ'
    );
  }
```

**Change 2.2** — `handleList` require mandatory project:

**Current** (lines 161-163):

```js
  const bucket = sanitizeString(options.bucket) || "all";
  const project = normalizeProject(options.project);
  const messages = await collectMailboxMessages(mailboxRoot);
```

**Target**:

```js
  const bucket = sanitizeString(options.bucket) || "all";
  const project = normalizeProject(options.project);
  if (!project) {
    throw new ClientError(
      64,
      '--project is required (agent-path list must be scoped to one project)'
    );
  }
  const messages = await collectMailboxMessages(mailboxRoot);
```

**Change 2.3** — `handleRecover` require mandatory project:

**Current** (line 258-262):

```js
async function handleRecover(args) {
  const options = parseOptions(args, {
    json: { type: "boolean" }
  });
  const recovered = await recoverOrphans(mailboxRoot);
```

**Target**:

```js
async function handleRecover(args) {
  const options = parseOptions(args, {
    project: { type: "string" },
    json: { type: "boolean" }
  });
  const project = normalizeProject(options.project);
  if (!project) {
    throw new ClientError(
      64,
      '--project is required (recover scoped to single project)'
    );
  }
  const allRecovered = await recoverOrphans(mailboxRoot);
  const recovered = allRecovered.filter((item) => {
    return item.project === project;
  });
```

**Note**: Change 1.4 (выше) добавляет `project` в `recoverOrphans` output. Filter here зависит от этого поля — применять 1.4 **до** 2.3 (already в Mandatory order §7: «Change 1 (lib) first»).

**Change 2.4** — `handleReply` scope-check:

**Current** (lines 197-200):

```js
  const from = validateSender(options.from);
  const targetMessage = await readMessageByRelativePath(options.to, mailboxRoot);
  const body = await readBody(options);
  const to = getReplyTargetForMessage(targetMessage, from);
```

**Target** — добавить project validation после read:

```js
  const from = validateSender(options.from);
  const explicitProject = normalizeProject(options.project);
  if (!explicitProject) {
    throw new ClientError(
      64,
      '--project is required (reply must stay within agent session project)'
    );
  }
  const targetMessage = await readMessageByRelativePath(options.to, mailboxRoot);
  validateProjectScope(explicitProject, targetMessage);
  const body = await readBody(options);
  const to = getReplyTargetForMessage(targetMessage, from);
```

Plus add `project: { type: "string" }` в parseOptions схему reply.

**Change 2.5** — `handleArchive` scope-check analogously:

```js
async function handleArchive(args) {
  const options = parseOptions(args, {
    path: { type: "string" },
    project: { type: "string" },
    resolution: { type: "string" },
    json: { type: "boolean" }
  });
  const explicitProject = normalizeProject(options.project);
  if (!explicitProject) {
    throw new ClientError(
      64,
      '--project is required (archive scoped to single project)'
    );
  }
  const targetMessage = await readMessageByRelativePath(options.path, mailboxRoot);
  validateProjectScope(explicitProject, targetMessage);
  const archived = await archiveMessageFile({
    relativePath: options.path,
    resolution: validateResolution(options.resolution),
    mailboxRoot
  });
  ...
```

Plus update `usageText()` (lines 102-111) чтобы отражать new mandatory `--project` в `send`/`list`/`reply`/`archive`/`recover`.

**Change 2.6** — import `validateProjectScope` в mailbox.mjs header (line ~4-21):

```js
import {
  archiveMessageFile,
  collectMailboxMessages,
  ClientError,
  defaultMailboxRoot,
  filterMessagesByProject,
  generateMessageFile,
  getReplyTargetForMessage,
  normalizeProject,
  normalizePath,
  readMessageByRelativePath,
  recoverOrphans,
  sanitizeString,
  threadExists,
  validateProjectScope,
  validateResolution,
  validateSender,
  validateThread
} from "./mailbox-lib.mjs";
```

### Change 3 — `dashboard/server.js`

**Change 3.1** — add `validateProjectScope` к imports:

**Current** imports список (lines 2-18): 14 names. **Target** — add `validateProjectScope` alphabetically:

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
  validateProjectScope,
  validateRelativeInboxPath,
  validateResolution
} from "../scripts/mailbox-lib.mjs";
```

**Change 3.2** — добавить `/api/agent` router после existing `/api/notes` handler (line ~155), перед `app.listen` (line 157):

```js
const agentRouter = express.Router();

agentRouter.use((request, response, next) => {
  const project = normalizeProject(request.query.project || request.body?.project);
  if (!project) {
    response.status(400).json({ error: "project query/body param is required for /api/agent/*" });
    return;
  }
  request.agentProject = project;
  next();
});

agentRouter.get("/messages", async (request, response) => {
  try {
    const [allToClaude, allToCodex, allArchive] = await Promise.all([
      readBucket("to-claude", mailboxRoot),
      readBucket("to-codex", mailboxRoot),
      readBucket("archive", mailboxRoot)
    ]);
    const toClaude = filterMessagesByProject(allToClaude, request.agentProject);
    const toCodex = filterMessagesByProject(allToCodex, request.agentProject);
    const archive = filterMessagesByProject(allArchive, request.agentProject);
    response.json({ toClaude, toCodex, archive, project: request.agentProject });
  } catch (error) {
    response.status(500).json({
      error: "Failed to read agent mailbox",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

app.use("/api/agent", agentRouter);
```

**Rationale**: middleware enforces mandatory `project` на всех `/api/agent/*` routes (single source). Downstream handlers just use `request.agentProject` — cannot accidentally skip validation. `/api/messages` остаётся intact для user dashboard.

### Change 4 — `dashboard/src/api.js`

Добавить в конец файла:

```js
export async function fetchAgentMessages({ project, signal } = {}) {
  if (!project) {
    throw new Error("project is required for fetchAgentMessages");
  }
  const params = new URLSearchParams({ project });
  const response = await fetch(`/api/agent/messages?${params.toString()}`, {
    cache: "no-store",
    signal
  });
  return parseJsonResponse(response, `Agent API returned ${response.status}`);
}
```

### Change 5 — `dashboard/src/App.jsx`

**Change 5.1** — translations (ru, после `noTimestamp`):

```js
    noTimestamp: "Нет даты",
    timestampSent: "Отправлено",
    timestampReceived: "Получено",
    timestampArchived: "Архивировано",
```

И en block аналогично:

```js
    noTimestamp: "No timestamp",
    timestampSent: "Sent",
    timestampReceived: "Received",
    timestampArchived: "Archived",
```

**Change 5.2** — replace single timestamp div (line ~1036) на multi-timestamp block:

**Current**:

```jsx
        <div className="timestamp">{formatTimestamp(message.created, lang, t)}</div>
```

**Target**:

```jsx
        <div className="cardTimestamps">
          <span className="timestamp">
            <span className="timestampLabel">{t.timestampSent}:</span>{" "}
            {formatTimestamp(message.created, lang, t)}
          </span>
          <span className="timestamp">
            <span className="timestampLabel">{t.timestampReceived}:</span>{" "}
            {formatTimestamp(message.received_at || message.created, lang, t)}
          </span>
          {message.metadata?.archived_at ? (
            <span className="timestamp">
              <span className="timestampLabel">{t.timestampArchived}:</span>{" "}
              {formatTimestamp(message.metadata.archived_at, lang, t)}
            </span>
          ) : null}
        </div>
```

**Rationale**: Received всегда видим (user requirement: обязательное поле на карточке; в file-based режиме initially совпадает с Sent — это intended state до Phase C delivery layer). `archived_at` conditional (только для archived messages). Labels localized. Fallback `received_at || created` защищает legacy messages без field.

**Change 5.3** — CSS (в styles template string):

```css
  .cardTimestamps {
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-items: flex-end;
    flex-shrink: 0;
    font-size: 12px;
    color: var(--text-muted);
  }
  .timestampLabel {
    font-weight: 700;
    color: var(--text-accent);
  }
```

Apply after existing `.timestamp` rule (~line 661).

### Change 6 — `local-claude-codex-mailbox-workflow.md`

**Change 6.1** — добавить новый section после `### Message format` (currently finishes around line 287 post-baseline):

```markdown
### Project field is mandatory

Для agent-path operations поле `project` обязательно:

- все agent-authored messages **должны** иметь `project` во frontmatter;
- agent CLI команды (`send`, `list`, `reply`, `archive`, `recover`) требуют явного `--project` флага;
- cwd-basename autodetect как project source **удалён** из agent flow;
- отсутствие project = validation error (400 / ClientError), не runtime branch.

Dashboard user-facing endpoints (`/api/messages`) остаются multi-project (user видит все проекты). Agent-facing endpoints (`/api/agent/*`) требуют mandatory `project` query param; cross-project access из agent-path запрещён.

Canonical source текущего project для agent session = explicit bound project через CLI flag или API param, никогда не cwd.
```

**Change 6.2** — добавить после предыдущего section:

```markdown
### `received_at` timestamp field

Frontmatter содержит три timestamp field:

- `created` — writer-side отправка (sender's clock, UTC ISO);
- `received_at` — recipient-side первое принятие сообщения mailbox infrastructure (UTC ISO);
- `archived_at` — момент архивирования (UTC ISO, добавляется при move в archive).

Для legacy messages без `received_at` reader обеспечивает fallback `received_at = created`. Новые messages пишут `received_at` явно во frontmatter; в current file-based режиме без отдельного delivery layer writer initially sets `received_at = created`. Schema подготовлена для later delivery-layer expansion (Phase C supervisor handoff populates `received_at` = supervisor polling moment).

Dashboard UI показывает все три timestamps на каждой карточке с localized labels (Отправлено / Получено / Архивировано).
```

---

## §7 Verification phases

### Phase 1 — Codex-only

**Mandatory order**: Change 6 (spec) + Change 1 (lib gate+schema) apply first — они dependencies для downstream. Change 2 (CLI) + Change 3 (server) + Change 4 (api) + Change 5 (App) — independent after that. Finally V1-V9.

| # | Check | Expected |
|---|-------|----------|
| V1 | `validateProjectScope` exported | `function` |
| V2 | CLI send без `--project` — 64 error | `--project is required` message |
| V3 | CLI list без `--project` — 64 error | `--project is required` message |
| V4 | `/api/agent/messages` без project — 400 | JSON error "project query/body param is required" |
| V5 | `/api/agent/messages?project=workflow` — 200 + filtered JSON | `toClaude/toCodex/archive` arrays only workflow messages |
| V6 | Build | `✓ built` |
| V7 | spec carve-out persisted | grep «Project field is mandatory» + «received_at» = 2 hits |
| V8 | Personal data scan (production paths only) | только `--scan done` |
| V9 | Whitelist respected | 6 whitelist files + 3 handoff artefacts + preserved baseline drift из §0.4 (unchanged); новый M/?? outside whitelist не в §0.4 → STOP |

Verification commands (fenced, copy-paste safe):

```bash
# V1
cd dashboard && node -e "import('../scripts/mailbox-lib.mjs').then(m => console.log(typeof m.validateProjectScope))"

# V2 — exit status captured без pipe suppression (bash PIPESTATUS alternative: separate run)
node scripts/mailbox.mjs send --from claude --to codex --thread test-v2 --body dummy
echo "EXIT:$?"
# Expected: "--project is required" stderr + EXIT:64

# V3 — same pattern
node scripts/mailbox.mjs list --bucket to-claude
echo "EXIT:$?"
# Expected: "--project is required" stderr + EXIT:64

# V4 — port freshness guard + listener wait + ownership check
if ss -ltn 2>/dev/null | grep -q ':3003 '; then
  echo "FAIL: port 3003 already busy — kill existing server first"
  exit 1
fi
cd dashboard && node server.js > /tmp/isolation-v4.log 2>&1 &
SERVER_PID=$!
# Wait for listener up to 10s
for i in 1 2 3 4 5 6 7 8 9 10; do
  grep -q 'Server listening' /tmp/isolation-v4.log && break
  sleep 1
done
kill -0 $SERVER_PID 2>/dev/null && grep -q 'Server listening' /tmp/isolation-v4.log || { echo "FAIL: our server not up"; cat /tmp/isolation-v4.log; exit 1; }
curl -s -o /tmp/isolation-v4.out -w "%{http_code}\n" http://127.0.0.1:3003/api/agent/messages
cat /tmp/isolation-v4.out
kill -INT $SERVER_PID
wait $SERVER_PID 2>/dev/null

# V5 — same guard pattern, filtered response
if ss -ltn 2>/dev/null | grep -q ':3003 '; then
  echo "FAIL: port 3003 already busy"
  exit 1
fi
cd dashboard && node server.js > /tmp/isolation-v5.log 2>&1 &
SERVER_PID=$!
for i in 1 2 3 4 5 6 7 8 9 10; do
  grep -q 'Server listening' /tmp/isolation-v5.log && break
  sleep 1
done
kill -0 $SERVER_PID 2>/dev/null && grep -q 'Server listening' /tmp/isolation-v5.log || { echo "FAIL: our server not up"; cat /tmp/isolation-v5.log; exit 1; }
curl -s "http://127.0.0.1:3003/api/agent/messages?project=workflow" | node -e "let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{const j=JSON.parse(d); console.log('project:',j.project,'counts:',j.toClaude.length,j.toCodex.length,j.archive.length);});"
kill -INT $SERVER_PID
wait $SERVER_PID 2>/dev/null

# V6
cd dashboard && npx vite build 2>&1 | tail -5

# V7
grep -c 'Project field is mandatory' local-claude-codex-mailbox-workflow.md
grep -c 'received_at' local-claude-codex-mailbox-workflow.md

# V8
PD_PATTERNS='$PD_PATTERNS'
grep -riE "$PD_PATTERNS" --include="*.js" --include="*.jsx" --include="*.mjs" --include="*.html" --include="*.json" dashboard/ scripts/ 2>/dev/null
grep -riE "$PD_PATTERNS" --include="*.md" CLAUDE.md README.md README.ru.md local-claude-codex-mailbox-workflow.md workflow-*.md 2>/dev/null
echo "--scan done"

# V9
git status --short
```

Any FAIL → STOP.

### Phase 2 — user visual check `[awaits user]`

| # | Check | How |
|---|-------|-----|
| P2.1 | Dashboard загружается, карточки показывают 3 timestamp labels (Отправлено/Получено/Архивировано) | user открывает `http://127.0.0.1:9119/`, визуально подтверждает |
| P2.2 | «Отправлено» и «Получено» показывают одинаковое время для новых messages, «Архивировано» скрыт для pending | user проверяет одну pending карточку |
| P2.3 | Archived card показывает все 3 timestamps | user открывает archive column |
| P2.4 | Agent isolation: `curl http://127.0.0.1:3003/api/agent/messages?project=workflow` возвращает только workflow-сообщения | user или Codex prueba |
| P2.5 | CLI: `node scripts/mailbox.mjs list --bucket to-claude` (без --project) возвращает 64 error | user verifies |
| P2.6 | CLI: `node scripts/mailbox.mjs list --bucket to-claude --project workflow` работает | user verifies |

### Phase 3 — `[awaits N-day]`

Не применимо для изоляции (нет intermittent-failure class).

---

## §8 Acceptance criteria

- [ ] Phase 1 V1-V9 PASS
- [ ] Report §0-§11 заполнен
- [ ] No files outside §5 whitelist modified
- [ ] Build size growth ≤10 kB от baseline 224.82 kB
- [ ] No new personal data leaks (V8)
- [ ] `path.basename(process.cwd())` fallback полностью удалён из mailbox.mjs agent path
- [ ] `validateProjectScope` gate используется во всех agent ops через mailbox.mjs (send/list/reply/archive/recover)
- [ ] `/api/agent/*` middleware rejects missing project с 400
- [ ] Spec doc обновлён: project mandatory + received_at schema
- [ ] Card renders 3 timestamp labels (тема / created / received_at / archived_at)
- [ ] Codex не коммитит и не пушит без explicit user command

---

## §9 Out of scope

- **Supervisor Phase A resume**: остаётся на hold; rebase его baseline после this handoff landing (separate future handoff).
- **Bulk migration legacy messages** в archive: не добавляем `received_at` к старым files — reader fallback покрывает.
- **Auth / access control beyond localhost**: spec prior decision — dashboard localhost-only.
- **Hooks integration**: SessionStart/Stop — Phase B (separate).
- **Delivery signal semantics**: Phase C (separate).
- **UI redesign card layout** beyond 3-timestamp block: не делать.
- **Dashboard default project view**: continue multi-project user view.
- **Tests harness**: нет test framework в repo.

---

## §10 Rollback

**До commit** — non-destructive:

1. `git diff --stat` на whitelist files — проверить что нет unrelated changes.
2. `git stash push -m "isolation-rollback" -- scripts/mailbox-lib.mjs scripts/mailbox.mjs dashboard/server.js dashboard/src/api.js dashboard/src/App.jsx local-claude-codex-mailbox-workflow.md`
3. Смешанные changes → STOP + surface к user.
4. `cd dashboard && npx vite build` — baseline build clean.

**После commit**: `git revert <sha>` (creates revert commit). Legacy messages в `agent-mailbox/` не меняются — их не трогаем.

---

## §11 Discrepancy checkpoints (STOP conditions)

1. P2 baseline drift >5 lines → STOP.
2. P3 empirical FAIL → STOP (schema assumption broken).
3. P4 baseline build FAIL → STOP.
4. P5 existing routes conflict → STOP.
5. Phase 1 V1-V9 any FAIL → STOP.
6. V8 PD match → STOP.
7. V9 whitelist drift → STOP.
8. Модификация `agent-mailbox/**` или supervisor Phase A artefacts во время execution → STOP.
9. Новый `M` outside whitelist not в §0.4 baseline → STOP + surface to user.
10. If `recoverOrphans` в mailbox-lib.mjs не возвращает `project` field в items — это unexpected API gap. STOP + Discrepancy + minimal lib fix mentioned в Change 2.3 note.

---

## §12 Self-audit checklist

- [ ] 1: P1-P5 pre-flight OK
- [ ] 2: Change 1 (lib) — validateProjectScope + received_at emit + read fallback + recoverOrphans project (4 substeps)
- [ ] 3: Change 2 (CLI) — все 6 substeps
- [ ] 4: Change 3 (server) — /api/agent/* mount + middleware
- [ ] 5: Change 4 (api.js) — fetchAgentMessages exported
- [ ] 6: Change 5 (App.jsx) — 3 substeps (translations + JSX + CSS)
- [ ] 7: Change 6 (spec) — 2 carve-out sections
- [ ] 8: V1-V9 recorded verbatim
- [ ] 9: V9 whitelist drift clean
- [ ] 10: No commit/push performed
- [ ] 11: Discrepancies recorded
- [ ] 12: Report §0-§11 filled

≥10/12 OK → ready for user review.

---

## §13 Notes to Codex

- **Environment**: WSL, cwd=`/mnt/e/Project/workflow`.
- **Planning snapshot**: HEAD=`92231a4`.
- **Anti-fabrication**: все V1-V9 outputs verbatim.
- **No new deps**.
- **Breaking CLI change**: `--project` mandatory — ТЗ-approved.
- **recoverOrphans project field**: prior art не guarantees (Codex pre-flight verify — смотри G-G в planning-audit §10). Если field missing — minimal lib fix в Change 1 (add project propagation в recoverOrphans result); document inline.
- **No supervisor changes**: Phase A plan на hold; не трогать его artefacts.

---

## §14 Commits strategy

**Single commit** preferred:

```
feat(mailbox): strict project isolation on agent path + received_at + 3-timestamp cards

Changes:
- scripts/mailbox-lib.mjs: validateProjectScope gate + received_at schema (read fallback, write initial = created)
- scripts/mailbox.mjs: --project mandatory на send/list/reply/archive/recover; cwd autodetect удалён
- dashboard/server.js: /api/agent/* router с mandatory project middleware; /api/messages остаётся user-facing
- dashboard/src/api.js: fetchAgentMessages wrapper
- dashboard/src/App.jsx: card renders 3 timestamps (sent/received/archived) с localized labels
- local-claude-codex-mailbox-workflow.md: project mandatory + received_at schema carve-out

User dashboard остаётся общим multi-project view. Agent-side access строго single-project через validateProjectScope gate. Legacy messages без received_at получают fallback = created. Breaking CLI change: --project обязателен для agent ops.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Push**: ждёт explicit user command `пуш`.
