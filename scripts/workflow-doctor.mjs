#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const DEFAULT_TIMEOUT_MS = 1200;
const MIN_NODE = [20, 19, 0];
const PORT_CHECKS = [
  {
    name: "dashboard_api",
    url: "http://127.0.0.1:3003/api/runtime/state",
    okStatuses: new Set([200])
  },
  {
    name: "dashboard_ui",
    url: "http://127.0.0.1:9119/",
    okStatuses: new Set([200, 404])
  },
  {
    name: "codex_app_server",
    url: "http://127.0.0.1:4501/readyz",
    okStatuses: new Set([200])
  }
];

function normalizeProject(project) {
  if (typeof project !== "string") return "";
  return project.trim().replace(/^['"]|['"]$/g, "");
}

function toHostPath(rawCwd) {
  if (typeof rawCwd !== "string") return "";
  const trimmed = rawCwd.trim();
  if (!trimmed) return "";

  if (process.platform !== "win32") {
    const windowsMatch = trimmed.match(/^([A-Za-z]):[\\/](.*)$/);
    if (windowsMatch) {
      const drive = windowsMatch[1].toLowerCase();
      const remainder = windowsMatch[2].replace(/[\\]+/g, "/");
      return path.posix.join("/mnt", drive, remainder);
    }
    return trimmed;
  }

  const wslMatch = trimmed.match(/^\/mnt\/([A-Za-z])\/(.*)$/);
  if (wslMatch) {
    const drive = wslMatch[1].toUpperCase();
    const remainder = wslMatch[2].replace(/\//g, "\\");
    return `${drive}:\\${remainder}`;
  }

  return trimmed;
}

function parseArgs(argv) {
  const options = {
    json: false,
    skipNetwork: false,
    project: "workflow",
    timeoutMs: DEFAULT_TIMEOUT_MS,
    verbose: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--skip-network") {
      options.skipNetwork = true;
      continue;
    }
    if (arg === "--verbose") {
      options.verbose = true;
      continue;
    }
    if (arg === "--project" && typeof argv[index + 1] === "string") {
      options.project = normalizeProject(argv[index + 1]) || options.project;
      index += 1;
      continue;
    }
    if (arg.startsWith("--project=")) {
      options.project = normalizeProject(arg.slice("--project=".length)) || options.project;
      continue;
    }
    if (arg === "--timeout-ms" && typeof argv[index + 1] === "string") {
      options.timeoutMs = Math.max(100, Number(argv[index + 1]) || DEFAULT_TIMEOUT_MS);
      index += 1;
      continue;
    }
    if (arg.startsWith("--timeout-ms=")) {
      options.timeoutMs = Math.max(
        100,
        Number(arg.slice("--timeout-ms=".length)) || DEFAULT_TIMEOUT_MS
      );
    }
  }

  return options;
}

function maskPath(value, options = {}) {
  if (options.verbose || typeof value !== "string" || !value) return value;

  let next = value;
  const replacements = [
    [process.env.HOME, "~"],
    [process.env.USERPROFILE, "%USERPROFILE%"]
  ].filter(([from]) => typeof from === "string" && from.length > 1);

  for (const [from, to] of replacements) {
    next = next.split(from).join(to);
    next = next.split(toHostPath(from)).join(to);
  }

  return next;
}

function compareVersions(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const delta = (left[index] || 0) - (right[index] || 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function parseNodeVersion(value) {
  return value
    .replace(/^v/, "")
    .split(".")
    .map((part) => Number(part) || 0);
}

function makeRecorder() {
  const checks = [];
  const add = (status, name, detail = "") => {
    checks.push({ status, name, detail });
  };

  return {
    checks,
    pass: (name, detail) => add("pass", name, detail),
    warn: (name, detail) => add("warn", name, detail),
    fail: (name, detail) => add("fail", name, detail),
    skip: (name, detail) => add("skip", name, detail)
  };
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function executableNames(name) {
  if (process.platform !== "win32") return [name];
  const extensions = (process.env.PATHEXT || ".EXE;.CMD;.BAT")
    .split(";")
    .filter(Boolean);
  return extensions.map((extension) => `${name}${extension.toLowerCase()}`);
}

async function findExecutable(name) {
  const pathEntries = (process.env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean);
  const candidates = executableNames(name);

  for (const entry of pathEntries) {
    for (const candidate of candidates) {
      const fullPath = path.join(entry, candidate);
      if (await exists(fullPath)) return fullPath;
    }
  }

  return "";
}

function newestIso(items, field) {
  return items
    .map((item) => Date.parse(item[field]))
    .filter((epoch) => Number.isFinite(epoch))
    .sort((left, right) => right - left)[0];
}

async function checkCoreFiles(record) {
  const requiredFiles = [
    "dashboard/package.json",
    ".mcp.json",
    "clauder",
    "clauder.cmd",
    "install-clauder",
    "install-clauder.cmd",
    "start-claude-mailbox.cmd",
    "scripts/claude-mailbox.mjs",
    "scripts/mailbox-channel.mjs",
    "scripts/mailbox.mjs",
    "scripts/codex-remote-project.mjs",
    "AGENTS.md",
    "README.md"
  ];

  for (const relativePath of requiredFiles) {
    const filePath = path.join(repoRoot, relativePath);
    if (await exists(filePath)) {
      record.pass(`file:${relativePath}`, "present");
    } else {
      record.fail(`file:${relativePath}`, "missing");
    }
  }
}

async function checkNode(record) {
  const current = parseNodeVersion(process.versions.node);
  const expected = MIN_NODE.join(".");

  if (compareVersions(current, MIN_NODE) >= 0) {
    record.pass("node_version", `${process.versions.node} >= ${expected}`);
  } else {
    record.fail("node_version", `${process.versions.node} < ${expected}`);
  }
}

async function checkDashboardDependencies(record) {
  const dependencyFiles = [
    "dashboard/node_modules/express/package.json",
    "dashboard/node_modules/gray-matter/package.json",
    "dashboard/node_modules/vite/package.json"
  ];

  for (const relativePath of dependencyFiles) {
    if (await exists(path.join(repoRoot, relativePath))) {
      record.pass(`dependency:${relativePath}`, "present");
    } else {
      record.fail(
        `dependency:${relativePath}`,
        "missing; run npm install in dashboard/"
      );
    }
  }
}

async function checkCodexLaunchers(record, options) {
  const codexPath = await findExecutable("codex");
  if (codexPath) {
    record.pass("codex_binary", maskPath(codexPath, options));
  } else {
    record.warn("codex_binary", "codex not found in PATH");
  }

  const codexrPath = await findExecutable("codexr");
  if (codexrPath) {
    record.pass("codexr_path_alias", maskPath(codexrPath, options));
  } else {
    record.warn(
      "codexr_path_alias",
      "codexr not found in PATH; use node scripts/codex-remote-project.mjs"
    );
  }
}

async function checkClaudeLauncher(record, options) {
  const claudePath = await findExecutable("claude");
  if (claudePath) {
    record.pass("claude_binary", maskPath(claudePath, options));
  } else {
    record.warn(
      "claude_binary",
      "claude not found in PATH; install Claude Code before using clauder"
    );
  }

  const clauderPath = await findExecutable("clauder");
  if (clauderPath) {
    record.pass("clauder_path_alias", maskPath(clauderPath, options));
  } else {
    record.warn(
      "clauder_path_alias",
      "clauder not found in PATH; run install-clauder.cmd on Windows or ./install-clauder in WSL"
    );
  }
}

async function checkRuntimeJson(record, options) {
  const runtimeRoot = path.join(repoRoot, "mailbox-runtime");
  const runtimeFiles = [
    "sessions.json",
    "pending-index.json",
    "supervisor-health.json",
    "codex-bridge-health.json",
    "codex-transport.json",
    "deliveries.json"
  ];

  for (const filename of runtimeFiles) {
    const filePath = path.join(runtimeRoot, filename);
    if (!(await exists(filePath))) {
      record.warn(`runtime:${filename}`, "missing");
      continue;
    }
    try {
      await readJson(filePath);
      record.pass(`runtime:${filename}`, "valid json");
    } catch (error) {
      record.fail(
        `runtime:${filename}`,
        `invalid json: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  const sessionsPath = path.join(runtimeRoot, "sessions.json");
  if (!(await exists(sessionsPath))) return;

  let sessions;
  try {
    sessions = await readJson(sessionsPath);
  } catch {
    return;
  }
  if (!Array.isArray(sessions)) {
    record.fail("mailbox_session_binding", "sessions.json is not an array");
    return;
  }

  const currentCwd = toHostPath(process.cwd());
  const projectMatches = sessions.filter(
    (session) =>
      session &&
      normalizeProject(session.project) === options.project &&
      toHostPath(session.cwd) === currentCwd
  );

  if (projectMatches.length === 0) {
    record.warn(
      "mailbox_session_binding",
      `no registered session for project=${options.project} cwd=${maskPath(currentCwd, options)}`
    );
    return;
  }

  const latest = newestIso(projectMatches, "last_seen");
  const detail = Number.isFinite(latest)
    ? `${projectMatches.length} record(s), newest ${new Date(latest).toISOString()}`
    : `${projectMatches.length} record(s)`;
  record.pass("mailbox_session_binding", detail);
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return { status: response.status };
  } finally {
    clearTimeout(timer);
  }
}

async function checkNetwork(record, options) {
  if (options.skipNetwork) {
    for (const check of PORT_CHECKS) {
      record.skip(check.name, "network checks disabled by --skip-network");
    }
    return;
  }

  for (const check of PORT_CHECKS) {
    try {
      const response = await fetchWithTimeout(check.url, options.timeoutMs);
      if (check.okStatuses.has(response.status)) {
        record.pass(check.name, `${check.url} -> HTTP ${response.status}`);
      } else {
        record.warn(check.name, `${check.url} -> HTTP ${response.status}`);
      }
    } catch (error) {
      record.warn(
        check.name,
        `${check.url} unreachable: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

function renderText(result) {
  const lines = ["Workflow Doctor", ""];
  const icons = {
    pass: "PASS",
    warn: "WARN",
    fail: "FAIL",
    skip: "SKIP"
  };

  for (const check of result.checks) {
    lines.push(`[${icons[check.status] || check.status}] ${check.name}: ${check.detail}`);
  }

  lines.push(
    "",
    `Summary: ${result.summary.pass} pass, ${result.summary.warn} warn, ${result.summary.fail} fail, ${result.summary.skip} skip`
  );

  return lines.join("\n");
}

export async function runDoctor(rawOptions = {}) {
  const options = {
    json: false,
    skipNetwork: false,
    project: "workflow",
    timeoutMs: DEFAULT_TIMEOUT_MS,
    verbose: false,
    ...rawOptions
  };
  const record = makeRecorder();

  await checkNode(record);
  await checkCoreFiles(record);
  await checkDashboardDependencies(record);
  await checkCodexLaunchers(record, options);
  await checkClaudeLauncher(record, options);
  await checkRuntimeJson(record, options);
  await checkNetwork(record, options);

  const summary = record.checks.reduce(
    (accumulator, check) => {
      accumulator[check.status] += 1;
      return accumulator;
    },
    { pass: 0, warn: 0, fail: 0, skip: 0 }
  );
  const result = {
    ok: summary.fail === 0,
    project: options.project,
    cwd: maskPath(toHostPath(process.cwd()), options),
    checks: record.checks,
    summary
  };

  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runDoctor(options);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(renderText(result));
  }

  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  await main();
}
