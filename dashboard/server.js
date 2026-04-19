import express from "express";
import path from "node:path";
import {
  archiveMessageFile,
  appendNoteToMessageFile,
  collectProjectValues,
  ClientError,
  defaultMailboxRoot,
  filterMessagesByProject,
  host,
  isKnownBucket,
  markMessageReceived,
  normalizeProject,
  port,
  readBucket,
  sanitizeString,
  validateProjectScope,
  validateRelativeInboxPath,
  validateResolution
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

const agentRouter = express.Router();

agentRouter.use((request, response, next) => {
  const project = normalizeProject(request.query.project || request.body?.project);
  if (!project) {
    response.status(400).json({ error: "project query/body param is required for /api/agent/*" });
    return;
  }
  request.agentProject = project;
  next();
});

agentRouter.get("/messages", async (request, response) => {
  try {
    const [allToClaude, allToCodex, allArchive] = await Promise.all([
      readBucket("to-claude", mailboxRoot),
      readBucket("to-codex", mailboxRoot),
      readBucket("archive", mailboxRoot)
    ]);
    const toClaude = filterMessagesByProject(allToClaude, request.agentProject);
    const toCodex = filterMessagesByProject(allToCodex, request.agentProject);
    const archive = filterMessagesByProject(allArchive, request.agentProject);
    const toMark = [...toClaude, ...toCodex].filter(
      (message) => message.status === "pending"
    );
    await Promise.all(
      toMark.map((message) =>
        markMessageReceived(path.resolve(mailboxRoot, message.relativePath))
      )
    );
    response.json({ toClaude, toCodex, archive, project: request.agentProject });
  } catch (error) {
    response.status(500).json({
      error: "Failed to read agent mailbox",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

app.use("/api/agent", agentRouter);

app.listen(port, host, () => {
  console.log(`Server listening on ${host}:${port}`);
});
