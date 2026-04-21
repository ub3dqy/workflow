# Распределение ролей: Claude + Codex + Пользователь

> Этот документ написан от лица пользователя. Оба агента обязаны следовать ему.
> Canonical reference: [docs/codex-system-prompt.md](./docs/codex-system-prompt.md).

---

## Общий принцип

Это sequential two-agent workflow.

- Я даю одну и ту же исходную задачу обоим агентам.
- Claude и Codex независимо производят initial result.
- Codex синтезирует техническое задание и выступает gate на review + verification.
- Claude строит и исполняет tracked package.
- Claude↔Codex координируются через agent mail, не через пользовательский пересказ.
- Задача закрыта только когда у Codex нет unresolved `Critical` или `Mandatory to Fix` remarks.

## Текущий артефактный контракт

### Claude tracked package

Для live задачи Claude ведёт:

1. `docs/codex-tasks/<slug>.md`
2. `docs/codex-tasks/<slug>-planning-audit.md`
3. `docs/codex-tasks/<slug>-report.md`

### Codex tracked verification artifact

Codex создаёт и поддерживает:

4. `docs/codex-tasks/<slug>-work-verification.md`

### Mailbox artifacts

Через `agent-mailbox/` идут:

- independent initial results
- synthesized technical specification
- review remarks / agreements
- implementation handoff notices
- final verification verdicts

## Sequential Workflow

| # | Кто | Что делает |
|---|---|---|
| 1 | Я | Даю одну и ту же исходную задачу Claude и Codex |
| 2 | Claude | Делает свой independent initial result и отправляет его Codex через mailbox |
| 3 | Codex | Делает свой independent initial result, сравнивает оба результата и синтезирует техническое задание |
| 4 | Codex | Отправляет synthesized specification Claude через mailbox |
| 5 | Claude | На основе specification создаёт tracked three-file package |
| 6 | Claude | Отправляет package Codex на review через mailbox |
| 7 | Codex | Либо даёт full agreement, либо remarks по категориям `Critical`, `Mandatory to Fix`, `Additional Improvements` |
| 8 | Claude | Полностью устраняет critical и mandatory remarks и повторно отправляет package |
| 9 | Claude | После clean agreement исполняет plan и заполняет execution report |
| 10 | Claude | Отправляет implementation package Codex на final verification |
| 11 | Codex | Проверяет реализацию, обновляет Work Verification Report и возвращает verdict |
| 12 | Claude | Устраняет финальные remarks и повторно отправляет package, пока Codex не подтвердит clean status |

## Что делает Claude

| Действие | Детали |
|---|---|
| **Independent initial result** | Независимый анализ исходной задачи без опоры на Codex |
| **Planning package** | Три tracked файла: plan, planning-audit, execution report |
| **Execution** | Реальные изменения по latest agreed plan |
| **Discrepancy handling** | Если факты ломают plan: stop → update package → resend Codex |
| **Git actions** | Commit/push/merge только по моей явной команде |
| **Final handoff to Codex** | Передача implementation package на final verification |

**Claude НЕ делает:**

- не начинает execution до clean agreement от Codex
- не подменяет mailbox пользовательским relay как рабочий transport
- не выдумывает package format поверх текущего tracked contract
- не коммитит/пушит/мержит без моего прямого разрешения
- не скрывает blockers за vague language

## Что делает Codex

| Действие | Детали |
|---|---|
| **Independent initial result** | Собственный анализ исходной задачи |
| **TZ synthesis** | Сравнивает свой и Claude result, формирует unified technical specification |
| **Planning review** | Проверяет package на correctness, completeness, traceability, realism, tool readiness |
| **Remarks classification** | Использует категории `Critical`, `Mandatory to Fix`, `Additional Improvements` |
| **Final verification** | Проверяет implementation against latest agreed plan + original task |
| **Work Verification Report** | Ведёт tracked verification document с фактическими проверками и unresolved issues |

**Codex НЕ делает:**

- не исполняет production changes вместо Claude
- не коммитит и не пушит
- не даёт approval без evidence
- не блокирует cosmetic issues как critical
- не меняет scope единолично; сильная альтернатива оформляется как reasoned remark/proposal

## Что делаю я

| Действие | Примеры |
|---|---|
| **Ставлю исходную задачу** | Один и тот же task statement обоим агентам |
| **Принимаю решения** | Выбираю варианты и design direction |
| **Даю go/no-go на git** | `commit`, `pr`, `merge`, destructive variants |
| **Проверяю итог** | Могу читать tracked artifacts и mailbox history |

## Priority Order

1. Official documentation
2. User's explicit instructions
3. Factual tool/test/audit results
4. Agreed project documents
5. Wiki as contextual memory

## Communication Rules

- Claude↔Codex: mailbox only
- User↔agents: normal chat in each runtime
- Mailbox letters can reference tracked files by path
- Mailbox cannot silently rewrite scope, whitelist, or design decisions

## Historical Archive Rule

Most existing `docs/codex-tasks/*.md` were created under earlier workflow revisions. They remain archived evidence, not the live operating template.
