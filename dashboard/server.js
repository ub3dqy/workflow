import express from "express";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCodexAppServerManager } from "./codex-app-server-manager.mjs";
import { createCodexBridge } from "./codex-bridge.mjs";
import { createSupervisor } from "./supervisor.mjs";
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
const runtimeRoot = process.env.RUNTIME_ROOT
  ? path.resolve(process.env.RUNTIME_ROOT)
  : path.resolve(__dirname, "..", "mailbox-runtime");
const previewPort = Number(process.env.DASHBOARD_PREVIEW_PORT || 9119);
const SESSION_STALE_MS = 60_000;
const FORCE_EXIT_TIMEOUT_MS = 5000;
const CODEX_FORCE_STOP_CONFIRMATION = "disconnect-codex-remote-sessions";
const app = express();

app.use((request, response, next) => {
  response.setHeader("Cache-Control", "no-store");
  next();
});
app.use(express.json());

function scheduleWorkflowShutdown() {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const child = spawn(
    command,
    ["--yes", "kill-port", String(port), String(previewPort)],
    {
      cwd: __dirname,
      detached: true,
      stdio: "ignore"
    }
  );
  child.unref();
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
const codexTransport = createCodexAppServerManager({
  runtimeRoot,
  cwd: path.resolve(__dirname, ".."),
  logger: console
});
const codexBridge = createCodexBridge({
  runtimeRoot,
  getSupervisorSnapshot: () => ({
    activeSessions: Array.from(supervisor.state.sessions.values()).filter(
      (session) => Date.now() - Date.parse(session.last_seen) <= SESSION_STALE_MS
    ),
    pendingIndex: supervisor.state.pendingIndex,
    supervisorHealth: supervisor.state.supervisorHealth
  }),
  getTransportStatus: () => codexTransport.refresh(),
  logger: console
});

async function safeCodexTransportStatus() {
  try {
    return await codexTransport.refresh();
  } catch (error) {
    const transportError = error instanceof Error ? error.message : String(error);
    return {
      state: "unknown",
      ready: false,
      wsUrl: null,
      lastError: transportError
    };
  }
}

async function sendCodexTransportLifecycleDisabled(response, action) {
  const transportStatus = await safeCodexTransportStatus();
  response.status(409).json({
    error:
      `Codex transport ${action} is disabled because it would disconnect open Codex --remote sessions.`,
    code: "codex_transport_lifecycle_preserved",
    codexTransportPreserved: true,
    codexTransport: transportStatus
  });
}

const agentRouter = express.Router();

agentRouter.use((request, response, next) => {
  const sessionId = typeof request.query.session_id === "string"
    ? request.query.session_id.trim()
    : "";
  const project = normalizeProject(
    request.query.project || request.body?.project
  );
  if (!sessionId) {
    response.status(400).json({ error: "session_id query param is required for /api/agent/*" });
    return;
  }
  if (!project) {
    response.status(400).json({ error: "project query/body param is required for /api/agent/*" });
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
  request.agentProject = project;
  request.agentSession = session;
  next();
});

agentRouter.get("/messages", async (request, response) => {
  try {
    const [allToClaude, allToCodex, allArchive] = await Promise.all([
      readBucket("to-claude", mailboxRoot, { project: request.agentProject }),
      readBucket("to-codex", mailboxRoot, { project: request.agentProject }),
      readBucket("archive", mailboxRoot, { project: request.agentProject })
    ]);
    const toClaude = filterMessagesByProject(allToClaude, request.agentProject);
    const toCodex = filterMessagesByProject(allToCodex, request.agentProject);
    const archive = filterMessagesByProject(allArchive, request.agentProject);
    const callerInbox = request.agentSession.agent === "claude"
      ? toClaude
      : request.agentSession.agent === "codex"
        ? toCodex
        : [];
    const toMark = callerInbox.filter(
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

app.get("/api/runtime/codex-bridge", async (request, response) => {
  try {
    response.json({
      health: codexBridge.getHealth(),
      deliveries: await codexBridge.readDeliveries()
    });
  } catch (error) {
    response.status(500).json({
      error: "Failed to read Codex bridge state",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get("/api/runtime/codex-transport", async (request, response) => {
  response.json(await codexTransport.refresh());
});

app.post("/api/runtime/codex-transport/start", async (request, response) => {
  response.json(await codexTransport.start());
});

app.post("/api/runtime/codex-transport/stop", async (request, response) => {
  await sendCodexTransportLifecycleDisabled(response, "stop");
});

app.post("/api/runtime/codex-transport/restart", async (request, response) => {
  await sendCodexTransportLifecycleDisabled(response, "restart");
});

app.post("/api/runtime/codex-transport/force-stop", async (request, response) => {
  if (request.body?.confirm !== CODEX_FORCE_STOP_CONFIRMATION) {
    response.status(400).json({
      error:
        `Force stop requires confirm="${CODEX_FORCE_STOP_CONFIRMATION}" because it disconnects open Codex --remote sessions.`,
      code: "codex_transport_force_stop_confirmation_required",
      codexTransportPreserved: true,
      codexTransport: await safeCodexTransportStatus()
    });
    return;
  }

  response.json({
    ...(await codexTransport.stop()),
    forceStopped: true
  });
});

app.post("/api/runtime/shutdown", async (request, response) => {
  const transportStatus = await safeCodexTransportStatus();

  response.json({
    ok: true,
    shuttingDown: true,
    ports: [port, previewPort],
    codexTransportPreserved: true,
    codexTransport: transportStatus
  });

  response.on("finish", () => {
    setTimeout(scheduleWorkflowShutdown, 150);
  });
});

app.use("/api/runtime", supervisor.router);

await supervisor.start();

const server = app.listen(port, host, () => {
  console.log(`Server listening on ${host}:${port}`);
});

await codexBridge.start();

let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  process.stderr.write(`[server] ${signal} received, shutting down\n`);
  const forceExitTimer = setTimeout(() => {
    process.stderr.write("[server] force exit after 5s timeout\n");
    process.exit(1);
  }, FORCE_EXIT_TIMEOUT_MS);
  forceExitTimer.unref?.();

  // Codex --remote TUI clients depend on this app-server connection. Dashboard
  // lifecycle and transport API controls must preserve it; users end remote
  // sessions from Codex or the OS when they intentionally want teardown.
  codexBridge.stop();
  supervisor.stop();
  if (typeof server.closeAllConnections === "function") {
    server.closeAllConnections();
  }
  server.close(() => {
    clearTimeout(forceExitTimer);
    process.stderr.write("[server] clean exit\n");
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
