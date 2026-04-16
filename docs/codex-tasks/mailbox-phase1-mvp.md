# Mailbox Phase 1 MVP — Execution Plan

> **Статус**: ready for execution
>
> **Задача**: развернуть инфраструктуру Phase 1 MVP mailbox workflow + read-only web UI dashboard с актуальными зависимостями.
>
> **Источник спецификации**: `local-claude-codex-mailbox-workflow.md` (корень проекта)

---

## Иерархия источников правды

1. **Офдока** (URL из Doc verification) — главная правда
2. **Реальное состояние файлов** на диске — вторая правда
3. **Этот план** — третья, может содержать ошибки

Если план и дока расходятся — верь доке. Запиши расхождение в Discrepancies и остановись.

---

## Doc verification table

| # | URL | Что проверить |
|---|-----|---------------|
| D1 | https://docs.npmjs.com/cli/v11/commands/npm-init | `npm init` синтаксис и defaults |
| D2 | https://vite.dev/guide/ | Vite 8 scaffolding: `npm create vite@latest` |
| D3 | https://react.dev/learn/start-a-new-project | React 19 project setup |
| D4 | https://www.npmjs.com/package/gray-matter | gray-matter API: `matter(string)` returns `{data, content}` |
| D5 | https://marked.js.org/ | marked API: `marked.parse(markdown)` |
| D6 | https://git-scm.com/docs/gitignore | .gitignore pattern syntax |

---

## Scope overview

### Block A — Project infrastructure (git + directories)

Инициализация git, создание структуры каталогов, .gitignore. Чистая файловая операция, без зависимостей.

### Block B — Web UI dashboard scaffold (read-only)

Минимальный Vite + React SPA, который:
- читает markdown файлы из `agent-mailbox/` через local API
- рендерит карточки по колонкам (To Claude / To Codex / Archive)
- показывает empty state при пустом mailbox
- localhost-only, порт 9119

### Block C — Dependency pinning

Все npm-пакеты фиксируются на latest stable. Проверка актуальности перед `npm install`.

---

## Whitelist файлов

### Создать (новые файлы/директории)

| # | Путь | Тип | Описание |
|---|------|-----|----------|
| W1 | `.gitignore` | file | gitignore с agent-mailbox/ и node_modules/ |
| W2 | `agent-mailbox/to-claude/.gitkeep` | file | placeholder (gitignored, но создаётся для структуры) |
| W3 | `agent-mailbox/to-codex/.gitkeep` | file | placeholder |
| W4 | `agent-mailbox/archive/.gitkeep` | file | placeholder |
| W5 | `CLAUDE.md` | file | project-level conventions |
| W6 | `package.json` | file | npm project с dependencies |
| W7 | `dashboard/` | dir | Vite + React app |
| W8 | `dashboard/index.html` | file | Vite entry point |
| W9 | `dashboard/vite.config.js` | file | Vite config: port 9119, open false |
| W10 | `dashboard/src/main.jsx` | file | React entry |
| W11 | `dashboard/src/App.jsx` | file | Main dashboard component |
| W12 | `dashboard/src/api.js` | file | Fetch mailbox data from local server |
| W13 | `dashboard/server.js` | file | Express local server: read agent-mailbox/, serve JSON |
| W14 | `dashboard/package.json` | file | Dashboard-specific deps |

### Не трогать

Все существующие `.md` файлы в корне проекта. `docs/codex-tasks/` (кроме report). `workflow-*` файлы — read-only reference.

---

## Changes

### Change 1: git init

```bash
cd E:/Project/workflow
git init
```

**Сейчас**: не git-репозиторий.
**Должно стать**: инициализированный git repo с начальным коммитом не требуется (коммит делает пользователь).

`[EMPIRICAL-git rev-parse]` — проверено: `fatal: not a git repository`.

### Change 2: .gitignore

Создать `.gitignore` в корне:

```gitignore
# Mailbox — local working memory, not project artifact
agent-mailbox/

# Dependencies
node_modules/
dashboard/node_modules/

# Build output
dashboard/dist/

# OS
.DS_Store
Thumbs.db
```

`[OFFICIAL-D6]` — gitignore pattern syntax.
`[PROJECT]` — agent-mailbox/ gitignored по spec (local-claude-codex-mailbox-workflow.md:112-119).

### Change 3: agent-mailbox directory structure

```bash
mkdir -p agent-mailbox/to-claude
mkdir -p agent-mailbox/to-codex
mkdir -p agent-mailbox/archive
```

Создать пустые `.gitkeep` в каждой поддиректории (они gitignored, но нужны чтобы структура существовала после checkout/clone через отдельный bootstrap).

`[PROJECT]` — layout из spec (local-claude-codex-mailbox-workflow.md:92-97).

### Change 4: CLAUDE.md

Создать `CLAUDE.md` в корне проекта с минимальными conventions:

```markdown
# Workflow Project

## Overview

Документация и инструментарий для dual-agent workflow (Claude + Codex).

## Key files

- `workflow-instructions-claude.md` — инструкция для Claude (planner role)
- `workflow-instructions-codex.md` — инструкция для Codex (executor role)
- `workflow-role-distribution.md` — распределение ролей
- `local-claude-codex-mailbox-workflow.md` — спецификация mailbox protocol

## Mailbox protocol

- `agent-mailbox/` — gitignored async dialogue between agents
- `docs/codex-tasks/` — formal structured handoff contracts (git-tracked)
- Mailbox is NOT for task assignment. Code changes go through docs/codex-tasks/ handoff.
- See `local-claude-codex-mailbox-workflow.md` for full protocol spec.

## Dashboard

- `dashboard/` — local read-only web UI for mailbox
- Start: `cd dashboard && npm run dev` (localhost:9119)
- Production build not needed — this is a local-only tool.
```

`[PROJECT]` — conventions из spec и workflow docs.

### Change 5: dashboard/package.json

```json
{
  "name": "mailbox-dashboard",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "concurrently \"node server.js\" \"vite --port 9119\"",
    "server": "node server.js"
  },
  "dependencies": {
    "express": "^5.2.1",
    "gray-matter": "^4.0.3",
    "marked": "^18.0.0",
    "concurrently": "^9.1.2"
  },
  "devDependencies": {
    "vite": "^8.0.8",
    "@vitejs/plugin-react": "^4.5.3",
    "react": "^19.2.5",
    "react-dom": "^19.2.5"
  }
}
```

`[PROJECT]` — версии проверены через `npm view` (2026-04-16):
- vite 8.0.8, react 19.2.5, gray-matter 4.0.3, marked 18.0.0, express 5.2.1

**ВАЖНО**: перед `npm install` Codex обязан проверить актуальность через `npm view <pkg> version` и обновить если вышла новая версия.

### Change 6: dashboard/server.js

Express server (localhost:3001) с двумя endpoints:

```
GET /api/messages — возвращает все сообщения из agent-mailbox/
GET /api/messages/:dir — сообщения из конкретной директории (to-claude, to-codex, archive)
```

Каждое сообщение парсится через `gray-matter`:
- `data` (frontmatter) → JSON fields
- `content` (body) → markdown string
- `filename` → добавляется к объекту

Server слушает **только** `127.0.0.1:3001`.

`[OFFICIAL-D4]` — gray-matter API.
`[PROJECT]` — localhost-only из spec (local-claude-codex-mailbox-workflow.md:242-247).

### Change 7: dashboard/src/App.jsx

React SPA с тремя колонками:

- **To Claude** — карточки из `agent-mailbox/to-claude/`
- **To Codex** — карточки из `agent-mailbox/to-codex/`
- **Archive** — карточки из `agent-mailbox/archive/` (рекурсивно по thread dirs)

Каждая карточка показывает:
- `from`, `to`, `thread`, `status`, `created`
- `reply_to` если есть
- Ссылки на `related_files`

**Empty state**: если mailbox пустой, показать placeholder с инструкцией как отправить первое сообщение.

**Polling**: `setInterval` каждые 3 секунды на `GET /api/messages`. Manual refresh кнопка как fallback.

Стилизация: минимальный CSS, без фреймворков. Три колонки через CSS grid. Карточки — простые `<div>` с border.

`[PROJECT]` — UI spec из local-claude-codex-mailbox-workflow.md:193-247.

### Change 8: dashboard/vite.config.js

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 9119,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:3001'
    }
  }
});
```

`[OFFICIAL-D2]` — Vite config reference.
`[PROJECT]` — порт 9119 из spec.

---

## Verification phases

### Phase 1 — Codex self-check

| # | Test | Command | Expected |
|---|------|---------|----------|
| V1 | git repo initialized | `git -C "E:/Project/workflow" rev-parse --is-inside-work-tree` | `true` |
| V2 | .gitignore exists and correct | `cat .gitignore \| grep agent-mailbox` | `agent-mailbox/` |
| V3 | mailbox dirs exist | `ls -d agent-mailbox/to-claude agent-mailbox/to-codex agent-mailbox/archive` | all three listed |
| V4 | CLAUDE.md exists | `head -1 CLAUDE.md` | `# Workflow Project` |
| V5 | dashboard deps installed | `ls dashboard/node_modules/.package-lock.json` | file exists |
| V6 | server starts | `cd dashboard && timeout 5 node server.js` | `Server listening on 127.0.0.1:3001` |
| V7 | API returns empty array | `curl -s http://127.0.0.1:3001/api/messages` | `{"toClaude":[],"toCodex":[],"archive":[]}` or similar |
| V8 | vite builds without errors | `cd dashboard && npx vite build` | exit code 0 |
| V9 | gitignore works | `git status --short \| grep agent-mailbox` | no output (ignored) |
| V10 | no personal data | `grep -ri "<personal-data-patterns>" . --include="*.js" --include="*.jsx" --include="*.json" --include="*.md" -l` | no matches in new files |

### Phase 2 — `[awaits user]`

| # | Test | Description |
|---|------|-------------|
| V11 | Live UI test | Пользователь запускает `cd dashboard && npm run dev`, открывает `http://localhost:9119`, видит empty state |
| V12 | Message round-trip | Пользователь создаёт тестовое сообщение в `agent-mailbox/to-codex/`, UI показывает карточку через ≤5 сек |
| V13 | Archive visibility | Пользователь перемещает сообщение в `agent-mailbox/archive/test-thread/`, UI обновляет колонку Archive |

### Phase 3 — `[awaits 3-day]`

| # | Test | Description |
|---|------|-------------|
| V14 | Real mailbox usage | Claude и Codex используют mailbox в реальной задаче, файлы создаются/архивируются по protocol |
| V15 | UI stability | Dashboard работает без перезапуска ≥8 часов |

---

## Acceptance criteria

- [ ] `git init` выполнен, `.git/` существует
- [ ] `.gitignore` содержит `agent-mailbox/` и `node_modules/`
- [ ] `agent-mailbox/{to-claude,to-codex,archive}/` существуют
- [ ] `CLAUDE.md` создан с project conventions
- [ ] `dashboard/` содержит рабочий Vite + React + Express app
- [ ] `npm install` в dashboard/ завершается без ошибок
- [ ] Все зависимости на актуальных версиях (проверено через `npm view`)
- [ ] Server отдаёт JSON с сообщениями из mailbox
- [ ] UI показывает три колонки и empty state
- [ ] Polling работает (новый файл появляется в UI через ≤5 сек)
- [ ] Нет personal data в новых файлах
- [ ] Нет правок существующих `.md` файлов

---

## Out of scope

- Reply / archive actions в UI (это Phase 2 UI rollout, не MVP)
- Thread view / thread navigation
- Hooks (SessionStart, UserPromptSubmit) — Phase 2 protocol
- Helper scripts (`scripts/mailbox.py`) — Phase 3 protocol
- Semantic badges (`needs user decision`, `formal handoff required`)
- File watchers (chokidar) — polling достаточно для MVP
- Authentication / auth layer
- Production build / deployment
- Commit / push (делает пользователь)

---

## Rollback

```bash
cd E:/Project/workflow
rm -rf dashboard/ agent-mailbox/ CLAUDE.md .gitignore
# git repo оставляем — пользователь решает
```

---

## Discrepancy handling

Если реальность ≠ план:
1. **Остановись** — не продолжай вслепую
2. **Запиши** расхождение в секцию Discrepancies отчёта
3. **Если мелочь** (версия пакета чуть другая) — запиши и продолжай с реальной версией
4. **Если принципиально** (API изменился, файл уже существует с другим содержимым) — стоп, ждать decision

---

## Notes для Codex

1. **WSL environment**: проект лежит на Windows filesystem (`E:/Project/workflow` = `/mnt/e/Project/workflow` из WSL). Все пути в коде dashboard должны быть relative, не абсолютные.
2. **Personal data**: не использовать реальные имена пользователей, hostname, email в коде и примерах. Sanitize.
3. **CRLF**: git на Windows может автоконвертировать line endings. `dashboard/` файлы должны быть LF (стандарт для JS/JSX).
4. **Порядок**: Block A (git + dirs) → Block B (dashboard scaffold) → Block C (npm install + verify) → Phase 1 tests.
5. **npm install**: выполнять из dashboard/, не из корня проекта.
6. **gray-matter на frontend**: gray-matter — Node.js пакет, не работает в браузере. Парсинг frontmatter делает **server** (Express), а не client (React). Client получает уже распарсенный JSON.
7. **Mailbox boundary**: mailbox ≠ task assignment. Если сообщение подразумевает изменение кода — это handoff через `docs/codex-tasks/`, не mailbox. Зафиксировать в CLAUDE.md.
8. **agent-mailbox/ — gitignored**: директории создаются локально. Они не попадут в git. Для воспроизведения после clone нужен bootstrap (mkdir), можно добавить `npm run setup` script.
