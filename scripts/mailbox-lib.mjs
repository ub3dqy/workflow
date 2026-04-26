import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const requireFromDashboard = createRequire(
  new URL("../dashboard/package.json", import.meta.url)
);
const matter = requireFromDashboard("gray-matter");

export const host = "127.0.0.1";
export const port = Number(process.env.PORT) || 3003;
export const knownBuckets = ["to-claude", "to-codex", "archive"];
export const bucketConfig = {
  "to-claude": { key: "toClaude", recursive: false },
  "to-codex": { key: "toCodex", recursive: false },
  archive: { key: "archive", recursive: true }
};

const allowedSenders = new Set(["claude", "codex"]);
const allowedReplyTargets = new Set(["claude", "codex"]);
const allowedArchiveResolutions = new Set([
  "answered",
  "no-reply-needed",
  "superseded"
]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const defaultMailboxRoot = process.env.MAILBOX_ROOT
  ? path.resolve(process.env.MAILBOX_ROOT)
  : path.resolve(__dirname, "../agent-mailbox");

export function toHostPath(rawCwd) {
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

function sanitizeAgent(value) {
  const nextAgent = sanitizeString(value).toLowerCase();
  return nextAgent === "claude" || nextAgent === "codex" ? nextAgent : "";
}

function parseSessionTimestamp(value) {
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) ? epoch : 0;
}

function compareSessionMatch(left, right) {
  if (right.cwd.length !== left.cwd.length) {
    return right.cwd.length - left.cwd.length;
  }

  return parseSessionTimestamp(right.last_seen) - parseSessionTimestamp(left.last_seen);
}

function detectAgentFromEnvironment(env = process.env) {
  const explicit =
    sanitizeAgent(env.MAILBOX_AGENT) ||
    sanitizeAgent(env.AGENT_MAILBOX_AGENT);

  if (explicit) {
    return explicit;
  }

  if (sanitizeString(env.CODEX_THREAD_ID)) {
    return "codex";
  }

  if (sanitizeString(env.CLAUDE_PROJECT_DIR)) {
    return "claude";
  }

  return "";
}

async function resolveCallerSessions({ cwd, runtimeRoot }) {
  const sessionsPath = path.join(runtimeRoot, "sessions.json");
  let raw;

  try {
    raw = await fs.readFile(sessionsPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  let list;
  try {
    list = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(list)) {
    return [];
  }

  const targetHost = toHostPath(cwd);
  if (!targetHost) {
    return [];
  }

  const targetNormalized = path.normalize(targetHost).replace(/[\\/]+$/, "");
  // NTFS (Windows + WSL /mnt/<letter>/ mounts) is case-insensitive. Sessions
  // are registered on Windows (capital drive + mixed case), but agent cwd may
  // arrive from WSL with lowercase drive path (`/mnt/e/project/workflow` vs
  // the registered `/mnt/e/Project/workflow`). Case-fold both sides regardless
  // of process.platform so same-project CLI operations work across WSL ↔
  // Windows even when WSL cwd casing differs. See Codex round-4 verification.
  const caseFold = (value) => value.toLowerCase();
  const targetFolded = caseFold(targetNormalized);
  const matches = [];

  for (const entry of list) {
    if (!entry?.cwd) {
      continue;
    }

    const entryHost = toHostPath(entry.cwd);
    if (!entryHost) {
      continue;
    }

    const entryNormalized = path.normalize(entryHost).replace(/[\\/]+$/, "");
    const entryFolded = caseFold(entryNormalized);

    if (targetFolded === entryFolded) {
      matches.push({
        ...entry,
        cwd: entryNormalized
      });
      continue;
    }

    const separator = entryFolded.includes("\\") ? "\\" : "/";
    if (targetFolded.startsWith(entryFolded + separator)) {
      matches.push({
        ...entry,
        cwd: entryNormalized
      });
    }
  }

  matches.sort(compareSessionMatch);
  return matches;
}

export async function resolveCallerProject({ cwd, runtimeRoot }) {
  const [entry] = await resolveCallerSessions({ cwd, runtimeRoot });
  return normalizeProject(entry?.project) || "";
}

export async function resolveCallerAgent({ cwd, runtimeRoot }) {
  const matches = await resolveCallerSessions({ cwd, runtimeRoot });
  const preferredAgent = detectAgentFromEnvironment();

  if (preferredAgent) {
    return matches.some(
      (entry) => sanitizeAgent(entry.agent) === preferredAgent
    )
      ? preferredAgent
      : "";
  }

  const agents = new Set(
    matches
      .map((entry) => sanitizeAgent(entry.agent))
      .filter(Boolean)
  );

  if (agents.size !== 1) {
    return "";
  }

  return Array.from(agents)[0];
}

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
  const next = sanitizeString(project);
  if (next.includes("__")) {
    throw new ClientError(
      400,
      'project slug must not contain "__" (filename-prefix separator)'
    );
  }
  return next;
}

export function extractFilenameProject(filename) {
  if (typeof filename !== "string") return "";
  const base = path.basename(filename);
  const idx = base.indexOf("__");
  if (idx <= 0) return "";
  return base.slice(0, idx);
}

export function validateProjectScope(currentProject, message) {
  const nextCurrent = normalizeProject(currentProject);

  if (!nextCurrent) {
    throw new ClientError(400, "project is required for agent-path operations");
  }

  const messageProject = normalizeProject(message?.project);

  if (!messageProject) {
    throw new ClientError(400, "target message has no project — cannot validate scope");
  }

  if (nextCurrent !== messageProject) {
    throw new ClientError(
      400,
      `project scope mismatch: agent bound to "${nextCurrent}", message belongs to "${messageProject}"`
    );
  }

  return {
    project: nextCurrent
  };
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
    throw new ClientError(400, 'from must be "claude" or "codex"');
  }

  return nextSender;
}

export function validateRelativeInboxPath(
  relativePath,
  mailboxRoot,
  { project } = {}
) {
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

  if (project) {
    const nextProject = normalizeProject(project);
    const basename = path.basename(trimmed);
    if (extractFilenameProject(basename) !== nextProject) {
      throw new ClientError(
        400,
        `relativePath basename does not belong to bound project "${nextProject}"`
      );
    }
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

export function validateRelativeMessagePath(
  relativePath,
  mailboxRoot,
  { project } = {}
) {
  const trimmed = sanitizeString(relativePath).replace(/\\/g, "/");

  if (!trimmed) {
    throw new ClientError(400, "relativePath is required");
  }

  if (path.isAbsolute(trimmed) || trimmed.includes("..")) {
    throw new ClientError(400, "relativePath must stay inside mailbox buckets");
  }

  if (
    !trimmed.startsWith("to-claude/") &&
    !trimmed.startsWith("to-codex/") &&
    !trimmed.startsWith("archive/")
  ) {
    throw new ClientError(
      400,
      'relativePath must start with "to-claude/", "to-codex/", or "archive/"'
    );
  }

  if (project) {
    const nextProject = normalizeProject(project);
    const basename = path.basename(trimmed);
    if (extractFilenameProject(basename) !== nextProject) {
      throw new ClientError(
        400,
        `relativePath basename does not belong to bound project "${nextProject}"`
      );
    }
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

export async function appendNoteToMessageFile({
  relativePath,
  note,
  mailboxRoot
}) {
  const { absolutePath, relativePath: normalizedPath } =
    validateRelativeMessagePath(relativePath, mailboxRoot);
  const trimmedNote = typeof note === "string" ? note.trim() : "";

  if (!trimmedNote) {
    throw new ClientError(400, "note is required");
  }

  if (trimmedNote.length > 4000) {
    throw new ClientError(400, "note must be 4000 characters or fewer");
  }

  const raw = await fs.readFile(absolutePath, "utf8");
  const parsed = matter(raw);
  const existingContent = parsed.content.replace(/\s+$/, "");
  const appendedAt = toUtcTimestamp();
  const appendedBlock = [
    "",
    "",
    "---",
    "",
    `**User note · ${appendedAt}**`,
    "",
    trimmedNote,
    ""
  ].join("\n");
  const nextContent = existingContent + appendedBlock;

  await fs.writeFile(
    absolutePath,
    matter.stringify(nextContent, parsed.data),
    "utf8"
  );

  return {
    relativePath: normalizePath(normalizedPath),
    appendedAt
  };
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
    // Display-friendly normalized timestamp. This intentionally falls back to
    // `created` for legacy/unread messages; callers that need unread truth must
    // inspect raw frontmatter via `metadata.received_at`.
    received_at: toMessageTimestamp({
      data: { created: parsed.data.received_at ?? parsed.data.created }
    }),
    reply_to: typeof parsed.data.reply_to === "string" ? parsed.data.reply_to : "",
    answer_message_id:
      typeof parsed.data.answer_message_id === "string"
        ? parsed.data.answer_message_id
        : "",
    answered_at: toMessageTimestamp({
      data: { created: parsed.data.answered_at }
    }),
    related_files: relatedFiles,
    body,
    metadata: parsed.data,
    sortValue: toSortValue(created)
  };
}

export async function readBucket(bucketName, mailboxRoot, { project } = {}) {
  const config = bucketConfig[bucketName];

  if (!config) {
    throw new Error(`Unknown mailbox bucket: ${bucketName}`);
  }

  const bucketRoot = path.join(mailboxRoot, bucketName);
  let files = await collectMarkdownFiles(bucketRoot, config.recursive);
  if (project) {
    const nextProject = normalizeProject(project);
    files = files.filter(
      (file) => extractFilenameProject(file) === nextProject
    );
  }
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

export async function collectMailboxMessages(mailboxRoot, { project } = {}) {
  const buckets = await Promise.all(
    knownBuckets.map(async (bucketName) => ({
      bucketName,
      messages: await readBucket(bucketName, mailboxRoot, { project })
    }))
  );

  return buckets.flatMap((bucket) => bucket.messages);
}

export async function readMessageByRelativePath(
  relativePath,
  mailboxRoot,
  { project } = {}
) {
  const location = validateRelativeInboxPath(relativePath, mailboxRoot, {
    project
  });
  return readMessage(location.absolutePath, location.bucketName, mailboxRoot);
}

export function threadExists(thread, messages) {
  return messages.some((message) => message.thread === thread);
}

export async function markMessageReceived(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = matter(raw);

  if ("received_at" in parsed.data) {
    return { mutated: false };
  }

  parsed.data.received_at = toUtcTimestamp();
  const tmpPath = `${filePath}.tmp`;

  await fs.writeFile(
    tmpPath,
    matter.stringify(parsed.content, parsed.data),
    "utf8"
  );
  await fs.rename(tmpPath, filePath);

  return {
    mutated: true,
    received_at: parsed.data.received_at
  };
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
  from,
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

  if (!nextProject) {
    throw new ClientError(
      400,
      "project is required to generate message filename"
    );
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
  const filename = `${nextProject}__${filenameTimestamp}-${nextThread}-${nextFrom}-${seq}.md`;
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
    project: nextProject,
    created
  };
}

export async function archiveMessageFile({
  relativePath,
  resolution,
  mailboxRoot,
  answerMessageId = "",
  answeredAt = "",
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
  const archivedAt = toUtcTimestamp();
  const updatedData = {
    ...parsed.data,
    status: "archived",
    archived_at: archivedAt,
    resolution: validateResolution(resolution)
  };

  if (!("received_at" in parsed.data) || !parsed.data.received_at) {
    updatedData.received_at = archivedAt;
  }

  const nextAnswerMessageId = sanitizeString(answerMessageId);

  if (nextAnswerMessageId) {
    updatedData.answer_message_id = nextAnswerMessageId;
  }

  const nextAnsweredAt = sanitizeString(answeredAt);

  if (nextAnsweredAt && updatedData.resolution === "answered") {
    updatedData.answered_at = nextAnsweredAt;
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

export function getReplyTargetForMessage(message, from) {
  const sender = validateSender(from);
  const participants = [message.from, message.to].filter((value, index, values) => {
    return allowedReplyTargets.has(value) && values.indexOf(value) === index;
  });

  const nonSender = participants.find((value) => value !== sender);

  if (!nonSender) {
    // Single-agent-participant case: message was from/to "user" (or non-agent sender),
    // leaving only the replying agent as the known participant. In the dual-agent
    // workflow (claude ↔ codex), default reply target to the "other" agent.
    return sender === "claude" ? "codex" : "claude";
  }

  return nonSender;
}

export async function recoverOrphans(mailboxRoot, { project } = {}) {
  const nextProject = normalizeProject(project);
  if (!nextProject) {
    throw new ClientError(400, "project required for recoverOrphans");
  }
  const messages = await collectMailboxMessages(mailboxRoot, {
    project: nextProject
  });
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
      answerMessageId: matchingReply.id,
      answeredAt: matchingReply.created
    });

    recovered.push({
      relativePath: message.relativePath,
      archivedTo: archived.archivedTo,
      answerMessageId: matchingReply.id,
      project: message.project || ""
    });
  }

  return recovered;
}
