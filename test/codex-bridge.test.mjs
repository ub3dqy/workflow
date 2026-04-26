import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createCodexBridge,
  isLoopbackWsUrl
} from "../dashboard/codex-bridge.mjs";
import { toHostPath } from "../scripts/mailbox-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

async function createRuntimeRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "codex-bridge-"));
}

function makePendingRow(relativePath = "to-codex/workflow__2026-04-24T10-00-00Z-thread-claude-001.md") {
  return {
    relativePath,
    to: "codex",
    from: "claude",
    project: "workflow",
    deliverable: true,
    thread: "thread",
    created: "2026-04-24T10:00:00Z"
  };
}

function makeSession() {
  return {
    session_id: "codex-session-1",
    agent: "codex",
    project: "workflow",
    cwd: toHostPath(repoRoot),
    last_seen: new Date().toISOString()
  };
}

function makeClient({
  calls,
  loadedThreads = ["thread-1"],
  statusType = "idle",
  threadCwds = {},
  threadSources = {},
  threadCreatedAts = {},
  threadUpdatedAts = {},
  readErrorByThread = {},
  startError = null,
  turnResult = { turn: { id: "turn-1" } }
} = {}) {
  return {
    async initialize() {
      calls.initialize += 1;
    },
    sendInitialized() {
      calls.initialized += 1;
    },
    async listLoadedThreads() {
      calls.list += 1;
      return { data: loadedThreads };
    },
    async readThread(threadId) {
      calls.read.push(threadId);
      if (readErrorByThread[threadId]) {
        throw readErrorByThread[threadId];
      }
      return {
        thread: {
          id: threadId,
          cwd: threadCwds[threadId] || repoRoot,
          source: threadSources[threadId] || "",
          createdAt: threadCreatedAts[threadId] || 0,
          updatedAt: threadUpdatedAts[threadId] || 0,
          status: { type: statusType }
        }
      };
    },
    async resumeThread(threadId, params) {
      calls.resume.push({ threadId, params });
      return { thread: { id: threadId } };
    },
    async startTurn(params) {
      calls.start.push(params);
      if (startError) {
        throw startError;
      }
      return turnResult;
    },
    async close() {
      calls.close += 1;
    }
  };
}

test("loopback validator accepts only plain ws loopback URLs", () => {
  assert.equal(isLoopbackWsUrl("ws://127.0.0.1:4501"), true);
  assert.equal(isLoopbackWsUrl("ws://localhost:4501"), true);
  assert.equal(isLoopbackWsUrl("wss://127.0.0.1:4501"), false);
  assert.equal(isLoopbackWsUrl("ws://0.0.0.0:4501"), false);
});

function makeCalls() {
  return {
    initialize: 0,
    initialized: 0,
    list: 0,
    read: [],
    resume: [],
    start: [],
    close: 0
  };
}

test("bridge does not inject when transport is not ready", async () => {
  let createClientCalls = 0;
  const bridge = createCodexBridge({
    runtimeRoot: await createRuntimeRoot(),
    getSupervisorSnapshot: async () => ({
      pendingIndex: [makePendingRow()],
      activeSessions: [makeSession()]
    }),
    getTransportStatus: () => ({
      state: "stopped",
      ready: false,
      wsUrl: "ws://127.0.0.1:4501"
    }),
    createClient: async () => {
      createClientCalls += 1;
      throw new Error("client must not be created");
    },
    logger: { error() {} }
  });

  const health = await bridge.tick();
  assert.equal(health.state, "transport_not_ready");
  assert.equal(health.lastBlockedReason, "transport_not_ready");
  assert.equal(createClientCalls, 0);
});

test("bridge uses app-server project cwd fallback when codex hook session is missing", async () => {
  const calls = makeCalls();
  let createClientCalls = 0;
  const runtimeRoot = await createRuntimeRoot();
  const bridge = createCodexBridge({
    runtimeRoot,
    getSupervisorSnapshot: async () => ({
      pendingIndex: [makePendingRow()],
      activeSessions: []
    }),
    getTransportStatus: () => ({
      state: "ready",
      ready: true,
      wsUrl: "ws://127.0.0.1:4501"
    }),
    createClient: async () => {
      createClientCalls += 1;
      return makeClient({ calls });
    },
    logger: { error() {} }
  });

  const health = await bridge.tick();
  const deliveries = JSON.parse(
    await fs.readFile(path.join(runtimeRoot, "deliveries.json"), "utf8")
  );

  assert.equal(health.state, "idle");
  assert.equal(health.lastBlockedReason, "");
  assert.equal(createClientCalls, 1);
  assert.equal(calls.resume.length, 1);
  assert.equal(calls.start.length, 1);
  assert.equal(calls.start[0].threadId, "thread-1");
  assert.equal(deliveries[0].state, "signaled");
  assert.deepEqual(deliveries[0].sessionIds, []);
  assert.equal(deliveries[0].sessionFreshnessBasis, "appServerThreadCwd:projectBasename");
  assert.equal(deliveries[0].matchBasis, "projectBasename");
});

test("bridge records blocked_no_session when hook session is missing and no project thread matches", async () => {
  const calls = makeCalls();
  const runtimeRoot = await createRuntimeRoot();
  const bridge = createCodexBridge({
    runtimeRoot,
    getSupervisorSnapshot: async () => ({
      pendingIndex: [makePendingRow()],
      activeSessions: []
    }),
    getTransportStatus: () => ({
      state: "ready",
      ready: true,
      wsUrl: "ws://127.0.0.1:4501"
    }),
    createClient: async () =>
      makeClient({
        calls,
        threadCwds: { "thread-1": "/tmp/other-project" }
      }),
    logger: { error() {} }
  });

  const health = await bridge.tick();
  const deliveries = JSON.parse(
    await fs.readFile(path.join(runtimeRoot, "deliveries.json"), "utf8")
  );

  assert.equal(health.state, "blocked");
  assert.equal(health.lastBlockedReason, "blocked_no_session");
  assert.equal(calls.start.length, 0);
  assert.equal(deliveries[0].state, "blocked_no_session");
  assert.equal(deliveries[0].sessionFreshnessBasis, "appServerThreadCwd:projectBasename");
  assert.equal(deliveries[0].matchBasis, "projectBasename");
});

test("bridge uses active project roots to avoid basename-only fallback collisions", async () => {
  const calls = makeCalls();
  const runtimeRoot = await createRuntimeRoot();
  const bridge = createCodexBridge({
    runtimeRoot,
    getSupervisorSnapshot: async () => ({
      pendingIndex: [makePendingRow()],
      activeSessions: [
        {
          ...makeSession(),
          agent: "claude",
          session_id: "claude-session-1"
        }
      ]
    }),
    getTransportStatus: () => ({
      state: "ready",
      ready: true,
      wsUrl: "ws://127.0.0.1:4501"
    }),
    createClient: async () =>
      makeClient({
        calls,
        loadedThreads: ["wrong-workflow", "real-workflow"],
        threadCwds: {
          "wrong-workflow": "/tmp/workflow",
          "real-workflow": repoRoot
        },
        threadUpdatedAts: {
          "wrong-workflow": Date.now(),
          "real-workflow": Date.now() - 1000
        }
      }),
    logger: { error() {} }
  });

  const health = await bridge.tick();
  const deliveries = JSON.parse(
    await fs.readFile(path.join(runtimeRoot, "deliveries.json"), "utf8")
  );

  assert.equal(health.state, "idle");
  assert.equal(calls.start.length, 1);
  assert.equal(calls.start[0].threadId, "real-workflow");
  assert.equal(deliveries[0].matchBasis, "projectRoot");
  assert.equal(deliveries[0].sessionFreshnessBasis, "appServerThreadCwd:projectRoot");
});

test("bridge blocks stale app-server fallback threads", async () => {
  const calls = makeCalls();
  const runtimeRoot = await createRuntimeRoot();
  const bridge = createCodexBridge({
    runtimeRoot,
    fallbackMaxThreadAgeMs: 60_000,
    getSupervisorSnapshot: async () => ({
      pendingIndex: [makePendingRow()],
      activeSessions: []
    }),
    getTransportStatus: () => ({
      state: "ready",
      ready: true,
      wsUrl: "ws://127.0.0.1:4501"
    }),
    createClient: async () =>
      makeClient({
        calls,
        threadUpdatedAts: {
          "thread-1": Date.now() - 120_000
        }
      }),
    logger: { error() {} }
  });

  const health = await bridge.tick();
  const deliveries = JSON.parse(
    await fs.readFile(path.join(runtimeRoot, "deliveries.json"), "utf8")
  );

  assert.equal(health.state, "blocked");
  assert.equal(health.lastBlockedReason, "blocked_stale_thread");
  assert.equal(calls.start.length, 0);
  assert.equal(deliveries[0].state, "blocked_stale_thread");
  assert.deepEqual(deliveries[0].staleThreadIds, ["thread-1"]);
});

test("bridge accepts fresh second-based app-server timestamps", async () => {
  const calls = makeCalls();
  const runtimeRoot = await createRuntimeRoot();
  const bridge = createCodexBridge({
    runtimeRoot,
    fallbackMaxThreadAgeMs: 60_000,
    getSupervisorSnapshot: async () => ({
      pendingIndex: [makePendingRow()],
      activeSessions: []
    }),
    getTransportStatus: () => ({
      state: "ready",
      ready: true,
      wsUrl: "ws://127.0.0.1:4501"
    }),
    createClient: async () =>
      makeClient({
        calls,
        threadUpdatedAts: {
          "thread-1": Math.floor(Date.now() / 1000)
        }
      }),
    logger: { error() {} }
  });

  const health = await bridge.tick();

  assert.equal(health.state, "idle");
  assert.equal(calls.start.length, 1);
});

test("bridge ignores non-cli app-server threads when using project cwd fallback", async () => {
  const calls = makeCalls();
  const runtimeRoot = await createRuntimeRoot();
  const bridge = createCodexBridge({
    runtimeRoot,
    getSupervisorSnapshot: async () => ({
      pendingIndex: [makePendingRow()],
      activeSessions: []
    }),
    getTransportStatus: () => ({
      state: "ready",
      ready: true,
      wsUrl: "ws://127.0.0.1:4501"
    }),
    createClient: async () =>
      makeClient({
        calls,
        loadedThreads: ["thread-1", "thread-2", "thread-3"],
        threadSources: {
          "thread-1": "cli",
          "thread-2": "vscode",
          "thread-3": "vscode"
        }
      }),
    logger: { error() {} }
  });

  const health = await bridge.tick();
  const deliveries = JSON.parse(
    await fs.readFile(path.join(runtimeRoot, "deliveries.json"), "utf8")
  );

  assert.equal(health.state, "idle");
  assert.equal(health.lastBlockedReason, "");
  assert.equal(calls.start.length, 1);
  assert.equal(calls.start[0].threadId, "thread-1");
  assert.equal(deliveries[0].state, "signaled");
});

test("bridge allows a single non-cli project thread when no cli thread exists", async () => {
  const calls = makeCalls();
  const runtimeRoot = await createRuntimeRoot();
  const bridge = createCodexBridge({
    runtimeRoot,
    getSupervisorSnapshot: async () => ({
      pendingIndex: [makePendingRow()],
      activeSessions: []
    }),
    getTransportStatus: () => ({
      state: "ready",
      ready: true,
      wsUrl: "ws://127.0.0.1:4501"
    }),
    createClient: async () =>
      makeClient({
        calls,
        loadedThreads: ["thread-1"],
        threadSources: {
          "thread-1": "vscode"
        }
      }),
    logger: { error() {} }
  });

  const health = await bridge.tick();
  const deliveries = JSON.parse(
    await fs.readFile(path.join(runtimeRoot, "deliveries.json"), "utf8")
  );

  assert.equal(health.state, "idle");
  assert.equal(health.lastBlockedReason, "");
  assert.equal(calls.start.length, 1);
  assert.equal(calls.start[0].threadId, "thread-1");
  assert.equal(deliveries[0].state, "signaled");
});

test("bridge records blocked_no_thread without starting a turn", async () => {
  const calls = makeCalls();
  const runtimeRoot = await createRuntimeRoot();
  const bridge = createCodexBridge({
    runtimeRoot,
    getSupervisorSnapshot: async () => ({
      pendingIndex: [makePendingRow()],
      activeSessions: [makeSession()]
    }),
    getTransportStatus: () => ({
      state: "ready",
      ready: true,
      wsUrl: "ws://127.0.0.1:4501"
    }),
    createClient: async () =>
      makeClient({
        calls,
        threadCwds: { "thread-1": "/tmp/other-project" }
      }),
    logger: { error() {} }
  });

  const health = await bridge.tick();
  const deliveries = JSON.parse(
    await fs.readFile(path.join(runtimeRoot, "deliveries.json"), "utf8")
  );

  assert.equal(health.state, "blocked");
  assert.equal(health.lastBlockedReason, "blocked_no_thread");
  assert.equal(calls.start.length, 0);
  assert.equal(deliveries[0].state, "blocked_no_thread");
});

test("bridge records blocked_no_rollout without failing the tick", async () => {
  const calls = makeCalls();
  const runtimeRoot = await createRuntimeRoot();
  const bridge = createCodexBridge({
    runtimeRoot,
    getSupervisorSnapshot: async () => ({
      pendingIndex: [makePendingRow()],
      activeSessions: [makeSession()]
    }),
    getTransportStatus: () => ({
      state: "ready",
      ready: true,
      wsUrl: "ws://127.0.0.1:4501"
    }),
    createClient: async () =>
      makeClient({
        calls,
        readErrorByThread: {
          "thread-1": new Error(
            '{"code":-32600,"message":"no rollout found for thread id thread-1"}'
          )
        }
      }),
    logger: { error() {} }
  });

  const health = await bridge.tick();
  const deliveries = JSON.parse(
    await fs.readFile(path.join(runtimeRoot, "deliveries.json"), "utf8")
  );

  assert.equal(health.state, "blocked");
  assert.equal(health.lastError, "");
  assert.equal(health.lastBlockedReason, "blocked_no_rollout");
  assert.equal(calls.start.length, 0);
  assert.equal(deliveries[0].state, "blocked_no_rollout");
  assert.equal(deliveries[0].threadId, "thread-1");
});

test("bridge chooses the freshest loaded project thread instead of blocking ambiguous", async () => {
  const calls = makeCalls();
  const runtimeRoot = await createRuntimeRoot();
  const bridge = createCodexBridge({
    runtimeRoot,
    getSupervisorSnapshot: async () => ({
      pendingIndex: [makePendingRow()],
      activeSessions: [makeSession()]
    }),
    getTransportStatus: () => ({
      state: "ready",
      ready: true,
      wsUrl: "ws://127.0.0.1:4501"
    }),
    createClient: async () =>
      makeClient({
        calls,
        loadedThreads: ["thread-1", "thread-2"],
        threadUpdatedAts: {
          "thread-1": 100,
          "thread-2": 200
        }
      }),
    logger: { error() {} }
  });

  const health = await bridge.tick();
  const deliveries = JSON.parse(
    await fs.readFile(path.join(runtimeRoot, "deliveries.json"), "utf8")
  );

  assert.equal(health.state, "idle");
  assert.equal(health.lastBlockedReason, "");
  assert.equal(calls.start.length, 1);
  assert.equal(calls.start[0].threadId, "thread-2");
  assert.equal(deliveries[0].state, "signaled");
});

test("bridge resumes exactly one idle matching thread and suppresses duplicate turns", async () => {
  const calls = makeCalls();
  const runtimeRoot = await createRuntimeRoot();
  const bridge = createCodexBridge({
    runtimeRoot,
    getSupervisorSnapshot: async () => ({
      pendingIndex: [makePendingRow()],
      activeSessions: [makeSession()]
    }),
    getTransportStatus: () => ({
      state: "ready",
      ready: true,
      wsUrl: "ws://127.0.0.1:4501"
    }),
    createClient: async () => makeClient({ calls }),
    logger: { error() {} }
  });

  const firstHealth = await bridge.tick();
  const secondHealth = await bridge.tick();
  const deliveries = JSON.parse(
    await fs.readFile(path.join(runtimeRoot, "deliveries.json"), "utf8")
  );

  assert.equal(firstHealth.state, "idle");
  assert.equal(secondHealth.state, "idle");
  assert.equal(calls.resume.length, 1);
  assert.equal(calls.start.length, 1);
  assert.equal(calls.start[0].threadId, "thread-1");
  assert.match(calls.start[0].input[0].text, /Mailbox reminder for project workflow/);
  assert.equal(deliveries[0].state, "signaled");
  assert.equal(deliveries[0].threadId, "thread-1");
  assert.deepEqual(deliveries[0].sessionIds, ["codex-session-1"]);
  assert.equal(deliveries[0].turnId, "turn-1");
});

test("bridge records blocked_no_rollout when turn start reports missing rollout", async () => {
  const calls = makeCalls();
  const runtimeRoot = await createRuntimeRoot();
  const bridge = createCodexBridge({
    runtimeRoot,
    getSupervisorSnapshot: async () => ({
      pendingIndex: [makePendingRow()],
      activeSessions: [makeSession()]
    }),
    getTransportStatus: () => ({
      state: "ready",
      ready: true,
      wsUrl: "ws://127.0.0.1:4501"
    }),
    createClient: async () =>
      makeClient({
        calls,
        startError: new Error(
          '{"code":-32600,"message":"no rollout found for thread id thread-1"}'
        )
      }),
    logger: { error() {} }
  });

  const health = await bridge.tick();
  const deliveries = JSON.parse(
    await fs.readFile(path.join(runtimeRoot, "deliveries.json"), "utf8")
  );

  assert.equal(health.state, "blocked");
  assert.equal(health.lastError, "");
  assert.equal(health.lastBlockedReason, "blocked_no_rollout");
  assert.equal(calls.resume.length, 1);
  assert.equal(calls.start.length, 1);
  assert.equal(deliveries[0].state, "blocked_no_rollout");
  assert.equal(deliveries[0].threadId, "thread-1");
});

test("bridge records structured RPC metadata for turn failures", async () => {
  const calls = makeCalls();
  const runtimeRoot = await createRuntimeRoot();
  const bridge = createCodexBridge({
    runtimeRoot,
    getSupervisorSnapshot: async () => ({
      pendingIndex: [makePendingRow()],
      activeSessions: [makeSession()]
    }),
    getTransportStatus: () => ({
      state: "ready",
      ready: true,
      wsUrl: "ws://127.0.0.1:4501"
    }),
    createClient: async () =>
      makeClient({
        calls,
        startError: new Error(
          '{"code":-32000,"message":"simulated app-server failure"}'
        )
      }),
    logger: { error() {} }
  });

  const health = await bridge.tick();
  const deliveries = JSON.parse(
    await fs.readFile(path.join(runtimeRoot, "deliveries.json"), "utf8")
  );

  assert.equal(health.state, "blocked");
  assert.equal(health.lastBlockedReason, "blocked_rpc_error");
  assert.equal(deliveries[0].state, "blocked_rpc_error");
  assert.deepEqual(deliveries[0].rpcError, {
    code: -32000,
    message: "simulated app-server failure"
  });
});

test("bridge records RPC metadata preserved on Error objects", async () => {
  const calls = makeCalls();
  const error = new Error("typed app-server failure");
  error.code = -32001;
  const runtimeRoot = await createRuntimeRoot();
  const bridge = createCodexBridge({
    runtimeRoot,
    getSupervisorSnapshot: async () => ({
      pendingIndex: [makePendingRow()],
      activeSessions: [makeSession()]
    }),
    getTransportStatus: () => ({
      state: "ready",
      ready: true,
      wsUrl: "ws://127.0.0.1:4501"
    }),
    createClient: async () =>
      makeClient({
        calls,
        startError: error
      }),
    logger: { error() {} }
  });

  await bridge.tick();
  const deliveries = JSON.parse(
    await fs.readFile(path.join(runtimeRoot, "deliveries.json"), "utf8")
  );

  assert.deepEqual(deliveries[0].rpcError, {
    code: -32001,
    message: "typed app-server failure"
  });
});

test("bridge records plain turn.id when app-server does not nest the result", async () => {
  const calls = makeCalls();
  const runtimeRoot = await createRuntimeRoot();
  const bridge = createCodexBridge({
    runtimeRoot,
    getSupervisorSnapshot: async () => ({
      pendingIndex: [makePendingRow()],
      activeSessions: [makeSession()]
    }),
    getTransportStatus: () => ({
      state: "ready",
      ready: true,
      wsUrl: "ws://127.0.0.1:4501"
    }),
    createClient: async () =>
      makeClient({
        calls,
        turnResult: { id: "plain-turn-1" }
      }),
    logger: { error() {} }
  });

  await bridge.tick();
  const deliveries = JSON.parse(
    await fs.readFile(path.join(runtimeRoot, "deliveries.json"), "utf8")
  );

  assert.equal(deliveries[0].turnId, "plain-turn-1");
});

test("bridge retains signaled delivery evidence and prunes stale blocked rows", async () => {
  const runtimeRoot = await createRuntimeRoot();
  await fs.writeFile(
    path.join(runtimeRoot, "deliveries.json"),
    JSON.stringify(
      [
        {
          relativePath: makePendingRow().relativePath,
          project: "workflow",
          thread: "thread",
          state: "signaled"
        },
        {
          relativePath: "to-codex/workflow__2026-04-24T11-00-00Z-old-claude-001.md",
          project: "workflow",
          thread: "old",
          state: "signaled"
        },
        {
          relativePath: "to-codex/workflow__2026-04-24T12-00-00Z-blocked-claude-001.md",
          project: "workflow",
          thread: "blocked",
          state: "blocked_no_session"
        }
      ],
      null,
      2
    ),
    "utf8"
  );

  const bridge = createCodexBridge({
    runtimeRoot,
    getSupervisorSnapshot: async () => ({
      pendingIndex: [makePendingRow()],
      activeSessions: [makeSession()]
    }),
    getTransportStatus: () => ({
      state: "ready",
      ready: true,
      wsUrl: "ws://127.0.0.1:4501"
    }),
    createClient: async () => {
      throw new Error("signaled pending rows should not need app-server lookup");
    },
    logger: { error() {} }
  });

  const health = await bridge.tick();
  const deliveries = JSON.parse(
    await fs.readFile(path.join(runtimeRoot, "deliveries.json"), "utf8")
  );

  assert.equal(health.state, "idle");
  assert.equal(deliveries.length, 2);
  assert.deepEqual(
    deliveries.map((delivery) => delivery.relativePath).sort(),
    [
      "to-codex/workflow__2026-04-24T10-00-00Z-thread-claude-001.md",
      "to-codex/workflow__2026-04-24T11-00-00Z-old-claude-001.md"
    ]
  );
});

test("bridge fails closed when the matching thread is active", async () => {
  const calls = makeCalls();
  const runtimeRoot = await createRuntimeRoot();
  const bridge = createCodexBridge({
    runtimeRoot,
    getSupervisorSnapshot: async () => ({
      pendingIndex: [makePendingRow()],
      activeSessions: [makeSession()]
    }),
    getTransportStatus: () => ({
      state: "ready",
      ready: true,
      wsUrl: "ws://127.0.0.1:4501"
    }),
    createClient: async () => makeClient({ calls, statusType: "active" }),
    logger: { error() {} }
  });

  const health = await bridge.tick();
  const deliveries = JSON.parse(
    await fs.readFile(path.join(runtimeRoot, "deliveries.json"), "utf8")
  );

  assert.equal(health.state, "blocked");
  assert.equal(health.lastBlockedReason, "blocked_active_turn");
  assert.equal(calls.start.length, 0);
  assert.equal(deliveries[0].state, "blocked_active_turn");
});
