import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createOrchestrator } from "./orchestrator.mjs";
import { createSupervisor } from "./supervisor.mjs";
import { createClaudeCodeAdapter } from "../scripts/adapters/claude-code-adapter.mjs";
import { createCodexAdapter } from "../scripts/adapters/codex-adapter.mjs";
import { createMockAdapter } from "../scripts/adapters/mock-adapter.mjs";
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mailboxRoot = defaultMailboxRoot;
const runtimeRoot = path.resolve(__dirname, "..", "mailbox-runtime");
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
    const answeredAt = sanitizeString(request.body?.answered_at);
    const answerMessageId = sanitizeString(request.body?.answer_message_id);

    if (resolution === "answered" && !answeredAt) {
      throw new ClientError(
        400,
        "answered_at is required when resolution=answered (archive timeline completeness)"
      );
    }

    const archived = await archiveMessageFile({
      relativePath,
      resolution,
      mailboxRoot,
      answeredAt,
      answerMessageId
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

const supervisor = createSupervisor({
  mailboxRoot,
  runtimeRoot,
  pollIntervalMs: 3000,
  logger: console
});
const adapterKind = (process.env.DASHBOARD_ADAPTER || "mock").toLowerCase();
let orchestratorAdapter;
if (adapterKind === "claude-code") {
  orchestratorAdapter = createClaudeCodeAdapter({
    recordCallsTo: path.join(runtimeRoot, "orchestrator-claude-calls.json"),
    logger: console
  });
  console.log("[bootstrap] adapter=claude-code (real)");
} else if (adapterKind === "codex") {
  const spawnPrefix = process.platform === "win32"
    ? ["wsl.exe", "-d", "Ubuntu", "bash", "-lc"]
    : [];
  const sessionsRoot = spawnPrefix.length ? null : undefined;
  orchestratorAdapter = createCodexAdapter({
    spawnPrefix,
    sessionsRoot,
    recordCallsTo: path.join(runtimeRoot, "orchestrator-codex-calls.json"),
    logger: console
  });
  console.log(`[bootstrap] adapter=codex (real${spawnPrefix.length ? ", via WSL, sessions --last fallback only" : ""})`);
} else {
  orchestratorAdapter = createMockAdapter({
    recordCallsTo: path.join(runtimeRoot, "orchestrator-mock-calls.json")
  });
  console.log("[bootstrap] adapter=mock");
}
const orchestrator = createOrchestrator({
  supervisor,
  adapter: orchestratorAdapter,
  logger: console
});
supervisor.setOrchestrator(orchestrator);

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

agentRouter.get("/runtime/deliveries", (request, response) => {
  const sessionId = typeof request.query.session_id === "string"
    ? request.query.session_id.trim()
    : "";
  const project = typeof request.query.project === "string"
    ? request.query.project.trim()
    : "";

  if (!sessionId) {
    response.status(400).json({ error: "session_id query param required" });
    return;
  }

  if (!project) {
    response.status(400).json({ error: "project query param required (agent-path)" });
    return;
  }

  const session = supervisor.state.sessions.get(sessionId);
  if (!session) {
    response.status(404).json({ error: "session not found" });
    return;
  }

  if (session.project !== project) {
    response.status(403).json({ error: "project scope mismatch for session" });
    return;
  }

  const SESSION_STALE_MS = 60_000;
  const isActive = Date.now() - Date.parse(session.last_seen) <= SESSION_STALE_MS;
  if (!isActive) {
    response.setHeader("Cache-Control", "no-store");
    response.json({ deliveries: [], session_expired: true });
    return;
  }

  const deliveries = supervisor.state.pendingIndex.filter(
    (item) => item.deliverable === true
      && item.to === session.agent
      && item.project === session.project
  );

  response.setHeader("Cache-Control", "no-store");
  response.json({
    deliveries,
    session: {
      session_id: session.session_id,
      agent: session.agent,
      project: session.project
    },
    session_expired: false
  });
});

app.use("/api/agent", agentRouter);

app.use("/api/runtime", supervisor.router);

app.post("/api/tasks", async (request, response) => {
  try {
    const task = supervisor.addTask(request.body || {});
    await supervisor.persistTasks();
    response.status(201).json({ task });
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get("/api/tasks", (request, response) => {
  const project =
    typeof request.query.project === "string"
      ? request.query.project.trim()
      : undefined;
  const stateFilter =
    typeof request.query.state === "string"
      ? request.query.state.trim()
      : undefined;
  const tasks = supervisor.listTasks({ project, state: stateFilter });
  response.setHeader("Cache-Control", "no-store");
  response.json({ tasks });
});

app.get("/api/tasks/:id", (request, response) => {
  const task = supervisor.getTask(request.params.id);
  if (!task) {
    response.status(404).json({ error: "task not found" });
    return;
  }
  response.setHeader("Cache-Control", "no-store");
  response.json({ task });
});

app.post("/api/tasks/:id/stop", async (request, response) => {
  try {
    const reason =
      typeof request.body?.reason === "string" ? request.body.reason.trim() : "user-stop";
    const task = supervisor.stopTask(request.params.id, reason || "user-stop");
    await supervisor.persistTasks();
    response.json({ task });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.startsWith("unknown task id") ? 404 : 400;
    response.status(status).json({ error: message });
  }
});

await supervisor.start();

const server = app.listen(port, host, () => {
  console.log(`Server listening on ${host}:${port}`);
});

async function shutdown(signal) {
  process.stderr.write(`[server] ${signal} received, shutting down\n`);
  orchestrator.stop();
  try {
    await orchestratorAdapter.shutdown({ force: false });
  } catch (error) {
    process.stderr.write(`[server] adapter.shutdown error: ${error.message}\n`);
  }
  supervisor.stop();
  if (typeof server.closeAllConnections === "function") {
    server.closeAllConnections();
  }
  server.close(() => {
    process.stderr.write("[server] clean exit\n");
    process.exit(0);
  });
  setTimeout(() => {
    process.stderr.write("[server] force exit after 3s timeout\n");
    process.exit(1);
  }, 3000);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
