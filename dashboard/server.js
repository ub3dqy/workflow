import express from "express";
import matter from "gray-matter";
import { marked } from "marked";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const host = "127.0.0.1";
const port = 3001;
const allowedReplyTargets = new Set(["claude", "codex"]);
const allowedArchiveResolutions = new Set([
  "answered",
  "no-reply-needed",
  "superseded"
]);

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
app.use(express.json());

class ClientError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ClientError";
    this.status = status;
  }
}

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

function sanitizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toSortValue(created) {
  if (typeof created !== "string" || created.length === 0) {
    return 0;
  }

  const parsed = Date.parse(created);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function toUtcTimestamp(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function toFilenameTimestamp(createdAt) {
  return createdAt.replace(/:/g, "-");
}

function toMailboxContent(content) {
  if (typeof content !== "string" || content.length === 0) {
    return "";
  }

  return content.startsWith("\n") ? content.slice(1) : content;
}

function extractSeq(value, from) {
  if (typeof value !== "string" || value.length === 0) {
    return 0;
  }

  const escapedFrom = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = value.match(new RegExp(`-${escapedFrom}-(\\d+)$`));
  return match ? Number(match[1]) : 0;
}

function validateThread(thread) {
  const nextThread = sanitizeString(thread);

  if (!nextThread) {
    throw new ClientError(400, "thread is required");
  }

  if (
    nextThread.includes("/") ||
    nextThread.includes("\\") ||
    nextThread.includes("..")
  ) {
    throw new ClientError(400, "thread must be a safe relative slug");
  }

  return nextThread;
}

function validateReplyTarget(to) {
  const nextTarget = sanitizeString(to);

  if (!allowedReplyTargets.has(nextTarget)) {
    throw new ClientError(400, 'to must be "claude" or "codex"');
  }

  return nextTarget;
}

function validateRelativeInboxPath(relativePath) {
  const trimmed = sanitizeString(relativePath).replace(/\\/g, "/");

  if (!trimmed) {
    throw new ClientError(400, "relativePath is required");
  }

  if (path.isAbsolute(trimmed) || trimmed.includes("..")) {
    throw new ClientError(400, "relativePath must stay inside inbox buckets");
  }

  if (
    !trimmed.startsWith("to-claude/") &&
    !trimmed.startsWith("to-codex/")
  ) {
    throw new ClientError(
      400,
      'relativePath must start with "to-claude/" or "to-codex/"'
    );
  }

  const resolvedPath = path.resolve(mailboxRoot, trimmed);
  const mailboxPrefix = `${mailboxRoot}${path.sep}`;

  if (!resolvedPath.startsWith(mailboxPrefix)) {
    throw new ClientError(400, "relativePath escapes mailbox root");
  }

  return {
    relativePath: normalizePath(trimmed),
    absolutePath: resolvedPath
  };
}

function validateResolution(resolution) {
  const nextResolution = sanitizeString(resolution) || "answered";

  if (!allowedArchiveResolutions.has(nextResolution)) {
    throw new ClientError(
      400,
      'resolution must be "answered", "no-reply-needed", or "superseded"'
    );
  }

  return nextResolution;
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

async function findArchiveByFilename(filename) {
  const archiveRoot = path.join(mailboxRoot, "archive");
  const archiveFiles = await collectMarkdownFiles(archiveRoot, true);

  for (const archivedFile of archiveFiles) {
    if (path.basename(archivedFile) === filename) {
      return archivedFile;
    }
  }

  return "";
}

async function nextSequenceForThreadFrom(thread, from) {
  const mailboxFiles = await collectMarkdownFiles(mailboxRoot, true);
  let maxSeq = 0;

  for (const mailboxFile of mailboxFiles) {
    const raw = await fs.readFile(mailboxFile, "utf8");
    const parsed = matter(raw);

    if (parsed.data.thread !== thread || parsed.data.from !== from) {
      continue;
    }

    const filenameSeq = extractSeq(path.basename(mailboxFile, ".md"), from);
    const idSeq = extractSeq(sanitizeString(parsed.data.id), from);
    maxSeq = Math.max(maxSeq, filenameSeq, idSeq);
  }

  return String(maxSeq + 1).padStart(3, "0");
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
    created:
      typeof parsed.data.created === "string"
        ? parsed.data.created
        : parsed.data.created instanceof Date
          ? parsed.data.created.toISOString()
          : "",
    reply_to: typeof parsed.data.reply_to === "string" ? parsed.data.reply_to : "",
    related_files: relatedFiles,
    body,
    html: body ? String(marked.parse(body)) : "",
    metadata: parsed.data,
    sortValue: toSortValue(
      typeof parsed.data.created === "string"
        ? parsed.data.created
        : parsed.data.created instanceof Date
          ? parsed.data.created.toISOString()
          : ""
    )
  };
}

async function readBucket(bucketName) {
  const config = bucketConfig[bucketName];

  if (!config) {
    throw new Error(`Unknown mailbox bucket: ${bucketName}`);
  }

  const bucketRoot = path.join(mailboxRoot, bucketName);
  const files = await collectMarkdownFiles(bucketRoot, config.recursive);
  const messages = await Promise.all(
    files.map((filePath) => readMessage(filePath, bucketName))
  );

  messages.sort((left, right) => {
    if (right.sortValue !== left.sortValue) {
      return right.sortValue - left.sortValue;
    }

    return left.relativePath.localeCompare(right.relativePath);
  });

  return messages.map(({ sortValue, ...message }) => message);
}

async function generateMessageFile({ to, thread, body, replyTo }) {
  const from = "user";
  const targetDirName = `to-${to}`;
  const targetDirPath = path.join(mailboxRoot, targetDirName);
  const created = toUtcTimestamp();
  const filenameTimestamp = toFilenameTimestamp(created);
  const seq = await nextSequenceForThreadFrom(thread, from);
  const id = `${filenameTimestamp}-${from}-${seq}`;
  const filename = `${filenameTimestamp}-${thread}-${from}-${seq}.md`;
  const filePath = path.join(targetDirPath, filename);
  const data = {
    id,
    thread,
    from,
    to,
    status: "pending",
    created
  };

  if (replyTo) {
    data.reply_to = replyTo;
  }

  await fs.mkdir(targetDirPath, { recursive: true });
  await fs.writeFile(filePath, matter.stringify(body, data), "utf8");

  return {
    id,
    filename,
    relativePath: normalizePath(path.relative(mailboxRoot, filePath))
  };
}

async function archiveMessageFile({ relativePath, resolution }) {
  const { absolutePath, relativePath: normalizedPath } =
    validateRelativeInboxPath(relativePath);
  const filename = path.basename(normalizedPath);
  let raw;

  try {
    raw = await fs.readFile(absolutePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      const existingArchivePath = await findArchiveByFilename(filename);

      if (existingArchivePath) {
        return {
          archivedTo: normalizePath(
            path.relative(mailboxRoot, existingArchivePath)
          ),
          alreadyArchived: true
        };
      }
    }

    throw error;
  }

  const parsed = matter(raw);
  const thread = validateThread(parsed.data.thread);
  const archiveDirPath = path.join(mailboxRoot, "archive", thread);
  const archivedPath = path.join(archiveDirPath, filename);
  const archiveRelativePath = normalizePath(path.relative(mailboxRoot, archivedPath));
  const updatedData = {
    ...parsed.data,
    status: "archived",
    archived_at: toUtcTimestamp(),
    resolution
  };
  const nextContent = toMailboxContent(parsed.content);

  await fs.mkdir(archiveDirPath, { recursive: true });
  await fs.writeFile(
    absolutePath,
    matter.stringify(nextContent, updatedData),
    "utf8"
  );
  await fs.rename(absolutePath, archivedPath);

  return {
    archivedTo: archiveRelativePath,
    alreadyArchived: false
  };
}

function sendClientError(response, error) {
  if (error instanceof ClientError) {
    response.status(error.status).json({
      error: error.message
    });
    return true;
  }

  return false;
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

app.post("/api/reply", async (request, response) => {
  try {
    const to = validateReplyTarget(request.body?.to);
    const thread = validateThread(request.body?.thread);
    const body = sanitizeString(request.body?.body);
    const replyTo = sanitizeString(request.body?.reply_to);

    if (!body) {
      throw new ClientError(400, "body is required");
    }

    const created = await generateMessageFile({
      to,
      thread,
      body,
      replyTo
    });

    response.status(201).json({
      ok: true,
      filename: created.filename,
      id: created.id,
      relativePath: created.relativePath
    });
  } catch (error) {
    if (sendClientError(response, error)) {
      return;
    }

    response.status(500).json({
      error: "Failed to create reply",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post("/api/archive", async (request, response) => {
  try {
    const relativePath = request.body?.relativePath;
    const resolution = validateResolution(request.body?.resolution);
    const archived = await archiveMessageFile({
      relativePath,
      resolution
    });

    response.json({
      ok: true,
      archivedTo: archived.archivedTo,
      alreadyArchived: archived.alreadyArchived
    });
  } catch (error) {
    if (sendClientError(response, error)) {
      return;
    }

    if (error && error.code === "ENOENT") {
      response.status(404).json({
        error: "Message file not found"
      });
      return;
    }

    response.status(500).json({
      error: "Failed to archive message",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

app.listen(port, host, () => {
  console.log(`Server listening on ${host}:${port}`);
});
