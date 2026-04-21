# ТЗ — project isolation для agent mailbox при общем dashboard

## Контекст

Текущий dashboard может быть общим для нескольких проектов, и это правильно для пользователя:

- пользователь должен видеть все проекты в одном месте;
- внутри dashboard проекты могут быть разделены фильтрами, секциями и счётчиками.

Но это **не должно** означать, что агент в проекте `A` видит или получает письма проектов `B/C/D/...`.

Сейчас проблема именно в этом:

- общий mailbox/delivery path начал вести себя как cross-project queue;
- агентские сессии могут получать или учитывать письма чужих проектов;
- в результате агент начинает смешивать работу разных проектов в одном operational потоке.

Это нужно убрать.

## Цель

Оставить **один общий dashboard для пользователя**, но ввести **жёсткую project isolation для агентов**.

Итоговое поведение должно быть таким:

1. Пользователь в dashboard видит все проекты.
2. Агент в проекте `X` получает, читает, архивирует и обрабатывает **только** письма проекта `X`.
3. Письма других проектов не попадают:
   - в inbox summary агента;
   - в hook delivery signal;
   - в list/read/reply/archive/recover flow агента;
   - в reasoning про приоритеты текущей сессии.

## Принцип

Нужно разделить два уровня:

- **user visibility layer** — может быть multi-project;
- **agent delivery layer** — строго single-project.

Именно user может видеть общий обзор.
Агенту cross-project visibility запрещена.

## Жёсткие требования

### 1. Project обязателен

Для agent-delivery flow `project` должен быть обязательным полем.

Недопустимо:

- сообщение без `project`;
- session без `project`;
- delivery record без `project`;
- fallback-логика "если project не указан, попробуем угадать".

Если `project` отсутствует, это не допустимый runtime branch, а ошибка валидации.

### 2. Dashboard остаётся общим

Dashboard не нужно сужать до одного проекта.

Допустимо и желательно:

- общий список проектов;
- общий обзор pending messages;
- фильтры по проектам;
- user-facing global visibility.

Но это **только UI для пользователя**, не источник того, что показывается агенту.

### 3. Agent-side access строго project-scoped

Любой агентский mailbox path должен быть ограничен текущим проектом сессии:

- `list`
- `read`
- `reply`
- `archive`
- `recover`
- hook summary
- supervisor delivery signal

Если текущая сессия привязана к `project = workflow`, она не должна видеть письма `memory-claude`, `messenger` и т.д.

### 4. Cross-project leakage запрещён

Запрещены такие состояния:

- агент в проекте `A` видит pending count проекта `B`;
- агент получает continuation signal по письму проекта `B`;
- агент пишет в mailbox thread проекта `B`, находясь в проекте `A`;
- агент откладывает работу по текущему thread, потому что "сначала закончит block другого проекта".

Если такое случается, это defect.

### 5. Sender/recipient validation остаётся жёсткой

Нельзя отправлять сообщение, если:

- нет `project`;
- нет `from`;
- нет `to`;
- `from` не равен `claude` или `codex`;
- `to` не равен `claude` или `codex`;
- `from === to`.

### 6. Dashboard не создаёт agent ambiguity

Dashboard может оставаться user-facing tool, но не должен размывать identity и routing:

- dashboard не должен создавать agent-authored mailbox messages;
- dashboard не должен подменять project scope агента;
- dashboard не должен быть источником cross-project agent inbox.

## Архитектурное следствие

Нужно провести жёсткую границу:

### User path

User может:

- видеть все проекты в dashboard;
- фильтровать, просматривать и сравнивать их;
- вручную работать с UI в глобальном обзоре.

### Agent path

Agent может:

- работать только в рамках своего `project`;
- получать только project-matched deliveries;
- читать только project-matched mailbox records.

Именно supervisor / hooks / CLI / backend должны обеспечивать эту границу.

## Где именно нужно чинить

Не на уровне "объяснить агентам".

Чинить нужно **в инфраструктуре**:

1. Backend/API validation
2. Supervisor routing
3. Hook/session registration
4. CLI mailbox access path
5. Любой delivery summary для агента

Обучение агента без технической изоляции недостаточно.

## Что требуется от следующего plan

Нужен отдельный handoff plan, который:

1. описывает текущие точки cross-project leakage;
2. определяет canonical source текущего project для agent session;
3. вводит обязательный project-scoped read/delivery path;
4. сохраняет общий multi-project dashboard для пользователя;
5. добавляет verification, что агент проекта `A` физически не видит письма проекта `B`.

## Acceptance criteria

Решение считается правильным, если выполняются все условия:

1. Пользователь в dashboard видит несколько проектов одновременно.
2. Агент в проекте `A` не получает ни одного письма проекта `B`.
3. Hook summary для агента содержит только текущий проект.
4. Supervisor delivery records не создаются cross-project.
5. CLI/agent-side mailbox list/read flow не возвращает чужие проекты.
6. Попытка отправить agent-message без `project` отклоняется.
7. Попытка смешать agent session и mailbox другого проекта детектируется как ошибка.

## Важно

Никаких рассуждений в духе:

- "общий central hub для агентов"
- "агент может временно видеть всё, а потом фильтровать"
- "если project не определён, можно мягко продолжить"

Это всё неправильные модели.

Правильная модель:

- **общий dashboard для пользователя**
- **строгая project isolation для агентов**



## Legacy Workflow Note (2026-04-21)

This file is preserved as a historical artifact from an earlier workflow revision.

It may mention legacy patterns such as `Claude planner / Codex executor`, user relay, `compact prompt`, or older handoff shapes.

Do not use it as the live operating template. Current contract: `docs/codex-system-prompt.md`, `AGENTS.md`, `workflow-role-distribution.md`, `workflow-instructions-claude.md`, and `workflow-instructions-codex.md`.
