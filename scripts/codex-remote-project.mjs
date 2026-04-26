#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const DEFAULT_BOOTSTRAP_PROMPT =
  "Старт remote-сессии проекта. Ответь только OK.";
const DEFAULT_DASHBOARD_URL = "http://127.0.0.1:3003";
const DASHBOARD_READY_TIMEOUT_MS = 30000;
const DASHBOARD_READY_INTERVAL_MS = 250;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

function printHelp() {
  process.stdout.write(
    [
      "Usage:",
      "  codex-remote-project [options] [-- <codex options>]",
      "",
      "Starts a Codex remote TUI bound to the current project cwd.",
      "",
      "Options:",
      "  --ws-url <url>       App-server websocket URL. Default: CODEX_APP_SERVER_URL or ws://127.0.0.1:4501",
      "  --dashboard-url <url> Dashboard backend URL. Default: CODEX_DASHBOARD_URL or http://127.0.0.1:3003",
      "  --cwd <path>         Project cwd. Default: current directory",
      "  --prompt <text>      Initial prompt that creates the rollout. Default: short OK bootstrap",
      "  --no-ensure-dashboard",
      "                      Do not auto-start the dashboard backend bridge",
      "  --no-launch          Print the launch command without starting TUI",
      "  --help, -h           Show this help",
      "",
      "Examples:",
      "  codex-remote-project",
      "  codex-remote-project -- --model gpt-5.5",
      "  codex-remote-project --cwd '/mnt/e/Project/memory claude/memory claude'",
      "",
    ].join("\n"),
  );
}

export function parseArgs(argv) {
  const args = {
    cwd: process.cwd(),
    wsUrl: process.env.CODEX_APP_SERVER_URL || "ws://127.0.0.1:4501",
    dashboardUrl: process.env.CODEX_DASHBOARD_URL || DEFAULT_DASHBOARD_URL,
    prompt: DEFAULT_BOOTSTRAP_PROMPT,
    codexArgs: [],
    ensureDashboard: true,
    noLaunch: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--") {
      args.codexArgs = argv.slice(index + 1);
      break;
    }

    switch (arg) {
      case "--ws-url":
        if (!next) throw new Error("--ws-url requires a value");
        args.wsUrl = next;
        index += 1;
        break;
      case "--dashboard-url":
        if (!next) throw new Error("--dashboard-url requires a value");
        args.dashboardUrl = next;
        index += 1;
        break;
      case "--cwd":
        if (!next) throw new Error("--cwd requires a value");
        args.cwd = next;
        index += 1;
        break;
      case "--prompt":
        if (next === undefined) throw new Error("--prompt requires a value");
        args.prompt = next;
        index += 1;
        break;
      case "--no-launch":
        args.noLaunch = true;
        break;
      case "--no-ensure-dashboard":
        args.ensureDashboard = false;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }

  args.cwd = path.resolve(args.cwd);
  if (!String(args.prompt || "").trim()) {
    throw new Error("--prompt must not be empty; it creates the initial remote rollout");
  }
  return args;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

export function buildCodexArgs({ wsUrl, cwd, prompt, codexArgs }) {
  return ["--remote", wsUrl, "-C", cwd, ...codexArgs, prompt];
}

function formatCommand(command, args) {
  return [command, ...args].map(shellQuote).join(" ");
}

function dashboardHealthUrl(dashboardUrl) {
  const url = new URL(dashboardUrl);
  url.pathname = "/api/runtime/codex-bridge";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function dashboardTransportStartUrl(dashboardUrl) {
  const url = new URL(dashboardUrl);
  url.pathname = "/api/runtime/codex-transport/start";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function wsToHttpUrl(wsUrl, pathname) {
  const url = new URL(wsUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function probeDashboard(dashboardUrl, timeoutMs = 500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(dashboardHealthUrl(dashboardUrl), {
      signal: controller.signal
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function probeAppServer(wsUrl, timeoutMs = 500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(wsToHttpUrl(wsUrl, "/readyz"), {
      signal: controller.signal
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForDashboard(dashboardUrl) {
  const deadline = Date.now() + DASHBOARD_READY_TIMEOUT_MS;
  while (Date.now() <= deadline) {
    if (await probeDashboard(dashboardUrl)) {
      return true;
    }
    await new Promise((resolve) =>
      setTimeout(resolve, DASHBOARD_READY_INTERVAL_MS)
    );
  }
  return false;
}

async function waitForAppServer(wsUrl) {
  const deadline = Date.now() + DASHBOARD_READY_TIMEOUT_MS;
  while (Date.now() <= deadline) {
    if (await probeAppServer(wsUrl)) {
      return true;
    }
    await new Promise((resolve) =>
      setTimeout(resolve, DASHBOARD_READY_INTERVAL_MS)
    );
  }
  return false;
}

function startDashboardBackend() {
  const runtimeRoot = path.join(REPO_ROOT, "mailbox-runtime");
  fs.mkdirSync(runtimeRoot, { recursive: true });
  const logPath = path.join(runtimeRoot, "codexr-dashboard-server.log");
  const out = fs.openSync(logPath, "a");
  const err = fs.openSync(logPath, "a");
  const child = spawn(process.execPath, ["server.js"], {
    cwd: path.join(REPO_ROOT, "dashboard"),
    detached: true,
    stdio: ["ignore", out, err]
  });
  child.unref();
}

async function ensureDashboardBackend(dashboardUrl) {
  if (await probeDashboard(dashboardUrl)) {
    return;
  }

  process.stderr.write(
    `[codex-remote-project] dashboard backend not running; starting ${dashboardUrl}\n`
  );
  startDashboardBackend();
  if (!(await waitForDashboard(dashboardUrl))) {
    throw new Error(
      `dashboard backend did not become ready at ${dashboardUrl}; see mailbox-runtime/codexr-dashboard-server.log`
    );
  }
}

async function startTransportViaDashboard(dashboardUrl) {
  const response = await fetch(dashboardTransportStartUrl(dashboardUrl), {
    method: "POST"
  });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(
      `dashboard transport start failed with HTTP ${response.status}${details ? `: ${details}` : ""}`
    );
  }
}

async function ensureAppServer(wsUrl, dashboardUrl) {
  if (await probeAppServer(wsUrl)) {
    return;
  }

  process.stderr.write(
    `[codex-remote-project] codex app-server not ready; starting ${wsUrl}\n`
  );
  await startTransportViaDashboard(dashboardUrl);
  if (!(await waitForAppServer(wsUrl))) {
    throw new Error(`codex app-server did not become ready at ${wsUrl}`);
  }
}

async function launchCodex(command, args, cwd) {
  const child = spawn(command, args, {
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

  const codexArgs = buildCodexArgs({
    wsUrl: args.wsUrl,
    cwd: args.cwd,
    prompt: args.prompt,
    codexArgs: args.codexArgs
  });
  const command = formatCommand("codex", codexArgs);

  if (args.noLaunch) {
    process.stdout.write(
      `${JSON.stringify(
        {
          cwd: args.cwd,
          wsUrl: args.wsUrl,
          dashboardUrl: args.dashboardUrl,
          ensureDashboard: args.ensureDashboard,
          zeroTouchBootstrap: true,
          prompt: args.prompt,
          command
        },
        null,
        2
      )}\n`,
    );
    return;
  }

  if (args.ensureDashboard) {
    await ensureDashboardBackend(args.dashboardUrl);
    await ensureAppServer(args.wsUrl, args.dashboardUrl);
  }

  process.stderr.write(`[codex-remote-project] cwd: ${args.cwd}\n`);
  await launchCodex("codex", codexArgs, args.cwd);
}

export function isMainModule(argvPath = process.argv[1]) {
  if (!argvPath) {
    return false;
  }

  const invokedPath = path.resolve(argvPath);
  const modulePath = path.resolve(__filename);
  if (invokedPath === modulePath) {
    return true;
  }

  try {
    return fs.realpathSync(invokedPath) === fs.realpathSync(modulePath);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[codex-remote-project] ${message}\n`);
    process.stderr.write(
      "[codex-remote-project] Check that the workflow dashboard transport is started.\n",
    );
    process.exitCode = 1;
  });
}
