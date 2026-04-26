import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildCodexArgs,
  DEFAULT_BOOTSTRAP_PROMPT,
  isMainModule,
  parseArgs
} from "../scripts/codex-remote-project.mjs";

const repoRoot = path.resolve(".");

test("codex remote launcher builds zero-touch bootstrap args", () => {
  const args = parseArgs(["--cwd", repoRoot, "--no-launch"]);
  const codexArgs = buildCodexArgs({
    wsUrl: args.wsUrl,
    cwd: args.cwd,
    prompt: args.prompt,
    codexArgs: args.codexArgs
  });

  assert.equal(args.prompt, DEFAULT_BOOTSTRAP_PROMPT);
  assert.equal(args.cwd, repoRoot);
  assert.deepEqual(codexArgs, [
    "--remote",
    "ws://127.0.0.1:4501",
    "-C",
    repoRoot,
    DEFAULT_BOOTSTRAP_PROMPT
  ]);
});

test("codex remote launcher rejects empty bootstrap prompts", () => {
  assert.throws(
    () => parseArgs(["--cwd", repoRoot, "--prompt", "", "--no-launch"]),
    /--prompt must not be empty/
  );
});

test("codex remote launcher treats a symlink invocation as the main module", {
  skip: process.platform === "win32" ? "symlinked codexr launcher is WSL/Linux only" : false
}, async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codexr-symlink-"));
  const symlinkPath = path.join(tempDir, "codexr");

  try {
    await fs.symlink(path.join(repoRoot, "scripts", "codex-remote-project.mjs"), symlinkPath);
    assert.equal(isMainModule(symlinkPath), true);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
