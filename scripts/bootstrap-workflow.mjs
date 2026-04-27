#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { runBootstrapCheck } from "./workflow-bootstrap-check.mjs";

const __filename = fileURLToPath(import.meta.url);

const FILE_PURPOSES = {
  ".codex/config.toml": "Enable Codex hook support for the target project.",
  ".codex/hooks.json": "Register Codex sessions with the workflow mailbox runtime.",
  ".claude/settings.local.json": "Register Claude sessions and show mailbox status at session start.",
  ".mcp.json": "Register the Claude mailbox wake-up channel for this project."
};

function normalizeProject(project) {
  if (typeof project !== "string") return "";
  return project.trim().replace(/^['"]|['"]$/g, "");
}

function parseArgs(argv) {
  const options = {
    target: process.cwd(),
    project: "",
    write: false,
    force: false,
    json: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--write") {
      options.write = true;
      continue;
    }
    if (arg === "--force") {
      options.force = true;
      continue;
    }
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

  options.target = path.resolve(options.target);
  if (!options.project) {
    options.project = normalizeProject(path.basename(options.target));
  }

  return options;
}

async function statIfExists(filePath) {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    if (error?.code === "ENOTDIR") return null;
    throw error;
  }
}

async function findBlockingParent(basePath, targetPath) {
  const relativeTarget = path.relative(basePath, targetPath);
  const parts = relativeTarget.split(path.sep).filter(Boolean);
  for (let index = 0; index < parts.length - 1; index += 1) {
    const candidate = path.join(basePath, ...parts.slice(0, index + 1));
    const stats = await statIfExists(candidate);
    if (stats && !stats.isDirectory()) {
      return {
        relativePath: path.relative(basePath, candidate),
        targetPath: candidate
      };
    }
  }
  return null;
}

export async function buildBootstrapPlan(rawOptions = {}) {
  const options = {
    target: process.cwd(),
    project: "",
    write: false,
    force: false,
    ...rawOptions
  };
  options.target = path.resolve(options.target);
  options.project = normalizeProject(options.project) || normalizeProject(path.basename(options.target));

  const check = await runBootstrapCheck({
    target: options.target,
    project: options.project
  });
  const files = Object.entries(check.suggestedFiles).map(([relativePath, body]) => {
    const targetPath = path.join(options.target, relativePath);
    return {
      relativePath,
      targetPath,
      purpose: FILE_PURPOSES[relativePath] || "Workflow bootstrap file.",
      body,
      exists: false,
      action: "pending",
      blockedBy: ""
    };
  });

  for (const file of files) {
    const blockingParent = await findBlockingParent(options.target, file.targetPath);
    const stats = await statIfExists(file.targetPath);
    file.exists = Boolean(stats);

    if (!check.ok) {
      file.action = "blocked";
    } else if (blockingParent) {
      file.action = "blocked_parent";
      file.blockedBy = blockingParent.relativePath;
    } else if (stats && !stats.isFile()) {
      file.action = "blocked_existing_path";
    } else if (file.exists && !options.force) {
      file.action = "skip_exists";
    } else {
      file.action = options.write ? "write" : "dry_run";
    }
  }

  return {
    ok: check.ok,
    target: options.target,
    project: options.project,
    write: Boolean(options.write),
    force: Boolean(options.force),
    files,
    checkSummary: check.summary
  };
}

export async function applyBootstrapPlan(plan) {
  const written = [];

  for (const file of plan.files) {
    if (file.action !== "write") continue;
    await fs.mkdir(path.dirname(file.targetPath), { recursive: true });
    await fs.writeFile(file.targetPath, `${file.body.trimEnd()}\n`, "utf8");
    written.push(file.relativePath);
  }

  return written;
}

function renderText(plan, written = []) {
  const mode = plan.write ? "WRITE" : "DRY-RUN";
  const lines = [
    `Workflow Bootstrap (${mode})`,
    "",
    `Target: ${plan.target}`,
    `Project: ${plan.project}`,
    ""
  ];

  for (const file of plan.files) {
    lines.push(
      `- ${file.relativePath}: ${file.action}`,
      `  purpose: ${file.purpose}`
    );
    if (file.blockedBy) {
      lines.push(`  blocked_by: ${file.blockedBy}`);
    }
  }

  if (written.length > 0) {
    lines.push("", `Written: ${written.join(", ")}`);
  }

  lines.push(
    "",
    "Default mode is read-only. Re-run with --write to create missing files; add --force to overwrite existing files."
  );

  return lines.join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const plan = await buildBootstrapPlan(options);
  const written = options.write ? await applyBootstrapPlan(plan) : [];

  if (options.json) {
    console.log(JSON.stringify({ ...plan, written }, null, 2));
  } else {
    console.log(renderText(plan, written));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  await main();
}
