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
    state.supervisorHealth.startedAt = toUtcTimestamp();
    await persistSessions();
    await persistHealth();
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

  return { router, start, stop, state };
}

export async function atomicWriteJson(finalPath, data) {
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tmpPath = `${finalPath}.${suffix}.tmp`;
  try {
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(tmpPath, finalPath);
  } catch (error) {
    await fs.rm(tmpPath, { force: true }).catch(() => {});
    throw error;
  }
}
