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

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
