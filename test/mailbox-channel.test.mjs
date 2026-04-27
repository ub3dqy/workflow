import test from "node:test";
import assert from "node:assert/strict";
import {
  createInitializeResult,
  formatChannelContent,
  formatChannelMeta,
  parseChannelArgs
} from "../scripts/mailbox-channel.mjs";

test("mailbox channel formats a workflow-safe event", () => {
  const messages = [
    {
      relativePath: "to-claude/workflow__2026-04-26T20-00-00Z-monitor-codex-001.md",
      thread: "monitor",
      from: "codex"
    }
  ];

  const content = formatChannelContent(messages, {
    project: "workflow",
    bucketName: "to-claude"
  });
  const meta = formatChannelMeta(messages, {
    project: "workflow",
    bucketName: "to-claude"
  });

  assert.match(content, /Mailbox reminder for project workflow/);
  assert.match(content, /AGENT_MAILBOX_PROJECT=workflow AGENT_MAILBOX_AGENT=claude workflow-mailbox list --bucket to-claude --project workflow/);
  assert.match(content, /Do not read files under agent-mailbox directly/);
  assert.match(content, /AGENT_MAILBOX_PROJECT=workflow AGENT_MAILBOX_AGENT=claude workflow-mailbox archive --path <relativePath> --project workflow --resolution no-reply-needed/);
  assert.match(content, /archive or reply in the same turn/);
  assert.deepEqual(meta, {
    project: "workflow",
    recipient: "claude",
    bucket: "to-claude",
    unread: "1",
    thread: "monitor",
    from: "codex",
    latest: "to-claude/workflow__2026-04-26T20-00-00Z-monitor-codex-001.md"
  });
});

test("mailbox channel declares the Claude channel capability", () => {
  const result = createInitializeResult({ protocolVersion: "2025-03-26" });

  assert.equal(result.protocolVersion, "2025-03-26");
  assert.deepEqual(result.capabilities.experimental["claude/channel"], {});
  assert.equal(result.serverInfo.name, "workflow-mailbox");
  assert.match(result.instructions, /normal mailbox CLI workflow/);
  assert.match(result.instructions, /AGENT_MAILBOX_PROJECT=<project> AGENT_MAILBOX_AGENT=claude workflow-mailbox archive --path <relativePath>/);
});

test("mailbox channel args support environment defaults and explicit bucket", () => {
  const options = parseChannelArgs(["--bucket", "to-codex", "--interval-ms", "50"], {
    WORKFLOW_MAILBOX_PROJECT: "workflow",
    WORKFLOW_MAILBOX_AGENT: "claude",
    WORKFLOW_MAILBOX_ROOT: "/tmp/workflow-mailbox"
  });

  assert.equal(options.project, "workflow");
  assert.equal(options.agent, "claude");
  assert.equal(options.bucketName, "to-codex");
  assert.equal(options.intervalMs, 1000);
  assert.equal(options.mailboxRoot, "/tmp/workflow-mailbox");
});

test("mailbox channel args fall back to cwd project slug", () => {
  const cwd = process.cwd();
  try {
    process.chdir("/tmp");
    const options = parseChannelArgs([], {});
    assert.equal(options.project, "tmp");
  } finally {
    process.chdir(cwd);
  }
});
