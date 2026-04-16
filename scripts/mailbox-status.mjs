import fs from "node:fs/promises";
import path from "node:path";

const PREVIEW_LIMIT = 2;

function logError(error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[mailbox-status] ${message}\n`);
}

async function readStdin() {
  const chunks = [];

  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
  }

  return chunks.join("").trim();
}

function toHostPath(rawCwd) {
  if (typeof rawCwd !== "string") {
    return "";
  }

  const trimmed = rawCwd.trim();

  if (!trimmed) {
    return "";
  }

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

async function readHookCwd() {
  const rawStdin = await readStdin();

  if (!rawStdin) {
    return process.cwd();
  }

  try {
    const payload = JSON.parse(rawStdin);
    return toHostPath(payload?.cwd) || process.cwd();
  } catch {
    return process.cwd();
  }
}

async function listMarkdownFiles(directory) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });

    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name)
      .sort((left, right) => right.localeCompare(left));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);

  if (!match) {
    return {
      data: {},
      body: raw
    };
  }

  const data = {};
  const lines = match[1].split(/\r?\n/);

  for (const line of lines) {
    const fieldMatch = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);

    if (fieldMatch) {
      data[fieldMatch[1]] = fieldMatch[2].trim().replace(/^['"]|['"]$/g, "");
    }
  }

  return {
    data,
    body: raw.slice(match[0].length)
  };
}

function firstBodyLine(body) {
  const line = body
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find(Boolean);

  if (!line) {
    return "No body preview";
  }

  return line.length > 140 ? `${line.slice(0, 137)}...` : line;
}

async function readMessageSummary(rootDirectory, bucketName, filename) {
  const filePath = path.join(rootDirectory, bucketName, filename);
  const raw = await fs.readFile(filePath, "utf8");
  const { data, body } = parseFrontmatter(raw);

  return {
    bucketName,
    filename,
    thread: typeof data.thread === "string" && data.thread ? data.thread : "unknown-thread",
    from: typeof data.from === "string" && data.from ? data.from : "unknown",
    created: typeof data.created === "string" && data.created ? data.created : "unknown-time",
    preview: firstBodyLine(body)
  };
}

function buildSummary({ toClaudeFiles, toCodexFiles, previews }) {
  const lines = [
    "## Mailbox Status",
    "",
    `- Pending for Claude: ${toClaudeFiles.length}`,
    `- Pending for Codex: ${toCodexFiles.length}`
  ];

  if (previews.length > 0) {
    lines.push("", `### Latest (${previews.length}):`, "");

    for (const preview of previews) {
      const bucketLabel = preview.bucketName === "to-claude" ? "Claude inbox" : "Codex inbox";
      lines.push(
        `- [${preview.thread}] from ${preview.from}, ${preview.created} (${bucketLabel}) — ${preview.preview}`
      );
    }
  }

  return lines.join("\n");
}

async function main() {
  try {
    const cwd = await readHookCwd();
    const mailboxRoot = path.resolve(cwd, "agent-mailbox");
    const toClaudeFiles = await listMarkdownFiles(path.join(mailboxRoot, "to-claude"));
    const toCodexFiles = await listMarkdownFiles(path.join(mailboxRoot, "to-codex"));

    if (toClaudeFiles.length === 0 && toCodexFiles.length === 0) {
      return;
    }

    const previewCandidates = [
      ...toClaudeFiles.slice(0, PREVIEW_LIMIT).map((filename) => ({
        bucketName: "to-claude",
        filename
      })),
      ...toCodexFiles.slice(0, PREVIEW_LIMIT).map((filename) => ({
        bucketName: "to-codex",
        filename
      }))
    ]
      .sort((left, right) => right.filename.localeCompare(left.filename))
      .slice(0, PREVIEW_LIMIT);

    const previews = await Promise.all(
      previewCandidates.map(({ bucketName, filename }) =>
        readMessageSummary(mailboxRoot, bucketName, filename)
      )
    );

    const output = {
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: buildSummary({
          toClaudeFiles,
          toCodexFiles,
          previews
        })
      }
    };

    process.stdout.write(JSON.stringify(output));
  } catch (error) {
    logError(error);
  }
}

await main();
process.exit(0);
