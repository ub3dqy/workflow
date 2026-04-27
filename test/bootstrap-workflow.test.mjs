import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  applyBootstrapPlan,
  buildBootstrapPlan
} from "../scripts/bootstrap-workflow.mjs";

test("bootstrap workflow is dry-run by default and writes only on request", async () => {
  const target = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-bootstrap-"));

  const dryRun = await buildBootstrapPlan({
    target,
    project: "sample-project"
  });
  assert.equal(dryRun.write, false);
  assert.ok(dryRun.files.every((file) => file.action === "dry_run"));
  assert.equal(await fileExists(path.join(target, ".codex", "hooks.json")), false);

  const writePlan = await buildBootstrapPlan({
    target,
    project: "sample-project",
    write: true
  });
  const written = await applyBootstrapPlan(writePlan);
  assert.deepEqual(
    written.sort(),
    [
      ".claude/settings.local.json",
      ".codex/config.toml",
      ".codex/hooks.json",
      ".mcp.json"
    ].sort()
  );

  const codexHooks = await fs.readFile(path.join(target, ".codex", "hooks.json"), "utf8");
  assert.match(codexHooks, /--project sample-project/);
  const mcpConfig = await fs.readFile(path.join(target, ".mcp.json"), "utf8");
  assert.match(mcpConfig, /workflow-mailbox-channel/);
  assert.match(mcpConfig, /sample-project/);

  const noOverwrite = await buildBootstrapPlan({
    target,
    project: "sample-project",
    write: true
  });
  assert.ok(noOverwrite.files.every((file) => file.action === "skip_exists"));
});

test("bootstrap writes unblocked files when a parent path is not a directory", async () => {
  const target = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-bootstrap-blocked-"));
  await fs.writeFile(path.join(target, ".codex"), "", "utf8");

  const plan = await buildBootstrapPlan({
    target,
    project: "memory-claude",
    write: true
  });
  const actions = Object.fromEntries(
    plan.files.map((file) => [file.relativePath, file.action])
  );

  assert.equal(actions[".codex/config.toml"], "blocked_parent");
  assert.equal(actions[".codex/hooks.json"], "blocked_parent");
  assert.equal(actions[".mcp.json"], "write");
  assert.equal(actions[".claude/settings.local.json"], "write");
  assert.equal(
    plan.files.find((file) => file.relativePath === ".codex/hooks.json").blockedBy,
    ".codex"
  );

  const written = await applyBootstrapPlan(plan);
  assert.deepEqual(written.sort(), [".claude/settings.local.json", ".mcp.json"].sort());
  assert.equal(await fileExists(path.join(target, ".mcp.json")), true);
  assert.equal(
    await fileExists(path.join(target, ".claude", "settings.local.json")),
    true
  );
  assert.equal((await fs.stat(path.join(target, ".codex"))).isFile(), true);
});

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
