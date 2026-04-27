#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

import { scanPendingMessages } from "./mailbox-monitor.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_INTERVAL_MS = 3000;
const MIN_INTERVAL_MS = 1000;
const MAX_INTERVAL_MS = 60000;
const VALID_BUCKETS = new Set(["to-claude", "to-codex"]);

function normalizeProject(value) {
  return typeof value === "string" ? value.trim().replace(/^['"]|['"]$/g, "") : "";
}

function normalizeAgent(value) {
  const agent = typeof value === "string" ? value.trim().toLowerCase() : "";
  return agent === "claude" || agent === "codex" ? agent : "";
}

function bucketForAgent(agent) {
  return agent === "codex" ? "to-codex" : "to-claude";
}

function clampInterval(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_INTERVAL_MS;
  return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, Math.trunc(numeric)));
}

export function parseChannelArgs(argv, env = process.env) {
  const agentFromEnv = normalizeAgent(env.WORKFLOW_MAILBOX_AGENT);
  const options = {
    project: normalizeProject(env.WORKFLOW_MAILBOX_PROJECT),
    agent: agentFromEnv || "claude",
    bucketName: "",
    intervalMs: clampInterval(env.WORKFLOW_MAILBOX_INTERVAL_MS),
    mailboxRoot: path.resolve(env.WORKFLOW_MAILBOX_ROOT || path.resolve(__dirname, "../agent-mailbox")),
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--project" && typeof argv[index + 1] === "string") {
      options.project = normalizeProject(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith("--project=")) {
      options.project = normalizeProject(arg.slice("--project=".length));
      continue;
    }
    if (arg === "--agent" && typeof argv[index + 1] === "string") {
      options.agent = normalizeAgent(argv[index + 1]) || options.agent;
      index += 1;
      continue;
    }
    if (arg.startsWith("--agent=")) {
      options.agent = normalizeAgent(arg.slice("--agent=".length)) || options.agent;
      continue;
    }
    if (arg === "--bucket" && typeof argv[index + 1] === "string") {
      options.bucketName = argv[index + 1].trim();
      index += 1;
      continue;
    }
    if (arg.startsWith("--bucket=")) {
      options.bucketName = arg.slice("--bucket=".length).trim();
      continue;
    }
    if (arg === "--interval-ms" && typeof argv[index + 1] === "string") {
      options.intervalMs = clampInterval(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith("--interval-ms=")) {
      options.intervalMs = clampInterval(arg.slice("--interval-ms=".length));
      continue;
    }
    if (arg === "--mailbox-root" && typeof argv[index + 1] === "string") {
      options.mailboxRoot = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith("--mailbox-root=")) {
      options.mailboxRoot = path.resolve(arg.slice("--mailbox-root=".length));
    }
  }

  if (!options.bucketName) {
    options.bucketName = bucketForAgent(options.agent);
  }

  if (!VALID_BUCKETS.has(options.bucketName)) {
    throw new Error('bucket must be "to-claude" or "to-codex"');
  }

  return options;
}

function recipientForBucket(bucketName) {
  return bucketName === "to-codex" ? "codex" : "claude";
}

function mailboxCommand(recipient, command) {
  return `AGENT_MAILBOX_PROJECT=workflow AGENT_MAILBOX_AGENT=${recipient} node scripts/mailbox.mjs ${command}`;
}

export function formatChannelContent(messages, { project, bucketName }) {
  const recipient = recipientForBucket(bucketName);
  const command = mailboxCommand(
    recipient,
    `list --bucket ${bucketName} --project ${project}`
  );
  const paths = messages.map((message) => `- ${message.relativePath}`).join("\n");
  const threadLines = [...new Set(messages.map((message) => message.thread).filter(Boolean))]
    .map((thread) => `- ${thread}`)
    .join("\n");

  return [
    `Mailbox reminder for project ${project}.`,
    `There are ${messages.length} pending mailbox message(s) for ${recipient}.`,
    threadLines ? `Threads:\n${threadLines}` : "",
    paths ? `Paths:\n${paths}` : "",
    "Use the normal mailbox workflow in this repository.",
    `First run: ${command}`,
    "Do not read files under agent-mailbox directly; the list output contains the message body.",
    `If no response is needed, archive with: ${mailboxCommand(recipient, `archive --path <relativePath> --project ${project} --resolution no-reply-needed`)}`,
    `If a response is needed, reply with: ${mailboxCommand(recipient, `reply --from ${recipient} --project ${project} --to <relativePath> --body "<response>"`)}`,
    "After processing, archive or reply in the same turn."
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatChannelMeta(messages, { project, bucketName }) {
  const [latest] = messages;
  const meta = {
    project,
    recipient: recipientForBucket(bucketName),
    bucket: bucketName,
    unread: String(messages.length)
  };

  if (latest?.thread) meta.thread = latest.thread;
  if (latest?.from) meta.from = latest.from;
  if (latest?.relativePath) meta.latest = latest.relativePath;

  return meta;
}

export function createInitializeResult(params = {}) {
  const protocolVersion =
    typeof params.protocolVersion === "string" && params.protocolVersion.trim()
      ? params.protocolVersion
      : "2025-06-18";

  return {
    protocolVersion,
    capabilities: {
      experimental: {
        "claude/channel": {}
      }
    },
    serverInfo: {
      name: "workflow-mailbox",
      version: "0.1.0"
    },
    instructions:
      "Mailbox reminders arrive as <channel source=\"workflow-mailbox\" ...>. " +
      "When one arrives, process it with the repository's normal mailbox CLI workflow. " +
      "Do not read mailbox files directly; run the listed mailbox.mjs list command first, use the body from list output, " +
      "then archive with `AGENT_MAILBOX_PROJECT=<project> AGENT_MAILBOX_AGENT=claude node scripts/mailbox.mjs archive --path <relativePath> --project <project> --resolution no-reply-needed` " +
      "or reply with `AGENT_MAILBOX_PROJECT=<project> AGENT_MAILBOX_AGENT=claude node scripts/mailbox.mjs reply --from claude --project <project> --to <relativePath> --body \"<response>\"` in the same turn."
  };
}

function renderHelp() {
  return [
    "Usage: node scripts/mailbox-channel.mjs --project <slug> [options]",
    "",
    "Options:",
    "  --agent <claude|codex>       Select inbox bucket by agent (default: claude)",
    "  --bucket <to-claude|to-codex> Override inbox bucket",
    "  --interval-ms <n>            Poll interval, clamped to 1000..60000 (default: 3000)",
    "  --mailbox-root <path>        Mailbox root (default: ./agent-mailbox)",
    "  --help                       Show this help",
    "",
    "This is a Claude Code channel MCP server. Start Claude Code with:",
    "  clauder"
  ].join("\n");
}

function logError(error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[mailbox-channel] ${message}\n`);
}

function sendJson(message, output = process.stdout) {
  output.write(`${JSON.stringify(message)}\n`);
}

function sendResult(id, result, output = process.stdout) {
  sendJson({ jsonrpc: "2.0", id, result }, output);
}

function sendError(id, code, message, output = process.stdout) {
  sendJson({ jsonrpc: "2.0", id, error: { code, message } }, output);
}

function sendNotification(method, params, output = process.stdout) {
  sendJson({ jsonrpc: "2.0", method, params }, output);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function pollMailbox(connection, options, emitted) {
  const messages = await scanPendingMessages(options);
  const currentKeys = new Set(messages.map((message) => message.relativePath));
  for (const key of emitted) {
    if (!currentKeys.has(key)) emitted.delete(key);
  }

  const freshMessages = messages.filter((message) => !emitted.has(message.relativePath));
  if (freshMessages.length === 0) return;

  connection.notify("notifications/claude/channel", {
    content: formatChannelContent(freshMessages, options),
    meta: formatChannelMeta(freshMessages, options)
  });

  for (const message of freshMessages) {
    emitted.add(message.relativePath);
  }
}

export async function runChannelServer(options, input = process.stdin, output = process.stdout) {
  const emitted = new Set();
  let initialized = false;
  let stopped = false;

  const connection = {
    notify(method, params) {
      sendNotification(method, params, output);
    }
  };

  async function startPolling() {
    while (!stopped) {
      if (initialized) {
        try {
          await pollMailbox(connection, options, emitted);
        } catch (error) {
          logError(error);
        }
      }
      await sleep(options.intervalMs);
    }
  }

  const poller = startPolling();
  const lines = readline.createInterface({ input, crlfDelay: Infinity });

  for await (const line of lines) {
    if (!line.trim()) continue;

    let request;
    try {
      request = JSON.parse(line);
    } catch {
      sendError(null, -32700, "Parse error", output);
      continue;
    }

    if (request.method === "initialize" && Object.hasOwn(request, "id")) {
      sendResult(request.id, createInitializeResult(request.params), output);
      continue;
    }

    if (request.method === "notifications/initialized") {
      initialized = true;
      continue;
    }

    if (request.method === "ping" && Object.hasOwn(request, "id")) {
      sendResult(request.id, {}, output);
      continue;
    }

    if (request.method === "tools/list" && Object.hasOwn(request, "id")) {
      sendResult(request.id, { tools: [] }, output);
      continue;
    }

    if (Object.hasOwn(request, "id")) {
      sendError(request.id, -32601, `Method not found: ${request.method}`, output);
    }
  }

  stopped = true;
  await poller;
}

async function main() {
  const options = parseChannelArgs(process.argv.slice(2), process.env);
  if (options.help) {
    console.log(renderHelp());
    return;
  }
  if (!options.project) {
    throw new Error("--project is required");
  }
  await runChannelServer(options);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    await main();
  } catch (error) {
    logError(error);
    process.exitCode = 1;
  }
}
