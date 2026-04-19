const SUPERVISOR_ENDPOINT = "http://127.0.0.1:3003/api/agent/runtime/deliveries";
const GET_TIMEOUT_MS = 3000;

function logError(error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[mailbox-stop-delivery] ${message}\n`);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
  }
  return chunks.join("").trim();
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

async function getWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal
    });
    if (!response.ok) {
      return { ok: false, status: response.status, data: null };
    }
    const data = await response.json();
    return { ok: true, status: response.status, data };
  } finally {
    clearTimeout(timer);
  }
}

function buildSummary(deliveries, project) {
  if (!Array.isArray(deliveries) || deliveries.length === 0) {
    return "";
  }
  const count = deliveries.length;
  const plural = count === 1 ? "письмо" : count < 5 ? "письма" : "писем";
  const threadPreview = deliveries
    .slice(0, 3)
    .map((item) => `[${item.thread}] from ${item.from}`)
    .join(", ");
  const suffix = count > 3 ? ` (всего ${count})` : "";
  return `Есть ${count} ${plural} по project ${project}: ${threadPreview}${suffix}. Проверь почту.`;
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

  const sessionId = typeof payload.session_id === "string" ? payload.session_id.trim() : "";
  if (!sessionId) {
    process.exit(0);
  }

  const url = `${SUPERVISOR_ENDPOINT}?session_id=${encodeURIComponent(sessionId)}&project=${encodeURIComponent(project)}`;

  let result;
  try {
    result = await getWithTimeout(url, GET_TIMEOUT_MS);
  } catch (error) {
    logError(`GET /deliveries failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(0);
  }

  if (!result.ok || !result.data) {
    process.exit(0);
  }

  if (result.data.session_expired === true) {
    process.exit(0);
  }

  const deliveries = Array.isArray(result.data.deliveries) ? result.data.deliveries : [];
  if (deliveries.length === 0) {
    process.exit(0);
  }

  const summary = buildSummary(deliveries, project);
  if (!summary) {
    process.exit(0);
  }

  const output = {
    hookSpecificOutput: {
      hookEventName: "Stop",
      additionalContext: summary
    }
  };

  process.stdout.write(JSON.stringify(output));
  process.exit(0);
}

try {
  await main();
} catch (error) {
  logError(error);
  process.exit(0);
}
