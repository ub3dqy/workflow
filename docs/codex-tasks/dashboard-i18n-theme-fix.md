# Dashboard i18n + Dark Theme + Refresh Fix — Execution Plan

> **Статус**: ready for execution (v2, revised after review)
>
> **Задача**: три UI-улучшения dashboard:
> 1. i18n: русский (основной) + английский (переключатель)
> 2. Тёмная тема с toggle
> 3. Fix: кнопка "Refresh now" визуально моргает при initial load / manual refresh

---

## Иерархия источников правды

1. **Офдока** — главная правда
2. **Реальное состояние кода** — вторая правда
3. **Этот план** — может содержать ошибки

---

## Doc verification table

| # | URL | Что проверить |
|---|-----|---------------|
| D1 | https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme | `prefers-color-scheme` media query для auto-detect системной темы |
| D2 | https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage | `localStorage.getItem/setItem` для сохранения выбора языка и темы |
| D3 | https://developer.mozilla.org/en-US/docs/Web/API/Window/matchMedia | `window.matchMedia("(prefers-color-scheme: dark)")` + `.addEventListener("change", ...)` для live-follow системной темы |

---

## Whitelist файлов

### Изменить

| # | Путь | Что меняется |
|---|------|-------------|
| W1 | `dashboard/src/App.jsx` | i18n strings, theme toggle, language toggle, refresh button fix, CSS dark theme |

### Report file (Codex заполняет)

| # | Путь |
|---|------|
| W2 | `docs/codex-tasks/dashboard-i18n-theme-fix-report.md` |

### Не трогать

- `dashboard/server.js`, `dashboard/src/api.js` — без изменений
- `scripts/*` — без изменений
- `dashboard/package.json` — без новых зависимостей
- Все `.md` файлы кроме report

---

## Changes

### Change 1: i18n — объект переводов

Добавить объект `translations` с двумя ключами `ru` и `en`.

Обязательные ключи (полный список — Codex добавляет любые пропущенные при проходе по JSX):

```js
const translations = {
  ru: {
    eyebrow: "Локальный дашборд mailbox",
    heading: "Просмотр и управление файловым протоколом.",
    subhead: "Файлы остаются источником правды. Дашборд читает, отвечает и архивирует сообщения через локальный API с обновлением каждые три секунды.",
    messages: "Сообщения",
    lastSync: "Обновлено",
    waitingForLoad: "Ожидание загрузки",
    refreshNow: "Обновить",
    refreshing: "Обновление...",
    mailboxEmpty: "Mailbox пуст",
    emptyHint: "Создайте первое сообщение как markdown-файл в",
    emptyHintOr: "или",
    emptyFrontmatterHint: "Frontmatter должен быть лёгким: отправитель, получатель, thread slug, UTC timestamp и опционально related files.",
    toClaude: "Для Claude",
    toCodex: "Для Codex",
    archive: "Архив",
    loading: "Загрузка...",
    noMessages: "Нет сообщений.",
    noTimestamp: "Нет даты",
    reply: "Ответить",
    replying: "Отправка...",
    archive_btn: "Архивировать",
    archiving: "Архивирование...",
    replyLabel: "Ответ",
    replyPlaceholder: "Введите ответ...",
    replyHint: "Ответы из UI отправляются как from: user, после чего исходное сообщение автоматически архивируется.",
    sendReply: "Отправить",
    sending: "Отправка...",
    cancel: "Отмена",
    apiError: "Ошибка API mailbox:",
    from: "От",
    to: "Кому",
    thread: "Тема",
    replyTo: "Ответ на",
    relatedFiles: "Связанные файлы",
    replyTargetError: "Получатель ответа должен быть Claude или Codex.",
    replyBodyError: "Текст ответа обязателен.",
    langSwitch: "EN",
    themeLight: "Светлая",
    themeDark: "Тёмная",
    themeAuto: "Авто"
  },
  en: {
    eyebrow: "Local mailbox dashboard",
    heading: "View and manage the file-based protocol.",
    subhead: "Files remain the source of truth. This dashboard can view, reply to, and archive mailbox messages through the local API while polling every three seconds.",
    messages: "Messages",
    lastSync: "Last sync",
    waitingForLoad: "Waiting for first load",
    refreshNow: "Refresh now",
    refreshing: "Refreshing...",
    mailboxEmpty: "Mailbox is empty",
    emptyHint: "Create the first message as a markdown file in",
    emptyHintOr: "or",
    emptyFrontmatterHint: "Frontmatter should stay lightweight: sender, recipient, thread slug, UTC timestamp, and optional related files.",
    toClaude: "To Claude",
    toCodex: "To Codex",
    archive: "Archive",
    loading: "Loading mailbox state...",
    noMessages: "No messages in this bucket yet.",
    noTimestamp: "No timestamp",
    reply: "Reply",
    replying: "Replying...",
    archive_btn: "Archive",
    archiving: "Archiving...",
    replyLabel: "Reply",
    replyPlaceholder: "Type your reply...",
    replyHint: "UI-initiated replies are sent as from: user and then the current inbox message is archived in the same client flow.",
    sendReply: "Send reply",
    sending: "Sending...",
    cancel: "Cancel",
    apiError: "Mailbox API error:",
    from: "From",
    to: "To",
    thread: "Thread",
    replyTo: "Reply to",
    relatedFiles: "Related files",
    replyTargetError: "Reply target must be Claude or Codex.",
    replyBodyError: "Reply body is required.",
    langSwitch: "RU",
    themeLight: "Light",
    themeDark: "Dark",
    themeAuto: "Auto"
  }
};
```

Дополнительные строки, которые план мог пропустить — Codex обязан пройти ВЕСЬ JSX и найти все hardcoded strings. Если строка не покрыта ключом — добавить в translations object.

**Правила для protocol values:**
- `pending`, `archived`, `answered`, `no-reply-needed`, `superseded` — **не переводить**. Это protocol status из frontmatter, не UI-лейблы. Показывать raw.
- Thread slug, filename, relativePath — raw, не переводить.

**Timestamp locale:**
- При `lang === "ru"` использовать `"ru-RU"` в `Intl.DateTimeFormat`
- При `lang === "en"` использовать `"en-GB"` (текущее поведение)
- `"No timestamp"` → `t.noTimestamp`

**Client-side validation errors:**
- `"Reply target must be Claude or Codex."` → `t.replyTargetError`
- `"Reply body is required."` → `t.replyBodyError`

State: `const [lang, setLang] = useState(() => localStorage.getItem("mailbox-lang") || "ru")`.

При переключении: `localStorage.setItem("mailbox-lang", nextLang)`.

`const t = translations[lang]`.

Column titles: `columns` вычисляется из `t` (не из static const).

`[OFFICIAL-D2]` — localStorage.

### Change 2: Dark theme

CSS через CSS custom properties + `[data-theme="dark"]` selector.

**CSS structure:**
```css
:root {
  --bg-page: ...;
  --text-primary: ...;
  --card-bg: ...;
  /* все текущие цвета как custom properties */
}

:root[data-theme="dark"] {
  --bg-page: ...;
  --text-primary: ...;
  --card-bg: ...;
  /* тёмные overrides */
}
```

Все inline CSS значения в styles const заменить на `var(--name)`.

**Тёмная палитра** (ориентир, Codex может скорректировать):
- Background: `#1a1a1a` → `#242424` gradient
- Text: `#e8e0d4`
- Cards: `rgba(40, 36, 30, 0.82)`
- Borders: `rgba(200, 180, 150, 0.12)`
- Chips/pills: `#3a3228` с `color: #c8b89a`
- Code block: `#0d0d0d`

**State:** `const [theme, setTheme] = useState(() => localStorage.getItem("mailbox-theme") || "auto")`.

Три значения: `"light"`, `"dark"`, `"auto"`.

**Resolved theme:** Для apply нужно вычислить `resolvedTheme`:
- `"light"` или `"dark"` → use as-is
- `"auto"` → read from `window.matchMedia("(prefers-color-scheme: dark)").matches`

**Live-follow системной темы (auto mode):**
- В useEffect при `theme === "auto"` подписаться на `window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", handler)`
- При change — пересчитать resolved theme и обновить `document.documentElement.dataset.theme`
- Cleanup: `removeEventListener` в return
- `[OFFICIAL-D3]` — matchMedia change listener

**Apply:** через useEffect, зависящий от `[theme]` + matchMedia listener:
1. `document.documentElement.dataset.theme = resolvedTheme`
2. **Синхронизировать `color-scheme`**: `document.documentElement.style.colorScheme = resolvedTheme`. Текущий код имеет `color-scheme: light` hardcoded в `:root` (App.jsx:19). Без этой синхронизации нативные controls (scrollbars, checkboxes, input borders) останутся светлыми в dark mode.

**No light-flash on reload:** При первом рендере resolved theme должен вычисляться **до** первого paint. Если тема в localStorage = "dark", `:root[data-theme="dark"]` должен применяться сразу. Варианты:
- Inline `<script>` в `index.html` до React mount (не в scope App.jsx — out of scope)
- Или: `useState` initializer вычисляет resolved theme синхронно, и первый `useEffect` ставит `data-theme` немедленно. Flash может быть на 1 frame — допустимо для localhost dashboard.

**Theme toggle UI:** segmented control (три кнопки `Light | Dark | Auto` в одном контейнере). Не dropdown, не cycle-button. Активная кнопка визуально выделена.

**Accessibility:** segmented control должен иметь:
- `role="group"` на контейнере + `aria-label` (например `"Theme"` / `"Тема"` из translations)
- `aria-pressed="true"` на активной кнопке, `aria-pressed="false"` на остальных
- Аналогично для language toggle: `aria-pressed` на текущем языке

`[OFFICIAL-D1]` — prefers-color-scheme.
`[OFFICIAL-D2]` — localStorage.
`[OFFICIAL-D3]` — matchMedia change event.

### Change 3: Fix refresh button visual flash

**Корректный диагноз:** Кнопка моргает **не из-за 3-second polling** (polling использует `background: true`, который не ставит `isRefreshing`). Моргание происходит при:
- **Initial load**: useEffect → `refreshMessages({ signal })` → `isRefreshing: true` → fetch → `isRefreshing: false`. В React StrictMode (dev) это может вызвать двойной flash.
- **Manual refresh**: пользователь нажимает кнопку → opacity 0.72 → fetch → opacity 1.0.

**Фикс:** Убрать визуальное изменение opacity на disabled state. Text label (`"Обновление..."` / `"Refreshing..."`) достаточен как feedback:

```css
.refreshButton:disabled {
  cursor: progress;
  pointer-events: none;
  /* НЕ менять opacity, НЕ менять box-shadow — нет visual flash */
}
```

Это убирает flash и при initial load, и при manual refresh.

---

## Verification phases

### Phase 1 — Codex self-check

| # | Test | Expected |
|---|------|----------|
| V1 | Default language = русский | UI starts in Russian, all labels in RU |
| V2 | Language toggle works | Click → EN texts, click again → RU |
| V3 | Language persists | Reload page → same language from localStorage |
| V4 | Timestamp locale follows lang | RU → `ru-RU` format, EN → `en-GB` format |
| V5 | Protocol values NOT translated | status chip shows raw `pending`/`archived` |
| V6 | Client-side errors in current lang | Open reply, submit empty → error in RU |
| V7 | Dark theme via segmented control | Click "Тёмная" → dark background, light text |
| V8 | Theme persists | Reload page → same theme from localStorage |
| V9 | Auto theme follows system live | Set "Авто" → change OS theme → UI follows without page reload |
| V10 | Refresh button: no opacity blink | Initial load → button text changes but no opacity flash |
| V11 | Manual refresh still works | Click "Обновить" → data refreshes, no flash |
| V12 | Reply form labels in current lang | Open reply → labels, placeholder, hints match lang |
| V13 | vite build | exit 0 |
| V14 | personal data scan | clean |
| V15 | absolute paths scan | clean |

### Phase 2 — `[awaits user]`

| # | Test | Description |
|---|------|-------------|
| V16 | Visual quality | Пользователь проверяет dark theme |
| V17 | UX flow | Reply + archive в обоих языках |

---

## Acceptance criteria

- [ ] Русский язык по умолчанию
- [ ] Все UI строки переведены (hero, columns, buttons, forms, empty state, errors, "No timestamp")
- [ ] Protocol values (`pending`, `archived`) показываются raw, без перевода
- [ ] Timestamp locale: `ru-RU` при RU, `en-GB` при EN
- [ ] Client-side validation errors переведены
- [ ] Toggle язык RU ↔ EN, сохраняется в localStorage
- [ ] Dark theme с CSS custom properties
- [ ] Segmented control: Light / Dark / Auto
- [ ] Auto mode: live-follow через `matchMedia("change")` listener
- [ ] Theme сохраняется в localStorage
- [ ] Refresh button: no opacity/box-shadow change on disabled
- [ ] vite build без ошибок
- [ ] Нет новых npm зависимостей
- [ ] Нет personal data, нет абсолютных путей

---

## Out of scope

- RTL layout
- Больше двух языков
- Per-component lazy loading переводов
- Theme customization beyond light/dark/auto
- i18n for server-side API error messages
- Inline script в index.html для zero-flash dark theme (1-frame flash допустим)
- Архитектурный вопрос о мультипроекте (вынесен в отдельный follow-up)

---

## Rollback

Если нужно откатить изменения, создать новый коммит с revert, не использовать `git checkout --` в dirty worktree.

---

## Notes для Codex

1. **Один файл**: все изменения в `dashboard/src/App.jsx`. Не создавать отдельные i18n/theme файлы.
2. **CSS custom properties**: определить в `:root` (light) и `:root[data-theme="dark"]` (dark). Все цвета через `var(--name)`.
3. **Не ломать existing layout**: карточки, grid, кнопки — только замена текстов и цветов.
4. **localStorage keys**: `"mailbox-lang"` и `"mailbox-theme"`.
5. **Empty state code block**: не переводить — это пример frontmatter.
6. **Column titles**: вычислять из `t`, не из static const.
7. **Пройти ВЕСЬ JSX**: если нашёл hardcoded string не покрытый translations — добавить ключ.
8. **Theme toggle = segmented control** (три кнопки в одном контейнере), не dropdown и не cycle.
9. **matchMedia listener**: cleanup в useEffect return. Не забыть removeEventListener.


## Legacy Workflow Note (2026-04-21)

This file is preserved as a historical artifact from an earlier workflow revision.

It may mention legacy patterns such as `Claude planner / Codex executor`, user relay, `compact prompt`, or older handoff shapes.

Do not use it as the live operating template. Current contract: `docs/codex-system-prompt.md`, `AGENTS.md`, `workflow-role-distribution.md`, `workflow-instructions-claude.md`, and `workflow-instructions-codex.md`.
