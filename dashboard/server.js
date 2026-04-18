import express from "express";
import {
  archiveMessageFile,
  appendNoteToMessageFile,
  collectProjectValues,
  ClientError,
  defaultMailboxRoot,
  filterMessagesByProject,
  generateMessageFile,
  host,
  isKnownBucket,
  normalizeProject,
  port,
  readBucket,
  sanitizeString,
  validateRelativeInboxPath,
  validateReplyTarget,
  validateResolution,
  validateThread
} from "../scripts/mailbox-lib.mjs";

const mailboxRoot = defaultMailboxRoot;
const app = express();

app.use((request, response, next) => {
  response.setHeader("Cache-Control", "no-store");
  next();
});
app.use(express.json());

function sendClientError(response, error) {
  if (error instanceof ClientError) {
    response.status(error.status).json({
      error: error.message
    });
    return true;
  }

  return false;
}

app.get("/api/messages", async (request, response) => {
  try {
    const requestedProject = normalizeProject(request.query.project);
    const [allToClaude, allToCodex, allArchive] = await Promise.all([
      readBucket("to-claude", mailboxRoot),
      readBucket("to-codex", mailboxRoot),
      readBucket("archive", mailboxRoot)
    ]);
    const projects = collectProjectValues([
      ...allToClaude,
      ...allToCodex
    ]);
    const toClaude = filterMessagesByProject(allToClaude, requestedProject);
    const toCodex = filterMessagesByProject(allToCodex, requestedProject);
    const archive = filterMessagesByProject(allArchive, requestedProject);

    response.json({ toClaude, toCodex, archive, projects });
  } catch (error) {
    response.status(500).json({
      error: "Failed to read mailbox",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get("/api/messages/:dir", async (request, response) => {
  const bucketName = request.params.dir;

  if (!isKnownBucket(bucketName)) {
    response.status(404).json({ error: "Unknown mailbox bucket" });
    return;
  }

  try {
    const requestedProject = normalizeProject(request.query.project);
    const messages = filterMessagesByProject(
      await readBucket(bucketName, mailboxRoot),
      requestedProject
    );
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
    const project = normalizeProject(request.body?.project);
    const body = sanitizeString(request.body?.body);
    const replyTo = sanitizeString(request.body?.reply_to);

    if (!body) {
      throw new ClientError(400, "body is required");
    }

    const created = await generateMessageFile({
      to,
      thread,
      project,
      body,
      replyTo,
      mailboxRoot
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
    const relativePath = validateRelativeInboxPath(
      request.body?.relativePath,
      mailboxRoot
    ).relativePath;
    const resolution = validateResolution(request.body?.resolution);
    const archived = await archiveMessageFile({
      relativePath,
      resolution,
      mailboxRoot
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

app.post("/api/notes", async (request, response) => {
  try {
    const note = sanitizeString(request.body?.note);
    const appended = await appendNoteToMessageFile({
      relativePath: request.body?.relativePath,
      note,
      mailboxRoot
    });

    response.status(201).json({
      ok: true,
      relativePath: appended.relativePath,
      appendedAt: appended.appendedAt
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
      error: "Failed to append note",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

app.listen(port, host, () => {
  console.log(`Server listening on ${host}:${port}`);
});
