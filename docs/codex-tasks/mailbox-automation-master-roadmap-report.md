# Mailbox Automation Master Roadmap — Execution Report

**Plan**: `docs/codex-tasks/mailbox-automation-master-roadmap.md`
**Planning audit**: `docs/codex-tasks/mailbox-automation-master-roadmap-planning-audit.md`
**Work verification**: `docs/codex-tasks/mailbox-automation-master-roadmap-work-verification.md`
**Stage report**: `docs/codex-tasks/mailbox-codex-app-server-bridge-report.md`
**Live-smoke runbook**: `docs/codex-tasks/mailbox-codex-app-server-bridge-live-smoke.md`
**Executor**: Codex
**Date**: 2026-04-24
**Timezone**: Europe/Moscow
**Branch / base HEAD**: `master` / `9025ba3`
**Stage(s) executed in this run**: Point 7A implementation, core live-smoke continuation, Point 9 dashboard control subset, and 2026-04-25 browser/shutdown lifecycle closure
**User approval reference**: User message `приступай к реализации` after Claude approval of the master roadmap
**Working directory**: `/mnt/e/project/workflow`

---

## 1. Repository Preflight

Commands run before implementation:

```bash
git rev-parse --short HEAD
git status --short
node --version
npm --version
```

Actual output:

```text
9025ba3
 M README.md
 M README.ru.md
 M dashboard/server.js
 M dashboard/src/App.jsx
 M dashboard/src/api.js
 M local-claude-codex-mailbox-workflow.md
 M scripts/mailbox-lib.mjs
 M scripts/mailbox.mjs
 M start-workflow-codex.cmd
 M start-workflow-hidden.vbs
 M start-workflow.cmd
?? dashboard/codex-app-server-manager.mjs
?? dashboard/codex-bridge.mjs
?? docs/codex-tasks/mailbox-automation-master-roadmap-planning-audit.md
?? docs/codex-tasks/mailbox-automation-master-roadmap-report.md
?? docs/codex-tasks/mailbox-automation-master-roadmap-work-verification.md
?? docs/codex-tasks/mailbox-automation-master-roadmap.md
?? docs/codex-tasks/mailbox-codex-app-server-bridge-planning-audit.md
?? docs/codex-tasks/mailbox-codex-app-server-bridge-report.md
?? docs/codex-tasks/mailbox-codex-app-server-bridge-work-verification.md
?? docs/codex-tasks/mailbox-codex-app-server-bridge.md
?? docs/mailbox-agent-onboarding.md
?? docs/wiki-dashboard-unread-sync.md
?? scripts/codex-app-server-client.mjs
?? scripts/codex-app-server-smoke.mjs
?? start-workflow-codex-hidden.vbs
?? test/
v24.14.1
11.11.0
```

Files inspected before coding:

- `AGENTS.md` instructions supplied by the user
- `docs/codex-tasks/mailbox-automation-master-roadmap.md`
- `docs/codex-tasks/mailbox-automation-master-roadmap-planning-audit.md`
- `docs/codex-tasks/mailbox-codex-app-server-bridge.md`
- `docs/codex-tasks/mailbox-codex-app-server-bridge-planning-audit.md`
- `dashboard/server.js`
- `dashboard/src/App.jsx`
- `dashboard/src/api.js`
- `dashboard/supervisor.mjs`
- `scripts/codex-app-server-smoke.mjs`
- `scripts/mailbox-lib.mjs`
- `scripts/mailbox.mjs`
- `test/mailbox-cli-session-resolution.test.mjs`
- `dashboard/package.json`

Dirty-worktree handling:

- Pre-existing dirty files were not reverted.
- In-scope dirty files touched in this run: `dashboard/server.js`, `dashboard/src/App.jsx`, `dashboard/src/api.js`, `scripts/codex-app-server-smoke.mjs`.
- Out-of-scope dirty files were left untouched except for read-only inspection.

Approved whitelist for executed Stage 7A came from `docs/codex-tasks/mailbox-codex-app-server-bridge.md` §2. Changed/created implementation files stayed within that whitelist.

Preflight complete: **YES**.

Post-review clarification:

- Claude C0 claimed there was no user approval. This is rejected because this report's approval reference is the direct user message `приступай к реализации` in the current chat.
- Claude C1 used whole-worktree `git diff HEAD`, which includes pre-existing dirty files already recorded in preflight. Stage 7A implementation scope remains the whitelist listed in the bridge plan.

## 2. Wiki-First Log

Wiki index scan:

```bash
rg --files '/mnt/e/Project/memory claude/memory claude/wiki' | rg 'mailbox|workflow|codex|mcp|skill|launcher|dashboard|supervisor|tool-enforcement|polling'
```

Relevant wiki articles read:

| Article | Decision influenced |
|---|---|
| `concepts/workflow-hybrid-hook-automation.md` | Kept business logic in backend/dashboard, hooks as thin adapters only. |
| `concepts/mailbox-project-isolation.md` | Enforced project-scoped visibility and fail-closed session/project matching. |
| `concepts/inter-agent-file-mailbox.md` | Preserved file mailbox protocol and avoided treating task docs as mailbox transport. |
| `concepts/mailbox-list-destructive-read.md` | Avoided `mailbox.mjs list` for read-only checks and avoided mailbox markdown mutation in bridge. |
| `connections/tool-enforcement-dual-failure.md` | Added explicit report evidence so “tools used” cannot be claimed without records. |
| `concepts/polling-overlap-shared-guard-pattern.md` | Used shared polling/action guard style already present in dashboard. |

Wiki-first satisfied: **YES**.

## 3. Official Documentation Log

| Doc | Tool/method | Implementation decision influenced |
|---|---|---|
| OpenAI Codex app-server docs | OpenAI docs MCP | Used `initialize`, `initialized`, `thread/loaded/list`, `thread/read`, `thread/resume`, `turn/start`; kept WebSocket loopback-only. |
| OpenAI Codex MCP docs | OpenAI docs MCP | Recorded MCP use and kept plan evidence explicit. |
| OpenAI Codex skills docs | OpenAI docs MCP | Used skill workflow as formal evidence rather than from-memory claims. |
| Node `child_process` docs | official `nodejs.org` | Used `spawn`, `detached`, `stdio`, `unref`, and SIGTERM handling for hidden app-server manager. |
| Node `fs` docs | official `nodejs.org` | Used write+rename runtime JSON persistence; fixed manager tmp-file race with unique tmp paths. |
| React `useEffect` docs | official `react.dev` | Kept runtime polling in effects and abortable fetches. |
| React `useEffectEvent` docs | official `react.dev` | Kept dashboard action handlers as Effect Events, matching existing app style. |

Official-doc gate result: **YES for code implementation**, **NO for final live closure** because live WebSocket/dashboard docs behavior still needs real environment proof.

## 4. Skills And MCP Log

Skills used:

| Skill | Path | Use |
|---|---|---|
| `openai-docs` | `/home/dmaka/.codex/skills/.system/openai-docs/SKILL.md` | Current OpenAI app-server/MCP/skills docs through MCP. |
| `build-web-apps:react-best-practices` | `/home/dmaka/.codex/plugins/cache/openai-curated/build-web-apps/.../skills/react-best-practices/SKILL.md` | React dashboard polling/action integration. |

MCP/tool usage:

| Tool/MCP | Query/command | Result used |
|---|---|---|
| `tool_search` | OpenAI docs/app-server search | Found OpenAI docs MCP surface. |
| `openaiDeveloperDocs` MCP | `search_openai_docs("Codex app-server")` | Located app-server documentation. |
| `openaiDeveloperDocs` MCP | `fetch_openai_doc("https://developers.openai.com/codex/app-server")` | App-server protocol and methods. |
| `openaiDeveloperDocs` MCP | `fetch_openai_doc("https://developers.openai.com/codex/mcp")` | MCP evidence requirements. |
| `openaiDeveloperDocs` MCP | `fetch_openai_doc("https://developers.openai.com/codex/skills")` | Skill workflow evidence. |
| local shell | `rg`, `sed`, `node --check`, `node --test`, `npm run build` | Codebase inspection and verification. |

Skill/MCP gate result: **YES**.

## 5. No-From-Memory Evidence Ledger

| Claim relied on | Evidence |
|---|---|
| app-server uses JSON-RPC-style request/response and supports WebSocket loopback | OpenAI app-server docs MCP. |
| `turn/start`, not `turn/steer`, is the correct automatic reminder method for v1 | OpenAI app-server docs MCP + approved plan. |
| Non-loopback app-server exposure is unsafe for v1 | OpenAI app-server docs MCP and approved plan. |
| `mailbox.mjs list` mutates `received_at` | Wiki `mailbox-list-destructive-read.md` and prior source inspection. |
| Dashboard polling should avoid overlapping stale requests | Wiki `polling-overlap-shared-guard-pattern.md` and existing `App.jsx` pattern. |
| Child-process manager should use `spawn`/`detached`/`unref` | Node official child_process docs. |

No-from-memory gate result: **YES**.

## 6. Stage Summary Matrix

| Point | Stage name | Status | Next stage allowed? |
|---|---|---|---|
| 1 | Hidden launcher default + dashboard close | pre-existing, not reworked in this run | N/A |
| 2 | Dashboard-first operator shell | partially covered by Stage 7A UI addition; browser control proof closed on 2026-04-25 | PARTIAL, broader UX hardening still remains |
| 3 | Supervisor runtime core + health | reused existing supervisor | N/A |
| 4 | Global multi-project visibility | reused existing dashboard data | N/A |
| 5 | Project isolation + deliverable filtering | reused and enforced in bridge | YES for Stage 7A automated checks |
| 6 | Claude-side passive automation foundation | not executed | N/A |
| 7 | Codex `app-server + --remote` reminder bridge | implemented, automated tests pass, core live proof passed after initial rollout, launcher zero-touch bootstrap added | YES for targeted review; raw `codex --remote` remains unsupported |
| 8 | Dedup ledger + retry-safe delivery state | implemented subset required by 7A, future `signaled` rows retained | PARTIAL, current live run missed pre-hardening signaled snapshot |
| 9 | Dashboard Codex transport control + health | implemented subset required by 7A; browser click and shutdown proof passed on 2026-04-25 | YES for this subset |
| 10 | Late hardening: ambiguity, lease, blocked-state recovery | implemented ambiguity/active-turn subset | NO, not full stage |
| 11 | Diagnostics, rollback, runbooks, and closure tests | report/runbook subset done | NO, closure tests incomplete |

## 7. Executed Stage Detail

### Point 7 — Codex `app-server + --remote` reminder bridge

Status: **implemented, core HTTP/WS live-closed, not fully product-closed**.

First Claude review fixes applied in this report cycle:

- C2/M2: platform-coupled manager spawn test fixed.
- M3: bridge now consumes `activeSessions` only.
- R1: ledger uses `sessionIds` array.
- R2: bridge records nested or plain turn id.
- R3: bridge rejects `wss:` and accepts only `ws:` loopback.

Second Claude review result:

- Code review: **APPROVED**.
- Windows tests: Claude reported `node --test test/*.test.mjs` on Windows as 16 pass, 0 fail.
- Dashboard build: Claude reported `cd dashboard && npx vite build` clean.
- Stage acceptance after Round-2: **PARTIAL**. AC-16 and AC-17 functional path passed in live continuation; dashboard browser controls, shutdown, and zero-touch cold-rollout behavior remained open at that point.
- Live-smoke runbook: added and then updated as `docs/codex-tasks/mailbox-codex-app-server-bridge-live-smoke.md`; it now records the initial-rollout precondition and immediate delivery-ledger capture requirement.

Files changed/created:

- `scripts/codex-app-server-client.mjs`
- `scripts/codex-app-server-smoke.mjs`
- `dashboard/codex-app-server-manager.mjs`
- `dashboard/codex-bridge.mjs`
- `dashboard/server.js`
- `dashboard/src/api.js`
- `dashboard/src/App.jsx`
- `test/codex-app-server-client.test.mjs`
- `test/codex-app-server-manager.test.mjs`
- `test/codex-bridge.test.mjs`
- `docs/codex-tasks/mailbox-codex-app-server-bridge-report.md`
- `docs/codex-tasks/mailbox-codex-app-server-bridge-work-verification.md`
- `docs/codex-tasks/mailbox-codex-app-server-bridge-live-smoke.md`

Commands run and results:

```bash
node --check scripts/codex-app-server-client.mjs && \
node --check scripts/codex-app-server-smoke.mjs && \
node --check dashboard/codex-bridge.mjs && \
node --check dashboard/codex-app-server-manager.mjs && \
node --check dashboard/server.js
```

Result: exit 0.

```bash
node --test test/*.test.mjs
```

Result: 4 test files passed, 0 failed.

Latest WSL rerun after review fixes:

```text
✔ test/codex-app-server-client.test.mjs (124.342952ms)
✔ test/codex-app-server-manager.test.mjs (2313.799874ms)
✔ test/codex-bridge.test.mjs (627.520787ms)
✔ test/mailbox-cli-session-resolution.test.mjs (3982.4594ms)
ℹ tests 4
ℹ pass 4
ℹ fail 0
```

Windows rerun after fix: **RUN by Claude**, reported 16 pass, 0 fail. Not independently run by Codex.

```bash
cd dashboard && npm run build
```

Result: Vite build passed, generated `dist/assets/index-CcmbfLBK.js`.

```bash
timeout 10s node scripts/codex-app-server-smoke.mjs --list-loaded --timeout-ms 5000
```

Result: stdio app-server smoke passed, `loaded.data=[]`.

Evidence that the stage contract holds:

- Transport manager rejects non-loopback URLs.
- Bridge blocks without an active Codex session before creating an app-server client.
- Bridge blocks when no loaded thread matches, when multiple threads match, and when the matching thread is active.
- Happy path calls `thread/resume` then `turn/start` exactly once.
- Duplicate pending rows already marked `signaled` are not re-signaled.
- Stale blocked delivery rows are pruned; successful `signaled` rows are retained as delivery evidence.
- Code inspection shows no `turn/steer`, no `thread/inject_items`, and no mailbox mutation helpers in bridge code.

Proof that a real remote Codex session was tested: **RUN**.

Live continuation evidence:

```text
listen-ok 127.0.0.1:3003
dashboard: Server listening on 127.0.0.1:3003
dashboard preview: http://127.0.0.1:9119/
transport: state=ready, ready=true, managed=true, wsUrl=ws://127.0.0.1:4501
loaded thread: 019dc10e-5bdc-7403-9973-551bd1c400c2
cold thread error before initial turn: {"code":-32600,"message":"no rollout found for thread id 019dc10e-5bdc-7403-9973-551bd1c400c2"}
test message: to-codex/workflow__2026-04-24T19-55-34Z-bridge-live-smoke-2026-04-24-claude-001.md
archived original: archive/bridge-live-smoke-2026-04-24/workflow__2026-04-24T19-55-34Z-bridge-live-smoke-2026-04-24-claude-001.md
reply created: to-claude/workflow__2026-04-24T19-58-32Z-bridge-live-smoke-2026-04-24-codex-001.md
reply body: OK
```

Post-smoke hardening:

```text
no rollout found -> blocked_no_rollout, not bridge error
signaled delivery rows retained after source pending row disappears
node --check dashboard/codex-bridge.mjs -> exit 0
node --test test/codex-app-server-client.test.mjs test/codex-app-server-manager.test.mjs test/codex-bridge.test.mjs -> tests 3, pass 3, fail 0
node --test test/*.test.mjs -> tests 4, pass 4, fail 0
cd dashboard && npm run build -> passed, dist/assets/index-CcmbfLBK.js 280.38 kB
Claude Round-3 review -> approved, no Critical/Mandatory; Windows tests 18/18 reported pass, dashboard build clean
```

2026-04-25 browser/shutdown lifecycle closure:

```text
wiki preflight: dashboard-operator-shell-pattern, codex-app-server-remote-injection, backend-lifecycle-verification-gap, live-smoke runbook
Playwright MCP loaded http://127.0.0.1:9119
initial UI: Codex transport status=stopped, buttons visible: Старт/Рестарт/Стоп/Закрыть workflow
Start: API state=ready, ready=true, managed=true, pid=1032210, /readyz exit=0
Restart: API state=ready, ready=true, managed=true, pid=1032689, /readyz exit=0
Stop: API state=stopped, ready=false, managed=false, pid=null, /readyz exit=7
first shutdown attempt found defect: 3003/9119 stopped but 4501 survived as PID 1029480/1029487
fix: shutdown awaits codexTransport.stop(); manager sends process-group SIGTERM with SIGKILL fallback
verification: node --check dashboard/server.js; node --check dashboard/codex-app-server-manager.mjs; node --test test/*.test.mjs -> 4/4 pass; dashboard build passed
final shutdown: transport pid=1033907, quiet UI notice shown, 3003 exit=7, 9119 exit=7, 4501 exit=7, pgrep managed app-server exit=1
```

2026-04-26 update: the shutdown cleanup decision above was superseded for live remote sessions. Dashboard shutdown, normal UI transport controls, and legacy transport Stop/Restart API calls must preserve `codex app-server`; Stop/Restart now fail closed instead of disconnecting open `codex --remote` clients. Intentional teardown is available only through the separate confirmed `Force stop` emergency path.

Round-4 M1 fix after Claude review:

```text
Issue confirmed: force-kill manager test asserted Unix-only process-group killProcess(-pid, ...), but manager intentionally skips that branch on Windows.
Fix: test now branches by platform; Windows expects groupSignals=[], Unix/WSL expects -pid SIGTERM/SIGKILL, both expect child.kill SIGTERM/SIGKILL.
R1 hardening: signal-shutdown force-exit watchdog increased from 3000 ms to 5000 ms.
R2 decision: HTTP shutdown force-exit not changed in this patch; current operator topology relies on kill-port stopping backend+preview and needs a separate follow-up before altering.
node --check dashboard/codex-app-server-manager.mjs -> exit 0
node --check dashboard/server.js -> exit 0
node --test test/codex-app-server-manager.test.mjs -> 1/1 pass
node --test test/*.test.mjs -> 4/4 pass
cd dashboard && npm run build -> pass, dist/assets/index-CcmbfLBK.js 280.38 kB
Docs: live-smoke runbook now explicitly says Windows-native dashboard hosting is unsupported in v1; managed transport is WSL/Linux.
```

Next stage allowed: **YES for targeted review/ship-check of the hardening follow-up**, **NO for broad rollout until live HTTP proof is rerun outside the Codex sandbox**.

Reason: the core bridge and dashboard lifecycle controls work live, and zero-touch bootstrap is implemented in the launcher path. The remaining gap is live HTTP proof for the new preservation/force-stop routes, which this Codex sandbox could not perform because loopback connect returned `EPERM`.

## 8. Final Change Inventory

Created:

- `scripts/codex-app-server-client.mjs`
- `dashboard/codex-app-server-manager.mjs`
- `dashboard/codex-bridge.mjs`
- `test/codex-app-server-client.test.mjs`
- `test/codex-app-server-manager.test.mjs`
- `test/codex-bridge.test.mjs`
- bridge stage report and work-verification files
- live-smoke runbook for AC-16/AC-17/UI closure

Modified:

- `scripts/codex-app-server-smoke.mjs`
- `dashboard/server.js`
- `dashboard/src/api.js`
- `dashboard/src/App.jsx`
- master execution report

Final `git status --short` at report time:

```text
 M README.md
 M README.ru.md
 M dashboard/server.js
 M dashboard/src/App.jsx
 M dashboard/src/api.js
 M local-claude-codex-mailbox-workflow.md
 M scripts/mailbox-lib.mjs
 M scripts/mailbox.mjs
 M start-workflow-codex.cmd
 M start-workflow-hidden.vbs
 M start-workflow.cmd
?? dashboard/codex-app-server-manager.mjs
?? dashboard/codex-bridge.mjs
?? docs/codex-tasks/mailbox-automation-master-roadmap-planning-audit.md
?? docs/codex-tasks/mailbox-automation-master-roadmap-report.md
?? docs/codex-tasks/mailbox-automation-master-roadmap-work-verification.md
?? docs/codex-tasks/mailbox-automation-master-roadmap.md
?? docs/codex-tasks/mailbox-codex-app-server-bridge-planning-audit.md
?? docs/codex-tasks/mailbox-codex-app-server-bridge-report.md
?? docs/codex-tasks/mailbox-codex-app-server-bridge-work-verification.md
?? docs/codex-tasks/mailbox-codex-app-server-bridge.md
?? docs/mailbox-agent-onboarding.md
?? docs/wiki-dashboard-unread-sync.md
?? scripts/codex-app-server-client.mjs
?? scripts/codex-app-server-smoke.mjs
?? start-workflow-codex-hidden.vbs
?? test/
```

## 9. Blockers And Unresolved Items

- AC-16 HTTP endpoint proof passed in live continuation.
- AC-17 functional `codex --remote` WebSocket reminder proof passed after initial rollout.
- Browser UI click proof and shutdown proof passed on 2026-04-25 after lifecycle hardening.
- Raw cold remote TUI without an initialized rollout can still return `no rollout found`; supported launch goes through `codex-remote-project`/`codexr`, which supplies the bootstrap prompt.
- Delivery ledger `state: "signaled"` snapshot was not captured before pruning in the live run; code now retains future `signaled` delivery rows.
- Windows `node --test test/*.test.mjs` after manager-test fix was reported green by Claude, not independently run by Codex.
- Round-4 Windows force-kill test regression was fixed by platform-conditional assertions; WSL manager-only and full suite both pass. Windows rerun is still delegated to Claude/Windows shell.
- Round-4 R1 was hardened by increasing signal force-exit timeout to 5000 ms; R2 remains a future shutdown-topology hardening item.
- Round-5 accepted Stage 7A v1 with no new Critical/Mandatory findings. Claude's Windows full-suite flake was traced to transient NTFS `EPERM` during JSON `rename`; manager and bridge JSON persistence now retry EPERM/EACCES with unique tmp files, and the force-kill test waits are 50/50ms.
- Round-6 final acceptance closed the code-review thread: Claude reran Windows `node --test test/*.test.mjs` 10 times after the retry patch, 10/10 passed, and no new Critical/Mandatory findings remained.
- User-side Windows launcher smoke found a hidden app-server readiness timeout caused by passing Windows cwd into WSL `cd`. Manager now converts `E:\...` to `/mnt/e/...`; WSL checks and dashboard build passed. User needs to restart dashboard and retry `Codex transport -> Start`.
- User-side Windows launcher smoke then found the app-server WSL terminal stayed visible after READY. Manager now uses a hidden WScript/CMD relay that starts `codex app-server` in WSL background with pid/log files; WSL checks and dashboard build passed.
- Cleanup of test reply failed in sandbox with `EROFS`; `to-claude/workflow__2026-04-24T19-58-32Z-bridge-live-smoke-2026-04-24-codex-001.md` remains pending for Claude.
- Claude code review is complete for the previous stage. The new hardening follow-up needs Claude review.

## 10. Executor Attestation

- [x] I inspected relevant project files before coding.
- [x] I re-checked relevant wiki articles before coding.
- [x] I re-checked relevant official docs before coding.
- [x] I logged skill usage.
- [x] I logged MCP/tool usage.
- [x] I did not rely on from-memory claims where evidence was required.
- [x] I echoed the whitelist from the approved planning scope.
- [x] I verified fresh HTTP endpoints after a readiness probe in the live continuation.
- [x] I ran browser UI smoke through Playwright MCP for `Start`, `Restart`, `Stop`, and `Close workflow`.
- [x] I found and fixed the shutdown lifecycle defect instead of marking a partial pass.
- [x] I re-ran tests/build after the lifecycle fix.
- [x] I verified and fixed the Round-5 Windows `EPERM` persistence finding instead of treating it as an uninspected recommendation.
- [x] I recorded Claude's Round-6 Windows 10/10 post-fix full-suite verification.
- [x] I fixed the user-reported Windows launcher path bug and added manager test coverage.
- [x] I fixed the user-reported remote-session disconnect from Codex transport Stop by removing UI Stop/Restart and blocking legacy API calls.
- [x] I added the confirmed emergency Force-stop path, launcher zero-touch bootstrap tests, project-root fallback matching, stale fallback blocking, and structured RPC telemetry.
- [x] I fixed the user-reported visible WSL app-server window with a hidden relay and added manager test coverage.
- [x] I documented the required non-sandbox live-smoke procedure instead of claiming sandbox acceptance.
- [x] I filled required report sections with real data.
- [x] I returned to fix a missed acceptance detail: no-session now blocks before app-server client creation.
- [ ] I am moving to the next production stage. I am not; zero-touch cold-start decision/follow-up remains first.

Final report status: **IMPLEMENTED, STAGE 7A CODE-REVIEW APPROVED FINAL, CORE LIVE PATH PROVEN, DASHBOARD LIFECYCLE CLOSED, WINDOWS LAUNCH PATH BUG FIXED, HIDDEN WSL RELAY FIXED, ZERO-TOUCH COLD-START OPEN**.
