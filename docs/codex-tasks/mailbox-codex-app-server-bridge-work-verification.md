# mailbox-codex-app-server-bridge — Work Verification

**Verifier**: Codex self-check before Claude review
**Mode**: post-exec
**Scope**: Stage 7A Codex WSL reminder transport via `app-server + remote`

---

## Findings

No Critical or Mandatory code findings remain in WSL automated checks after the Claude review fixes, 2026-04-25 lifecycle hardening, and 2026-04-26 remote-session preservation fix.

Live continuation on 2026-04-24 closed the core HTTP/WebSocket path outside the sandbox restriction:

- loopback listen probe returned `listen-ok 127.0.0.1:3003`;
- dashboard served `http://127.0.0.1:9119/` and backend listened on `127.0.0.1:3003`;
- transport start returned `state=ready`, `ready=true`, `managed=true`, `wsUrl=ws://127.0.0.1:4501`;
- remote Codex TUI loaded thread `019dc10e-5bdc-7403-9973-551bd1c400c2`;
- after one initial TUI prompt created a rollout, bridge delivered the workflow test reminder and Codex replied `OK`.

Previously remaining closure blockers:

- Codex did not execute Windows tests directly, but Claude reported a green Windows rerun after the platform-conditional manager test fix;
- the `state: "signaled"` delivery-ledger snapshot was missed in the live run because the delivery row was pruned after the mailbox message left pending. Post-smoke hardening now retains future `signaled` rows.

2026-04-25 continuation closed the dashboard/browser and shutdown blockers:

- Playwright MCP browser proof clicked dashboard `Start`, `Restart`, `Stop`, and `Close workflow`.
- `Start` returned `state=ready`, `ready=true`, `managed=true`, PID `1032210`, and `/readyz` exit 0.
- `Restart` returned new PID `1032689` and `/readyz` exit 0.
- `Stop` returned `state=stopped`, `ready=false`, `managed=false`, `pid=null`, and `/readyz` exit 7.
- First `Close workflow` attempt exposed a real cleanup defect: dashboard `3003` and preview `9119` stopped, but managed `codex app-server --listen ws://127.0.0.1:4501` survived as PID `1029480/1029487`.
- Fix applied: shutdown awaits `codexTransport.stop()` before port cleanup; signal shutdown awaits transport stop; manager sends process-group `SIGTERM` and fallback process-group `SIGKILL`.
- Repeat shutdown proof passed: with transport PID `1033907`, `Close workflow` showed the quiet UI notice, `3003`, `9119`, and `4501` all failed with curl exit 7, and `pgrep -af "[c]odex app-server --listen ws://127.0.0.1:4501"` returned exit 1.
- Claude Round-4 M1 was confirmed and fixed: the force-kill test now branches by platform. WSL/Unix asserts process-group `killProcess(-pid, SIGTERM/SIGKILL)`; Windows asserts no group kill and still requires wrapper `child.kill("SIGTERM")` then `child.kill("SIGKILL")`.
- Claude Round-4 R1 was accepted and hardened: signal-shutdown force-exit watchdog is now 5000 ms instead of 3000 ms, giving cleanup more room after transport stop.
- Claude Round-5 accepted Stage 7A v1 with no new Critical/Mandatory findings. The Windows-only full-suite flake was traced to transient `EPERM` from NTFS `rename` during JSON persistence, not to bridge behavior.
- Round-5 Rec-1/R5-3 was folded into this patch: manager and bridge `atomicWriteJson` now retry transient `EPERM/EACCES` rename failures, bridge temp files are unique instead of fixed `.tmp`, and the force-kill test waits are 50/50ms instead of 5/5ms.
- Claude Round-6 independently verified the retry patch on Windows: `node --test test/*.test.mjs` passed 10/10 runs, each reporting `pass 19` and `fail 0`. Round-6 verdict was final approval with no new Critical/Mandatory findings.
- User operator smoke found one Windows-launch path bug after final review: Windows dashboard passed `E:\Project\workflow` into WSL `bash -lc cd`, so the hidden app-server never reached `readyz`. Manager now converts Windows drive paths to `/mnt/<drive>/...` before `wsl.exe` launch.
- User operator smoke then found the app-server terminal was still visible after transport reached READY. A direct long-lived `wsl.exe` spawn was rejected. The first attempted WScript/CMD relay was also rejected by real smoke: hidden VBS `WScript.Shell.Run(... wsl.exe ...)` returned `ret=-1` in an isolated probe and did not create a WSL marker. Final fix uses a generated PowerShell hidden runner with `Start-Process -WindowStyle Hidden`, plus first-line WSL launcher logging.
- User operator smoke then found the UI row `Готов` kept showing the old timestamp after `Stop`. Backend now clears `lastReadyAt` on non-ready states, and the React UI renders that timestamp only while `ready === true`.
- Final user confirmation for the real browser smoke: `да всё ок`.
- Claude re-review request sent via mailbox: `to-claude/workflow__2026-04-25T22-44-07Z-mailbox-codex-app-server-bridge-codex-010.md`.
- Claude Round-7 reply rejected final approval because two Windows-only test assertions were stale and the brief still contained a PowerShell architecture contradiction.
- Round-7 M1/M2/R1 were applied: Windows spawn test now expects `powershell.exe`/`run-hidden.ps1`; launcher log-path test accepts both `/tmp` and `/mnt/<drive>` translated temp roots; brief now allows a thin generated PowerShell hidden runner while forbidding broad PowerShell orchestration.
- User then reported that clicking Codex transport `Stop` still killed the live `codex --remote` TUI with `WebSocket protocol error: Connection reset without closing handshake`.
- Remote-session preservation fix applied: dashboard UI no longer exposes transport Stop/Restart controls; legacy `/api/runtime/codex-transport/stop` and `/restart` routes return `409 code:"codex_transport_lifecycle_preserved"` without calling manager stop/restart.
- Hardening follow-up applied: `Force stop` is now a separate confirmed emergency action; `codex-remote-project` rejects empty bootstrap prompts and exposes `zeroTouchBootstrap:true`; bridge fallback prefers active project roots, blocks stale fallback threads, and records structured RPC errors.

## Verification

- `node --check` passed for all changed server/client `.mjs` and `dashboard/server.js`.
- `node --test test/*.test.mjs` passed in WSL after fixes: 4 files, 0 fail.
- `cd dashboard && npm run build` passed with Vite 8.0.8.
- `node scripts/codex-app-server-smoke.mjs --help` confirmed the refactored smoke script still exposes the original manual flags.
- `timeout 10s node scripts/codex-app-server-smoke.mjs --list-loaded --timeout-ms 5000` succeeded over stdio app-server and returned `loaded.data=[]`.
- Code inspection found no `turn/steer`, no `thread/inject_items`, and no mailbox mutation helpers in the automatic bridge path.
- Claude C2/M2 Windows failure was accepted and fixed by making the manager spawn assertion platform-aware. Claude then reported a green Windows rerun.
- Claude M3/R1/R2/R3 were accepted and fixed: `activeSessions` only, `sessionIds` array, plain `turn.id` support, and `ws:` only.
- Claude Round-2 code review approved the current code after independent Windows verification: `node --test test/*.test.mjs` reported 16 pass, 0 fail; `npx vite build` reported clean.
- Live AC-16 transport/bridge proof passed on loopback.
- Live AC-17 functional proof passed: original `to-codex/workflow__2026-04-24T19-55-34Z-bridge-live-smoke-2026-04-24-claude-001.md` moved to archive and `to-claude/workflow__2026-04-24T19-58-32Z-bridge-live-smoke-2026-04-24-codex-001.md` was created with body `OK`.
- Post-smoke hardening passed: full `node --check` set exited 0, targeted bridge stack tests passed 3/3, `node --test test/*.test.mjs` passed 4/4, and `cd dashboard && npm run build` passed.
- Claude Round-3 code review approved the post-smoke hardening with no Critical and no Mandatory findings. Claude reported Windows `node --test test/*.test.mjs` as 18/18 pass and dashboard build clean.
- 2026-04-25 lifecycle-fix verification passed: `node --check dashboard/server.js`, `node --check dashboard/codex-app-server-manager.mjs`, targeted manager test, full `node --test test/*.test.mjs` 4/4, and `cd dashboard && npm run build`.
- 2026-04-25 Round-4 M1/R1 verification passed in WSL after the platform assertion and watchdog fixes: `node --check dashboard/server.js` exit 0; `node --test test/codex-app-server-manager.test.mjs` passed 1/1; `node --test test/*.test.mjs` passed 4/4; dashboard build passed.
- 2026-04-25 Round-5 Windows-persistence hardening passed in WSL: `node --check dashboard/codex-app-server-manager.mjs`, `node --check dashboard/codex-bridge.mjs`, `node --test test/codex-app-server-manager.test.mjs` 1/1, `node --test test/*.test.mjs` 4/4, and `cd dashboard && npm run build`.
- 2026-04-25 Round-6 Windows verification from Claude: post-fix `node --test test/*.test.mjs` ran 10 times on Windows with 10/10 pass.
- 2026-04-25 Windows-launch path fix passed in WSL: `node --check dashboard/codex-app-server-manager.mjs`, `node --test test/codex-app-server-manager.test.mjs` 1/1, `node --test test/*.test.mjs` 4/4, and `cd dashboard && npm run build`.
- 2026-04-26 hidden PowerShell WSL runner fix passed in WSL: `node --check dashboard/codex-app-server-manager.mjs`, `node --test test/codex-app-server-manager.test.mjs` 1/1, `node --test test/*.test.mjs` 4/4, and `cd dashboard && npm run build`.
- 2026-04-26 live API proof after clean dashboard restart: `POST /api/runtime/codex-transport/start` returned `state:"ready", ready:true`; `GET http://127.0.0.1:4501/readyz` returned HTTP 200; Windows ports showed listeners on `3003`, `4501`, and `9119`; `codex-app-server.log` included `[launcher] requested_cwd=/mnt/e/Project/workflow`, `codex=/usr/local/lib/nodejs/current/bin/codex`, and `codex app-server (WebSockets)`.
- 2026-04-26 Stop/Ready timestamp proof after clean dashboard restart: `startState=ready`, `startReady=true`, `startLastReadyAt=2026-04-25T22:35:39Z`; then `stopState=stopped`, `stopReady=false`, `stopLastReadyAt=null`; final status also returned `statusReady=false`, `statusLastReadyAt=null`.
- 2026-04-26 final checks after the Ready timestamp edge fix: `node --check dashboard/codex-app-server-manager.mjs`, `node --test test/*.test.mjs` 4/4, and `cd dashboard && npm run build`.
- 2026-04-26 Round-7 Windows verification after M1/M2 fixes: from `E:\Project\workflow`, `node --test test/*.test.mjs` ran 5 times; each run reported `tests 20`, `pass 20`, `fail 0`.
- 2026-04-26 Round-7 WSL/build verification: `node --check dashboard/codex-app-server-manager.mjs` exit 0; `node --test test/codex-app-server-manager.test.mjs` pass; `node --test test/*.test.mjs` 4/4 pass; `cd dashboard && npm run build` pass.
- 2026-04-26 live remote-session fallback verification: after Codex hooks did not register a Codex row in `sessions.json`, bridge fallback matched the real remote CLI thread by app-server `cwd`, ignored VS Code-internal loaded threads, and first reported `blocked_active_turn` while the Codex turn was busy. After the turn became idle, the bridge delivered the reminder into this remote Codex TUI. `mailbox-runtime/deliveries.json` recorded `state:"signaled"`, `threadId:"019dbbb5-dd19-7193-bf2f-4163d388b44a"`, `turnId:"019dc6ff-1ea2-74e0-b0b4-229f92df2f8a"`, `deliveredAt:"2026-04-25T23:35:00Z"`, and `sessionFreshnessBasis:"appServerThreadCwd"`.
- 2026-04-26 Round-9 Claude delta review after app-server fallback: approved with no Critical/Mandatory findings. Claude reported Windows `node --test test/*.test.mjs` 5/5 green, each with `tests 22`, `pass 22`, `fail 0`. Non-blocking observations are recorded as follow-ups: basename-only fallback collision risk, legacy empty `source` compatibility branch, and no freshness cutoff for fallback-loaded threads.
- 2026-04-26 remote-session preservation verification: `node --test test/dashboard-codex-transport-lifecycle.test.mjs test/codex-app-server-manager.test.mjs` passed; `node --test test/*.test.mjs` passed 5/5; `cd dashboard && npm run build` passed with Vite 8.0.8.
- 2026-04-26 hardening follow-up verification added tests for zero-touch launcher args, force-stop route/UI gating, project-root matching, stale fallback blocking, and structured RPC metadata. Live HTTP proof from this Codex sandbox was blocked by loopback `EPERM`; escalation for the loopback check was rejected by the platform.

## Security

- Non-loopback WebSocket URLs are rejected by both manager/bridge tests; `wss:` loopback is also rejected.
- The bridge fails closed on missing session, missing thread, ambiguous threads, and active thread state.
- Legacy dashboard transport Stop/Restart routes fail closed and preserve the app-server instead of killing live remote TUI connections.
- Emergency force-stop is intentionally destructive and requires explicit confirmation.
- App-server fallback delivery is bounded by a 15-minute default thread freshness cutoff and records match basis/candidate IDs for audit.
- No mailbox message body is injected by the bridge; only a metadata reminder is sent.
- Delivery state is persisted under runtime JSON, not mailbox markdown files.

## Residual Risks

- A raw `codex --remote` thread without a prior turn can still return `no rollout found`; the supported zero-touch path is `codex-remote-project`/`codexr`, which supplies the initial prompt.
- The live-smoke run missed the delivery ledger before pruning. Code now retains completed `signaled` delivery history for future runs.
- Windows manager-only rerun and post-fix full-suite rerun were reported green by Claude, but Codex did not independently execute them because this session is WSL-only.
- Claude reproduced the remaining Windows full-suite pollution as transient NTFS `EPERM` on `rename`; the retry fix is implemented, WSL validation is green, and Claude's Windows post-fix 10-run suite is green.
- The Windows-launch and hidden PowerShell runner fixes were user-smoked in the real browser and confirmed by the user. Round-7 Windows-only test regressions are also fixed and Windows full suite passed 5/5 runs.
- Round-4 R2 remains future hardening: adding an HTTP shutdown force-exit path needs a separate decision because the current operator path depends on `kill-port` stopping both backend and preview.
- Test reply cleanup failed in sandbox with `EROFS`, leaving `to-claude/workflow__2026-04-24T19-58-32Z-bridge-live-smoke-2026-04-24-codex-001.md` pending for Claude.
- Round-3 Recommended items are non-blocking but should be tracked before broad rollout: structured RPC errors, bounded signaled history, per-message error ledger, `threadIds` array for multiple cold threads, stricter unknown-status handling.

## Verdict

Implementation passed Claude code review, core HTTP/WS live smoke, post-smoke bridge hardening tests, 2026-04-25 browser/shutdown smoke, Round-5 Windows-persistence hardening, Claude's Round-6 Windows 10-run full-suite verification, the post-acceptance Windows-launch path fix checks, the hidden PowerShell WSL runner live proof, Stop/Ready timestamp live proof, Round-7 Windows 5-run full-suite verification after fixing M1/M2, and the 2026-04-26 remote-session preservation regression checks.
