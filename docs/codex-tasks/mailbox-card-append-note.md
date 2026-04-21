# Mailbox Card Append-Note — Execution Plan

**Version**: v1
**Planning-audit**: `docs/codex-tasks/mailbox-card-append-note-planning-audit.md`
**Report template**: `docs/codex-tasks/mailbox-card-append-note-report.md`
**Target executor**: Codex (WSL)
**Planner**: Claude (Windows)
**Scope**: добавить возможность user-authored append-note к mailbox-карточкам через локальный дашборд. Не затрагивает agent-to-agent protocol.

---

## §1 Why this plan exists

User запросил фичу редактирования карточек («если мне нужно добавить что-то от себя, я смогу это сделать в дашборде»). Выбран Вариант 1 (append-only note). В ходе planning audit обнаружен конфликт с protocol invariant (`local-claude-codex-mailbox-workflow.md` §"Anti-pattern: do not edit existing messages"). User принял Path A — carve-out инварианта: agent-authored сообщения остаются immutable, user-authored append blocks явно разрешены.

Полная аудит-цепочка и evidence — в planning-audit §4 (Doc Verification), §6 (empirical tests), §10 (Gap G1 resolution).

---

## §2 Hierarchy of sources of truth

1. Official docs (Node.js 24, Express 5, gray-matter) — см. planning-audit §4.
2. Live code (`scripts/mailbox-lib.mjs`, `dashboard/server.js`, `dashboard/src/api.js`, `dashboard/src/App.jsx`) — см. planning-audit §3.
3. This plan — derived.
4. **Discrepancy rule**: если Codex в pre-flight обнаружит расхождение между этим планом и реальностью кода/доков — STOP, зафиксировать в report §5 Discrepancies, ждать user go/no-go. Не continue слепо.

---

## §3 Doc verification (§V1–§V4)

### §V1 — `fs.promises.appendFile` (Node.js 24)

> "Asynchronously appends data to a file, creating the file if it does not yet exist. Default encoding `'utf8'`, flag `'a'`, mode `0o666`. Fulfills with `undefined` upon success."
>
> — https://nodejs.org/docs/latest-v24.x/api/fs

**Использование в плане**: `appendNoteToMessageFile` НЕ использует `appendFile` напрямую. Вместо этого выполняет read → `matter()` → append-to-content → `matter.stringify()` → `fs.writeFile`. Обоснование — §V1 гарантирует корректность `appendFile`, но roundtrip-через-stringify даёт строгий контроль над newline handling и не зависит от trailing newline исходного файла.

### §V2 — Express 5 async error handling

> "Express 5+ automatically catches rejected promises from async route handlers, eliminating the need for manual try-catch blocks in async functions."
>
> — context7.com/expressjs/express/llms.txt (ID `/expressjs/express/v5.2.0`)

**Использование**: текущий `server.js` использует explicit try/catch с `ClientError`/`sendClientError` pattern для всех handlers. Новый `POST /api/notes` **сохраняет** этот паттерн для symmetry — не вводим mix async-throw и try/catch в одном файле.

### §V3 — gray-matter frontmatter parsing

> "Parses front-matter from a given string. It returns an object containing the parsed data, the content, and other metadata." Default delimiter `---`. Parser identifies **one** frontmatter block at the start; remainder is `content`.
>
> — github.com/jonschlinkert/gray-matter/blob/master/README.md

**Использование**: `matter.stringify(content, data)` reconstructs file. Body-internal `---` не консьюмится как closing delimiter — подтверждено empirical test §V4.

### §V4 — empirical (Node 24 + installed gray-matter 4.0.3 + marked 18.0.1)

- `matter()` → `stringify()` → `matter()` roundtrip preserves `data` identity, `content` preserves body-internal `---` literal (planning-audit §6 E1).
- `marked.parse()` (с `breaks: true, gfm: true`) рендерит:
  - `---` → `<hr>`
  - `**text**` → `<strong>text</strong>`
  - `\n` внутри параграфа → `<br>` (из-за `breaks: true`).

---

## §4 Pre-flight verification (Codex execute BEFORE any change)

Codex запускает эти шаги в WSL, `cwd=/mnt/e/Project/workflow`. Все commands + stdout verbatim в report §0.

### P1 — environment baseline

```bash
node --version
(cd dashboard && node --version && npm --version)
git -C /mnt/e/Project/workflow rev-parse --short HEAD
git -C /mnt/e/Project/workflow status --short
```

**Expected**:
- Node ≥ 20.19 (plan tested against Node 24).
- HEAD matches planning snapshot (see §13).
- **Baseline drift model — единая для §4 P1 и §9 final status**:
  - Codex записывает `git status --short` verbatim в report §0.4 **до** any change.
  - Pre-existing `M` outside whitelist (напр. CRLF/line-ending drift на cross-OS worktree, unrelated in-progress work) — **acceptable**, не STOP. Условия: (a) зафиксированы verbatim в §0.4, (b) файл **не трогается** во время execution, (c) в §9 final status та же запись остаётся unchanged.
  - Expected untracked: три handoff artefacts `docs/codex-tasks/mailbox-card-append-note*.md`.
  - **STOP + surface to user** только если execution вводит **новый** `M` / `??` outside whitelist, которого не было в §0.4 baseline. Это реальный scope violation; preserved CRLF drift — нет.

### P2 — read all whitelist files

```bash
wc -l scripts/mailbox-lib.mjs dashboard/server.js dashboard/src/api.js dashboard/src/App.jsx local-claude-codex-mailbox-workflow.md
```

Record verbatim line counts in report §0.3. **If any file count drifts >5 lines from baseline below, STOP + Discrepancy**:

| File | Baseline lines |
|------|---------------|
| `scripts/mailbox-lib.mjs` | 593 |
| `dashboard/server.js` | 167 |
| `dashboard/src/api.js` | 64 |
| `dashboard/src/App.jsx` | 1554 |
| `local-claude-codex-mailbox-workflow.md` | 777 |

### P3 — empirical reproducer from planning-audit §6

```bash
cd dashboard && node -e "
const matter = require('gray-matter');
const original = '---\nid: test-001\nfrom: user\nto: claude\nthread: demo\nstatus: pending\n---\nOriginal body paragraph 1.\n\nOriginal paragraph 2.';
const parsed1 = matter(original);
const withNote = matter.stringify(parsed1.content.trim() + '\n\n---\n\n**User note · 2026-04-18T12:34:56Z**\n\nnote line 1\nline 2', parsed1.data);
const parsed2 = matter(withNote);
console.log('data equal:', JSON.stringify(parsed1.data) === JSON.stringify(parsed2.data));
console.log('body has ---:', parsed2.content.includes('---'));
"
```

**Expected**: `data equal: true`, `body has ---: true`. Если PASS — окружение parity с planner; можно двигаться. Если FAIL — STOP + Discrepancy.

### P4 — baseline build

```bash
cd dashboard && npx vite build 2>&1 | tail -5
```

**Expected**: `✓ built` без ошибок. Baseline dist size ≈ 221.65 kB. Если FAIL — окружение сломано до изменений, STOP.

---

## §5 Whitelist — only these files may be modified

| File | Purpose |
|------|---------|
| `scripts/mailbox-lib.mjs` | +2 functions: `validateRelativeMessagePath`, `appendNoteToMessageFile` |
| `dashboard/server.js` | +1 endpoint: `POST /api/notes` |
| `dashboard/src/api.js` | +1 export: `postNote({relativePath, note})` |
| `dashboard/src/App.jsx` | translations + state + CSS + button + form |
| `local-claude-codex-mailbox-workflow.md` | Path A carve-out: allow user-authored append blocks |

**НЕ ТРОГАТЬ** (explicit):
- `dashboard/package.json`, `dashboard/package-lock.json`
- `scripts/mailbox.mjs` (CLI; out of scope — см. §10)
- `scripts/mailbox-status.mjs`
- `agent-mailbox/**` (runtime data; не создавать ни test fixtures коммитом)
- `docs/codex-tasks/*` кроме этой тройки handoff-файлов
- `CLAUDE.md`, `README.md`, `README.ru.md`, `LICENSE`
- `.github/workflows/ci.yml`
- `dashboard/vite.config.js`, `dashboard/index.html`, `dashboard/public/*`
- любые новые файлы (sidecar, migration scripts, docs)

---

## §6 Changes

### Change 1 — `scripts/mailbox-lib.mjs`

**Current** (line 165-198):

```js
export function validateRelativeInboxPath(relativePath, mailboxRoot) {
  const trimmed = sanitizeString(relativePath).replace(/\\/g, "/");

  if (!trimmed) {
    throw new ClientError(400, "relativePath is required");
  }

  if (path.isAbsolute(trimmed) || trimmed.includes("..")) {
    throw new ClientError(400, "relativePath must stay inside inbox buckets");
  }

  if (
    !trimmed.startsWith("to-claude/") &&
    !trimmed.startsWith("to-codex/")
  ) {
    throw new ClientError(
      400,
      'relativePath must start with "to-claude/" or "to-codex/"'
    );
  }

  const resolvedPath = path.resolve(mailboxRoot, trimmed);
  const mailboxPrefix = `${mailboxRoot}${path.sep}`;

  if (!resolvedPath.startsWith(mailboxPrefix)) {
    throw new ClientError(400, "relativePath escapes mailbox root");
  }

  return {
    bucketName: trimmed.split("/", 1)[0],
    relativePath: normalizePath(trimmed),
    absolutePath: resolvedPath
  };
}
```

**Target** — добавить новую функцию `validateRelativeMessagePath` **сразу после** `validateRelativeInboxPath` (не модифицировать existing):

```js
export function validateRelativeMessagePath(relativePath, mailboxRoot) {
  const trimmed = sanitizeString(relativePath).replace(/\\/g, "/");

  if (!trimmed) {
    throw new ClientError(400, "relativePath is required");
  }

  if (path.isAbsolute(trimmed) || trimmed.includes("..")) {
    throw new ClientError(400, "relativePath must stay inside mailbox buckets");
  }

  if (
    !trimmed.startsWith("to-claude/") &&
    !trimmed.startsWith("to-codex/") &&
    !trimmed.startsWith("archive/")
  ) {
    throw new ClientError(
      400,
      'relativePath must start with "to-claude/", "to-codex/", or "archive/"'
    );
  }

  const resolvedPath = path.resolve(mailboxRoot, trimmed);
  const mailboxPrefix = `${mailboxRoot}${path.sep}`;

  if (!resolvedPath.startsWith(mailboxPrefix)) {
    throw new ClientError(400, "relativePath escapes mailbox root");
  }

  return {
    bucketName: trimmed.split("/", 1)[0],
    relativePath: normalizePath(trimmed),
    absolutePath: resolvedPath
  };
}
```

**Target** — после `validateRelativeMessagePath` добавить `appendNoteToMessageFile`:

```js
export async function appendNoteToMessageFile({
  relativePath,
  note,
  mailboxRoot
}) {
  const { absolutePath, relativePath: normalizedPath } =
    validateRelativeMessagePath(relativePath, mailboxRoot);
  const trimmedNote = typeof note === "string" ? note.trim() : "";

  if (!trimmedNote) {
    throw new ClientError(400, "note is required");
  }

  if (trimmedNote.length > 4000) {
    throw new ClientError(400, "note must be 4000 characters or fewer");
  }

  const raw = await fs.readFile(absolutePath, "utf8");
  const parsed = matter(raw);
  const existingContent = parsed.content.replace(/\s+$/, "");
  const appendedBlock = [
    "",
    "",
    "---",
    "",
    `**User note · ${toUtcTimestamp()}**`,
    "",
    trimmedNote,
    ""
  ].join("\n");
  const nextContent = existingContent + appendedBlock;

  await fs.writeFile(
    absolutePath,
    matter.stringify(nextContent, parsed.data),
    "utf8"
  );

  return {
    relativePath: normalizePath(normalizedPath),
    appendedAt: parsed.data ? toUtcTimestamp() : ""
  };
}
```

**Rationale**:
- New validator (not extension of existing) — чтобы `readMessageByRelativePath` (line 347) и `archiveMessageFile` (line 453) не получили расширенный scope случайно. Каждый use-case имеет свой validator.
- `existingContent.replace(/\s+$/, "")` + leading `"\n\n"` гарантирует ровно один blank line между body и `---` независимо от trailing whitespace исходного файла.
- `matter.stringify(nextContent, parsed.data)` preserves frontmatter unchanged (§V3 + §V4 E1).
- Length cap 4000 символов — защита от abuse (sync с spec "message size cap" recommendation ~200 lines).

### Change 2 — `dashboard/server.js`

**Current** (line 1-19):

```js
import express from "express";
import {
  collectProjectValues,
  archiveMessageFile,
  ClientError,
  defaultMailboxRoot,
  filterMessagesByProject,
  generateMessageFile,
  host,
  isKnownBucket,
  normalizeProject,
  port,
  readBucket,
  sanitizeString,
  validateRelativeInboxPath,
  validateReplyTarget,
  validateResolution,
  validateThread
} from "../scripts/mailbox-lib.mjs";
```

**Target** — добавить `appendNoteToMessageFile` в импорт (alphabetically после `archiveMessageFile`):

```js
import express from "express";
import {
  appendNoteToMessageFile,
  collectProjectValues,
  archiveMessageFile,
  ClientError,
  defaultMailboxRoot,
  filterMessagesByProject,
  generateMessageFile,
  host,
  isKnownBucket,
  normalizeProject,
  port,
  readBucket,
  sanitizeString,
  validateRelativeInboxPath,
  validateReplyTarget,
  validateResolution,
  validateThread
} from "../scripts/mailbox-lib.mjs";
```

**Current** (line 128-163) — конец existing `POST /api/archive` handler, за ним `app.listen(...)`:

**Target** — между `POST /api/archive` и `app.listen(...)` добавить новый handler (точно по существующему pattern try/catch + `sendClientError`):

```js
app.post("/api/notes", async (request, response) => {
  try {
    const note = sanitizeString(request.body?.note);
    const appended = await appendNoteToMessageFile({
      relativePath: request.body?.relativePath,
      note,
      mailboxRoot
    });

    response.status(201).json({
      ok: true,
      relativePath: appended.relativePath,
      appendedAt: appended.appendedAt
    });
  } catch (error) {
    if (sendClientError(response, error)) {
      return;
    }

    if (error && error.code === "ENOENT") {
      response.status(404).json({
        error: "Message file not found"
      });
      return;
    }

    response.status(500).json({
      error: "Failed to append note",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});
```

**Rationale**: pattern symmetry с `/api/archive` (validation inside lib → ClientError handling → ENOENT fallback → 500 catch-all).

### Change 3 — `dashboard/src/api.js`

**Current** (line 51-64) — end of file:

```js
export async function archiveMessage({ relativePath, resolution }) {
  const response = await fetch("/api/archive", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      relativePath,
      resolution
    })
  });

  return parseJsonResponse(response, `Archive API returned ${response.status}`);
}
```

**Target** — после `archiveMessage` добавить `postNote`:

```js
export async function postNote({ relativePath, note }) {
  const response = await fetch("/api/notes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      relativePath,
      note
    })
  });

  return parseJsonResponse(response, `Notes API returned ${response.status}`);
}
```

### Change 4 — `dashboard/src/App.jsx`

Пять surgical вставок (4.1-4.5). Line numbers приводятся по post-`bb0249e` baseline; Codex обязан grep'ом подтвердить context перед edit.

#### Change 4.1 — import update (line 1)

**Current**:

```jsx
import { archiveMessage, fetchMessages, postReply } from "./api.js";
```

**Target**:

```jsx
import { archiveMessage, fetchMessages, postNote, postReply } from "./api.js";
```

#### Change 4.2 — translations (внутри `translations.ru` и `translations.en`)

**Current** `ru` (line 62-63 block, заканчивается на):

```js
    soundMute: "Выключить звук уведомлений",
    soundUnmute: "Включить звук уведомлений"
  },
```

**Target** `ru` — добавить после `soundUnmute`:

```js
    soundMute: "Выключить звук уведомлений",
    soundUnmute: "Включить звук уведомлений",
    addNote: "Добавить заметку",
    addingNote: "Отправка...",
    noteLabel: "Заметка от пользователя",
    notePlaceholder: "Добавьте свой комментарий к карточке...",
    noteHint: "Заметка дописывается в конец сообщения как user-блок. Оригинальное сообщение агента не редактируется.",
    sendNote: "Сохранить заметку",
    noteBodyError: "Текст заметки обязателен.",
    noteTooLong: "Заметка не может превышать 4000 символов."
  },
```

**Current** `en` (final lines of translations.en):

```js
    soundMute: "Mute notification sound",
    soundUnmute: "Unmute notification sound"
  }
};
```

**Target** `en`:

```js
    soundMute: "Mute notification sound",
    soundUnmute: "Unmute notification sound",
    addNote: "Add note",
    addingNote: "Saving...",
    noteLabel: "User note",
    notePlaceholder: "Add your comment to the card...",
    noteHint: "Notes are appended to the end of the message as a user block. The original agent message is not edited.",
    sendNote: "Save note",
    noteBodyError: "Note body is required.",
    noteTooLong: "Note must be 4000 characters or fewer."
  }
};
```

#### Change 4.3 — UI plumbing inside `MessageCard`

Codex выполняет точно этот diff (structure-wise):

1. Extend `MessageCard` props with: `isNoteOpen`, `noteBody`, `onOpenNote`, `onCancelNote`, `onNoteBodyChange`, `onSendNote`.
2. Добавить button "Add note" в `.actionRow` — между primary reply button и secondary archive button; button disabled when `activeAction` present или когда `isNoteOpen`.
3. Добавить note form под reply form (`replyForm` block), используя тот же layout pattern. Form label = `t.noteLabel`, placeholder = `t.notePlaceholder`, hint = `t.noteHint`, submit button text = `t.sendNote` или `t.addingNote`. Cancel button — `t.cancel`.
4. В archive column (`showActions === false`) кнопка «Add note» **всё равно показывается** — user может аннотировать архивные карточки. Но reply/archive кнопки остаются скрытыми.

Detailed JSX follows the existing `.actionRow` + `.replyForm` pattern in the component (line ~1044-1110 post-baseline). Codex copies conventions verbatim — ghost buttons, disabled-during-action logic, activeAction naming `note:${relativePath}`.

#### Change 4.4 — top-level state + handlers in `App()`

После existing state (`replyBody`/`activeAction`/...) добавить:

```js
  const [noteTargetPath, setNoteTargetPath] = useState("");
  const [noteBody, setNoteBody] = useState("");
```

После existing `archiveInboxMessage` добавить:

```js
  const openNote = useEffectEvent((message) => {
    setError("");
    setNoteTargetPath(message.relativePath);
    setNoteBody("");
  });

  const cancelNote = useEffectEvent(() => {
    if (activeAction) {
      return;
    }
    setNoteTargetPath("");
    setNoteBody("");
  });

  const sendNote = useEffectEvent(async (message) => {
    const trimmed = noteBody.trim();
    if (!trimmed) {
      setError(t.noteBodyError);
      return;
    }
    if (trimmed.length > 4000) {
      setError(t.noteTooLong);
      return;
    }

    setActiveAction(`note:${message.relativePath}`);

    try {
      await postNote({
        relativePath: message.relativePath,
        note: trimmed
      });
      setNoteTargetPath("");
      setNoteBody("");
      setError("");
      await refreshMessages();
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : String(actionError)
      );
      await refreshMessages({ background: true });
    } finally {
      setActiveAction("");
    }
  });
```

В JSX при передаче props в `MessageCard`: добавить `isNoteOpen={noteTargetPath === message.relativePath}`, `noteBody={noteTargetPath === message.relativePath ? noteBody : ""}`, `onOpenNote={openNote}`, `onCancelNote={cancelNote}`, `onNoteBodyChange={setNoteBody}`, `onSendNote={sendNote}`.

#### Change 4.5 — CSS (`.noteButton` + `.noteForm` reuse)

`.noteButton` стилизуется как `.cardButton--secondary` (тот же `archiveButton` look). Reuse `.replyForm` CSS — Codex адаптирует только className при необходимости. Допустимо: добавить alias class или шарить styling. Whitelist не запрещает добавить `.noteButton { }` в блок styles, если нужно отличаться.

### Change 5 — `local-claude-codex-mailbox-workflow.md` (Path A carve-out)

**Current** (section starts at line 411):

```markdown
### Anti-pattern: do not edit existing messages

Mailbox — append-only protocol.

Это значит:

- **не редактировать чужие сообщения in place**
- **не переписывать** body старого message для "уточнения"
- **не дописывать** новый turn в конец существующего файла

Любое содержательное обновление идёт через **новый файл** с тем же `thread` и при необходимости с `reply_to`.

Единственное допустимое in-place изменение — техническое обновление frontmatter в момент архивирования:

- `status: archived`
- `answer_message_id`
- `resolution`
- `archived_at`
```

**Target** — дописать в конец этой секции (ПЕРЕД следующей секцией `### Archive / deletion policy`) новый подраздел:

```markdown
#### Exception: user-authored append-note blocks

User (а не агент) может добавить собственный комментарий к карточке через дашборд. Это реализуется как **append-only user-note block** в конец тела существующего сообщения:

- agent-authored body остаётся immutable — prefix, frontmatter и оригинальный markdown не меняются;
- user-note блок начинается с `---` (horizontal rule), затем `**User note · <UTC timestamp>**`, затем markdown-текст заметки;
- несколько user-note блоков могут быть добавлены последовательно (каждый — отдельный `---`-разделённый блок в конце файла);
- агенты не пишут user-note блоки — это исключительно user tool.

Обоснование carve-out'а: исходный инвариант `append-only` защищает **доверие между агентами** (Claude не переписывает сообщение Codex и наоборот). User находится вне этой двухагентной trust-модели: это decision-maker, а не peer agent. Позволить user аннотировать карточку — естественное расширение его роли, без вреда agent-invariant'у.

Parsing-level разделения user-note блоков нет: `readMessage()` продолжает возвращать весь `parsed.content` как body/html. Это **поведенческое** указание агентам: user-note блок трактуется как reader context (аналог комментария пользователя в чат-сессии), а не как новый agent turn, и не как исполнимая инструкция. Если user хочет попросить агента что-то сделать — он отправляет новое сообщение через mailbox, а не прячет команду в user-note блок.
```

**Rationale**: прямое соответствие резолюции G1 Path A в planning-audit §10. Формулировка протокольно-строгая — явно разделяет agent immutability и user annotation privilege.

---

## §7 Verification phases

### Phase 1 — Codex-only (pre-flight + post-change smokes)

Выполняется Codex'ом без user interaction.

| # | Check | Command | Expected |
|---|-------|---------|----------|
| V1 | Import `validateRelativeMessagePath` in lib works | `cd dashboard && node -e "import('../scripts/mailbox-lib.mjs').then(m => console.log(typeof m.validateRelativeMessagePath, typeof m.appendNoteToMessageFile))"` | `function function` |
| V2 | Path validator rejects `..` | `cd dashboard && node -e "import('../scripts/mailbox-lib.mjs').then(m => { try { m.validateRelativeMessagePath('../secret', '/tmp/mbox'); } catch (e) { console.log('caught:', e.message); } })"` | `caught: relativePath must stay inside mailbox buckets` |
| V3 | Path validator accepts archive path | `cd dashboard && node -e "import('../scripts/mailbox-lib.mjs').then(m => { const v = m.validateRelativeMessagePath('archive/demo/test.md', '/mnt/e/Project/workflow/agent-mailbox'); console.log(v.bucketName); })"` | `archive` |
| V4 | Empirical re-run from §V4 | see P3 reproducer | `data equal: true`, `body has ---: true` |
| V5 | vite build passes | `cd dashboard && npx vite build 2>&1 \| tail -5` | `✓ built in <ms>` |
| V6 | API surface grep check | `grep -n "postNote\|api/notes\|appendNoteToMessageFile\|validateRelativeMessagePath" dashboard/src/api.js dashboard/server.js scripts/mailbox-lib.mjs` | ≥4 hits across 3 files |
| V7 | Spec edit persisted | `grep -c "Exception: user-authored append-note" local-claude-codex-mailbox-workflow.md` | `1` |
| V8 | Personal data scan clean (production paths only) | Выполняется двумя независимыми grep'ами через `;` (не `&&`, чтобы вторая выполнялась даже если первая не нашла matches), затем печатается marker: <br>`PD_PATTERNS='$PD_PATTERNS'`<br>`grep -riE "$PD_PATTERNS" --include="*.js" --include="*.jsx" --include="*.mjs" --include="*.html" --include="*.json" dashboard/ scripts/ 2>/dev/null; grep -riE "$PD_PATTERNS" --include="*.md" CLAUDE.md README.md README.ru.md local-claude-codex-mailbox-workflow.md workflow-*.md 2>/dev/null; echo "--scan done"` | only `--scan done` на stdout (нет matches ни в первой, ни во второй группе); handoff artefacts в `docs/codex-tasks/` + runtime `agent-mailbox/` намеренно excluded — они не шипятся в prod build и сами содержат PD pattern literal для этой проверки |
| V9 | Whitelist respected | `git status --short` | only files from §5 modified; no untracked files outside `docs/codex-tasks/*.md` artefacts |

Any V1-V9 FAIL → STOP + record in report §5, **do not commit**.

### Phase 2 — user visual check `[awaits user]`

| # | Check | How |
|---|-------|-----|
| P2.1 | Dashboard loads, card shows "Add note" button | user открывает `http://127.0.0.1:9119/` и подтверждает |
| P2.2 | Note form submits, `201` response, card body shows rendered block с `<hr>` + bold timestamp + note text после refresh | user добавляет note, проверяет |
| P2.3 | Archive cards тоже принимают note | user добавляет note к archived карточке, проверяет |
| P2.4 | Frontmatter не сломался | user открывает `agent-mailbox/.../<file>.md` в редакторе, видит frontmatter intact + user-note блок в конце |

### Phase 3 — `[awaits N-day]`

Не применимо для этой фичи (нет intermittent-failure class риска).

---

## §8 Acceptance criteria

Все должны быть `[x]`:

- [ ] Phase 1 V1-V9 PASS
- [ ] Report template заполнен по всем sections
- [ ] No files outside §5 whitelist modified
- [ ] Build size within ±5 kB от baseline (221.65 kB)
- [ ] No new personal data leaks (V8)
- [ ] `local-claude-codex-mailbox-workflow.md` carve-out persisted (V7)
- [ ] Codex не коммитит и не пушит без explicit user command
- [ ] Phase 2 `[awaits user]` items ждут user confirmation перед финализацией

---

## §9 Out of scope (прямо запрещено в этой итерации)

- **CLI symmetry**: `node scripts/mailbox.mjs note` — flagged как Gap G3, отдельный handoff.
- **Edit/delete существующих user-notes**: v1 только append. Редактирование — следующая итерация, если user запросит.
- **Notes для агентов**: Codex/Claude не должны уметь писать user-note блоки через CLI или dashboard API.
- **Refactoring**: consolidate `validateRelativeInboxPath` + `validateRelativeMessagePath` — не трогать. YAGNI.
- **Styling polish** за пределами минимально достаточного (note button + form reuse replyForm CSS).
- **Tests / unit tests**: repo не имеет test harness'а. Verification = empirical node -e + build + user visual.

---

## §10 Rollback

**До commit** — non-destructive rollback (чтобы не потерять параллельную работу в worktree):

1. Убедиться, что нет unrelated changes в whitelist-файлах: `git diff --stat scripts/mailbox-lib.mjs dashboard/server.js dashboard/src/api.js dashboard/src/App.jsx local-claude-codex-mailbox-workflow.md`.
2. Если только наши изменения — `git stash push -m "append-note-rollback" -- <whitelist files>` (reversible).
3. Если в worktree смешанные изменения — **STOP, surface to user**. `git checkout --` уничтожит чужую работу; не использовать.
4. Убедиться, что baseline build чист: `cd dashboard && npx vite build 2>&1 | tail -5`.
5. Если stash больше не нужен — `git stash drop`; если нужно вернуть — `git stash pop`.

**После commit** — `git revert <commit-sha>` (создаёт новый revert-коммит, history preserved).

User-notes уже записанные в `agent-mailbox/` файлы при rollback **остаются** в body — это рабочие данные, plan их не трогает. Если нужно удалить вручную — edit файла, снести `---\n\n**User note ...`-хвост.

---

## §11 Discrepancy checkpoints (STOP conditions)

1. Pre-flight P2 baseline line counts drift >5 lines → STOP + report §5.
2. Pre-flight P3 empirical reproducer FAIL → STOP. Environment mismatch; не продолжать.
3. Pre-flight P4 build FAIL → STOP. Baseline broken before changes.
4. Phase 1 V1-V9 any FAIL → STOP.
5. V8 personal data scan finds match → STOP, surface to user.
6. Codex обнаружил, что `scripts/mailbox-lib.mjs` shares state с чем-то вне whitelist (например import из mailbox.mjs side-effect) → STOP + clarify.
7. Любое изменение чьих-то pending messages в `agent-mailbox/` — STOP (этот plan не трогает runtime data).

---

## §12 Self-audit checklist (Codex fills during execution)

- [ ] 1: P1-P4 pre-flight OK
- [ ] 2: Change 1 (lib) applied; grep confirms 2 new exports
- [ ] 3: Change 2 (server) applied; grep confirms `/api/notes` route
- [ ] 4: Change 3 (api.js) applied; `postNote` exported
- [ ] 5: Change 4 (App.jsx) applied; 5 substeps done
- [ ] 6: Change 5 (spec carve-out) applied
- [ ] 7: V1-V9 recorded verbatim
- [ ] 8: V9 whitelist drift clean
- [ ] 9: No commit/push performed
- [ ] 10: Discrepancies (if any) recorded
- [ ] 11: Report §0-§11 filled
- [ ] 12: Screenshot / visual confirmation deferred to user (Phase 2)

≥10/12 OK → signal "ready for user review".

---

## §13 Notes to Codex

- **Environment**: executed в WSL, `cwd=/mnt/e/Project/workflow`. Если `node scripts/mailbox-lib.mjs` requires `/mnt/e/...` прямой Linux path, Codex сам решает.
- **Planning snapshot**: HEAD at plan creation is whatever user pushed last. If drift from planner's view — check via `git log -5 --oneline`; if non-trivial drift (unrelated edits to whitelist files), STOP + Discrepancy.
- **No commit/push without user command**. Plan ends with "ready for review"; user reads report, затем user сам командует commit/push.
- **No spontaneous test harness**. Do not add Jest/Vitest/etc. If tests needed, next handoff.
- **Windows launcher compatibility**: Codex execute в WSL. Если в ходе pre-flight обнаружится `node_modules/@rolldown/binding-win32-x64-msvc` missing — это Windows-side concern, WSL build будет работать через `@rolldown/binding-linux-x64-gnu`. See `E:/Project/memory claude/memory claude/wiki/concepts/wsl-windows-native-binding-drift.md`.
- **Anti-fabrication**: all Phase 1 V1-V9 outputs в report — raw stdout verbatim. No summaries.

---

## §14 Commits strategy

**Single commit** preferred.

Suggested message:

```
feat(dashboard): user-authored append-notes on mailbox cards

Change set:
- scripts/mailbox-lib.mjs: validateRelativeMessagePath + appendNoteToMessageFile
- dashboard/server.js: POST /api/notes
- dashboard/src/api.js: postNote wrapper
- dashboard/src/App.jsx: UI (translations + state + note form + add-note button)
- local-claude-codex-mailbox-workflow.md: Path A carve-out для user-authored blocks

Original agent-authored messages остаются immutable. Только user может добавлять append-блоки через dashboard; агенты — нет.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Split приемлем ТОЛЬКО если user прямо попросит (например: spec update separately).

**Push**: ждёт explicit user command `пуш`. Без него — локальный commit остаётся в working tree.


## Legacy Workflow Note (2026-04-21)

This file is preserved as a historical artifact from an earlier workflow revision.

It may mention legacy patterns such as `Claude planner / Codex executor`, user relay, `compact prompt`, or older handoff shapes.

Do not use it as the live operating template. Current contract: `docs/codex-system-prompt.md`, `AGENTS.md`, `workflow-role-distribution.md`, `workflow-instructions-claude.md`, and `workflow-instructions-codex.md`.
