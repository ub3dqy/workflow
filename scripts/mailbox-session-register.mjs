import path from "node:path";

const SUPERVISOR_ENDPOINT = "http://127.0.0.1:3003/api/runtime/sessions";
const POST_TIMEOUT_MS = 3000;

function logError(error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[mailbox-session-register] ${message}\n`);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
  }
  return chunks.join("").trim();
}

function toHostPath(rawCwd) {
  if (typeof rawCwd !== "string") return "";
  const trimmed = rawCwd.trim();
  if (!trimmed) return "";
  if (process.platform !== "win32") {
    const windowsMatch = trimmed.match(/^([A-Za-z]):[\\/](.*)$/);
    if (windowsMatch) {
      const drive = windowsMatch[1].toLowerCase();
      const remainder = windowsMatch[2].replace(/[\\]+/g, "/");
      return path.posix.join("/mnt", drive, remainder);
    }
    return trimmed;
  }
  const wslMatch = trimmed.match(/^\/mnt\/([A-Za-z])\/(.*)$/);
  if (wslMatch) {
    const drive = wslMatch[1].toUpperCase();
    const remainder = wslMatch[2].replace(/\//g, "\\");
    return `${drive}:\\${remainder}`;
  }
  return trimmed;
}

function normalizeProject(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function parseProjectArg(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--project" && typeof argv[i + 1] === "string") {
      return normalizeProject(argv[i + 1]);
    }
    if (typeof arg === "string" && arg.startsWith("--project=")) {
      return normalizeProject(arg.slice("--project=".length));
    }
  }
  return "";
}

function detectPlatform() {
  if (process.platform === "win32") return "windows";
  if (process.platform === "linux") {
    if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) return "wsl";
    return "linux";
  }
  return process.platform;
}

async function postWithTimeout(url, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    return { ok: response.ok, status: response.status };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const project = parseProjectArg(process.argv.slice(2));
  if (!project) {
    process.exit(0);
  }

  const raw = await readStdin();
  if (!raw) {
    process.exit(0);
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const session_id = typeof payload.session_id === "string" ? payload.session_id.trim() : "";
  if (!session_id) {
    process.exit(0);
  }

  const cwd = toHostPath(payload.cwd);

  const body = {
    session_id,
    agent: "claude",
    project,
    cwd,
    transport: "claude-hooks",
    platform: detectPlatform()
  };

  try {
    const result = await postWithTimeout(SUPERVISOR_ENDPOINT, body, POST_TIMEOUT_MS);
    if (!result.ok) {
      logError(`POST /sessions returned ${result.status}`);
    }
  } catch (error) {
    logError(`POST /sessions failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  process.exit(0);
}

try {
  await main();
} catch (error) {
  logError(error);
  process.exit(0);
}
