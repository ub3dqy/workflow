import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { runBootstrapCheck } from "../scripts/workflow-bootstrap-check.mjs";

test("workflow bootstrap check reports current repo readiness", async () => {
  const result = await runBootstrapCheck({
    target: path.resolve("."),
    project: "workflow"
  });

  assert.equal(result.ok, true);
  assert.equal(result.project, "workflow");
  assert.ok(Array.isArray(result.checks));
  assert.ok(result.checks.some((check) => check.name === "file:AGENTS.md"));
  assert.ok(result.checks.some((check) => check.name === "codex_hooks_enabled"));
  assert.ok(result.checks.some((check) => check.name === "claude_mailbox_channel"));
  assert.ok(result.suggestedFiles[".codex/hooks.json"].includes("--project workflow"));
  assert.ok(result.suggestedFiles[".mcp.json"].includes("workflow-mailbox-channel"));
});
