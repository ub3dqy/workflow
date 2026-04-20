import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn as nodeSpawn } from "node:child_process";
import { AGENT_ADAPTER_METHODS } from "./agent-adapter.mjs";

async function writeJsonAtomically(filePath, payload) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(payload, null, 2), "utf8");
  await fs.rename(tmp, filePath);
}

export function createClaudeCodeAdapter({
  claudePath = "claude",
  spawnFn = nodeSpawn,
  spawnTimeoutMs = 5 * 60 * 1000,
  logger = console,
  recordCallsTo,
  appendSystemPrompt,
  permissionMode = "bypassPermissions",
  maxTurns = 30,
  outputFormat = "json",
  tools,
  env = process.env
} = {}) {
  /** @type {Map<string, {state: 'running'|'terminated', launchedAt: string, lastInvocationAt: string, project: string, thread: string, callArgs: {project: string, thread: string, firstMessage: string}}>} */
  const sessionState = new Map();
  /** @type {Set<any>} */
  const activeSpawns = new Set();
  const callLog = [];

  async function writeCallLog() {
    if (!recordCallsTo) return;
    try {
      await writeJsonAtomically(recordCallsTo, callLog);
    } catch (error) {
      process.stderr.write(`[claude-code-adapter] recordCallsTo failed: ${error.message}\n`);
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

  function buildCommonArgs() {
    const args = [
      "-p",
      "--output-format",
      outputFormat,
      "--permission-mode",
      permissionMode,
      "--max-turns",
      String(maxTurns)
    ];
    if (appendSystemPrompt) {
      args.push("--append-system-prompt", appendSystemPrompt);
    }
    if (tools) {
      args.push("--tools", tools);
    }
    return args;
  }

  function spawnWithFallback(binary, args) {
    return new Promise((resolve, reject) => {
      let settled = false;
      function resolveOnce(value) {
        if (settled) return;
        settled = true;
        resolve(value);
      }
      function rejectOnce(error) {
        if (settled) return;
        settled = true;
        reject(error);
      }

      let child;
      try {
        child = spawnFn(binary, args, {
          stdio: ["pipe", "pipe", "pipe"],
          env
        });
      } catch (error) {
        rejectOnce(error);
        return;
      }

      let fallbackTried = false;
      child.once?.("error", (error) => {
        if (
          !fallbackTried
          && process.platform === "win32"
          && binary === "claude"
          && error
          && error.code === "ENOENT"
        ) {
          fallbackTried = true;
          spawnWithFallback("claude.cmd", args).then(resolveOnce, rejectOnce);
          return;
        }
        rejectOnce(error);
      });

      resolveOnce(child);
    });
  }

  async function runClaude(args, { stdinInput, timeoutMs = spawnTimeoutMs } = {}) {
    const startedAt = Date.now();
    const child = await spawnWithFallback(claudePath, args);
    activeSpawns.add(child);

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let timeoutId;
    let killEscalationId;

    const finalize = (result) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (killEscalationId) clearTimeout(killEscalationId);
      activeSpawns.delete(child);
      return result;
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

    if (stdinInput && typeof child.stdin?.write === "function") {
      child.stdin.write(stdinInput);
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

  /** @type {import('./agent-adapter.mjs').AgentAdapter} */
  const adapter = {
    async launch({ project, thread, instruction, sessionId }) {
      const id = sessionId || randomUUID();
      const existing = sessionState.get(id);
      if (existing && existing.state === "running") {
        const argsMatch = existing.project === project
          && existing.thread === thread
          && existing.callArgs.firstMessage === instruction;
        if (!argsMatch) {
          const error = new Error(`session-collision: sessionId ${id} already live with different launch args (project/thread/instruction mismatch)`);
          record("launch", { project, thread, instruction, sessionId }, {
            error: error.message
          });
          throw error;
        }
      }

      const args = [
        ...buildCommonArgs(),
        "--session-id",
        id,
        instruction
      ];
      const result = await runClaude(args);
      if (result.exitCode !== 0) {
        const error = new Error(`claude launch failed (exit=${result.exitCode ?? "null"})`);
        error.exitCode = result.exitCode;
        error.stderr = result.stderr;
        record("launch", { project, thread, instruction, sessionId: id }, {
          exitCode: result.exitCode,
          stderr: result.stderr
        });
        throw error;
      }

      const now = new Date().toISOString();
      sessionState.set(id, {
        state: "running",
        launchedAt: now,
        lastInvocationAt: now,
        project,
        thread,
        callArgs: {
          project,
          thread,
          firstMessage: instruction
        }
      });
      const launchResult = {
        processHandle: {
          sessionId: id,
          lastExit: result.exitCode,
          lastStdoutTail: result.stdout.slice(-500)
        },
        sessionId: id,
        launchedAt: now
      };
      record("launch", { project, thread, instruction, sessionId: id }, launchResult);
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
        record("resume", { sessionId, message }, {
          error: "session terminated",
          ...result
        });
        return result;
      }

      const args = [
        ...buildCommonArgs(),
        "-r",
        sessionId,
        message
      ];
      const result = await runClaude(args);
      if (existing) {
        existing.lastInvocationAt = new Date().toISOString();
      }
      if (result.exitCode !== 0) {
        const failed = {
          messageAccepted: false,
          processHandle: processHandle || null,
          sessionId
        };
        record("resume", { sessionId, message }, {
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
          lastExit: result.exitCode,
          lastStdoutTail: result.stdout.slice(-500)
        },
        sessionId
      };
      record("resume", { sessionId, message }, resumed);
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

      const result = id
        ? { exitCode: 0, reason: force ? "force-shutdown-swept" : "clean-shutdown-swept" }
        : { exitCode: 0, reason: "adapter-sweep" };
      record("shutdown", { processHandle, sessionId, force }, result);
      return result;
    },

    isAlive({ processHandle, sessionId }) {
      const id = sessionId || processHandle?.sessionId;
      const entry = id ? sessionState.get(id) : null;
      return !!entry && entry.state === "running";
    },

    async attachExisting({ sessionId }) {
      const result = { processHandle: null, attached: false };
      record("attachExisting", { sessionId }, result);
      return result;
    },

    async injectMessage({ processHandle, sessionId, message }) {
      const id = processHandle?.sessionId || sessionId;
      if (!id) {
        const result = { injected: false, fellBackToResume: false };
        record("injectMessage", { processHandle, sessionId, message }, result);
        return result;
      }
      const resumed = await adapter.resume({
        processHandle,
        sessionId: id,
        message
      });
      const result = {
        injected: resumed.messageAccepted,
        fellBackToResume: true
      };
      record("injectMessage", { processHandle, sessionId: id, message }, result);
      return result;
    },

    parseCompletionSignal({ recentOutput, outputFormat: format = "text" }) {
      if (typeof recentOutput !== "string" || recentOutput.trim() === "") {
        return { completed: false, reason: "empty-output" };
      }

      if (format === "json") {
        try {
          const parsed = JSON.parse(recentOutput);
          if (parsed?.result || parsed?.final_message) {
            return { completed: true, reason: "json-turn-complete" };
          }
          const lastMessage = Array.isArray(parsed?.messages)
            ? parsed.messages.at(-1)
            : null;
          if (lastMessage?.role === "assistant" && parsed?.stop_reason === "end_turn") {
            return { completed: true, reason: "json-end-turn" };
          }
        } catch {
          return { completed: false, reason: "parse-failed" };
        }
        return { completed: false, reason: "json-no-signal" };
      }

      if (format === "stream-json") {
        const lines = recentOutput.split(/\r?\n/).filter(Boolean);
        for (let index = lines.length - 1; index >= 0; index -= 1) {
          try {
            const parsed = JSON.parse(lines[index]);
            if (parsed?.type === "result" || parsed?.subtype === "success") {
              return { completed: true, reason: "stream-result" };
            }
          } catch {}
        }
        return { completed: false, reason: "stream-no-signal" };
      }

      const tail = recentOutput.slice(-200).toLowerCase();
      if (recentOutput.trim() && !tail.includes("error")) {
        return { completed: true, reason: "text-non-empty" };
      }
      return { completed: false, reason: "text-error-tail" };
    },

    classifyCrash({ exitCode, stderr }) {
      const text = String(stderr || "");
      const lower = text.toLowerCase();

      if (exitCode === 0) {
        return { category: "unknown", retriable: false };
      }
      if (lower.includes("maximum turns") || lower.includes("max-turns")) {
        return { category: "agent-error", retriable: true };
      }
      if (lower.includes("not authenticated") || lower.includes("login required") || lower.includes("401")) {
        return { category: "auth", retriable: false };
      }
      if (lower.includes("enoent") || lower.includes("command not found") || lower.includes("claude: not found")) {
        return { category: "env", retriable: false };
      }
      if (lower.includes("timed out") || lower.includes("timeout") || lower.includes("[adapter timeout]") || lower.includes("sigterm")) {
        return { category: "timeout", retriable: true };
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
