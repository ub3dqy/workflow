# Mailbox Phase 3 — Helper Scripts — Execution Plan

> **Статус**: ready for execution
>
> **Задача**: создать CLI-инструмент `scripts/mailbox.mjs` с командами `send`, `list`, `reply`, `archive`, `recover` для работы с mailbox из терминала обоих агентов.
>
> **Предыдущие фазы**: Phase 1 MVP ✅, Phase 2 Safe Actions ✅, Phase 2 SessionStart Hook ✅
>
> **Спецификация**: `local-claude-codex-mailbox-workflow.md` — секция "Phase 3 — helper scripts" (строки 673-696), "Thread continuity discovery" (352-391), "Error recovery" (430-443)

---

## Иерархия источников правды

1. **Офдока** (Node.js CLI docs) — главная правда
2. **Спецификация** (`local-claude-codex-mailbox-workflow.md`) — protocol rules
3. **Существующий server.js** (`dashboard/server.js`) — reference implementation
4. **Этот план** — может содержать ошибки

---

## Design decision: Node.js вместо Python

Спецификация предлагает `scripts/mailbox.py`. Мы делаем `scripts/mailbox.mjs` (Node.js) по следующим причинам:

- **Нет Python deps в проекте** — нет pyproject.toml, нет venv, нет uv. Добавление Python тянет новый runtime setup.
- **Node уже есть** — dashboard работает на Node, hook скрипт тоже на Node.
- **server.js содержит всю логику** — generateMessageFile, archiveMessageFile, nextSequenceForThreadFrom, validation. Можно extract'нуть в shared module.
- **Один runtime** проще поддерживать в dual-agent workflow (оба агента знают Node).

Trade-off: spec говорит Python. Если пользователь предпочитает Python — Discrepancy, стоп.

---

## Doc verification table

| # | URL | Что проверить |
|---|-----|---------------|
| D1 | https://nodejs.org/api/util.html#utilparseargsconfig | `parseArgs()` — built-in CLI arg parser (Node 18.3+) |
| D2 | https://www.npmjs.com/package/gray-matter | `matter.stringify()` и `matter()` API — already used in server.js |

---

## Scope overview

### Block A — Extract shared mailbox library

Выделить core mailbox logic из `dashboard/server.js` в `scripts/mailbox-lib.mjs`:
- Frontmatter parsing/generation
- File collection (collectMarkdownFiles)
- Seq allocation (nextSequenceForThreadFrom)
- Message reading (readMessage)
- Message generation (generateMessageFile)
- Archive (archiveMessageFile)
- Validation (thread, path, resolution)
- Recovery (find orphaned pending messages)

### Block B — CLI entry point

`scripts/mailbox.mjs` — CLI с subcommands через `parseArgs()`:

```
node scripts/mailbox.mjs send --to codex --thread my-topic --body "Question"
node scripts/mailbox.mjs list [--bucket to-claude|to-codex|archive|all]
node scripts/mailbox.mjs reply --to <relativePath> --body "Answer"
node scripts/mailbox.mjs archive --path <relativePath> [--resolution answered|no-reply-needed|superseded]
node scripts/mailbox.mjs recover
```

### Block C — Update server.js to import from shared lib

`dashboard/server.js` импортирует functions из `scripts/mailbox-lib.mjs` вместо дублирования.

---

## Whitelist файлов

### Создать (новые файлы)

| # | Путь | Описание |
|---|------|----------|
| W1 | `scripts/mailbox-lib.mjs` | Shared mailbox library (extracted from server.js) |
| W2 | `scripts/mailbox.mjs` | CLI entry point |

### Изменить (существующие)

| # | Путь | Что меняется |
|---|------|-------------|
| W3 | `dashboard/server.js` | Импортировать из `../scripts/mailbox-lib.mjs` вместо inline functions |

### Не трогать

- `dashboard/src/*` — UI не затрагивается
- `dashboard/package.json` — npm deps не меняются
- Все `.md` файлы кроме report
- `scripts/mailbox-status.mjs` — hook остаётся standalone (без gray-matter dep)
- `.claude/settings.local.json`

---

## Changes

### Change 1: scripts/mailbox-lib.mjs

Extract из server.js. Функции для экспорта:

| Function | Source | Notes |
|----------|--------|-------|
| `collectMarkdownFiles(dir, recursive)` | server.js:166-199 | As-is |
| `readMessage(filePath, bucketName, mailboxRoot)` | server.js:234-268 | Добавить `mailboxRoot` param |
| `readBucket(bucketName, mailboxRoot)` | server.js:271-293 | Добавить `mailboxRoot` param |
| `generateMessageFile({to, from, thread, body, replyTo, mailboxRoot})` | server.js:295-326 | Добавить `from` param (CLI позволяет указать from=claude/codex/user), добавить `mailboxRoot` param |
| `archiveMessageFile({relativePath, resolution, mailboxRoot})` | server.js:328-378 | Добавить `mailboxRoot` param |
| `nextSequenceForThreadFrom(thread, from, mailboxRoot)` | server.js:214-232 | Добавить `mailboxRoot` param |
| `recoverOrphans(mailboxRoot)` | NEW | Scan inbox for pending messages that already have replies — auto-archive them |
| `validateThread(thread)` | server.js:91-107 | As-is |
| `validateReplyTarget(to)` | server.js:109-117 | As-is |
| `validateRelativeInboxPath(relativePath, mailboxRoot)` | server.js:119-151 | Добавить `mailboxRoot` param |

Все функции параметризованы `mailboxRoot` вместо module-level constant — чтобы и server, и CLI могли использовать разные root paths.

**gray-matter**: library импортирует gray-matter. Это ок — gray-matter уже в dashboard/node_modules. CLI запускается из project root и может resolve dependency через relative import или NODE_PATH.

**Важно**: `import matter from "gray-matter"` и `import { marked } from "marked"` — library нуждается в этих deps. Они уже установлены в `dashboard/node_modules/`. CLI скрипт должен resolve'ить их. Два варианта:
1. Symlink/copy node_modules в scripts/ — хрупко
2. CLI запускается с `--experimental-import-meta-resolve` или из dashboard/ context
3. **Лучший**: добавить root `package.json` с `"type": "module"` и `"dependencies"` pointing to dashboard deps, или просто `npm install gray-matter marked` в root

**Рекомендация**: добавить минимальный root `package.json` с gray-matter + marked. Это проще и чище чем hacks с NODE_PATH.

### Change 2: scripts/mailbox.mjs

CLI entry point. Использует `parseArgs()` (Node built-in) + imports из `mailbox-lib.mjs`.

**Subcommands:**

#### `send`

```
node scripts/mailbox.mjs send --from claude --to codex --thread my-topic --body "Question"
```

- `--from` required (claude|codex|user)
- `--to` required (claude|codex)
- `--thread` required
- `--body` required (или `--file` для body из файла)
- `--reply-to` optional (id исходного сообщения)
- Creates file, prints filename to stdout

#### `list`

```
node scripts/mailbox.mjs list
node scripts/mailbox.mjs list --bucket to-claude
node scripts/mailbox.mjs list --bucket archive
```

- Default: all buckets
- Output: table с thread, from, to, status, created, filename
- `--json` flag для machine-readable output

#### `reply`

```
node scripts/mailbox.mjs reply --to <relativePath> --body "Answer" [--from user]
```

- `--to` = relativePath исходного сообщения (не id)
- Автоматически наследует `thread` из target message `[PROJECT-spec:387-389]`
- `--from` default = `"user"`, можно override для agent-initiated replies
- After reply — auto-archive original (одна операция) `[PROJECT-spec:440]`

#### `archive`

```
node scripts/mailbox.mjs archive --path <relativePath> [--resolution no-reply-needed]
```

- `--resolution` default = `"answered"`
- Path traversal validation

#### `recover`

```
node scripts/mailbox.mjs recover
```

- Scan inbox for pending messages
- For each: check if reply exists (by `reply_to` match in opposite inbox or archive)
- If reply found — auto-archive pending as `resolution: answered`
- Print what was recovered
- `[PROJECT-spec:430-443]` — error recovery spec

### Change 3: Root package.json

Минимальный:

```json
{
  "private": true,
  "type": "module",
  "dependencies": {
    "gray-matter": "^4.0.3",
    "marked": "^18.0.0"
  }
}
```

Это позволит `scripts/mailbox-lib.mjs` импортировать gray-matter без path hacks. `npm install` в root.

### Change 4: dashboard/server.js refactor

Заменить inline functions на imports из `../scripts/mailbox-lib.mjs`. Server остаётся рабочим, но code duplication уходит.

Import pattern:
```js
import {
  collectMarkdownFiles,
  readMessage,
  readBucket,
  generateMessageFile,
  archiveMessageFile,
  // ...
} from "../scripts/mailbox-lib.mjs";
```

Server.js сохраняет свои Express routes, error handling, middleware — только utility functions переезжают.

**Важно**: после refactor запустить `npx vite build` и `curl` smokes чтобы убедиться что server всё ещё работает.

---

## Verification phases

### Phase 1 — Codex self-check

| # | Test | Command / Action | Expected |
|---|------|-----------------|----------|
| V1 | send creates file | `node scripts/mailbox.mjs send --from claude --to codex --thread cli-test --body "hello from CLI"` | File created, filename printed |
| V2 | list shows message | `node scripts/mailbox.mjs list` | Table with cli-test thread |
| V3 | list --json | `node scripts/mailbox.mjs list --json` | Valid JSON array |
| V4 | reply inherits thread | `node scripts/mailbox.mjs reply --to to-codex/<filename> --body "reply text"` | New file in to-claude/ with same thread, original auto-archived |
| V5 | archive works | Send another → `node scripts/mailbox.mjs archive --path to-codex/<file>` | File moved to archive/cli-test/ |
| V6 | recover finds orphans | Create pending + matching reply manually → `node scripts/mailbox.mjs recover` | Orphan archived |
| V7 | server still works | `cd dashboard && node server.js &` → `curl http://127.0.0.1:3001/api/messages` | JSON response |
| V8 | server reply API | `curl -X POST http://127.0.0.1:3001/api/reply ...` | 201 with ok:true |
| V9 | vite build | `cd dashboard && npx vite build` | exit 0 |
| V10 | personal data | grep scan | clean |
| V11 | absolute paths | grep scan | clean |
| V12 | thread validation | `node scripts/mailbox.mjs send --from claude --to codex --thread "../escape" --body "x"` | Error, not created |

### Phase 2 — `[awaits user]`

| # | Test | Description |
|---|------|-------------|
| V13 | Agent uses CLI | Claude или Codex использует `node scripts/mailbox.mjs send` вместо ручного создания файлов |
| V14 | Cross-agent round-trip | Claude send → Codex reply (через CLI) → verify thread continuity |

---

## Acceptance criteria

- [ ] `scripts/mailbox-lib.mjs` содержит extracted mailbox logic
- [ ] `scripts/mailbox.mjs` CLI с 5 subcommands (send, list, reply, archive, recover)
- [ ] `reply` автоматически наследует thread из target + auto-archives original
- [ ] `recover` находит и архивирует orphaned pending messages
- [ ] `dashboard/server.js` refactored to import from shared lib
- [ ] Server API и vite build по-прежнему работают
- [ ] Root `package.json` с gray-matter + marked
- [ ] `npm install` в root без ошибок
- [ ] Thread validation блокирует path traversal в slugs
- [ ] Нет personal data, нет абсолютных путей

---

## Out of scope

- UI changes (dashboard src не трогаем)
- Cached index / incremental lookup (оптимизация если масштаб потребует)
- File locking (atomic seq через full scan, не flock)
- `--file` flag для body из файла (можно добавить позже)
- Aliases (`mb` вместо `node scripts/mailbox.mjs`)

---

## Rollback

```bash
cd E:/Project/workflow
git checkout -- dashboard/server.js
rm -rf scripts/mailbox-lib.mjs scripts/mailbox.mjs package.json package-lock.json node_modules
```

---

## Discrepancy handling

1. **Spec says Python, plan says Node** — design decision зафиксирован выше. Если пользователь предпочитает Python — стоп.
2. **gray-matter resolve** — если root package.json + npm install не работает для scripts/ imports — fallback: встроить simple frontmatter parser (как в mailbox-status.mjs)
3. **Server refactor breaks something** — rollback server.js, keep CLI standalone

---

## Notes для Codex

1. **Node.js, не Python.** Spec предлагал Python, но проект целиком на Node. Design decision принят.
2. **`from` param в CLI**: для send и reply CLI позволяет указать `--from claude` или `--from codex`. Это отличие от dashboard UI, где from всегда "user". Агенты используют CLI со своим именем.
3. **`reply --to` принимает relativePath**, не message id. Это проще для CLI usage — можно копировать путь из `list` output.
4. **Auto-archive on reply**: `reply` = send + archive в одной команде. Если archive fail — print warning, не crash.
5. **Root package.json**: `"private": true`, без `"name"` и `"version"`. Только deps.
6. **mailbox-status.mjs не трогать** — hook script остаётся standalone (без gray-matter).
7. **Тестовые файлы**: очистить после smokes.
8. **`parseArgs()`** — Node built-in since 18.3. Не нужен commander/yargs.
