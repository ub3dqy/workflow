import test from "node:test";
import assert from "node:assert/strict";
import { runDoctor } from "../scripts/workflow-doctor.mjs";

test("workflow doctor emits machine-readable checks", async () => {
  const payload = await runDoctor({ skipNetwork: true });
  assert.equal(payload.ok, true);
  assert.equal(payload.project, "workflow");
  assert.ok(Array.isArray(payload.checks));
  assert.ok(payload.checks.some((check) => check.name === "node_version"));
  assert.ok(
    payload.checks.some(
      (check) => check.name === "file:scripts/codex-remote-project.mjs"
    )
  );
  assert.ok(
    payload.checks.some(
      (check) =>
        check.name === "dashboard_api" &&
        check.status === "skip"
    )
  );
  if (process.env.HOME) {
    assert.equal(JSON.stringify(payload).includes(process.env.HOME), false);
  }
});
