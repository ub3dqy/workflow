import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const requireFromDashboard = createRequire(
  new URL("../dashboard/package.json", import.meta.url)
);
const matter = requireFromDashboard("gray-matter");
const markedModule = await import(
  pathToFileURL(requireFromDashboard.resolve("marked")).href
);
const { marked } = markedModule;

export const host = "127.0.0.1";
export const port = 3003;
export const knownBuckets = ["to-claude", "to-codex", "archive"];
export const bucketConfig = {
  "to-claude": { key: "toClaude", recursive: false },
  "to-codex": { key: "toCodex", recursive: false },
  archive: { key: "archive", recursive: true }
};

const allowedSenders = new Set(["user", "claude", "codex"]);
const allowedReplyTargets = new Set(["claude", "codex"]);
const allowedArchiveResolutions = new Set([
  "answered",
  "no-reply-needed",
  "superseded"
]);

marked.use({
  breaks: true,
  gfm: true
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const defaultMailboxRoot = path.resolve(__dirname, "../agent-mailbox");

export class ClientError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ClientError";
    this.status = status;
  }
}

export function isKnownBucket(bucketName) {
  return Object.prototype.hasOwnProperty.call(bucketConfig, bucketName);
}

export function normalizePath(value) {
  return value.split(path.sep).join("/");
}

export function sanitizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeProject(project) {
  return sanitizeString(project);
}

export function toSortValue(created) {
  if (typeof created !== "string" || created.length === 0) {
    return 0;
  }

  const parsed = Date.parse(created);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function toUtcTimestamp(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function toFilenameTimestamp(createdAt) {
  return createdAt.replace(/:/g, "-");
}

export function toMailboxContent(content) {
  if (typeof content !== "string" || content.length === 0) {
    return "";
  }

  return content.startsWith("\n") ? content.slice(1) : content;
}

export function extractSeq(value, from) {
  if (typeof value !== "string" || value.length === 0) {
    return 0;
  }

  const escapedFrom = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = value.match(new RegExp(`-${escapedFrom}-(\\d+)$`));
  return match ? Number(match[1]) : 0;
}

export function filterMessagesByProject(messages, project = "") {
  const nextProject = normalizeProject(project);

  if (!nextProject) {
    return messages;
  }

  return messages.filter(
    (message) => normalizeProject(message.project) === nextProject
  );
}

export function collectProjectValues(messages) {
  const projects = new Set();

  for (const message of messages) {
    const project = normalizeProject(message.project);

    if (project) {
      projects.add(project);
    }
  }

  return [...projects].sort((left, right) => left.localeCompare(right));
}

export function validateThread(thread) {
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

export function validateReplyTarget(to) {
  const nextTarget = sanitizeString(to);

  if (!allowedReplyTargets.has(nextTarget)) {
    throw new ClientError(400, 'to must be "claude" or "codex"');
  }

  return nextTarget;
}

export function validateSender(from) {
  const nextSender = sanitizeString(from);

  if (!allowedSenders.has(nextSender)) {
    throw new ClientError(400, 'from must be "user", "claude", or "codex"');
  }

  return nextSender;
}

export function validateRelativeInboxPath(relativePath, mailboxRoot) {
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
    bucketName: trimmed.split("/", 1)[0],
    relativePath: normalizePath(trimmed),
    absolutePath: resolvedPath
  };
}

export function validateResolution(resolution) {
  const nextResolution = sanitizeString(resolution) || "answered";

  if (!allowedArchiveResolutions.has(nextResolution)) {
    throw new ClientError(
      400,
      'resolution must be "answered", "no-reply-needed", or "superseded"'
    );
  }

  return nextResolution;
}

export async function collectMarkdownFiles(directory, recursive) {
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

export async function findArchiveByFilename(filename, mailboxRoot, archiveFiles) {
  const files =
    archiveFiles ??
    (await collectMarkdownFiles(path.join(mailboxRoot, "archive"), true));

  for (const archivedFile of files) {
    if (path.basename(archivedFile) === filename) {
      return archivedFile;
    }
  }

  return "";
}

function toMessageTimestamp(parsed) {
  if (typeof parsed.data.created === "string") {
    return parsed.data.created;
  }

  if (parsed.data.created instanceof Date) {
    return parsed.data.created.toISOString();
  }

  return "";
}

export async function readMessage(filePath, bucketName, mailboxRoot) {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = matter(raw);
  const created = toMessageTimestamp(parsed);
  const relatedFiles = Array.isArray(parsed.data.related_files)
    ? parsed.data.related_files.filter((value) => typeof value === "string")
    : [];
  const body = parsed.content.trim();

  return {
    bucket: bucketName,
    filename: path.basename(filePath),
    relativePath: normalizePath(path.relative(mailboxRoot, filePath)),
    id: typeof parsed.data.id === "string" ? parsed.data.id : "",
    from: typeof parsed.data.from === "string" ? parsed.data.from : "",
    to: typeof parsed.data.to === "string" ? parsed.data.to : "",
    thread: typeof parsed.data.thread === "string" ? parsed.data.thread : "",
    project:
      typeof parsed.data.project === "string"
        ? normalizeProject(parsed.data.project)
        : "",
    status: typeof parsed.data.status === "string" ? parsed.data.status : "pending",
    resolution:
      typeof parsed.data.resolution === "string" ? parsed.data.resolution : "",
    created,
    reply_to: typeof parsed.data.reply_to === "string" ? parsed.data.reply_to : "",
    answer_message_id:
      typeof parsed.data.answer_message_id === "string"
        ? parsed.data.answer_message_id
        : "",
    related_files: relatedFiles,
    body,
    html: body ? String(marked.parse(body)) : "",
    metadata: parsed.data,
    sortValue: toSortValue(created)
  };
}

export async function readBucket(bucketName, mailboxRoot) {
  const config = bucketConfig[bucketName];

  if (!config) {
    throw new Error(`Unknown mailbox bucket: ${bucketName}`);
  }

  const bucketRoot = path.join(mailboxRoot, bucketName);
  const files = await collectMarkdownFiles(bucketRoot, config.recursive);
  const messages = await Promise.all(
    files.map((filePath) => readMessage(filePath, bucketName, mailboxRoot))
  );

  messages.sort((left, right) => {
    if (right.sortValue !== left.sortValue) {
      return right.sortValue - left.sortValue;
    }

    return left.relativePath.localeCompare(right.relativePath);
  });

  return messages.map(({ sortValue, ...message }) => message);
}

export async function collectMailboxMessages(mailboxRoot) {
  const buckets = await Promise.all(
    knownBuckets.map(async (bucketName) => ({
      bucketName,
      messages: await readBucket(bucketName, mailboxRoot)
    }))
  );

  return buckets.flatMap((bucket) => bucket.messages);
}

export async function readMessageByRelativePath(relativePath, mailboxRoot) {
  const location = validateRelativeInboxPath(relativePath, mailboxRoot);
  return readMessage(location.absolutePath, location.bucketName, mailboxRoot);
}

export function threadExists(thread, messages) {
  return messages.some((message) => message.thread === thread);
}

export async function nextSequenceForThreadFrom(
  thread,
  from,
  mailboxRoot,
  messages
) {
  const scopedMessages = messages ?? (await collectMailboxMessages(mailboxRoot));
  let maxSeq = 0;

  for (const message of scopedMessages) {
    if (message.thread !== thread || message.from !== from) {
      continue;
    }

    const filenameSeq = extractSeq(
      path.basename(message.filename, ".md"),
      from
    );
    const idSeq = extractSeq(sanitizeString(message.id), from);
    maxSeq = Math.max(maxSeq, filenameSeq, idSeq);
  }

  return String(maxSeq + 1).padStart(3, "0");
}

export async function generateMessageFile({
  to,
  from = "user",
  thread,
  project = "",
  body,
  replyTo = "",
  mailboxRoot,
  messages
}) {
  const nextTarget = validateReplyTarget(to);
  const nextFrom = validateSender(from);
  const nextThread = validateThread(thread);
  const nextProject = normalizeProject(project);
  const nextBody = typeof body === "string" ? body.trim() : "";
  const nextReplyTo = sanitizeString(replyTo);

  if (!nextBody) {
    throw new ClientError(400, "body is required");
  }

  const targetDirName = `to-${nextTarget}`;
  const targetDirPath = path.join(mailboxRoot, targetDirName);
  const created = toUtcTimestamp();
  const filenameTimestamp = toFilenameTimestamp(created);
  const seq = await nextSequenceForThreadFrom(
    nextThread,
    nextFrom,
    mailboxRoot,
    messages
  );
  const id = `${filenameTimestamp}-${nextFrom}-${seq}`;
  const filename = `${filenameTimestamp}-${nextThread}-${nextFrom}-${seq}.md`;
  const filePath = path.join(targetDirPath, filename);
  const data = {
    id,
    thread: nextThread,
    from: nextFrom,
    to: nextTarget,
    status: "pending",
    created
  };

  if (nextReplyTo) {
    data.reply_to = nextReplyTo;
  }

  if (nextProject) {
    data.project = nextProject;
  }

  await fs.mkdir(targetDirPath, { recursive: true });
  await fs.writeFile(filePath, matter.stringify(nextBody, data), "utf8");

  return {
    id,
    filename,
    relativePath: normalizePath(path.relative(mailboxRoot, filePath)),
    to: nextTarget,
    from: nextFrom,
    thread: nextThread,
    project: nextProject
  };
}

export async function archiveMessageFile({
  relativePath,
  resolution,
  mailboxRoot,
  answerMessageId = "",
  archiveFiles
}) {
  const { absolutePath, relativePath: normalizedPath } =
    validateRelativeInboxPath(relativePath, mailboxRoot);
  const filename = path.basename(normalizedPath);
  let raw;

  try {
    raw = await fs.readFile(absolutePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      const existingArchivePath = await findArchiveByFilename(
        filename,
        mailboxRoot,
        archiveFiles
      );

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
    resolution: validateResolution(resolution)
  };
  const nextAnswerMessageId = sanitizeString(answerMessageId);

  if (nextAnswerMessageId) {
    updatedData.answer_message_id = nextAnswerMessageId;
  }

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

export function getReplyTargetForMessage(message, from = "user") {
  const sender = validateSender(from);
  const participants = [message.from, message.to].filter((value, index, values) => {
    return allowedReplyTargets.has(value) && values.indexOf(value) === index;
  });

  if (sender === "user") {
    const fallback = participants[0];

    if (!fallback) {
      throw new ClientError(400, "target message has no agent participant");
    }

    return fallback;
  }

  const nonSender = participants.find((value) => value !== sender);

  if (!nonSender) {
    throw new ClientError(
      400,
      "cannot infer reply target for this sender from target message"
    );
  }

  return nonSender;
}

export async function recoverOrphans(mailboxRoot) {
  const messages = await collectMailboxMessages(mailboxRoot);
  const replyIndex = new Map();

  for (const message of messages) {
    const replyTo = sanitizeString(message.reply_to);

    if (!replyTo || !message.thread) {
      continue;
    }

    const key = `${message.thread}\u0000${replyTo}`;

    if (!replyIndex.has(key)) {
      replyIndex.set(key, message);
    }
  }

  const recovered = [];

  for (const message of messages) {
    if (
      (message.bucket !== "to-claude" && message.bucket !== "to-codex") ||
      message.status !== "pending" ||
      !message.id ||
      !message.thread
    ) {
      continue;
    }

    const matchingReply = replyIndex.get(`${message.thread}\u0000${message.id}`);

    if (!matchingReply || matchingReply.relativePath === message.relativePath) {
      continue;
    }

    const archived = await archiveMessageFile({
      relativePath: message.relativePath,
      resolution: "answered",
      mailboxRoot,
      answerMessageId: matchingReply.id
    });

    recovered.push({
      relativePath: message.relativePath,
      archivedTo: archived.archivedTo,
      answerMessageId: matchingReply.id
    });
  }

  return recovered;
}
