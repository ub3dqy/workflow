import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const serverPath = path.resolve("dashboard", "server.js");
const appPath = path.resolve("dashboard", "src", "App.jsx");

function extractBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing ${startNeedle}`);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `missing ${endNeedle}`);
  return source.slice(start, end);
}

test("dashboard shutdown preserves Codex app-server transport", async () => {
  const source = await fs.readFile(serverPath, "utf8");
  const shutdownRoute = extractBetween(
    source,
    'app.post("/api/runtime/shutdown"',
    'app.use("/api/runtime"'
  );
  const signalShutdown = extractBetween(
    source,
    "async function shutdown(signal)",
    'process.on("SIGINT"'
  );

  assert.doesNotMatch(shutdownRoute, /codexTransport\.stop\(/);
  assert.match(shutdownRoute, /codexTransportPreserved:\s*true/);
  assert.doesNotMatch(signalShutdown, /codexTransport\.stop\(/);
  assert.match(signalShutdown, /must preserve it/);
});

test("dashboard transport stop and restart routes preserve Codex remote sessions", async () => {
  const source = await fs.readFile(serverPath, "utf8");
  const stopRoute = extractBetween(
    source,
    'app.post("/api/runtime/codex-transport/stop"',
    'app.post("/api/runtime/codex-transport/restart"'
  );
  const restartRoute = extractBetween(
    source,
    'app.post("/api/runtime/codex-transport/restart"',
    'app.post("/api/runtime/codex-transport/force-stop"'
  );
  const forceStopRoute = extractBetween(
    source,
    'app.post("/api/runtime/codex-transport/force-stop"',
    'app.post("/api/runtime/shutdown"'
  );

  assert.doesNotMatch(stopRoute, /codexTransport\.stop\(/);
  assert.doesNotMatch(stopRoute, /codexTransport\.restart\(/);
  assert.match(stopRoute, /sendCodexTransportLifecycleDisabled\(response,\s*"stop"\)/);
  assert.doesNotMatch(restartRoute, /codexTransport\.stop\(/);
  assert.doesNotMatch(restartRoute, /codexTransport\.restart\(/);
  assert.match(restartRoute, /sendCodexTransportLifecycleDisabled\(response,\s*"restart"\)/);
  assert.match(forceStopRoute, /CODEX_FORCE_STOP_CONFIRMATION/);
  assert.match(forceStopRoute, /codexTransport\.stop\(/);
});

test("dashboard UI does not expose normal stop or restart transport controls", async () => {
  const source = await fs.readFile(appPath, "utf8");

  assert.doesNotMatch(source, /stopCodexTransport/);
  assert.doesNotMatch(source, /restartCodexTransport/);
  assert.doesNotMatch(source, /controlCodexTransport\("stop"\)/);
  assert.doesNotMatch(source, /controlCodexTransport\("restart"\)/);
  assert.doesNotMatch(source, /codexTransportDisconnectConfirm/);
  assert.match(source, /forceStopCodexTransport/);
  assert.match(source, /controlCodexTransport\("force-stop"\)/);
  assert.match(source, /CODEX_FORCE_STOP_CONFIRMATION/);
});
