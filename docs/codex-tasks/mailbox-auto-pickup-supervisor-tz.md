# ТЗ — автоматический подхват агентской почты через supervisor + lightweight hooks

## Контекст

Текущий mailbox workflow уже работает, но в режиме нескольких параллельных проектов остаётся ручной bottleneck:

- агентам нужно явно говорить `проверь почту`;
- пользователь держит в голове, в каком проекте у какого агента есть живые сессии;
- при 4-5 одновременных проектах легко потерять pending message или забыть, кому оно адресовано.

Нужен следующий шаг автоматизации, но **без** превращения mailbox в chat-server, без `UserPromptSubmit` noise и без auto-execution из UI.

## Цель

Сделать так, чтобы:

- входящие mailbox messages не терялись между проектами;
- живые сессии Claude/Codex сами узнавали, что у них появилось новое письмо;
- агент получал мягкий trigger `check mail` в безопасной lifecycle-точке;
- пользователь видел общую картину по всем проектам в одном месте.

## Что именно считается успехом

1. Пользователь может параллельно вести несколько проектов.
2. Если письмо приходит агенту по конкретному `project`, система понимает, есть ли у этого агента активная сессия по этому проекту.
3. Если активная сессия есть, агент получает **delivery signal** и на ближайшем безопасном lifecycle event подхватывает письмо.
4. Если активной сессии нет, письмо остаётся pending и видно в общем dashboard / supervisor state.
5. Mailbox protocol остаётся source of truth; runtime-оркестрация хранится отдельно.

## Жёсткие ограничения

### Нельзя

- использовать `UserPromptSubmit` для mailbox automation;
- автозапускать агентов из dashboard или supervisor;
- выполнять письма без живой сессии агента;
- превращать mailbox в mutable database;
- менять `scope`, `whitelist`, `design decisions` через mailbox;
- обходить `Discrepancy -> stop -> wait`.

### Обязательно

- mailbox files остаются protocol/source of truth;
- runtime-state живёт отдельно и gitignored;
- hooks остаются лёгкими и быстрыми;
- polling предпочтительнее watchers на `/mnt/e/...`;
- graceful degradation: если supervisor down, агентская сессия не должна ломаться.

## Основания из уже принятых решений

- `UserPromptSubmit` для mailbox уже исключён из-за noise-pattern.
- На `/mnt/e/...` polling надёжнее, чем `fs.watch`.
- Stop hooks должны быть ultra-light; тяжёлую работу нельзя тащить внутрь hook execution path.
- Mailbox не заменяет formal handoff и не должен становиться execution channel.

## Предлагаемая архитектура

### 1. Central supervisor

Один центральный процесс в `workflow` repo:

- polling `agent-mailbox/` каждые `2-5s`;
- индексирует pending messages по:
  - `to`
  - `project`
  - `thread`
  - `created`
- знает runtime-state активных agent sessions;
- вычисляет pending deliveries;
- пишет компактный runtime-state для hooks и dashboard.

### 2. Runtime-state отдельно от mailbox

Нужен отдельный gitignored runtime каталог, например:

```text
mailbox-runtime/
  sessions.json
  deliveries.json
  leases.json
  supervisor-health.json
```

Где:

- `sessions.json` — живые agent sessions (`agent`, `project`, `session_id`, `last_seen`, `cwd`, `platform`)
- `deliveries.json` — какие pending messages ещё не были сигнализированы живой сессии
- `leases.json` — защита от двойного подхвата, если у одного агента несколько окон
- `supervisor-health.json` — heartbeat/diagnostics

Важно:

- mailbox files не трогаются ради runtime semantics;
- runtime-state можно потерять без потери protocol truth;
- при crash supervisor state восстанавливается из mailbox + session heartbeats.

### 3. Session registry

Каждая живая сессия агента должна регистрироваться в runtime-state:

- `SessionStart` → create/update session record
- `Stop` → heartbeat + short delivery check
- при необходимости `CwdChanged`/equivalent → refresh project binding

Session record минимально содержит:

- `session_id`
- `agent` (`claude` / `codex`)
- `project`
- `cwd`
- `last_seen`
- `transport` (`claude-hooks` / `codex-hooks`)

Сессия считается активной, если heartbeat свежий, например `last_seen <= 60s`.

### 4. Delivery model

Supervisor не исполняет письмо. Он только решает:

- есть ли pending mailbox message;
- есть ли подходящая active session;
- был ли уже выдан delivery signal;
- есть ли active lease на это письмо.

Если всё совпало, создаётся delivery record:

- `message_relative_path`
- `agent`
- `project`
- `session_id`
- `delivery_state` (`pending-signal`, `signaled`, `claimed`, `expired`)
- timestamps

### 5. Safe pickup point

Delivery signal должен приходить в **safe lifecycle point**:

- предпочтительно `Stop`;
- допустимо `SessionStart` для backlog summary;
- не `UserPromptSubmit`.

Ожидаемое поведение:

- hook видит pending delivery для своей session/project;
- если сигнал есть, он inject'ит короткий continuation/system message:
  - например: `Есть новое письмо по project X. Проверь почту.`
- дальше агент уже сам вызывает mailbox flow.

Hook не должен:

- сам читать весь mailbox;
- сам исполнять письмо;
- спавнить тяжёлые процессы;
- делать длинные filesystem scans.

### 6. Lease / claim защита

Если у агента открыто два окна на одном проекте, нельзя чтобы оба “подняли” одно письмо.

Нужен lease/claim механизм:

- supervisor выдаёт lease на message одной session;
- lease имеет TTL;
- если session не подтвердила claim, lease истекает и письмо может быть предложено другой active session;
- claim должен быть отдельной runtime операцией, не mailbox edit.

## UI / dashboard требования

Текущий dashboard должен эволюционировать в global view:

- все pending messages across projects;
- фильтр по `project`, `agent`, `delivery state`;
- видно:
  - pending with no live session
  - pending with live session but not yet signaled
  - signaled
  - claimed
  - stale lease / supervisor error

UI не должен:

- становиться primary state store;
- запускать агентов;
- подменять formal execution workflow.

## Предлагаемый rollout

### Phase A — visibility first

Сделать supervisor без hook automation:

- polling mailbox;
- global pending index;
- runtime session registry;
- dashboard section `active sessions` + `undelivered messages`.

Цель: сначала доказать, что картина по 4-5 проектам реально читается.

### Phase B — passive hook integration

Добавить только:

- `SessionStart` registration
- `Stop` heartbeat
- `SessionStart` backlog summary

Без автоматического continuation prompt.

Цель: убедиться, что session discovery стабильна.

### Phase C — delivery signal

Добавить:

- supervisor-generated delivery records;
- lightweight `Stop` check;
- continuation/system prompt `check mail`.

Без auto-read / auto-reply.

### Phase D — lease/claim hardening

Добавить:

- multi-window lease protection;
- stale lease recovery;
- observability по missed delivery.

## Non-goals

- не делать “живой чат” между агентами;
- не делать push-notifications в стиле отдельного мессенджера;
- не строить отдельную БД поверх mailbox;
- не привязывать execution contract к runtime-state;
- не делать daemon, который сам пишет ответы от имени агента.

## Открытые design questions, которые нужно закрыть в formal plan

1. Где именно жить runtime-state:
   - `mailbox-runtime/` внутри workflow repo
   - или user-home scoped location
2. Чем именно делать supervisor:
   - Node standalone long-running script
   - или server process, расширяющий текущий dashboard backend
3. Как унифицировать project detection между:
   - Claude hooks
   - Codex hooks
   - dashboard
   - mailbox CLI
4. Какой именно delivery contract использовать в hooks:
   - file read
   - localhost endpoint
   - hybrid
5. Нужен ли отдельный “acknowledged but not yet claimed” state, или достаточно `signaled` + `claimed`

## Требование к следующему шагу

На основе этого ТЗ нужно подготовить **formal implementation plan**:

- с whitelist;
- с фазами;
- с pre-flight / verification;
- с явным разделением production files и runtime-only files;
- с учётом mixed Windows/WSL execution;
- с отдельным разделом failure modes / recovery.

## Короткий вердикт

Правильное направление:

> **central mailbox supervisor + runtime session registry + lightweight Stop/SessionStart delivery hooks**

А не:

> watchers everywhere / UserPromptSubmit injection / dashboard auto-run / live chat server.
