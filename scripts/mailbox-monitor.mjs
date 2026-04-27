#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

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

function extractFilenameProject(filename) {
  if (typeof filename !== "string") return "";
  const base = path.basename(filename);
  const idx = base.indexOf("__");
  if (idx <= 0) return "";
  return base.slice(0, idx);
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return {};

  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const fieldMatch = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!fieldMatch) continue;
    data[fieldMatch[1]] = fieldMatch[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return data;
}

function clampInterval(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_INTERVAL_MS;
  return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, Math.trunc(numeric)));
}

function parseArgs(argv) {
  const options = {
    project: "",
    agent: "claude",
    bucketName: "",
    intervalMs: DEFAULT_INTERVAL_MS,
    mailboxRoot: path.resolve(__dirname, "../agent-mailbox"),
    once: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--once") {
      options.once = true;
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

async function listCandidateFiles(mailboxRoot, bucketName, project) {
  const bucketRoot = path.join(mailboxRoot, bucketName);
  let entries;
  try {
    entries = await fs.readdir(bucketRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .filter((filename) => extractFilenameProject(filename) === project)
    .sort((left, right) => right.localeCompare(left))
    .map((filename) => path.join(bucketRoot, filename));
}

export async function scanPendingMessages({ mailboxRoot, bucketName, project }) {
  const nextProject = normalizeProject(project);
  if (!nextProject) return [];

  const files = await listCandidateFiles(mailboxRoot, bucketName, nextProject);
  const messages = [];

  for (const filePath of files) {
    const raw = await fs.readFile(filePath, "utf8");
    const metadata = parseFrontmatter(raw);
    const messageProject = normalizeProject(metadata.project);
    const status = typeof metadata.status === "string" ? metadata.status.trim() : "pending";

    if (messageProject !== nextProject) continue;
    if (status && status !== "pending") continue;
    if (metadata.received_at) continue;

    messages.push({
      filename: path.basename(filePath),
      relativePath: path.posix.join(bucketName, path.basename(filePath)),
      project: messageProject,
      bucketName,
      from: typeof metadata.from === "string" ? metadata.from : "",
      to: typeof metadata.to === "string" ? metadata.to : "",
      thread: typeof metadata.thread === "string" ? metadata.thread : "",
      created: typeof metadata.created === "string" ? metadata.created : ""
    });
  }

  return messages;
}

export function formatNotification(messages, { project, bucketName }) {
  const [latest] = messages;
  const recipient = bucketName === "to-codex" ? "codex" : "claude";
  const command = `node scripts/mailbox.mjs list --bucket ${bucketName} --project ${project}`;
  const parts = [
    "WORKFLOW_MAILBOX_PENDING",
    `project=${project}`,
    `recipient=${recipient}`,
    `unread=${messages.length}`
  ];

  if (latest?.thread) parts.push(`thread=${JSON.stringify(latest.thread)}`);
  if (latest?.from) parts.push(`from=${JSON.stringify(latest.from)}`);
  if (latest?.created) parts.push(`created=${JSON.stringify(latest.created)}`);
  if (latest?.relativePath) parts.push(`latest=${JSON.stringify(latest.relativePath)}`);

  parts.push(`action=${JSON.stringify(command)}`);
  return parts.join(" ");
}

function renderHelp() {
  return [
    "Usage: node scripts/mailbox-monitor.mjs --project <slug> [options]",
    "",
    "Options:",
    "  --agent <claude|codex>       Select inbox bucket by agent (default: claude)",
    "  --bucket <to-claude|to-codex> Override inbox bucket",
    "  --interval-ms <n>            Poll interval, clamped to 1000..60000 (default: 3000)",
    "  --mailbox-root <path>        Mailbox root (default: ./agent-mailbox)",
    "  --once                       Print current unread notification once and exit",
    "  --help                       Show this help",
    "",
    "The monitor is read-only. It never calls mailbox.mjs list and never writes received_at."
  ].join("\n");
}

function logError(error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[mailbox-monitor] ${message}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function runMonitor(options) {
  const emitted = new Set();

  while (true) {
    try {
      const messages = await scanPendingMessages(options);
      const currentKeys = new Set(messages.map((message) => message.relativePath));
      for (const key of emitted) {
        if (!currentKeys.has(key)) emitted.delete(key);
      }

      const freshMessages = messages.filter((message) => !emitted.has(message.relativePath));
      if (freshMessages.length > 0) {
        console.log(formatNotification(freshMessages, options));
        for (const message of freshMessages) {
          emitted.add(message.relativePath);
        }
      }
    } catch (error) {
      logError(error);
    }

    if (options.once) return;
    await sleep(options.intervalMs);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(renderHelp());
    return;
  }
  if (!options.project) {
    throw new Error("--project is required");
  }
  await runMonitor(options);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    await main();
  } catch (error) {
    logError(error);
    process.exitCode = 1;
  }
}
