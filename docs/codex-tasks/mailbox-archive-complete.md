# Mailbox Archive Complete Timestamps — Execution Plan

**Version**: v1
**Planning-audit**: `docs/codex-tasks/mailbox-archive-complete-planning-audit.md`
**Report template**: `docs/codex-tasks/mailbox-archive-complete-report.md`
**Target executor**: Codex (WSL)
**Planner**: Claude (Windows)
**Scope**: архивная карточка показывает полную историю времени (4 rows conditional) + separate status chip. Backfill missing `received_at`. New field `answered_at`. Нет data loss при архивировании.

---

## §1 Why this plan exists

User: «при отправке письма в архив ничего не теряется; архивное письмо должно содержать полную историю по датам и времени; в интерфейсе архивная карточка должна показываться целиком со всеми этими датами и временем; обязательно показывать отдельно дату и время отправки в архив; если письмо ушло в архив без ответа и без выполнения, это должно быть явно понятно как отдельный случай, без путаницы.»

Design closed через `mailbox-archive-complete-design` thread:

- **Timeline 4 rows** (conditional): Отправлено / Получено / Ответ отправлен (only if `answered_at` present) / Отправлено в архив.
- **Status chip** (separate from timeline): answered→«Выполнено», no-reply-needed→«Закрыто без ответа», superseded→«Заменено». Chip не заменяет timestamp label.
- **Backfill**: если при archive `received_at` отсутствует → set = `archived_at`. Нет дыр в timeline.
- **New field** `answered_at`: populated **только** для resolution=answered. Не для no-reply-needed / superseded.
- **answer_message_id UI**: defer — следующий handoff.

---

## §2 Hierarchy of sources of truth

1. Official docs (gray-matter reuse) — planning-audit §4.
2. Live code post-`fbf17cf` — planning-audit §3.
3. User chat requirements + design thread archive.
4. This plan — derived.
5. **Discrepancy rule**: STOP + report §5.

---

## §3 Doc verification (§V1–§V2)

### §V1 — gray-matter spread preservation

`matter.stringify(content, data)` writes all data fields, including unknown ones. `{...parsed.data, ...new}` spreads existing fields + merges new. Standard JS spread semantics. Empirical validated в prior handoffs (mark-on-read §V3).

### §V2 — existing `archiveMessageFile` field-preservation

Code inspection `scripts/mailbox-lib.mjs:619-624`:

```js
const updatedData = {
  ...parsed.data,
  status: "archived",
  archived_at: toUtcTimestamp(),
  resolution: validateResolution(resolution)
};
```

`...parsed.data` спредит ВСЕ existing fields (id, thread, from, to, created, received_at, project, reply_to, related_files и любые custom). Добавляет/перезаписывает только 3 поля + опционально `answer_message_id` ниже. Безопасно для extension — add `received_at` backfill + `answered_at` fields в same pattern.

---

## §4 Pre-flight verification

```bash
node --version
(cd dashboard && node --version && npm --version)
git rev-parse --short HEAD
git status --short
```

**Expected**: Node ≥20.19, HEAD=`fbf17cf` или newer.

### P2 — baseline line counts

```bash
wc -l scripts/mailbox-lib.mjs scripts/mailbox.mjs dashboard/server.js dashboard/src/api.js dashboard/src/App.jsx local-claude-codex-mailbox-workflow.md
```

Expected (post-`fbf17cf`):

| File | Lines |
|------|-------|
| `scripts/mailbox-lib.mjs` | 727 |
| `scripts/mailbox.mjs` | 377 |
| `dashboard/server.js` | 203 |
| `dashboard/src/api.js` | 73 |
| `dashboard/src/App.jsx` | 1580 |
| `local-claude-codex-mailbox-workflow.md` | 827 |

Drift >5 → STOP.

### P3 — empirical: archive preserves all frontmatter

```bash
TMPMBOX=/tmp/archive-preflight-mbox
rm -rf "$TMPMBOX"; mkdir -p "$TMPMBOX/to-claude"
cat > "$TMPMBOX/to-claude/2026-04-19T00-00-00Z-test-archive-codex-001.md" <<'EOF'
---
id: 2026-04-19T00-00-00Z-codex-001
thread: test-archive
from: codex
to: claude
status: pending
created: '2026-04-19T00:00:00Z'
received_at: '2026-04-19T00:01:00Z'
project: workflow
reply_to: some-id
related_files:
  - path/to/x.md
custom_field: preserve_me
---
body
EOF
cd dashboard && node -e "
import('../scripts/mailbox-lib.mjs').then(async (m) => {
  const matter = (await import('gray-matter')).default;
  const fs = await import('node:fs/promises');
  await m.archiveMessageFile({
    relativePath: 'to-claude/2026-04-19T00-00-00Z-test-archive-codex-001.md',
    resolution: 'no-reply-needed',
    mailboxRoot: '$TMPMBOX'
  });
  const files = await fs.readdir('$TMPMBOX/archive/test-archive');
  const raw = await fs.readFile('$TMPMBOX/archive/test-archive/' + files[0], 'utf8');
  const d = matter(raw).data;
  console.log('custom_field preserved:', d.custom_field === 'preserve_me');
  console.log('reply_to preserved:', d.reply_to === 'some-id');
  console.log('related_files preserved:', Array.isArray(d.related_files) && d.related_files.length === 1);
  console.log('status archived:', d.status === 'archived');
  console.log('resolution no-reply-needed:', d.resolution === 'no-reply-needed');
  console.log('archived_at present:', typeof d.archived_at === 'string');
});
"
rm -rf "$TMPMBOX"
```

**Expected**: 6 lines all true. Валидирует что baseline `archiveMessageFile` уже preserves. FAIL → STOP.

### P4 — baseline build

```bash
cd dashboard && npx vite build 2>&1 | tail -5
```

**Expected**: `✓ built`. FAIL → environment repair (wsl-windows-native-binding-drift per wiki) → re-run.

---

## §5 Whitelist

| File | Purpose |
|------|---------|
| `scripts/mailbox-lib.mjs` | `archiveMessageFile` signature +`answeredAt`; received_at backfill logic; answered_at write (only if answered). `readMessage` read path +`answered_at`. |
| `scripts/mailbox.mjs` | `handleReply` passes `answeredAt: created.created` к archiveMessageFile. |
| `dashboard/src/App.jsx` | translations (4 new labels), card renders 4-row timeline conditional, resolution chip в cardTags |
| `local-claude-codex-mailbox-workflow.md` | spec update: answered_at field + received_at archive backfill rule |
| `dashboard/server.js` | `/api/archive` handler accepts `answered_at` + `answer_message_id` body params; rejects `resolution=answered` без `answered_at` (400). Symmetric closing hole same class как handleArchive. |

**НЕ ТРОГАТЬ**:
- `dashboard/src/api.js` — нет новых endpoints.
- `dashboard/package.json`, vite config, .gitignore.
- `agent-mailbox/**` runtime.
- Supervisor Phase A artefacts (committed deferred).
- Prior handoff artefacts в `docs/codex-tasks/`.

---

## §6 Changes

### Change 1 — `scripts/mailbox-lib.mjs`

**Change 1.1** — `readMessage` включает `answered_at` (line ~395-415, near `received_at`):

**Current fragment** (after received_at read block):

```js
    answer_message_id:
      typeof parsed.data.answer_message_id === "string"
        ? parsed.data.answer_message_id
        : "",
    related_files: relatedFiles,
```

**Target** — вставить `answered_at` строку:

```js
    answer_message_id:
      typeof parsed.data.answer_message_id === "string"
        ? parsed.data.answer_message_id
        : "",
    answered_at: toMessageTimestamp({
      data: { created: parsed.data.answered_at }
    }),
    related_files: relatedFiles,
```

**Rationale**: same normalization pattern как `received_at`. `toMessageTimestamp` возвращает `""` если field absent → UI conditional render.

**Change 1.2** — `archiveMessageFile` signature + backfill + answered_at (line 579-640):

**Current** signature:

```js
export async function archiveMessageFile({
  relativePath,
  resolution,
  mailboxRoot,
  answerMessageId = "",
  archiveFiles
}) {
```

**Target** — add `answeredAt`:

```js
export async function archiveMessageFile({
  relativePath,
  resolution,
  mailboxRoot,
  answerMessageId = "",
  answeredAt = "",
  archiveFiles
}) {
```

**Current** updatedData build (line 619-629):

```js
  const updatedData = {
    ...parsed.data,
    status: "archived",
    archived_at: toUtcTimestamp(),
    resolution: validateResolution(resolution)
  };
  const nextAnswerMessageId = sanitizeString(answerMessageId);

  if (nextAnswerMessageId) {
    updatedData.answer_message_id = nextAnswerMessageId;
  }
```

**Target** — add `received_at` backfill + conditional `answered_at`:

```js
  const archivedAt = toUtcTimestamp();
  const updatedData = {
    ...parsed.data,
    status: "archived",
    archived_at: archivedAt,
    resolution: validateResolution(resolution)
  };

  // Backfill: if received_at отсутствует — set к archived_at (no timeline gaps)
  if (!("received_at" in parsed.data) || !parsed.data.received_at) {
    updatedData.received_at = archivedAt;
  }

  const nextAnswerMessageId = sanitizeString(answerMessageId);
  if (nextAnswerMessageId) {
    updatedData.answer_message_id = nextAnswerMessageId;
  }

  // answered_at ТОЛЬКО при resolution=answered (explicit per design)
  const nextAnsweredAt = sanitizeString(answeredAt);
  if (nextAnsweredAt && updatedData.resolution === "answered") {
    updatedData.answered_at = nextAnsweredAt;
  }
```

**Rationale**: backfill fills gap для messages архивированных без agent read. `answered_at` только на answered resolution — explicit per Codex design clarification.

**Change 1.3** — `generateMessageFile` return shape (line ~568-578): добавить `created` field чтобы callers (handleReply) могли передать semantic-consistent `answeredAt`:

**Current**:

```js
  return {
    id,
    filename,
    relativePath: normalizePath(path.relative(mailboxRoot, filePath)),
    to: nextTarget,
    from: nextFrom,
    thread: nextThread,
    project: nextProject
  };
```

**Target**:

```js
  return {
    id,
    filename,
    relativePath: normalizePath(path.relative(mailboxRoot, filePath)),
    to: nextTarget,
    from: nextFrom,
    thread: nextThread,
    project: nextProject,
    created
  };
```

**Rationale**: existing callers (handleSend, handleReply, server endpoints) destructure известные fields — backward-compatible addition. Enables Change 2.1 pass `created.created` без fallback-to-new-timestamp.

**Change 1.4** — `recoverOrphans` (line ~660-670) passes `answeredAt` при archive orphan с answered resolution:

**Current** (recovered.push block, then archive call earlier):

```js
    const archived = await archiveMessageFile({
      relativePath: message.relativePath,
      resolution: "answered",
      mailboxRoot,
      answerMessageId: matchingReply.id
    });

    recovered.push({
      relativePath: message.relativePath,
      archivedTo: archived.archivedTo,
      answerMessageId: matchingReply.id,
      project: message.project || ""
    });
```

**Target** — pass `matchingReply.created` как `answeredAt`:

```js
    const archived = await archiveMessageFile({
      relativePath: message.relativePath,
      resolution: "answered",
      mailboxRoot,
      answerMessageId: matchingReply.id,
      answeredAt: matchingReply.created
    });

    recovered.push({
      relativePath: message.relativePath,
      archivedTo: archived.archivedTo,
      answerMessageId: matchingReply.id,
      project: message.project || ""
    });
```

**Rationale**: recovered answered orphan теперь имеет `answered_at = reply.created` — timeline полный. `matchingReply.created` normalized via `toMessageTimestamp` в `readMessage` (line 358 в lib) → string UTC ISO.

### Change 2 — `scripts/mailbox.mjs`

**Change 2.1** — `handleReply` passes `answeredAt`:

**Current** (line ~246-251):

```js
  const archived = await archiveMessageFile({
    relativePath: targetMessage.relativePath,
    resolution: "answered",
    mailboxRoot,
    answerMessageId: created.id
  });
```

**Target** — add `answeredAt: created.created` (созданный reply timestamp, доступен после Change 1.3):

```js
  const archived = await archiveMessageFile({
    relativePath: targetMessage.relativePath,
    resolution: "answered",
    mailboxRoot,
    answerMessageId: created.id,
    answeredAt: created.created
  });
```

**Rationale**: `created.created` гарантированно доступен после Change 1.3 (extended return shape). Semantically matches reply frontmatter's own `created` — не создаёт новый timestamp ms-различающийся от reply's canonical one.

**Change 2.2** — `handleArchive` (line ~288) требует `--answered-at` для resolution=answered:

**Current** (schema + archive call):

```js
  const options = parseOptions(args, {
    path: { type: "string" },
    project: { type: "string" },
    resolution: { type: "string" },
    json: { type: "boolean" }
  });
  // ... project validation ...
  const archived = await archiveMessageFile({
    relativePath: options.path,
    resolution: validateResolution(options.resolution),
    mailboxRoot
  });
```

**Target**:

```js
  const options = parseOptions(args, {
    path: { type: "string" },
    project: { type: "string" },
    resolution: { type: "string" },
    "answered-at": { type: "string" },
    "answer-message-id": { type: "string" },
    json: { type: "boolean" }
  });
  // ... project validation ...
  const nextResolution = validateResolution(options.resolution);
  const nextAnsweredAt = sanitizeString(options["answered-at"]);
  const nextAnswerMessageId = sanitizeString(options["answer-message-id"]);
  if (nextResolution === "answered" && !nextAnsweredAt) {
    throw new ClientError(
      64,
      '--answered-at is required when --resolution=answered (archive timeline completeness)'
    );
  }
  const archived = await archiveMessageFile({
    relativePath: options.path,
    resolution: nextResolution,
    mailboxRoot,
    answeredAt: nextAnsweredAt,
    answerMessageId: nextAnswerMessageId
  });
```

**Rationale**: закрывает дыру когда user/скрипт archive'ит через CLI с `--resolution answered` без reply flow. Если есть answer, user знает когда отправлен → передаёт `--answered-at`. Если resolution != answered — поля опциональны.

**Change 2.3** — `usageText` (line ~102) update archive signature в hint:

```
node scripts/mailbox.mjs archive --path <relativePath> --project <name> [--resolution <answered|no-reply-needed|superseded>] [--answered-at <UTC ISO> --answer-message-id <id>]
```

Note в usageText: «`--answered-at` обязателен при `--resolution=answered`».

### Change 3 — `dashboard/server.js`

**Change 3.0** — `/api/archive` handler (line ~128-160 post-fbf17cf): accept `answered_at` + `answer_message_id` body params, enforce guard.

**Current**:

```js
app.post("/api/archive", async (request, response) => {
  try {
    const relativePath = validateRelativeInboxPath(
      request.body?.relativePath,
      mailboxRoot
    ).relativePath;
    const resolution = validateResolution(request.body?.resolution);
    const archived = await archiveMessageFile({
      relativePath,
      resolution,
      mailboxRoot
    });
    // ... response ...
```

**Target** — add answeredAt/answerMessageId + guard:

```js
app.post("/api/archive", async (request, response) => {
  try {
    const relativePath = validateRelativeInboxPath(
      request.body?.relativePath,
      mailboxRoot
    ).relativePath;
    const resolution = validateResolution(request.body?.resolution);
    const answeredAt = sanitizeString(request.body?.answered_at);
    const answerMessageId = sanitizeString(request.body?.answer_message_id);

    if (resolution === "answered" && !answeredAt) {
      throw new ClientError(
        400,
        'answered_at is required when resolution=answered (archive timeline completeness)'
      );
    }

    const archived = await archiveMessageFile({
      relativePath,
      resolution,
      mailboxRoot,
      answeredAt,
      answerMessageId
    });
    // ... response ...
```

**Rationale**: closing third vector — HTTP archive path. Symmetric guard как CLI. Dashboard UI currently не calls archive с resolution=answered (user archives через reply flow), but programmatic clients должны respect timeline completeness.

### Change 4 — `dashboard/src/App.jsx`

**Change 3.1** — translations (ru, после existing timestamp block):

**Current** (ru ~lines 35-37):

```js
    timestampSent: "Отправлено",
    timestampReceived: "Получено",
    timestampCompleted: "Выполнено",
```

**Target** — replace `timestampCompleted` на event labels + status labels:

```js
    timestampSent: "Отправлено",
    timestampReceived: "Получено",
    timestampAnswered: "Ответ отправлен",
    timestampArchived: "Отправлено в архив",
    statusAnswered: "Выполнено",
    statusNoReplyNeeded: "Закрыто без ответа",
    statusSuperseded: "Заменено",
```

(`timestampCompleted` удаляется, `timestampArchived` возвращается как event row — не clash с prior handoff т.к. там был status label, сейчас event timestamp.)

**Change 3.2** — translations (en, аналогично):

```js
    timestampSent: "Sent",
    timestampReceived: "Received",
    timestampAnswered: "Replied at",
    timestampArchived: "Archived at",
    statusAnswered: "Completed",
    statusNoReplyNeeded: "Closed without reply",
    statusSuperseded: "Superseded",
```

**Change 3.3** — Status chip logic в `cardTags` block (line ~1046-1053):

**Current**:

```jsx
          <div className="cardTags">
            {isArchived ? (
              <span className="chip">
                {message.resolution || message.status || "archived"}
              </span>
            ) : null}
            {message.project ? (
              <span className="chip chipProject">{message.project}</span>
            ) : null}
          </div>
```

**Target** — resolution → localized label:

```jsx
          <div className="cardTags">
            {isArchived ? (
              <span className="chip">
                {message.resolution === "answered"
                  ? t.statusAnswered
                  : message.resolution === "no-reply-needed"
                    ? t.statusNoReplyNeeded
                    : message.resolution === "superseded"
                      ? t.statusSuperseded
                      : message.resolution || message.status || "archived"}
              </span>
            ) : null}
            {message.project ? (
              <span className="chip chipProject">{message.project}</span>
            ) : null}
          </div>
```

**Change 3.4** — Timeline block в `cardTimestamps` (line ~1057+):

**Current**:

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
              <span className="timestampLabel">{t.timestampCompleted}:</span>{" "}
              {formatTimestamp(message.metadata.archived_at, lang, t)}
            </span>
          ) : null}
        </div>
```

**Target** — 4 conditional rows:

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
          {message.answered_at ? (
            <span className="timestamp">
              <span className="timestampLabel">{t.timestampAnswered}:</span>{" "}
              {formatTimestamp(message.answered_at, lang, t)}
            </span>
          ) : null}
          {message.metadata?.archived_at ? (
            <span className="timestamp">
              <span className="timestampLabel">{t.timestampArchived}:</span>{" "}
              {formatTimestamp(message.metadata.archived_at, lang, t)}
            </span>
          ) : null}
        </div>
```

**Rationale**: 4 rows conditional. `answered_at` (mapped через `readMessage` normalizer) shown только если non-empty. «Отправлено в архив» renamed label (было «Выполнено» в prior handoff — теперь status chip purpose).

### Change 5 — `local-claude-codex-mailbox-workflow.md`

**Change 5.1** — расширить `received_at` section (post-mark-on-read carve-out) добавлением `answered_at` + backfill rule. Найти section «`received_at` timestamp field» и **добавить** после последнего paragraph:

```markdown

### `answered_at` timestamp field

Frontmatter может содержать дополнительное поле `answered_at` — timestamp создания reply-сообщения, которое закрыло текущее (UTC ISO). **Populated только** когда message архивируется как часть reply flow (resolution=answered). Для `no-reply-needed` и `superseded` резолюций поле НЕ создаётся.

Это позволяет archive-карточкам показывать отдельную строку «Ответ отправлен» в timeline, не смешивая с моментом собственно архивирования.

### Archive timeline completeness

При архивировании `archiveMessageFile` применяет **backfill rule**: если `received_at` отсутствует в исходном message (message был архивирован без предыдущего agent read — например, через dashboard непосредственно), устанавливает `received_at = archived_at`. Это гарантирует, что все archived messages имеют полную timeline (Отправлено / Получено / опционально Ответ отправлен / Отправлено в архив) без пропущенных полей.

Resolution values остаются семантическими:

- `answered` — был отправлен ответ (имеет `answered_at` + `answer_message_id`);
- `no-reply-needed` — закрыто без ответа (нет `answered_at`);
- `superseded` — заменено новым message (нет `answered_at`).

UI показывает resolution как отдельный status chip в header карточки, не заменяя при этом event timestamps.
```

---

## §7 Verification phases

### Phase 1 — Codex-only

**Mandatory order**: Change 4 (spec) + Change 1 (lib) first (lib changes сигнализируют new field). Change 2 (CLI) after. Change 3 (UI) independent.

| # | Check | Expected |
|---|-------|----------|
| V1 | `archiveMessageFile` accepts `answeredAt` + writes field for answered resolution | empirical: archive с answeredAt + verify field в output frontmatter |
| V2 | Backfill `received_at = archived_at` если missing | empirical isolated archive test |
| V3 | `answered_at` populated только для resolution=answered | empirical 2 archives (answered + no-reply-needed) |
| V4 | `handleReply` passes `answeredAt` | grep |
| V5 | UI translations 7 новых labels | grep count |
| V6 | Card timeline 4 rows conditional | grep JSX |
| V7 | vite build | `✓ built` |
| V8 | spec обновлён — «answered_at timestamp field» + «Archive timeline completeness» | grep = 2 section headings |
| V9 | Personal data scan | only `--scan done` |
| V10 | Whitelist respected | 5 M files + 3 handoff artefacts + preserved baseline |
| V11 | recoverOrphans passes answeredAt → answered_at populated | empirical: orphan + reply setup → recoverOrphans() → archived file has answered_at === reply.created |
| V12 | handleArchive CLI guard present | grep guard-string в mailbox.mjs = 1 |
| V13 | /api/archive server guard symmetric present | grep guard-string в dashboard/server.js = 1 |

Verification commands (fenced):

```bash
# V1 — empirical: archiveMessageFile accepts answeredAt + writes field
TMPV1=/tmp/archive-v1-mbox
rm -rf "$TMPV1"; mkdir -p "$TMPV1/to-claude"
cat > "$TMPV1/to-claude/2026-04-19T00-00-00Z-test-v1-codex-001.md" <<'EOF'
---
id: 2026-04-19T00-00-00Z-codex-001
thread: test-v1
from: codex
to: claude
status: pending
created: '2026-04-19T00:00:00Z'
received_at: '2026-04-19T00:01:00Z'
project: workflow
---
body
EOF
cd dashboard && node -e "
import('../scripts/mailbox-lib.mjs').then(async (m) => {
  const matter = (await import('gray-matter')).default;
  const fs = await import('node:fs/promises');
  await m.archiveMessageFile({
    relativePath: 'to-claude/2026-04-19T00-00-00Z-test-v1-codex-001.md',
    resolution: 'answered',
    mailboxRoot: '$TMPV1',
    answerMessageId: 'reply-id',
    answeredAt: '2026-04-19T00:02:00Z'
  });
  const files = await fs.readdir('$TMPV1/archive/test-v1');
  const d = matter(await fs.readFile('$TMPV1/archive/test-v1/' + files[0], 'utf8')).data;
  console.log('V1 answeredAt accepted:', d.answered_at === '2026-04-19T00:02:00Z');
});
"
rm -rf "$TMPV1"
# Expected: V1 answeredAt accepted: true

# V2+V3 — backfill + conditional answered_at
TMPMBOX=/tmp/archive-v2-mbox
rm -rf "$TMPMBOX"; mkdir -p "$TMPMBOX/to-claude"

# Scenario A: message без received_at, archived as no-reply-needed → backfill
cat > "$TMPMBOX/to-claude/2026-04-19T00-00-00Z-test-a-codex-001.md" <<'EOF'
---
id: 2026-04-19T00-00-00Z-codex-001
thread: test-a
from: codex
to: claude
status: pending
created: '2026-04-19T00:00:00Z'
project: workflow
---
body
EOF

cd dashboard && node -e "
import('../scripts/mailbox-lib.mjs').then(async (m) => {
  const matter = (await import('gray-matter')).default;
  const fs = await import('node:fs/promises');
  await m.archiveMessageFile({
    relativePath: 'to-claude/2026-04-19T00-00-00Z-test-a-codex-001.md',
    resolution: 'no-reply-needed',
    mailboxRoot: '$TMPMBOX'
  });
  const files = await fs.readdir('$TMPMBOX/archive/test-a');
  const d = matter(await fs.readFile('$TMPMBOX/archive/test-a/' + files[0], 'utf8')).data;
  console.log('V2 backfill received_at=archived_at:', d.received_at === d.archived_at);
  console.log('V3 no answered_at for no-reply-needed:', !('answered_at' in d));
});
"

# Scenario B: message с received_at, archived as answered + answeredAt → set
mkdir -p "$TMPMBOX/to-claude"
cat > "$TMPMBOX/to-claude/2026-04-19T00-05-00Z-test-b-codex-002.md" <<'EOF'
---
id: 2026-04-19T00-05-00Z-codex-002
thread: test-b
from: codex
to: claude
status: pending
created: '2026-04-19T00:05:00Z'
received_at: '2026-04-19T00:06:00Z'
project: workflow
---
body B
EOF

cd dashboard && node -e "
import('../scripts/mailbox-lib.mjs').then(async (m) => {
  const matter = (await import('gray-matter')).default;
  const fs = await import('node:fs/promises');
  await m.archiveMessageFile({
    relativePath: 'to-claude/2026-04-19T00-05-00Z-test-b-codex-002.md',
    resolution: 'answered',
    mailboxRoot: '$TMPMBOX',
    answerMessageId: 'reply-id-xyz',
    answeredAt: '2026-04-19T00:07:00Z'
  });
  const files = await fs.readdir('$TMPMBOX/archive/test-b');
  const d = matter(await fs.readFile('$TMPMBOX/archive/test-b/' + files[0], 'utf8')).data;
  console.log('V3 answered_at set for answered:', d.answered_at === '2026-04-19T00:07:00Z');
  console.log('V2 received_at preserved (no backfill):', d.received_at === '2026-04-19T00:06:00Z');
});
"

rm -rf "$TMPMBOX"

# V4
grep -n "answeredAt" scripts/mailbox.mjs
# Expected: ≥1 match в handleReply archiveMessageFile call

# V5
grep -c "statusAnswered\|statusNoReplyNeeded\|statusSuperseded\|timestampAnswered\|timestampArchived" dashboard/src/App.jsx
# Expected: ≥10 (5 keys × 2 languages в translations = 10 + usages)

# V6
grep -c "answered_at\|timestampAnswered\|timestampArchived" dashboard/src/App.jsx
# Expected: ≥6

# V7
cd dashboard && npx vite build 2>&1 | tail -5

# V8
grep -c 'answered_at timestamp field\|Archive timeline completeness' local-claude-codex-mailbox-workflow.md
# Expected: 2

# V9
PD_PATTERNS='$PD_PATTERNS'
grep -riE "$PD_PATTERNS" --include="*.js" --include="*.jsx" --include="*.mjs" --include="*.html" --include="*.json" dashboard/ scripts/ 2>/dev/null
grep -riE "$PD_PATTERNS" --include="*.md" CLAUDE.md README.md README.ru.md local-claude-codex-mailbox-workflow.md workflow-*.md 2>/dev/null
echo "--scan done"

# V10
git status --short

# V11 — recoverOrphans flows answeredAt
TMPV11=/tmp/archive-v11-mbox
rm -rf "$TMPV11"; mkdir -p "$TMPV11/to-claude" "$TMPV11/to-codex"
# Orphan pending (reply already exists in to-claude)
cat > "$TMPV11/to-codex/2026-04-19T00-00-00Z-test-v11-claude-001.md" <<'EOF'
---
id: 2026-04-19T00-00-00Z-claude-001
thread: test-v11
from: claude
to: codex
status: pending
created: '2026-04-19T00:00:00Z'
received_at: '2026-04-19T00:01:00Z'
project: workflow
---
orphan body
EOF
cat > "$TMPV11/to-claude/2026-04-19T00-05-00Z-test-v11-codex-002.md" <<'EOF'
---
id: 2026-04-19T00-05-00Z-codex-002
thread: test-v11
from: codex
to: claude
status: pending
created: '2026-04-19T00:05:00Z'
received_at: '2026-04-19T00:06:00Z'
reply_to: 2026-04-19T00-00-00Z-claude-001
project: workflow
---
reply body
EOF

cd dashboard && node -e "
import('../scripts/mailbox-lib.mjs').then(async (m) => {
  const matter = (await import('gray-matter')).default;
  const fs = await import('node:fs/promises');
  await m.recoverOrphans('$TMPV11');
  const files = await fs.readdir('$TMPV11/archive/test-v11');
  const orphanFile = files.find((f) => f.includes('claude-001'));
  const d = matter(await fs.readFile('$TMPV11/archive/test-v11/' + orphanFile, 'utf8')).data;
  console.log('V11 answered_at populated from reply.created:', d.answered_at === '2026-04-19T00:05:00Z');
  console.log('V11 answer_message_id set:', d.answer_message_id === '2026-04-19T00-05-00Z-codex-002');
});
"
rm -rf "$TMPV11"
# Expected: both true

# V12 — handleArchive CLI guard: grep-based verification (mailbox.mjs не читает env mailbox root; real-cli test против real agent-mailbox unsafe)
grep -c 'answered-at is required when --resolution=answered' scripts/mailbox.mjs
# Expected: 1

# V13 — /api/archive server guard symmetric: grep-based verification
grep -c 'answered_at is required when resolution=answered' dashboard/server.js
# Expected: 1
```

Any FAIL → STOP.

### Phase 2 — user visual `[awaits user]`

| # | Check |
|---|-------|
| P2.1 | Archive card: 4 timestamp rows (conditional «Ответ отправлен» only для answered), status chip в header |
| P2.2 | no-reply-needed archive: 3 rows (sent, received, archived), chip «Закрыто без ответа» |
| P2.3 | answered archive: 4 rows, chip «Выполнено», «Ответ отправлен» показывается |

### Phase 3 — N/A

---

## §8 Acceptance criteria

- [ ] Phase 1 V1-V13 PASS
- [ ] Archive card полная timeline (4 conditional rows)
- [ ] Status chip separate from dates
- [ ] Backfill received_at при missing
- [ ] answered_at ТОЛЬКО для resolution=answered
- [ ] Spec updated
- [ ] PD scan clean
- [ ] No files outside whitelist
- [ ] No commit/push

---

## §9 Out of scope

- `answer_message_id` UI display (next handoff)
- Retroactive migration existing archived messages без `answered_at`
- Additional resolution values
- Supervisor Phase A (committed deferred, separate)

---

## §10 Rollback

`git stash push -- <whitelist>`; если dirty worktree — STOP + surface. После commit: `git revert <sha>`.

---

## §11 Discrepancy checkpoints

1. P2 baseline drift >5 → STOP.
2. P3 empirical FAIL (preservation) → STOP — architecture assumption broken.
3. P4 build FAIL → repair environment, re-run.
4. V1-V13 any FAIL → STOP.
5. Modification agent-mailbox/** (manual edit) — STOP. Programmatic mutation under test в isolated TMPMBOX — expected.
6. Touching Supervisor Phase A artefacts → STOP.

---

## §12 Self-audit checklist

- [ ] 1: P1-P4 OK
- [ ] 2: Change 1 (lib) — 4 substeps (readMessage answered_at, archiveMessageFile signature+backfill, generateMessageFile +created, recoverOrphans passes answeredAt)
- [ ] 3: Change 2 (CLI) — 3 substeps (handleReply passes answeredAt, handleArchive guard + accept flags, usageText update)
- [ ] 4: Change 3 (server.js /api/archive) — guard + accept answered_at/answer_message_id
- [ ] 5: Change 4 (App.jsx) — 4 substeps
- [ ] 6: Change 5 (spec)
- [ ] 7: V1-V13 verbatim
- [ ] 7: Whitelist drift clean
- [ ] 8: No commit/push
- [ ] 9: Discrepancies logged
- [ ] 10: Report §0-§11 filled
- [ ] 11: Server /api/archive guard verified via grep

---

## §13 Notes to Codex

- Planning snapshot: HEAD=`fbf17cf`.
- Environment: WSL, `cwd=/mnt/e/Project/workflow`.
- `generateMessageFile` return shape — check в pre-flight: нужно убедиться что `created` есть в response. Если нет — use `toUtcTimestamp()` at call site in handleReply.
- Anti-fabrication.
- No new deps.
- Supervisor Phase A — не трогать.

---

## §14 Commits strategy

Single commit:

```
feat(mailbox): complete archive timeline — 4-row card + status chip + answered_at + backfill

Changes:
- scripts/mailbox-lib.mjs: archiveMessageFile accepts answeredAt; received_at backfill = archived_at если missing; answered_at written только для resolution=answered; readMessage reads answered_at
- scripts/mailbox.mjs: handleReply passes answeredAt = created.created
- dashboard/src/App.jsx: 4-row conditional timeline (sent/received/answered/archived) + separate status chip (Выполнено / Закрыто без ответа / Заменено)
- local-claude-codex-mailbox-workflow.md: answered_at field + archive timeline completeness spec

User requested «ничего не теряется + полная история по датам + отдельно отправка в архив + отдельно no-reply case». Design через mailbox-archive-complete-design thread.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Push: ждёт user command.


## Legacy Workflow Note (2026-04-21)

This file is preserved as a historical artifact from an earlier workflow revision.

It may mention legacy patterns such as `Claude planner / Codex executor`, user relay, `compact prompt`, or older handoff shapes.

Do not use it as the live operating template. Current contract: `docs/codex-system-prompt.md`, `AGENTS.md`, `workflow-role-distribution.md`, `workflow-instructions-claude.md`, and `workflow-instructions-codex.md`.
