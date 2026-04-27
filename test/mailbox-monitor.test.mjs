import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  formatNotification,
  runMonitor,
  scanPendingMessages
} from "../scripts/mailbox-monitor.mjs";

test("mailbox monitor scans only unread messages for the explicit project", async () => {
  const mailboxRoot = await makeMailboxRoot();

  await writeMessage(mailboxRoot, "to-claude", "sample__2026-04-26T20-00-00Z-monitor-codex-001.md", {
    id: "2026-04-26T20-00-00Z-codex-001",
    from: "codex",
    to: "claude",
    thread: "monitor",
    project: "sample",
    status: "pending",
    created: "2026-04-26T20:00:00Z"
  });
  await writeMessage(mailboxRoot, "to-claude", "sample__2026-04-26T20-01-00Z-monitor-codex-002.md", {
    id: "2026-04-26T20-01-00Z-codex-002",
    from: "codex",
    to: "claude",
    thread: "monitor",
    project: "sample",
    status: "pending",
    created: "2026-04-26T20:01:00Z",
    received_at: "2026-04-26T20:02:00Z"
  });
  await writeMessage(mailboxRoot, "to-claude", "other__2026-04-26T20-03-00Z-monitor-codex-001.md", {
    from: "codex",
    to: "claude",
    thread: "monitor",
    project: "other",
    status: "pending",
    created: "2026-04-26T20:03:00Z"
  });
  await writeMessage(mailboxRoot, "to-claude", "legacy-no-project-prefix.md", {
    from: "codex",
    to: "claude",
    thread: "monitor",
    project: "sample",
    status: "pending",
    created: "2026-04-26T20:04:00Z"
  });

  const messages = await scanPendingMessages({
    mailboxRoot,
    bucketName: "to-claude",
    project: "sample"
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].relativePath, "to-claude/sample__2026-04-26T20-00-00Z-monitor-codex-001.md");
  assert.equal(messages[0].thread, "monitor");
  assert.equal(messages[0].from, "codex");
});

test("mailbox monitor notification is short and points to normal pickup command", () => {
  const output = formatNotification(
    [
      {
        relativePath: "to-claude/sample__2026-04-26T20-00-00Z-monitor-codex-001.md",
        thread: "monitor",
        from: "codex",
        created: "2026-04-26T20:00:00Z"
      }
    ],
    { project: "sample", bucketName: "to-claude" }
  );

  assert.match(output, /^WORKFLOW_MAILBOX_PENDING /);
  assert.match(output, /project=sample/);
  assert.match(output, /recipient=claude/);
  assert.match(output, /unread=1/);
  assert.match(output, /action="node scripts\/mailbox\.mjs list --bucket to-claude --project sample"/);
});

test("mailbox monitor one-shot run prints unread state without mutating the message", async () => {
  const mailboxRoot = await makeMailboxRoot();
  const filename = "sample__2026-04-26T20-05-00Z-monitor-codex-001.md";
  const filePath = await writeMessage(mailboxRoot, "to-claude", filename, {
    id: "2026-04-26T20-05-00Z-codex-001",
    from: "codex",
    to: "claude",
    thread: "monitor",
    project: "sample",
    status: "pending",
    created: "2026-04-26T20:05:00Z"
  });

  const lines = [];
  const originalLog = console.log;
  try {
    console.log = (line) => {
      lines.push(line);
    };
    await runMonitor({
      project: "sample",
      bucketName: "to-claude",
      mailboxRoot,
      intervalMs: 1000,
      once: true
    });
  } finally {
    console.log = originalLog;
  }

  const stdout = lines.join("\n");
  const after = await fs.readFile(filePath, "utf8");
  assert.match(stdout, /WORKFLOW_MAILBOX_PENDING/);
  assert.match(stdout, new RegExp(filename));
  assert.doesNotMatch(after, /received_at:/);
});

async function makeMailboxRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-mailbox-monitor-"));
  await fs.mkdir(path.join(root, "to-claude"), { recursive: true });
  await fs.mkdir(path.join(root, "to-codex"), { recursive: true });
  return root;
}

async function writeMessage(mailboxRoot, bucketName, filename, fields) {
  const filePath = path.join(mailboxRoot, bucketName, filename);
  const frontmatter = Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  await fs.writeFile(filePath, `---\n${frontmatter}\n---\n\nBody\n`, "utf8");
  return filePath;
}
