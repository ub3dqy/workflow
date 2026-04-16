import { useEffect, useEffectEvent, useState } from "react";
import { archiveMessage, fetchMessages, postReply } from "./api.js";

const pollIntervalMs = 3000;
const emptyData = {
  toClaude: [],
  toCodex: [],
  archive: []
};
const supportedLanguages = new Set(["ru", "en"]);
const supportedThemes = new Set(["light", "dark", "auto"]);
const translations = {
  ru: {
    eyebrow: "Локальный дашборд mailbox",
    heading: "Просмотр и управление файловым протоколом.",
    subhead:
      "Файлы остаются источником правды. Дашборд читает, отвечает и архивирует сообщения через локальный API с обновлением каждые три секунды.",
    messages: "Сообщения",
    lastSync: "Обновлено",
    waitingForLoad: "Ожидание загрузки",
    refreshNow: "Обновить",
    refreshing: "Обновление...",
    mailboxEmpty: "Mailbox пуст",
    emptyHint: "Создайте первое сообщение как markdown-файл в",
    emptyHintOr: "или",
    emptyPollingHint: "Дашборд подхватит его на следующем цикле обновления.",
    emptyFrontmatterHint:
      "Frontmatter должен быть лёгким: отправитель, получатель, thread slug, UTC timestamp и опционально related files.",
    toClaude: "Для Claude",
    toCodex: "Для Codex",
    archive: "Архив",
    loading: "Загрузка...",
    noMessages: "Нет сообщений.",
    noTimestamp: "Нет даты",
    reply: "Ответить",
    replying: "Отправка...",
    archiveButton: "Архивировать",
    archiving: "Архивирование...",
    replyLabel: "Ответ",
    replyPlaceholder: "Введите ответ...",
    replyHint:
      "Ответы из UI отправляются как from: user, после чего исходное сообщение автоматически архивируется.",
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
    languageSwitchLabel: "Сменить язык",
    langSwitch: "EN",
    themeGroupLabel: "Переключатель темы",
    themeLight: "Светлая",
    themeDark: "Тёмная",
    themeAuto: "Авто"
  },
  en: {
    eyebrow: "Local mailbox dashboard",
    heading: "View and manage the file-based protocol.",
    subhead:
      "Files remain the source of truth. This dashboard can view, reply to, and archive mailbox messages through the local API while polling every three seconds.",
    messages: "Messages",
    lastSync: "Last sync",
    waitingForLoad: "Waiting for first load",
    refreshNow: "Refresh now",
    refreshing: "Refreshing...",
    mailboxEmpty: "Mailbox is empty",
    emptyHint: "Create the first message as a markdown file in",
    emptyHintOr: "or",
    emptyPollingHint:
      "The dashboard will pick it up on the next polling cycle.",
    emptyFrontmatterHint:
      "Frontmatter should stay lightweight: sender, recipient, thread slug, UTC timestamp, and optional related files.",
    toClaude: "To Claude",
    toCodex: "To Codex",
    archive: "Archive",
    loading: "Loading mailbox state...",
    noMessages: "No messages in this bucket yet.",
    noTimestamp: "No timestamp",
    reply: "Reply",
    replying: "Replying...",
    archiveButton: "Archive",
    archiving: "Archiving...",
    replyLabel: "Reply",
    replyPlaceholder: "Type your reply...",
    replyHint:
      "UI-initiated replies are sent as from: user and then the current inbox message is archived in the same client flow.",
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
    languageSwitchLabel: "Switch language",
    langSwitch: "RU",
    themeGroupLabel: "Theme switcher",
    themeLight: "Light",
    themeDark: "Dark",
    themeAuto: "Auto"
  }
};
const styles = `
  :root {
    color-scheme: light;
    font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
    --bg-radial: #f4efe4;
    --bg-linear-start: #f7f6f2;
    --bg-linear-end: #ece7db;
    --text-primary: #1f1a14;
    --text-strong: #2a241d;
    --text-secondary: #534538;
    --text-muted: #6f6152;
    --text-accent: #7a5d39;
    --text-error: #7c2d22;
    --surface-stat: rgba(255, 251, 243, 0.82);
    --surface-column: rgba(255, 251, 243, 0.82);
    --surface-card: rgba(255, 255, 255, 0.76);
    --surface-header: rgba(255, 255, 255, 0.52);
    --surface-empty: rgba(255, 251, 243, 0.75);
    --surface-chip: #efe5d0;
    --surface-path: #f3efe6;
    --surface-code: #1f1a14;
    --surface-textarea: #fffdfa;
    --surface-control: rgba(255, 251, 243, 0.92);
    --surface-control-active: #2f5a51;
    --surface-error: rgba(255, 234, 228, 0.92);
    --border-soft: rgba(61, 45, 25, 0.12);
    --border-subtle: rgba(61, 45, 25, 0.1);
    --border-strong: rgba(61, 45, 25, 0.18);
    --border-dashed: rgba(61, 45, 25, 0.25);
    --border-error: rgba(166, 53, 37, 0.2);
    --chip-text: #5e4c37;
    --path-text: #473b2f;
    --code-text: #f8f4eb;
    --button-primary-bg: #2f5a51;
    --button-primary-text: #f6f1e7;
    --button-primary-shadow: 0 14px 26px rgba(26, 49, 44, 0.18);
    --button-primary-shadow-hover: 0 16px 30px rgba(26, 49, 44, 0.22);
    --button-reply-shadow: 0 12px 24px rgba(26, 49, 44, 0.16);
    --button-send-bg: #8c4f2a;
    --button-send-text: #fff6eb;
    --button-send-shadow: 0 12px 24px rgba(91, 51, 26, 0.14);
    --button-archive-bg: #e8ded0;
    --button-archive-text: #46392b;
    --button-archive-border: inset 0 0 0 1px rgba(61, 45, 25, 0.08);
    --button-outline-text: #5e4c37;
    --button-outline-border: inset 0 0 0 1px rgba(61, 45, 25, 0.14);
    --shadow-stat: 0 12px 30px rgba(73, 56, 34, 0.08);
    --shadow-column: 0 18px 40px rgba(73, 56, 34, 0.1);
    --shadow-inset: inset 0 1px 0 rgba(255, 255, 255, 0.65);
    --focus-ring: rgba(47, 90, 81, 0.2);
  }

  :root[data-theme="dark"] {
    color-scheme: dark;
    --bg-radial: #2d241c;
    --bg-linear-start: #1a1a1a;
    --bg-linear-end: #242424;
    --text-primary: #e8e0d4;
    --text-strong: #f1eadf;
    --text-secondary: #c8b89a;
    --text-muted: #a99885;
    --text-accent: #d3bc95;
    --text-error: #ffd5cc;
    --surface-stat: rgba(40, 36, 30, 0.82);
    --surface-column: rgba(36, 32, 28, 0.88);
    --surface-card: rgba(45, 40, 34, 0.88);
    --surface-header: rgba(56, 50, 42, 0.68);
    --surface-empty: rgba(38, 34, 29, 0.82);
    --surface-chip: #3a3228;
    --surface-path: #332c24;
    --surface-code: #0d0d0d;
    --surface-textarea: #24211d;
    --surface-control: rgba(40, 36, 30, 0.92);
    --surface-control-active: #8c4f2a;
    --surface-error: rgba(110, 44, 34, 0.9);
    --border-soft: rgba(200, 180, 150, 0.12);
    --border-subtle: rgba(200, 180, 150, 0.1);
    --border-strong: rgba(200, 180, 150, 0.18);
    --border-dashed: rgba(200, 180, 150, 0.22);
    --border-error: rgba(255, 191, 174, 0.2);
    --chip-text: #c8b89a;
    --path-text: #d8c7b0;
    --code-text: #f5efe5;
    --button-primary-bg: #4a6f66;
    --button-primary-text: #f7f2e9;
    --button-primary-shadow: 0 14px 26px rgba(0, 0, 0, 0.28);
    --button-primary-shadow-hover: 0 16px 30px rgba(0, 0, 0, 0.34);
    --button-reply-shadow: 0 12px 24px rgba(0, 0, 0, 0.24);
    --button-send-bg: #a56035;
    --button-send-text: #fff6eb;
    --button-send-shadow: 0 12px 24px rgba(0, 0, 0, 0.26);
    --button-archive-bg: #4a4035;
    --button-archive-text: #f0e3cf;
    --button-archive-border: inset 0 0 0 1px rgba(200, 180, 150, 0.12);
    --button-outline-text: #d6c5ad;
    --button-outline-border: inset 0 0 0 1px rgba(200, 180, 150, 0.16);
    --shadow-stat: 0 12px 30px rgba(0, 0, 0, 0.22);
    --shadow-column: 0 18px 40px rgba(0, 0, 0, 0.28);
    --shadow-inset: inset 0 1px 0 rgba(255, 255, 255, 0.05);
    --focus-ring: rgba(140, 96, 53, 0.28);
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    min-height: 100vh;
    background:
      radial-gradient(circle at top left, var(--bg-radial) 0%, transparent 38%),
      linear-gradient(180deg, var(--bg-linear-start) 0%, var(--bg-linear-end) 100%);
    color: var(--text-primary);
  }

  button {
    font: inherit;
  }

  code {
    font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
  }

  .page {
    min-height: 100vh;
    padding: 32px 24px 40px;
  }

  .shell {
    max-width: 1440px;
    margin: 0 auto;
  }

  .hero {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 24px;
  }

  .eyebrow {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--text-accent);
  }

  h1 {
    margin: 0;
    font-size: clamp(32px, 5vw, 54px);
    line-height: 0.95;
    letter-spacing: -0.04em;
  }

  .subhead {
    margin: 12px 0 0;
    max-width: 720px;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
  }

  .toolbarControls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
  }

  .stat {
    min-width: 132px;
    padding: 12px 14px;
    border: 1px solid var(--border-soft);
    border-radius: 16px;
    background: var(--surface-stat);
    box-shadow: var(--shadow-stat);
  }

  .statLabel {
    display: block;
    margin-bottom: 6px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-accent);
  }

  .statValue {
    display: block;
    font-size: 14px;
    color: var(--text-strong);
  }

  .langButton,
  .refreshButton {
    border: 0;
    border-radius: 999px;
    padding: 12px 18px;
    font-weight: 700;
    cursor: pointer;
    transition:
      transform 140ms ease,
      box-shadow 140ms ease,
      background 140ms ease,
      color 140ms ease;
  }

  .langButton {
    background: var(--surface-control);
    color: var(--text-strong);
    box-shadow: var(--button-outline-border);
  }

  .refreshButton {
    background: var(--button-primary-bg);
    color: var(--button-primary-text);
    box-shadow: var(--button-primary-shadow);
  }

  .langButton:hover,
  .refreshButton:hover {
    transform: translateY(-1px);
  }

  .refreshButton:hover {
    box-shadow: var(--button-primary-shadow-hover);
  }

  .langButton:disabled,
  .refreshButton:disabled {
    cursor: progress;
    pointer-events: none;
    transform: none;
  }

  .segmentedControl {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px;
    border: 1px solid var(--border-soft);
    border-radius: 999px;
    background: var(--surface-control);
    box-shadow: var(--shadow-inset);
  }

  .segmentButton {
    border: 0;
    border-radius: 999px;
    padding: 10px 14px;
    font-weight: 700;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition:
      background 140ms ease,
      color 140ms ease,
      transform 140ms ease,
      box-shadow 140ms ease;
  }

  .segmentButton:hover {
    transform: translateY(-1px);
  }

  .segmentButtonActive {
    background: var(--surface-control-active);
    color: var(--button-primary-text);
    box-shadow: var(--button-primary-shadow);
  }

  .errorBanner {
    margin-bottom: 16px;
    padding: 14px 16px;
    border-radius: 14px;
    border: 1px solid var(--border-error);
    background: var(--surface-error);
    color: var(--text-error);
  }

  .emptyState {
    padding: 32px;
    border: 1px dashed var(--border-dashed);
    border-radius: 24px;
    background: var(--surface-empty);
    box-shadow: var(--shadow-inset);
  }

  .emptyState h2 {
    margin: 0 0 10px;
    font-size: 24px;
  }

  .emptyState p {
    margin: 0 0 10px;
    max-width: 760px;
    line-height: 1.6;
    color: var(--text-secondary);
  }

  .codeBlock {
    margin-top: 16px;
    padding: 16px;
    border-radius: 16px;
    background: var(--surface-code);
    color: var(--code-text);
    overflow-x: auto;
    font-size: 13px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 18px;
    margin-top: 20px;
  }

  .column {
    min-height: 420px;
    border: 1px solid var(--border-soft);
    border-radius: 24px;
    background: var(--surface-column);
    box-shadow: var(--shadow-column);
    overflow: hidden;
  }

  .columnHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 20px;
    border-bottom: 1px solid var(--border-subtle);
    background: var(--surface-header);
  }

  .columnHeader h2 {
    margin: 0;
    font-size: 17px;
  }

  .countPill {
    min-width: 32px;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--surface-chip);
    text-align: center;
    font-size: 12px;
    font-weight: 700;
    color: var(--chip-text);
  }

  .columnBody {
    display: grid;
    gap: 14px;
    padding: 16px;
  }

  .columnHint {
    margin: 0;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .card {
    border: 1px solid var(--border-subtle);
    border-radius: 18px;
    background: var(--surface-card);
    padding: 16px;
  }

  .cardHeader {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 12px;
  }

  .filename {
    margin: 0 0 6px;
    font-size: 16px;
    line-height: 1.2;
  }

  .metaRow {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 4px 10px;
    background: var(--surface-chip);
    font-size: 12px;
    font-weight: 700;
    color: var(--chip-text);
  }

  .mono {
    font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
    font-size: 12px;
    color: var(--text-muted);
    word-break: break-all;
  }

  .timestamp {
    flex-shrink: 0;
    font-size: 12px;
    color: var(--text-muted);
  }

  .details {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 6px 10px;
    margin: 0;
  }

  .details dt {
    font-weight: 700;
    color: var(--chip-text);
  }

  .details dd {
    margin: 0;
    color: var(--text-strong);
    word-break: break-word;
  }

  .relatedFiles {
    margin-top: 14px;
  }

  .relatedTitle {
    display: block;
    margin-bottom: 8px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-accent);
  }

  .relatedList {
    display: grid;
    gap: 8px;
  }

  .pathChip {
    display: inline-flex;
    width: fit-content;
    max-width: 100%;
    padding: 6px 10px;
    border-radius: 12px;
    background: var(--surface-path);
    color: var(--path-text);
    word-break: break-all;
  }

  .body {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--border-subtle);
    color: var(--text-strong);
    line-height: 1.6;
  }

  .body :first-child {
    margin-top: 0;
  }

  .body :last-child {
    margin-bottom: 0;
  }

  .actionRow {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 16px;
  }

  .cardButton {
    border: 0;
    border-radius: 999px;
    padding: 10px 14px;
    font-weight: 700;
    cursor: pointer;
    transition: transform 140ms ease, opacity 140ms ease, box-shadow 140ms ease;
  }

  .cardButton:hover {
    transform: translateY(-1px);
  }

  .cardButton:disabled {
    cursor: progress;
    opacity: 0.7;
    transform: none;
    box-shadow: none;
  }

  .replyButton {
    background: var(--button-primary-bg);
    color: var(--button-primary-text);
    box-shadow: var(--button-reply-shadow);
  }

  .archiveButton {
    background: var(--button-archive-bg);
    color: var(--button-archive-text);
    box-shadow: var(--button-archive-border);
  }

  .replyForm {
    display: grid;
    gap: 12px;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--border-subtle);
  }

  .replyLabel {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-accent);
  }

  .replyTextarea {
    min-height: 132px;
    width: 100%;
    resize: vertical;
    border: 1px solid var(--border-strong);
    border-radius: 16px;
    padding: 12px 14px;
    background: var(--surface-textarea);
    color: var(--text-strong);
    font: inherit;
    line-height: 1.5;
  }

  .replyTextarea:focus {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .replyHint {
    margin: 0;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .replyActions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .sendButton {
    background: var(--button-send-bg);
    color: var(--button-send-text);
    box-shadow: var(--button-send-shadow);
  }

  .cancelButton {
    background: transparent;
    color: var(--button-outline-text);
    box-shadow: var(--button-outline-border);
  }

  @media (max-width: 1120px) {
    .grid {
      grid-template-columns: 1fr;
    }

    .toolbar {
      justify-content: flex-start;
    }
  }
`;

function getStoredValue(key, fallback, allowedValues) {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const storedValue = window.localStorage.getItem(key);
    if (storedValue && allowedValues.has(storedValue)) {
      return storedValue;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function getSystemPrefersDark() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getColumns(t) {
  return [
    { key: "toClaude", title: t.toClaude },
    { key: "toCodex", title: t.toCodex },
    { key: "archive", title: t.archive }
  ];
}

function formatTimestamp(value, lang, t) {
  if (!value) {
    return t.noTimestamp;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  const locale = lang === "ru" ? "ru-RU" : "en-GB";

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(new Date(parsed));
}

function getReplyTarget(message) {
  if (message.from === "claude" || message.from === "codex") {
    return message.from;
  }

  if (message.to === "claude" || message.to === "codex") {
    return message.to;
  }

  return "";
}

function MessageCard({
  activeAction,
  isReplyOpen,
  lang,
  message,
  onArchive,
  onCancelReply,
  onOpenReply,
  onReplyBodyChange,
  onSendReply,
  replyBody,
  showActions,
  t
}) {
  const replyTarget = getReplyTarget(message);
  const isReplying = activeAction === `reply:${message.relativePath}`;
  const isArchiving = activeAction === `archive:${message.relativePath}`;
  const disableArchive = Boolean(activeAction);
  const disableReply = Boolean(activeAction) || !replyTarget;

  return (
    <article className="card">
      <header className="cardHeader">
        <div>
          <h3 className="filename">{message.filename}</h3>
          <div className="metaRow">
            <span className="chip">{message.status || "pending"}</span>
            <span className="mono">{message.relativePath}</span>
          </div>
        </div>
        <div className="timestamp">{formatTimestamp(message.created, lang, t)}</div>
      </header>

      <dl className="details">
        <dt>{t.from}</dt>
        <dd>{message.from || "—"}</dd>
        <dt>{t.to}</dt>
        <dd>{message.to || "—"}</dd>
        <dt>{t.thread}</dt>
        <dd>{message.thread || "—"}</dd>
        <dt>{t.replyTo}</dt>
        <dd>{message.reply_to || "—"}</dd>
      </dl>

      {message.related_files.length > 0 ? (
        <div className="relatedFiles">
          <span className="relatedTitle">{t.relatedFiles}</span>
          <div className="relatedList">
            {message.related_files.map((relatedFile) => (
              <span className="pathChip mono" key={relatedFile}>
                {relatedFile}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {message.html ? (
        <section
          className="body"
          dangerouslySetInnerHTML={{ __html: message.html }}
        />
      ) : null}

      {showActions ? (
        <>
          <div className="actionRow">
            <button
              className="cardButton replyButton"
              disabled={disableReply}
              onClick={() => {
                onOpenReply(message);
              }}
              type="button"
            >
              {isReplying ? t.replying : t.reply}
            </button>
            <button
              className="cardButton archiveButton"
              disabled={disableArchive}
              onClick={() => {
                onArchive(message);
              }}
              type="button"
            >
              {isArchiving ? t.archiving : t.archiveButton}
            </button>
          </div>

          {isReplyOpen ? (
            <form
              className="replyForm"
              onSubmit={(event) => {
                event.preventDefault();
                onSendReply(message);
              }}
            >
              <label className="replyLabel" htmlFor={`reply-${message.relativePath}`}>
                {t.replyLabel}
              </label>
              <textarea
                className="replyTextarea"
                id={`reply-${message.relativePath}`}
                onChange={(event) => {
                  onReplyBodyChange(event.target.value);
                }}
                placeholder={t.replyPlaceholder}
                value={replyBody}
              />
              <p className="replyHint">
                {t.replyHint}
              </p>
              <div className="replyActions">
                <button
                  className="cardButton sendButton"
                  disabled={Boolean(activeAction)}
                  type="submit"
                >
                  {isReplying ? t.sending : t.sendReply}
                </button>
                <button
                  className="cardButton cancelButton"
                  disabled={Boolean(activeAction)}
                  onClick={onCancelReply}
                  type="button"
                >
                  {t.cancel}
                </button>
              </div>
            </form>
          ) : null}
        </>
      ) : null}
    </article>
  );
}

export default function App() {
  const [messages, setMessages] = useState(emptyData);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");
  const [replyTargetPath, setReplyTargetPath] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [activeAction, setActiveAction] = useState("");
  const [lang, setLang] = useState(() =>
    getStoredValue("mailbox-lang", "ru", supportedLanguages)
  );
  const [theme, setTheme] = useState(() =>
    getStoredValue("mailbox-theme", "auto", supportedThemes)
  );
  const [systemPrefersDark, setSystemPrefersDark] = useState(() =>
    getSystemPrefersDark()
  );

  const t = translations[lang] ?? translations.ru;
  const columns = getColumns(t);
  const resolvedTheme =
    theme === "auto" ? (systemPrefersDark ? "dark" : "light") : theme;

  useEffect(() => {
    try {
      window.localStorage.setItem("mailbox-lang", lang);
    } catch {}
  }, [lang]);

  useEffect(() => {
    try {
      window.localStorage.setItem("mailbox-theme", theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    if (theme !== "auto" || typeof window === "undefined") {
      return;
    }

    const mediaQueryList = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemPrefersDark(mediaQueryList.matches);

    const handleChange = (event) => {
      setSystemPrefersDark(event.matches);
    };

    if (typeof mediaQueryList.addEventListener === "function") {
      mediaQueryList.addEventListener("change", handleChange);
      return () => {
        mediaQueryList.removeEventListener("change", handleChange);
      };
    }

    mediaQueryList.addListener(handleChange);
    return () => {
      mediaQueryList.removeListener(handleChange);
    };
  }, [theme]);

  const refreshMessages = useEffectEvent(
    async ({ signal, background = false } = {}) => {
      if (!background) {
        setIsRefreshing(true);
      }

      try {
        const nextMessages = await fetchMessages(signal);
        setMessages({
          toClaude: Array.isArray(nextMessages.toClaude)
            ? nextMessages.toClaude
            : [],
          toCodex: Array.isArray(nextMessages.toCodex)
            ? nextMessages.toCodex
            : [],
          archive: Array.isArray(nextMessages.archive) ? nextMessages.archive : []
        });
        setError("");
        setLastUpdated(new Date().toISOString());
      } catch (loadError) {
        if (
          !(loadError instanceof DOMException && loadError.name === "AbortError")
        ) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        setIsLoading(false);
        if (!background) {
          setIsRefreshing(false);
        }
      }
    }
  );

  useEffect(() => {
    const controller = new AbortController();
    void refreshMessages({ signal: controller.signal });

    const intervalId = window.setInterval(() => {
      void refreshMessages({ background: true });
    }, pollIntervalMs);

    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [refreshMessages]);

  const openReply = useEffectEvent((message) => {
    setError("");
    setReplyTargetPath(message.relativePath);
    setReplyBody("");
  });

  const cancelReply = useEffectEvent(() => {
    if (activeAction) {
      return;
    }

    setReplyTargetPath("");
    setReplyBody("");
  });

  const toggleLanguage = useEffectEvent(() => {
    setLang((currentLang) => (currentLang === "ru" ? "en" : "ru"));
  });

  const sendReply = useEffectEvent(async (message) => {
    const target = getReplyTarget(message);
    const trimmedBody = replyBody.trim();

    if (!target) {
      setError(t.replyTargetError);
      return;
    }

    if (!trimmedBody) {
      setError(t.replyBodyError);
      return;
    }

    setActiveAction(`reply:${message.relativePath}`);

    try {
      await postReply({
        to: target,
        thread: message.thread,
        body: trimmedBody,
        replyTo:
          typeof message.metadata?.id === "string" ? message.metadata.id : undefined
      });
      await archiveMessage({
        relativePath: message.relativePath,
        resolution: "answered"
      });
      setReplyTargetPath("");
      setReplyBody("");
      setError("");
      await refreshMessages();
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : String(actionError)
      );
      await refreshMessages({ background: true });
    } finally {
      setActiveAction("");
    }
  });

  const archiveInboxMessage = useEffectEvent(async (message) => {
    setActiveAction(`archive:${message.relativePath}`);

    try {
      await archiveMessage({
        relativePath: message.relativePath,
        resolution: "no-reply-needed"
      });
      if (replyTargetPath === message.relativePath) {
        setReplyTargetPath("");
        setReplyBody("");
      }
      setError("");
      await refreshMessages();
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : String(actionError)
      );
      await refreshMessages({ background: true });
    } finally {
      setActiveAction("");
    }
  });

  const totalMessages =
    messages.toClaude.length + messages.toCodex.length + messages.archive.length;
  const isEmpty = totalMessages === 0;

  return (
    <>
      <style>{styles}</style>
      <main className="page">
        <div className="shell">
          <section className="hero">
            <div>
              <p className="eyebrow">{t.eyebrow}</p>
              <h1>{t.heading}</h1>
              <p className="subhead">{t.subhead}</p>
            </div>

            <div className="toolbar">
              <div className="stat">
                <span className="statLabel">{t.messages}</span>
                <span className="statValue">{totalMessages}</span>
              </div>
              <div className="stat">
                <span className="statLabel">{t.lastSync}</span>
                <span className="statValue">
                  {lastUpdated
                    ? formatTimestamp(lastUpdated, lang, t)
                    : t.waitingForLoad}
                </span>
              </div>

              <div className="toolbarControls">
                <button
                  aria-label={t.languageSwitchLabel}
                  className="langButton"
                  onClick={() => {
                    toggleLanguage();
                  }}
                  type="button"
                >
                  {t.langSwitch}
                </button>

                <div
                  aria-label={t.themeGroupLabel}
                  className="segmentedControl"
                  role="group"
                >
                  {[
                    { value: "light", label: t.themeLight },
                    { value: "dark", label: t.themeDark },
                    { value: "auto", label: t.themeAuto }
                  ].map((option) => (
                    <button
                      aria-pressed={theme === option.value}
                      className={`segmentButton${
                        theme === option.value ? " segmentButtonActive" : ""
                      }`}
                      key={option.value}
                      onClick={() => {
                        setTheme(option.value);
                      }}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <button
                  className="refreshButton"
                  disabled={isRefreshing}
                  onClick={() => {
                    void refreshMessages();
                  }}
                  type="button"
                >
                  {isRefreshing ? t.refreshing : t.refreshNow}
                </button>
              </div>
            </div>
          </section>

          {error ? (
            <div className="errorBanner">
              <strong>{t.apiError}</strong> {error}
            </div>
          ) : null}

          {isEmpty && !isLoading ? (
            <section className="emptyState">
              <h2>{t.mailboxEmpty}</h2>
              <p>
                {t.emptyHint}
                <code> agent-mailbox/to-claude/</code> {t.emptyHintOr}
                <code> agent-mailbox/to-codex/</code>. {t.emptyPollingHint}
              </p>
              <p>{t.emptyFrontmatterHint}</p>
              <pre className="codeBlock">{`---
from: claude
to: codex
thread: example-thread
status: pending
created: 2026-04-16T08:00:00Z
---

What should happen next?`}</pre>
            </section>
          ) : null}

          <section className="grid">
            {columns.map((column) => (
              <section className="column" key={column.key}>
                <header className="columnHeader">
                  <h2>{column.title}</h2>
                  <span className="countPill">{messages[column.key].length}</span>
                </header>

                <div className="columnBody">
                  {messages[column.key].length === 0 ? (
                    <p className="columnHint">
                      {isLoading ? t.loading : t.noMessages}
                    </p>
                  ) : (
                    messages[column.key].map((message) => (
                      <MessageCard
                        activeAction={activeAction}
                        isReplyOpen={replyTargetPath === message.relativePath}
                        key={message.relativePath}
                        lang={lang}
                        message={message}
                        onArchive={archiveInboxMessage}
                        onCancelReply={cancelReply}
                        onOpenReply={openReply}
                        onReplyBodyChange={setReplyBody}
                        onSendReply={sendReply}
                        replyBody={
                          replyTargetPath === message.relativePath ? replyBody : ""
                        }
                        showActions={column.key !== "archive"}
                        t={t}
                      />
                    ))
                  )}
                </div>
              </section>
            ))}
          </section>
        </div>
      </main>
    </>
  );
}
