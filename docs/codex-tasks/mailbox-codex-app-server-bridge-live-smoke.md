# mailbox-codex-app-server-bridge — Live Smoke Runbook

**Stage**: 7A
**Purpose**: close AC-16, AC-17, and dashboard UI smoke after code review approval.
**Environment**: real Windows/WSL host only. Do not run this from the Codex sandbox.

This runbook is a hard evidence gate. Do not mark the stage accepted until every required output is captured from the real environment. Do not infer success from code inspection, unit tests, or prior smoke output.

## 0. Why This Exists

The implementation passed automated WSL checks and Claude Round-2 code review, but final live closure is blocked inside this sandbox:

```bash
node -e "require('node:http').createServer((req,res)=>res.end('ok')).listen(3003,'127.0.0.1')"
```

Sandbox result:

```text
Error: listen EPERM: operation not permitted 127.0.0.1:3003
```

Because AC-16 and AC-17 require real loopback HTTP/WebSocket behavior, the remaining proof must be run by an operator outside the sandbox.

## 1. Rules

- Use the real repository checkout, normally `/mnt/e/project/workflow` or the same path casing used by the active Codex remote session.
- Do not run `node scripts/mailbox.mjs list`; it mutates `received_at`.
- Use only loopback URLs for v1: `ws://127.0.0.1:4501`, `http://127.0.0.1:3003`, `http://127.0.0.1:9119`.
- The supported v1 dashboard host for managed Codex transport is WSL/Linux. Windows-native dashboard hosting is unsupported in v1; on Windows, launch the hidden workflow wrapper so the managed transport runs through WSL.
- Keep exactly one visible `codex --remote` TUI for project `workflow` during this smoke.
- If any assertion fails, stop and record the failing output. Do not continue as if the gate passed.
- If code changes are needed, return to planning/review. This runbook is not permission to patch code ad hoc.

## 2. Preflight

Run from the repo root:

```bash
cd /mnt/e/project/workflow
node --version
npm --version
codex --version
git rev-parse --short HEAD
git status --short
```

Check that loopback listen is available before starting dashboard:

```bash
node - <<'NODE'
const server = require("node:http").createServer((request, response) => {
  response.end("ok");
});
server.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
server.listen(3003, "127.0.0.1", () => {
  console.log("listen-ok 127.0.0.1:3003");
  server.close(() => process.exit(0));
});
NODE
```

Expected result:

```text
listen-ok 127.0.0.1:3003
```

If the result is `EPERM`, this is still a sandbox/host policy problem and AC-16/AC-17 cannot be closed. If the result is `EADDRINUSE`, stop the existing dashboard or use the dashboard `Close workflow` action and rerun the probe.

## 3. Start Dashboard And Transport

Preferred operator path on Windows:

```text
start-workflow-hidden.vbs
```

Debug fallback from WSL, if a visible shell is acceptable for this smoke:

```bash
cd /mnt/e/project/workflow/dashboard
npm run serve
```

Open the dashboard:

```text
http://127.0.0.1:9119
```

Start the hidden Codex app-server support process through the dashboard button, or with the API:

```bash
curl -fsS -X POST http://127.0.0.1:3003/api/runtime/codex-transport/start \
  > /tmp/workflow-codex-transport-start.json

curl -fsS http://127.0.0.1:4501/readyz

curl -fsS http://127.0.0.1:3003/api/runtime/codex-transport \
  > /tmp/workflow-codex-transport-status.json
```

Validate transport JSON:

```bash
node - <<'NODE'
const fs = require("node:fs");
const data = JSON.parse(fs.readFileSync("/tmp/workflow-codex-transport-status.json", "utf8"));
if (data.wsUrl !== "ws://127.0.0.1:4501") throw new Error(`unexpected wsUrl: ${data.wsUrl}`);
if (data.state !== "ready") throw new Error(`expected ready, got ${data.state}`);
if (data.ready !== true) throw new Error("transport ready flag is not true");
console.log(JSON.stringify(data, null, 2));
NODE
```

Required evidence:

- raw `workflow-codex-transport-start.json`
- raw `workflow-codex-transport-status.json`
- `/readyz` output

## 4. Start The Visible Remote Codex Thread

In a normal visible terminal for the project under test:

```bash
cd /mnt/e/project/workflow
codex --no-alt-screen --remote ws://127.0.0.1:4501
```

Important lifecycle note from the 2026-04-24 live continuation: a freshly loaded remote TUI can appear in `thread/loaded/list` before it has an initialized rollout. In that state, `turn/start` can fail with:

```text
{"code":-32600,"message":"no rollout found for thread id <thread-id>"}
```

Before using this thread for AC-17, submit one minimal prompt in the visible TUI and wait until the prompt returns idle:

```text
Initialize live smoke thread. Reply with OK only.
```

Required evidence:

- either the remote TUI already has a completed turn and is idle;
- or the initialization prompt above was submitted and returned `OK`.

From another shell, confirm that the app-server sees the loaded remote thread:

```bash
cd /mnt/e/project/workflow
node scripts/codex-app-server-smoke.mjs \
  --ws-url ws://127.0.0.1:4501 \
  --list-loaded \
  --timeout-ms 5000 \
  > /tmp/workflow-codex-loaded-threads.json
```

Required evidence:

- raw `workflow-codex-loaded-threads.json`
- visual confirmation that one remote Codex TUI is open from the workflow repo root

## 5. Ensure Active Codex Session

Check dashboard runtime state:

```bash
curl -fsS http://127.0.0.1:3003/api/runtime/state \
  > /tmp/workflow-runtime-state-before-message.json
```

Validate that an active Codex session exists for `workflow`:

```bash
node - <<'NODE'
const fs = require("node:fs");
const state = JSON.parse(fs.readFileSync("/tmp/workflow-runtime-state-before-message.json", "utf8"));
const sessions = Array.isArray(state.activeSessions) ? state.activeSessions : [];
const match = sessions.find((session) =>
  session.agent === "codex" &&
  session.project === "workflow" &&
  typeof session.cwd === "string" &&
  session.cwd
);
if (!match) {
  throw new Error("missing active codex session for project workflow");
}
console.log(JSON.stringify(match, null, 2));
NODE
```

If this fails, register a manual live-smoke session from the same cwd as the remote Codex TUI, then rerun the runtime-state check quickly because active sessions expire after 60 seconds:

```bash
SESSION_ID="manual-live-smoke-codex-$(date -u +%Y%m%dT%H%M%SZ)"
printf '{"session_id":"%s","cwd":"%s"}\n' "$SESSION_ID" "$(pwd)" \
  | node scripts/mailbox-session-register.mjs --agent codex --project workflow

curl -fsS http://127.0.0.1:3003/api/runtime/state \
  > /tmp/workflow-runtime-state-before-message.json
```

Required evidence:

- raw `workflow-runtime-state-before-message.json`
- the matched active session JSON printed by the validator

## 6. AC-16 HTTP Health Proof

Capture bridge and runtime endpoints:

```bash
curl -fsS http://127.0.0.1:3003/api/runtime/codex-bridge \
  > /tmp/workflow-codex-bridge-before-message.json

curl -fsS http://127.0.0.1:3003/api/runtime/state \
  > /tmp/workflow-runtime-state-ac16.json
```

Validate endpoint shape:

```bash
node - <<'NODE'
const fs = require("node:fs");
const bridge = JSON.parse(fs.readFileSync("/tmp/workflow-codex-bridge-before-message.json", "utf8"));
const state = JSON.parse(fs.readFileSync("/tmp/workflow-runtime-state-ac16.json", "utf8"));
if (!bridge || typeof bridge !== "object") throw new Error("bridge response is not an object");
if (!bridge.health || typeof bridge.health !== "object") throw new Error("missing bridge.health");
if (!Array.isArray(bridge.deliveries)) throw new Error("bridge.deliveries is not an array");
if (!state.supervisorHealth || typeof state.supervisorHealth !== "object") throw new Error("missing supervisorHealth");
if (!Array.isArray(state.pendingIndex)) throw new Error("pendingIndex is not an array");
console.log(JSON.stringify({
  bridgeHealth: bridge.health,
  deliveryCount: bridge.deliveries.length,
  supervisorHealth: state.supervisorHealth
}, null, 2));
NODE
```

Required evidence:

- raw `workflow-codex-bridge-before-message.json`
- raw `workflow-runtime-state-ac16.json`
- validator output

## 7. AC-17 Live Reminder Proof

Create a temporary mailbox message to Codex. This is the only intentional mailbox mutation in this smoke.

```bash
cd /mnt/e/project/workflow
MESSAGE_PATH="$(
  node scripts/mailbox.mjs send \
    --from claude \
    --to codex \
    --thread bridge-live-smoke-2026-04-24 \
    --project workflow \
    --body "Live smoke: verify that Stage 7A bridge injects a mailbox reminder into the visible Codex remote TUI."
)"
printf '%s\n' "$MESSAGE_PATH" > /tmp/workflow-live-smoke-message-path.txt
echo "$MESSAGE_PATH"
```

Wait for two bridge ticks:

```bash
sleep 7

curl -fsS http://127.0.0.1:3003/api/runtime/codex-bridge \
  > /tmp/workflow-codex-bridge-after-message.json
```

Also capture the runtime delivery file immediately. The bridge should retain completed `signaled` rows, but immediate capture still makes the evidence easier to audit:

```bash
cp mailbox-runtime/deliveries.json /tmp/workflow-deliveries-after-message.json
cp mailbox-runtime/codex-bridge-health.json /tmp/workflow-codex-bridge-health-after-message.json
```

Validate delivery ledger:

```bash
MESSAGE_PATH="$(cat /tmp/workflow-live-smoke-message-path.txt)"
MESSAGE_PATH="$MESSAGE_PATH" node - <<'NODE'
const fs = require("node:fs");
const messagePath = process.env.MESSAGE_PATH;
const data = JSON.parse(fs.readFileSync("/tmp/workflow-codex-bridge-after-message.json", "utf8"));
const delivery = data.deliveries.find((row) => row.relativePath === messagePath);
if (!delivery) throw new Error(`missing delivery for ${messagePath}`);
if (delivery.state !== "signaled") {
  throw new Error(`expected signaled, got ${delivery.state}: ${delivery.reason || ""}`);
}
if (!delivery.threadId) throw new Error("missing threadId");
if (!delivery.turnId) throw new Error("missing turnId");
if (!Array.isArray(delivery.sessionIds) || delivery.sessionIds.length === 0) {
  throw new Error("missing sessionIds array");
}
console.log(JSON.stringify(delivery, null, 2));
NODE
```

Required visible proof:

- the open `codex --remote` TUI receives a new turn containing `Mailbox reminder for project workflow`;
- the reminder is metadata only and does not include the mailbox message body;
- no `turn/steer` interruption is used while an active turn is running.

Cleanup the temporary message after evidence capture:

```bash
MESSAGE_PATH="$(cat /tmp/workflow-live-smoke-message-path.txt)"
node scripts/mailbox.mjs archive \
  --path "$MESSAGE_PATH" \
  --project workflow \
  --resolution no-reply-needed
```

Required evidence:

- raw `workflow-codex-bridge-after-message.json`
- raw `workflow-deliveries-after-message.json`
- raw `workflow-codex-bridge-health-after-message.json`
- validator output showing `state: "signaled"`, `threadId`, `turnId`, and non-empty `sessionIds`
- note or screenshot confirming the visible remote TUI received the reminder
- cleanup archive output

If the visible TUI processes the reminder so quickly that the pending row is archived before the HTTP response is captured, `deliveries.json` should still retain the `signaled` row after the post-smoke hardening. If it does not, do not invent the ledger result. Record the functional evidence separately: archived original message path, created reply path, reply frontmatter/body, and current `pending-index.json`, then mark the ledger-retention check as failed.

## 8. Dashboard UI And Shutdown Smoke

Manual dashboard checks:

- The dashboard loads at `http://127.0.0.1:9119`.
- The Codex transport panel is visible.
- `Start` reaches ready state without opening a support terminal.
- Normal Stop/Restart transport controls are not exposed in the dashboard UI.
- `Force stop` is visible as the separate emergency action and must require explicit confirmation before disconnecting open remote sessions.
- Legacy `POST /api/runtime/codex-transport/stop` and `/restart` calls return `409` with `code:"codex_transport_lifecycle_preserved"` and do not disconnect open `codex --remote` sessions.
- `Close workflow` shuts down the dashboard/backend while preserving the Codex app-server transport.

Optional API proof for shutdown, after all other evidence is captured:

```bash
curl -fsS -X POST http://127.0.0.1:3003/api/runtime/shutdown \
  > /tmp/workflow-shutdown.json

sleep 3
curl -fsS http://127.0.0.1:3003/api/runtime/state
```

Expected result: the shutdown JSON reports `shuttingDown: true`, and the later `curl` fails because the API server is no longer listening.

Required evidence:

- raw `workflow-shutdown.json`
- note that later API curl failed after shutdown
- operator note whether any support terminal stayed visible

## 9. Evidence Pack To Paste Into Reports

The executor must paste or attach real outputs for:

- preflight versions, HEAD, and `git status --short`;
- loopback `listen-ok` probe;
- transport start/status JSON and `/readyz`;
- loaded-thread smoke JSON;
- zero-touch launcher proof (`node scripts/codex-remote-project.mjs --no-launch`) showing `-C`, default bootstrap prompt, and `zeroTouchBootstrap:true`;
- runtime state with active Codex session;
- AC-16 bridge/runtime endpoint JSON and validator output;
- AC-17 delivery ledger JSON and validator output;
- visible remote TUI reminder confirmation;
- dashboard UI Start/Close notes and Stop/Restart preservation proof;
- Force-stop confirmation proof if emergency teardown is intentionally tested;
- cleanup archive output.

If any item is missing, the report must say `BLOCKED` or `FAILED` for that gate. It must not say `PASS`.
