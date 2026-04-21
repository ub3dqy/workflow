# Dashboard Phase 2 — Safe Actions (Reply + Archive)

> **Статус**: ready for execution
>
> **Задача**: добавить в dashboard интерактивные действия reply и archive, транслируя их в те же файловые операции, что и ручной mailbox protocol.
>
> **Предыдущая фаза**: `docs/codex-tasks/mailbox-phase1-mvp.md` — read-only dashboard ✅
>
> **Спецификация**: `local-claude-codex-mailbox-workflow.md` — секции "Optional local UI layer" (строки 206-216), "Lifecycle and ownership" (393-409), "Archive / deletion policy" (430-443), "Filename convention" (318-350), "Message format" (255-293)

---

## Иерархия источников правды

1. **Офдока** (URL из Doc verification) — главная правда
2. **Спецификация** (`local-claude-codex-mailbox-workflow.md`) — protocol rules
3. **Реальное состояние кода** на диске — третья правда
4. **Этот план** — четвёртая, может содержать ошибки

---

## Doc verification table

| # | URL | Что проверить |
|---|-----|---------------|
| D1 | https://expressjs.com/en/5x/api.html | Express 5 `app.post()`, `express.json()` middleware, `req.body` |
| D2 | https://www.npmjs.com/package/gray-matter | `matter.stringify(content, data)` — генерация frontmatter |
| D3 | https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch | `fetch()` с методом POST, headers, body |

---

## Scope overview

### Block A — Server-side API endpoints

Добавить два POST endpoint'а в `dashboard/server.js`:

1. `POST /api/reply` — создаёт новый reply файл
2. `POST /api/archive` — перемещает сообщение в archive

### Block B — Client-side UI actions

Добавить кнопки Reply и Archive на каждую карточку в `dashboard/src/App.jsx`. Добавить функции в `dashboard/src/api.js`.

### Block C — Reply form

Модальное окно или inline-форма для ввода reply body. Минимальная: textarea + send button.

---

## Whitelist файлов

### Изменить (существующие файлы)

| # | Путь | Что меняется |
|---|------|-------------|
| W1 | `dashboard/server.js` | Добавить `express.json()`, `POST /api/reply`, `POST /api/archive`, helper functions |
| W2 | `dashboard/src/App.jsx` | Добавить кнопки Reply/Archive на карточки, reply form, action handlers |
| W3 | `dashboard/src/api.js` | Добавить `postReply()`, `archiveMessage()` |

### Не трогать

- Все `.md` файлы (кроме этого report)
- `dashboard/package.json` — новых зависимостей не нужно
- `dashboard/vite.config.js`
- `dashboard/index.html`
- `dashboard/src/main.jsx`

---

## Changes

### Change 1: server.js — express.json() middleware

Добавить `app.use(express.json())` после существующего `Cache-Control` middleware (после строки 31).

`[OFFICIAL-D1]` — Express 5 built-in JSON body parser.

**Сейчас**: сервер не принимает JSON body.
**Должно стать**: `req.body` доступен для POST запросов.

### Change 2: server.js — helper: generateMessageFile()

Функция генерации нового message файла:

```
Input: { from, to, thread, body, reply_to? }
Output: writes file to agent-mailbox/<target-dir>/<filename>.md
```

Правила из спецификации:
- **Filename**: `<timestamp>-<thread>-<from>-<seq>.md` `[PROJECT-spec:318-324]`
- **Timestamp**: UTC, ISO-like с `Z` suffix, на стороне writer'а `[PROJECT-spec:295-301]`
- **seq**: локальный для `thread + from`, best-effort из inbox + archive `[PROJECT-spec:337-340]`
- **id**: `<timestamp>-<from>-<seq>` `[PROJECT-spec:262]`
- **Frontmatter**: `id`, `thread`, `from`, `to`, `status: pending`, `created`, `reply_to` (если есть) `[PROJECT-spec:261-271]`
- **Body**: markdown content после frontmatter `[PROJECT-spec:255-258]`
- Генерировать frontmatter через `matter.stringify(body, data)` `[OFFICIAL-D2]`

### Change 3: server.js — helper: archiveMessage()

Функция архивирования сообщения:

```
Input: { relativePath }
Output: moves file to agent-mailbox/archive/<thread>/, updates frontmatter
```

Правила из спецификации:
- **mv**, не copy `[PROJECT-spec:434]`
- Создать `archive/<thread>/` если не существует `[PROJECT-spec:99-107]`
- Обновить frontmatter перед move: `status: archived`, `archived_at: <UTC now>`, `resolution: answered` или `no-reply-needed` `[PROJECT-spec:423-428]`
- Thread slug для archive dir берётся из frontmatter `thread`, не из filename `[PROJECT-spec:342-351]`
- Idempotency: если файл уже в archive — не дублировать `[PROJECT-spec:424-427 из error recovery]`

### Change 4: server.js — POST /api/reply

```
POST /api/reply
Content-Type: application/json

{
  "to": "claude" | "codex",
  "thread": "freshness-plan",
  "body": "markdown content",
  "reply_to": "2026-04-15T18-42-10Z-claude-001"  // optional
}
```

Логика:
1. Validate: `to` must be "claude" or "codex", `thread` required, `body` required
2. `from` = opposite of `to` (if to=claude then from=codex and vice versa). Но для UI-initiated reply `from` = `"user"`.
3. Вызвать `generateMessageFile()` с target dir = `to-<to>/`
4. Return `{ ok: true, filename, id }`

**Важно**: `from` для UI-initiated reply должен быть `"user"`, не "claude"/"codex". Пользователь через UI — это user, не agent.

### Change 5: server.js — POST /api/archive

```
POST /api/archive
Content-Type: application/json

{
  "relativePath": "to-codex/2026-04-15T18-42-10Z-freshness-plan-claude-001.md",
  "resolution": "answered" | "no-reply-needed" | "superseded"
}
```

Логика:
1. Validate: `relativePath` required, file must exist in agent-mailbox/
2. `resolution` defaults to `"answered"` if not provided
3. Вызвать `archiveMessage()` — read file, update frontmatter, mkdir archive/<thread>/, move
4. Return `{ ok: true, archivedTo }`

Security: validate that `relativePath` не содержит `..` и начинается с `to-claude/` или `to-codex/`. Нельзя архивировать уже archived files.

### Change 6: api.js — postReply() и archiveMessage()

```js
export async function postReply({ to, thread, body, replyTo }) { ... }
export async function archiveMessage({ relativePath, resolution }) { ... }
```

Оба — `fetch("/api/...", { method: "POST", headers, body })`.

`[OFFICIAL-D3]` — Fetch API POST.

### Change 7: App.jsx — кнопки Reply и Archive на карточках

На каждой карточке в колонках To Claude / To Codex (не в Archive):
- **Reply** button — открывает inline reply form
- **Archive** button — подтверждение + archive action

На карточках в Archive: ни Reply, ни Archive не показываются.

Reply form:
- Inline под карточкой (не modal — проще и ближе к контексту)
- Fields: textarea для body (placeholder: "Type your reply...")
- Buttons: "Send reply" + "Cancel"
- При send: вызвать `postReply({ to: message.from, thread: message.thread, body, replyTo: message.metadata?.id })` → затем auto-archive исходного message → refresh
- При cancel: скрыть форму

Archive action:
- При клике: вызвать `archiveMessage({ relativePath: message.relativePath, resolution: "no-reply-needed" })` → refresh
- Confirmation не обязателен для MVP (archive = mv, не delete)

**Стилизация**: кнопки в existing card style. Reply form — простая текстовая область с минимальным CSS, inline под карточкой.

### Change 8: App.jsx — hero text update

Изменить hero subtitle с "Read-only view" на что-то типа "View, reply, and archive messages." — отражает новый функционал.

---

## Verification phases

### Phase 1 — Codex self-check

| # | Test | Command / Action | Expected |
|---|------|-----------------|----------|
| V1 | express.json works | `curl -X POST http://127.0.0.1:3001/api/reply -H "Content-Type: application/json" -d '{"to":"codex","thread":"test","body":"hello"}'` | `{"ok":true,"filename":"...","id":"..."}` |
| V2 | reply file created | `ls agent-mailbox/to-codex/ \| grep test` | new file with `test` in name |
| V3 | reply frontmatter correct | `head -10 agent-mailbox/to-codex/<new-file>` | frontmatter with `from: user`, `to: codex`, `thread: test`, `status: pending` |
| V4 | archive works | `curl -X POST http://127.0.0.1:3001/api/archive -H "Content-Type: application/json" -d '{"relativePath":"to-codex/<file>"}'` | `{"ok":true,"archivedTo":"archive/test/..."}` |
| V5 | file moved | `ls agent-mailbox/archive/test/` | archived file present |
| V6 | inbox clean | `ls agent-mailbox/to-codex/ \| grep test` | no matches |
| V7 | archived frontmatter | `grep status agent-mailbox/archive/test/<file>` | `status: archived` |
| V8 | path traversal blocked | `curl -X POST http://127.0.0.1:3001/api/archive -H "Content-Type: application/json" -d '{"relativePath":"../../.gitignore"}'` | `400` or `403` error |
| V9 | vite build | `cd dashboard && npx vite build` | exit code 0 |
| V10 | personal data scan | `grep -riE "<personal-data-patterns>" dashboard --include="*.js" --include="*.jsx" -l` | no matches |
| V11 | no absolute paths | `grep -rE "/mnt/e\|E:\\\\\|C:\\\\Users\|/home/" dashboard --include="*.js" --include="*.jsx" -l` | no matches |

### Phase 2 — `[awaits user]`

| # | Test | Description |
|---|------|-------------|
| V12 | Reply from UI | Пользователь нажимает Reply на карточке, вводит текст, нажимает Send — новое сообщение появляется в соответствующей колонке |
| V13 | Archive from UI | Пользователь нажимает Archive — карточка переезжает из inbox в Archive колонку |
| V14 | Reply + auto-archive | При reply исходное сообщение автоматически архивируется |

---

## Acceptance criteria

- [ ] `POST /api/reply` создаёт файл по protocol spec (filename, frontmatter, body)
- [ ] `POST /api/archive` перемещает файл в `archive/<thread>/`, обновляет frontmatter
- [ ] Path traversal заблокирован (нельзя архивировать файлы вне agent-mailbox/)
- [ ] Кнопки Reply и Archive видны на карточках в inbox-колонках
- [ ] Кнопки НЕ видны на карточках в Archive
- [ ] Reply form inline, textarea + send/cancel
- [ ] При reply исходное сообщение auto-archived (одна логическая операция)
- [ ] `npx vite build` без ошибок
- [ ] Нет personal data, нет абсолютных путей
- [ ] Нет правок файлов вне whitelist'а
- [ ] `from: "user"` для UI-initiated reply

---

## Out of scope

- Thread view / thread navigation (Phase 2 UI polish)
- New message compose (без reply_to) — пока только reply
- Compose with file attachment
- Keyboard shortcuts
- Delete (только archive)
- Undo archive
- Bulk operations
- Hook integration (Phase 2 protocol, отдельная задача)

---

## Rollback

```bash
cd E:/Project/workflow
git checkout -- dashboard/server.js dashboard/src/App.jsx dashboard/src/api.js
# cleanup test messages
rm -rf agent-mailbox/to-codex/* agent-mailbox/to-claude/* agent-mailbox/archive/*
```

---

## Discrepancy handling

Если реальность ≠ план:
1. **Остановись**
2. **Запиши** в Discrepancies
3. **Мелочь** (CSS отличается) — запиши и продолжай
4. **Принципиально** (API Express 5 изменился, gray-matter.stringify не работает) — стоп, ждать decision

---

## Notes для Codex

1. **`matter.stringify(content, data)`** — проверить что возвращает markdown с frontmatter. Если API изменился, использовать ручную генерацию через template literal.
2. **`from: "user"`** для UI-initiated reply — это не agent, это пользователь через dashboard. Не путать с "claude"/"codex".
3. **Seq allocation**: для Phase 2 — best-effort. Scan `to-<dir>/` + `archive/<thread>/` по `thread + from`, взять max seq + 1. Не атомарный lock.
4. **Reply + archive = одна операция**: API `/api/reply` сам по себе не архивирует. Client (App.jsx) вызывает `postReply()` затем `archiveMessage()` последовательно. Если archive fail — reply уже создан, error recovery по spec: "при следующем визите в inbox видим pending + reply — доархивируем".
5. **Тестовые файлы**: после Phase 1 smokes удалить все тестовые сообщения из agent-mailbox/.
6. **Не трогать hero h1** — он стилизован и может быть специфичным. Обновить только subhead `<p>`.
7. **CSS**: добавлять новые стили в тот же `styles` const в App.jsx. Не создавать отдельный CSS файл.


## Legacy Workflow Note (2026-04-21)

This file is preserved as a historical artifact from an earlier workflow revision.

It may mention legacy patterns such as `Claude planner / Codex executor`, user relay, `compact prompt`, or older handoff shapes.

Do not use it as the live operating template. Current contract: `docs/codex-system-prompt.md`, `AGENTS.md`, `workflow-role-distribution.md`, `workflow-instructions-claude.md`, and `workflow-instructions-codex.md`.
