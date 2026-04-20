import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { AGENT_ADAPTER_METHODS } from "./agent-adapter.mjs";

export function createMockAdapter({ recordCallsTo } = {}) {
  /** @type {Map<string, {state: string, project: string, thread: string, messages: string[], launchedAt: string, terminatedAt?: string}>} */
  const mockState = new Map();
  const callLog = [];

  async function writeCallLog() {
    if (!recordCallsTo) return;
    try {
      const dir = path.dirname(recordCallsTo);
      await fs.mkdir(dir, { recursive: true });
      const tmp = `${recordCallsTo}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(callLog, null, 2), "utf8");
      await fs.rename(tmp, recordCallsTo);
    } catch (error) {
      // Non-fatal для mock — logging failure не должен прерывать adapter.
      process.stderr.write(`[mock-adapter] recordCallsTo failed: ${error.message}\n`);
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

  /** @type {import('./agent-adapter.mjs').AgentAdapter} */
  const adapter = {
    async launch({ project, thread, instruction, sessionId }) {
      const id = sessionId || randomUUID();
      const now = new Date().toISOString();
      if (mockState.has(id)) {
        const existing = mockState.get(id);
        if (existing.state !== "terminated") {
          // F2 fix post-Codex R1: throw on mismatched relaunch of live session.
          // Silent reuse hides session-collision bugs (different task reusing same sessionId).
          const firstMessage = existing.messages[0];
          const argsMatch = existing.project === project
            && existing.thread === thread
            && firstMessage === instruction;
          if (!argsMatch) {
            record("launch", { project, thread, instruction, sessionId }, {
              error: "session-collision: sessionId already live with different launch args"
            });
            throw new Error(`session-collision: sessionId ${id} already live with different launch args (project/thread/instruction mismatch)`);
          }
          const result = { processHandle: { mockSession: id }, sessionId: id, launchedAt: existing.launchedAt };
          record("launch", { project, thread, instruction, sessionId }, { reused: true, result });
          return result;
        }
      }
      const entry = {
        state: "running",
        project,
        thread,
        messages: [instruction],
        launchedAt: now
      };
      mockState.set(id, entry);
      const result = { processHandle: { mockSession: id }, sessionId: id, launchedAt: now };
      record("launch", { project, thread, instruction, sessionId }, { reused: false, result });
      return result;
    },

    async resume({ processHandle, sessionId, message }) {
      const entry = mockState.get(sessionId);
      if (!entry) {
        const err = { messageAccepted: false, processHandle: null, sessionId };
        record("resume", { sessionId, message }, { error: "session not found", ...err });
        return err;
      }
      if (entry.state === "terminated") {
        const err = { messageAccepted: false, processHandle: processHandle || null, sessionId };
        record("resume", { sessionId, message }, { error: "session terminated", ...err });
        return err;
      }
      entry.messages.push(message);
      const result = { messageAccepted: true, processHandle: { mockSession: sessionId }, sessionId };
      record("resume", { sessionId, message }, result);
      return result;
    },

    async shutdown({ processHandle, sessionId, force = false }) {
      const id = sessionId || processHandle?.mockSession;
      if (!id) {
        const res = { exitCode: null, reason: "no-identifier" };
        record("shutdown", { sessionId, force }, res);
        return res;
      }
      const entry = mockState.get(id);
      if (!entry || entry.state === "terminated") {
        const res = { exitCode: 0, reason: "already-terminated" };
        record("shutdown", { sessionId: id, force }, res);
        return res;
      }
      entry.state = "terminated";
      entry.terminatedAt = new Date().toISOString();
      const res = { exitCode: force ? 137 : 0, reason: force ? "SIGKILL-mock" : "clean-shutdown-mock" };
      record("shutdown", { sessionId: id, force }, res);
      return res;
    },

    isAlive({ processHandle, sessionId }) {
      const id = sessionId || processHandle?.mockSession;
      if (!id) return false;
      const entry = mockState.get(id);
      return !!entry && entry.state !== "terminated";
    },

    async attachExisting({ sessionId }) {
      // Mock doesn't simulate pre-existing user sessions.
      const result = { processHandle: null, attached: false };
      record("attachExisting", { sessionId }, result);
      return result;
    },

    async injectMessage({ processHandle, sessionId, message }) {
      // F1 fix post-Codex R1: accept optional sessionId fallback для restart/reattach scenarios.
      const id = processHandle?.mockSession || sessionId;
      if (!id) {
        const res = { injected: false, fellBackToResume: false };
        record("injectMessage", { message }, res);
        return res;
      }
      // Mock aliases к resume (semantically same per Claude CLI constraint).
      // If processHandle lost но sessionId present — resume recovers через sessionId.
      const resumeRes = await adapter.resume({ processHandle, sessionId: id, message });
      const res = { injected: resumeRes.messageAccepted, fellBackToResume: true };
      record("injectMessage", { sessionId: id, message }, res);
      return res;
    },

    parseCompletionSignal({ recentOutput, outputFormat = "text" }) {
      if (typeof recentOutput !== "string") {
        return { completed: false, reason: "invalid-input" };
      }
      if (recentOutput.includes("COMPLETE")) {
        return { completed: true, reason: "mock-complete-marker-found" };
      }
      if (outputFormat === "json") {
        try {
          const obj = JSON.parse(recentOutput);
          if (obj && obj.final_message) {
            return { completed: true, reason: "mock-json-final-message" };
          }
        } catch {
          // not valid JSON yet
        }
      }
      return { completed: false, reason: "no-signal" };
    },

    classifyCrash({ exitCode, stderr }) {
      if (exitCode === 0) {
        return { category: "unknown", retriable: false };
      }
      const text = String(stderr || "").toLowerCase();
      if (exitCode === 124 || text.includes("timed out") || text.includes("timeout")) {
        return { category: "timeout", retriable: true };
      }
      if (text.includes("not authenticated") || text.includes("auth") || text.includes("login required")) {
        return { category: "auth", retriable: false };
      }
      if (text.includes("cannot find module") || text.includes("rolldown") || text.includes("enoent")) {
        return { category: "env", retriable: false };
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
