import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { toUtcTimestamp } from "../scripts/mailbox-lib.mjs";
import { isLoopbackWsUrl } from "./codex-bridge.mjs";

function wsToHttpUrl(wsUrl, pathname) {
  const url = new URL(wsUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function fetchOk(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function defaultProbeReady(wsUrl, timeoutMs = 500) {
  return fetchOk(wsToHttpUrl(wsUrl, "/readyz"), timeoutMs);
}

async function waitForReady({ wsUrl, timeoutMs, intervalMs, probeReady }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (await probeReady(wsUrl)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

const RENAME_RETRY_DELAYS_MS = [50, 100, 150];

function isRetryableRenameError(error) {
  return error?.code === "EPERM" || error?.code === "EACCES";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toWslPath(value) {
  const raw = String(value || "").trim();
  const driveMatch = raw.match(/^([A-Za-z]):[\\/](.*)$/);
  if (!driveMatch) {
    return raw;
  }
  const drive = driveMatch[1].toLowerCase();
  const remainder = driveMatch[2].replace(/[\\]+/g, "/");
  return `/mnt/${drive}/${remainder}`;
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

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function createCodexAppServerManager({
  runtimeRoot,
  wsUrl = process.env.CODEX_APP_SERVER_URL || "ws://127.0.0.1:4501",
  cwd = process.cwd(),
  wslDistro = process.env.WORKFLOW_WSL_DISTRO_OVERRIDE || "Ubuntu",
  readinessTimeoutMs = 10000,
  readinessIntervalMs = 250,
  stopTimeoutMs = 1500,
  killWaitMs = 500,
  platform = process.platform,
  spawnProcess = spawn,
  killProcess = process.kill,
  probeReady = defaultProbeReady,
  logger = console
} = {}) {
  const statePath = runtimeRoot
    ? path.join(runtimeRoot, "codex-transport.json")
    : "";
  const state = {
    state: "stopped",
    wsUrl,
    ready: false,
    managed: false,
    pid: null,
    startedAt: null,
    stoppedAt: null,
    lastReadyAt: null,
    lastError: "",
    stderrTail: []
  };
  let child = null;

  function runtimePaths() {
    const root = runtimeRoot || (statePath ? path.dirname(statePath) : cwd);
    return {
      root,
      pidPath: path.join(root, "codex-app-server.pid"),
      logPath: path.join(root, "codex-app-server.log")
    };
  }

  function status() {
    return { ...state, stderrTail: [...state.stderrTail] };
  }

  async function persist() {
    if (!statePath) {
      return;
    }
    await atomicWriteJson(statePath, status());
  }

  function setError(error) {
    state.lastError = error instanceof Error ? error.message : String(error);
  }

  async function buildUnixSpawnSpec() {
    const paths = runtimePaths();
    await fs.mkdir(paths.root, { recursive: true });
    const logFd = openSync(paths.logPath, "a");
    return {
      command: "codex",
      args: ["app-server", "--listen", wsUrl],
      options: { cwd, detached: true, stdio: ["ignore", "ignore", logFd] },
      logFd
    };
  }

  function windowsPaths() {
    const root = runtimePaths().root;
    const helperDir = path.join(root, "codex-transport-launcher");
    const startScriptPath = path.join(helperDir, "start-app-server.sh");
    const stopScriptPath = path.join(helperDir, "stop-app-server.sh");
    const pidPath = path.join(root, "codex-app-server.pid");
    const logPath = path.join(root, "codex-app-server.log");
    return {
      helperDir,
      startScriptPath,
      stopScriptPath,
      pidPath,
      logPath,
      helperPs1Path: path.join(helperDir, "run-hidden.ps1"),
      startScriptPathWsl: toWslPath(startScriptPath),
      stopScriptPathWsl: toWslPath(stopScriptPath),
      pidPathWsl: toWslPath(pidPath),
      logPathWsl: toWslPath(logPath),
      runtimeRootWsl: toWslPath(root)
    };
  }

  async function readLogTail(maxLines = 20) {
    try {
      const raw = await fs.readFile(runtimePaths().logPath, "utf8");
      return raw
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter(Boolean)
        .slice(-maxLines);
    } catch (error) {
      if (error?.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async function writeWindowsHiddenRunner(scriptPathWsl, { wait = true } = {}) {
    const paths = windowsPaths();
    await fs.mkdir(paths.helperDir, { recursive: true });
    const psBody = [
      "$ErrorActionPreference = 'Stop'",
      "$wsl = Join-Path $env:WINDIR 'System32\\wsl.exe'",
      `$argsList = @('-d', ${psQuote(wslDistro)}, '--exec', 'bash', ${psQuote(
        scriptPathWsl
      )})`,
      wait
        ? "$process = Start-Process -FilePath $wsl -ArgumentList $argsList -WindowStyle Hidden -PassThru -Wait"
        : "$process = Start-Process -FilePath $wsl -ArgumentList $argsList -WindowStyle Hidden -PassThru",
      wait ? "exit $process.ExitCode" : "exit 0",
      ""
    ].join("\r\n");
    await fs.writeFile(paths.helperPs1Path, psBody, "utf8");
    return {
      command: "powershell.exe",
      args: [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        paths.helperPs1Path
      ],
      options: { stdio: ["ignore", "ignore", "pipe"], windowsHide: true }
    };
  }

  function waitForLauncherExit(target, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (callback, value) => {
        if (done) {
          return;
        }
        done = true;
        callback(value);
      };
      const timer = setTimeout(() => {
        finish(reject, new Error("hidden WSL launcher timed out"));
      }, timeoutMs);
      target.once?.("error", (error) => {
        clearTimeout(timer);
        finish(reject, error);
      });
      target.once?.("exit", (code, signal) => {
        clearTimeout(timer);
        if (code === 0) {
          finish(resolve, undefined);
          return;
        }
        const suffix = signal ? ` by ${signal}` : ` with code ${code}`;
        finish(reject, new Error(`hidden WSL launcher exited${suffix}`));
      });
    });
  }

  async function runWindowsHiddenScript(scriptPathWsl, options = {}) {
    const spec = await writeWindowsHiddenRunner(scriptPathWsl, options);
    const launcher = spawnProcess(spec.command, spec.args, spec.options);
    const stderrTail = [];
    launcher.stderr?.on("data", (chunk) => {
      stderrTail.push(chunk.toString().trimEnd());
      if (stderrTail.length > 20) {
        stderrTail.shift();
      }
    });
    await waitForLauncherExit(launcher);
    return stderrTail;
  }

  async function readWindowsPid() {
    try {
      const raw = await fs.readFile(windowsPaths().pidPath, "utf8");
      const pid = Number(raw.trim());
      return Number.isFinite(pid) && pid > 0 ? pid : null;
    } catch (error) {
      if (error?.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async function readWindowsLogTail(maxLines = 20) {
    return readLogTail(maxLines);
  }

  async function startWindowsAppServer() {
    const paths = windowsPaths();
    const wslCwd = toWslPath(cwd);
    await fs.mkdir(paths.helperDir, { recursive: true });
    const scriptBody = [
      "#!/usr/bin/env bash",
      "set -eo pipefail",
      `mkdir -p ${shellQuote(paths.runtimeRootWsl)}`,
      `: > ${shellQuote(paths.logPathWsl)}`,
      `exec >> ${shellQuote(paths.logPathWsl)} 2>&1`,
      "echo \"[launcher] $(date -u +%Y-%m-%dT%H:%M:%SZ) start\"",
      `echo ${shellQuote(`[launcher] ws=${wsUrl}`)}`,
      `echo ${shellQuote(`[launcher] requested_cwd=${wslCwd}`)}`,
      "if [ -f \"$HOME/.profile\" ]; then",
      "  . \"$HOME/.profile\" || echo \"[launcher] warning: ~/.profile returned $?\"",
      "fi",
      "export PATH=\"/usr/local/lib/nodejs/current/bin:/usr/local/bin:/usr/bin:/bin:$PATH\"",
      "echo \"[launcher] PATH=$PATH\"",
      `cd ${shellQuote(wslCwd)}`,
      "echo \"[launcher] cwd=$(pwd)\"",
      `rm -f ${shellQuote(paths.pidPathWsl)}`,
      "CODEX_BIN=\"$(command -v codex || true)\"",
      "if [ -z \"$CODEX_BIN\" ] && [ -x /usr/local/lib/nodejs/current/bin/codex ]; then",
      "  CODEX_BIN=/usr/local/lib/nodejs/current/bin/codex",
      "fi",
      "if [ -z \"$CODEX_BIN\" ]; then",
      "  echo \"[launcher] error: codex binary not found\"",
      "  exit 127",
      "fi",
      "echo \"[launcher] codex=$CODEX_BIN\"",
      `echo ${shellQuote("[launcher] exec codex app-server")}`,
      `exec "$CODEX_BIN" app-server --listen ${shellQuote(wsUrl)}`,
      ""
    ].join("\n");
    await fs.writeFile(paths.startScriptPath, scriptBody, "utf8");
    const spec = await writeWindowsHiddenRunner(paths.startScriptPathWsl, { wait: false });
    const launcher = spawnProcess(spec.command, spec.args, spec.options);
    launcher.stderr?.on("data", (chunk) => {
      state.stderrTail.push(chunk.toString().trimEnd());
      if (state.stderrTail.length > 20) {
        state.stderrTail.shift();
      }
    });
    launcher.once?.("error", (error) => {
      setError(error);
    });
    launcher.unref?.();
    state.pid = null;
  }

  async function stopWindowsAppServer() {
    const paths = windowsPaths();
    const pattern = `codex app-server --listen ${wsUrl}`;
    await fs.mkdir(paths.helperDir, { recursive: true });
    const scriptBody = [
      "#!/usr/bin/env bash",
      "set +e",
      `pid=$(cat ${shellQuote(paths.pidPathWsl)} 2>/dev/null || true)`,
      "case $pid in",
      "  ''|*[!0-9]*) ;;",
      "  *)",
      "    kill -TERM \"$pid\" 2>/dev/null || true",
      "    for _ in 1 2 3 4 5; do",
      "      kill -0 \"$pid\" 2>/dev/null || break",
      "      sleep 0.2",
      "    done",
      "    kill -KILL \"$pid\" 2>/dev/null || true",
      "    ;;",
      "esac",
      `pkill -TERM -f ${shellQuote(pattern)} 2>/dev/null || true`,
      "sleep 0.2",
      `pkill -KILL -f ${shellQuote(pattern)} 2>/dev/null || true`,
      `rm -f ${shellQuote(paths.pidPathWsl)}`,
      ""
    ].join("\n");
    await fs.writeFile(paths.stopScriptPath, scriptBody, "utf8");
    state.stderrTail = await runWindowsHiddenScript(paths.stopScriptPathWsl);
    state.pid = null;
  }

  function ignoreMissingProcess(error) {
    return error && (error.code === "ESRCH" || error.code === "EINVAL");
  }

  function signalManagedChild(target, signal) {
    let sent = false;
    if (target?.pid && platform !== "win32") {
      try {
        killProcess(-target.pid, signal);
        sent = true;
      } catch (error) {
        if (!ignoreMissingProcess(error)) {
          throw error;
        }
      }
    }

    if (typeof target?.kill === "function") {
      sent = target.kill(signal) || sent;
    }
    return sent;
  }

  function waitForExit(target, timeoutMs) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (result) => {
        if (done) {
          return;
        }
        done = true;
        resolve(result);
      };
      target.once?.("exit", () => finish("exit"));
      setTimeout(() => finish("timeout"), timeoutMs);
    });
  }

  async function writePidFile(pid) {
    if (!pid) {
      return;
    }
    await fs.mkdir(runtimePaths().root, { recursive: true });
    await fs.writeFile(runtimePaths().pidPath, `${pid}\n`, "utf8");
  }

  async function readPidFile() {
    try {
      const raw = await fs.readFile(runtimePaths().pidPath, "utf8");
      const pid = Number(raw.trim());
      return Number.isFinite(pid) && pid > 0 ? pid : null;
    } catch (error) {
      if (error?.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async function removePidFile() {
    await fs.rm(runtimePaths().pidPath, { force: true }).catch(() => {});
  }

  function processExists(pid) {
    try {
      killProcess(pid, 0);
      return true;
    } catch (error) {
      if (ignoreMissingProcess(error)) {
        return false;
      }
      throw error;
    }
  }

  async function waitForPidExit(pid, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      if (!processExists(pid)) {
        return "exit";
      }
      await sleep(50);
    }
    return processExists(pid) ? "timeout" : "exit";
  }

  async function stopStoredUnixAppServer() {
    const pid = await readPidFile();
    if (!pid || platform === "win32") {
      return false;
    }

    try {
      killProcess(-pid, "SIGTERM");
    } catch (error) {
      if (!ignoreMissingProcess(error)) {
        throw error;
      }
    }

    const exitResult = await waitForPidExit(pid, stopTimeoutMs);
    if (exitResult !== "exit") {
      try {
        killProcess(-pid, "SIGKILL");
      } catch (error) {
        if (!ignoreMissingProcess(error)) {
          throw error;
        }
      }
      await waitForPidExit(pid, killWaitMs);
    }
    await removePidFile();
    return true;
  }

  async function refresh() {
    if (!isLoopbackWsUrl(wsUrl)) {
      state.state = "error";
      state.ready = false;
      state.managed = Boolean(child);
      state.wsUrl = wsUrl;
      state.lastReadyAt = null;
      state.lastError = "non-loopback Codex app-server URL is refused";
      await persist();
      return status();
    }

    const ready = await probeReady(wsUrl);
    state.ready = ready;
    if (ready) {
      state.state = "ready";
      state.lastReadyAt = toUtcTimestamp();
      state.lastError = "";
    } else if (child) {
      state.state = "starting";
      state.lastReadyAt = null;
    } else if (state.state !== "error") {
      state.state = "stopped";
      state.lastReadyAt = null;
    }
    await persist();
    return status();
  }

  async function start() {
    if (!isLoopbackWsUrl(wsUrl)) {
      state.state = "error";
      state.ready = false;
      state.lastReadyAt = null;
      state.lastError = "non-loopback Codex app-server URL is refused";
      await persist();
      return status();
    }

    if (await probeReady(wsUrl)) {
      state.state = "ready";
      state.ready = true;
      state.managed = Boolean(child);
      state.lastReadyAt = toUtcTimestamp();
      state.lastError = "";
      await persist();
      return status();
    }

    if (child) {
      return refresh();
    }

    state.state = "starting";
    state.ready = false;
    state.managed = true;
    state.startedAt = toUtcTimestamp();
    state.stoppedAt = null;
    state.lastReadyAt = null;
    state.lastError = "";
    state.stderrTail = [];
    if (platform === "win32") {
      try {
        await startWindowsAppServer();
      } catch (error) {
        setError(error);
        try {
          state.stderrTail = await readWindowsLogTail();
          const lastLogLine = state.stderrTail.at(-1);
          if (lastLogLine) {
            state.lastError = `${state.lastError}; last log: ${lastLogLine}`;
          }
        } catch (logError) {
          logger.error("[codex-app-server-manager] log read failed:", logError);
        }
        state.state = "error";
        state.ready = false;
        state.managed = false;
        state.pid = null;
        state.lastReadyAt = null;
        state.stoppedAt = toUtcTimestamp();
        await persist();
        return status();
      }
    } else {
      const spec = await buildUnixSpawnSpec();
      try {
        child = spawnProcess(spec.command, spec.args, spec.options);
      } finally {
        closeSync(spec.logFd);
      }
      state.pid = child.pid || null;
      await writePidFile(state.pid).catch((error) => {
        logger.error("[codex-app-server-manager] pid write failed:", error);
      });
      child.stderr?.on("data", (chunk) => {
        state.stderrTail.push(chunk.toString().trimEnd());
        if (state.stderrTail.length > 20) {
          state.stderrTail.shift();
        }
      });
      child.on?.("exit", (code, signal) => {
        child = null;
        state.managed = false;
        state.pid = null;
        state.ready = false;
        state.lastReadyAt = null;
        state.stoppedAt = toUtcTimestamp();
        void removePidFile();
        if (state.state !== "stopped") {
          state.state = "stopped";
        }
        if (code && code !== 0) {
          state.lastError = `codex app-server exited with code ${code}`;
        } else if (signal) {
          state.lastError = `codex app-server exited by ${signal}`;
        }
        void persist().catch((error) => {
          logger.error("[codex-app-server-manager] persist failed:", error);
        });
      });
      child.unref?.();
    }

    const ready = await waitForReady({
      wsUrl,
      timeoutMs: readinessTimeoutMs,
      intervalMs: readinessIntervalMs,
      probeReady
    });
    if (ready) {
      state.state = "ready";
      state.ready = true;
      state.lastReadyAt = toUtcTimestamp();
    } else {
      state.state = "error";
      state.ready = false;
      state.lastReadyAt = null;
      let logTail = [];
      try {
        logTail = await readLogTail();
      } catch (error) {
        logger.error("[codex-app-server-manager] log read failed:", error);
      }
      const lastLogLine = logTail.at(-1);
      state.lastError = lastLogLine
        ? `codex app-server readiness probe timed out; last log: ${lastLogLine}`
        : "codex app-server readiness probe timed out";
      if (platform === "win32") {
        await stopWindowsAppServer().catch((error) => {
          logger.error("[codex-app-server-manager] cleanup failed:", error);
        });
        state.managed = false;
      }
      state.stderrTail = logTail;
    }
    await persist();
    return status();
  }

  async function stop() {
    if (platform === "win32") {
      if (child) {
        signalManagedChild(child, "SIGTERM");
        await waitForExit(child, stopTimeoutMs);
        child = null;
      }
      await stopWindowsAppServer();
      state.state = "stopped";
      state.ready = false;
      state.managed = false;
      state.pid = null;
      state.stoppedAt = toUtcTimestamp();
      state.lastReadyAt = null;
      state.lastError = "";
      await persist();
      return status();
    }

    if (!child) {
      const stoppedStored = await stopStoredUnixAppServer();
      state.state = "stopped";
      state.ready = false;
      state.managed = false;
      state.pid = null;
      state.stoppedAt = toUtcTimestamp();
      state.lastReadyAt = null;
      if (stoppedStored) {
        state.lastError = "";
      }
      await persist();
      return status();
    }

    const stoppingChild = child;
    signalManagedChild(stoppingChild, "SIGTERM");
    const exitResult = await waitForExit(stoppingChild, stopTimeoutMs);
    if (exitResult !== "exit") {
      signalManagedChild(stoppingChild, "SIGKILL");
      await waitForExit(stoppingChild, killWaitMs);
    }
    if (child === stoppingChild) {
      child = null;
    }
    await removePidFile();
    state.state = "stopped";
    state.ready = false;
    state.managed = false;
    state.pid = null;
    state.stoppedAt = toUtcTimestamp();
    state.lastReadyAt = null;
    state.lastError = "";
    await persist();
    return status();
  }

  async function restart() {
    await stop();
    return start();
  }

  return {
    status,
    refresh,
    start,
    stop,
    restart,
    setError
  };
}
