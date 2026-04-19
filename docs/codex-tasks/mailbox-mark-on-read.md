# Mailbox Mark-on-Read + Completion Label — Execution Plan

**Version**: v1
**Planning-audit**: `docs/codex-tasks/mailbox-mark-on-read-planning-audit.md`
**Report template**: `docs/codex-tasks/mailbox-mark-on-read-report.md`
**Target executor**: Codex (WSL)
**Planner**: Claude (Windows)
**Scope**: `received_at` populated **on first agent read** вместо writer-side default. UI label «Архивировано» → «Выполнено».

---

## §1 Why this plan exists

User отметил: «нужно сделать так чтобы отмечалось когда агент реально прочитал письмо». Текущее поведение (post-isolation, commit `01ed432`): writer пишет `received_at = created` на generation — это fake «received timestamp» equal к sent. Должно быть: writer пропускает field, первый agent read populates с actual timestamp.

Plus user: «когда выполнено и отправлено в архив по сути одно и то же, добавить строку Выполнено». Рендер archived_at с label «Выполнено» вместо «Архивировано» (rename, не duplicate).

Design closed через mailbox thread `mailbox-mark-on-read-design` (archived 2026-04-19):

- **Q1**: rename single row label (не duplicate).
- **Q2**: mark-on-read через explicit `markMessageReceived(filePath)` function, called **only** на narrow scope (filtered project + `to-claude`/`to-codex` bucket + pending status) в agent entry points (`/api/agent/*`, `mailbox.mjs list --project`, `mailbox.mjs reply`). `readMessage` и цепочка readers остаются pure. **Post-R3 Codex finding**: option-threading через reads был отклонён — мутировал бы ALL buckets ДО filter → cross-project leakage. Правильный paradigm: pure reads + explicit mark on filtered targets.
- **Q3**: best-effort concurrent readers — no lock.
- **Q4**: cross-agent semantic подтверждён.

---

## §2 Hierarchy of sources of truth

1. Official docs (`fs.writeFile`+`rename` atomic; `gray-matter` round-trip) — planning-audit §4 reuse.
2. Live code post-`01ed432` — planning-audit §3.
3. ТЗ verbal (user chat) + design agreement thread (archived).
4. This plan — derived.
5. **Discrepancy rule**: STOP + report §5.

---

## §3 Doc verification (§V1–§V3)

### §V1 — `fs.writeFile` + `fs.rename` atomic (reuse)

`writeFile(tmpPath) → rename(tmp, final)`. Prior §V1+V2 series.

### §V2 — `gray-matter` round-trip preservation (reuse)

`matter.stringify(content, data)` preserves frontmatter. Empirical §6 E1 confirms на real case.

### §V3 — `readMessage` purity (code inspection)

`scripts/mailbox-lib.mjs:380-420` — no side effects currently. Change 1 **не меняет** `readMessage` / `readBucket` / `collectMailboxMessages` / `readMessageByRelativePath`. Instead добавляет **separate** `markMessageReceived(filePath)` function — explicit atomic mutation called from narrow-scope callsites after bucket+project filter. Pure read chain preserved everywhere.

---

## §4 Pre-flight verification

Codex в WSL `cwd=/mnt/e/Project/workflow`. Outputs verbatim в report §0.

### P1 — environment baseline

```bash
node --version
(cd dashboard && node --version && npm --version)
git rev-parse --short HEAD
git status --short
```

**Expected**: Node ≥20.19, HEAD=`01ed432` или newer. Baseline drift model стандартный (preserved outside whitelist OK если в §0.4 и не трогается).

### P2 — baseline line counts

```bash
wc -l scripts/mailbox-lib.mjs scripts/mailbox.mjs dashboard/server.js dashboard/src/api.js dashboard/src/App.jsx local-claude-codex-mailbox-workflow.md
```

Expected (post-`01ed432`):

| File | Lines |
|------|-------|
| `scripts/mailbox-lib.mjs` | 704 |
| `scripts/mailbox.mjs` | 364 |
| `dashboard/server.js` | 193 |
| `dashboard/src/api.js` | 73 |
| `dashboard/src/App.jsx` | 1580 |
| `local-claude-codex-mailbox-workflow.md` | 821 |

Drift >5 → STOP.

### P3 — empirical mutation pattern (same as planning-audit §6 E1)

```bash
cd dashboard && node -e "
const fs = require('fs');
const matter = require('gray-matter');
const tmp = '/tmp/markread-preflight.md';
const initial = matter.stringify('Body', {id:'t', thread:'x', from:'a', to:'b', status:'pending', created:'2026-04-19T10:00:00Z', project:'workflow'});
fs.writeFileSync(tmp, initial);
const parsed = matter(fs.readFileSync(tmp, 'utf8'));
if (!('received_at' in parsed.data)) {
  parsed.data.received_at = '2026-04-19T11:00:00Z';
  fs.writeFileSync(tmp + '.tmp', matter.stringify(parsed.content, parsed.data));
  fs.renameSync(tmp + '.tmp', tmp);
}
const parsed2 = matter(fs.readFileSync(tmp, 'utf8'));
console.log('ok:', parsed2.data.received_at === '2026-04-19T11:00:00Z' && parsed2.content.trim() === 'Body');
fs.unlinkSync(tmp);
"
```

**Expected**: `ok: true`. FAIL → STOP.

### P4 — baseline build

```bash
cd dashboard && npx vite build 2>&1 | tail -5
```

**Expected**: `✓ built`. FAIL → apply environment repair per wiki `wsl-windows-native-binding-drift` (npm install в dashboard) → re-run.

---

## §5 Whitelist

| File | Purpose |
|------|---------|
| `scripts/mailbox-lib.mjs` | remove `received_at: created` emit из `generateMessageFile`; export new `markMessageReceived(filePath)` — explicit atomic mutation (read → check field → write tmp + rename). Reads остаются pure. |
| `scripts/mailbox.mjs` | `handleList`: after project filter, iterate filtered agent-inbox pending (status=pending, bucket ∈ to-claude/to-codex), call `markMessageReceived`. `handleReply`: mark target message после `validateProjectScope`. |
| `dashboard/server.js` | `/api/agent/messages` handler: after project filter, mark only `[...toClaude, ...toCodex].filter(pending)`. Archive не mutated. `/api/messages` остаётся polностью intact (no mark calls). |
| `dashboard/src/App.jsx` | translations: `timestampArchived` → `timestampCompleted`; RU «Выполнено», EN «Completed» |
| `local-claude-codex-mailbox-workflow.md` | `received_at` section rephrase: «populated on first agent read», документировать mark-on-read semantic + concurrent reader accept |

**НЕ ТРОГАТЬ**:
- `dashboard/src/api.js` (no new wrapper нужен; fetchAgentMessages уже passes через query)
- `dashboard/package.json`, lockfile
- `dashboard/vite.config.js`, `.gitignore`
- `agent-mailbox/**` (runtime data; existing files с `received_at = created` остаются as-is — не retroactively remark)
- Supervisor Phase A artefacts (on hold)
- `docs/codex-tasks/*` кроме этой handoff-тройки

---

## §6 Changes

### Change 1 — `scripts/mailbox-lib.mjs`

**Critical design revision (R3 Codex finding)**: NOT threading option через read chain. Reads stay pure (`readMessage`/`readBucket`/`collectMailboxMessages`/`readMessageByRelativePath` — **unchanged**). Mark-on-read becomes explicit function called on **narrow scope** — only after bucket+project filtering, чтобы избежать cross-project mutation.

**Change 1.1** — export `markMessageReceived(filePath)` — explicit atomic mutation:

Добавить новую функцию (рядом с `generateMessageFile`, например перед ним):

```js
export async function markMessageReceived(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = matter(raw);
  if ("received_at" in parsed.data) {
    return { mutated: false };
  }
  parsed.data.received_at = toUtcTimestamp();
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(
    tmpPath,
    matter.stringify(parsed.content, parsed.data),
    "utf8"
  );
  await fs.rename(tmpPath, filePath);
  return { mutated: true, received_at: parsed.data.received_at };
}
```

**Rationale**: takes absolute filePath (caller uses `path.resolve(mailboxRoot, msg.relativePath)`). Idempotent — если field уже present, skip. Atomic write-back via writeFile tmp + rename.

**Change 1.2** — `generateMessageFile` removes `received_at` emit (line ~531):

**Current** (around line 530-532):

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

**Target**:

```js
  const data = {
    id,
    thread: nextThread,
    from: nextFrom,
    to: nextTarget,
    status: "pending",
    created
  };
```

**Rationale**: writer не pre-populates `received_at` — field будет добавлен agent'ом при первом чтении.

Добавить `import path from "node:path"` если отсутствует (для `path.resolve` в callers). Check existing imports.

### Change 2 — `scripts/mailbox.mjs`

**Change 2.1** — `handleList` marks only filtered agent-inbox pending messages (after bucket + project filter):

**Current** (lines ~161-187):

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
  const filteredByBucket = ...
  const filtered = filterMessagesByProject(filteredByBucket, project);
  // ... formatTable / json output
```

**Target** — после вычисления `filtered`, пометить pending messages в agent inbox buckets:

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
  const filteredByBucket = ...
  const filtered = filterMessagesByProject(filteredByBucket, project);

  // Mark pending messages в agent inbox buckets as received
  for (const msg of filtered) {
    if (
      msg.status === "pending" &&
      (msg.bucket === "to-claude" || msg.bucket === "to-codex")
    ) {
      const abs = path.resolve(mailboxRoot, msg.relativePath);
      await markMessageReceived(abs);
    }
  }

  // ... formatTable / json output (uses already-read `filtered` — received_at snapshot pre-mark is OK for this output)
```

**Change 2.2** — `handleReply` marks only target message:

**Current** (lines ~200-210):

```js
  const targetMessage = await readMessageByRelativePath(options.to, mailboxRoot);
  validateProjectScope(explicitProject, targetMessage);
  const body = await readBody(options);
```

**Target** — после validate scope mark target:

```js
  const targetMessage = await readMessageByRelativePath(options.to, mailboxRoot);
  validateProjectScope(explicitProject, targetMessage);
  // Mark target as received (agent is actively reading it для reply)
  const location = path.resolve(mailboxRoot, targetMessage.relativePath);
  await markMessageReceived(location);
  const body = await readBody(options);
```

**Change 2.3** — import `markMessageReceived` в mailbox.mjs header:

Добавить к named imports из `./mailbox-lib.mjs`:

```js
  markMessageReceived,
```

(alphabetically между `generateMessageFile` и `normalizeProject` or similar).

### Change 3 — `dashboard/server.js`

**Change 3.1** — agent endpoint marks only filtered pending messages in agent inbox buckets (NOT before filter):

**Current** (lines ~170-188):

```js
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
    // ...
  }
});
```

**Target** — mark **after** project filter, **only** to-claude/to-codex pending messages:

```js
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

    // Mark pending filtered messages (только agent inbox buckets, только matching project)
    const toMark = [...toClaude, ...toCodex].filter((m) => m.status === "pending");
    await Promise.all(
      toMark.map((m) =>
        markMessageReceived(path.resolve(mailboxRoot, m.relativePath))
      )
    );

    response.json({ toClaude, toCodex, archive, project: request.agentProject });
  } catch (error) {
    // ...
  }
});
```

**Rationale**: archive bucket НЕ mutated (archived messages уже обработаны ранее — их `received_at` already set or permanently missing, no value in retro-marking). Mutation ТОЛЬКО на narrow set: matching project + to-claude/to-codex + pending. Response content — pre-mark snapshot (current behavior; dashboard polls в 3s refresh cycle).

**Change 3.2** — import `markMessageReceived` и `path`:

**Current** imports (line 1-18 post-isolation):

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

**Target** — add `markMessageReceived` к named imports + `import path from "node:path"` at top (check if already exists):

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

**Change 3.3** — user endpoint `/api/messages` **no change** (unchanged, explicit note):

```js
// lines 44-46 remain pure — user dashboard doesn't mutate
```

Plus `/api/messages/:dir` (line 76) — no change.

### Change 4 — `dashboard/src/App.jsx`

**Change 4.1** — translation rename (ru line 37):

**Current**:

```js
    timestampArchived: "Архивировано",
```

**Target**:

```js
    timestampCompleted: "Выполнено",
```

(Remove `timestampArchived`, add `timestampCompleted`.)

**Change 4.2** — translation rename (en line 93):

**Current**:

```js
    timestampArchived: "Archived",
```

**Target**:

```js
    timestampCompleted: "Completed",
```

**Change 4.3** — JSX usage (line 1068):

**Current**:

```jsx
              <span className="timestampLabel">{t.timestampArchived}:</span>{" "}
```

**Target**:

```jsx
              <span className="timestampLabel">{t.timestampCompleted}:</span>{" "}
```

### Change 5 — `local-claude-codex-mailbox-workflow.md`

**Change 5.1** — найти section «`received_at` timestamp field» (добавлен isolation commit) и переписать:

**Current fragment**:

```markdown
- `received_at` — recipient-side первое принятие сообщения mailbox infrastructure (UTC ISO);
```

и

```markdown
Для legacy messages без `received_at` reader обеспечивает fallback `received_at = created`. Новые messages пишут `received_at` явно во frontmatter; в current file-based режиме без отдельного delivery layer writer initially sets `received_at = created`. Schema подготовлена для later delivery-layer expansion (Phase C supervisor handoff populates `received_at` = supervisor polling moment).
```

**Target rewrite** (заменить оба fragments one coherent):

```markdown
- `received_at` — timestamp первого принятия (чтения) сообщения получающим агентом (UTC ISO); **populated on first agent read**, не на generation.

Writer (sender) создаёт message **без** поля `received_at`. Receiving agent при первом чтении через agent-path (`/api/agent/*`, `mailbox.mjs list --project <name>`, `mailbox.mjs reply`) проверяет отсутствие `received_at` и populates с текущим UTC timestamp, atomic write-back (writeFile tmp + rename). Последующие чтения skip mutation (field present).

User dashboard path (`/api/messages`) не populates — user visibility не является «agent received» event.

Concurrent agent readers: best-effort без lock. First writer wins, второй reader видит populated field и пропускает mutation. Overwrite risk нулевой — оба timestamp'а близки по ms resolution.

Для legacy messages без `received_at` reader возвращает fallback = `created` при reading (не mutates).
```

---

## §7 Verification phases

### Phase 1 — Codex-only

**Mandatory order**: Change 5 (spec) + Change 1 (lib) apply first. Changes 2/3/4 independent after.

| # | Check | Expected |
|---|-------|----------|
| V1 | `markMessageReceived` exported + idempotent (skip on existing field) | `function` exported; second call on marked file returns `{mutated: false}` |
| V2 | `generateMessageFile` больше не пишет `received_at` | grep returns 0 occurrences of `received_at: created` |
| V3 | Empirical: send new message → read via /api/messages (user) → не mutated; read via /api/agent/messages → mutated | `received_at` absent before, present after agent fetch |
| V4 | vite build | `✓ built` |
| V5 | UI label grep | `timestampCompleted` 2 hits (ru+en translations) + 1 JSX usage |
| V6 | Spec rephrase persisted | grep «populated on first agent read» = 1 |
| V7 | Personal data scan | only `--scan done` |
| V8 | Whitelist respected | 5 whitelist files + 3 handoff artefacts + preserved baseline drift из §0.4 unchanged |

Verification commands (fenced, copy-paste safe):

```bash
# V1 — markMessageReceived export + idempotence (isolated temp file)
TMPMARK=/tmp/markread-v1-file.md
cat > "$TMPMARK" <<'EOF'
---
id: v1
thread: x
from: claude
to: codex
status: pending
created: '2026-04-19T00:00:00Z'
project: workflow
---
body
EOF
cd dashboard && node -e "
import('../scripts/mailbox-lib.mjs').then(async (m) => {
  console.log('export type:', typeof m.markMessageReceived);
  const r1 = await m.markMessageReceived('$TMPMARK');
  console.log('first call mutated:', r1.mutated === true);
  const r2 = await m.markMessageReceived('$TMPMARK');
  console.log('second call skip:', r2.mutated === false);
});
"
rm -f "$TMPMARK"
# Expected 3 lines: function / true / true (idempotent)

# V2
grep -c 'received_at: created' scripts/mailbox-lib.mjs
# Expected: 0

# V3 — isolated temp mailbox with 2 projects across 2 buckets. Validates NARROW scope mutation.
TMPMBOX=/tmp/markread-v3-mbox
rm -rf "$TMPMBOX"; mkdir -p "$TMPMBOX/to-claude" "$TMPMBOX/to-codex" "$TMPMBOX/archive"
# Target project (workflow) in to-claude
cat > "$TMPMBOX/to-claude/2026-04-19T00-00-00Z-test-workflow-codex-001.md" <<'EOF'
---
id: 2026-04-19T00-00-00Z-codex-001
thread: test-w
from: codex
to: claude
status: pending
created: '2026-04-19T00:00:00Z'
project: workflow
---
Workflow body
EOF
# Other project (messenger) in to-codex — NOT target scope
cat > "$TMPMBOX/to-codex/2026-04-19T00-00-00Z-test-other-claude-001.md" <<'EOF'
---
id: 2026-04-19T00-00-00Z-claude-001
thread: test-m
from: claude
to: codex
status: pending
created: '2026-04-19T00:00:00Z'
project: messenger
---
Messenger body (другой project, не должен быть mutated)
EOF
# Same project (workflow) in archive — archive не mutated даже если scope matches
cat > "$TMPMBOX/archive/test-w/2026-04-19T00-00-00Z-test-workflow-codex-002.md" <<'EOF'
---
id: 2026-04-19T00-00-00Z-codex-002
thread: test-w
from: codex
to: claude
status: archived
created: '2026-04-19T00:00:00Z'
archived_at: '2026-04-19T00:01:00Z'
resolution: answered
project: workflow
---
Archived workflow body
EOF
mkdir -p "$TMPMBOX/archive/test-w"  # ensure archive subdir exists before file
# (файл выше уже создан до mkdir; re-create если path не сработал)
[ -f "$TMPMBOX/archive/test-w/2026-04-19T00-00-00Z-test-workflow-codex-002.md" ] || {
  mkdir -p "$TMPMBOX/archive/test-w"
  cat > "$TMPMBOX/archive/test-w/2026-04-19T00-00-00Z-test-workflow-codex-002.md" <<'EOF'
---
id: 2026-04-19T00-00-00Z-codex-002
thread: test-w
from: codex
to: claude
status: archived
created: '2026-04-19T00:00:00Z'
archived_at: '2026-04-19T00:01:00Z'
resolution: answered
project: workflow
---
Archived workflow body
EOF
}

# Simulate /api/agent/messages?project=workflow flow: read → filter → mark matching agent-inbox pending
cd dashboard && node -e "
import('../scripts/mailbox-lib.mjs').then(async (m) => {
  const path = (await import('node:path')).default;
  const matter = (await import('gray-matter')).default;
  const fs = await import('node:fs/promises');
  const MBOX = '$TMPMBOX';
  const PROJECT = 'workflow';
  const [allToClaude, allToCodex, allArchive] = await Promise.all([
    m.readBucket('to-claude', MBOX),
    m.readBucket('to-codex', MBOX),
    m.readBucket('archive', MBOX)
  ]);
  const toClaude = m.filterMessagesByProject(allToClaude, PROJECT);
  const toCodex = m.filterMessagesByProject(allToCodex, PROJECT);
  const toMark = [...toClaude, ...toCodex].filter(x => x.status === 'pending');
  await Promise.all(toMark.map(x => m.markMessageReceived(path.resolve(MBOX, x.relativePath))));

  // Verify: workflow/to-claude message marked
  const wFiles = await fs.readdir(MBOX + '/to-claude');
  const wRaw = await fs.readFile(MBOX + '/to-claude/' + wFiles[0], 'utf8');
  console.log('workflow/to-claude marked:', 'received_at' in matter(wRaw).data);

  // Verify: messenger/to-codex NOT marked (out of project scope)
  const mFiles = await fs.readdir(MBOX + '/to-codex');
  const mRaw = await fs.readFile(MBOX + '/to-codex/' + mFiles[0], 'utf8');
  console.log('messenger/to-codex NOT marked:', !('received_at' in matter(mRaw).data));

  // Verify: workflow/archive NOT marked (archive out of mutation scope)
  const aFiles = await fs.readdir(MBOX + '/archive/test-w');
  const aRaw = await fs.readFile(MBOX + '/archive/test-w/' + aFiles[0], 'utf8');
  console.log('workflow/archive NOT marked:', !('received_at' in matter(aRaw).data));
});
"
# Expected 3 lines: all three true (narrow scope correctly enforced)

rm -rf "$TMPMBOX"

# V4
cd dashboard && npx vite build 2>&1 | tail -5

# V5
grep -c 'timestampCompleted' dashboard/src/App.jsx
# Expected: 3 (ru translation + en translation + JSX usage)

# V6
grep -c 'populated on first agent read' local-claude-codex-mailbox-workflow.md

# V7
PD_PATTERNS='$PD_PATTERNS'
grep -riE "$PD_PATTERNS" --include="*.js" --include="*.jsx" --include="*.mjs" --include="*.html" --include="*.json" dashboard/ scripts/ 2>/dev/null
grep -riE "$PD_PATTERNS" --include="*.md" CLAUDE.md README.md README.ru.md local-claude-codex-mailbox-workflow.md workflow-*.md 2>/dev/null
echo "--scan done"

# V8
git status --short
```

Any FAIL → STOP.

### Phase 2 — user visual `[awaits user]`

| # | Check |
|---|-------|
| P2.1 | Открыть `http://127.0.0.1:9119/` — карточки показывают «Отправлено / Получено / Выполнено» (не «Архивировано») |
| P2.2 | Отправить test message CLI → open dashboard user view → frontmatter файла остаётся без `received_at` (check `cat agent-mailbox/to-codex/<file>.md \| head -15`) |
| P2.3 | curl `/api/agent/messages?project=workflow` → refresh → frontmatter файла получил `received_at` (check same file) |

### Phase 3 — N/A

---

## §8 Acceptance criteria

- [ ] Phase 1 V1-V8 PASS
- [ ] No files outside §5 whitelist
- [ ] Build size delta ≤ 5 kB
- [ ] PD scan clean
- [ ] Spec section rewritten
- [ ] `readMessage` стаёт pure по default — user dashboard не mutates
- [ ] Agent paths populate `received_at` on first read

---

## §9 Out of scope

- Retroactive remark existing messages (с `received_at = created` from isolation commit)
- Lock/coordination между concurrent readers (accepted best-effort)
- Supervisor Phase A rebase (ждёт resumption)
- Tests harness
- New deps

---

## §10 Rollback

**До commit**: `git stash push -- <whitelist>`; если смешанный worktree → STOP, surface.
**После commit**: `git revert <sha>`. Agent-mailbox files с appliedreceived_at — оставляем, roll-forward safe.

---

## §11 Discrepancy checkpoints

1. P2 baseline drift >5 → STOP.
2. P3 empirical FAIL → STOP.
3. P4 build FAIL → environment repair per wiki, re-run.
4. V1-V8 FAIL → STOP.
5. **Manual/editorial** modification agent-mailbox/** runtime files — STOP. Programmatic mutation by implementation under test (mark-on-read writing `received_at`) — expected post-landing behavior, not violation. V3 использует isolated `/tmp/` mailbox, not real one.
6. Supervisor Phase A artefacts touched → STOP.

---

## §12 Self-audit checklist

- [ ] 1: P1-P4 pre-flight OK
- [ ] 2: Change 1 (lib) — markMessageReceived export + generateMessageFile strip (2 substeps)
- [ ] 3: Change 2 (CLI) — 3 substeps (handleList narrow mark, handleReply target mark, import)
- [ ] 4: Change 3 (server) — 3 substeps (agent narrow mark, imports, user path untouched)
- [ ] 5: Change 4 (App.jsx) — 3 substeps
- [ ] 6: Change 5 (spec)
- [ ] 7: V1-V8 verbatim
- [ ] 8: V8 whitelist drift clean
- [ ] 9: No commit/push
- [ ] 10: Discrepancies logged
- [ ] 11: Report §0-§11 filled

≥10/11 OK → ready.

---

## §13 Notes to Codex

- Planning snapshot: HEAD=`01ed432`.
- Environment: WSL, `cwd=/mnt/e/Project/workflow`.
- Mandatory `--project` для mailbox CLI (post-isolation).
- `fetchAgentMessages` wrapper уже exists (isolation commit) — reuse.
- Anti-fabrication: V1-V8 raw verbatim.
- Phase A supervisor — **не трогать**.

---

## §14 Commits strategy

Single commit:

```
feat(mailbox): mark-on-read received_at + 'Выполнено' card label

Changes:
- scripts/mailbox-lib.mjs: export markMessageReceived(filePath) — explicit atomic mutation (idempotent); generateMessageFile больше не emits received_at; reads остаются pure
- scripts/mailbox.mjs: handleList marks only filtered agent-inbox pending after project filter; handleReply marks target after validateProjectScope
- dashboard/server.js: /api/agent/messages marks only [...toClaude, ...toCodex].filter(pending) после project filter; /api/messages (user) unchanged
- dashboard/src/App.jsx: timestampArchived → timestampCompleted (RU «Выполнено», EN «Completed»)
- local-claude-codex-mailbox-workflow.md: received_at section rephrase — populated on first agent read

Writer создаёт message без received_at. Receiving agent populates field на первом чтении через agent-path. User dashboard view не mutates. Concurrent readers best-effort без lock.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Push: ждёт user command.
