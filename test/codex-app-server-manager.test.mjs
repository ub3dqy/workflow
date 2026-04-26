import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { createCodexAppServerManager } from "../dashboard/codex-app-server-manager.mjs";

async function createRuntimeRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "codex-app-server-manager-"));
}

class FakeChild extends EventEmitter {
  constructor({ exitOnKill = true, autoExit = false } = {}) {
    super();
    this.exitOnKill = exitOnKill;
    this.pid = 4242;
    this.stderr = new PassThrough();
    this.exitCode = null;
    this.signals = [];
    if (autoExit) {
      queueMicrotask(() => this.emit("exit", 0, null));
    }
  }

  kill(signal) {
    this.signals.push(signal);
    this.exitCode = 0;
    if (this.exitOnKill) {
      queueMicrotask(() => this.emit("exit", 0, signal));
    }
    return true;
  }

  unref() {}
}

test("manager refuses non-loopback ws URLs", async () => {
  const manager = createCodexAppServerManager({
    runtimeRoot: await createRuntimeRoot(),
    wsUrl: "ws://0.0.0.0:4501",
    probeReady: async () => true,
    spawnProcess: () => {
      throw new Error("spawn must not be called");
    }
  });

  const status = await manager.start();
  assert.equal(status.state, "error");
  assert.equal(status.ready, false);
  assert.match(status.lastError, /non-loopback/);
});

test("manager reuses an already-ready app-server without spawning", async () => {
  let spawnCount = 0;
  const manager = createCodexAppServerManager({
    runtimeRoot: await createRuntimeRoot(),
    wsUrl: "ws://127.0.0.1:4501",
    probeReady: async () => true,
    spawnProcess: () => {
      spawnCount += 1;
      return new FakeChild();
    }
  });

  const status = await manager.start();
  assert.equal(status.state, "ready");
  assert.equal(status.ready, true);
  assert.equal(status.managed, false);
  assert.equal(spawnCount, 0);
});

test("manager spawns codex app-server and stops its managed child", async () => {
  let probeCount = 0;
  let child;
  const spawns = [];
  const managerRuntimeRoot = await createRuntimeRoot();
  const manager = createCodexAppServerManager({
    runtimeRoot: managerRuntimeRoot,
    wsUrl: "ws://127.0.0.1:4501",
    readinessTimeoutMs: 100,
    readinessIntervalMs: 1,
    probeReady: async () => {
      probeCount += 1;
      return probeCount > 1;
    },
    spawnProcess: (command, args, options) => {
      child = new FakeChild({ autoExit: process.platform === "win32" });
      spawns.push({ command, args, options });
      return child;
    }
  });

  const started = await manager.start();
  assert.equal(started.state, "ready");
  assert.equal(started.ready, true);
  assert.equal(started.managed, true);
  assert.equal(spawns.length, 1);
  if (process.platform === "win32") {
    assert.equal(spawns[0].command, "powershell.exe");
    assert.equal(spawns[0].options.windowsHide, true);
    assert.match(spawns[0].args.at(-1), /run-hidden\.ps1$/);
  } else {
    assert.equal(started.pid, 4242);
    assert.equal(spawns[0].command, "codex");
    assert.deepEqual(spawns[0].args, [
      "app-server",
      "--listen",
      "ws://127.0.0.1:4501"
    ]);
    assert.equal(spawns[0].options.detached, true);
    assert.deepEqual(spawns[0].options.stdio.slice(0, 2), ["ignore", "ignore"]);
    assert.equal(typeof spawns[0].options.stdio[2], "number");
    const pidPath = path.join(managerRuntimeRoot, "codex-app-server.pid");
    assert.equal(await fs.readFile(pidPath, "utf8"), "4242\n");
  }

  const stopped = await manager.stop();
  assert.equal(stopped.state, "stopped");
  assert.equal(stopped.ready, false);
  if (process.platform === "win32") {
    assert.equal(spawns.length, 2);
  } else {
    assert.deepEqual(child.signals, ["SIGTERM"]);
  }
});

test("manager stops a stored detached Unix app-server after dashboard restart", async () => {
  const runtimeRoot = await createRuntimeRoot();
  await fs.writeFile(path.join(runtimeRoot, "codex-app-server.pid"), "4242\n", "utf8");
  const signals = [];
  let alive = true;
  const manager = createCodexAppServerManager({
    runtimeRoot,
    wsUrl: "ws://127.0.0.1:4501",
    platform: "linux",
    stopTimeoutMs: 50,
    killWaitMs: 50,
    probeReady: async () => false,
    killProcess: (pid, signal) => {
      signals.push({ pid, signal });
      if (signal === 0 && !alive) {
        const error = new Error("missing");
        error.code = "ESRCH";
        throw error;
      }
      if (pid === -4242 && signal === "SIGTERM") {
        alive = false;
      }
      return true;
    },
    spawnProcess: () => {
      throw new Error("spawn must not be called");
    }
  });

  const stopped = await manager.stop();
  assert.equal(stopped.state, "stopped");
  assert.equal(stopped.ready, false);
  assert.deepEqual(signals, [
    { pid: -4242, signal: "SIGTERM" },
    { pid: 4242, signal: 0 }
  ]);
  await assert.rejects(
    fs.readFile(path.join(runtimeRoot, "codex-app-server.pid"), "utf8"),
    { code: "ENOENT" }
  );
});

test("manager uses hidden PowerShell relay for Windows app-server launcher", async () => {
  let probeCount = 0;
  const spawns = [];
  const runtimeRoot = await createRuntimeRoot();
  const manager = createCodexAppServerManager({
    runtimeRoot,
    cwd: "E:\\Project\\workflow",
    wsUrl: "ws://127.0.0.1:4501",
    platform: "win32",
    readinessTimeoutMs: 100,
    readinessIntervalMs: 1,
    probeReady: async () => {
      probeCount += 1;
      return probeCount > 1;
    },
    spawnProcess: (command, args, options) => {
      const child = new FakeChild({ autoExit: true });
      spawns.push({ command, args, options });
      return child;
    }
  });

  const started = await manager.start();
  assert.equal(started.state, "ready");
  assert.equal(started.managed, true);
  assert.equal(spawns.length, 1);
  assert.equal(spawns[0].command, "powershell.exe");
  assert.equal(spawns[0].options.windowsHide, true);
  assert.deepEqual(spawns[0].args.slice(0, 3), [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass"
  ]);
  assert.match(spawns[0].args.at(-1), /run-hidden\.ps1$/);

  const psBody = await fs.readFile(spawns[0].args.at(-1), "utf8");
  assert.match(psBody, /Start-Process -FilePath \$wsl -ArgumentList \$argsList -WindowStyle Hidden -PassThru/);
  assert.match(psBody, /\$argsList = @\('-d', 'Ubuntu', '--exec', 'bash', '.*start-app-server\.sh'\)/);
  assert.doesNotMatch(psBody, /E:\\Project\\workflow/);

  const startScriptPath = path.join(
    runtimeRoot,
    "codex-transport-launcher",
    "start-app-server.sh"
  );
  const startScript = await fs.readFile(startScriptPath, "utf8");
  assert.match(startScript, /cd '\/mnt\/e\/Project\/workflow'/);
  assert.match(
    startScript,
    /exec >> '(\/tmp|\/mnt\/[a-z])\/.*codex-app-server-manager-[^']+\/codex-app-server\.log' 2>&1/
  );
  assert.match(startScript, /CODEX_BIN="\$\(command -v codex \|\| true\)"/);
  assert.match(startScript, /error: codex binary not found/);
  assert.match(startScript, /exec "\$CODEX_BIN" app-server --listen 'ws:\/\/127\.0\.0\.1:4501'/);
  assert.doesNotMatch(startScript, /E:\\Project\\workflow/);

  await manager.stop();
  assert.equal(spawns.length, 2);
  assert.equal(spawns[1].command, "powershell.exe");
  assert.equal(spawns[1].options.windowsHide, true);
  const stopPsBody = await fs.readFile(spawns[1].args.at(-1), "utf8");
  assert.match(stopPsBody, /Start-Process -FilePath \$wsl -ArgumentList \$argsList -WindowStyle Hidden -PassThru -Wait/);
  assert.match(stopPsBody, /exit \$process\.ExitCode/);

  const stopScriptPath = path.join(
    runtimeRoot,
    "codex-transport-launcher",
    "stop-app-server.sh"
  );
  const stopScript = await fs.readFile(stopScriptPath, "utf8");
  assert.match(stopScript, /pkill -TERM -f 'codex app-server --listen ws:\/\/127\.0\.0\.1:4501'/);
});

test("manager force-kills the detached process group when graceful stop times out", async () => {
  let child;
  const groupSignals = [];
  const manager = createCodexAppServerManager({
    runtimeRoot: await createRuntimeRoot(),
    wsUrl: "ws://127.0.0.1:4501",
    platform: "linux",
    readinessTimeoutMs: 100,
    readinessIntervalMs: 1,
    stopTimeoutMs: 50,
    killWaitMs: 50,
    probeReady: async () => false,
    killProcess: (pid, signal) => {
      groupSignals.push({ pid, signal });
      if (signal === "SIGKILL") {
        queueMicrotask(() => child.emit("exit", null, signal));
      }
      return true;
    },
    spawnProcess: () => {
      child = new FakeChild({ exitOnKill: false });
      return child;
    }
  });

  const started = await manager.start();
  assert.equal(started.state, "error");
  assert.equal(started.managed, true);

  const stopped = await manager.stop();
  assert.equal(stopped.state, "stopped");
  assert.equal(stopped.ready, false);
  assert.equal(stopped.managed, false);
  assert.deepEqual(groupSignals, [
    { pid: -4242, signal: "SIGTERM" },
    { pid: -4242, signal: "SIGKILL" }
  ]);
  assert.deepEqual(child.signals, ["SIGTERM", "SIGKILL"]);
});
