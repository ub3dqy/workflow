import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  defaultMailboxRoot,
  extractFilenameProject,
  normalizeProject,
  toUtcTimestamp,
  toFilenameTimestamp
} from "./mailbox-lib.mjs";

const requireFromDashboard = createRequire(
  new URL("../dashboard/package.json", import.meta.url)
);
const matter = requireFromDashboard("gray-matter");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mailboxRoot = defaultMailboxRoot;
const runtimeRoot = path.resolve(__dirname, "../mailbox-runtime");

function parseArgv(argv) {
  const rest = argv.slice(2);
  let mode = "dry-run";
  let restoreLog = "";
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === "--dry-run") mode = "dry-run";
    else if (arg === "--apply") mode = "apply";
    else if (arg === "--restore") {
      mode = "restore";
      restoreLog = rest[i + 1] || "";
      i += 1;
    }
  }
  return { mode, restoreLog };
}

async function collectMdFiles(root, recursive) {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === "ENOENT") return [];
    throw err;
  }
  const files = [];
  for (const e of entries) {
    const full = path.join(root, e.name);
    if (e.isDirectory()) {
      if (recursive) files.push(...(await collectMdFiles(full, recursive)));
      continue;
    }
    if (e.isFile() && e.name.endsWith(".md")) files.push(full);
  }
  return files;
}

async function scanMailbox() {
  const buckets = [
    { name: "to-claude", recursive: false },
    { name: "to-codex", recursive: false },
    { name: "archive", recursive: true }
  ];
  const all = [];
  for (const b of buckets) {
    const bucketRoot = path.join(mailboxRoot, b.name);
    const files = await collectMdFiles(bucketRoot, b.recursive);
    for (const f of files) all.push(f);
  }
  return all;
}

async function readFrontmatterProject(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = matter(raw);
  const project =
    typeof parsed.data.project === "string" ? parsed.data.project.trim() : "";
  return project;
}

async function planRenames(files) {
  const plan = [];
  const failures = [];
  const alreadyPrefixed = [];
  for (const filePath of files) {
    const basename = path.basename(filePath);
    if (extractFilenameProject(basename)) {
      alreadyPrefixed.push(filePath);
      continue;
    }
    let project;
    try {
      project = await readFrontmatterProject(filePath);
    } catch (err) {
      failures.push({ filePath, reason: `frontmatter read failed: ${err.message}` });
      continue;
    }
    if (!project) {
      failures.push({
        filePath,
        reason: "frontmatter `project` is missing or empty"
      });
      continue;
    }
    let normalized;
    try {
      normalized = normalizeProject(project);
    } catch (err) {
      failures.push({
        filePath,
        reason: `normalizeProject rejected: ${err.message}`
      });
      continue;
    }
    if (!normalized) {
      failures.push({
        filePath,
        reason: "normalizeProject returned empty"
      });
      continue;
    }
    const dir = path.dirname(filePath);
    const newBase = `${normalized}__${basename}`;
    const newPath = path.join(dir, newBase);
    plan.push({ from: filePath, to: newPath });
  }
  return { plan, failures, alreadyPrefixed };
}

async function writeLog(entries) {
  await fs.mkdir(runtimeRoot, { recursive: true });
  const ts = toFilenameTimestamp(toUtcTimestamp());
  const logPath = path.join(runtimeRoot, `migration-${ts}.log`);
  const lines = entries.map(
    (e) =>
      `${path.relative(mailboxRoot, e.from)}\t${path.relative(mailboxRoot, e.to)}`
  );
  await fs.writeFile(logPath, lines.join("\n") + (lines.length ? "\n" : ""), "utf8");
  return logPath;
}

async function runDryRun() {
  const files = await scanMailbox();
  const { plan, failures, alreadyPrefixed } = await planRenames(files);
  console.log(`mailboxRoot: ${mailboxRoot}`);
  console.log(`scanned: ${files.length}`);
  console.log(`to-migrate: ${plan.length}`);
  console.log(`already-prefixed: ${alreadyPrefixed.length}`);
  console.log(`failures: ${failures.length}`);
  for (const p of plan) {
    console.log(
      `RENAME ${path.relative(mailboxRoot, p.from)} -> ${path.relative(mailboxRoot, p.to)}`
    );
  }
  for (const f of failures) {
    console.error(
      `FAIL ${path.relative(mailboxRoot, f.filePath)}: ${f.reason}`
    );
  }
  if (failures.length > 0) process.exit(1);
}

async function runApply() {
  const files = await scanMailbox();
  const { plan, failures, alreadyPrefixed } = await planRenames(files);
  if (failures.length > 0) {
    console.error(`refusing to apply: ${failures.length} failures`);
    for (const f of failures) {
      console.error(
        `FAIL ${path.relative(mailboxRoot, f.filePath)}: ${f.reason}`
      );
    }
    process.exit(1);
  }
  const applied = [];
  for (const p of plan) {
    await fs.rename(p.from, p.to);
    applied.push(p);
  }
  const logPath = applied.length > 0 ? await writeLog(applied) : "";
  console.log(`mailboxRoot: ${mailboxRoot}`);
  console.log(`renamed: ${applied.length}`);
  console.log(`already-prefixed: ${alreadyPrefixed.length}`);
  console.log(`failures: 0`);
  if (logPath) console.log(`log: ${logPath}`);
}

async function runRestore(restoreLog) {
  if (!restoreLog) {
    console.error("--restore requires a log path argument");
    process.exit(1);
  }
  const logAbs = path.isAbsolute(restoreLog)
    ? restoreLog
    : path.resolve(process.cwd(), restoreLog);
  const raw = await fs.readFile(logAbs, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  let restored = 0;
  let skipped = 0;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const [oldRel, newRel] = lines[i].split("\t");
    if (!oldRel || !newRel) continue;
    const oldAbs = path.join(mailboxRoot, oldRel);
    const newAbs = path.join(mailboxRoot, newRel);
    try {
      await fs.access(newAbs);
    } catch {
      skipped += 1;
      continue;
    }
    try {
      await fs.access(oldAbs);
      skipped += 1;
      continue;
    } catch {}
    await fs.rename(newAbs, oldAbs);
    restored += 1;
  }
  console.log(`restored: ${restored}`);
  console.log(`skipped: ${skipped}`);
}

async function main() {
  const { mode, restoreLog } = parseArgv(process.argv);
  if (mode === "dry-run") await runDryRun();
  else if (mode === "apply") await runApply();
  else if (mode === "restore") await runRestore(restoreLog);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
