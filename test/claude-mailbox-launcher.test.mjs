import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildClaudeArgs,
  buildMcpConfig,
  DEFAULT_CHANNEL,
  DEFAULT_MODE,
  detectProject,
  isMainModule,
  parseArgs
} from "../scripts/claude-mailbox.mjs";

const repoRoot = path.resolve(".");

function withProject(args) {
  args.project = detectProject(args, {});
  return args;
}

function expectedArgs(modeArgs = [], extraArgs = []) {
  return [
    "--dangerously-load-development-channels",
    "server:workflow-mailbox",
    ...modeArgs,
    ...extraArgs
  ];
}

test("claude mailbox launcher defaults to channel auto mode", () => {
  const args = withProject(parseArgs(["--no-launch"]));
  const claudeArgs = buildClaudeArgs(args);

  assert.equal(args.channel, DEFAULT_CHANNEL);
  assert.equal(args.mode, DEFAULT_MODE);
  assert.equal(args.cwd, repoRoot);
  assert.deepEqual(claudeArgs, [
    ...expectedArgs(["--permission-mode", "auto"])
  ]);
});

test("claude mailbox launcher supports bypass mode explicitly", () => {
  const args = withProject(parseArgs(["--mode", "bypass", "--no-launch"]));
  const claudeArgs = buildClaudeArgs(args);

  assert.deepEqual(claudeArgs, [
    ...expectedArgs(["--dangerously-skip-permissions"])
  ]);
});

test("claude mailbox launcher supports manual permission mode", () => {
  const args = withProject(parseArgs(["--mode", "manual", "--no-launch"]));
  const claudeArgs = buildClaudeArgs(args);

  assert.deepEqual(claudeArgs, [
    ...expectedArgs()
  ]);
});

test("claude mailbox launcher forwards extra Claude args after separator", () => {
  const args = withProject(parseArgs(["--no-launch", "--", "--model", "opus"]));
  const claudeArgs = buildClaudeArgs(args);

  assert.deepEqual(claudeArgs, [
    ...expectedArgs(["--permission-mode", "auto"], ["--model", "opus"])
  ]);
});

test("claude mailbox launcher rejects unknown modes", () => {
  assert.throws(
    () => parseArgs(["--mode", "acceptEdits", "--no-launch"]),
    /--mode must be one of/
  );
});

test("claude mailbox launcher supports explicit project override", () => {
  const args = withProject(parseArgs(["--project", "custom-project", "--no-launch"]));
  const claudeArgs = buildClaudeArgs(args);

  assert.equal(args.project, "custom-project");
  assert.deepEqual(
    claudeArgs,
    expectedArgs(["--permission-mode", "auto"])
  );
});

test("claude mailbox launcher uses cmd wrapper for Windows stdio MCP config", () => {
  const config = buildMcpConfig("", "win32");
  assert.equal(config.mcpServers["workflow-mailbox"].type, "stdio");
  assert.equal(config.mcpServers["workflow-mailbox"].command, "cmd");
  assert.deepEqual(config.mcpServers["workflow-mailbox"].args, [
    "/c",
    "workflow-mailbox-channel.cmd",
    "--agent",
    "claude",
    "--interval-ms",
    "3000"
  ]);
});

test("claude mailbox launcher can still build project-scoped MCP config", () => {
  const config = buildMcpConfig("sample-project", "linux");

  assert.equal(config.mcpServers["workflow-mailbox"].type, "stdio");
  assert.equal(config.mcpServers["workflow-mailbox"].command, "workflow-mailbox-channel");
  assert.deepEqual(config.mcpServers["workflow-mailbox"].args, [
    "--project",
    "sample-project",
    "--agent",
    "claude",
    "--interval-ms",
    "3000"
  ]);
});

test("claude mailbox launcher auto-detects project from existing settings", async () => {
  const target = await fs.mkdtemp(path.join(os.tmpdir(), "clauder-project-"));
  await fs.mkdir(path.join(target, ".claude"));
  await fs.writeFile(
    path.join(target, ".claude", "settings.local.json"),
    JSON.stringify({
      hooks: {
        SessionStart: [
          {
            hooks: [
              {
                type: "command",
                command: "workflow-mailbox-session-register --project memory-claude"
              }
            ]
          }
        ]
      }
    }),
    "utf8"
  );

  const args = parseArgs(["--cwd", target, "--no-launch"]);
  assert.equal(detectProject(args, {}), "memory-claude");
});

test("claude mailbox launcher falls back to cwd slug without .mcp.json", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "clauder-cwd-"));
  const target = path.join(parent, "my sample project");
  await fs.mkdir(target);

  const args = parseArgs(["--cwd", target, "--no-launch"]);
  assert.equal(detectProject(args, {}), "my-sample-project");
});

test("claude mailbox launcher treats direct invocation as main module", () => {
  assert.equal(isMainModule(path.join(repoRoot, "scripts", "claude-mailbox.mjs")), true);
});
