#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runMonitor } from "../../scripts/mailbox-monitor.mjs";

const __filename = fileURLToPath(import.meta.url);
const pluginRoot = path.resolve(path.dirname(__filename), "..");
const workflowRoot = path.resolve(pluginRoot, "..");

try {
  console.log("WORKFLOW_MAILBOX_MONITOR_READY project=workflow recipient=claude interval_ms=3000");
  await runMonitor({
    project: "workflow",
    agent: "claude",
    bucketName: "to-claude",
    intervalMs: 3000,
    mailboxRoot: path.join(workflowRoot, "agent-mailbox"),
    once: false
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[claude-mailbox-monitor] ${message}\n`);
  process.exitCode = 1;
}
