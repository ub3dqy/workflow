import { useEffect, useEffectEvent, useState } from "react";
import { fetchMessages } from "./api.js";

const pollIntervalMs = 3000;
const emptyData = {
  toClaude: [],
  toCodex: [],
  archive: []
};

const columns = [
  { key: "toClaude", title: "To Claude" },
  { key: "toCodex", title: "To Codex" },
  { key: "archive", title: "Archive" }
];

const styles = `
  :root {
    color-scheme: light;
    font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
    background:
      radial-gradient(circle at top left, #f4efe4 0%, transparent 38%),
      linear-gradient(180deg, #f7f6f2 0%, #ece7db 100%);
    color: #1f1a14;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    min-height: 100vh;
  }

  button {
    font: inherit;
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
    color: #7a5d39;
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
    color: #534538;
    line-height: 1.5;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
  }

  .stat {
    min-width: 132px;
    padding: 12px 14px;
    border: 1px solid rgba(61, 45, 25, 0.12);
    border-radius: 16px;
    background: rgba(255, 251, 243, 0.82);
    box-shadow: 0 12px 30px rgba(73, 56, 34, 0.08);
  }

  .statLabel {
    display: block;
    margin-bottom: 6px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #7a5d39;
  }

  .statValue {
    display: block;
    font-size: 14px;
    color: #2a241d;
  }

  .refreshButton {
    border: 0;
    border-radius: 999px;
    padding: 12px 18px;
    font-weight: 700;
    background: #2f5a51;
    color: #f6f1e7;
    box-shadow: 0 14px 26px rgba(26, 49, 44, 0.18);
    cursor: pointer;
    transition: transform 140ms ease, box-shadow 140ms ease;
  }

  .refreshButton:hover {
    transform: translateY(-1px);
    box-shadow: 0 16px 30px rgba(26, 49, 44, 0.22);
  }

  .refreshButton:disabled {
    cursor: progress;
    opacity: 0.72;
    transform: none;
    box-shadow: none;
  }

  .errorBanner {
    margin-bottom: 16px;
    padding: 14px 16px;
    border-radius: 14px;
    border: 1px solid rgba(166, 53, 37, 0.2);
    background: rgba(255, 234, 228, 0.92);
    color: #7c2d22;
  }

  .emptyState {
    padding: 32px;
    border: 1px dashed rgba(61, 45, 25, 0.25);
    border-radius: 24px;
    background: rgba(255, 251, 243, 0.75);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65);
  }

  .emptyState h2 {
    margin: 0 0 10px;
    font-size: 24px;
  }

  .emptyState p {
    margin: 0 0 10px;
    max-width: 760px;
    line-height: 1.6;
    color: #534538;
  }

  .codeBlock {
    margin-top: 16px;
    padding: 16px;
    border-radius: 16px;
    background: #1f1a14;
    color: #f8f4eb;
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
    border: 1px solid rgba(61, 45, 25, 0.12);
    border-radius: 24px;
    background: rgba(255, 251, 243, 0.82);
    box-shadow: 0 18px 40px rgba(73, 56, 34, 0.1);
    overflow: hidden;
  }

  .columnHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 20px;
    border-bottom: 1px solid rgba(61, 45, 25, 0.1);
    background: rgba(255, 255, 255, 0.52);
  }

  .columnHeader h2 {
    margin: 0;
    font-size: 17px;
  }

  .countPill {
    min-width: 32px;
    padding: 4px 10px;
    border-radius: 999px;
    background: #efe5d0;
    text-align: center;
    font-size: 12px;
    font-weight: 700;
    color: #5e4c37;
  }

  .columnBody {
    display: grid;
    gap: 14px;
    padding: 16px;
  }

  .columnHint {
    margin: 0;
    color: #6f6152;
    line-height: 1.5;
  }

  .card {
    border: 1px solid rgba(61, 45, 25, 0.1);
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.76);
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
    background: #efe5d0;
    font-size: 12px;
    font-weight: 700;
    color: #5e4c37;
  }

  .mono {
    font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
    font-size: 12px;
    color: #6f6152;
    word-break: break-all;
  }

  .timestamp {
    flex-shrink: 0;
    font-size: 12px;
    color: #6f6152;
  }

  .details {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 6px 10px;
    margin: 0;
  }

  .details dt {
    font-weight: 700;
    color: #5e4c37;
  }

  .details dd {
    margin: 0;
    color: #2a241d;
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
    color: #7a5d39;
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
    background: #f3efe6;
    color: #473b2f;
    word-break: break-all;
  }

  .body {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid rgba(61, 45, 25, 0.1);
    color: #2a241d;
    line-height: 1.6;
  }

  .body :first-child {
    margin-top: 0;
  }

  .body :last-child {
    margin-bottom: 0;
  }

  @media (max-width: 1120px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
`;

function formatTimestamp(value) {
  if (!value) {
    return "No timestamp";
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(new Date(parsed));
}

function MessageCard({ message }) {
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
        <div className="timestamp">{formatTimestamp(message.created)}</div>
      </header>

      <dl className="details">
        <dt>From</dt>
        <dd>{message.from || "—"}</dd>
        <dt>To</dt>
        <dd>{message.to || "—"}</dd>
        <dt>Thread</dt>
        <dd>{message.thread || "—"}</dd>
        <dt>Reply to</dt>
        <dd>{message.reply_to || "—"}</dd>
      </dl>

      {message.related_files.length > 0 ? (
        <div className="relatedFiles">
          <span className="relatedTitle">Related files</span>
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
    </article>
  );
}

export default function App() {
  const [messages, setMessages] = useState(emptyData);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");

  const refreshMessages = useEffectEvent(async ({ signal, background = false } = {}) => {
    if (!background) {
      setIsRefreshing(true);
    }

    try {
      const nextMessages = await fetchMessages(signal);
      setMessages({
        toClaude: Array.isArray(nextMessages.toClaude) ? nextMessages.toClaude : [],
        toCodex: Array.isArray(nextMessages.toCodex) ? nextMessages.toCodex : [],
        archive: Array.isArray(nextMessages.archive) ? nextMessages.archive : []
      });
      setError("");
      setLastUpdated(new Date().toISOString());
    } catch (loadError) {
      if (!(loadError instanceof DOMException && loadError.name === "AbortError")) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    } finally {
      setIsLoading(false);
      if (!background) {
        setIsRefreshing(false);
      }
    }
  });

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
              <p className="eyebrow">Local mailbox dashboard</p>
              <h1>Read-only view over the file-based protocol.</h1>
              <p className="subhead">
                Files remain the source of truth. This dashboard only reads mailbox
                markdown via the local API and refreshes every three seconds.
              </p>
            </div>

            <div className="toolbar">
              <div className="stat">
                <span className="statLabel">Messages</span>
                <span className="statValue">{totalMessages}</span>
              </div>
              <div className="stat">
                <span className="statLabel">Last sync</span>
                <span className="statValue">
                  {lastUpdated ? formatTimestamp(lastUpdated) : "Waiting for first load"}
                </span>
              </div>
              <button
                className="refreshButton"
                disabled={isRefreshing}
                onClick={() => {
                  void refreshMessages();
                }}
                type="button"
              >
                {isRefreshing ? "Refreshing..." : "Refresh now"}
              </button>
            </div>
          </section>

          {error ? (
            <div className="errorBanner">
              <strong>Mailbox API error:</strong> {error}
            </div>
          ) : null}

          {isEmpty && !isLoading ? (
            <section className="emptyState">
              <h2>Mailbox is empty</h2>
              <p>
                Create the first message as a markdown file in
                <code> agent-mailbox/to-claude/</code> or
                <code> agent-mailbox/to-codex/</code>. The dashboard will pick it up
                on the next polling cycle.
              </p>
              <p>
                Frontmatter should stay lightweight: sender, recipient, thread slug,
                UTC timestamp, and optional related files.
              </p>
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
                      {isLoading
                        ? "Loading mailbox state..."
                        : "No messages in this bucket yet."}
                    </p>
                  ) : (
                    messages[column.key].map((message) => (
                      <MessageCard key={message.relativePath} message={message} />
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
