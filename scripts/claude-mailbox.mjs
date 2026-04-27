#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const DEFAULT_CHANNEL = "server:workflow-mailbox";
export const DEFAULT_MODE = "auto";
const VALID_MODES = new Set(["auto", "bypass", "manual"]);

function printHelp() {
  process.stdout.write(
    [
      "Usage:",
      "  clauder [options] [-- <claude options>]",
      "",
      "Starts Claude Code with the workflow mailbox channel enabled.",
      "",
      "Options:",
      "  --mode <auto|bypass|manual>",
      "                      Permission mode. Default: auto.",
      "                      auto   -> --permission-mode auto",
      "                      bypass -> --dangerously-skip-permissions",
      "                      manual -> no permission-mode flag",
      "  --channel <entry>   Channel entry. Default: server:workflow-mailbox",
      "  --project <slug>    Mailbox project slug. Default: auto-detect from config or cwd",
      "  --cwd <path>        Project cwd. Default: current directory",
      "  --no-launch         Print the launch command without starting Claude",
      "  --help, -h          Show this help",
      "",
      "Examples:",
      "  clauder",
      "  clauder -- --model opus",
      "  clauder --mode bypass",
      ""
    ].join("\n")
  );
}

export function parseArgs(argv) {
  const args = {
    channel: DEFAULT_CHANNEL,
    mode: DEFAULT_MODE,
    project: "",
    cwd: process.cwd(),
    claudeArgs: [],
    noLaunch: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--") {
      args.claudeArgs = argv.slice(index + 1);
      break;
    }

    switch (arg) {
      case "--mode":
        if (!next) throw new Error("--mode requires a value");
        args.mode = next;
        index += 1;
        break;
      case "--channel":
        if (!next) throw new Error("--channel requires a value");
        args.channel = next;
        index += 1;
        break;
      case "--project":
        if (!next) throw new Error("--project requires a value");
        args.project = next;
        index += 1;
        break;
      case "--cwd":
        if (!next) throw new Error("--cwd requires a value");
        args.cwd = next;
        index += 1;
        break;
      case "--no-launch":
        args.noLaunch = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }

  args.mode = String(args.mode || "").trim();
  args.channel = String(args.channel || "").trim();
  args.project = normalizeProject(args.project);
  args.cwd = path.resolve(args.cwd);

  if (!VALID_MODES.has(args.mode)) {
    throw new Error("--mode must be one of: auto, bypass, manual");
  }
  if (!args.channel) {
    throw new Error("--channel must not be empty");
  }

  return args;
}

function normalizeProject(value) {
  const next = typeof value === "string" ? value.trim().replace(/^['"]|['"]$/g, "") : "";
  if (next.includes("__")) {
    throw new Error('project slug must not contain "__"');
  }
  return next;
}

function projectFromArgList(args) {
  if (!Array.isArray(args)) return "";
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--project" && typeof args[index + 1] === "string") {
      return normalizeProject(args[index + 1]);
    }
    if (typeof value === "string" && value.startsWith("--project=")) {
      return normalizeProject(value.slice("--project=".length));
    }
  }
  return "";
}

function projectFromMcpConfig(cwd) {
  const mcpPath = path.join(cwd, ".mcp.json");
  if (!fs.existsSync(mcpPath)) return "";

  try {
    const config = JSON.parse(fs.readFileSync(mcpPath, "utf8"));
    return projectFromArgList(config?.mcpServers?.["workflow-mailbox"]?.args);
  } catch {
    return "";
  }
}

function projectFromSettings(cwd) {
  for (const relativePath of [
    ".claude/settings.local.json",
    ".codex/hooks.json"
  ]) {
    const filePath = path.join(cwd, relativePath);
    if (!fs.existsSync(filePath)) continue;
    const text = fs.readFileSync(filePath, "utf8");
    const match = text.match(/--project(?:=|\s+)(["']?)([^"'\s]+)\1/u);
    if (match?.[2]) {
      return normalizeProject(match[2]);
    }
  }
  return "";
}

function projectFromCwd(cwd) {
  return normalizeProject(path.basename(cwd).replace(/\s+/g, "-"));
}

export function detectProject({ cwd, project = "" }, env = process.env) {
  return (
    normalizeProject(project) ||
    normalizeProject(env.WORKFLOW_MAILBOX_PROJECT) ||
    normalizeProject(env.AGENT_MAILBOX_PROJECT) ||
    projectFromMcpConfig(cwd) ||
    projectFromSettings(cwd) ||
    projectFromCwd(cwd)
  );
}

function channelArgs(project) {
  const args = [];
  if (project) {
    args.push("--project", project);
  }
  args.push(
    "--agent",
    "claude",
    "--interval-ms",
    "3000"
  );
  return args;
}

function buildMailboxServerConfig(project, platform = process.platform) {
  if (platform === "win32") {
    return {
      type: "stdio",
      command: "cmd",
      args: ["/c", "workflow-mailbox-channel.cmd", ...channelArgs(project)]
    };
  }

  return {
    type: "stdio",
    command: "workflow-mailbox-channel",
    args: channelArgs(project)
  };
}

export function buildMcpConfig(project = "", platform = process.platform) {
  return {
    mcpServers: {
      "workflow-mailbox": buildMailboxServerConfig(project, platform)
    }
  };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

export function buildClaudeArgs({ channel, mode, claudeArgs = [] }) {
  const args = [
    "--dangerously-load-development-channels",
    channel
  ];

  if (mode === "auto") {
    args.push("--permission-mode", "auto");
  } else if (mode === "bypass") {
    args.push("--dangerously-skip-permissions");
  }

  args.push(...claudeArgs);
  return args;
}

function formatCommand(command, args) {
  return [command, ...args].map(shellQuote).join(" ");
}

function windowsQuote(value) {
  const text = String(value);
  if (!/[ \t"]/u.test(text)) return text;
  return `"${text.replace(/"/g, '\\"')}"`;
}

function buildWindowsCommandLine(command, args) {
  return [command, ...args].map(windowsQuote).join(" ");
}

function runClaudeCli(args, cwd) {
  if (process.platform === "win32") {
    return spawnSync(
      process.env.ComSpec || "cmd.exe",
      ["/d", "/s", "/c", buildWindowsCommandLine("claude", args)],
      { cwd, encoding: "utf8" }
    );
  }

  return spawnSync("claude", args, { cwd, encoding: "utf8" });
}

function addUserMcpServer(cwd) {
  const commandArgs = process.platform === "win32"
    ? ["--", "cmd", "/c", "workflow-mailbox-channel.cmd"]
    : ["--", "workflow-mailbox-channel"];
  const result = runClaudeCli(
    [
      "mcp",
      "add",
      "--scope",
      "user",
      "workflow-mailbox",
      ...commandArgs
    ],
    cwd
  );

  if (result.status !== 0) {
    const details = `${result.stderr || ""}${result.stdout || ""}`.trim();
    throw new Error(
      `failed to register user-scope workflow-mailbox MCP server${details ? `: ${details}` : ""}`
    );
  }
}

export function ensureUserMcpServer(cwd) {
  const existing = runClaudeCli(["mcp", "get", "workflow-mailbox"], cwd);
  if (existing.status === 0) {
    return "existing";
  }

  addUserMcpServer(cwd);
  return "created";
}

function launchEnvironment(project) {
  return {
    ...process.env,
    WORKFLOW_MAILBOX_AGENT: "claude",
    WORKFLOW_MAILBOX_PROJECT: project,
    AGENT_MAILBOX_PROJECT: project,
    AGENT_MAILBOX_AGENT: "claude"
  };
}

async function launchClaude(command, args, cwd, env) {
  const spawnCommand = process.platform === "win32"
    ? process.env.ComSpec || "cmd.exe"
    : command;
  const spawnArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", buildWindowsCommandLine(command, args)]
    : args;
  const child = spawn(spawnCommand, spawnArgs, {
    cwd,
    env,
    stdio: "inherit"
  });

  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        process.exitCode = 128;
        resolve();
        return;
      }
      process.exitCode = code ?? 1;
      resolve();
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  args.project = detectProject(args);
  const claudeArgs = buildClaudeArgs(args);
  const command = formatCommand("claude", claudeArgs);

  if (args.noLaunch) {
    process.stdout.write(
      `${JSON.stringify(
        {
          cwd: args.cwd,
          project: args.project,
          ensureUserMcp: true,
          channel: args.channel,
          mode: args.mode,
          env: {
            WORKFLOW_MAILBOX_PROJECT: args.project,
            WORKFLOW_MAILBOX_AGENT: "claude"
          },
          command
        },
        null,
        2
      )}\n`
    );
    return;
  }

  process.stderr.write(`[claude-mailbox] cwd: ${args.cwd}\n`);
  process.stderr.write(`[claude-mailbox] project: ${args.project}\n`);
  process.stderr.write(`[claude-mailbox] mode: ${args.mode}\n`);
  const ensureStatus = ensureUserMcpServer(args.cwd);
  process.stderr.write(`[claude-mailbox] user MCP: ${ensureStatus}\n`);
  await launchClaude("claude", claudeArgs, args.cwd, launchEnvironment(args.project));
}

export function isMainModule(argvPath = process.argv[1]) {
  if (!argvPath) return false;
  const invokedPath = path.resolve(argvPath);
  const modulePath = path.resolve(__filename);
  if (invokedPath === modulePath) return true;

  try {
    return fs.realpathSync(invokedPath) === fs.realpathSync(modulePath);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[claude-mailbox] ${message}\n`);
    process.stderr.write("[claude-mailbox] Check that Claude Code and workflow-mailbox-channel are on PATH.\n");
    process.exitCode = 1;
  });
}
