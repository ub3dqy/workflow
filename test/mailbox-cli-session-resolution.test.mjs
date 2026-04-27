import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { toHostPath } from "../scripts/mailbox-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

async function createFixture() {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "mailbox-cli-session-resolution-")
  );
  const mailboxRoot = path.join(root, "agent-mailbox");
  const runtimeRoot = path.join(root, "mailbox-runtime");
  await fs.mkdir(path.join(mailboxRoot, "to-claude"), { recursive: true });
  await fs.mkdir(path.join(mailboxRoot, "to-codex"), { recursive: true });
  await fs.mkdir(path.join(mailboxRoot, "archive"), { recursive: true });
  await fs.mkdir(runtimeRoot, { recursive: true });

  const cwd = toHostPath(repoRoot);
  const sessions = [
    {
      session_id: "claude-1",
      agent: "claude",
      project: "workflow",
      cwd,
      last_seen: "2026-04-23T20:00:00Z"
    },
    {
      session_id: "codex-1",
      agent: "codex",
      project: "workflow",
      cwd,
      last_seen: "2026-04-23T20:01:00Z"
    }
  ];
  await fs.writeFile(
    path.join(runtimeRoot, "sessions.json"),
    JSON.stringify(sessions, null, 2),
    "utf8"
  );

  const claudeMessagePath = path.join(
    mailboxRoot,
    "to-claude",
    "workflow__2026-04-23T20-10-00Z-thread-user-001.md"
  );
  const codexMessagePath = path.join(
    mailboxRoot,
    "to-codex",
    "workflow__2026-04-23T20-11-00Z-thread-user-001.md"
  );
  const messageBody = (to) => `---
id: 2026-04-23T20-10-00Z-user-001
thread: thread
from: user
to: ${to}
status: pending
created: 2026-04-23T20:10:00Z
project: workflow
---

hello
`;
  await fs.writeFile(claudeMessagePath, messageBody("claude"), "utf8");
  await fs.writeFile(codexMessagePath, messageBody("codex"), "utf8");

  return {
    claudeMessagePath,
    codexMessagePath,
    mailboxRoot,
    runtimeRoot
  };
}

function runMailbox(args, envOverrides) {
  return spawnSync(process.execPath, ["scripts/mailbox.mjs", ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      MAILBOX_AGENT: "",
      AGENT_MAILBOX_AGENT: "",
      MAILBOX_PROJECT: "",
      AGENT_MAILBOX_PROJECT: "",
      CODEX_THREAD_ID: "",
      CLAUDE_PROJECT_DIR: "",
      ...envOverrides
    },
    encoding: "utf8"
  });
}

test("explicit inbox bucket marks only that inbox when cwd matches both agents", async () => {
  const fixture = await createFixture();
  const result = runMailbox(
    ["list", "--bucket", "to-codex", "--project", "workflow"],
    {
      MAILBOX_ROOT: fixture.mailboxRoot,
      RUNTIME_ROOT: fixture.runtimeRoot
    }
  );

  assert.equal(result.status, 0, result.stderr);

  const [claudeRaw, codexRaw] = await Promise.all([
    fs.readFile(fixture.claudeMessagePath, "utf8"),
    fs.readFile(fixture.codexMessagePath, "utf8")
  ]);

  assert.doesNotMatch(claudeRaw, /^received_at:/m);
  assert.match(codexRaw, /^received_at: .+/m);
});

test("ambiguous shared cwd rejects list --bucket all", async () => {
  const fixture = await createFixture();
  const result = runMailbox(
    ["list", "--bucket", "all", "--project", "workflow"],
    {
      MAILBOX_ROOT: fixture.mailboxRoot,
      RUNTIME_ROOT: fixture.runtimeRoot
    }
  );

  assert.equal(result.status, 64);
});

test("explicit mailbox project env allows channel command when runtime sessions are missing", async () => {
  const fixture = await createFixture();
  await fs.writeFile(path.join(fixture.runtimeRoot, "sessions.json"), "[]", "utf8");

  const result = runMailbox(
    ["list", "--bucket", "to-claude", "--project", "workflow"],
    {
      AGENT_MAILBOX_AGENT: "claude",
      AGENT_MAILBOX_PROJECT: "workflow",
      MAILBOX_ROOT: fixture.mailboxRoot,
      RUNTIME_ROOT: fixture.runtimeRoot
    }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(await fs.readFile(fixture.claudeMessagePath, "utf8"), /^received_at: .+/m);
});

test("explicit mailbox env supplies agent identity for unbound reply", async () => {
  const fixture = await createFixture();
  await fs.writeFile(path.join(fixture.runtimeRoot, "sessions.json"), "[]", "utf8");

  const result = runMailbox(
    [
      "reply",
      "--from",
      "claude",
      "--project",
      "workflow",
      "--to",
      "to-claude/workflow__2026-04-23T20-10-00Z-thread-user-001.md",
      "--body",
      "ack"
    ],
    {
      AGENT_MAILBOX_AGENT: "claude",
      AGENT_MAILBOX_PROJECT: "workflow",
      MAILBOX_ROOT: fixture.mailboxRoot,
      RUNTIME_ROOT: fixture.runtimeRoot
    }
  );

  assert.equal(result.status, 0, result.stderr);
  const replies = await fs.readdir(path.join(fixture.mailboxRoot, "to-codex"));
  assert.ok(replies.some((filename) => filename.startsWith("workflow__")));
  await assert.rejects(fs.readFile(fixture.claudeMessagePath, "utf8"), {
    code: "ENOENT"
  });
});
