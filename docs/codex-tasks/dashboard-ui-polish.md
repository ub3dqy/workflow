# Dashboard UI Polish — 10-Stage Plan (Self-Execution)

> **Статус**: ready to execute
>
> **Исполнитель**: Claude (explicit override by user — "если ты нашёл, тебе и исправлять")
>
> **Задача**: исправить 10 UI-проблем, обнаруженных при визуальном ревью через Playwright.

---

## Whitelist

- `dashboard/src/App.jsx` — все изменения здесь

## Не трогать

- `dashboard/server.js`, `dashboard/src/api.js` — логика не меняется
- `scripts/*` — не трогаем
- `dashboard/package.json` — новых deps нет

---

## 10 этапов

### 1. Toolbar: объединить controls в одну группу
- Все кнопки управления (lang, theme, refresh) в один контейнер `controlsGroup`
- Stats (Messages/Last sync) отдельно слева
- Project filter рядом с controls, не разрывая

### 2. Hero: сократить текст
- Удалить техническое описание про polling/API из subhead
- h1 — короче: "Mailbox Dashboard" / "Дашборд Mailbox"
- subhead — одна строка: "Управление сообщениями между Claude и Codex"

### 3. Status chip: убрать из видимой области
- `pending` раздражает как постоянная плашка
- Показывать status только для archive (где это informational: `answered` / `no-reply-needed`)
- Для inbox — не показывать, pending и так implied

### 4. Filename → Thread + preview
- Заголовок карточки: `thread` slug (крупно)
- Filename уходит в `.mono` under title, мелко

### 5. Meta grid: свернуть в одну линию
- Вместо dt/dd grid `От|Кому|Тема|Ответ на` — одна строка:
  `from → to · thread · reply_to` (если есть)
- Экономит ~80px высоты карточки

### 6. Theme active state: убрать оранжевый
- Dark активная кнопка сейчас оранжевая (`#8c4f2a`) — выглядит как warning
- Заменить на основной accent: зелёный `#2f5a51` в обеих темах

### 7. Dark contrast: поднять борды и лейблы
- `.statLabel` / `.eyebrow` / `.relatedTitle` в dark — контраст 3:1 вместо текущего ~2:1
- Card borders: `rgba(200,180,150,0.22)` вместо `0.12`
- Column borders аналогично

### 8. Empty state: свернуть code block по умолчанию
- Показывать только заголовок + одна строка hint
- Code block — `<details>` свёрнутый по умолчанию, раскрывается по клику

### 9. Responsive breakpoint 1120px → 1280px + фикс mobile toolbar
- При < 1280px — grid становится column (уже есть), но toolbar всё ещё горизонтально
- Добавить медиа-query для toolbar: на `max-width: 900px` — wrap с gap
- Чтобы project filter не уходил на отдельную строку один

### 10. Button design system: унифицировать
- Три типа: `primary` (Send, Refresh, Reply), `secondary` (Archive, Cancel), `toggle` (lang, theme segments)
- Одни CSS classes, варьируются через modifier classes
- Убрать individual стили `sendButton`, `cancelButton`, `archiveButton` — оставить `cardButton` + modifier

---

## Verification

После каждого этапа:
- Snapshot (Playwright)
- Сравнение с предыдущим
- Vite build: exit 0

После всех 10:
- Personal data scan
- Absolute paths scan
- Final visual review в обеих темах, обоих языках, narrow + wide viewport

---

## Commit strategy

Один commit за раз, 10 коммитов. Это позволит откатить любой этап независимо.

Commit messages: `refactor(dashboard): <stage>` или `feat(dashboard): <stage>`


## Legacy Workflow Note (2026-04-21)

This file is preserved as a historical artifact from an earlier workflow revision.

It may mention legacy patterns such as `Claude planner / Codex executor`, user relay, `compact prompt`, or older handoff shapes.

Do not use it as the live operating template. Current contract: `docs/codex-system-prompt.md`, `AGENTS.md`, `workflow-role-distribution.md`, `workflow-instructions-claude.md`, and `workflow-instructions-codex.md`.
