#!/usr/bin/env node

import { spawn } from "node:child_process";
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
  args.cwd = path.resolve(args.cwd);

  if (!VALID_MODES.has(args.mode)) {
    throw new Error("--mode must be one of: auto, bypass, manual");
  }
  if (!args.channel) {
    throw new Error("--channel must not be empty");
  }

  return args;
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

function verifyProjectConfig(cwd, channel) {
  const mcpPath = path.join(cwd, ".mcp.json");
  if (!fs.existsSync(mcpPath)) {
    throw new Error(`missing .mcp.json in ${cwd}`);
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(mcpPath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid .mcp.json: ${message}`);
  }

  const serverName = channel.startsWith("server:")
    ? channel.slice("server:".length)
    : "";
  if (serverName && !config?.mcpServers?.[serverName]) {
    throw new Error(`.mcp.json does not define MCP server ${serverName}`);
  }
}

async function launchClaude(command, args, cwd) {
  const spawnCommand = process.platform === "win32"
    ? process.env.ComSpec || "cmd.exe"
    : command;
  const spawnArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", buildWindowsCommandLine(command, args)]
    : args;
  const child = spawn(spawnCommand, spawnArgs, {
    cwd,
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

  verifyProjectConfig(args.cwd, args.channel);
  const claudeArgs = buildClaudeArgs(args);
  const command = formatCommand("claude", claudeArgs);

  if (args.noLaunch) {
    process.stdout.write(
      `${JSON.stringify(
        {
          cwd: args.cwd,
          channel: args.channel,
          mode: args.mode,
          command
        },
        null,
        2
      )}\n`
    );
    return;
  }

  process.stderr.write(`[claude-mailbox] cwd: ${args.cwd}\n`);
  process.stderr.write(`[claude-mailbox] mode: ${args.mode}\n`);
  await launchClaude("claude", claudeArgs, args.cwd);
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
    process.stderr.write("[claude-mailbox] Check that Claude Code is installed and .mcp.json is present.\n");
    process.exitCode = 1;
  });
}
