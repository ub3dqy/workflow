import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  buildClaudeArgs,
  DEFAULT_CHANNEL,
  DEFAULT_MODE,
  isMainModule,
  parseArgs
} from "../scripts/claude-mailbox.mjs";

const repoRoot = path.resolve(".");

test("claude mailbox launcher defaults to channel auto mode", () => {
  const args = parseArgs(["--no-launch"]);
  const claudeArgs = buildClaudeArgs(args);

  assert.equal(args.channel, DEFAULT_CHANNEL);
  assert.equal(args.mode, DEFAULT_MODE);
  assert.equal(args.cwd, repoRoot);
  assert.deepEqual(claudeArgs, [
    "--dangerously-load-development-channels",
    "server:workflow-mailbox",
    "--permission-mode",
    "auto"
  ]);
});

test("claude mailbox launcher supports bypass mode explicitly", () => {
  const args = parseArgs(["--mode", "bypass", "--no-launch"]);
  const claudeArgs = buildClaudeArgs(args);

  assert.deepEqual(claudeArgs, [
    "--dangerously-load-development-channels",
    "server:workflow-mailbox",
    "--dangerously-skip-permissions"
  ]);
});

test("claude mailbox launcher supports manual permission mode", () => {
  const args = parseArgs(["--mode", "manual", "--no-launch"]);
  const claudeArgs = buildClaudeArgs(args);

  assert.deepEqual(claudeArgs, [
    "--dangerously-load-development-channels",
    "server:workflow-mailbox"
  ]);
});

test("claude mailbox launcher forwards extra Claude args after separator", () => {
  const args = parseArgs(["--no-launch", "--", "--model", "opus"]);
  const claudeArgs = buildClaudeArgs(args);

  assert.deepEqual(claudeArgs, [
    "--dangerously-load-development-channels",
    "server:workflow-mailbox",
    "--permission-mode",
    "auto",
    "--model",
    "opus"
  ]);
});

test("claude mailbox launcher rejects unknown modes", () => {
  assert.throws(
    () => parseArgs(["--mode", "acceptEdits", "--no-launch"]),
    /--mode must be one of/
  );
});

test("claude mailbox launcher treats direct invocation as main module", () => {
  assert.equal(isMainModule(path.join(repoRoot, "scripts", "claude-mailbox.mjs")), true);
});
