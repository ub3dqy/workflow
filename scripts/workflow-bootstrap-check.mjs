#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workflowRoot = path.resolve(__dirname, "..");

const REQUIRED_FILES = [
  "AGENTS.md",
  "CLAUDE.md",
  ".codex/config.toml",
  ".codex/hooks.json",
  ".claude/settings.local.json"
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
    target: process.cwd(),
    project: "",
    json: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--target" && typeof argv[index + 1] === "string") {
      options.target = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--target=")) {
      options.target = arg.slice("--target=".length);
      continue;
    }
    if (arg === "--project" && typeof argv[index + 1] === "string") {
      options.project = normalizeProject(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith("--project=")) {
      options.project = normalizeProject(arg.slice("--project=".length));
    }
  }

  options.target = path.resolve(toHostPath(options.target) || options.target);
  if (!options.project) {
    options.project = normalizeProject(path.basename(options.target));
  }

  return options;
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
    fail: (name, detail) => add("fail", name, detail)
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

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

async function checkTarget(record, options) {
  if (!(await exists(options.target))) {
    record.fail("target_exists", `${options.target} does not exist`);
    return false;
  }

  record.pass("target_exists", options.target);

  if (await exists(path.join(options.target, ".git"))) {
    record.pass("target_git_repo", ".git present");
  } else {
    record.warn("target_git_repo", ".git missing; bootstrap still possible but git history is expected");
  }

  return true;
}

async function checkFiles(record, options) {
  for (const relativePath of REQUIRED_FILES) {
    const filePath = path.join(options.target, relativePath);
    if (await exists(filePath)) {
      record.pass(`file:${relativePath}`, "present");
    } else {
      record.warn(`file:${relativePath}`, "missing");
    }
  }
}

async function checkHooks(record, options) {
  const codexHooks = await readTextIfExists(path.join(options.target, ".codex/hooks.json"));
  const claudeSettings = await readTextIfExists(
    path.join(options.target, ".claude/settings.local.json")
  );
  const codexConfig = await readTextIfExists(path.join(options.target, ".codex/config.toml"));

  if (codexConfig) {
    if (/codex_hooks\s*=\s*true/.test(codexConfig)) {
      record.pass("codex_hooks_enabled", "codex_hooks = true");
    } else {
      record.warn("codex_hooks_enabled", "missing codex_hooks = true");
    }
  }

  if (codexHooks) {
    if (codexHooks.includes("mailbox-session-register.mjs")) {
      record.pass("codex_session_register_hook", "mailbox-session-register.mjs referenced");
    } else {
      record.warn("codex_session_register_hook", "missing mailbox-session-register.mjs reference");
    }

    if (codexHooks.includes(`--project ${options.project}`)) {
      record.pass("codex_project_slug", `--project ${options.project}`);
    } else {
      record.warn("codex_project_slug", `expected --project ${options.project}`);
    }
  }

  if (claudeSettings) {
    if (claudeSettings.includes("mailbox-status.mjs")) {
      record.pass("claude_mailbox_status_hook", "mailbox-status.mjs referenced");
    } else {
      record.warn("claude_mailbox_status_hook", "missing mailbox-status.mjs reference");
    }

    if (claudeSettings.includes("mailbox-session-register.mjs")) {
      record.pass("claude_session_register_hook", "mailbox-session-register.mjs referenced");
    } else {
      record.warn("claude_session_register_hook", "missing mailbox-session-register.mjs reference");
    }

    if (claudeSettings.includes(`--project ${options.project}`)) {
      record.pass("claude_project_slug", `--project ${options.project}`);
    } else {
      record.warn("claude_project_slug", `expected --project ${options.project}`);
    }
  }
}

function buildSuggestedFiles(options) {
  const codexRegisterScript = "$(git rev-parse --show-toplevel)/scripts/mailbox-session-register.mjs";
  const statusScript = path.join(workflowRoot, "scripts", "mailbox-status.mjs");
  const registerScript = path.join(workflowRoot, "scripts", "mailbox-session-register.mjs");

  return {
    ".codex/config.toml": "[features]\ncodex_hooks = true\n",
    ".codex/hooks.json": JSON.stringify(
      {
        hooks: {
          SessionStart: [
            {
              matcher: "startup|resume",
              hooks: [
                {
                  type: "command",
                  command: `node "${codexRegisterScript}" --project ${options.project} --agent codex`,
                  timeout: 5
                }
              ]
            }
          ],
          Stop: [
            {
              matcher: "*",
              hooks: [
                {
                  type: "command",
                  command: `node "${codexRegisterScript}" --project ${options.project} --agent codex`,
                  timeout: 5
                }
              ]
            }
          ]
        }
      },
      null,
      2
    ),
    ".claude/settings.local.json": JSON.stringify(
      {
        hooks: {
          SessionStart: [
            {
              matcher: "",
              hooks: [
                {
                  type: "command",
                  command: `node "${statusScript}"`,
                  timeout: 3
                },
                {
                  type: "command",
                  command: `node "${registerScript}" --project ${options.project}`,
                  timeout: 5
                }
              ]
            }
          ],
          Stop: [
            {
              hooks: [
                {
                  type: "command",
                  command: `node "${registerScript}" --project ${options.project}`,
                  timeout: 5
                }
              ]
            }
          ]
        }
      },
      null,
      2
    )
  };
}

export async function runBootstrapCheck(rawOptions = {}) {
  const options = {
    target: process.cwd(),
    project: "",
    json: false,
    ...rawOptions
  };
  options.target = path.resolve(toHostPath(options.target) || options.target);
  options.project = normalizeProject(options.project) || normalizeProject(path.basename(options.target));

  const record = makeRecorder();
  const targetOk = await checkTarget(record, options);
  if (targetOk) {
    await checkFiles(record, options);
    await checkHooks(record, options);
  }

  const summary = record.checks.reduce(
    (accumulator, check) => {
      accumulator[check.status] += 1;
      return accumulator;
    },
    { pass: 0, warn: 0, fail: 0 }
  );

  return {
    ok: summary.fail === 0,
    target: options.target,
    project: options.project,
    workflowRoot,
    checks: record.checks,
    suggestedFiles: buildSuggestedFiles(options),
    summary
  };
}

function renderText(result) {
  const lines = [
    "Workflow Bootstrap Check",
    "",
    `Target: ${result.target}`,
    `Project: ${result.project}`,
    ""
  ];

  for (const check of result.checks) {
    lines.push(`[${check.status.toUpperCase()}] ${check.name}: ${check.detail}`);
  }

  lines.push(
    "",
    `Summary: ${result.summary.pass} pass, ${result.summary.warn} warn, ${result.summary.fail} fail`,
    "",
    "This command is read-only. Use --json to inspect suggestedFiles for manual review."
  );

  return lines.join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runBootstrapCheck(options);

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
