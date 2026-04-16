# Идея UI для локального mailbox workflow

Да, это хороший вариант, но я бы делал это не как "новую систему", а как **локальный веб-интерфейс поверх уже принятого file-based protocol**.

Это лучше всего стыкуется с текущим документом `local-claude-codex-mailbox-workflow.md`: source of truth остаются markdown-файлы mailbox, а веб-страница просто даёт удобный слой просмотра и действий. И это не должно ломать роль пользователя как моста и decision-maker из `workflow-role-distribution.md`.

## Что я бы рекомендовал

- **Лучший вариант**: локальный web UI с карточками "как в GitHub", но только как UI над `agent-mailbox/`.
- На карточке: `from`, `to`, `thread`, `status`, `created`, `reply_to`, ссылки на related files, badge `needs user decision` или `formal handoff required`.
- Колонки: `To Claude`, `To Codex`, `Archive`, плюс thread view справа.
- Действия: `reply`, `archive`, `open related file`, но эти действия должны писать **те же markdown-файлы**, а не отдельную БД.

## Чего бы я не делал

- не делал бы отдельный backend с собственной state model;
- не делал бы "live chat" между агентами;
- не добавлял бы автозапуск агентов из UI;
- не превращал бы UI в обход `Discrepancy -> stop -> wait`.

## Нормальный rollout

1. **Read-only dashboard**: рендерит карточки из папок mailbox.
2. **Safe actions**: reply/archive через ту же файловую схему.
3. **Helper layer**: validator, atomic `seq`, recovery, cached index.
4. Только потом думать о polish.

## Другие варианты и trade-offs

- **TUI**: надёжно, но хуже обзорность и thread navigation.
- **Просто файлы + Markdown preview**: минимально, но friction остаётся.
- **SQLite/app-first UI**: удобнее в будущем, но слишком рано и создаёт риск рассинхрона с файлами.

## Итог

**GH-like локальная веб-страница с карточками — это, по-моему, лучший следующий UX-слой**, если сохранить принцип:

**files are the protocol, web UI is the view/controller**.

Если нужно, следующим шагом можно набросать конкретный UI spec: экраны, карточки, поля, действия и минимальный backend contract.
