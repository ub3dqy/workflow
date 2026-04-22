import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import {
  archiveMessage,
  fetchMessages,
  fetchRuntimeState,
  postNote
} from "./api.js";

marked.use({ breaks: true, gfm: true });

const pollIntervalMs = 10000;
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
    heading: "Mailbox",
    subhead: "Сообщения между Claude и Codex.",
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
    showExample: "Показать пример frontmatter",
    toClaude: "Для Claude",
    toCodex: "Для Codex",
    archive: "Архив",
    archiveShow: "Показать архив",
    archiveHide: "Скрыть архив",
    loading: "Загрузка...",
    noMessages: "Нет сообщений.",
    noTimestamp: "Нет даты",
    timestampSent: "Отправлено",
    timestampReceived: "Получено",
    notRead: "не прочитано",
    timestampAnswered: "Ответ отправлен",
    timestampArchived: "Отправлено в архив",
    statusAnswered: "Выполнено",
    statusNoReplyNeeded: "Закрыто без ответа",
    statusSuperseded: "Заменено",
    archiveButton: "Архивировать",
    archiving: "Архивирование...",
    sending: "Отправка...",
    cancel: "Отмена",
    apiError: "Ошибка API mailbox:",
    from: "От",
    to: "Кому",
    thread: "Тема",
    replyTo: "Ответ на",
    project: "Проект",
    allProjects: "Все проекты",
    relatedFiles: "Связанные файлы",
    languageSwitchLabel: "Сменить язык",
    langSwitch: "EN",
    themeGroupLabel: "Переключатель темы",
    themeLight: "Светлая",
    themeDark: "Тёмная",
    themeAuto: "Авто",
    soundMute: "Выключить звук уведомлений",
    soundUnmute: "Включить звук уведомлений",
    addNote: "Добавить заметку",
    addingNote: "Отправка...",
    noteLabel: "Заметка от пользователя",
    notePlaceholder: "Добавьте свой комментарий к карточке...",
    noteHint:
      "Заметка дописывается в конец сообщения как user-блок. Оригинальное сообщение агента не редактируется.",
    sendNote: "Сохранить заметку",
    noteBodyError: "Текст заметки обязателен.",
    noteTooLong: "Заметка не может превышать 4000 символов.",
    activeSessionsTitle: "Активные сессии",
    noActiveSessions: "Нет активных сессий.",
    pendingIndexTitle: "Незабранные сообщения",
    noPendingMessages: "Нет pending-сообщений.",
    supervisorHealthLabel: "Supervisor",
    supervisorLastTick: "Последний цикл"
  },
  en: {
    eyebrow: "Local mailbox dashboard",
    heading: "Mailbox",
    subhead: "Messages between Claude and Codex.",
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
    showExample: "Show frontmatter example",
    toClaude: "To Claude",
    toCodex: "To Codex",
    archive: "Archive",
    archiveShow: "Show archive",
    archiveHide: "Hide archive",
    loading: "Loading mailbox state...",
    noMessages: "No messages in this bucket yet.",
    noTimestamp: "No timestamp",
    timestampSent: "Sent",
    timestampReceived: "Received",
    notRead: "not read",
    timestampAnswered: "Replied at",
    timestampArchived: "Archived at",
    statusAnswered: "Completed",
    statusNoReplyNeeded: "Closed without reply",
    statusSuperseded: "Superseded",
    archiveButton: "Archive",
    archiving: "Archiving...",
    sending: "Sending...",
    cancel: "Cancel",
    apiError: "Mailbox API error:",
    from: "From",
    to: "To",
    thread: "Thread",
    replyTo: "Reply to",
    project: "Project",
    allProjects: "All projects",
    relatedFiles: "Related files",
    languageSwitchLabel: "Switch language",
    langSwitch: "RU",
    themeGroupLabel: "Theme switcher",
    themeLight: "Light",
    themeDark: "Dark",
    themeAuto: "Auto",
    soundMute: "Mute notification sound",
    soundUnmute: "Unmute notification sound",
    addNote: "Add note",
    addingNote: "Saving...",
    noteLabel: "User note",
    notePlaceholder: "Add your comment to the card...",
    noteHint:
      "Notes are appended to the end of the message as a user block. The original agent message is not edited.",
    sendNote: "Save note",
    noteBodyError: "Note body is required.",
    noteTooLong: "Note must be 4000 characters or fewer.",
    activeSessionsTitle: "Active sessions",
    noActiveSessions: "No active sessions.",
    pendingIndexTitle: "Undelivered messages",
    noPendingMessages: "No pending messages.",
    supervisorHealthLabel: "Supervisor",
    supervisorLastTick: "Last tick"
  }
};

let audioCtxSingleton = null;

function getAudioContext() {
  if (audioCtxSingleton) return audioCtxSingleton;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  audioCtxSingleton = new AudioCtx();
  return audioCtxSingleton;
}

function playNotificationChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
    // Pleasant rising arpeggio: C5 E5 G5 C6 (C major)
    const notes = [523.25, 659.25, 783.99, 1046.5];
    const noteSpacing = 0.4;
    const noteDuration = 1.0;
    const baseTime = ctx.currentTime + 0.05;
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const startTime = baseTime + i * noteSpacing;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.18, startTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration);
      osc.start(startTime);
      osc.stop(startTime + noteDuration);
    });
  } catch {}
}

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
    --text-primary: #f0e8db;
    --text-strong: #faf4ea;
    --text-secondary: #d6c4a8;
    --text-muted: #b9a892;
    --text-accent: #e4cfa8;
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
    --surface-control-active: #4a6f66;
    --surface-error: rgba(110, 44, 34, 0.9);
    --border-soft: rgba(210, 190, 155, 0.22);
    --border-subtle: rgba(210, 190, 155, 0.18);
    --border-strong: rgba(210, 190, 155, 0.28);
    --border-dashed: rgba(210, 190, 155, 0.32);
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
    font-size: clamp(28px, 3.2vw, 38px);
    line-height: 1.05;
    letter-spacing: -0.03em;
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
    gap: 16px;
  }

  .statsGroup {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .controlsGroup {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }

  .buttonCluster {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }

  .filterControl {
    display: grid;
    gap: 6px;
  }

  .filterLabel {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-accent);
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
  .soundButton,
  .projectSelect,
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

  .langButton,
  .soundButton {
    background: var(--surface-control);
    color: var(--text-strong);
    box-shadow: var(--button-outline-border);
  }

  .soundButton {
    padding: 10px 14px;
    font-size: 18px;
    line-height: 1;
  }

  .projectSelect {
    min-width: 180px;
    padding-inline-end: 40px;
    background: var(--surface-control);
    color: var(--text-strong);
    box-shadow: var(--button-outline-border);
    cursor: pointer;
  }

  .refreshButton {
    background: var(--button-primary-bg);
    color: var(--button-primary-text);
    box-shadow: var(--button-primary-shadow);
  }

  .langButton:hover,
  .soundButton:hover,
  .projectSelect:hover {
    transform: translateY(-1px);
  }

  .refreshButton:hover {
    /* No translateY: prevents hover-zone jitter loop when cursor sits near button edge */
    box-shadow: var(--button-primary-shadow-hover);
  }

  .langButton:disabled,
  .soundButton:disabled,
  .projectSelect:disabled,
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
    margin-top: 16px;
    padding: 14px 16px;
    border: 1px dashed var(--border-dashed);
    border-radius: 16px;
    background: var(--surface-empty);
    box-shadow: var(--shadow-inset);
  }

  .emptyHintLine {
    margin: 0;
    max-width: 860px;
    line-height: 1.55;
    color: var(--text-secondary);
    font-size: 14px;
  }

  .emptyDetails {
    margin-top: 14px;
  }

  .emptySummary {
    display: inline-block;
    padding: 6px 12px;
    border-radius: 999px;
    background: var(--surface-chip);
    color: var(--chip-text);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    cursor: pointer;
    user-select: none;
  }

  .emptyFrontmatterHint {
    margin: 10px 0 0;
    max-width: 760px;
    line-height: 1.55;
    color: var(--text-secondary);
    font-size: 13px;
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

  .runtimePanel {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin: 0 0 24px;
    padding: 16px;
    border: 1px solid var(--border-soft);
    border-radius: 16px;
    background: var(--surface-stat);
  }

  .runtimeBlock h2 {
    margin: 0 0 10px;
    font-size: 14px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-accent);
  }

  .runtimeList {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }

  .runtimeList li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }

  .supervisorFooter {
    grid-column: 1 / -1;
    margin: 0;
    font-size: 12px;
    color: var(--text-muted);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 18px;
    margin-top: 20px;
  }

  .column {
    min-height: 420px;
    max-height: calc(100vh - 240px);
    display: flex;
    flex-direction: column;
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
    flex-shrink: 0;
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
    overflow-y: auto;
    overflow-x: hidden;
    flex: 1;
    min-height: 0;
  }

  .columnHint {
    margin: 0;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .archiveToggle {
    width: 100%;
    padding: 14px 16px;
    font-size: 14px;
    font-weight: 600;
    background: var(--surface-control);
    color: var(--text-strong);
    box-shadow: var(--button-outline-border);
    border: 0;
    border-radius: 14px;
    cursor: pointer;
    text-align: center;
    transition: transform 120ms ease;
  }

  .archiveToggle:hover {
    transform: translateY(-1px);
  }

  .archiveToggle:focus-visible {
    outline: 2px solid var(--text-strong);
    outline-offset: 2px;
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
    margin-bottom: 10px;
    cursor: pointer;
    user-select: none;
  }

  .cardHeader:focus-visible {
    outline: 2px solid var(--text-strong);
    outline-offset: 2px;
    border-radius: 6px;
  }

  .cardHeader:hover .threadTitle {
    text-decoration: underline;
    text-decoration-color: var(--text-muted);
    text-underline-offset: 3px;
  }

  .expandIndicator {
    flex-shrink: 0;
    color: var(--text-muted);
    font-size: 14px;
    line-height: 1.25;
    margin-left: 8px;
  }

  .bodyPreview {
    margin: 0;
    color: var(--text-muted);
    line-height: 1.4;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cardHeading {
    min-width: 0;
    flex: 1;
  }

  .threadTitle {
    margin: 0 0 6px;
    font-size: 17px;
    line-height: 1.25;
    letter-spacing: -0.01em;
    word-break: break-word;
  }

  .cardTags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 3px 10px;
    background: var(--surface-chip);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--chip-text);
  }

  .chipProject {
    background: var(--surface-control-active);
    color: var(--button-primary-text);
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

  .cardTimestamps {
    display: grid;
    gap: 4px;
    margin: 10px 0 12px;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--surface-control);
    border: 1px solid var(--border-subtle);
    font-size: 12px;
    color: var(--text-muted);
  }

  .timestampLabel {
    font-weight: 700;
    color: var(--text-accent);
  }

  .notReadBadge {
    color: #c06600;
    font-weight: 500;
    font-style: italic;
  }

  .cardMeta {
    margin: 0 0 6px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    font-size: 13px;
    color: var(--text-strong);
  }

  .metaPart {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .metaFrom,
  .metaTo {
    font-weight: 600;
  }

  .metaArrow {
    color: var(--text-muted);
  }

  .metaSep {
    color: var(--text-muted);
  }

  .cardFilename {
    margin: 0;
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
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .body :first-child {
    margin-top: 0;
  }

  .body :last-child {
    margin-bottom: 0;
  }

  .body p,
  .body li {
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .body pre,
  .body code {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
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
    padding: 9px 16px;
    font-size: 13px;
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

  .cardButton--primary,
  .replyButton,
  .sendButton {
    background: var(--button-primary-bg);
    color: var(--button-primary-text);
    box-shadow: var(--button-reply-shadow);
  }

  .cardButton--secondary,
  .archiveButton {
    background: var(--button-archive-bg);
    color: var(--button-archive-text);
    box-shadow: var(--button-archive-border);
  }

  .cardButton--ghost,
  .cancelButton {
    background: transparent;
    color: var(--button-outline-text);
    box-shadow: var(--button-outline-border);
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

  /* sendButton / cancelButton styles moved to .cardButton--primary / --ghost aliases */

  @media (max-width: 1280px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 900px) {
    .hero {
      flex-direction: column;
      align-items: stretch;
    }

    .cardHeader {
      flex-direction: column;
      align-items: stretch;
    }

    .cardTimestamps {
      align-items: flex-start;
    }

    .toolbar {
      justify-content: flex-start;
      gap: 12px;
    }

    .controlsGroup {
      flex: 1 1 100%;
      gap: 10px;
      align-items: flex-end;
    }

    .filterControl {
      flex: 1 1 180px;
      min-width: 0;
    }

    .projectSelect {
      width: 100%;
    }

    .buttonCluster {
      flex: 0 0 auto;
      justify-content: flex-end;
    }

    .statsGroup {
      flex: 1;
    }

    .runtimePanel {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 560px) {
    .controlsGroup {
      flex-direction: column;
      align-items: stretch;
    }

    .buttonCluster {
      width: 100%;
      justify-content: space-between;
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

function getStoredText(key, fallback = "") {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
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
    timeStyle: "short"
  }).format(new Date(parsed));
}

function MessageCard({
  activeAction,
  expanded,
  isNoteOpen,
  lang,
  message,
  onArchive,
  onCancelNote,
  onNoteBodyChange,
  onOpenNote,
  onSendNote,
  onToggleExpanded,
  noteBody,
  showActions,
  t
}) {
  const isNoting = activeAction === `note:${message.relativePath}`;
  const isArchiving = activeAction === `archive:${message.relativePath}`;
  const disableArchive = Boolean(activeAction);
  const disableNote = Boolean(activeAction) || isNoteOpen;
  const noteFormRef = useRef(null);

  useEffect(() => {
    if (isNoteOpen && noteFormRef.current) {
      noteFormRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [isNoteOpen]);

  const renderActionRow = () => (
    <div className="actionRow">
      {showActions ? (
        <>
          <button
            className="cardButton cardButton--secondary"
            disabled={disableArchive}
            onClick={() => {
              onArchive(message);
            }}
            type="button"
          >
            {isArchiving ? t.archiving : t.archiveButton}
          </button>
        </>
      ) : null}
      <button
        className="cardButton cardButton--secondary"
        disabled={disableNote}
        onClick={() => {
          onOpenNote(message);
        }}
        type="button"
      >
        {isNoting ? t.addingNote : t.addNote}
      </button>
    </div>
  );

  const isArchived = !showActions;

  const bodyPreview = useMemo(() => {
    if (!message.body) return "";
    const firstLine = message.body.split("\n").find((line) => line.trim().length > 0) || "";
    const trimmed = firstLine.trim();
    return trimmed.length > 160 ? `${trimmed.slice(0, 160)}…` : trimmed;
  }, [message.body]);

  const renderedHtml = useMemo(() => {
    if (!expanded || !message.body) return "";
    return String(marked.parse(message.body));
  }, [expanded, message.body]);

  const handleHeaderKey = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onToggleExpanded(message.relativePath);
    }
  };

  return (
    <article className="card">
      <header
        className="cardHeader"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => onToggleExpanded(message.relativePath)}
        onKeyDown={handleHeaderKey}
      >
        <div className="cardHeading">
          <h3 className="threadTitle">{message.thread || "—"}</h3>
          <div className="cardTags">
            {isArchived ? (
              <span className="chip">
                {message.resolution === "answered"
                  ? t.statusAnswered
                  : message.resolution === "no-reply-needed"
                    ? t.statusNoReplyNeeded
                    : message.resolution === "superseded"
                      ? t.statusSuperseded
                      : message.resolution || message.status || "archived"}
              </span>
            ) : null}
            {message.project ? (
              <span className="chip chipProject">{message.project}</span>
            ) : null}
          </div>
        </div>
        <span className="expandIndicator" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
      </header>

      <p className="cardMeta">
        <span className="metaPart">
          <span className="metaFrom">{message.from || "?"}</span>
          <span className="metaArrow">→</span>
          <span className="metaTo">{message.to || "?"}</span>
        </span>
        {message.reply_to ? (
          <>
            <span className="metaSep">·</span>
            <span className="metaPart mono">
              {t.replyTo}: {message.reply_to}
            </span>
          </>
        ) : null}
      </p>

      <p className="cardFilename mono">{message.relativePath}</p>

      <div className="cardTimestamps">
        <span className="timestamp">
          <span className="timestampLabel">{t.timestampSent}:</span>{" "}
          {formatTimestamp(message.created, lang, t)}
        </span>
        <span className="timestamp">
          <span className="timestampLabel">{t.timestampReceived}:</span>{" "}
          {message.metadata?.received_at ? (
            formatTimestamp(message.metadata.received_at, lang, t)
          ) : (
            <span className="notReadBadge">{t.notRead}</span>
          )}
        </span>
        {message.answered_at ? (
          <span className="timestamp">
            <span className="timestampLabel">{t.timestampAnswered}:</span>{" "}
            {formatTimestamp(message.answered_at, lang, t)}
          </span>
        ) : null}
        {message.metadata?.archived_at ? (
          <span className="timestamp">
            <span className="timestampLabel">{t.timestampArchived}:</span>{" "}
            {formatTimestamp(message.metadata.archived_at, lang, t)}
          </span>
        ) : null}
      </div>

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

      {renderActionRow()}

      {message.body ? (
        expanded ? (
          <section
            className="body"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        ) : (
          <p className="bodyPreview">{bodyPreview}</p>
        )
      ) : null}

      {renderActionRow()}

      {isNoteOpen ? (
        <form
          className="replyForm"
          ref={noteFormRef}
          onSubmit={(event) => {
            event.preventDefault();
            onSendNote(message);
          }}
        >
          <label className="replyLabel" htmlFor={`note-${message.relativePath}`}>
            {t.noteLabel}
          </label>
          <textarea
            className="replyTextarea"
            id={`note-${message.relativePath}`}
            onChange={(event) => {
              onNoteBodyChange(event.target.value);
            }}
            placeholder={t.notePlaceholder}
            value={noteBody}
          />
          <p className="replyHint">{t.noteHint}</p>
          <div className="replyActions">
            <button
              className="cardButton cardButton--primary"
              disabled={Boolean(activeAction)}
              type="submit"
            >
              {isNoting ? t.addingNote : t.sendNote}
            </button>
            <button
              className="cardButton cardButton--ghost"
              disabled={Boolean(activeAction)}
              onClick={onCancelNote}
              type="button"
            >
              {t.cancel}
            </button>
          </div>
        </form>
      ) : null}
    </article>
  );
}

export default function App() {
  const [runtimeState, setRuntimeState] = useState({
    activeSessions: [],
    pendingIndex: [],
    supervisorHealth: { lastTickAt: null, tickErrors: 0 }
  });
  const [messages, setMessages] = useState(emptyData);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");
  const [noteTargetPath, setNoteTargetPath] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [activeAction, setActiveAction] = useState("");
  const [availableProjects, setAvailableProjects] = useState([]);
  const [archiveExpanded, setArchiveExpanded] = useState(false);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [lang, setLang] = useState(() =>
    getStoredValue("mailbox-lang", "ru", supportedLanguages)
  );
  const [project, setProject] = useState(() => getStoredText("mailbox-project", ""));
  const [theme, setTheme] = useState(() =>
    getStoredValue("mailbox-theme", "auto", supportedThemes)
  );
  const [systemPrefersDark, setSystemPrefersDark] = useState(() =>
    getSystemPrefersDark()
  );
  const [soundEnabled, setSoundEnabled] = useState(
    () => getStoredText("mailbox-sound", "on") !== "off"
  );
  const prevPendingCountsRef = useRef(null);

  const toggleExpanded = useCallback((relPath) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(relPath)) next.delete(relPath);
      else next.add(relPath);
      return next;
    });
  }, []);

  // Shared poll overlap guard (Stage 1 dashboard-perf). Both the messages
  // refresh helper and the runtime-state load helper own per-stream
  // AbortControllers so that every call-site — timer ticks, initial mount,
  // action handlers, manual refresh button — aborts any in-flight request
  // before issuing the next one. Monotonic request ids drop stale responses
  // that arrive after a newer request has started (belt-and-suspenders for
  // slow aborts). See docs/codex-tasks/dashboard-perf-s1-poll-guard.md.
  const messagesAbortRef = useRef(null);
  const messagesReqIdRef = useRef(0);
  // Tracks the reqId of the most-recent foreground refresh so that
  // isRefreshing can be released safely when a background tick preempts
  // an in-flight foreground refresh (Codex round-3 Mandatory fix).
  const messagesForegroundIdRef = useRef(0);
  const runtimeAbortRef = useRef(null);
  const runtimeReqIdRef = useRef(0);

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
      window.localStorage.setItem("mailbox-project", project);
    } catch {}
  }, [project]);

  useEffect(() => {
    setArchiveExpanded(false);
  }, [project]);

  useEffect(() => {
    async function load() {
      // Abort any in-flight runtime-state fetch before starting a new one.
      if (runtimeAbortRef.current && !runtimeAbortRef.current.signal.aborted) {
        runtimeAbortRef.current.abort();
      }
      const controller = new AbortController();
      runtimeAbortRef.current = controller;
      const localId = ++runtimeReqIdRef.current;

      try {
        const data = await fetchRuntimeState({ signal: controller.signal });
        if (localId !== runtimeReqIdRef.current) return; // stale-drop
        setRuntimeState({
          activeSessions: Array.isArray(data.activeSessions)
            ? data.activeSessions
            : [],
          pendingIndex: Array.isArray(data.pendingIndex) ? data.pendingIndex : [],
          supervisorHealth: data.supervisorHealth || {
            lastTickAt: null,
            tickErrors: 0
          }
        });
      } catch (loadError) {
        if (!(loadError instanceof DOMException && loadError.name === "AbortError")) {
          // Runtime visibility is non-fatal for the main dashboard.
        }
      }
    }

    void load();
    const intervalId = window.setInterval(load, pollIntervalMs);

    return () => {
      runtimeAbortRef.current?.abort();
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("mailbox-theme", theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    try {
      window.localStorage.setItem("mailbox-sound", soundEnabled ? "on" : "off");
    } catch {}
  }, [soundEnabled]);

  // WebAudio unlock: resume the singleton AudioContext on first user gesture so that
  // subsequent playNotificationChime() invocations (triggered by polling, not gesture)
  // play reliably. Browser autoplay-policy requires resume() в user-gesture callback.
  useEffect(() => {
    let unlocked = false;
    const unlock = () => {
      if (unlocked) return;
      unlocked = true;
      try {
        const ctx = getAudioContext();
        if (ctx && ctx.state === "suspended") {
          void ctx.resume().catch(() => {});
        }
      } catch {}
      document.removeEventListener("click", unlock);
      document.removeEventListener("keydown", unlock);
      document.removeEventListener("touchstart", unlock);
    };
    document.addEventListener("click", unlock);
    document.addEventListener("keydown", unlock);
    document.addEventListener("touchstart", unlock);
    return () => {
      document.removeEventListener("click", unlock);
      document.removeEventListener("keydown", unlock);
      document.removeEventListener("touchstart", unlock);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const pendingCount = messages.toClaude.length + messages.toCodex.length;
    document.title = pendingCount > 0 ? `(${pendingCount}) Mailbox Dashboard` : "Mailbox Dashboard";
  }, [messages.toClaude.length, messages.toCodex.length]);

  useEffect(() => {
    const toClaudeCount = messages.toClaude.length;
    const toCodexCount = messages.toCodex.length;
    const prev = prevPendingCountsRef.current;
    prevPendingCountsRef.current = { toClaude: toClaudeCount, toCodex: toCodexCount };

    if (prev === null) {
      return;
    }

    const increased =
      toClaudeCount > prev.toClaude || toCodexCount > prev.toCodex;
    if (increased && soundEnabled) {
      playNotificationChime();
    }
  }, [messages.toClaude.length, messages.toCodex.length, soundEnabled]);

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
    async ({ background = false } = {}) => {
      // Shared overlap guard: abort in-flight fetch (if any) before starting
      // a new one; monotonic request id drops a stale response that resolves
      // after a newer call has started. Every call site — timer ticks,
      // initial mount, action handlers, manual refresh button — flows
      // through this helper, so all invocations share the same guard.
      if (
        messagesAbortRef.current &&
        !messagesAbortRef.current.signal.aborted
      ) {
        messagesAbortRef.current.abort();
      }
      const controller = new AbortController();
      messagesAbortRef.current = controller;
      const localId = ++messagesReqIdRef.current;

      if (!background) {
        messagesForegroundIdRef.current = localId;
        setIsRefreshing(true);
      }

      try {
        const nextMessages = await fetchMessages({
          signal: controller.signal,
          project
        });
        if (localId !== messagesReqIdRef.current) return; // stale-drop
        const nextProjects = Array.isArray(nextMessages.projects)
          ? nextMessages.projects.filter(
              (value) => typeof value === "string" && value.trim().length > 0
            )
          : [];
        setMessages({
          toClaude: Array.isArray(nextMessages.toClaude)
            ? nextMessages.toClaude
            : [],
          toCodex: Array.isArray(nextMessages.toCodex)
            ? nextMessages.toCodex
            : [],
          archive: Array.isArray(nextMessages.archive) ? nextMessages.archive : []
        });
        setAvailableProjects(nextProjects);
        setProject((currentProject) =>
          currentProject && !nextProjects.includes(currentProject)
            ? ""
            : currentProject
        );
        setError("");
        setLastUpdated(new Date().toISOString());
      } catch (loadError) {
        if (
          !(loadError instanceof DOMException && loadError.name === "AbortError")
        ) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        // Release the foreground UI lock whenever THIS call is the most
        // recent foreground refresh — even if it was preempted by a
        // background tick. Any newer foreground call would have bumped
        // messagesForegroundIdRef; only the latest foreground owns the
        // lock, so releasing it here is correct (no-op if another
        // foreground is already active).
        if (!background && messagesForegroundIdRef.current === localId) {
          setIsRefreshing(false);
        }
        // Initial-load marker: clear only on non-stale completion (keeps
        // the pre-fix behavior where `isLoading` transitions true→false
        // exactly once, on the first successful fetch).
        if (localId === messagesReqIdRef.current) {
          setIsLoading(false);
        }
      }
    }
  );

  useEffect(() => {
    // Project change → re-mount of this effect → cleanup aborts any
    // in-flight fetch (via messagesAbortRef) before the fresh effect
    // starts the initial fetch for the new project.
    void refreshMessages();

    const intervalId = window.setInterval(() => {
      void refreshMessages({ background: true });
    }, pollIntervalMs);

    return () => {
      messagesAbortRef.current?.abort();
      window.clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // refreshMessages is a useEffectEvent (stable identity by design); including it в deps
    // causes infinite re-mount loop если React's useEffectEvent identity isn't perfectly stable.
  }, [project]);

  const openNote = useEffectEvent((message) => {
    setError("");
    setNoteTargetPath(message.relativePath);
    setNoteBody("");
  });

  const cancelNote = useEffectEvent(() => {
    if (activeAction) {
      return;
    }

    setNoteTargetPath("");
    setNoteBody("");
  });

  const toggleLanguage = useEffectEvent(() => {
    setLang((currentLang) => (currentLang === "ru" ? "en" : "ru"));
  });

  const archiveInboxMessage = useEffectEvent(async (message) => {
    setActiveAction(`archive:${message.relativePath}`);

    try {
      await archiveMessage({
        relativePath: message.relativePath,
        resolution: "no-reply-needed"
      });
      if (noteTargetPath === message.relativePath) {
        setNoteTargetPath("");
        setNoteBody("");
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

  const sendNote = useEffectEvent(async (message) => {
    const trimmed = noteBody.trim();

    if (!trimmed) {
      setError(t.noteBodyError);
      return;
    }

    if (trimmed.length > 4000) {
      setError(t.noteTooLong);
      return;
    }

    setActiveAction(`note:${message.relativePath}`);

    try {
      await postNote({
        relativePath: message.relativePath,
        note: trimmed
      });
      setNoteTargetPath("");
      setNoteBody("");
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
              <div className="statsGroup">
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
              </div>

              <div className="controlsGroup">
                <label className="filterControl">
                  <span className="filterLabel">{t.project}</span>
                  <select
                    className="projectSelect"
                    onChange={(event) => {
                      setProject(event.target.value);
                    }}
                    value={project}
                  >
                    <option value="">{t.allProjects}</option>
                    {availableProjects.map((projectOption) => (
                      <option key={projectOption} value={projectOption}>
                        {projectOption}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="buttonCluster">
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

                  <button
                    aria-label={soundEnabled ? t.soundMute : t.soundUnmute}
                    aria-pressed={soundEnabled}
                    className="soundButton"
                    onClick={() => {
                      setSoundEnabled((current) => !current);
                    }}
                    title={soundEnabled ? t.soundMute : t.soundUnmute}
                    type="button"
                  >
                    {soundEnabled ? "🔊" : "🔇"}
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
                    aria-busy={isRefreshing}
                    className="refreshButton"
                    disabled={isRefreshing}
                    onClick={() => {
                      void refreshMessages();
                    }}
                    type="button"
                  >
                    {t.refreshNow}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="runtimePanel">
            <div className="runtimeBlock">
              <h2>{t.activeSessionsTitle}</h2>
              {runtimeState.activeSessions.length === 0 ? (
                <p className="columnHint">{t.noActiveSessions}</p>
              ) : (
                <ul className="runtimeList">
                  {runtimeState.activeSessions.map((session) => (
                    <li key={session.session_id}>
                      <span className="chip">{session.agent}</span>
                      <span className="chip chipProject">{session.project}</span>
                      <span className="mono">{session.session_id}</span>
                      <span className="timestamp">
                        {formatTimestamp(session.last_seen, lang, t)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="runtimeBlock">
              <h2>
                {t.pendingIndexTitle} ({runtimeState.pendingIndex.length})
              </h2>
              {runtimeState.pendingIndex.length === 0 ? (
                <p className="columnHint">{t.noPendingMessages}</p>
              ) : (
                <ul className="runtimeList">
                  {runtimeState.pendingIndex.map((message) => (
                    <li key={message.relativePath}>
                      <span className="chip">{message.to}</span>
                      {message.project ? (
                        <span className="chip chipProject">{message.project}</span>
                      ) : null}
                      <span className="mono">{message.thread}</span>
                      <span className="timestamp">
                        {formatTimestamp(message.created, lang, t)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="supervisorFooter">
              <strong>{t.supervisorHealthLabel}</strong>
              {" · "}
              {t.supervisorLastTick}:{" "}
              {runtimeState.supervisorHealth.lastTickAt
                ? formatTimestamp(runtimeState.supervisorHealth.lastTickAt, lang, t)
                : "—"}
            </p>
          </section>

          {error ? (
            <div className="errorBanner">
              <strong>{t.apiError}</strong> {error}
            </div>
          ) : null}

          <section className="grid">
            {columns.map((column) => (
              <section className="column" key={column.key}>
                <header className="columnHeader">
                  <h2>{column.title}</h2>
                  <span className="countPill">{messages[column.key].length}</span>
                </header>

                <div className="columnBody">
                  {column.key === "archive" && !archiveExpanded && messages.archive.length > 0 ? (
                    <button
                      type="button"
                      className="archiveToggle"
                      onClick={() => setArchiveExpanded(true)}
                    >
                      {t.archiveShow} ({messages.archive.length})
                    </button>
                  ) : (
                    <>
                      {column.key === "archive" && archiveExpanded ? (
                        <button
                          type="button"
                          className="archiveToggle"
                          onClick={() => setArchiveExpanded(false)}
                        >
                          {t.archiveHide}
                        </button>
                      ) : null}
                      {messages[column.key].length === 0 ? (
                        <p className="columnHint">
                          {isLoading ? t.loading : t.noMessages}
                        </p>
                      ) : (
                        messages[column.key].map((message) => (
                          <MessageCard
                            activeAction={activeAction}
                            expanded={expandedIds.has(message.relativePath)}
                            isNoteOpen={noteTargetPath === message.relativePath}
                            key={message.relativePath}
                            lang={lang}
                            message={message}
                            onArchive={archiveInboxMessage}
                            onCancelNote={cancelNote}
                            onNoteBodyChange={setNoteBody}
                            onOpenNote={openNote}
                            onSendNote={sendNote}
                            onToggleExpanded={toggleExpanded}
                            noteBody={
                              noteTargetPath === message.relativePath ? noteBody : ""
                            }
                            showActions={column.key !== "archive"}
                            t={t}
                          />
                        ))
                      )}
                    </>
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
