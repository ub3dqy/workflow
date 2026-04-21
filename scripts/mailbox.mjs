import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import {
  archiveMessageFile,
  collectMailboxMessages,
  ClientError,
  defaultMailboxRoot,
  filterMessagesByProject,
  generateMessageFile,
  getReplyTargetForMessage,
  markMessageReceived,
  normalizeProject,
  normalizePath,
  readMessageByRelativePath,
  recoverOrphans,
  resolveCallerProject,
  sanitizeString,
  threadExists,
  validateProjectScope,
  validateResolution,
  validateSender,
  validateThread
} from "./mailbox-lib.mjs";

const mailboxRoot = defaultMailboxRoot;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const runtimeRoot = path.resolve(__dirname, "../mailbox-runtime");
const knownCommands = new Set(["send", "list", "reply", "archive", "recover"]);

function parseCommand(argv) {
  const [command, ...rest] = argv;

  if (!command || !knownCommands.has(command)) {
    throw new ClientError(64, usageText());
  }

  return { command, rest };
}

function parseOptions(args, options) {
  try {
    return parseArgs({
      args,
      allowPositionals: false,
      options
    }).values;
  } catch (error) {
    throw new ClientError(64, error instanceof Error ? error.message : String(error));
  }
}

async function readBody(options) {
  const inlineBody = sanitizeString(options.body);
  const filePath = sanitizeString(options.file);

  if (inlineBody && filePath) {
    throw new ClientError(64, "use either --body or --file");
  }

  if (filePath) {
    const raw = await fs.readFile(path.resolve(filePath), "utf8");
    const fromFile = raw.trim();

    if (!fromFile) {
      throw new ClientError(64, "body file is empty");
    }

    return fromFile;
  }

  if (!inlineBody) {
    throw new ClientError(64, "body is required");
  }

  return inlineBody;
}

function formatTable(messages) {
  if (messages.length === 0) {
    return "No messages.";
  }

  const headers = [
    "bucket",
    "project",
    "thread",
    "from",
    "to",
    "status",
    "created",
    "relativePath"
  ];
  const rows = messages.map((message) => headers.map((header) => String(message[header] ?? "")));
  const widths = headers.map((header, index) => {
    return Math.max(
      header.length,
      ...rows.map((row) => row[index].length)
    );
  });
  const renderRow = (values) =>
    values.map((value, index) => value.padEnd(widths[index])).join("  ");

  return [renderRow(headers), renderRow(widths.map((width) => "-".repeat(width))), ...rows.map(renderRow)].join("\n");
}

function usageText() {
  return [
    "Usage:",
    "  node scripts/mailbox.mjs send --from <claude|codex> --to <claude|codex> --thread <slug> --project <name> (--body <text> | --file <path>) [--reply-to <id>] [--existing-thread]",
    "  node scripts/mailbox.mjs list [--bucket <to-claude|to-codex|archive|all>] --project <name> [--json]",
    "  node scripts/mailbox.mjs reply --from <claude|codex> --project <name> --to <relativePath> (--body <text> | --file <path>)",
    "  node scripts/mailbox.mjs archive --path <relativePath> --project <name> [--resolution <answered|no-reply-needed|superseded>] [--answered-at <UTC ISO> --answer-message-id <id>]",
    "    answered resolution requires --answered-at",
    "  node scripts/mailbox.mjs recover --project <name>"
  ].join("\n");
}

async function handleSend(args) {
  const options = parseOptions(args, {
    from: { type: "string" },
    to: { type: "string" },
    thread: { type: "string" },
    project: { type: "string" },
    body: { type: "string" },
    file: { type: "string" },
    "reply-to": { type: "string" },
    "existing-thread": { type: "boolean" },
    json: { type: "boolean" }
  });
  const from = validateSender(options.from);
  const thread = validateThread(options.thread);
  const project = normalizeProject(options.project);
  if (!project) {
    throw new ClientError(
      64,
      "--project is required (agent-path isolation); cwd autodetect removed per ТЗ"
    );
  }
  const boundProject = await resolveCallerProject({
    cwd: process.cwd(),
    runtimeRoot
  });
  if (!boundProject) {
    throw new ClientError(64, "send requires bound session for current cwd");
  }
  if (boundProject !== project) {
    throw new ClientError(
      64,
      `session bound to "${boundProject}", refusing send for project "${project}"`
    );
  }
  const body = await readBody(options);
  const messages = await collectMailboxMessages(mailboxRoot);

  if (options["existing-thread"] && !threadExists(thread, messages)) {
    throw new ClientError(64, `thread "${thread}" does not exist`);
  }

  const created = await generateMessageFile({
    from,
    to: options.to,
    thread,
    project,
    body,
    replyTo: options["reply-to"],
    mailboxRoot,
    messages
  });

  if (options.json) {
    console.log(JSON.stringify(created, null, 2));
    return;
  }

  console.log(created.relativePath);
}

async function handleList(args) {
  const options = parseOptions(args, {
    bucket: { type: "string" },
    project: { type: "string" },
    json: { type: "boolean" }
  });
  const bucket = sanitizeString(options.bucket) || "all";
  const project = normalizeProject(options.project);
  if (!project) {
    throw new ClientError(
      64,
      "--project is required (agent-path list must be scoped to one project)"
    );
  }
  const messages = await collectMailboxMessages(mailboxRoot);
  const filteredByBucket =
    bucket === "all"
      ? messages
      : messages.filter((message) => message.bucket === bucket);
  const filtered = filterMessagesByProject(filteredByBucket, project);

  for (const msg of filtered) {
    if (
      msg.status === "pending" &&
      (msg.bucket === "to-claude" || msg.bucket === "to-codex")
    ) {
      const abs = path.resolve(mailboxRoot, msg.relativePath);
      await markMessageReceived(abs);
    }
  }

  if (
    bucket !== "all" &&
    filteredByBucket.length === 0 &&
    !["to-claude", "to-codex", "archive"].includes(bucket)
  ) {
    throw new ClientError(
      64,
      'bucket must be "to-claude", "to-codex", "archive", or "all"'
    );
  }

  if (options.json) {
    console.log(JSON.stringify(filtered, null, 2));
    return;
  }

  console.log(formatTable(filtered));
}

async function handleReply(args) {
  const options = parseOptions(args, {
    to: { type: "string" },
    from: { type: "string" },
    project: { type: "string" },
    body: { type: "string" },
    file: { type: "string" },
    json: { type: "boolean" }
  });
  const from = validateSender(options.from);
  const explicitProject = normalizeProject(options.project);
  if (!explicitProject) {
    throw new ClientError(
      64,
      "--project is required (reply must stay within agent session project)"
    );
  }
  const targetMessage = await readMessageByRelativePath(options.to, mailboxRoot);
  validateProjectScope(explicitProject, targetMessage);
  const location = path.resolve(mailboxRoot, targetMessage.relativePath);
  await markMessageReceived(location);
  const body = await readBody(options);
  const to = getReplyTargetForMessage(targetMessage, from);
  const messages = await collectMailboxMessages(mailboxRoot);
  const created = await generateMessageFile({
    from,
    to,
    thread: targetMessage.thread,
    project: targetMessage.project,
    body,
    replyTo: targetMessage.id,
    mailboxRoot,
    messages
  });
  const archived = await archiveMessageFile({
    relativePath: targetMessage.relativePath,
    resolution: "answered",
    mailboxRoot,
    answerMessageId: created.id,
    answeredAt: created.created
  });

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          reply: created,
          archived
        },
        null,
        2
      )
    );
    return;
  }

  console.log(
    `${created.relativePath}\n${archived.archivedTo}`
  );
}

async function handleArchive(args) {
  const options = parseOptions(args, {
    path: { type: "string" },
    project: { type: "string" },
    resolution: { type: "string" },
    "answered-at": { type: "string" },
    "answer-message-id": { type: "string" },
    json: { type: "boolean" }
  });
  const explicitProject = normalizeProject(options.project);
  if (!explicitProject) {
    throw new ClientError(
      64,
      "--project is required (archive scoped to single project)"
    );
  }
  const targetMessage = await readMessageByRelativePath(options.path, mailboxRoot);
  validateProjectScope(explicitProject, targetMessage);
  const nextResolution = validateResolution(options.resolution);
  const nextAnsweredAt = sanitizeString(options["answered-at"]);
  const nextAnswerMessageId = sanitizeString(options["answer-message-id"]);
  if (nextResolution === "answered" && !nextAnsweredAt) {
    throw new ClientError(
      64,
      "--answered-at is required when --resolution=answered (archive timeline completeness)"
    );
  }
  const archived = await archiveMessageFile({
    relativePath: options.path,
    resolution: nextResolution,
    mailboxRoot,
    answeredAt: nextAnsweredAt,
    answerMessageId: nextAnswerMessageId
  });

  if (options.json) {
    console.log(JSON.stringify(archived, null, 2));
    return;
  }

  console.log(archived.archivedTo);
}

async function handleRecover(args) {
  const options = parseOptions(args, {
    project: { type: "string" },
    json: { type: "boolean" }
  });
  const project = normalizeProject(options.project);
  if (!project) {
    throw new ClientError(
      64,
      "--project is required (recover scoped to single project)"
    );
  }
  const allRecovered = await recoverOrphans(mailboxRoot);
  const recovered = allRecovered.filter((item) => {
    return item.project === project;
  });

  if (options.json) {
    console.log(JSON.stringify(recovered, null, 2));
    return;
  }

  if (recovered.length === 0) {
    console.log("No orphaned messages found.");
    return;
  }

  for (const item of recovered) {
    console.log(`${item.relativePath} -> ${item.archivedTo}`);
  }
}

async function main() {
  const { command, rest } = parseCommand(process.argv.slice(2));

  switch (command) {
    case "send":
      await handleSend(rest);
      return;
    case "list":
      await handleList(rest);
      return;
    case "reply":
      await handleReply(rest);
      return;
    case "archive":
      await handleArchive(rest);
      return;
    case "recover":
      await handleRecover(rest);
      return;
    default:
      throw new ClientError(64, usageText());
  }
}

main().catch((error) => {
  if (error instanceof ClientError) {
    console.error(error.message);
    const exitCode =
      typeof error.status === "number"
        ? error.status >= 400
          ? 64
          : error.status
        : 1;
    process.exit(exitCode);
  }

  if (error && error.code === "ENOENT") {
    console.error(error.message);
    process.exit(1);
  }

  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
