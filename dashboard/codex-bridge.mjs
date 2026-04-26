import fs from "node:fs/promises";
import path from "node:path";
import {
  normalizeProject,
  sanitizeString,
  toHostPath,
  toUtcTimestamp
} from "../scripts/mailbox-lib.mjs";
import { WebSocketAppServerClient } from "../scripts/codex-app-server-client.mjs";

const DEFAULT_HEALTH = {
  enabled: false,
  state: "stopped",
  wsUrl: "",
  lastTickAt: null,
  lastTickMs: 0,
  loadedThreadCount: 0,
  lastError: "",
  lastBlockedReason: ""
};
const DEFAULT_FALLBACK_MAX_THREAD_AGE_MS = 15 * 60 * 1000;

export function isLoopbackWsUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "ws:" &&
      ["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

export function buildReminderPrompt({ project, rows }) {
  const threads = Array.from(new Set(rows.map((row) => row.thread).filter(Boolean)));
  const lines = [
    `Mailbox reminder for project ${project}.`,
    `There are ${rows.length} pending mailbox message(s) for Codex.`,
    `Threads: ${threads.length ? threads.join(", ") : "(none)"}.`,
    "Paths:",
    ...rows.map((row) => `- ${row.relativePath}`),
    "Use the normal mailbox workflow in this repository. This reminder is not the message body."
  ];
  return lines.join("\n");
}

function caseFoldPath(value) {
  const hostPath = toHostPath(value);
  if (!hostPath) {
    return "";
  }
  return path.normalize(hostPath).replace(/[\\/]+$/, "").toLowerCase();
}

function pathMatchesSession(threadCwd, sessionCwd) {
  const threadPath = caseFoldPath(threadCwd);
  const sessionPath = caseFoldPath(sessionCwd);
  if (!threadPath || !sessionPath) {
    return false;
  }
  if (threadPath === sessionPath) {
    return true;
  }
  const separator = sessionPath.includes("\\") ? "\\" : "/";
  return threadPath.startsWith(sessionPath + separator);
}

function uniqueNonEmpty(values) {
  return Array.from(new Set(values.map(sanitizeString).filter(Boolean)));
}

function pathSegmentToProject(value) {
  return sanitizeString(value)
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

function pathMatchesProject(threadCwd, project) {
  const threadPath = caseFoldPath(threadCwd);
  const projectName = pathSegmentToProject(normalizeProject(project));
  if (!threadPath || !projectName) {
    return false;
  }
  return pathSegmentToProject(path.basename(threadPath)) === projectName;
}

function collectProjectRoots(sessions, project) {
  return uniqueNonEmpty(
    sessions
      .filter((session) => session.project === project)
      .map((session) => session.cwd)
  );
}

function getThreadId(thread) {
  return sanitizeString(thread?.id || thread?.thread?.id);
}

function getThreadCwd(thread) {
  return sanitizeString(thread?.cwd || thread?.thread?.cwd);
}

function getThreadStatusType(thread) {
  return sanitizeString(thread?.status?.type || thread?.thread?.status?.type || "idle");
}

function getThreadSource(thread) {
  return sanitizeString(thread?.source || thread?.thread?.source);
}

function getThreadTimestamp(thread, key) {
  const value = thread?.[key] ?? thread?.thread?.[key];
  if (Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function isCliLikeThread(thread) {
  return !thread.source || thread.source === "cli";
}

function selectProjectThreadCandidates(threads, project, projectRoots = []) {
  const roots = uniqueNonEmpty(projectRoots);
  if (roots.length > 0) {
    return {
      candidates: selectThreadCandidates(threads, (thread) =>
        roots.some((root) => pathMatchesSession(thread.cwd, root))
      ),
      matchBasis: "projectRoot"
    };
  }

  return {
    candidates: selectThreadCandidates(threads, (thread) =>
      pathMatchesProject(thread.cwd, project)
    ),
    matchBasis: "projectBasename"
  };
}

function selectThreadCandidates(threads, predicate) {
  const projectThreads = Array.from(
    new Map(
      threads
        .filter((thread) => predicate(thread))
        .map((thread) => [thread.id, thread])
    ).values()
  );
  const cliLikeThreads = projectThreads.filter((thread) =>
    isCliLikeThread(thread)
  );
  const preferredThreads = cliLikeThreads.length > 0 ? cliLikeThreads : projectThreads;
  // App-server can keep old loaded threads after a remote TUI restart. Pick the
  // newest candidate deterministically instead of blocking routine restarts.
  return preferredThreads.sort(compareThreadFreshness);
}

function compareThreadFreshness(left, right) {
  const leftTime = getThreadFreshnessTime(left);
  const rightTime = getThreadFreshnessTime(right);
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }
  return String(right.id).localeCompare(String(left.id));
}

function getThreadFreshnessTime(thread) {
  return Math.max(
    normalizeEpochMs(thread?.updatedAt || 0),
    normalizeEpochMs(thread?.createdAt || 0)
  );
}

function normalizeEpochMs(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return value < 1_000_000_000_000 ? value * 1000 : value;
}

function filterFreshThreads(threads, { nowMs, maxAgeMs }) {
  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
    return { fresh: threads, stale: [] };
  }

  const fresh = [];
  const stale = [];
  for (const thread of threads) {
    const timestamp = getThreadFreshnessTime(thread);
    if (timestamp > 0 && nowMs - timestamp > maxAgeMs) {
      stale.push(thread);
    } else {
      fresh.push(thread);
    }
  }
  return { fresh, stale };
}

function threadIds(threads) {
  return threads.map((thread) => thread.id).filter(Boolean);
}

function getTurnId(turn) {
  return sanitizeString(turn?.turn?.id || turn?.id);
}

function isNoRolloutError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.includes("no rollout found for thread id");
}

function normalizeRpcError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  const result = {
    message,
    code: Number.isFinite(error?.code) ? error.code : null
  };

  if (result.code !== null) {
    return result;
  }

  try {
    const parsed = JSON.parse(message);
    if (parsed && typeof parsed === "object") {
      result.message = sanitizeString(parsed.message || message);
      result.code = Number.isFinite(parsed.code) ? parsed.code : null;
    }
  } catch {
    // Keep the original message when the transport did not return JSON-RPC.
  }

  return result;
}

function normalizeLoadedThreadIds(result) {
  if (Array.isArray(result?.data)) {
    return result.data.filter((value) => typeof value === "string" && value);
  }
  if (Array.isArray(result?.threadIds)) {
    return result.threadIds.filter((value) => typeof value === "string" && value);
  }
  return [];
}

async function readJsonArray(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

const RENAME_RETRY_DELAYS_MS = [50, 100, 150];

function isRetryableRenameError(error) {
  return error?.code === "EPERM" || error?.code === "EACCES";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function atomicWriteJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random()
    .toString(16)
    .slice(2)}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf8");
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rename(tmpPath, filePath);
      return;
    } catch (error) {
      const delayMs = RENAME_RETRY_DELAYS_MS[attempt];
      if (!isRetryableRenameError(error) || delayMs === undefined) {
        await fs.rm(tmpPath, { force: true }).catch(() => {});
        throw error;
      }
      await sleep(delayMs);
    }
  }
}

function upsertRecord(recordsByPath, row, patch) {
  const existing = recordsByPath.get(row.relativePath) || {};
  const next = {
    relativePath: row.relativePath,
    project: row.project,
    thread: row.thread || "",
    sessionIds: Array.isArray(existing.sessionIds)
      ? existing.sessionIds
      : existing.sessionId
        ? [existing.sessionId]
        : [],
    threadId: existing.threadId || "",
    turnId: existing.turnId || "",
    threadIds: Array.isArray(existing.threadIds)
      ? existing.threadIds
      : existing.threadId
        ? [existing.threadId]
        : [],
    candidateThreadIds: Array.isArray(existing.candidateThreadIds)
      ? existing.candidateThreadIds
      : [],
    staleThreadIds: Array.isArray(existing.staleThreadIds)
      ? existing.staleThreadIds
      : [],
    matchBasis: existing.matchBasis || "",
    rpcError: existing.rpcError || null,
    state: existing.state || "seen",
    firstSeenAt: existing.firstSeenAt || toUtcTimestamp(),
    lastAttemptAt: existing.lastAttemptAt || "",
    deliveredAt: existing.deliveredAt || "",
    reason: existing.reason || "",
    sessionFreshnessBasis: existing.sessionFreshnessBasis || "",
    ...patch
  };
  recordsByPath.set(row.relativePath, next);
  return next;
}

function groupByProject(rows) {
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.project)) {
      grouped.set(row.project, []);
    }
    grouped.get(row.project).push(row);
  }
  return grouped;
}

export function createCodexBridge({
  runtimeRoot,
  wsUrl = "",
  getSupervisorSnapshot,
  getTransportStatus = () => ({ state: wsUrl ? "ready" : "stopped", ready: Boolean(wsUrl), wsUrl }),
  createClient = ({ url, timeoutMs }) => WebSocketAppServerClient.connect({ url, timeoutMs }),
  pollIntervalMs = 3000,
  requestTimeoutMs = 20000,
  fallbackMaxThreadAgeMs = DEFAULT_FALLBACK_MAX_THREAD_AGE_MS,
  logger = console
}) {
  const deliveriesPath = path.join(runtimeRoot, "deliveries.json");
  const healthPath = path.join(runtimeRoot, "codex-bridge-health.json");
  let timer = null;
  let isTicking = false;
  const health = { ...DEFAULT_HEALTH, wsUrl };

  async function persistHealth() {
    await atomicWriteJson(healthPath, health);
  }

  async function persistDeliveries(records) {
    await atomicWriteJson(deliveriesPath, records);
  }

  async function readDeliveries() {
    return readJsonArray(deliveriesPath);
  }

  function currentHealth() {
    return { ...health };
  }

  async function tick() {
    if (isTicking) {
      return currentHealth();
    }
    isTicking = true;
    const startedAt = Date.now();
    health.lastTickAt = toUtcTimestamp();
    health.lastError = "";
    health.lastBlockedReason = "";

    try {
      const snapshot = await getSupervisorSnapshot();
      const pendingRows = (snapshot.pendingIndex || []).filter(
        (row) => row.to === "codex" && row.deliverable === true && row.project
      );
      const pendingPaths = new Set(pendingRows.map((row) => row.relativePath));
      const existing = (await readDeliveries()).filter(
        (record) =>
          pendingPaths.has(record.relativePath) || record.state === "signaled"
      );
      const recordsByPath = new Map(
        existing.map((record) => [record.relativePath, record])
      );

      if (pendingRows.length === 0) {
        health.enabled = false;
        health.state = "idle";
        health.loadedThreadCount = 0;
        await persistDeliveries(existing);
        return currentHealth();
      }

      const sessions = Array.isArray(snapshot.activeSessions)
        ? snapshot.activeSessions
        : [];
      const activeProjectSessions = sessions.filter((session) => session.project);
      const activeCodexSessions = sessions.filter(
        (session) => session.agent === "codex" && session.project
      );
      const groupedPendingRows = groupByProject(pendingRows);
      const now = toUtcTimestamp();
      const nowMs = Date.now();
      let needsThreadLookup = false;

      for (const [project, rows] of groupedPendingRows) {
        const sessionsForProject = activeCodexSessions.filter(
          (session) => session.project === project
        );
        const unsignaledRows = rows.filter(
          (row) => recordsByPath.get(row.relativePath)?.state !== "signaled"
        );
        if (unsignaledRows.length === 0) {
          continue;
        }

        // Codex remote sessions may not run project hooks reliably in app-server
        // mode. Look up loaded app-server threads before failing no-session so a
        // unique live project cwd can still receive a reminder.
        needsThreadLookup = true;
      }

      if (!needsThreadLookup) {
        health.enabled = false;
        health.state = health.lastBlockedReason ? "blocked" : "idle";
        await persistDeliveries(Array.from(recordsByPath.values()));
        return currentHealth();
      }

      const transport = await getTransportStatus();
      const effectiveWsUrl = sanitizeString(transport.wsUrl || wsUrl);
      health.wsUrl = effectiveWsUrl;
      if (!effectiveWsUrl || transport.ready === false || transport.state !== "ready") {
        health.enabled = false;
        health.state = "transport_not_ready";
        health.lastBlockedReason = "transport_not_ready";
        await persistDeliveries(existing);
        return currentHealth();
      }

      if (!isLoopbackWsUrl(effectiveWsUrl)) {
        health.enabled = false;
        health.state = "blocked_non_loopback";
        health.lastBlockedReason = "blocked_non_loopback";
        await persistDeliveries(existing);
        return currentHealth();
      }

      health.enabled = true;
      health.state = "checking";

      const client = await createClient({
        url: effectiveWsUrl,
        timeoutMs: requestTimeoutMs
      });
      try {
        await client.initialize({
          clientName: "workflow-codex-bridge",
          clientVersion: "0.1.0"
        });
        client.sendInitialized();

        const loaded = normalizeLoadedThreadIds(
          await client.listLoadedThreads({ limit: 50 })
        );
        health.loadedThreadCount = loaded.length;
        const threads = [];
        const noRolloutThreadIds = [];
        const readThreadErrors = [];
        for (const threadId of loaded) {
          let read;
          try {
            read = await client.readThread(threadId, { includeTurns: false });
          } catch (error) {
            if (isNoRolloutError(error)) {
              noRolloutThreadIds.push(threadId);
              continue;
            }
            readThreadErrors.push({
              threadId,
              rpcError: normalizeRpcError(error)
            });
            continue;
          }
          const thread = read.thread || read;
          threads.push({
            id: getThreadId(thread) || threadId,
            cwd: getThreadCwd(thread),
            statusType: getThreadStatusType(thread),
            source: getThreadSource(thread),
            createdAt: getThreadTimestamp(thread, "createdAt"),
            updatedAt: getThreadTimestamp(thread, "updatedAt"),
            raw: thread
          });
        }

        for (const [project, rows] of groupedPendingRows) {
          const sessionsForProject = activeCodexSessions.filter(
            (session) => session.project === project
          );
          const unsignaledRows = rows.filter(
            (row) => recordsByPath.get(row.relativePath)?.state !== "signaled"
          );
          if (unsignaledRows.length === 0) {
            continue;
          }

          if (sessionsForProject.length === 0) {
            const projectRoots = collectProjectRoots(activeProjectSessions, project);
            const selectedCandidates = selectProjectThreadCandidates(
              threads,
              project,
              projectRoots
            );
            const { fresh: uniqueCandidates, stale: staleCandidates } =
              filterFreshThreads(selectedCandidates.candidates, {
                nowMs,
                maxAgeMs: fallbackMaxThreadAgeMs
              });
            const fallbackBasis = projectRoots.length > 0
              ? `appServerThreadCwd:${selectedCandidates.matchBasis}`
              : "appServerThreadCwd:projectBasename";
            const candidateThreadIds = threadIds(selectedCandidates.candidates);
            const staleThreadIds = threadIds(staleCandidates);
            const noRolloutOnly = noRolloutThreadIds.length > 0 && threads.length === 0;
            const readErrorOnly = readThreadErrors.length > 0 && threads.length === 0;

            if (uniqueCandidates.length === 0) {
              const blockedState = noRolloutOnly
                ? "blocked_no_rollout"
                : staleCandidates.length > 0
                  ? "blocked_stale_thread"
                  : readErrorOnly
                    ? "blocked_rpc_error"
                    : "blocked_no_session";
              for (const row of unsignaledRows) {
                upsertRecord(recordsByPath, row, {
                  sessionIds: [],
                  threadId:
                    noRolloutThreadIds.length === 1 ? noRolloutThreadIds[0] : "",
                  threadIds: noRolloutThreadIds,
                  candidateThreadIds,
                  staleThreadIds,
                  state: blockedState,
                  lastAttemptAt: now,
                  reason: blockedState,
                  sessionFreshnessBasis: fallbackBasis,
                  matchBasis: selectedCandidates.matchBasis,
                  rpcError: readThreadErrors[0]?.rpcError || null
                });
              }
              health.lastBlockedReason = blockedState;
              continue;
            }

            const [thread] = uniqueCandidates;
            if (thread.statusType && thread.statusType !== "idle") {
              for (const row of unsignaledRows) {
                upsertRecord(recordsByPath, row, {
                  sessionIds: [],
                  threadId: thread.id,
                  threadIds: [thread.id],
                  candidateThreadIds,
                  state: "blocked_active_turn",
                  lastAttemptAt: now,
                  reason: "blocked_active_turn",
                  sessionFreshnessBasis: fallbackBasis,
                  matchBasis: selectedCandidates.matchBasis,
                  rpcError: null
                });
              }
              health.lastBlockedReason = "blocked_active_turn";
              continue;
            }

            let turn;
            try {
              await client.resumeThread(thread.id, { cwd: thread.cwd });
              turn = await client.startTurn({
                threadId: thread.id,
                cwd: thread.cwd,
                input: [
                  {
                    type: "text",
                    text: buildReminderPrompt({ project, rows: unsignaledRows })
                  }
                ]
              });
            } catch (error) {
              const state = isNoRolloutError(error)
                ? "blocked_no_rollout"
                : "blocked_rpc_error";
              for (const row of unsignaledRows) {
                upsertRecord(recordsByPath, row, {
                  sessionIds: [],
                  threadId: thread.id,
                  threadIds: [thread.id],
                  candidateThreadIds,
                  state,
                  lastAttemptAt: now,
                  reason: state,
                  sessionFreshnessBasis: fallbackBasis,
                  matchBasis: selectedCandidates.matchBasis,
                  rpcError: normalizeRpcError(error)
                });
              }
              health.lastBlockedReason = state;
              continue;
            }
            for (const row of unsignaledRows) {
              upsertRecord(recordsByPath, row, {
                sessionIds: [],
                threadId: thread.id,
                threadIds: [thread.id],
                candidateThreadIds,
                turnId: getTurnId(turn),
                state: "signaled",
                lastAttemptAt: now,
                deliveredAt: toUtcTimestamp(),
                reason: "",
                sessionFreshnessBasis: fallbackBasis,
                matchBasis: selectedCandidates.matchBasis,
                rpcError: null
              });
            }
            continue;
          }

          const uniqueCandidates = selectThreadCandidates(threads, (thread) =>
            sessionsForProject.some((session) =>
              pathMatchesSession(thread.cwd, session.cwd)
            )
          );
          const candidateThreadIds = threadIds(uniqueCandidates);

          if (uniqueCandidates.length === 0) {
            const blockedState = noRolloutThreadIds.length > 0 && threads.length === 0
              ? "blocked_no_rollout"
              : readThreadErrors.length > 0 && threads.length === 0
                ? "blocked_rpc_error"
                : "blocked_no_thread";
            for (const row of unsignaledRows) {
              upsertRecord(recordsByPath, row, {
                sessionIds: sessionsForProject.map((session) => session.session_id),
                threadId: noRolloutThreadIds.length === 1 ? noRolloutThreadIds[0] : "",
                threadIds: noRolloutThreadIds,
                candidateThreadIds,
                state: blockedState,
                lastAttemptAt: now,
                reason: blockedState,
                sessionFreshnessBasis: "activeSessions <= 60000ms",
                matchBasis: "activeSessionCwd",
                rpcError: readThreadErrors[0]?.rpcError || null
              });
            }
            health.lastBlockedReason = blockedState;
            continue;
          }

          const [thread] = uniqueCandidates;
          if (thread.statusType && thread.statusType !== "idle") {
            for (const row of unsignaledRows) {
              upsertRecord(recordsByPath, row, {
                sessionIds: sessionsForProject.map((session) => session.session_id),
                threadId: thread.id,
                threadIds: [thread.id],
                candidateThreadIds,
                state: "blocked_active_turn",
                lastAttemptAt: now,
                reason: "blocked_active_turn",
                sessionFreshnessBasis: "activeSessions <= 60000ms",
                matchBasis: "activeSessionCwd",
                rpcError: null
              });
            }
            health.lastBlockedReason = "blocked_active_turn";
            continue;
          }

          const cwd = thread.cwd || sessionsForProject[0].cwd;
          let turn;
          try {
            await client.resumeThread(thread.id, { cwd });
            turn = await client.startTurn({
              threadId: thread.id,
              cwd,
              input: [
                {
                  type: "text",
                  text: buildReminderPrompt({ project, rows: unsignaledRows })
                }
              ]
            });
          } catch (error) {
            const state = isNoRolloutError(error)
              ? "blocked_no_rollout"
              : "blocked_rpc_error";
            for (const row of unsignaledRows) {
              upsertRecord(recordsByPath, row, {
                sessionIds: sessionsForProject.map((session) => session.session_id),
                threadId: thread.id,
                threadIds: [thread.id],
                candidateThreadIds,
                state,
                lastAttemptAt: now,
                reason: state,
                sessionFreshnessBasis: "activeSessions <= 60000ms",
                matchBasis: "activeSessionCwd",
                rpcError: normalizeRpcError(error)
              });
            }
            health.lastBlockedReason = state;
            continue;
          }
          for (const row of unsignaledRows) {
            upsertRecord(recordsByPath, row, {
              sessionIds: sessionsForProject.map((session) => session.session_id),
              threadId: thread.id,
              threadIds: [thread.id],
              candidateThreadIds,
              turnId: getTurnId(turn),
              state: "signaled",
              lastAttemptAt: now,
              deliveredAt: toUtcTimestamp(),
              reason: "",
              sessionFreshnessBasis: "activeSessions <= 60000ms",
              matchBasis: "activeSessionCwd",
              rpcError: null
            });
          }
        }
      } finally {
        await client.close();
      }

      health.state = health.lastBlockedReason ? "blocked" : "idle";
      await persistDeliveries(Array.from(recordsByPath.values()));
      return currentHealth();
    } catch (error) {
      health.enabled = Boolean(health.wsUrl);
      health.state = "error";
      health.lastError = error instanceof Error ? error.message : String(error);
      logger.error("[codex-bridge] tick failed:", error);
      return currentHealth();
    } finally {
      health.lastTickMs = Date.now() - startedAt;
      await persistHealth();
      isTicking = false;
    }
  }

  async function start() {
    await fs.mkdir(runtimeRoot, { recursive: true });
    await tick();
    timer = setInterval(() => {
      void tick();
    }, pollIntervalMs);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return {
    start,
    stop,
    tick,
    getHealth: currentHealth,
    readDeliveries
  };
}
