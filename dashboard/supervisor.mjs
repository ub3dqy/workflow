import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import {
  normalizeProject,
  readBucket,
  sanitizeString,
  toUtcTimestamp
} from "../scripts/mailbox-lib.mjs";

const SESSION_STALE_MS = 60_000;

export function createSupervisor({
  mailboxRoot,
  runtimeRoot,
  pollIntervalMs = 3000,
  logger = console
}) {
  const state = {
    sessions: new Map(),
    pendingIndex: [],
    taskRegistry: new Map(),
    supervisorHealth: {
      startedAt: null,
      lastTickAt: null,
      lastTickMs: 0,
      tickErrors: 0,
      isScanning: false
    }
  };

  let timer = null;
  const router = express.Router();

  router.use(express.json());

  router.get("/state", (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.json({
      sessions: Array.from(state.sessions.values()),
      activeSessions: Array.from(state.sessions.values()).filter(
        (session) => Date.now() - Date.parse(session.last_seen) <= SESSION_STALE_MS
      ),
      pendingIndex: state.pendingIndex,
      supervisorHealth: state.supervisorHealth
    });
  });

  router.post("/sessions", async (request, response) => {
    const body = request.body || {};
    const session_id = sanitizeString(body.session_id);
    const agent = sanitizeString(body.agent);
    const project = sanitizeString(body.project);

    if (!session_id || !agent || !project) {
      response.status(400).json({ error: "session_id, agent, project required" });
      return;
    }

    if (agent !== "claude" && agent !== "codex") {
      response.status(400).json({ error: "agent must be claude or codex" });
      return;
    }

    const normalizedProject = normalizeProject(project);
    if (!normalizedProject) {
      response.status(400).json({ error: "project is required" });
      return;
    }

    const existing = state.sessions.get(session_id) || {};
    const record = {
      ...existing,
      session_id,
      agent,
      project: normalizedProject,
      cwd: sanitizeString(body.cwd) || existing.cwd || "",
      transport: sanitizeString(body.transport) || existing.transport || "manual",
      platform: sanitizeString(body.platform) || existing.platform || "",
      last_seen: toUtcTimestamp()
    };

    state.sessions.set(session_id, record);

    try {
      await persistSessions();
    } catch (error) {
      logger.error("[supervisor] persistSessions failed:", error);
      response.status(500).json({
        error: "Failed to persist session",
        details: error instanceof Error ? error.message : String(error)
      });
      return;
    }

    response.status(201).json({ ok: true, session: record });
  });

  router.delete("/sessions/:id", async (request, response) => {
    state.sessions.delete(request.params.id);

    try {
      await persistSessions();
    } catch (error) {
      logger.error("[supervisor] persistSessions failed:", error);
      response.status(500).json({
        error: "Failed to persist session delete",
        details: error instanceof Error ? error.message : String(error)
      });
      return;
    }

    response.json({ ok: true });
  });

  async function persistSessions() {
    await atomicWriteJson(
      path.join(runtimeRoot, "sessions.json"),
      Array.from(state.sessions.values())
    );
  }

  async function persistPendingIndex() {
    await atomicWriteJson(
      path.join(runtimeRoot, "pending-index.json"),
      state.pendingIndex
    );
  }

  async function persistHealth() {
    await atomicWriteJson(
      path.join(runtimeRoot, "supervisor-health.json"),
      state.supervisorHealth
    );
  }

  async function persistTasks() {
    await atomicWriteJson(
      path.join(runtimeRoot, "tasks.json"),
      Array.from(state.taskRegistry.values())
    );
  }

  async function atomicWriteJson(finalPath, data) {
    const tmpPath = `${finalPath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(tmpPath, finalPath);
  }

  const TASK_SCHEMA_VERSION = 1;

  const TASK_STATES = new Set([
    "pending",
    "launching",
    "awaiting-reply",
    "handing-off",
    "resolved",
    "failed",
    "stopped",
    "max-iter-exceeded"
  ]);

  const TERMINAL_STATES = new Set([
    "resolved",
    "failed",
    "stopped",
    "max-iter-exceeded"
  ]);

  const ALLOWED_TRANSITIONS = {
    pending: new Set(["launching", "stopped", "failed"]),
    launching: new Set(["awaiting-reply", "failed", "stopped"]),
    "awaiting-reply": new Set([
      "handing-off",
      "failed",
      "stopped",
      "max-iter-exceeded",
      "resolved"
    ]),
    "handing-off": new Set([
      "awaiting-reply",
      "resolved",
      "failed",
      "stopped",
      "max-iter-exceeded"
    ])
  };

  function buildTaskId(slug) {
    const ts = toUtcTimestamp()
      .replace(/[:-]/g, "")
      .replace(/\..*Z$/, "Z");
    const safeSlug =
      String(slug || "task")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 40)
        .replace(/^-|-$/g, "") || "task";
    return `task-${ts}-${safeSlug}`;
  }

  function normalizeAgent(value) {
    if (value === "claude" || value === "codex") {
      return value;
    }
    return null;
  }

  function addTask(input) {
    const project = typeof input.project === "string" ? input.project.trim() : "";
    if (!project) {
      throw new Error("task requires project");
    }

    const initialAgent = normalizeAgent(input.initialAgent);
    if (!initialAgent) {
      throw new Error("task requires initialAgent claude|codex");
    }

    const instruction =
      typeof input.instruction === "string" ? input.instruction.trim() : "";
    if (!instruction) {
      throw new Error("task requires instruction");
    }

    const maxIter = Number.isFinite(input.maxIterations)
      ? Math.max(1, Math.min(100, Math.floor(input.maxIterations)))
      : 10;
    const now = toUtcTimestamp();
    const task = {
      schemaVersion: TASK_SCHEMA_VERSION,
      id: buildTaskId(input.slug || instruction.slice(0, 40)),
      project,
      thread: typeof input.thread === "string" ? input.thread.trim() : "",
      instruction,
      initialAgent,
      currentAgent: null,
      nextAgent: initialAgent,
      sessionIds: { claude: "", codex: "" },
      lastInboundMessageId: "",
      lastOutboundMessageId: "",
      iterations: 0,
      maxIterations: maxIter,
      state: "pending",
      stopReason: "",
      error: "",
      createdAt: now,
      lastActivityAt: now,
      resolvedAt: ""
    };
    state.taskRegistry.set(task.id, task);
    return task;
  }

  function transitionTask(id, nextState, patch = {}) {
    const task = state.taskRegistry.get(id);
    if (!task) {
      throw new Error(`unknown task id ${id}`);
    }
    if (!TASK_STATES.has(nextState)) {
      throw new Error(`invalid state ${nextState}`);
    }
    if (TERMINAL_STATES.has(task.state)) {
      throw new Error(`task ${id} already terminal (${task.state})`);
    }
    const allowed = ALLOWED_TRANSITIONS[task.state];
    if (!allowed || !allowed.has(nextState)) {
      throw new Error(`illegal transition ${task.state} → ${nextState} for task ${id}`);
    }
    const next = {
      ...task,
      ...patch,
      state: nextState,
      lastActivityAt: toUtcTimestamp()
    };
    if (TERMINAL_STATES.has(nextState) && !next.resolvedAt) {
      next.resolvedAt = next.lastActivityAt;
    }
    state.taskRegistry.set(id, next);
    return next;
  }

  function stopTask(id, reason = "user-stop") {
    const task = state.taskRegistry.get(id);
    if (!task) {
      throw new Error(`unknown task id ${id}`);
    }
    if (TERMINAL_STATES.has(task.state)) {
      return task;
    }
    return transitionTask(id, "stopped", { stopReason: reason });
  }

  function listTasks(filters = {}) {
    const arr = Array.from(state.taskRegistry.values());
    const { project, state: stateFilter } = filters;
    return arr
      .filter((task) => {
        if (project && task.project !== project) {
          return false;
        }
        if (stateFilter && task.state !== stateFilter) {
          return false;
        }
        return true;
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  function getTask(id) {
    return state.taskRegistry.get(id) || null;
  }

  async function pollTick() {
    if (state.supervisorHealth.isScanning) {
      return;
    }

    state.supervisorHealth.isScanning = true;
    const startedAt = Date.now();

    try {
      const [toClaude, toCodex] = await Promise.all([
        readBucket("to-claude", mailboxRoot),
        readBucket("to-codex", mailboxRoot)
      ]);

      const pending = [...toClaude, ...toCodex]
        .filter((message) => message.status === "pending")
        .map((message) => {
          const normalized = (message.project || "").trim();
          return {
            relativePath: message.relativePath,
            to: message.to,
            from: message.from,
            project: normalized,
            projectMissing: normalized === "",
            deliverable: normalized !== "",
            thread: message.thread,
            created: message.created,
            received_at: message.received_at || ""
          };
        });

      state.pendingIndex = pending;
      state.supervisorHealth.lastTickAt = toUtcTimestamp();
      state.supervisorHealth.lastTickMs = Date.now() - startedAt;

      await persistPendingIndex();
      await persistHealth();
    } catch (error) {
      state.supervisorHealth.tickErrors += 1;
      logger.error("[supervisor] tick failed:", error);
    } finally {
      state.supervisorHealth.isScanning = false;
    }
  }

  async function start() {
    await fs.mkdir(runtimeRoot, { recursive: true });
    try {
      const raw = await fs.readFile(path.join(runtimeRoot, "tasks.json"), "utf8");
      const persisted = JSON.parse(raw);
      if (Array.isArray(persisted)) {
        for (const entry of persisted) {
          if (!entry || typeof entry.id !== "string") {
            continue;
          }
          const version =
            typeof entry.schemaVersion === "number" ? entry.schemaVersion : 0;
          if (version !== TASK_SCHEMA_VERSION) {
            logger.error(
              `[supervisor] task ${entry.id} has schemaVersion=${version}, expected ${TASK_SCHEMA_VERSION}; skipping (add migration in future phase)`
            );
            continue;
          }
          state.taskRegistry.set(entry.id, entry);
        }
      }
    } catch (error) {
      if (error && error.code !== "ENOENT") {
        logger.error("[supervisor] tasks.json restore failed:", error);
      }
    }
    state.supervisorHealth.startedAt = toUtcTimestamp();
    await persistSessions();
    await persistHealth();
    await persistTasks();
    await pollTick();
    timer = setInterval(() => {
      void pollTick();
    }, pollIntervalMs);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return {
    router,
    start,
    stop,
    state,
    addTask,
    transitionTask,
    stopTask,
    listTasks,
    getTask,
    persistTasks
  };
}
