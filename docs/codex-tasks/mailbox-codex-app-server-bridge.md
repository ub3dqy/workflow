# mailbox-codex-app-server-bridge — roadmap point 7 via `app-server + remote Codex`

**Stage**: 7A (roadmap point 7, Codex WSL path only)
**Version**: 1
**Thread**: `mailbox-codex-app-server-bridge`
**Planning-audit**: `docs/codex-tasks/mailbox-codex-app-server-bridge-planning-audit.md`
**Execution report**: `docs/codex-tasks/mailbox-codex-app-server-bridge-report.md` (TBD after exec)
**Work-verification**: `docs/codex-tasks/mailbox-codex-app-server-bridge-work-verification.md` (TBD after exec)
**Depends on**: current `master`, existing mailbox Phase A/B/C runtime surfaces, and the 2026-04-24 live proof that `scripts/codex-app-server-smoke.mjs` can inject a new turn into a real `codex --remote` TUI under WSL.
**Executor**: Claude. **Verifier**: Codex.

---

## 1. Why this stage exists

Roadmap point 7 asks for a stable, low-noise reminder path: when a Codex session has pending mail, the system should be able to nudge the live agent to check mailbox without building another coordinator platform and without relying on Windows-native Codex hooks.

User-facing requirement added on 2026-04-24: this must be **easy to launch and operate**. The human should not need to keep extra service terminals open for dashboard/backend/app-server/bridge. Those support processes should be hidden behind the existing launcher pattern and controlled from the dashboard page.

Immediate UX requirement уточнён тем же днём: hidden launcher must be the default path, not an optional sidecar, and the dashboard must expose a close/shutdown action because the support terminal is no longer visible after launch.

Two facts are already established and must both stay true in this stage:

1. **Plain standalone Codex CLI still has no inbound prompt API.** The earlier wiki conclusion remains correct for a normal TUI process: you cannot programmatically inject a prompt into an already-running standalone CLI session.
2. **`app-server + --remote` is a different architecture and was now proven live.** On 2026-04-24 the user ran `codex app-server --listen ws://127.0.0.1:4501`, attached `codex --remote ws://127.0.0.1:4501`, and the smoke client successfully created a new turn in the live remote thread. That is the first confirmed path that matches the user's real expectation for Codex under WSL.

So the goal here is narrow and explicit:

- keep the existing mailbox protocol and project isolation;
- keep supervisor as the source of pending/session truth;
- add a **small Codex-only bridge** that turns project-scoped pending mail into a deterministic `turn/start` reminder inside a live remote Codex thread;
- make support-process lifecycle **dashboard-first**: start/stop/status through the dashboard UI, not through manual terminal babysitting;
- do **not** revive the old "spawn invisible background Codex process" pattern;
- do **not** reintroduce a paperclip-style orchestration layer.

Operational assumption for this stage, confirmed by the user on 2026-04-24:

- normal project shape is **one Claude session + one Codex session per project**;
- Claude and Codex work **sequentially**, not simultaneously, handing off by mailbox in a loop;
- same-project concurrent Codex windows are not the expected baseline and remain only a guardrail case.

## 2. Scope

| # | File | Change |
|---|---|---|
| 1 | `scripts/codex-app-server-client.mjs` | **New.** Shared JSON-RPC client for Codex app-server WebSocket calls. Encapsulates `initialize`, `thread/loaded/list`, `thread/read`, `thread/resume`, `turn/start`, timeouts, and notification buffering. |
| 2 | `scripts/codex-app-server-smoke.mjs` | Refactor to use the shared client, keep the existing manual smoke workflow intact, and preserve `--ws-url`, `--thread-id`, `--prompt`, `--steer`, `--list-loaded`, `--cwd`. |
| 3 | `dashboard/codex-app-server-manager.mjs` | **New.** Hidden support-process manager for Codex app-server. Handles start/stop/status/readiness, using the existing Windows→WSL launcher pattern when dashboard runs on Windows and direct local spawn when dashboard runs inside WSL/Linux. |
| 4 | `dashboard/codex-bridge.mjs` | **New.** Minimal bridge worker. Reads supervisor snapshots, matches active Codex sessions to loaded app-server threads, batches undelivered mailbox reminders by project, persists delivery ledger + health, and sends `turn/start` only when delivery is safe. |
| 5 | `dashboard/server.js` | Start/stop the bridge alongside the existing supervisor, wire the app-server manager, and expose read-only + control endpoints for transport health and lifecycle. |
| 6 | `dashboard/src/api.js` | Add dashboard-side transport control/status API helpers. |
| 7 | `dashboard/src/App.jsx` | Add a small operator panel for Codex transport status and actions (`Start`, `Stop`, `Restart`, `Open docs/help text`). |
| 8 | `test/codex-app-server-client.test.mjs` | Automated tests for client request/timeout/notification handling using a fake transport, no live app-server dependency. |
| 9 | `test/codex-app-server-manager.test.mjs` | Automated tests for start/stop/idempotent hidden process management and readiness behavior. |
| 10 | `test/codex-bridge.test.mjs` | Automated tests for delivery matching, batching, dedup persistence, blocked states, and fail-closed behavior using a fake app-server client. |

**Not touched in this stage**:

- `dashboard/supervisor.mjs` logic for mailbox scanning and session registration stays the source of truth.
- `scripts/mailbox.mjs`, `scripts/mailbox-lib.mjs`, mailbox file format, and `received_at` semantics stay unchanged.
- mailbox dashboard content columns stay conceptually unchanged; new UI is limited to a small transport-control panel.
- Claude transport remains Phase C Stop-hook based. This stage is only the Codex WSL leg of roadmap point 7.
- The actual interactive Codex work surface is still the remote Codex TUI window. This stage hides support processes, not the agent's own visible work surface.

## 3. Runtime contract

### 3.1 Inputs

The bridge may consume only existing repo truth:

- active sessions from supervisor state (`dashboard/supervisor.mjs:36-45`, `:48-95`);
- pending mailbox index from supervisor state (`dashboard/supervisor.mjs:150-178`);
- scoped delivery semantics already used by the agent path (`dashboard/server.js:249-302`);
- app-server thread state discovered live through `thread/loaded/list` + `thread/read` + `thread/resume`.

It must **not** infer project state from chat text, hidden caches, or manual mapping tables.

### 3.2 Outputs

The bridge writes only runtime artifacts under `mailbox-runtime/`:

```text
mailbox-runtime/
  deliveries.json
  codex-bridge-health.json
```

`deliveries.json` is the dedup ledger for pending mailbox reminders. Each record is keyed by mailbox `relativePath` and stores:

- `relativePath`
- `project`
- `thread`
- `sessionId`
- `threadId`
- `turnId`
- `state`
- `firstSeenAt`
- `lastAttemptAt`
- `deliveredAt`
- `reason`

`codex-bridge-health.json` stores:

- `enabled`
- `wsUrl`
- `lastTickAt`
- `lastTickMs`
- `loadedThreadCount`
- `lastError`

Mailbox files themselves remain untouched by the bridge.

The app-server manager may additionally keep a small runtime file under `mailbox-runtime/` for persisted process metadata if needed, but it must remain diagnostic-only and rebuildable.

### 3.3 Matching and delivery rules

The bridge uses the following deterministic rules:

**Granularity is per project batch, not global.** If project `A` is blocked because its Codex thread is missing, ambiguous, or busy, projects `B/C/D` are still processed normally in the same tick.

**Normal operating mode** is simpler than the guardrails: one active Codex thread per project, usually idle while Claude is working and vice versa. The blocked states below are defensive paths, not the expected steady state.

1. Only consider `pendingIndex` rows where `to === "codex"` and `deliverable === true`.
2. Prefer **active** Codex sessions for the same project when Codex hook/session registration exists.
3. If no active Codex session exists, fall back to live app-server metadata only: loaded thread `cwd` must map to the mailbox project slug, and the result must still be exactly one eligible thread.
4. Only consider app-server threads whose `source` is `cli` or absent. Ignore `source: "vscode"` threads for this bridge because Stage 7A targets the visible remote Codex TUI, not VS Code-internal app-server rollouts.
5. When session metadata exists, loaded app-server thread `cwd` must match active session `cwd` using the same case-folded `/mnt/<drive>/...` semantics already used by mailbox session resolution.
6. Group all currently undelivered pending rows for the same project into **one reminder batch**.
7. If there is exactly one matching loaded thread and it is **idle**, call `thread/resume` and then `turn/start` with a deterministic reminder prompt.
8. If no matching thread exists, or more than one matching thread exists, or the matching thread is active, do **not** inject anything. Record the blocked reason and wait for the next tick.
9. Once a mailbox message has been successfully signaled, do **not** re-signal it while that mailbox file remains pending. This is the main anti-noise guard.
10. When a pending mailbox file disappears from supervisor state (reply/archive/recover path moved it), its delivery record is removed from the runtime ledger.

### 3.4 Reminder prompt contract

The injected Codex reminder is deterministic, short, and contains metadata only:

```text
Mailbox reminder for project <project>.
There are <N> pending mailbox message(s) for Codex.
Threads: <thread-1>, <thread-2>, ...
Paths:
- to-codex/<file-1>.md
- to-codex/<file-2>.md
Use the normal mailbox workflow in this repository. This reminder is not the message body.
```

This stage does **not** inject mailbox body content into the Codex chat.

## 4. Expected behavior after fix

| Scenario | Expected bridge behavior |
|---|---|
| User launches workflow through existing hidden launcher | Dashboard opens without requiring extra manual service terminals for backend/app-server/bridge. |
| `CODEX_APP_SERVER_URL` not set | Bridge stays disabled, writes health status only, and makes no app-server calls. |
| Dashboard starts on Windows and Codex transport is requested from the page | Backend starts WSL `codex app-server` in a hidden/background process and waits for loopback readiness before marking transport healthy. |
| `CODEX_APP_SERVER_URL` is non-loopback | Bridge/manager refuse it in v1. Loopback localhost only. |
| Pending Codex mail exists, but no active Codex session for that project | Bridge uses the app-server CLI-thread fallback. If exactly one eligible project `cwd` thread exists and is idle, it sends the reminder; otherwise delivery remains fail-closed. |
| No active Codex session and no eligible app-server CLI thread for that project | Delivery record becomes `blocked_no_session`; no `turn/start`. |
| Active Codex session exists, but no loaded remote thread matches its `cwd` | Delivery record becomes `blocked_no_thread`; no `turn/start`. |
| App-server lists VS Code-internal threads for the same project | Those `source: "vscode"` threads are ignored by Stage 7A matching. |
| More than one loaded thread matches the same project/session scope | Defensive-only path. Delivery record becomes `blocked_ambiguous_thread`; no `turn/start`. This explicitly defers to roadmap point 8. |
| Exactly one loaded thread matches, but thread status is active/in-progress | Defensive-only path. Delivery record becomes `blocked_active_turn`; no automatic interruption in v1. The row stays pending and is retried on later ticks until the thread becomes idle or the mailbox item is resolved. |
| Exactly one loaded thread matches, thread is idle, one or more undelivered pending messages exist | Bridge sends one `turn/start` batch reminder, persists `threadId` + `turnId`, and marks each mailbox file in that batch as `signaled`. |
| Bridge restarts while the same mailbox file is still pending | No duplicate reminder: `deliveries.json` suppresses re-send for already signaled files. |
| Pending mailbox file disappears from supervisor state | Corresponding delivery record is pruned. |
| User runs 4-5 projects in parallel, each with one Claude and one Codex window, working in mailbox round-robin | This is the intended v1 shape. Matching is project-local and the typical case is a unique idle Codex thread per project when mail arrives for Codex. The dashboard remains the single control page for support services. |
| Project `B` has two Codex remote windows, while projects `A/C/D` each have one | Only project `B` becomes `blocked_ambiguous_thread`. `A/C/D` still receive reminders normally. |

## 5. Operator workflow

This stage assumes a **dashboard-first** operator workflow:

1. Human starts the workflow with the hidden workflow launcher (`start-workflow-hidden.vbs`, `start-workflow-codex-hidden.vbs`, or shortcut path based on them). This hides the dashboard/backend launcher, not the visible agent work surfaces.
2. Dashboard opens as the single operator page.
3. Dashboard page shows Codex transport state and allows `Start`, `Stop`, and `Restart` for the hidden support transport.
4. Dashboard page also exposes a simple `Close workflow` action for shutting down hidden support services when the operator is done.
5. Human keeps only the real agent work surfaces visible:
   - Claude in its normal UI
   - one remote Codex TUI per active project

Equivalent manual fallback remains available for debugging, but is not the primary UX:

```bash
# support process, normally hidden and dashboard-managed
codex app-server --listen ws://127.0.0.1:4501

# visible agent work surface, one per project
cd /path/to/the-actual-project
codex --no-alt-screen --remote ws://127.0.0.1:4501

# dashboard backend, normally hidden behind launcher
cd /mnt/e/project/workflow
node dashboard/server.js
```

Operational notes:

- WSL/Linux only for the Codex bridge path.
- `bubblewrap` should be installed on the WSL host to clear startup warnings, but the current local proof showed the warning is non-blocking.
- The remote Codex TUI must be launched from the root of the project it is actually serving (or an allowed descendant) so that thread `cwd` and mailbox session `cwd` match. Launching from `/home/...` is intentionally treated as "no matching thread".
- The 2026-04-24 proof used `/mnt/e/project/workflow` because that was the active repo under test. In production multi-project use, each Codex remote session keeps its own project `cwd`.
- The intended v1 operator shape is exactly your common case: many projects in parallel, but one live remote Codex thread per project, with Claude and Codex alternating rather than both working that same project simultaneously.
- Hidden-process launch on Windows should stay thin and readiness-based. The workflow launcher may remain VBS/CMD-based, while the dashboard-managed Codex app-server support process uses a generated `run-hidden.ps1` wrapper with a single `Start-Process -WindowStyle Hidden` call to launch `wsl.exe`. Do not expand this into a broad PowerShell orchestration layer.

## 6. Explicit non-goals

- No support for plain standalone `codex` injection.
- No automatic `turn/steer` in v1. The manual smoke tool keeps `--steer`, but the production bridge does not auto-interrupt active turns.
- No use of `thread/inject_items` in v1.
- No multi-window lease or claim protocol in this stage. Because the user's normal mode is one Codex per project, roadmap point 8 stays optional and only matters if the operating pattern changes.
- No full dashboard redesign or mailbox-card rewrite in this stage; only a small operator transport panel.
- No remote/non-loopback app-server exposure, WebSocket auth configuration, or cross-machine support.
- No mailbox-body injection into Codex chat.
- No Claude-side transport changes.
- No attempt to replace the actual Codex chat window with a web chat client inside the dashboard. That would be a different, much larger product surface.

## 7. Rollback

The intended implementation is a single local stage commit touching the small bridge/client/test surface. Rollback is:

```bash
git revert <stage-7a-sha>
```

This removes the Codex bridge and leaves the existing mailbox, supervisor, dashboard, and Claude Phase C path unchanged.

## 8. Revision trail

- **v1**: initial brief after the 2026-04-24 live `app-server + remote Codex` proof under WSL.
