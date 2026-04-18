# Local Claude <-> Codex Mailbox Workflow

> **Статус**: discussion draft, revised after Claude review comments
>
> **Цель**: убрать ручной copy/paste между Claude (Windows IDE) и Codex (WSL terminal),
> но не строить хрупкую "магическую" автоматизацию поверх двух разных UI и двух разных runtime.

---

## Short answer

**Да, можно.**

Но не в форме "живой чат между двумя агентами", а в форме **локального file-based mailbox workflow**.

Это реальный и устойчивый вариант, потому что:

- Claude и Codex уже работают в **разных runtime**
- у них **нет нормального общего live IPC/API канала**, через который один агент может безопасно послать prompt другому
- зато у них есть **общая файловая система проекта**, доступная обеим сторонам

То есть реалистичная модель — не "агенты напрямую разговаривают друг с другом", а:

> **оба агента читают и пишут structured handoff files в общий mailbox**

Это **существенно уменьшает** ручной copy/paste, хотя пользователь всё ещё остаётся мостом между агентами и тем, кто говорит агенту "проверь входящие".

---

## Why this is feasible in your setup

### 1. Общий каталог уже существует

Claude работает на Windows-стороне, Codex — в WSL. Репозиторий уже лежит на Windows filesystem и виден из WSL как `/mnt/e/...`.

Это делает mailbox-вариант практичным:

- Windows-side Claude может читать/писать файлы в repo
- WSL-side Codex может читать/писать те же файлы через `/mnt/e/...`

Это согласуется с `[[sources/microsoft-wsl2-filesystem-docs]]`: cross-OS filesystem access в WSL2 существует, хотя Microsoft и рекомендует хранить проектные файлы на той стороне, где крутятся основные инструменты. Для **лёгкого append/create workflow** это нормально; проблема там скорее в heavy I/O, а не в маленьких handoff notes.

### 2. Хуки уже есть, но для mailbox их надо использовать сдержанно

По `[[concepts/claude-code-hooks]]`:

- `SessionStart` умеет inject'ить context
- `UserPromptSubmit` умеет inject'ить context

Это делает mailbox совместимым с существующей hook-based архитектурой. Но по `[[concepts/wiki-hook-injection-tuning]]` видно, что **UserPromptSubmit-инъекции легко превращаются в noise amplifier**.

Практический вывод для mailbox:

- **Phase 1**: вообще без hooks
- **Phase 2**: максимум `SessionStart` summary о pending messages
- **Не делать** mailbox inject на каждый `UserPromptSubmit`

### 3. Разные execution environments всё равно требуют file-based handoff

По `[[concepts/codex-dual-window-workflow]]` и `[[concepts/claude-desktop-cowork-architecture]]` у вас уже есть устойчивый вывод:

> разные execution environments надо координировать через handoff и файловый контракт, а не считать их "двумя окнами одного процесса"

Mailbox хорошо ложится в эту модель.

---

## What is NOT realistic

Нереалистичный вариант:

> "Codex сам отправляет живой prompt в открытый Claude IDE session, Claude отвечает, Codex читает ответ, и всё это без участия пользователя"

Почему это плохая цель:

- нет стабильного официального локального API для "втолкнуть prompt в уже открытую сессию" на обеих сторонах
- придётся либо лезть в UI automation, либо в неофициальные internal surfaces
- это будет хрупко и будет ломаться чаще, чем нынешний ручной copy/paste

Так что **live agent-to-agent chat** я не рекомендую.

А вот **asynchronous mailbox** — да.

---

## Recommended design

### Directory layout

Для **Phase 1 MVP** layout должен быть максимально простым:

```text
agent-mailbox/
  to-claude/
  to-codex/
  archive/
```

Поддиректории внутри `archive/` создаются **по thread slug** при первом архивировании:

```text
agent-mailbox/
  to-claude/
  to-codex/
  archive/
    freshness-plan/
```

Отдельные `threads/`, `claims/`, `index` файлы для MVP **не нужны**. Это можно добавить позже, если ручной workflow упрётся в масштаб.

### Git tracking decision

`agent-mailbox/` должен быть **gitignored**.

Причина:

- mailbox — это **local working memory**, а не part of project artifact
- диалоги между агентами не должны шуметь в PR и commit history
- privacy / scratchpad контент не стоит автоматически тащить в Git

Если какая-то мысль из mailbox важна как durable outcome, её надо **поднять** в:

- `docs/codex-tasks/` — если это формальный handoff, execution plan или report
- wiki — если это reusable knowledge / решение / архитектурный вывод

Это совпадает с `[[concepts/inter-agent-file-mailbox]]`: mailbox = gitignored async dialogue, `docs/codex-tasks/` = tracked structured contracts.

### Relationship to existing `docs/codex-tasks/` workflow

Mailbox **не заменяет** текущий handoff workflow в `docs/codex-tasks/`.

Это два разных режима коммуникации:

- `docs/codex-tasks/` = **формальные structured contracts**
  - execution plans
  - whitelist файлов
  - doc verification
  - acceptance criteria
  - verification phases
  - git-tracked audit trail
- `agent-mailbox/` = **неформальный async dialogue**
  - вопросы
  - уточнения
  - короткие review comments
  - hypothesis checks
  - request for clarification
  - gitignored scratchpad exchange

Правило простое:

- если задача длинная, risky или требует audit trail — использовать `docs/codex-tasks/`
- если нужно быстро что-то спросить, уточнить или ответить без overhead formal handoff — использовать mailbox

То есть mailbox — это **lightweight companion protocol**, а не новая замена существующей handoff discipline.

Жёсткие границы mailbox:

- mailbox **не** меняет approved scope
- mailbox **не** переопределяет whitelist файлов
- mailbox **не** вводит новые design decisions без user go/no-go
- mailbox **не** заменяет правило `Discrepancy -> stop -> wait`

Если в переписке всплывает что-то из этого класса, результат должен быть поднят в:

- formal `docs/codex-tasks/` handoff
- или в явный `Discrepancy` / review artifact

То есть mailbox годится для clarifications, review comments и коротких hypothesis checks, но не для скрытого переписывания execution contract.

### Optional local UI layer

Поверх этого file-based protocol можно построить **локальный web UI** с карточками в духе GitHub.

Это хороший следующий UX-слой, если сохранить базовый принцип:

> **files are the protocol, web UI is the view/controller**

То есть source of truth остаётся в markdown-файлах mailbox, а UI только:

- читает их
- удобно показывает
- создаёт новые message files по тем же правилам
- архивирует существующие message files по тем же правилам

UI **не должен**:

- вводить отдельную БД как primary state
- жить по своей lifecycle-модели отдельно от файлов
- запускать агентов автоматически
- обходить `Discrepancy -> stop -> wait`
- размывать роль пользователя как моста и decision-maker

Минимальная полезная форма такого UI:

- колонки `To Claude`, `To Codex`, `Archive`
- карточки с полями `from`, `to`, `thread`, `status`, `created`, `reply_to`
- ссылки на `related_files`
- thread view для просмотра истории одного `thread`

Empty state для первого запуска должен быть explicit:

- если mailbox пустой, UI показывает placeholder
- placeholder объясняет, что сообщений пока нет
- и даёт короткую инструкцию, как отправить первое сообщение

Разрешённые действия в UI:

- `reply`
- `archive`
- `open related file`

Но каждое из этих действий должно транслироваться в **те же** файловые операции, что и manual protocol:

- новый reply = новый markdown file
- archive = тот же `mv` в `archive/<thread>/`
- никакого отдельного скрытого state

Практический rollout для UI:

1. **Read-only dashboard** — рендерит карточки из `agent-mailbox/`
2. **Safe actions** — `reply` / `archive` через ту же файловую схему
3. **Helper layer** — validator, atomic `seq`, recovery, cached index
4. Потом уже polish, фильтры, keyboard shortcuts и т.п.

Как UI узнаёт о новых файлах:

- для MVP достаточно **polling** каждые 2–5 секунд
- manual refresh тоже допустим как fallback
- cross-OS file watchers на `/mnt/e/...` не стоит считать надёжной основой для раннего этапа
- `fs.watch` / watcher-based sync имеет смысл рассматривать только позже, ближе к helper-layer phase

Stack специально **не фиксируется** на уровне этого документа.

Правило простое:

- на старте UI phase выбирается самый дешёвый local-only стек, достаточный для карточек и markdown parsing
- это может быть простой HTML/JS, лёгкий SPA, React/Vite, Python/Node local server и т.п.
- выбор конкретного стека делается при запуске implementation phase, а не сейчас в protocol spec

Доступ и сетевые границы:

- UI должен быть **localhost-only**
- без внешнего доступа
- без отдельной auth-схемы на MVP-этапе
- с фиксированной local convention, например `http://127.0.0.1:9119/`

Это именно локальный интерфейс для gitignored scratchpad, а не публикуемый сервис.

Альтернативы хуже по trade-off:

- **TUI** — надёжно, но хуже обзорность и thread navigation
- **Просто файлы + markdown preview** — минимально, но friction остаётся высоким
- **SQLite / app-first UI** — удобно на вид, но слишком рано и создаёт риск рассинхрона с файлами

### Message format

Один файл = одно сообщение.

Формат — markdown с коротким frontmatter:

```md
---
id: 2026-04-15T18-42-10Z-claude-001
thread: freshness-plan
from: claude
to: codex
status: pending
created: 2026-04-15T18:42:10Z
related_files:
  - docs/codex-tasks/wiki-freshness-preliminary-plan.md
---

# Question

Проверь этот preliminary plan и скажи, где он перегружен.

## Context

- focus: freshness / stale guidance
- do not rewrite whole thing

## Requested output

- short critique
- concrete changes only
```

Допустимые дополнительные поля:

- `reply_to` — id сообщения, на которое это ответ
- `answer_message_id` — id reply, который закрыл исходный вопрос
- `archived_at` — timestamp переноса в archive
- `resolution` — например `answered`, `no-reply-needed`, `superseded`

### Timestamp rule

Все временные поля в mailbox должны быть:

- в **UTC**
- в ISO-подобном виде с `Z` suffix
- выставлены **на стороне writer'а**

То есть `created`, `archived_at` и timestamp в filename не нормализуются каким-то "общим часовым сервисом".

Cross-OS clock skew между Windows и WSL на уровне секунд возможен и считается **допустимым** для MVP:

- для уникальности id это не критично
- для локальной сортировки это приемлемо
- canonical interpretation всегда: "что записал writer в UTC, то и есть истина для этого message"

Почему именно так:

- readable и человеком, и агентом
- легко grep/search
- не нужен отдельный parser-heavy protocol
- при необходимости можно позже перейти на helper scripts без смены концепции

### Filename convention

Filename должен дублировать минимальный thread context:

```text
<timestamp>-<thread>-<from>-<seq>.md
```

Пример:

```text
2026-04-15T18-42-10Z-freshness-plan-claude-001.md
```

Это нужно не вместо frontmatter, а **вместе с ним**:

- frontmatter `thread` — authoritative key для агента
- filename — быстрый способ человеку глазами понять, что это за сообщение

Правила для `seq`:

- `seq` **не глобальный**, а локальный для комбинации `thread + from`
- в Phase 1 он берётся best-effort из текущего набора файлов этого `thread + from` в inbox + archive
- primary uniqueness всё равно дают `timestamp + from`

В номинальном dual-agent workflow это достаточно, потому что:

- в `to-codex/` пишет только Claude
- в `to-claude/` пишет только Codex

Если человек видит потенциальную коллизию, он просто берёт следующий свободный `seq`.

Для **Phase 3 helper scripts** allocator должен стать атомарным: helper сам резервирует следующий `seq`, а не полагается на "посмотрел глазами и прикинул".

### Thread continuity discovery

Для **MVP** не нужен отдельный `threads/` index.

Механизм continuity:

1. **Authoritative identifier**: поле `thread`
2. **Human hint**: thread slug в filename
3. **Discovery rule**: перед ответом агент ищет сообщения по `thread` в:
   - своей inbox-директории
   - противоположной inbox-директории при необходимости контекста
   - `agent-mailbox/archive/<thread>/`

Практически это значит:

- для человека достаточно увидеть slug в имени файла
- для агента canonical lookup = grep/search по `thread:` + просмотр `archive/<thread>/`
- canonical thread slug для `archive/<thread>/` и для всего protocol routing берётся **только** из frontmatter `thread`
- slug в filename — лишь human hint, не source of truth

Отдельный `threads/freshness-plan.md` индекс для MVP не нужен: это лишний mutable state.

Если slug в filename и `thread` во frontmatter расходятся:

- frontmatter `thread` побеждает
- mailbox не должен молча порождать второй thread только из-за filename typo
- следующий корректный turn должен использовать filename, согласованный с canonical `thread`

Риск typo в slug существует: `freshness-plan` и `freshnes-plan` молча расколют thread.

Правило для MVP:

- при ответе нельзя придумывать новый `thread`; нужно reuse `thread` из исходного message
- новый slug создаётся только при **осознанном** открытии нового thread

Для **Phase 3 helper scripts** нужен validator:

- если создаётся reply, helper обязан брать `thread` из `reply_to` target, а не из ручного ввода
- если пользователь явно продолжает существующий thread, helper валидирует slug против известных archive directories / active messages
- если создаётся genuinely new thread, helper валидирует только format slug, но не требует preexisting match

### Lifecycle and ownership

В Phase 1 не нужен отдельный `read` state.

Минимальная модель:

- `pending` — сообщение лежит в inbox и ждёт действия адресата
- `answered` — reply уже создан; этот state может быть **транзиентным** и в ручном Phase 1 допустимо схлопывать его почти мгновенно
- `archived` — сообщение больше не actionable и его canonical copy лежит в `archive/`

Практическое правило для MVP:

- адресат сообщения **владеет** этим сообщением, пока оно лежит в его inbox
- именно адресат пишет reply
- именно адресат архивирует обработанное входящее сообщение

Это снимает ambiguity "кто двигает какой файл".

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

#### Exception: user-authored append-note blocks

User (а не агент) может добавить собственный комментарий к карточке через дашборд. Это реализуется как **append-only user-note block** в конец тела существующего сообщения:

- agent-authored body остаётся immutable — prefix, frontmatter и оригинальный markdown не меняются;
- user-note блок начинается с `---` (horizontal rule), затем `**User note · <UTC timestamp>**`, затем markdown-текст заметки;
- несколько user-note блоков могут быть добавлены последовательно (каждый — отдельный `---`-разделённый блок в конце файла);
- агенты не пишут user-note блоки — это исключительно user tool.

Обоснование carve-out'а: исходный инвариант `append-only` защищает **доверие между агентами** (Claude не переписывает сообщение Codex и наоборот). User находится вне этой двухагентной trust-модели: это decision-maker, а не peer agent. Позволить user аннотировать карточку — естественное расширение его роли, без вреда agent-invariant'у.

Parsing-level разделения user-note блоков нет: `readMessage()` продолжает возвращать весь `parsed.content` как body/html. Это **поведенческое** указание агентам: user-note блок трактуется как reader context (аналог комментария пользователя в чат-сессии), а не как новый agent turn, и не как исполнимая инструкция. Если user хочет попросить агента что-то сделать — он отправляет новое сообщение через mailbox, а не прячет команду в user-note блок.

### Archive / deletion policy

Archive policy должна быть explicit:

- архивирование делается через **`mv`**, не через copy
- inbox должен содержать **только actionable messages**
- сообщение архивирует **его текущий адресат**, а не исходный отправитель
- архивирование происходит **сразу после reply** или после явного решения `no-reply-needed`
- retention для Phase 1: **храним archive бессрочно локально**, без автoчистки

Важно: создание reply и перенос обработанного incoming message надо рассматривать как **одну логическую операцию**.

Для ручного Phase 1 это не настоящая filesystem transaction, но рабочее правило такое:

- не создавать reply "впрок" и не откладывать archive move на потом
- если отвечаешь, то в той же рабочей операции сразу архивируй входящее сообщение

Иначе остаётся окно, где reply уже есть, а исходный message всё ещё выглядит как `pending`.

Idempotency rule:

- если сообщение уже отсутствует в inbox, но найдено в `archive/<thread>/`, оно считается уже обработанным
- не надо возвращать его обратно в inbox
- не надо создавать duplicate archive copy

### Error recovery after partial completion

Если агент создал reply, но упал до архивирования incoming message, применяется recovery rule:

- при следующем визите в inbox агент проверяет pending messages
- если для pending message уже существует message с **тем же** `thread` и `reply_to: <id>` в одном из путей:
  - `agent-mailbox/to-claude/`
  - `agent-mailbox/to-codex/`
  - `agent-mailbox/archive/<thread>/`
- то входящее сообщение надо доархивировать как `resolution: answered`

Цель recovery не в том, чтобы восстановить идеальную историю побайтно, а в том, чтобы вернуть mailbox в консистентное состояние "в inbox лежат только actionable messages".

### Concrete round-trip example

Ниже один полный пример Claude -> Codex -> Claude.

#### Step 1. Claude отправляет вопрос Codex

Файл:

```text
agent-mailbox/to-codex/2026-04-15T18-42-10Z-freshness-plan-claude-001.md
```

Содержимое:

```md
---
id: 2026-04-15T18-42-10Z-claude-001
thread: freshness-plan
from: claude
to: codex
status: pending
created: 2026-04-15T18:42:10Z
related_files:
  - docs/codex-tasks/wiki-freshness-preliminary-plan.md
---

# Question

Проверь plan и скажи, где он перегружен.
```

#### Step 2. Codex отвечает Claude

Codex создаёт новый reply file:

```text
agent-mailbox/to-claude/2026-04-15T18-55-03Z-freshness-plan-codex-002.md
```

Содержимое:

```md
---
id: 2026-04-15T18-55-03Z-codex-002
thread: freshness-plan
from: codex
to: claude
status: pending
created: 2026-04-15T18:55:03Z
reply_to: 2026-04-15T18-42-10Z-claude-001
related_files:
  - docs/codex-tasks/wiki-freshness-preliminary-plan.md
---

# Reply

Перегружены два блока: scoring detail и rollout timeline.
```

#### Step 3. Codex архивирует исходный вопрос

После создания reply Codex обновляет исходное сообщение и переносит его:

```text
agent-mailbox/archive/freshness-plan/2026-04-15T18-42-10Z-freshness-plan-claude-001.md
```

Обновлённый frontmatter:

```md
---
id: 2026-04-15T18-42-10Z-claude-001
thread: freshness-plan
from: claude
to: codex
status: archived
created: 2026-04-15T18:42:10Z
answer_message_id: 2026-04-15T18-55-03Z-codex-002
resolution: answered
archived_at: 2026-04-15T18:55:30Z
related_files:
  - docs/codex-tasks/wiki-freshness-preliminary-plan.md
---
```

#### Step 4. Claude читает reply

Если вопрос закрыт, Claude архивирует reply аналогично:

```text
agent-mailbox/archive/freshness-plan/2026-04-15T18-55-03Z-freshness-plan-codex-002.md
```

Если вопрос **не** закрыт, Claude не редактирует старые файлы, а создаёт **новое** сообщение:

```text
agent-mailbox/to-codex/2026-04-15T19-04-11Z-freshness-plan-claude-003.md
```

с тем же `thread: freshness-plan` и `reply_to: 2026-04-15T18-55-03Z-codex-002`.

Это и есть thread continuity: **новый файл на каждый turn, тот же `thread`, явный `reply_to` при ответе**.

### Message size cap

Mailbox не предназначен для больших логов, дампов и длинных execution artifacts.

Мягкое правило:

- если сообщение начинает приближаться к **200 строкам**
- или содержит большой лог / diff / stack trace
- это уже не mailbox material

В таком случае надо:

- поднять содержимое в `docs/codex-tasks/` или другой явный artifact file
- а в mailbox оставить короткое сообщение + ссылку на этот файл

---

## Recommended workflow

### MVP workflow

1. Отправитель создаёт `pending` message в inbox получателя
2. Получатель перед ответом быстро смотрит активные сообщения этого `thread`
3. Получатель создаёт новый reply file в обратную inbox-директорию
4. Получатель архивирует обработанное входящее сообщение в `archive/<thread>/`
5. Следующий адресат либо архивирует reply как закрытый, либо отправляет новый turn в том же `thread`

### User role

Пользователь больше не копирует тексты руками.

Его роль сводится к короткой команде:

- в Claude: "проверь mailbox"
- в Codex: "проверь mailbox"

Это уже сильно легче, чем ручная пересылка полного содержания.

---

## Why append-only / file-per-message is important

Не надо делать один общий `chat.md`, в который оба агента будут одновременно дописывать.

Лучше:

- один message = один файл
- каждый новый turn = новый файл
- после обработки файл архивируется

Причины:

- меньше риск cross-OS locking weirdness
- нет merge-conflict style race
- проще диагностировать
- проще руками открыть и понять, что происходит

Это особенно важно в mixed Windows/WSL setup.

---

## Phaseable implementation

### Phase 1 — manual mailbox, no hooks

Самый дешёвый вариант:

- создать `agent-mailbox/`
- добавить его в `.gitignore`
- договориться о формате сообщений
- договориться о filename convention
- договориться об archive policy
- дать обоим агентам простое правило:
  - check inbox
  - search thread
  - answer in matching directory
  - archive processed incoming message

Плюсы:

- минимум кода
- почти не ломается
- сразу полезно
- нет unsupported automation

### Phase 2 — hook-assisted visibility

Если Phase 1 заходит, добавить только:

- `SessionStart` summary:
  - `pending messages for Claude: N`
  - `pending messages for Codex: N`
- возможно, короткий top-of-inbox preview для 1-2 сообщений

Важно:

- **только SessionStart**
- **не** делать mailbox injection на каждый `UserPromptSubmit`
- explicit команда пользователя "проверь mailbox" всё ещё остаётся нормальным trigger'ом

Это лучший компромисс с учётом `[[concepts/wiki-hook-injection-tuning]]`: visibility без лишнего шума.

### Phase 3 — helper scripts

Если workflow реально приживётся, добавить:

- `scripts/mailbox.py send`
- `scripts/mailbox.py list`
- `scripts/mailbox.py reply`
- `scripts/mailbox.py archive`

Требования к этим helper scripts:

- атомарно выделять `seq`
- при reply автоматически наследовать `thread` из target message
- валидировать slug для existing thread
- уметь делать recovery после частично завершённой операции

Отдельная оговорка про производительность:

- mailbox на `/mnt/e/...` для маленьких файлов нормален
- но если helpers начнут каждый раз сканировать весь archive, это будет лишний cross-OS I/O

Поэтому для Phase 3 нужен **incremental / cached lookup**, а не полный re-scan архива на каждую операцию.

И тогда агенты смогут работать уже через одни и те же команды без разрастания ручных правил.

---

## What I would NOT build now

Я бы не строил сейчас:

- background daemons
- file watchers, которые сами триггерят агентов
- UI automation для VS Code / terminal
- "настоящий чат-сервер" между Claude и Codex
- отдельный mutable thread index

Это будет хрупко и непропорционально задаче.

---

## Concrete recommendation

Если делать это разумно, я рекомендую именно такой путь:

### Best next step

Сделать **MVP mailbox**:

- `agent-mailbox/to-claude/`
- `agent-mailbox/to-codex/`
- `agent-mailbox/archive/`
- `.gitignore` для `agent-mailbox/`
- markdown frontmatter message format
- filename convention с thread slug
- явную archive policy
- без автоматического запуска

Это даст:

- убирает copy/paste почтальона
- не требует unsupported integration
- хорошо ложится на текущий dual-runtime setup
- не конфликтует с hooks и wiki-first архитектурой
- не конкурирует с `docs/codex-tasks`, а дополняет их

---

## Decision

**Да, разрабатывать такой workflow можно и имеет смысл.**

Но правильная форма — это:

> **shared mailbox / handoff protocol через файлы**

а не:

> "полностью автоматический live chat между двумя агентами"

Если идти дальше, то сначала нужен **минимальный mailbox MVP**, а не оркестратор.

---

## Review Resolution (2026-04-15)

В этой итерации draft'а закрыты все 7 review concerns:

1. Добавлен **concrete round-trip example**
2. Определены **lifecycle states** и ownership; `read` сознательно опущен в MVP
3. Зафиксирована **archive policy** (`mv`, immediate archive, addressee-owned)
4. Зафиксирован **thread discovery mechanism** (`thread` + filename slug + search in archive)
5. Принято явное решение: **`agent-mailbox/` gitignored**
6. Явно разведены роли **`docs/codex-tasks/` vs `agent-mailbox/`**
7. Зафиксирована **hook semantics**: Phase 1 без hooks, Phase 2 = `SessionStart` only

Дополнительно после follow-up review зафиксированы ещё несколько guardrails:

- UTC timestamp rule на стороне writer'а
- anti-pattern "не редактировать существующие сообщения"
- recovery после crash между reply и archive
- мягкий size cap для mailbox message
- требования к Phase 3 helper scripts: validator, atomic seq, cached lookup

Следующий логический шаг после этого draft'а — не "добавить ещё философии", а перевести его в формальный execution handoff plan для Phase 1 MVP.
