# Mailbox Automation Master Roadmap

**Version**: v3
**Status**: planning-only, canonical roadmap
**Approval note**: v2 was approved by Claude on 2026-04-24; v3 only applies non-blocking wording/probe cleanup from that review.
**Thread / slug**: `mailbox-automation-master-roadmap`
**Planning audit**: `docs/codex-tasks/mailbox-automation-master-roadmap-planning-audit.md`
**Execution report**: `docs/codex-tasks/mailbox-automation-master-roadmap-report.md`
**Work verification**: `docs/codex-tasks/mailbox-automation-master-roadmap-work-verification.md`

## 1. Purpose

This document replaces fragmented planning around mailbox automation with one canonical roadmap for the `workflow` application.

It keeps only the points that are materially useful for the real operating mode confirmed by the user:

- several projects in parallel;
- usually one Claude session and one Codex session per project;
- Claude and Codex work sequentially through mailbox;
- the operator wants one dashboard-centric control surface and hidden support terminals;
- point 7 (`app-server + remote Codex`) was experimentally confirmed on 2026-04-24 and must stay in the roadmap.

This package is **planning only**. It does **not** authorize implementation of point 7 or later automation stages by itself.

## 2. What This Roadmap Supersedes

This roadmap becomes the planning source of truth for future automation work. Historical phase docs remain provenance and implementation history, not the canonical roadmap:

- `docs/codex-tasks/mailbox-auto-pickup-supervisor-tz.md`
- `docs/codex-tasks/mailbox-supervisor-phase-a.md`
- `docs/codex-tasks/mailbox-automation-compat.md`
- `docs/codex-tasks/mailbox-automation-phase-b.md`
- `docs/codex-tasks/mailbox-automation-phase-c.md`
- `docs/codex-tasks/mailbox-codex-app-server-bridge.md`

## 3. Universal Execution Contract

These rules apply to **every** mini-stage below.

1. **Wiki-first is mandatory.** Before touching a stage, inspect the wiki index and read the relevant articles first.
2. **Official-doc-first for external behavior.** If a stage touches Codex, Claude hooks, MCP, Node runtime behavior, or framework behavior, re-check the official docs listed in this roadmap before coding.
3. **No coding from memory.** If the executor cannot point to code, docs, command output, or test output, the claim is treated as unverified and the work is not complete.
4. **MCP/skill discipline is mandatory.** If a relevant skill or MCP surface exists, it must be used and logged in the execution report. If none applies, the executor must explicitly record that fact instead of faking usage.
5. **File-baseline inspection is mandatory.** Before editing, record current file state, existing dirty files, and exact files inspected.
6. **Stage-gate is hard.** Stage `N+1` may not start until stage `N` has a fully filled execution-report section with real evidence and no unresolved Critical or Mandatory gaps.
7. **Discrepancy means stop.** If code, docs, or runtime behavior disagree, stop, record the mismatch, and resolve it before continuing.
8. **No silent scope creep.** If a new need appears, it must be added to the roadmap/report as an explicit delta, not smuggled into code.
9. **Reports may not contain placeholders at handoff time.** Empty required fields, guessed values, or future-tense evidence all mean the stage is incomplete.

## 4. Official Source Set

Each stage must cite the relevant current official docs from this set in its execution report.

| ID | Official source | URL | Verified on | Used by |
|---|---|---|---|---|
| D1 | OpenAI Codex App Server | `https://developers.openai.com/codex/app-server` | `2026-04-24` | 7, 8, 9, 10, 11 |
| D2 | OpenAI Codex MCP | `https://developers.openai.com/codex/mcp` | `2026-04-24` | global, 7, 8, 9 |
| D3 | OpenAI Codex Skills | `https://developers.openai.com/codex/skills` | `2026-04-24` | global, 7, 9 |
| D4 | OpenAI Tool Search | `https://developers.openai.com/api/docs/guides/tools-tool-search` | `2026-04-24` | global, 7, 9 |
| D5 | MCP Architecture | `https://modelcontextprotocol.io/docs/learn/architecture` | `2026-04-24` | global, 7, 8, 10 |
| D6 | MCP Transports | `https://modelcontextprotocol.io/specification/2025-06-18/basic/transports` | `2026-04-24` | 7, 8, 9, 10 |
| D7 | Claude Code Hooks | `https://code.claude.com/docs/en/hooks` | `2026-04-24` | 6, 10 |
| D8 | Node.js `fs` | `https://nodejs.org/docs/latest-v24.x/api/fs.html` | `2026-04-24` | 1, 3, 4, 5, 8, 11 |
| D9 | Node.js `child_process` | `https://nodejs.org/docs/latest-v24.x/api/child_process.html` | `2026-04-24` | 1, 7, 9, 11 |
| D10 | Node.js `http` | `https://nodejs.org/docs/latest-v24.x/api/http.html` | `2026-04-24` | 1, 2, 3, 7, 9, 11 |
| D11 | Node.js `timers` | `https://nodejs.org/docs/latest-v24.x/api/timers.html` | `2026-04-24` | 3, 8, 10, 11 |
| D12 | React docs | `https://react.dev/reference/react` | `2026-04-24` | 2, 9 |
| D13 | Vite docs | `https://vite.dev/guide/` | `2026-04-24` | 2, 9, 11 |

If an official page moved, the executor must record the updated canonical URL actually used.

## 5. MCP And Skills Contract

### 5.1 Mandatory discovery and logging

- Use `tool_search` when deferred tools or MCP surfaces may be needed.
- For OpenAI/Codex behavior, the mandatory skill is `openai-docs` (current environment path: `/home/dmaka/.codex/skills/.system/openai-docs/SKILL.md`) and OpenAI docs MCP is the primary source path.
- For dashboard React work, the default skill is `build-web-apps:react-best-practices` (current environment path: `/home/dmaka/.codex/plugins/cache/openai-curated/build-web-apps/f09cfd210e21e96a0031f4d247be5f2e416d23b1/skills/react-best-practices/SKILL.md`).
- The report must log both the skill name and the actual resolved path in the executor's environment.
- If a stage has no applicable skill in the current environment, the executor must write `no applicable skill available` and explain why.

### 5.2 Mandatory logging fields

The execution report must record:

- exact skill name;
- skill file path;
- why that skill applied;
- exact MCP/tool name used;
- query string or URL used;
- resulting docs/pages loaded;
- the implementation decision that depended on that evidence.

### 5.3 Fallback policy

- MCP/server first when available.
- Official web/docs second.
- Repository history and memory only after the current code and official docs.
- Never reverse this order.

## 6. Master Roadmap Overview

| Point | Mini-stage | Why it stays in the roadmap | Current state | Execution mode |
|---|---|---|---|---|
| 1 | Hidden launcher default + dashboard close | Removes visible support terminals from the normal operator path | implemented in code, but no dedicated live artifact package yet | verify-only until retroactive artifact or explicit re-baselining |
| 2 | Dashboard-first operator shell | Keeps one understandable control surface instead of terminal sprawl | operator UX rule partially delivered in code, but no dedicated live artifact package yet | verify-only until retroactive artifact or explicit re-baselining |
| 3 | Supervisor runtime core + health | Gives one runtime truth for sessions, pending index, and supervisor health | baseline already exists | verify-and-freeze |
| 4 | Global multi-project visibility | Makes 4-5 parallel projects readable without manual memory load | baseline already exists | verify-and-freeze |
| 5 | Project isolation + deliverable filtering | Prevents cross-project leakage and stops automation from delivering unsafe rows | baseline already exists | verify-and-freeze |
| 6 | Claude-side passive automation foundation | Preserves the delivered Claude registration baseline and explicitly records the reverted Stop-hook delivery path as not-current baseline | partially delivered: Phase B registration exists; historical Phase C Stop-hook delivery was reverted in `22e7754` | verify-and-freeze with explicit revert acknowledgement |
| 7 | Codex `app-server + --remote` reminder bridge | This is the shipped path for live Codex reminders under WSL and the replacement for the reverted Claude Stop-hook delivery path | implemented in `9ce885d`; follow-up docs in `3047919` | baseline-freeze / regression-only |
| 8 | Dedup ledger + retry-safe delivery state for Codex path | Prevents duplicate reminders and preserves blocked-state traceability | implemented inside Stage 7A runtime delivery ledger | baseline-freeze / regression-only |
| 9 | Dashboard Codex transport control + health | Hides support-process babysitting behind the dashboard page | implemented with safe `Start`, health, and confirmed emergency `Force stop`; normal destructive Stop/Restart are intentionally disabled | baseline-freeze / UX polish only |
| 10 | Late hardening: ambiguity, lease, blocked-state recovery | Useful only after the basic bridge exists or if same-project concurrency becomes real | conditional late stage | defer unless real need appears |
| 11 | Diagnostics, rollback, runbooks, and closure tests | Makes the system operable and reviewable instead of fragile tribal knowledge | Stage 7A report/work-verification exist; unified operator doctor remains open | required for any coded stage |

## 7. Detailed Mini-Stage Plans

### 7.1 Point 1 — Hidden launcher default + dashboard close

**Status**: implemented in code, but not yet backed by a dedicated live artifact package
**Depends on**: none
**Primary historical source**: wiki launcher article + accepted UX change on 2026-04-24
**Official docs**: D8, D9, D10
**Mandatory skills/MCP**:

- no special skill required unless the launcher implementation changes materially;
- if implementation changes, record whether any applicable skill exists;
- no fake MCP usage.

**Implementation plan**

1. Verify the current hidden-launch baseline before changing anything:
   - `start-workflow.cmd`
   - `start-workflow-hidden.vbs`
   - `start-workflow-codex-hidden.vbs`
   - dashboard close/shutdown route and UI entrypoint.
2. If the current behavior still matches the accepted UX contract, record that status honestly, but do not call it baseline-frozen until a retroactive artifact package exists or this stage is explicitly re-baselined in an approved package.
3. Only if a regression exists, repair narrowly:
   - keep launcher hidden by default;
   - keep visible/debug mode explicit and opt-in;
   - keep shutdown reachable from the dashboard because the support terminal is not visible.
4. Do not build a second launcher tree or a parallel stop mechanism.

**Baseline probes (required before any "freeze" claim)**

1. Structural launcher probe:
   - `rg -n "hidden-relay|WORKFLOW_LAUNCH_VISIBLE" start-workflow.cmd`
2. File-existence probe:
   - confirm `start-workflow-hidden.vbs` and `start-workflow-codex-hidden.vbs` exist
3. Dashboard shutdown contract probe:
   - `rg -n "/api/runtime/shutdown|shutdownWorkflow" dashboard/server.js dashboard/src/api.js dashboard/src/App.jsx`
4. Optional manual runtime smoke, only when explicitly executed on the real Windows operator path:
   - hidden launcher starts without leaving a visible support terminal behind;
   - dashboard close action shuts down the support services.

**Required evidence / exit gate**

- hidden launcher does not leave a visible support terminal behind;
- dashboard close path remains reachable and understandable;
- related backend/frontend build checks pass;
- the report either links a retroactive live artifact package or explicitly states that this stage remains provisional until one exists;
- no extra operator terminal becomes mandatory.

**Out of scope**

- replacing the visible Claude or Codex work surfaces;
- inventing a second orchestration shell outside the dashboard.

### 7.2 Point 2 — Dashboard-first operator shell

**Status**: governing UX rule, partially delivered in code, but not yet backed by a dedicated live artifact package
**Depends on**: 1
**Primary historical source**: launcher requirement refinement on 2026-04-24
**Official docs**: D10, D12, D13
**Mandatory skills/MCP**:

- `build-web-apps:react-best-practices` when editing dashboard React code;
- `tool_search` if deferred UI tools are needed;
- record if no applicable extra skill exists.

**Implementation plan**

1. Treat the dashboard as the only operator surface for support-process status and actions.
2. Reuse the current runtime section; do not design a new separate operator app.
3. Any new service control must appear as a small extension of the existing dashboard, not as a new terminal dependency.
4. Keep the UI simple:
   - clear status;
   - clear action buttons;
   - short help text;
   - no full-screen control console.
5. Preserve mobile/desktop readability; do not regress existing dashboard functionality while adding operator controls.

**Baseline probes (required before any "freeze" claim)**

1. Runtime-state client probe:
   - `rg -n "fetchRuntimeState|shutdownWorkflow" dashboard/src/api.js`
2. UI intent probe:
   - `rg -n "shutdownNotice|handleShutdown|/api/runtime/shutdown" dashboard/src/App.jsx`
3. Build probe when React code changes:
   - `cd dashboard && npm run build`
4. Explicit delta probe:
   - the report must state which operator-shell capabilities are already live now and which are still deferred to points 7 and 9.

**Required evidence / exit gate**

- operator can understand service state from the dashboard page alone;
- no new manual background-terminal babysitting is introduced;
- `npm run build` in `dashboard/` passes after the change;
- the report explicitly distinguishes current operator-shell baseline from deferred transport-control work;
- the report records the exact React/Vite guidance used.

**Out of scope**

- turning the dashboard into a live chat client for Codex;
- redesigning unrelated dashboard surfaces.

### 7.3 Point 3 — Supervisor runtime core + health

**Status**: baseline delivered
**Depends on**: 1, 2
**Primary historical source**: `mailbox-supervisor-phase-a.md` + compat plan
**Official docs**: D8, D10, D11
**Mandatory skills/MCP**:

- no named skill required by default;
- if new external runtime behavior is used, log the exact docs consulted.

**Implementation plan**

1. Verify current `dashboard/supervisor.mjs` behavior before touching it:
   - session registry;
   - `pendingIndex`;
   - health heartbeat;
   - runtime persistence.
2. Freeze the current behavior if it still matches the accepted contract.
3. If change is necessary, keep the supervisor as the single runtime truth for:
   - active sessions;
   - pending mailbox index;
   - supervisor health.
4. Keep the supervisor lightweight and local:
   - file-based runtime;
   - polling, not cross-OS watchers;
   - no new database.

**Baseline probes (required before any "freeze" claim)**

1. Structural supervisor probe:
   - `rg -n "SESSION_STALE_MS|pendingIndex|supervisorHealth|router.get\\(\"/state\"" dashboard/supervisor.mjs`
2. Runtime probe, if the dashboard server is running:
   - `curl -sf http://127.0.0.1:3003/api/runtime/state`
   - verify returned keys include `sessions`, `activeSessions`, `pendingIndex`, and `supervisorHealth`
3. If server-side files changed in the stage:
   - stop stale server;
   - start a fresh server;
   - run a readiness probe before trusting runtime output.

**Required evidence / exit gate**

- `sessions`, `activeSessions`, `pendingIndex`, and health remain observable;
- runtime files remain rebuildable from mailbox + session heartbeats;
- no heavy business logic migrates into hooks.

**Out of scope**

- new database storage;
- dashboard becoming a second source of truth.

### 7.4 Point 4 — Global multi-project visibility

**Status**: baseline delivered
**Depends on**: 3
**Primary historical source**: Phase A / multi-project dashboard requirement
**Official docs**: D8, D10, D12, D13
**Mandatory skills/MCP**:

- `build-web-apps:react-best-practices` if the dashboard React surface changes;
- otherwise record that the stage was verification-only.

**Implementation plan**

1. Keep global visibility as a user-only surface.
2. Verify that pending state across projects remains visible without mutating mailbox files.
3. If UI refinement is needed, keep it additive:
   - project filters;
   - pending counts;
   - clear unread semantics.
4. Preserve the existing rule that mailbox protocol remains the source of truth and the dashboard is only a viewer/controller.

**Baseline probes (required before any "freeze" claim)**

1. Runtime visibility probe, if the dashboard server is running:
   - `curl -sf http://127.0.0.1:3003/api/messages`
   - verify global payload shape includes `toClaude`, `toCodex`, `archive`, and `projects`
2. Optional filtered probe:
   - `curl -sf "http://127.0.0.1:3003/api/messages?project=workflow"`
3. If frontend files changed:
   - `cd dashboard && npm run build`
4. If server-side files changed:
   - use a fresh server process plus readiness probe before runtime verification.

**Required evidence / exit gate**

- operator can see pending state across projects in one place;
- visibility does not weaken project isolation for agent-path logic;
- no code path uses destructive mailbox reads for mere status checks.

**Out of scope**

- live chat semantics;
- agent-side direct mailbox filesystem reads.

### 7.5 Point 5 — Project isolation + deliverable filtering

**Status**: baseline delivered
**Depends on**: 3, 4
**Primary historical source**: project-isolation work + compat rail #3
**Official docs**: D8, D10
**Mandatory skills/MCP**:

- no named skill required by default;
- if transport or API behavior changes, log the exact docs used.

**Implementation plan**

1. Verify the current isolation contract before editing:
   - agent-path scoped reads;
   - project-prefixed filenames;
   - `deliverable === true` filtering;
   - rejection of projectless or cross-project delivery candidates.
2. Freeze this stage unless the report finds a regression.
3. If repair is needed, keep validation in backend/runtime logic, not in prompt text or agent instructions.
4. Do not bypass isolation with hidden side channels, caches, or direct filesystem reads.

**Baseline probes (required before any "freeze" claim)**

1. Structural agent-path probe:
   - `rg -n "session_id query param|project query/body param|project scope mismatch" dashboard/server.js`
2. Deliverable-shape probe:
   - inspect `pendingIndex` output for `project`, `projectMissing`, and `deliverable`
3. Safe runtime probe, when runnable:
   - `curl -sf http://127.0.0.1:3003/api/runtime/state`
   - confirm projectless rows are visible but explicitly marked non-deliverable
4. Optional negative probe, only when a fresh server and a known session are available:
   - mismatched `project` on `/api/agent/runtime/deliveries` returns `403`
5. Do **not** use `scripts/mailbox.mjs list` as a baseline probe, because it mutates `received_at`.

**Required evidence / exit gate**

- cross-project rows do not appear in agent-delivery decisions;
- projectless rows are visible to the operator but never auto-delivered;
- any changed path still enforces explicit project semantics.

**Out of scope**

- relaxing project scope to “best effort”;
- silent fallback when project binding is unknown.

### 7.6 Point 6 — Claude-side passive automation foundation

**Status**: partially delivered
**Depends on**: 3, 4, 5
**Primary historical source**: Phase B + reverted Phase C history
**Official docs**: D7, D8, D10
**Mandatory skills/MCP**:

- no named skill required by default;
- the report must still record the exact official Claude hook docs used;
- if OpenAI/Codex behavior is touched in this stage, also use `openai-docs`.

**Implementation plan**

1. Verify the current Claude-side foundation before touching anything:
   - `scripts/mailbox-session-register.mjs`
   - `.claude/settings.local.json`
   - current server-side delivery endpoint behavior, if still present.
2. Explicitly acknowledge current baseline truth before freezing anything:
   - SessionStart / Stop registration is delivered;
   - historical Stop-hook delivery injection was reverted in `22e7754`;
   - `scripts/mailbox-stop-delivery.mjs` is intentionally absent from the current baseline;
   - any server-side delivery endpoint that remains is not, by itself, proof of a live user-facing delivery signal.
3. Freeze the stage only if the report explicitly records that current truth:
   - SessionStart / Stop only;
   - no `UserPromptSubmit`;
   - no heavy logic inside hooks;
   - no mailbox-body auto-injection;
   - no false claim that a live Stop-hook delivery reminder exists today.
4. If repair is necessary, keep hooks as thin transport adapters and leave business logic in backend/runtime files. Do not resurrect Stop-hook text injection without fresh official-doc proof and explicit approval.

**Baseline probes (required before any "freeze" claim)**

1. File-presence probes:
   - `test -f scripts/mailbox-session-register.mjs`
   - `test -f scripts/mailbox-stop-delivery.mjs` (expected: missing in current baseline)
2. Historical truth probe:
   - `git log --oneline --all -- scripts/mailbox-stop-delivery.mjs | head -2`
3. Hook-config probe:
   - `rg -n "mailbox-status|mailbox-session-register" .claude/settings.local.json`
   - `rg -n "mailbox-stop-delivery" .claude/settings.local.json` (expected: no matches in current baseline)
4. Optional runtime probe, if the dashboard server and a known Claude session are available:
   - query `/api/runtime/state` or `/api/agent/runtime/deliveries` and record actual current behavior
5. The report must state whether each probe was a structural check, a runtime check, or both.

**Required evidence / exit gate**

- session registration stays project-scoped;
- current Stop hook does not claim a live user-facing delivery-reminder baseline;
- no auto-read or auto-reply is introduced;
- any reference to historical Phase C is explicitly marked `reverted / not current baseline`;
- hook payload/schema usage is re-verified against official docs before changing scripts.

**Out of scope**

- turning hooks into orchestrators;
- Codex Windows-native hook assumptions.

### 7.7 Point 7 — Codex `app-server + --remote` reminder bridge

**Status**: implemented in Stage 7A (`9ce885d`) and documented in follow-up cleanup (`3047919`)
**Depends on**: 3, 4, 5
**Primary historical source**: draft 7A bridge brief + live proof from 2026-04-24
**Official docs**: D1, D2, D3, D4, D5, D6, D9, D10
**Mandatory skills/MCP**:

- `openai-docs` is mandatory;
- OpenAI docs MCP is the primary source path when available;
- `tool_search` is mandatory if the needed Codex/OpenAI tools are deferred;
- `build-web-apps:react-best-practices` becomes mandatory only if this stage also edits dashboard React code.

**Current baseline as of 2026-04-27**

- `scripts/codex-app-server-client.mjs` provides the shared app-server JSON-RPC client.
- `dashboard/codex-bridge.mjs` is the fail-closed Codex reminder bridge.
- The bridge uses loopback-only transport, metadata-only reminders, `thread/resume`, and `turn/start`.
- Hook-missing Codex remote sessions are routed through live app-server thread metadata when exactly one eligible CLI project thread exists.
- `codexr` / `scripts/codex-remote-project.mjs` is the supported zero-touch operator entry point; raw `codex --remote` remains an unsupported mailbox entry point because it can load a thread with no rollout.
- The current baseline must be changed only through regression fixes or explicitly approved new stages.

**Residual risks**

- Zero-touch startup is solved for `codexr`; raw `codex --remote` still has the no-rollout cold-start trap and remains deferred.
- App-server fallback thread freshness defaults to 15 minutes; the default is tested structurally, but not yet load-tested under many concurrent loaded threads.
- `Force stop` is intentionally destructive and operator-only; ordinary lifecycle actions must keep preserving existing remote sessions.

**Historical implementation plan**

1. Re-check official Codex app-server docs before coding:
   - connection handshake;
   - `thread/loaded/list`;
   - `thread/read`;
   - `thread/resume`;
   - `turn/start`;
   - `turn/steer` only as manual/debug reference.
2. Re-check the live proof already established on 2026-04-24:
   - remote thread resumed successfully;
   - new turn actually started in a live Codex remote chat;
   - thread notifications flowed back.
3. Keep the bridge narrow:
   - no plain standalone CLI injection;
   - no Windows-native Codex hook assumption;
   - no web chat replacement;
   - loopback-only transport, interpreted from the bridge process perspective; if dashboard-hosted control runs on Windows and the app-server runs inside WSL, the path must reuse the established Windows->WSL localhost/launcher pattern rather than pretending the two loopbacks are magically identical.
4. Extract a shared app-server client from the smoke tool instead of duplicating JSON-RPC handling.
5. Build a small Codex bridge worker that:
   - reads supervisor snapshot;
   - groups pending Codex mail by project;
   - replaces the missing historical Claude Stop-hook delivery path instead of depending on it;
   - if runtime session records are used as part of routing, uses only supervisor `activeSessions` semantics (`last_seen` within `SESSION_STALE_MS`, currently 60s), never stale `sessions` rows alone;
   - matches active Codex session or equivalent live thread context to loaded thread by project/cwd;
   - sends one deterministic reminder via `turn/start` only when the match is unique and idle.
6. Fail closed on:
   - no matching thread;
   - ambiguous match;
   - active in-flight turn;
   - non-loopback target.
7. Keep mailbox bodies out of the Codex chat; inject metadata reminder only.
8. Do not operator-enable the bridge as a persistent background feature until point 8 has landed. This constraint is now satisfied because point 8 shipped inside Stage 7A.

**Required evidence / exit gate**

- a real WSL `codex --remote` session receives the reminder via `turn/start`;
- no mailbox file is mutated by the bridge;
- one blocked project does not stop unrelated projects from being processed;
- blocked-state reasons are observable from dashboard/runtime files/logs per delivery attempt;
- if runtime session freshness participates in routing, the report records the exact freshness rule used;
- if point 7 ships before point 8, the report proves it stayed lab-only/non-persistent and was not operator-enabled;
- the report records the exact official docs used for every app-server method relied on.

**Out of scope**

- plain standalone CLI prompt injection;
- auto-`turn/steer`;
- `thread/inject_items`;
- non-loopback deployment;
- dashboard-hosted Codex chat UI.

### 7.8 Point 8 — Dedup ledger + retry-safe delivery state for Codex path

**Status**: implemented inside Stage 7A (`9ce885d`)
**Depends on**: 7
**Primary historical source**: draft 7A bridge brief
**Official docs**: D1, D6, D8, D11
**Mandatory skills/MCP**:

- `openai-docs` for any Codex transport assumptions;
- MCP/docs log required because this stage depends on transport semantics;
- no fake skill usage.

**Current baseline as of 2026-04-27**

- Delivery state is persisted under `mailbox-runtime/deliveries.json`.
- Delivery dedup is keyed by mailbox `relativePath`.
- Delivery rows record project, mailbox path, thread/session evidence, attempt timestamps, signaled/blocked state, and structured RPC metadata where available.
- Duplicate pending reminders are suppressed across bridge ticks and process restarts.
- Completed `signaled` rows are retained as evidence; stale blocked rows are pruned when their mailbox row leaves pending state.
- Mailbox markdown files are not mutated as a dedup shortcut.

**Residual risks**

- Retained delivery history is bounded by current implementation defaults, not by a separately load-tested archival policy.
- Lease/claim semantics remain out of scope until same-project concurrency or repeated ambiguous/active-thread evidence appears.

**Historical implementation plan**

1. Persist delivery state in runtime files, not only memory.
2. Key delivery dedup by mailbox `relativePath`, not by chat text.
3. Record at minimum:
   - project;
   - mailbox path;
   - matched session id;
   - matched thread id;
   - session freshness basis when session records are used for routing;
   - attempt timestamps;
   - delivered / blocked reason.
4. Suppress duplicates across process restarts while the same mailbox file is still pending.
5. Prune runtime delivery entries when the mailbox file disappears from pending state.
6. Keep blocked states visible for diagnosis; do not silently drop them.

**Required evidence / exit gate**

- bridge restart does not resend the same reminder immediately;
- archived/replied messages are pruned from the delivery ledger;
- any session-based routing evidence includes the freshness basis used;
- blocked states are traceable with timestamps and reasons.

**Out of scope**

- lease/claim semantics for multi-window concurrency;
- mailbox mutation as a dedup shortcut.

### 7.9 Point 9 — Dashboard Codex transport control + health

**Status**: implemented with revised safety contract in Stage 7A (`9ce885d`) and hardening follow-up
**Depends on**: 1, 2, 7, 8
**Primary historical source**: draft 7A bridge brief + accepted operator UX requirement
**Official docs**: D1, D2, D3, D4, D6, D9, D10, D12, D13
**Mandatory skills/MCP**:

- `openai-docs` for Codex transport behavior;
- `build-web-apps:react-best-practices` for dashboard React changes;
- `tool_search` if deferred MCP or UI tools are needed.

**Current baseline as of 2026-04-27**

- Dashboard exposes Codex transport status, safe `Start`, bridge health, delivery count, last blocked reason, last ready timestamp, last tick, WebSocket URL, and last error.
- Normal destructive `Stop` and `Restart` transport routes fail closed with HTTP 409 `codex_transport_lifecycle_preserved`; they do not call `codexTransport.stop()` or `codexTransport.restart()`.
- A separate `Force stop` emergency action requires typed confirmation (`STOP`) and is the only UI/API path that intentionally tears down the app-server transport.
- Closing or restarting the dashboard must preserve open `codex --remote` sessions. Users end remote Codex sessions from their Codex TUI, not by killing the shared transport.
- UI polish is allowed only if it preserves this safety contract.

**Residual risks**

- The emergency `Force stop` action can still disconnect live sessions by design; it remains guarded by typed confirmation and must not become the normal operator path.
- UI wording must keep distinguishing the shared support transport from visible project Codex sessions.

**Historical implementation plan**

1. Add a hidden support-process manager for Codex app-server.
2. Keep the dashboard page as the operator shell for:
   - transport status;
   - start;
   - safe session-preserving lifecycle status;
   - confirmed emergency force-stop;
   - last error / last healthy tick.
3. Make lifecycle idempotent:
   - starting an already healthy transport should not spawn duplicates;
   - stopping an already stopped transport should be safe.
4. Keep the visible Codex chat window separate from the support process.
5. Show short help text that explains exactly what the dashboard controls and what it does not.

**Required evidence / exit gate**

- operator can start the hidden Codex support transport from the dashboard;
- ordinary stop/restart paths preserve open Codex remote sessions;
- emergency force-stop is explicitly confirmed before it can disconnect sessions;
- health state is readable without opening a service terminal;
- dashboard build remains green;
- the report shows the exact React/Vite and OpenAI docs consulted.

**Out of scope**

- replacing the visible Codex remote chat window;
- broad dashboard redesign unrelated to transport control.

### 7.10 Point 10 — Late hardening: ambiguity, lease, blocked-state recovery

**Status**: conditional late stage
**Depends on**: 7, 8, 9
**Primary historical source**: original Phase D intent + draft 7A blocked-state rules
**Official docs**: D1, D5, D6, D7, D8, D11
**Mandatory skills/MCP**:

- `openai-docs` for Codex transport behavior;
- no claimed skill/MCP usage without logged evidence.

**Implementation plan**

1. Do not execute this stage by default while the real operating mode remains one Codex per project.
2. Open this stage only if one of the following becomes real:
   - same-project concurrent Codex windows;
   - repeated `blocked_ambiguous_thread`;
   - repeated `blocked_active_turn` that cannot be tolerated;
   - missed reminders due to restart/timing races.
3. If opened, keep the hardening narrow:
   - lease/claim only for runtime routing;
   - expiration and retry rules;
   - visible blocked-state recovery.
4. Do not back-port this complexity into earlier stages unless real evidence shows it is needed.

**Required evidence / exit gate**

- a concrete reproduced ambiguity or recovery problem exists;
- the hardening solves that real case without regressing the normal one-thread-per-project path;
- late-stage complexity is justified in the report with real blocked-state evidence.

**Out of scope**

- speculative complexity added “just in case”;
- rewriting the whole transport around hypothetical concurrency.

### 7.11 Point 11 — Diagnostics, rollback, runbooks, and closure tests

**Status**: required closure stage for any coded point
**Depends on**: any stage that changes code
**Primary historical source**: phase reports + operator UX requirements
**Official docs**: D1, D8, D9, D10, D11, D13
**Mandatory skills/MCP**:

- same as the stage being closed;
- no closure without logging the actual tools and docs used.

**Implementation plan**

1. Every coded stage must end with:
   - deterministic local tests;
   - smoke steps;
   - rollback path;
   - operator recovery notes;
   - updated roadmap/report/work-verification artifacts.
2. If the stage changed any server-side code, verification must run against a fresh server process after a readiness probe, not against a stale long-running backend.
3. Health and diagnostics must be human-readable:
   - last tick;
   - last error;
   - current enabled/disabled state;
   - blocked-state reasons where relevant.
4. Smoke tools must remain runnable after the change.
5. The execution report must be complete before the work-verification stage can approve anything.

**Required evidence / exit gate**

- test commands and outputs are recorded with real values;
- if server-side code changed, the report records the fresh-start and readiness evidence used before endpoint verification;
- rollback path is written and scoped to the actual change;
- unresolved items remain explicit and block approval when necessary;
- verifier can re-run the closure logic from the report without guessing.

**Out of scope**

- “tests passed” without commands or outputs;
- “docs checked” without URLs or tool records;
- moving to the next stage with an incomplete report.

## 8. Stage Ordering And Approval Rules

1. Points 1-2 may be verified as current-code prerequisites, but they are not baseline-frozen until a retroactive artifact trail exists or they are explicitly re-baselined in an approved package.
2. Points 3-6 are baseline-lock stages. They are verified first and only reopened if the report finds a real regression.
3. Point 7 is now approved and shipped as Stage 7A. Future work must treat it as current baseline and start from the Stage 7A report/work-verification evidence, not from the older plan-only wording.
4. Points 8 and 9 are also part of the shipped Stage 7A baseline. Future edits to delivery dedup or transport lifecycle are regression fixes or new approved stages, not continuation of the old unapproved plan.
5. Point 10 is conditional late hardening. It stays deferred unless runtime evidence proves it is needed.
6. Point 11 is mandatory closure for any coded stage.

## 9. Non-Negotiable Prohibitions

- No coding from memory.
- No claiming the historical Phase C Stop-hook delivery path is current baseline unless it is re-proven and explicitly re-approved.
- No filling report sections from assumptions.
- No bypassing stage gates.
- No treating historical docs as automatically current without re-verification.
- No cross-project automation shortcuts.
- No destructive mailbox reads for status-only checks.
- No silent fallback from unsupported Codex transport to “maybe plain CLI”.

## 10. Success Condition For The Master Roadmap

This roadmap succeeds only if future executors can use it without inventing missing process:

- one canonical roadmap;
- one canonical report gate;
- point 7 preserved as the proven Codex path;
- real operator UX priorities preserved;
- no room to claim “done” without file inspection, official docs, MCP/skill log, tests, and verification.
