# Аудит плана: mailbox-simple-monitor

**Статус**: retrospective (план реально исполнен коммитом `837aa90`, затем полностью откачен `9326194`)
**Источник**: `git show 837aa90:docs/codex-tasks/mailbox-simple-monitor.md` (579 строк)
**Baseline плана**: `903af96`
**Текущий HEAD**: `092c725` (после revert + UI polish)

## Оценка: 🟠 5/10
План структурно аккуратный, но содержит три класса серьёзных дефектов: (1) архитектурный конфликт с документированным в wiki решением «Dashboard = visibility only, не launcher»; (2) два проглядённых bug-path'а (поле `received_at` всегда заполнено из-за fallback в readMessage; codex-adapter.runCodex не устанавливает `cwd`) — оба подтвердились на execute-стадии; (3) преувеличенные probe'ы (V12 описание ≠ реализация) и race-condition V11 (async persist + sync read).

| Измерение | Баллы |
|---|---|
| Точность ссылок | 1.5/2 |
| Соответствие правилам | 0.5/2 |
| Учёт blast radius | 1/2 |
| Полнота шагов | 1/2 |
| Реализуемость | 1/2 |

---

## 1. Проверка ссылок

| Ссылка в плане | Статус | Комментарий |
|---|---|---|
| Baseline `903af96` | ✅ | Коммит существует, всё родовое древо сохранено |
| `dashboard/supervisor.mjs` L387 `state.pendingIndex = pending;` | ✅ | Точно совпадает в baseline |
| `dashboard/server.js` L218 `supervisor.setOrchestrator(orchestrator);` | ✅ | Точное попадание |
| `dashboard/src/App.jsx` L1177-1184 `formatTimestamp … timeZone:"UTC"` | ⚠️ | Фактически L1182; диапазон «1177-1184» охватывает, но точная строка не указана |
| `App.jsx` L1290-1293 received span | ✅ | L1291-1292 — в пределах диапазона |
| `App.jsx` L1406 `soundEnabled` state | ✅ | Точное попадание |
| `App.jsx` L1760 `soundButton` | ⚠️ | L1760 — это `aria-label`, `className="soundButton"` на L1762; CSS на L453/459 — множественные локации, план упрощает до «alongside» |
| `scripts/adapters/claude-code-adapter.mjs:188` | ✅ | Совпадает с телом launch |
| `scripts/adapters/codex-adapter.mjs:232` | ✅ | Близко (фактически ~234) |
| Preflight `wc -l supervisor.mjs = 467` | ❌ | **Реальный baseline = 468 строк**. Off-by-one — user поймал это на execute-стадии, Codex написал retry letter. Попало в `feedback_execute_report_verification.md` pattern |
| `wc -l server.js = 401` | ✅ | Совпадает |
| `wc -l App.jsx = 1972` | ✅ | Совпадает |
| `wc -l claude-adapter=438, codex-adapter=463` | ✅ | Совпадают |

Найдено ошибок: 1 явная (wc=467) + 2 мягких (range vs point line refs). Всё остальное точно.

---

## 2. Соответствие правилам проекта

**Затронутые зоны риска (по `CLAUDE.md` + вики):**
- `dashboard/supervisor.mjs` — точка входа supervisor-процесса (полнота архивов, project isolation проходят через него)
- `dashboard/server.js` — API-слой
- `dashboard/src/App.jsx` — UI (2000 lines, хрупкий)

**Нарушения:**

🔴 **CRITICAL — противоречие задокументированной архитектурной позиции вики.** `E:/Project/memory claude/memory claude/wiki/concepts/mailbox-auto-pickup-supervisor.md:52` явно помещает «Auto-launching agents» в Rejected Alternatives с аргументом «Dashboard = visibility only, не launcher». Тот же документ L20: «supervisor не исполняет задач — он устанавливает delivery signal, агент подхватывает его на следующем Stop lifecycle event». План же делает прямое противоположное: `adapter.launch` спавнит новые процессы. Плану следовало:
  - либо сослаться на wiki и явно задокументировать отмену предыдущего решения с обоснованием (например: «по прямой просьбе user'а, принимаем компромисс: spawn короткоживущих процессов вместо delivery-via-Stop-hook»),
  - либо следовать существующему архитектурному паттерну через Phase C delivery signal (`e497ef6 feat(mailbox): Phase C — delivery signal via Stop hook injection`), который уже существовал в коде.

🔴 **CRITICAL — неявная семантика «ping»-а.** План говорит «монитор пингует агента», но по факту «пинг» = спавн НОВОГО фонового Codex/Claude процесса. Plan §0 («robot пингует agent проверить почту») использует слово «пингует», ожидая у user'а картину «мой открытый Codex-терминал получит уведомление». План не дал дисклеймера, что существующая открытая интерактивная сессия Codex CLI **не получает** никаких push-уведомлений — это технически невозможно через CLI. После execute это и стало точкой фрустрации user'а.

🟡 **План создал возможность silent cross-project spawn.** Prompt `Проверь почту проекта ${project}` управляется только `message.project`, который берётся из `pending` index. Но супервизор теперь уже является launcher'ом, а не observer'ом — это меняет контракт project-isolation. Вики `mailbox-project-isolation.md` писался под visibility-only модель.

**Соблюдено:**
- ✅ 3-file handoff структура (plan + planning-audit + report template) — полное соответствие rule #2
- ✅ Paperclip-стек защищён через `НЕ ТРОГАТЬ` whitelist
- ✅ Preflight + pre-commit/pre-push gates обозначены
- ✅ Discrepancy checkpoints явно перечислены (§9)
- ✅ Rollback присутствует (§8)

---

## 3. Зона поражения (blast radius)

**Прямые зависимости:**
- План вызывает `adapter.launch({project, thread, instruction})`. На baseline `903af96` обе реализации launch в `claude-code-adapter.mjs:188` и `codex-adapter.mjs:232` спавнят процесс через `runCodex/runClaude`. У обоих `runX` функций `spawnFn(...)` вызывается **без `cwd` option** — дочерний процесс наследует cwd parent'а. Когда dashboard запущен из Windows (через `wsl.exe -d Ubuntu bash -lc`), login-shell обычно перемещается в `$HOME=/home/<user>`, и относительный путь `node scripts/mailbox.mjs list --project workflow` в prompt'е не найдёт скрипт. **План не флагнул это**, хотя напрямую зависит от cwd поведения spawn'а. Это подтвердилось на execute (summary: «wrong cwd bug — codex exec via wsl.exe bash -lc starts in /home/<user>, relative node scripts/... fails»).

- `pollTick` строит `pending` элементы как `{…, received_at: message.received_at || ""}` (supervisor.mjs:383). Source `message.received_at` приходит из `readMessage` в `mailbox-lib.mjs:405-407`:
  ```js
  received_at: toMessageTimestamp({
    data: { created: parsed.data.received_at ?? parsed.data.created }
  })
  ```
  **`received_at` всегда populated** (fallback на `created`). Поэтому `|| ""` никогда не срабатывает. А `runMonitor`'s предикат:
  ```js
  if (message.received_at) continue;  // agent уже прочитал
  ```
  **всегда falsey → всегда continue → монитор никогда не пингует**. Это главный execution-time bug, который проявился сразу. План назвал переменную `received_at` и принял её за «raw frontmatter flag», но это derived-field. Проверка должна была быть против `message.metadata?.received_at` (raw) или против `received_raw`, как и было исправлено на execute.

**Косвенные риски:**
- `busyAgents.add(agent)` — тот же `Set<'claude'|'codex'>` на весь workflow. Если одно письмо к codex'у стартовало spawn на 10 минут (`spawnTimeoutMs = 10 * 60 * 1000`), все новые письма к codex'у **молча дропаются** в это окно. План не обсуждает lease-deadlock.
- «Fire-and-forget» определено как `void pingAgentForMessage(...)`, но внутри idx `await adapter.launch(...)` держит Promise 10 мин. Это не fire-and-forget в smыcле resource-освобождения — это лишь discard результата. Семантически обманчиво.

**Пропущенные файлы:**
- `scripts/mailbox-lib.mjs` не в whitelist, но логика монитора ЗАВИСИТ от `readMessage` получения `received_at`. Реально изменять не нужно — но план должен был явно зафиксировать **инвариант**, на котором строится правильность: «`message.received_at` отражает момент прочтения агентом, не момент отправки». Инвариант нарушен текущей readMessage-реализацией.
- `.codex/sessions/` (home-directory artefact codex-adapter'а) — каждый спавн создаёт новую сессию на диске. Монитор может за день накопить сотни сессий-файлов в `~/.codex/sessions/`. План не упоминает housekeeping.

---

## 4. Пропущенные шаги

- 🔴 **Нет probe на cwd spawned codex.** V12 структурно проверяет persist+toggle, но НЕ проверяет, что спавнящийся codex реально получает правильный cwd и способен найти `scripts/mailbox.mjs`. V12 header противоречит телу: «fake spawn captures argv при enabled=true + pending letter … captured >=1» — но реализация дальше говорит «Real spawn-on-message empirical covered Phase 2 P2.3 (requires running Codex CLI)» и делает **структурный дубль V11** (default=false + set=true + persist). Это называется description-actual mismatch pattern (вики: `handoff-plan-verification-traps`).
- 🔴 **Нет probe на invariant `received_at` source.** Должна быть проверка: «создать test-письмо без `received_at` в frontmatter → `readMessage` вернёт НЕ-пустой `received_at`». Это бы сразу обнаружило главный bug.
- 🟡 **Нет probe на spawn cleanup.** Спавнится процесс → висит в activeSpawns → cleanup при shutdown? План upstream use `adapter.shutdown()` не упоминает.
- 🟡 **V14 whitelist-drift check слишком узкий.** «3 M + 3 handoff» не учитывает: package-lock, runtime JSON (`monitor-enabled.json` будет в gitignored `mailbox-runtime/` — ok), но CRLF-drift на supervisor.mjs/server.js/App.jsx (известная проблема в данном workflow, wiki `codex-crlf-churn-commit-verification`) может сгенерировать больше M-файлов.
- 🟡 **Rollback не упоминает restore adapter imports.** Если план добавляет `import { createClaudeCodeAdapter }` в supervisor.mjs, а rollback делает `git checkout --`, то import исчезает — OK, но в многоэтапных откатах важно подтверждать что `scripts/adapters/*` остались нетронуты.

---

## 5. Рекомендации

### 🔴 Критические (блокеры)

1. **Перечитать `mailbox-auto-pickup-supervisor.md` и либо явно отменить решение «visibility-only» с обоснованием, либо перепроектировать monitor через Phase C delivery signal.** Конкретно: добавить в план §0 секцию «Architectural decision log: overrides previous N phase rollout because …». Без этого план нарушает rule #1 (research before planning) и rule #7 (discrepancy→stop→wait).

2. **Добавить явное предупреждение user'у о семантике ping'а.** Текст типа: «ВАЖНО: monitor спавнит НОВЫЕ короткоживущие codex/claude процессы (через `codex exec` / `claude -p`). Это НЕ инъекция в вашу открытую интерактивную Codex-сессию — CLI-инструменты не имеют push-API. Если вы хотите чтобы ваш открытый терминал "ожил" — это невозможно; вам нужно будет запустить `mailbox.mjs list` вручную.» Без этого плана user предсказуемо ожидает другого поведения (что и произошло).

3. **Заменить `if (message.received_at) continue;` на `if (message.metadata?.received_at) continue;`.** Альтернативно — добавить в pollTick pending-mapping новое поле `received_raw: message.metadata?.received_at || ""` и сверять с ним. Без этого fix'а монитор **никогда не пингует** — функциональный regression к 100% dead code.

4. **Исправить spawn cwd.** Вариант A: прокинуть `cwd` опцию в `runCodex/spawnFn({...}, {cwd: process.cwd()})`. Вариант B (менее инвазивный): добавить `cd /mnt/e/Project/workflow && ` в начало prompt'а. План должен явно выбрать один и задокументировать. Patch нужен в adapter ИЛИ в monitor's prompt; план не может оставить это на интуицию Codex'а.

5. **Переделать V12.** Настоящий empirical probe: создать письмо через `writeMessage`, подменить `adapter.launch` на stub-функцию (через dependency injection при createSupervisor или через mutating `monitorClaudeAdapter = { launch: stub }`), протикать pollTick вручную, assert что stub был вызван с правильным project в prompt'е. Без этого главный code-path монитора остаётся непокрытым до Phase 2 P2.3 (= у user'а).

### 🟡 Важные

6. **Исправить wc=467 → 468.** Тривиальная правка preflight.

7. **Устранить V11 race: `setMonitorEnabled(true); await fs.readFile(...)` читает до того, как `void persistMonitorEnabled()` фликнет write.** Сделать persistMonitorEnabled синхронным (fsSync.writeFileSync) ИЛИ сделать `setMonitorEnabled` возвращающим Promise и awaited. Текущая форма — race condition. (Execute-commit это частично зафиксировал, но план был неправ.)

8. **Расширить V14:** `git status --short` должен ловить и LF/CRLF-drift на supervisor.mjs/server.js/App.jsx. Добавить проверку `git diff --shortstat` == 0 на не-whitelist-файлы.

9. **Документировать busyAgents lease-limit.** Если agent-spawn висит 10 мин, новые письма теряются молча. Хотя бы добавить logger.warn при drop'е.

10. **Добавить housekeeping note:** `.codex/sessions/` накапливает per-spawn files; рекомендовать periodic cleanup.

### 🔵 Необязательные

11. **«Fire-and-forget» в комментарии заменить на «await-discarded spawn (runs up to 10 min)»** — уменьшает путаницу при чтении кода.

12. **Monitor toggle button — рассмотреть moving UI polls к существующему fetchAll interval** (5s) вместо отдельного 5s polling `/api/monitor/status`, уменьшить шум в Network tab.

---

## 6. Карта изменений

```
dashboard/supervisor.mjs (monitor state + pollTick wire)
  ├─ imports scripts/adapters/claude-code-adapter.mjs ← read-only
  ├─ imports scripts/adapters/codex-adapter.mjs ← read-only
  ├─ uses readBucket/readMessage from scripts/mailbox-lib.mjs (invariant: received_at always populated) ⚠ BLAST
  └─ runMonitor(pending) ← new, in pollTick after pendingIndex set

dashboard/server.js
  └─ POST /api/monitor/start + /stop + GET /status ← new 3 endpoints, wire to supervisor methods

dashboard/src/App.jsx
  ├─ formatTimestamp: remove timeZone:"UTC"
  ├─ new audioUnlocked state + useEffect (WebAudio unlock)
  ├─ new monitorEnabled state + polling + toggleMonitor + JSX button
  └─ MessageCard received span: conditional notRead badge

Wiki concepts-level conflict:
  mailbox-auto-pickup-supervisor.md:52 «Auto-launching agents» = rejected ← VIOLATED
  mailbox-auto-pickup-supervisor.md:20 «supervisor не исполняет задач» ← VIOLATED
```

---

## 7. Почему это важно post-factum

Несмотря на то что план откачен — анализ ценен как документация root-cause для `feedback_execute_report_verification.md` и для будущих итераций:

1. **Wiki-first нарушен на этапе planning.** Ни один раздел не сослался на `mailbox-auto-pickup-supervisor.md`. Следующий monitor-план **обязан** начинаться с wiki-review.

2. **Смысловое искажение слова «пинг».** Критичное для handoff'ов с user'ом, где терминология смешивается с обыденным языком. Кандидат на entry в вики: «Слово 'ping' в CLI-automation контексте = spawn new process, не signal-to-existing».

3. **`received_at` fallback-trap** — мягкий API pitfall, который нужно задокументировать в mailbox-lib как «derived vs raw fields».

4. **Spawn-without-cwd** — блокирующий паттерн для любых WSL-wrappers; кандидат в вики-запись под `codex-cli-sandbox-behavior` или `windows-wsl-process-launcher`.

Эти 4 наблюдения — основной материал для будущего ingest в LLM Wiki.


## Legacy Workflow Note (2026-04-21)

This file is preserved as a historical artifact from an earlier workflow revision.

It may mention legacy patterns such as `Claude planner / Codex executor`, user relay, `compact prompt`, or older handoff shapes.

Do not use it as the live operating template. Current contract: `docs/codex-system-prompt.md`, `AGENTS.md`, `workflow-role-distribution.md`, `workflow-instructions-claude.md`, and `workflow-instructions-codex.md`.
