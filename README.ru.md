# Workflow — sequential Claude↔Codex workflow

[English](./README.md) | [Русский](./README.ru.md)

[![CI](https://github.com/ub3dqy/workflow/actions/workflows/ci.yml/badge.svg)](https://github.com/ub3dqy/workflow/actions/workflows/ci.yml) [![Node](https://img.shields.io/badge/node-%3E%3D20.19-brightgreen)](./dashboard/package.json)

> Два AI-агента, один репозиторий. **Claude** планирует и исполняет, **Codex** синтезирует, ревьюит и верифицирует, **вы** принимаете решения. Репозиторий даёт им mailbox-транспорт, tracked artifacts и локальный дашборд для наблюдения за состоянием почты.

---

## Что Это

Это репозиторий с документацией и инструментарием для sequential two-agent workflow между **Claude Code** и **OpenAI Codex CLI**.

Текущий контракт:

- одна и та же исходная задача даётся обоим агентам
- оба агента независимо делают initial result
- Codex синтезирует техническое задание на основе двух результатов
- Claude строит tracked planning/execution package и начинает execution только после clean agreement
- Codex делает final verification и пишет Work Verification Report
- Claude↔Codex координируются через `agent-mailbox/`

Канонический источник workflow: [docs/codex-system-prompt.md](./docs/codex-system-prompt.md).

## Зачем Это Нужно

- **Меньше relay-friction**: агентская координация идёт через файлы, а не через пересказ
- **Evidence-first review**: Codex — реальный review/verification gate, а не пассивный получатель задач
- **Tracked artifacts**: live задачи оставляют воспроизводимый пакет артефактов в `docs/codex-tasks/`
- **Пользователь остаётся decision gate**: commit, push, merge и design choices всё ещё требуют явного user go

## Tracked Artifacts

Для live задачи ожидаются:

- `docs/codex-tasks/<slug>.md`
- `docs/codex-tasks/<slug>-planning-audit.md`
- `docs/codex-tasks/<slug>-report.md`
- `docs/codex-tasks/<slug>-work-verification.md`

Важно: большинство уже существующих `docs/codex-tasks/*.md` — это historical archive из более ранних ревизий workflow. Они полезны как evidence, но не являются текущим шаблоном, если это не указано явно.

## Превью Дашборда

![Mailbox dashboard overview](./docs/assets/dashboard-overview.png)

*Локальный дашборд с ожидающими сообщениями, сгруппированными по получателю, с project filter, переключением RU/EN, светлой/тёмной темой и звуковым уведомлением. Маркер непрочитанного опирается на сырое поле frontmatter `received_at`, а не на derived display timestamp из library reader'а.*

---

## Быстрый Старт

### Требования

- **Node.js 20.19+**
- **Windows** или **WSL2 Linux**
- **Git**

### Установка

```bash
git clone https://github.com/ub3dqy/workflow.git
cd workflow/dashboard
npm install
```

### Запуск дашборда

```bash
cd dashboard
npm run dev
# UI:  http://127.0.0.1:9119
# API: http://127.0.0.1:3003
```

Windows launchers:

```text
start-workflow.cmd
start-workflow-hidden.vbs
start-workflow-codex.cmd
start-workflow-codex-hidden.vbs
clauder.cmd
install-clauder.cmd
start-claude-mailbox.cmd
stop-workflow.cmd
```

Повседневные команды после установки:

```text
Dashboard: start-workflow.cmd
Codex:     codexr
Claude:    clauder
```

### Запуск Codex Remote Сессий

Для Codex mailbox automation запускайте проектные сессии через zero-touch remote launcher, а не через сырой `codex --remote`:

```bash
codexr
```

`codexr` — поддерживаемый operator entry point. Launcher проверяет dashboard backend и Codex app-server, передаёт `-C "$PWD"` и отправляет короткий bootstrap prompt, чтобы у remote thread был initial rollout до первой mailbox-доставки.

Сырой `codex --remote ws://127.0.0.1:4501` не является поддерживаемым mailbox entry point: он может создать loaded thread без rollout, и доставка останется заблокированной до ручного первого prompt.

Dashboard может стартовать и health-check'ать Codex transport, но не владеет живыми remote-сессиями. Обычные Stop/Restart transport calls fail-closed, поэтому открытые `codex --remote` окна остаются подключёнными. Отдельный `Force stop` — emergency-only действие с typed confirmation.

Если `codexr` не установлен в `PATH`, запускайте wrapper напрямую:

```bash
node scripts/codex-remote-project.mjs
```

### Запуск Claude С Mailbox Wake-Up

Claude Code v2.1.80+ может получать push-события почты через project MCP channel из [`.mcp.json`](./.mcp.json):

Если команда ещё не установлена, один раз запустите:

```text
install-clauder.cmd
```

Установщик добавляет `clauder` и service-команды mailbox (`workflow-mailbox*`) для Windows shell и Git Bash (`C:\Users\<you>\bin`). Если текущий Git Bash уже был открыт и всё ещё пишет `command not found`, выполните `hash -r` или откройте новый терминал.

После этого обычный запуск:

```bash
clauder
```

Это Claude-аналог `codexr`: одна команда открывает Claude уже с mailbox wake-up. Если `clauder` ещё не добавлен в `PATH`, из корня repo можно запустить:

```text
clauder.cmd
```

Launcher стартует Claude из текущего project directory с channel `server:workflow-mailbox` и permission mode `auto`:

```powershell
claude --dangerously-load-development-channels server:workflow-mailbox --permission-mode auto
```

При первом запуске Claude попросит подтвердить, что это локальный development channel. После подтверждения `workflow-mailbox-channel` стартует как MCP server `workflow-mailbox`, read-only опрашивает центральный `agent-mailbox/to-claude/` и пушит pending-сообщения текущего project slug в живую Claude-сессию через `notifications/claude/channel`. Сам channel не вызывает `mailbox.mjs list` и не пишет `received_at`; Claude по-прежнему использует обычный mailbox CLI, когда реально забирает письмо в работу.

Для другого проекта сначала добавьте минимальный config из workflow repo:

```bash
node /path/to/workflow/scripts/bootstrap-workflow.mjs --target /path/to/other-project --project other-project --write
```

После этого запускайте `clauder` из каталога этого проекта.

Для доверенной локальной сессии, где вообще не нужны permission prompts, есть явный bypass-режим:

```bash
clauder --mode bypass
```

Обычный recommended mode — `auto`; `bypass` используйте только в этом trusted local workflow repo. Старый вариант с длинным списком `--allowedTools` не является zero-touch path: env-prefixed Bash-команды могут всё равно запрашивать подтверждение.

Claude Code v2.1.105+ также поддерживает старый plugin monitor из этого repo:

```powershell
claude --plugin-dir <repo-root>\claude-workflow-plugin
```

Monitor тоже read-only и отправляет короткий сигнал `WORKFLOW_MAILBOX_PENDING`. Он полезен как диагностический notification path, но в idle CLI-сессии monitor output доставляется Claude во время активного или следующего пользовательского turn; это не гарантированный автономный wake-up. Для push в уже открытую session используйте `workflow-mailbox` channel.

### Runtime Doctor

Если состояние dashboard или Codex transport непонятно, запускайте read-only doctor:

```bash
node scripts/workflow-doctor.mjs
```

Он проверяет Node, dashboard dependencies, Codex launchers, runtime JSON files, mailbox session binding и loopback health для `3003`, `9119` и `4501`. Флаг `--json` даёт machine-readable output, `--skip-network` оставляет только static checks, а `--verbose` показывает полные локальные пути.

### Agent-side mailbox CLI

Эти команды предназначены для **agent session с уже привязанным project**. На agent-path CLI обязательны `--project` и корректный bound session.

```bash
node scripts/mailbox.mjs send \
  --from claude \
  --to codex \
  --thread my-question \
  --project workflow \
  --body "Нужно уточнение по verification step 3"

node scripts/mailbox.mjs list --bucket to-codex --project workflow

node scripts/mailbox.mjs reply \
  --from codex \
  --project workflow \
  --to to-codex/<filename>.md \
  --body "Ответ"

node scripts/mailbox.mjs archive \
  --path to-claude/<filename>.md \
  --project workflow \
  --resolution no-reply-needed
```

Полный протокол: [local-claude-codex-mailbox-workflow.md](./local-claude-codex-mailbox-workflow.md).

---

## Архитектура

```mermaid
flowchart LR
    U[Пользователь]
    C[Claude<br/>planning + execution]
    X[Codex<br/>synthesis + review + verification]
    M[(Mailbox<br/>agent-mailbox/)]
    D[(Tracked Artifacts<br/>docs/codex-tasks/)]
    W[Dashboard<br/>127.0.0.1:9119]

    U -->|одна и та же исходная задача| C
    U -->|одна и та же исходная задача| X
    C -->|initial result / refs на package| M
    X -->|TZ / remarks / verdict| M
    C -->|plan + audit + report| D
    X -->|work verification report| D
    M --> W
```

## Роли

| Роль | Ответственность | Чего делать нельзя |
|---|---|---|
| **Claude** | Независимый initial result, построение tracked package, execution, git actions по явной команде user | Начинать execution до Codex agreement, bypass mailbox, fabricate evidence |
| **Codex** | Независимый initial result, synthesis, plan review, final verification, Work Verification Report | Исполнять implementation, commit/push, approve без проверки |
| **User** | Исходная задача, решения, git authorization | Быть обязательным транспортом между агентами |

## Актуальные Документы

- [AGENTS.md](./AGENTS.md) — краткое repo-level summary
- [CLAUDE.md](./CLAUDE.md) — конвенции проекта
- [workflow-role-distribution.md](./workflow-role-distribution.md) — durable role split
- [workflow-instructions-claude.md](./workflow-instructions-claude.md) — guide для Claude
- [workflow-instructions-codex.md](./workflow-instructions-codex.md) — guide для Codex
- [local-claude-codex-mailbox-workflow.md](./local-claude-codex-mailbox-workflow.md) — mailbox protocol
- [docs/mailbox-agent-onboarding.md](./docs/mailbox-agent-onboarding.md) — mailbox rules и запуск Codex remote
- [docs/bootstrap-kit.md](./docs/bootstrap-kit.md) — dry-run bootstrap checks и минимальная config-запись для другого repo
- [docs/codex-tasks/external-coordinator-vnext/brief.md](./docs/codex-tasks/external-coordinator-vnext/brief.md) — design-only backlog для coordinator

## CI И Безопасность

GitHub Actions запускает:

- `build` — dashboard `npm ci`, затем `npx vite build`
- `test` — dashboard `npm ci`, затем `node --test test/*.test.mjs`
- `workflow doctor` не делает network probes в CI, но `test/workflow-doctor.test.mjs` проверяет его JSON/static mode
- `personal-data-check` — regex-скан на PII и hostname leaks

Перед любым push прогоняйте тот же personal-data scan локально.

Local-only runtime state намеренно исключён из commit'ов:

- `agent-mailbox/` и `mailbox-runtime/` — live mailbox и supervisor state
- `.codex/sessions/` — per-session state Codex
- `.playwright-mcp/` — локальные Playwright MCP traces

## Contribution

1. Сначала согласуйте scope.
2. Следуйте текущему контракту из `docs/codex-system-prompt.md` и workflow docs.
3. Считайте старые `docs/codex-tasks/*.md` archival-материалом, если не указано иное.
4. Держите один логический change на один commit.

## Лицензия

[MIT](./LICENSE) © 2026 UB3DQY.
