# Multi-Project Support — Execution Plan

> **Статус**: ready for execution
>
> **Задача**: добавить поддержку нескольких проектов в одном workflow-репо. Один mailbox, один dashboard, один CLI — но сообщения разделяются по project.
>
> **Design decision**: вариант A (один repo) с `project` как отдельным frontmatter полем (не prefix в thread slug). Решение принято пользователем после анализа трёх вариантов.
---
## Changelog
- **2026-04-17**: Default behavior changed. `send` without `--project` now auto-detects project from `path.basename(process.cwd())`. Previously created file without `project:` field (unscoped). Explicit `--project <value>` still overrides. Edge case (filesystem root) yields empty string -> falls through to legacy unscoped behavior. See `docs/codex-tasks/mailbox-autoproject-wiki-revision.md` for migration rationale.
---
## Иерархия источников правды

1. **Спецификация** (`local-claude-codex-mailbox-workflow.md`) — protocol rules
2. **Реальное состояние кода** — вторая правда
3. **Этот план** — может содержать ошибки

---

## Doc verification table

| # | URL | Что проверить |
|---|-----|---------------|
| D1 | https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams | URL query params для dashboard project filter |

---

## Design

### Frontmatter: новое поле `project`

```yaml
---
id: 2026-04-16T12-00-00Z-claude-001
thread: freshness-plan
project: messenger
from: claude
to: codex
status: pending
created: 2026-04-16T12:00:00Z
---
```

- `project` — optional string. Если не указан через `--project`, CLI автоматически подставляет `path.basename(process.cwd())` (auto-detect from cwd). Empty-string fallback (filesystem root edge case) сохраняет legacy unscoped behavior (no `project:` field written). Значения: свободные slug'и (`messenger`, `office`, `memory-claude`, `workflow`).
- `project` НЕ влияет на thread slug, filename, archive path. Это чисто metadata-поле для фильтрации.
- Archive structure остаётся `archive/<thread>/` — без project prefix.

### Почему НЕ prefix в thread

- Thread slug остаётся чистым (`freshness-plan`, не `messenger/freshness-plan`)
- Archive dirs не ломаются
- Existing messages без `project` поля продолжают работать (backward compatible)
- Фильтрация по project — UI/CLI concern, не protocol concern

---

## Whitelist файлов

### Изменить

| # | Путь | Что меняется |
|---|------|-------------|
| W1 | `scripts/mailbox-lib.mjs` | readMessage: extract `project` field. generateMessageFile: accept `project` param |
| W2 | `scripts/mailbox.mjs` | `--project` flag для send, list, reply. Filter по project в list |
| W3 | `scripts/mailbox-status.mjs` | Показывать project в preview если есть |
| W4 | `dashboard/server.js` | GET /api/messages: accept `?project=` query param для фильтрации |
| W5 | `dashboard/src/App.jsx` | Project filter dropdown/selector в toolbar. Карточки показывают project badge |
| W6 | `dashboard/src/api.js` | fetchMessages: передать project query param |

### Report file

| # | Путь |
|---|------|
| W7 | `docs/codex-tasks/multi-project-support-report.md` |

### Не трогать

- `local-claude-codex-mailbox-workflow.md` — spec update отдельно, после реализации
- `dashboard/package.json` — без новых deps
- `dashboard/vite.config.js`

---

## Changes

### Change 1: mailbox-lib.mjs — project field

В `readMessage()` (строка ~250): добавить extraction:
```js
project: typeof parsed.data.project === "string" ? parsed.data.project : "",
```

В `generateMessageFile()` (строка ~374): добавить `project` в data object если передан:
```js
if (project) {
  data.project = project;
}
```

Function signature: добавить `project = ""` в destructured params.

### Change 2: mailbox.mjs — --project flag

#### `send`

Добавить `--project` option:
```
node scripts/mailbox.mjs send --from claude --to codex --thread plan --project messenger --body "..."
```

Передать в `generateMessageFile({ ..., project })`.

#### `list`

Добавить `--project` filter:
```
node scripts/mailbox.mjs list --project messenger
```

Фильтрация: если `--project` указан, показать только сообщения с `message.project === value`. Сообщения без `project` НЕ показываются при фильтрации (они "unscoped").

Без `--project`: показать все сообщения (текущее поведение).

Добавить `project` в таблицу headers.

#### `reply`

`--project` не нужен — reply наследует project из target message (как thread).

### Change 3: mailbox-status.mjs — project in preview

В `buildSummary()`: если message имеет project, показать его в preview line:
```
- [freshness-plan] from claude, 2026-04-16T12:00:00Z (Claude inbox, messenger) — ...
```

Если project пустой — не показывать "()" — текущий формат.

### Change 4: server.js — query param filter

`GET /api/messages?project=messenger`

Логика:
1. Read `req.query.project`
2. Если указан — filter messages по `message.project === project` в каждом bucket
3. Если не указан — возвращать все (текущее поведение)

`POST /api/reply`: принимать optional `project` в body, передавать в `generateMessageFile`.

### Change 5: api.js — project param

```js
export async function fetchMessages(signal, project) {
  const params = project ? `?project=${encodeURIComponent(project)}` : "";
  const response = await fetch(`/api/messages${params}`, { ... });
  ...
}
```

### Change 6: App.jsx — project filter UI

Добавить в toolbar:
- State: `const [project, setProject] = useState("")` (empty = all projects)
- Dropdown/select с известными проектами (собираются из текущих сообщений dynamically)
- Option "Все проекты" / "All projects" (значение = "")
- При выборе: `fetchMessages(signal, project)` с новым param
- Project badge на карточках (chip рядом со status)

**Как собрать список проектов**: из ответа `/api/messages` (без фильтра) extract unique `project` values. Кешировать в state. Не hardcode'ить.

**i18n**: добавить ключи `allProjects`, `project` (label) в translations.

Persistence: `localStorage.getItem("mailbox-project")`.

---

## Verification phases

### Phase 1 — Codex self-check

| # | Test | Expected |
|---|------|----------|
| V1 | send with --project | File created with `project: messenger` in frontmatter |
| V2 | send without --project | File created with `project: <cwd basename>`; empty basename (filesystem root edge case) -> unscoped (no field) |
| V3 | list --project messenger | Only messenger messages shown |
| V4 | list without --project | All messages shown |
| V5 | reply inherits project | Reply has same project as original |
| V6 | API ?project=messenger | JSON filtered to messenger only |
| V7 | API without ?project | All messages (backward compatible) |
| V8 | Dashboard project filter | Dropdown shows projects, selection filters cards |
| V9 | Project badge on cards | Chip visible with project name |
| V10 | Hook shows project in preview | `(Claude inbox, messenger)` format |
| V11 | Backward compat: old messages | Messages without project field still show and work |
| V12 | vite build | exit 0 |
| V13 | personal data scan | clean |
| V14 | absolute paths scan | clean |

### Phase 2 — `[awaits user]`

| # | Test | Description |
|---|------|-------------|
| V15 | Real multi-project use | Пользователь отправляет сообщения для разных проектов, фильтрует в dashboard |

---

## Acceptance criteria

- [ ] `project` field extracted in readMessage
- [ ] `generateMessageFile` accepts optional `project`
- [ ] CLI `send --project` works
- [ ] CLI `list --project` filters correctly
- [ ] CLI `reply` inherits project from target
- [ ] Server API accepts `?project=` query param
- [ ] Dashboard has project filter (dropdown in toolbar)
- [ ] Project badge on cards
- [ ] SessionStart hook shows project in preview
- [ ] Backward compatible: messages without project still work everywhere
- [ ] `project` column in CLI list table
- [ ] i18n keys for project-related UI
- [ ] vite build passes
- [ ] No personal data, no absolute paths

---

## Out of scope

- Project validation against known list (free-form slugs)
- Project-scoped archive dirs
- Project config file (.mailboxrc)
- Cross-project thread linking
- Spec update (local-claude-codex-mailbox-workflow.md)

---

## Rollback

Создать revert commit.

---

## Notes для Codex

1. **Backward compatibility**: главный приоритет. Existing messages без `project` ДОЛЖНЫ продолжать работать. Все фильтры "нет project = показать", если нет explicit filter.
2. **project = metadata, не structure**: не влияет на filename, archive path, thread slug. Только frontmatter + filter.
3. **Reply inherits project**: как thread — из target message. Не из CLI arg.
4. **Dynamic project list**: dashboard собирает unique projects из сообщений. Не hardcode.
5. **mailbox-status.mjs standalone**: по-прежнему без gray-matter. Добавить `project` extraction через regex.
6. **i18n**: новые ключи в оба языка (ru + en).


## Legacy Workflow Note (2026-04-21)

This file is preserved as a historical artifact from an earlier workflow revision.

It may mention legacy patterns such as `Claude planner / Codex executor`, user relay, `compact prompt`, or older handoff shapes.

Do not use it as the live operating template. Current contract: `docs/codex-system-prompt.md`, `AGENTS.md`, `workflow-role-distribution.md`, `workflow-instructions-claude.md`, and `workflow-instructions-codex.md`.
