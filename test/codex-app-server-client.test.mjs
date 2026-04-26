import test from "node:test";
import assert from "node:assert/strict";
import { AppServerRpcClient } from "../scripts/codex-app-server-client.mjs";

test("AppServerRpcClient correlates requests, responses, and notifications", async () => {
  const sent = [];
  const client = new AppServerRpcClient({
    timeoutMs: 100,
    sendMessage: (message) => {
      sent.push(message);
    }
  });

  const initialize = client.initialize({
    clientName: "workflow-test",
    clientVersion: "0.1.0"
  });

  assert.deepEqual(sent[0], {
    id: 1,
    method: "initialize",
    params: {
      clientInfo: {
        name: "workflow-test",
        version: "0.1.0"
      }
    }
  });

  client.handleMessage({ id: 1, result: { protocolVersion: "0.1.0" } });
  assert.deepEqual(await initialize, { protocolVersion: "0.1.0" });

  client.sendInitialized();
  assert.deepEqual(sent[1], { method: "initialized" });

  client.handleMessage({
    method: "thread/status/changed",
    params: { threadId: "thread-1" }
  });
  const notification = await client.waitForNotification(
    (message) => message.method === "thread/status/changed"
  );
  assert.equal(notification.params.threadId, "thread-1");

  await client.close();
});

test("AppServerRpcClient exposes thread start helper", async () => {
  const sent = [];
  const client = new AppServerRpcClient({
    timeoutMs: 100,
    sendMessage: (message) => {
      sent.push(message);
    }
  });

  const started = client.startThread({
    cwd: "/tmp/project",
    input: [{ type: "text", text: "bootstrap" }]
  });

  assert.deepEqual(sent[0], {
    id: 1,
    method: "thread/start",
    params: {
      cwd: "/tmp/project",
      input: [{ type: "text", text: "bootstrap" }]
    }
  });

  client.handleMessage({ id: 1, result: { thread: { id: "thread-1" } } });
  assert.deepEqual(await started, { thread: { id: "thread-1" } });
  await client.close();
});

test("AppServerRpcClient rejects timed-out requests", async () => {
  const client = new AppServerRpcClient({
    timeoutMs: 5,
    sendMessage: () => {}
  });

  await assert.rejects(
    client.request("thread/read", { threadId: "missing" }),
    /timeout waiting for thread\/read/
  );
  await client.close();
});

test("AppServerRpcClient preserves JSON-RPC error metadata", async () => {
  const sent = [];
  const client = new AppServerRpcClient({
    timeoutMs: 100,
    sendMessage: (message) => {
      sent.push(message);
    }
  });

  const request = client.request("turn/start", { threadId: "thread-1" });
  client.handleMessage({
    id: sent[0].id,
    error: {
      code: -32600,
      message: "no rollout found for thread id thread-1",
      data: { threadId: "thread-1" }
    }
  });

  await assert.rejects(
    request,
    (error) => {
      assert.equal(error.message, "no rollout found for thread id thread-1");
      assert.equal(error.code, -32600);
      assert.deepEqual(error.data, { threadId: "thread-1" });
      assert.deepEqual(error.rpcError, {
        code: -32600,
        message: "no rollout found for thread id thread-1",
        data: { threadId: "thread-1" }
      });
      return true;
    }
  );
  await client.close();
});
