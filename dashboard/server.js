import express from "express";
import matter from "gray-matter";
import { marked } from "marked";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const host = "127.0.0.1";
const port = 3001;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mailboxRoot = path.resolve(__dirname, "../agent-mailbox");

const bucketConfig = {
  "to-claude": { key: "toClaude", recursive: false },
  "to-codex": { key: "toCodex", recursive: false },
  archive: { key: "archive", recursive: true }
};

marked.use({
  breaks: true,
  gfm: true
});

const app = express();

app.use((request, response, next) => {
  response.setHeader("Cache-Control", "no-store");
  next();
});

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

function toSortValue(created) {
  if (typeof created !== "string" || created.length === 0) {
    return 0;
  }

  const parsed = Date.parse(created);
  return Number.isNaN(parsed) ? 0 : parsed;
}

async function collectMarkdownFiles(directory, recursive) {
  let entries;

  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (recursive) {
        files.push(...(await collectMarkdownFiles(fullPath, recursive)));
      }
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

async function readMessage(filePath, bucketName) {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = matter(raw);
  const relatedFiles = Array.isArray(parsed.data.related_files)
    ? parsed.data.related_files.filter((value) => typeof value === "string")
    : [];
  const body = parsed.content.trim();

  return {
    bucket: bucketName,
    filename: path.basename(filePath),
    relativePath: normalizePath(path.relative(mailboxRoot, filePath)),
    from: typeof parsed.data.from === "string" ? parsed.data.from : "",
    to: typeof parsed.data.to === "string" ? parsed.data.to : "",
    thread: typeof parsed.data.thread === "string" ? parsed.data.thread : "",
    status: typeof parsed.data.status === "string" ? parsed.data.status : "pending",
    created: typeof parsed.data.created === "string"
      ? parsed.data.created
      : parsed.data.created instanceof Date
        ? parsed.data.created.toISOString()
        : "",
    reply_to: typeof parsed.data.reply_to === "string" ? parsed.data.reply_to : "",
    related_files: relatedFiles,
    body,
    html: body ? String(marked.parse(body)) : "",
    metadata: parsed.data,
    sortValue: toSortValue(parsed.data.created)
  };
}

async function readBucket(bucketName) {
  const config = bucketConfig[bucketName];

  if (!config) {
    throw new Error(`Unknown mailbox bucket: ${bucketName}`);
  }

  const bucketRoot = path.join(mailboxRoot, bucketName);
  const files = await collectMarkdownFiles(bucketRoot, config.recursive);
  const messages = await Promise.all(files.map((filePath) => readMessage(filePath, bucketName)));

  messages.sort((left, right) => {
    if (right.sortValue !== left.sortValue) {
      return right.sortValue - left.sortValue;
    }

    return left.relativePath.localeCompare(right.relativePath);
  });

  return messages.map(({ sortValue, ...message }) => message);
}

app.get("/api/messages", async (_request, response) => {
  try {
    const [toClaude, toCodex, archive] = await Promise.all([
      readBucket("to-claude"),
      readBucket("to-codex"),
      readBucket("archive")
    ]);

    response.json({ toClaude, toCodex, archive });
  } catch (error) {
    response.status(500).json({
      error: "Failed to read mailbox",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get("/api/messages/:dir", async (request, response) => {
  const bucketName = request.params.dir;

  if (!(bucketName in bucketConfig)) {
    response.status(404).json({ error: "Unknown mailbox bucket" });
    return;
  }

  try {
    const messages = await readBucket(bucketName);
    response.json({ messages });
  } catch (error) {
    response.status(500).json({
      error: "Failed to read mailbox",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

app.listen(port, host, () => {
  console.log(`Server listening on ${host}:${port}`);
});
