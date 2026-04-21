import { normalizeProject, toHostPath } from "./mailbox-lib.mjs";

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

function parseAgentArg(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--agent" && typeof argv[i + 1] === "string") {
      const value = argv[i + 1].trim();
      if (value === "claude" || value === "codex") return value;
    }
    if (typeof arg === "string" && arg.startsWith("--agent=")) {
      const value = arg.slice("--agent=".length).trim();
      if (value === "claude" || value === "codex") return value;
    }
  }
  return "claude";
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
  const agent = parseAgentArg(process.argv.slice(2));
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
    agent,
    project,
    cwd,
    transport: agent === "codex" ? "codex-hooks" : "claude-hooks",
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
