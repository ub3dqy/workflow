import { spawn as nodeSpawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AGENT_ADAPTER_METHODS } from "./agent-adapter.mjs";

async function writeJsonAtomically(filePath, payload) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(payload, null, 2), "utf8");
  await fs.rename(tmp, filePath);
}

function normalizeSpawnPrefix(spawnPrefix) {
  return Array.isArray(spawnPrefix) ? [...spawnPrefix] : [];
}

async function listSessionFiles(sessionsRoot) {
  if (!sessionsRoot) {
    return new Set();
  }

  const entries = new Set();

  async function walk(currentDir) {
    let dirEntries;
    try {
      dirEntries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    await Promise.all(
      dirEntries.map(async (entry) => {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
          return;
        }
        if (entry.isFile()) {
          entries.add(path.relative(sessionsRoot, fullPath));
        }
      })
    );
  }

  await walk(sessionsRoot);
  return entries;
}

function shellEscape(token) {
  const text = String(token ?? "");
  if (/^[A-Za-z0-9_.+\-@%:=/]+$/.test(text)) {
    return text;
  }
  return `'${text.replace(/'/g, `'\"'\"'`)}'`;
}

function buildConfigOverrideFlags(configOverrides) {
  return Object.entries(configOverrides).flatMap(([key, value]) => ["-c", `${key}=${value}`]);
}

export function createCodexAdapter({
  codexPath = "codex",
  spawnPrefix = [],
  spawnFn = nodeSpawn,
  spawnTimeoutMs = 10 * 60 * 1000,
  logger = console,
  recordCallsTo,
  model,
  sandboxMode,
  useJsonOutput = true,
  sessionsRoot = path.join(os.homedir(), ".codex", "sessions"),
  env = process.env,
  configOverrides = {}
} = {}) {
  const normalizedSpawnPrefix = normalizeSpawnPrefix(spawnPrefix);
  const configOverrideFlags = buildConfigOverrideFlags(configOverrides);
  /** @type {Map<string, {state: 'running'|'terminated', launchedAt: string, lastInvocationAt: string, project: string, thread: string, callArgs: {project: string, thread: string, firstMessage: string}, codexSessionId: string|null}>} */
  const sessionState = new Map();
  /** @type {Set<any>} */
  const activeSpawns = new Set();
  const callLog = [];

  async function writeCallLog() {
    if (!recordCallsTo) return;
    try {
      await writeJsonAtomically(recordCallsTo, callLog);
    } catch (error) {
      process.stderr.write(`[codex-adapter] recordCallsTo failed: ${error.message}\n`);
    }
  }

  function record(method, args, result) {
    callLog.push({
      method,
      args,
      result,
      ts: new Date().toISOString()
    });
    void writeCallLog();
  }

  async function detectNewSession(beforeEntries) {
    if (sessionsRoot === null) {
      return null;
    }

    let afterEntries;
    try {
      afterEntries = await listSessionFiles(sessionsRoot);
    } catch {
      return null;
    }

    const additions = [...afterEntries].filter((entry) => !beforeEntries.has(entry));
    if (additions.length === 0) {
      return null;
    }
    if (additions.length > 1) {
      logger.warn?.(`[codex-adapter] detectNewSession saw multiple additions; picking lexicographically largest`);
    }
    additions.sort();
    return additions[additions.length - 1];
  }

  async function runCodex({ args, timeoutMs = spawnTimeoutMs }) {
    const startedAt = Date.now();
    let child;
    if (normalizedSpawnPrefix.length === 0) {
      child = spawnFn(codexPath, args, {
        stdio: ["pipe", "pipe", "pipe"],
        env
      });
    } else {
      const cmdString = [codexPath, ...args].map(shellEscape).join(" ");
      child = spawnFn(normalizedSpawnPrefix[0], [...normalizedSpawnPrefix.slice(1), cmdString], {
        stdio: ["pipe", "pipe", "pipe"],
        env
      });
    }

    activeSpawns.add(child);

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let timeoutId;
    let killEscalationId;

    const finalize = (payload) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (killEscalationId) clearTimeout(killEscalationId);
      activeSpawns.delete(child);
      return payload;
    };

    if (typeof child.stdout?.on === "function") {
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
      });
    }
    if (typeof child.stderr?.on === "function") {
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
      });
    }
    if (typeof child.stdin?.end === "function") {
      child.stdin.end();
    }

    return await new Promise((resolve, reject) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        stderr += `${stderr.endsWith("\n") || stderr.length === 0 ? "" : "\n"}[adapter timeout] SIGTERM`;
        try {
          child.kill?.("SIGTERM");
        } catch {}
        killEscalationId = setTimeout(() => {
          try {
            child.kill?.("SIGKILL");
          } catch {}
        }, 5000);
        killEscalationId.unref?.();
      }, timeoutMs);
      timeoutId.unref?.();

      child.on?.("error", (error) => {
        reject(finalize(error));
      });

      child.on?.("close", (exitCode, signal) => {
        resolve(finalize({
          exitCode,
          signal,
          stdout,
          stderr,
          durationMs: Date.now() - startedAt,
          timedOut
        }));
      });
    });
  }

  function buildLaunchArgs(instruction) {
    return [
      "exec",
      ...(useJsonOutput ? ["--json"] : []),
      ...configOverrideFlags,
      ...(model ? ["-m", model] : []),
      ...(sandboxMode ? ["-s", sandboxMode] : []),
      instruction
    ];
  }

  function buildResumeArgs(codexSessionId, message) {
    return [
      "exec",
      "resume",
      codexSessionId || "--last",
      ...(useJsonOutput ? ["--json"] : []),
      ...configOverrideFlags,
      ...(model ? ["-m", model] : []),
      message
    ];
  }

  /** @type {import('./agent-adapter.mjs').AgentAdapter} */
  const adapter = {
    async launch({ project, thread, instruction, sessionId }) {
      const chosenId = sessionId || randomUUID();
      const existing = sessionState.get(chosenId);
      if (existing?.state === "running") {
        const argsMatch = existing.project === project
          && existing.thread === thread
          && existing.callArgs.firstMessage === instruction;
        if (!argsMatch) {
          const error = new Error(`session-collision: sessionId ${chosenId} already live with different launch args (project/thread/instruction mismatch)`);
          record("launch", { project, thread, instruction, sessionId: chosenId }, {
            error: error.message
          });
          throw error;
        }
      }

      const beforeEntries = sessionsRoot === null ? new Set() : await listSessionFiles(sessionsRoot);
      const result = await runCodex({
        args: buildLaunchArgs(instruction),
        timeoutMs: spawnTimeoutMs
      });

      if (result.exitCode !== 0) {
        const error = new Error(`codex launch failed (exit=${result.exitCode ?? "null"})`);
        error.exitCode = result.exitCode;
        error.stderr = result.stderr;
        record("launch", { project, thread, instruction, sessionId: chosenId }, {
          exitCode: result.exitCode,
          stderr: result.stderr
        });
        throw error;
      }

      const codexSessionId = await detectNewSession(beforeEntries);
      const now = new Date().toISOString();
      sessionState.set(chosenId, {
        state: "running",
        launchedAt: now,
        lastInvocationAt: now,
        project,
        thread,
        callArgs: {
          project,
          thread,
          firstMessage: instruction
        },
        codexSessionId
      });
      const launchResult = {
        processHandle: {
          sessionId: chosenId,
          codexSessionId,
          lastExit: result.exitCode,
          lastStdoutTail: result.stdout.slice(-500)
        },
        sessionId: chosenId,
        launchedAt: now
      };
      record("launch", { project, thread, instruction, sessionId: chosenId }, launchResult);
      return launchResult;
    },

    async resume({ processHandle, sessionId, message }) {
      if (!sessionId) {
        const result = { messageAccepted: false, processHandle: null, sessionId: null };
        record("resume", { processHandle, sessionId, message }, {
          error: "sessionId required",
          ...result
        });
        return result;
      }

      const existing = sessionState.get(sessionId);
      if (existing?.state === "terminated") {
        const result = { messageAccepted: false, processHandle: processHandle || null, sessionId };
        record("resume", { processHandle, sessionId, message }, {
          error: "session terminated",
          ...result
        });
        return result;
      }

      if (!existing) {
        logger.warn?.(`[codex-adapter] resume without known local session state; falling back to --last for ${sessionId}`);
      } else if (!existing.codexSessionId) {
        logger.warn?.(`[codex-adapter] resume falling back to --last because codexSessionId is unknown for ${sessionId}`);
      }

      const result = await runCodex({
        args: buildResumeArgs(existing?.codexSessionId || processHandle?.codexSessionId || null, message),
        timeoutMs: spawnTimeoutMs
      });

      if (existing) {
        existing.lastInvocationAt = new Date().toISOString();
      }

      if (result.exitCode !== 0) {
        const failed = {
          messageAccepted: false,
          processHandle: processHandle || null,
          sessionId
        };
        record("resume", { processHandle, sessionId, message }, {
          ...failed,
          exitCode: result.exitCode,
          stderr: result.stderr.slice(-1000)
        });
        return failed;
      }

      const resumed = {
        messageAccepted: true,
        processHandle: {
          sessionId,
          codexSessionId: existing?.codexSessionId || processHandle?.codexSessionId || null,
          lastExit: result.exitCode,
          lastStdoutTail: result.stdout.slice(-500)
        },
        sessionId
      };
      record("resume", { processHandle, sessionId, message }, resumed);
      return resumed;
    },

    async shutdown({ processHandle, sessionId, force = false }) {
      const id = sessionId || processHandle?.sessionId;
      if (id && sessionState.has(id)) {
        sessionState.get(id).state = "terminated";
      }

      for (const child of activeSpawns) {
        try {
          child.kill?.(force ? "SIGKILL" : "SIGTERM");
        } catch {}
        if (!force) {
          const escalation = setTimeout(() => {
            try {
              child.kill?.("SIGKILL");
            } catch {}
          }, 5000);
          escalation.unref?.();
        }
      }

      const result = {
        exitCode: 0,
        reason: force ? "force-shutdown-swept" : "clean-shutdown-swept"
      };
      record("shutdown", { processHandle, sessionId: id, force }, result);
      return result;
    },

    isAlive({ processHandle, sessionId }) {
      const id = sessionId || processHandle?.sessionId;
      if (!id) return false;
      const existing = sessionState.get(id);
      return !!existing && existing.state !== "terminated";
    },

    async attachExisting({ sessionId }) {
      const result = { processHandle: null, attached: false };
      record("attachExisting", { sessionId }, result);
      return result;
    },

    async injectMessage({ processHandle, sessionId, message }) {
      const id = sessionId || processHandle?.sessionId;
      if (!id) {
        const result = { injected: false, fellBackToResume: false };
        record("injectMessage", { processHandle, sessionId, message }, result);
        return result;
      }
      const resumeResult = await adapter.resume({ processHandle, sessionId: id, message });
      const result = { injected: resumeResult.messageAccepted, fellBackToResume: true };
      record("injectMessage", { processHandle, sessionId: id, message }, result);
      return result;
    },

    parseCompletionSignal({ recentOutput, outputFormat = "text" }) {
      if (typeof recentOutput !== "string") {
        return { completed: false, reason: "invalid-input" };
      }

      if (outputFormat === "json" || outputFormat === "stream-json") {
        try {
          const payload = JSON.parse(recentOutput);
          if (payload && typeof payload === "object" && Object.keys(payload).length > 0) {
            return { completed: true, reason: "json-parse-ok" };
          }
        } catch {
          // Fall through to text heuristic
        }
      }

      const tail = recentOutput.slice(-200);
      const completed = recentOutput.trim().length > 0 && !/\berror\b|\bfailed\b|\btraceback\b/i.test(tail);
      return completed
        ? { completed: true, reason: "text-heuristic-ok" }
        : { completed: false, reason: "parse-failed" };
    },

    classifyCrash({ exitCode, stderr }) {
      const text = String(stderr || "").toLowerCase();
      if (text.includes("stdin is not a terminal")) {
        return { category: "env", retriable: false };
      }
      if (text.includes("not authenticated") || text.includes("login required") || text.includes("401") || text.includes("auth")) {
        return { category: "auth", retriable: false };
      }
      if (text.includes("enoent") || text.includes("command not found") || text.includes("codex: not found")) {
        return { category: "env", retriable: false };
      }
      if (text.includes("timed out") || text.includes("timeout") || text.includes("[adapter timeout] sigterm") || exitCode === 124) {
        return { category: "timeout", retriable: true };
      }
      if (exitCode === 0) {
        return { category: "unknown", retriable: false };
      }
      if (exitCode === 1 || exitCode === 2) {
        return { category: "agent-error", retriable: true };
      }
      return { category: "unknown", retriable: false };
    }
  };

  return adapter;
}

if (AGENT_ADAPTER_METHODS.length !== 8) {
  throw new Error(`agent-adapter contract mismatch: expected 8 methods, got ${AGENT_ADAPTER_METHODS.length}`);
}
