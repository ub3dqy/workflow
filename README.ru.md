# Workflow — dual-agent development workflow

[English](./README.md) | [Русский](./README.ru.md)

[![CI](https://github.com/ub3dqy/workflow/actions/workflows/ci.yml/badge.svg)](https://github.com/ub3dqy/workflow/actions/workflows/ci.yml) [![Node](https://img.shields.io/badge/node-%3E%3D20.19-brightgreen)](./dashboard/package.json)

> Два AI-агента, один репозиторий. **Claude** планирует, **Codex** выполняет, **вы** решаете. Репа даёт им общий почтовый ящик, дашборд для наблюдения и свод правил, который держит их в рамках.

---

## 📬 Что это?

Рабочий процесс для координации **двух AI-ассистентов для кода** (Claude Code + OpenAI Codex CLI) через shared filesystem mailbox. Вместо копипасты контекста между терминалами, агенты пишут markdown-сообщения друг другу. Вы остаётесь в курсе через локальный дашборд, который показывает ожидающие треды.

**Кратко**:
- Claude пишет планы (`docs/codex-tasks/<slug>.md`)
- Codex читает план → выполняет → заполняет отчёт
- Вы проверяете diff → коммитите → пушите
- По пути mailbox ловит переписку (вопросы, уточнения), не засоряя git history

## 🎯 Зачем это?

- **Меньше налога на copy-paste** — агенты общаются async через файлы, не через ваш буфер обмена
- **Чёткие передачи** — каждая нетривиальная задача = план + planning-audit + отчёт (three-file pattern)
- **Вы всегда ворота** — агенты никогда не коммитят, не пушат, не принимают scope-решения в одиночку
- **Воспроизводимо** — markdown на диске лучше эфемерного чата; любой агент, подключаясь, читает свежий mailbox

## 🖼️ Превью дашборда

![Mailbox dashboard overview](./docs/assets/dashboard-overview.png)

*Локальный read-only дашборд с ожидающими сообщениями, сгруппированными по получателю. Есть фильтр по проекту, переключатель языка (RU/EN), светлая/тёмная тема.*

---

## ⚡ Быстрый старт

### Требования

- **Node.js 20.19+** (протестировано 20.19, 22.x, 24.x; 18.x технически работает, но покажет install warnings)
- **Windows** или **WSL2 Linux** (launchers Windows-only, CLI/дашборд cross-platform)
- **Git**

### Установка

```bash
git clone https://github.com/ub3dqy/workflow.git
cd workflow/dashboard
npm install
```

### Запуск дашборда

**Любая платформа**:
```bash
cd dashboard
npm run dev
# UI:  http://127.0.0.1:9119
# API: http://127.0.0.1:3003
```

**Windows one-click** (опционально):
```
start-workflow.cmd        # запускает дашборд, умный npm install с кешем
stop-workflow.cmd         # освобождает порты
start-workflow-hidden.vbs # скрывает консоль (для shortcut)
```

### Отправить сообщение (CLI)

```bash
# Из корня workflow repo:
node scripts/mailbox.mjs send \
  --from claude --to codex \
  --thread my-question \
  --body "Нужен clarifying detail по pre-flight step 3"

# Auto-detect проекта из basename(cwd); --project переопределяет
node scripts/mailbox.mjs list --bucket to-codex
node scripts/mailbox.mjs reply --to to-codex/<filename>.md --body "ответ"
node scripts/mailbox.mjs archive --path to-claude/<filename>.md --resolution answered
```

См. [`local-claude-codex-mailbox-workflow.md`](./local-claude-codex-mailbox-workflow.md) для полной спецификации протокола.

---

## 🏗️ Архитектура

```mermaid
flowchart LR
    U[👤 Пользователь]
    C[🤖 Claude<br/>планировщик]
    X[🤖 Codex<br/>исполнитель]
    M[(📬 Mailbox<br/>agent-mailbox/)]
    D[📋 Handoff<br/>docs/codex-tasks/]
    W[🖥️ Дашборд<br/>127.0.0.1:9119]

    U -->|scope + commit| C
    U -->|scope + commit| X
    C -->|3-file handoff| D
    D --> X
    C <-->|async Q&A| M
    X <-->|async Q&A| M
    M --> W
    W -.->|read-only view| U
```

**Роли** (non-negotiable):

| Кто | Делает | Не делает |
|-----|--------|-----------|
| **Claude** | Планирует, ревьюит, пишет докуменацию | Запускает production код, коммитит |
| **Codex** | Выполняет по плану, заполняет отчёт | Меняет scope, коммитит/пушит |
| **User** | Одобряет scope, коммитит, пушит | Пишет код (это делают агенты) |

**Два канала коммуникации сосуществуют**:

| Канал | Где | Зачем | Git-tracked? |
|-------|-----|-------|--------------|
| **Формальный handoff** | `docs/codex-tasks/` | Контракты: план + planning-audit + отчёт | Да (immutable история) |
| **Неформальный mailbox** | `agent-mailbox/` | Async Q&A, уточнения, status updates | Нет (scratchpad) |

Подробные правила:
- [`CLAUDE.md`](./CLAUDE.md) — конвенции проекта
- [`workflow-instructions-claude.md`](./workflow-instructions-claude.md) — роль планировщика
- [`workflow-instructions-codex.md`](./workflow-instructions-codex.md) — роль исполнителя
- [`workflow-role-distribution.md`](./workflow-role-distribution.md) — распределение ролей
- [`local-claude-codex-mailbox-workflow.md`](./local-claude-codex-mailbox-workflow.md) — спецификация mailbox-протокола

---

## 🔒 CI и безопасность

GitHub Actions (`.github/workflows/ci.yml`) запускаются на каждом push/PR:

- **`build`** — `npm ci && npx vite build` (Node 24)
- **`personal-data-check`** — regex-скан на случайные PII/hostname leaks

Агенты запускают аналогичный скан локально перед `git push` — ловит проблемы до того как они уйдут в публичную репу.

## 📄 Лицензия

Отдельного LICENSE файла нет; все права зарезервированы по умолчанию. Для licensing-вопросов свяжитесь с maintainer'ом.

## 🤝 Contributing

Issues и PRs приветствуются. Workflow ожидает:

1. Предложить scope maintainer'у (сначала открыть issue)
2. Следовать three-file handoff pattern для нетривиальных изменений (примеры в `docs/codex-tasks/`)
3. Personal data scan чистый перед push (CI проверит)
4. Один логический change на коммит

---

*Скриншот сделан 2026-04-17; UI может измениться.*
