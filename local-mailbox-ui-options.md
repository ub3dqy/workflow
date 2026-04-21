# Идея UI для mailbox workflow

UI допустим только как локальный слой над уже существующим mailbox protocol.

Ключевой принцип:

> **files are the protocol; the dashboard is only a view/controller**

## Что должно оставаться истинным

- Claude↔Codex coordination остаётся mailbox-only
- source of truth остаются mailbox files и tracked artifacts
- UI не становится вторым workflow contract
- UI не превращает пользователя в postman, но и не забирает у него роль decision gate

## Что я рекомендую

- локальный web UI поверх `agent-mailbox/`
- карточки с `from`, `to`, `thread`, `status`, `created`, `reply_to`, `project`
- ссылки на tracked files из `docs/codex-tasks/`
- явные badges вроде `needs codex review`, `awaiting claude update`, `awaiting user decision`

## Чего UI делать не должен

- хранить отдельную primary state model
- подменять mailbox write/read semantics
- запускать агентов автоматически
- делать live chat между агентами
- позволять скрыто переписывать scope, whitelist или design decisions

## Нормальный Rollout

1. Read-only dashboard
2. Safe actions over the same file protocol
3. Helper layer for validation/recovery/indexing
4. Потом polish

## Вывод

Лучший следующий UX-слой — GH-like локальная веб-страница, но только если она остаётся thin layer над текущим mailbox contract.
