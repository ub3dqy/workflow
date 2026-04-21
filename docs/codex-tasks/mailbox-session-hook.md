# Mailbox SessionStart Hook — Execution Plan

> **Статус**: ready for execution
>
> **Задача**: добавить SessionStart hook, который при старте сессии в проекте workflow показывает summary pending messages из agent-mailbox/.
>
> **Предыдущие фазы**: Phase 1 MVP ✅, Phase 2 Safe Actions ✅
>
> **Спецификация**: `local-claude-codex-mailbox-workflow.md` — секция "Phase 2 — hook-assisted visibility" (строки 656-669)

---

## Иерархия источников правды

1. **Офдока** (Claude Code hooks) — главная правда
2. **Спецификация** (`local-claude-codex-mailbox-workflow.md`) — protocol rules
3. **Существующий рабочий hook** (`E:/Project/memory claude/memory claude/hooks/`) — reference implementation
4. **Этот план** — может содержать ошибки

---

## Doc verification table

| # | URL | Что проверить |
|---|-----|---------------|
| D1 | https://docs.anthropic.com/en/docs/claude-code/hooks | SessionStart hook contract: stdin format, stdout → context injection, timeout, matcher |
| D2 | https://docs.anthropic.com/en/docs/claude-code/hooks#hook-configuration | settings.json hook schema: matcher, type, command, timeout |

---

## Scope overview

### Block A — Hook script

Node.js скрипт `scripts/mailbox-status.mjs` который:
1. Считает `.md` файлы в `agent-mailbox/to-claude/` и `agent-mailbox/to-codex/`
2. Для первых 1-2 pending messages показывает краткий preview (thread, from, created)
3. Выводит summary в stdout для injection в контекст сессии

### Block B — Settings configuration

Добавить hook в project-local settings: `E:/Project/workflow/.claude/settings.local.json` (НЕ в глобальный `settings.json`).

---

## Whitelist файлов

### Создать (новые файлы)

| # | Путь | Описание |
|---|------|----------|
| W1 | `scripts/mailbox-status.mjs` | SessionStart hook script |
| W2 | `.claude/settings.local.json` | Project-local hook configuration |

### Не трогать

- `dashboard/*` — не связано с этой задачей
- Глобальный `~/.claude/settings.json` — НЕ модифицировать
- Все `.md` файлы (кроме report)
- `agent-mailbox/` — только чтение

---

## Changes

### Change 1: scripts/mailbox-status.mjs

Node.js ESM скрипт. Не Python, не bash — чтобы не тянуть дополнительные зависимости (Node уже есть, dashboard тоже на Node).

**Нет npm зависимостей.** Только встроенные `node:fs`, `node:path`. Frontmatter парсится простым regex (не gray-matter) — hook должен быть максимально быстрым и без зависимостей.

Логика:

```
1. Определить mailboxRoot: path.resolve(process.cwd(), "agent-mailbox")
   - НЕ hardcoded path. Используем cwd из stdin или process.cwd().
   
2. Проверить: существует ли agent-mailbox/?
   - Если нет — silent exit (code 0, пустой stdout). Не ломать сессию.

3. Прочитать agent-mailbox/to-claude/ — список .md файлов
4. Прочитать agent-mailbox/to-codex/ — список .md файлов

5. Если оба пустые — silent exit. Не шуметь.

6. Если есть pending messages — вывести в stdout:

## Mailbox Status

- Pending for Claude: N
- Pending for Codex: M

### Latest (max 2):

- [thread] from <from>, <created> — <first line of body>
- [thread] from <from>, <created> — <first line of body>
```

**Важно из спецификации:**
- Только `SessionStart`, не `UserPromptSubmit` `[PROJECT-spec:667-668]`
- Preview максимум для 1-2 сообщений `[PROJECT-spec:663]`
- Не шуметь если mailbox пустой

**Frontmatter parsing** — простой regex без gray-matter:

```js
const match = raw.match(/^---\n([\s\S]*?)\n---/);
```

Извлечь `thread`, `from`, `created` через `line.match(/^(\w+):\s*(.+)/)`.

**Stdin**: Claude Code hooks получают JSON на stdin с полем `cwd`. Скрипт должен прочитать stdin, распарсить JSON, использовать `cwd` для определения пути к mailbox. Если stdin пуст или невалидный JSON — fallback на `process.cwd()`.

`[OFFICIAL-D1]` — hook stdin contract.

**Timeout**: 3 секунды. Hook только читает файлы — этого достаточно.

### Change 2: .claude/settings.local.json

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node scripts/mailbox-status.mjs",
            "timeout": 3
          }
        ]
      }
    ]
  }
}
```

`[OFFICIAL-D2]` — settings.json hook schema.

Файл `.claude/settings.local.json` — project-local, не глобальный. Это значит hook работает **только** когда Claude Code открыт в `E:/Project/workflow/`.

**Не трогать глобальный settings.json** — там уже есть hooks для memory-claude. Project-local settings мержатся с глобальными.

---

## Verification phases

### Phase 1 — Codex self-check

| # | Test | Command / Action | Expected |
|---|------|-----------------|----------|
| V1 | Script runs without messages | `echo '{"cwd":"/mnt/e/project/workflow"}' \| node scripts/mailbox-status.mjs` | empty stdout, exit 0 |
| V2 | Script runs with message | Создать тестовое сообщение в `agent-mailbox/to-codex/`, запустить скрипт | stdout содержит `Pending for Codex: 1` |
| V3 | Preview shows | Тот же тест | stdout содержит thread slug и from |
| V4 | Script handles missing mailbox | `echo '{"cwd":"/tmp"}' \| node scripts/mailbox-status.mjs` | empty stdout, exit 0 |
| V5 | Script handles invalid stdin | `echo 'garbage' \| node scripts/mailbox-status.mjs` | empty stdout or fallback to cwd, exit 0 |
| V6 | Settings file valid JSON | `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.local.json','utf8'))"` | no error |
| V7 | Personal data scan | `grep -riE "<personal-data-patterns>" scripts/ .claude/ --include="*.mjs" --include="*.json" -l` | no matches |
| V8 | No absolute paths | `grep -rE "/mnt/e\|E:\\\\\|C:\\\\Users\|/home/" scripts/ --include="*.mjs" -l` | no matches |

### Phase 2 — `[awaits user]`

| # | Test | Description |
|---|------|-------------|
| V9 | Live hook test | Пользователь открывает новую Claude Code сессию в workflow проекте, видит mailbox summary в начале |
| V10 | Silent when empty | Mailbox пуст — никакого лишнего output при старте |

---

## Acceptance criteria

- [ ] `scripts/mailbox-status.mjs` создан, работает без npm-зависимостей
- [ ] Скрипт читает stdin JSON, использует `cwd` для определения mailbox path
- [ ] При пустом mailbox — silent exit (пустой stdout, exit 0)
- [ ] При наличии pending messages — выводит count + preview (max 2)
- [ ] `.claude/settings.local.json` создан с SessionStart hook
- [ ] Hook timeout = 3 секунды
- [ ] Глобальный `settings.json` не модифицирован
- [ ] Нет personal data, нет абсолютных путей
- [ ] Нет npm-зависимостей (только node: built-ins)

---

## Out of scope

- `UserPromptSubmit` hook (spec запрещает для mailbox)
- Hooks для Codex CLI (отдельная конфигурация)
- Archive stats в summary
- Thread grouping
- Helper scripts (Phase 3)
- Hook для `Stop` event

---

## Rollback

```bash
rm -rf E:/Project/workflow/scripts E:/Project/workflow/.claude
```

---

## Discrepancy handling

Если реальность ≠ план:
1. **Стоп**, запиши
2. **Мелочь** (формат output чуть другой) — продолжай
3. **Принципиально** (stdin contract другой, settings.local.json не мержится) — стоп, ждать

---

## Notes для Codex

1. **НЕ модифицировать глобальный settings.json** в `~/.claude/`. Только project-local `.claude/settings.local.json`.
2. **WSL path**: Codex работает из WSL, cwd будет `/mnt/e/project/workflow`. Скрипт должен корректно работать и с WSL paths, и с Windows paths.
3. **No npm dependencies**: только `node:fs`, `node:path`. gray-matter НЕ импортировать — hook должен быть standalone.
4. **Тестовые сообщения**: создать для теста, удалить после smokes.
5. **Encoding**: файлы в agent-mailbox могут иметь CRLF (Windows) или LF (WSL). Regex должен обрабатывать оба.
6. **Exit code**: всегда 0. Ошибки — silent (stderr допустим, но не stdout). Hook не должен ломать сессию.


## Legacy Workflow Note (2026-04-21)

This file is preserved as a historical artifact from an earlier workflow revision.

It may mention legacy patterns such as `Claude planner / Codex executor`, user relay, `compact prompt`, or older handoff shapes.

Do not use it as the live operating template. Current contract: `docs/codex-system-prompt.md`, `AGENTS.md`, `workflow-role-distribution.md`, `workflow-instructions-claude.md`, and `workflow-instructions-codex.md`.
