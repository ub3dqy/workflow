# Paperclip P4a — ClaudeCodeAdapter — Planning Audit

**Plan**: `docs/codex-tasks/paperclip-p4a-claude-adapter.md`
**Report template**: `docs/codex-tasks/paperclip-p4a-claude-adapter-report.md`
**Architecture parent**: approved R4
**P2 parent (contract)**: commit `836999d`
**P3 parent (orchestrator wiring)**: commit `e884a03`
**Planner**: Claude
**Date**: 2026-04-20
**Baseline**: HEAD=`e884a03`
**Version**: v1

---

## §0 Meta-procedure

Canonical procedure: `E:/Project/memory claude/memory claude/docs/claude-plan-creation-procedure.md` v1 (NO-STOP DISCIPLINE).

Inputs:
- Architecture §6 P4: replace MockAdapter с real implementations. Contract locked в P2 — P4 = pure implementation.
- P2 contract: `scripts/adapters/agent-adapter.mjs` — 8 methods + typedefs + validateAdapter.
- P2 research: `paperclip-pivot-adapter-contract-research.md` §1 (Claude CLI primitives fully documented) + §3 (process lifecycle gotchas).
- P3 orchestrator (from `e884a03`): consumes adapter via `createOrchestrator({supervisor, adapter})` bootstrap в `dashboard/server.js`.

### P4a scope (Claude-only split)

Per research §6/§7: ClaudeCodeAdapter implemented first — all CLI primitives documented. CodexAdapter after live probe closes R-OQ-3/4/5 (separate handoff P4b).

**Deliverables**:
1. NEW `scripts/adapters/claude-code-adapter.mjs` — full 8-method AgentAdapter implementation.
2. `dashboard/server.js` — env-gated adapter selection (`DASHBOARD_ADAPTER=mock|claude-code`, default `mock`).
3. Spec section «ClaudeCodeAdapter (paperclip pivot P4a)».

**Out of scope**: CodexAdapter, attachExisting real impl, process reuse across turns, restart recovery, multi-task concurrency, UI changes.

---

## §1 MCP + Skill selection

| Tool | Purpose | Priority |
|------|---------|----------|
| `WebFetch` | Fetch Claude Code CLI reference (authoritative) | used |
| `context7` | Library docs fallback | deferred (Claude Code not в context7 index — WebFetch direct) |
| `plan-audit` skill | Step 10 mandatory | deferred to Step 10 |
| P2 research doc (planner-authored 2026-04-20) | Claude CLI primitives mapping | reused verbatim §1 |
| mock-adapter.mjs | Reference implementation pattern | reused shape + recordCallsTo atomic-write + contract assertion |

---

## §2 MCP readiness verification

| Probe | Result |
|-------|--------|
| WebFetch `https://code.claude.com/docs/en/cli-reference` | ✅ returned full flag table 2026-04-20 (see §4) |
| Filesystem `scripts/adapters/agent-adapter.mjs` / `mock-adapter.mjs` / `dashboard/orchestrator.mjs` / `dashboard/server.js` | ✅ Read full content |
| `plan-audit` skill | deferred Step 10 |

---

## §3 Files read during planning

| File | Tool | Purpose |
|------|------|---------|
| `scripts/adapters/agent-adapter.mjs` | Read (full, 142 lines) | contract + validateAdapter — new adapter must match exact method set |
| `scripts/adapters/mock-adapter.mjs` | Read (full, 187 lines) | reference shape: recordCallsTo pattern, atomic write+rename, session-collision throw (F2), injectMessage fallback (F1), classifyCrash heuristic, contract assertion bottom |
| `dashboard/orchestrator.mjs` | Read (first 80 lines) | consumer — confirms adapter method call signatures + error handling expectations |
| `dashboard/server.js` | Grep (bootstrap block) | exact insertion site для DASHBOARD_ADAPTER gate |
| `docs/codex-tasks/paperclip-pivot-adapter-contract-research.md` | Read (full, 329 lines) | §1 Claude CLI primitives, §3 process gotchas, §4 JSDoc contract, §6 open research items |
| `docs/codex-tasks/paperclip-pivot-architecture-plan.md` | Grep + targeted read | P4 scope (§6 line 290-302) |

---

## §4 Official docs fetched

| Topic | Source | URL | Result | Verbatim quote → plan ref |
|-------|--------|-----|--------|---------------------------|
| Headless / print mode | Claude Code CLI reference | `https://code.claude.com/docs/en/cli-reference` | ✅ returned | «Print response without interactive mode» → V-D1 (plan §2) |
| Session ID assignment | same | same | ✅ | «Use a specific session ID for the conversation (must be a valid UUID)» → V-D2 |
| Resume | same | same | ✅ | «Resume a specific session by ID or name, or show an interactive picker» → V-D3 |
| Output format | same | same | ✅ | «Specify output format for print mode (options: text, json, stream-json)» → V-D4 |
| Max turns | same | same | ✅ | «Limit the number of agentic turns (print mode only). Exits with an error when the limit is reached» → V-D5 |
| Append system prompt | same | same | ✅ | «Append custom text to the end of the default system prompt» → V-D6 |
| Permission mode | same | same | ✅ | «Accepts default, acceptEdits, plan, auto, dontAsk, or bypassPermissions» → V-D7 |
| No session persistence | same | same | ✅ | «Disable session persistence so sessions are not saved to disk and cannot be resumed» → V-D8 (honeypot — NOT used) |
| Fork session | same | same | ✅ | «When resuming, create a new session ID instead of reusing the original» → V-D9 (NOT used in P4a) |
| Auth status exit codes | same | same | ✅ | «Exits with code 0 if logged in, 1 if not» → V-D10 |
| Tools restriction | same | same | ✅ | «Restrict which built-in tools Claude can use» → V-D11 |

Redirect: original URL `docs.claude.com/en/docs/claude-code/cli-reference` → `code.claude.com/docs/en/cli-reference` (301). Final URL recorded.

Gaps (honest flags):
- Full exit-code taxonomy beyond auth status 0/1 + `--max-turns` error exit NOT documented. classifyCrash keeps P2 heuristic.
- `--session-id` collision behavior when UUID exists NOT documented — adapter guarantees unique UUID via `crypto.randomUUID()` + internal Map collision check (mirrors mock F2).
- Windows `.cmd` shim vs `.exe` binary resolution NOT documented — adapter accepts `claudePath` override.

---

## §5 AST scans + commands run

| Command | Purpose | Key output |
|---------|---------|------------|
| `wc -l` targets | baseline line counts | agent-adapter=142, mock-adapter=187, server.js=367, orchestrator.mjs=271, supervisor.mjs=439, spec=933 |
| `git log --oneline -3` | baseline commits | e884a03 P3 / 836999d P2 / f3d065d P1 |
| Grep `app\.(get\|post).*task` в server.js | confirm task endpoints committed (P1+P3) | L293 POST /api/tasks, L305 GET /api/tasks, L319 GET /api/tasks/:id, L329 POST /api/tasks/:id/stop |
| Grep `^export function` в mock-adapter.mjs | reference factory export | 1 (createMockAdapter) — plan mirrors this shape |
| Grep `AGENT_ADAPTER_METHODS\.length !== 8` в mock-adapter.mjs | contract assertion pattern | present at bottom — plan requires same assertion in new file |

---

## §6 Empirical tests

Not applicable for plan authoring — behavior validated в V-phase §6 of plan via stubbed `spawnFn` injection (V9/V10/V11/V12). No real Claude CLI invocation in Phase 1 (CLI may be absent в Codex env; real invocation gated за Phase 2 user visual).

---

## §7 Assumptions + verification status

| Claim | Evidence | Status |
|-------|----------|--------|
| Claude CLI `-p` is headless single-shot | Docs V-D1 | ✅ docs-verified |
| `--session-id UUID` valid via `crypto.randomUUID()` | Docs V-D2 + Node stdlib | ✅ |
| `-r <sessionId>` resumes prior session | Docs V-D3 | ✅ |
| `--output-format json` produces deterministic final payload | Docs V-D4 + P2 research §1.4 | ✅ (structure marker «result» / «stop_reason» educated assumption; fallback text heuristic retained) |
| `--permission-mode bypassPermissions` для headless | Docs V-D7 | ✅ |
| Mid-stream stdin injection NOT supported — injectMessage = alias to resume | P2 research §1.2 + docs (no stdin injection flag) | ✅ reasoned |
| `--no-session-persistence` breaks resume | Docs V-D8 | ✅ explicit honeypot — STOP condition |
| Claude sessions persist в `~/.claude/<session-id>` JSONL | P2 research §1.6 (SessionStart hook transcript_path) | ⚠️ known — adapter does NOT manage files, only session IDs |
| Windows Claude binary resolves via PATH | Implementation knowledge | ⚠️ honest flag §10 — user может override `claudePath` |
| One spawn per turn is contract-accurate | Research §1.2 + §3.4 strategy | ✅ |
| stdio ['pipe','pipe','pipe'] для stderr capture | Research §3.1 | ✅ |
| SIGTERM→SIGKILL escalation pattern | Research §3.3 | ✅ |
| classifyCrash category set matches P2 contract | agent-adapter.mjs ClassifyCrashResult typedef | ✅ verified |

---

## §8 plan-audit skill invocation

### Round 1 — 2026-04-20

Invocation: `Skill({plan-audit})`. Score: **9/10** 🟡 (0 critical, 2 important, 4 optional). Fixes applied inline:

- **F1 (important)** — classifyCrash «timedOut flag» contract drift. ClassifyCrashArgs typedef принимает только `{exitCode, stderr}`. Wording «SIGTERM + timedOut flag» выглядел как скрытый third arg. **Fix applied**: runClaude timeout handler now appends `[adapter timeout] SIGTERM` marker к stderr; classifyCrash matches marker через stderr substring (contract-accurate).
- **F2 (important)** — shutdown не kill'ит active spawns. Phase 2 P2.4 «no dangling claude processes» invariant недостижим без tracking. **Fix applied**: adapter maintains `activeSpawns: Set<ChildProcess>`; runClaude adds/removes; shutdown sweeps с SIGTERM (или SIGKILL если force). Added V15 probe.
- **F3 (optional)** — classifyCrash check order documented. **Fix applied**: enumerated 7-step precedence «first match wins».
- **F4 (optional)** — safety note on `bypassPermissions` default. **Fix applied**: §12 Notes to Codex with override example.
- **F5 (optional)** — runtime file co-existence note. **Fix applied**: §9 Rollback NB.
- **F6 (optional)** — V11 fixture strengthening: added exit=0 baseline + explicit timeout marker case (6 fixtures instead of 5).

All 6 applied inline before re-audit.

### Round 2 — 2026-04-20

Invocation: `Skill({plan-audit})`. Score: **10/10** ✅ (0 critical, 0 important, 2 optional). Optional refinements applied inline:

- **R2-O1 — .unref() hygiene**: runClaude timeout + shutdown SIGKILL escalation must use `setTimeout(..., …).unref()` to never block event-loop exit. **Applied**: §5 Change 1 shutdown bullet explicitly spells out `.unref()`.
- **R2-O2 — Gap G8 orchestrator.stop() не cascade adapter.shutdown()**: plan не wiring'ует adapter.shutdown() в existing orchestrator.stop() path, F2 fix sits unused on SIGINT. **Applied**: added Gap G8 к §10 (honest known-gap, P5+ refinement — single-line orchestrator.mjs edit out-of-scope в P4a).

Plan ready for Codex adversarial Round 3.

### Round 3 — 2026-04-20 (Codex adversarial)

Invocation: mailbox reply `2026-04-20T13-22-29Z-codex-001`. Findings:

- **F7 (blocker) — max-turns inverted into success**: §2 V-D5 quotes Claude docs «Exits with an error when the limit is reached», but Change 1 launch/resume explicitly accepted «exit 0 OR max-turns reached» as success. That advanced a task on incomplete turn. **Fix applied**: launch now throws на non-zero (incl. max-turns), resume returns `{messageAccepted: false}` на non-zero. classifyCrash step 2 (`maximum turns|max-turns`) → agent-error/retriable — orchestrator handleAdapterFailure path with 3-consecutive-error threshold terminates task `failed` если CLI постоянно hits cap.
- **F8 (important) — shutdown wiring was honest-gap'd as P5+, но Phase 2 P2.4 depends на it**: G8 flagged что `orchestrator.stop()` не cascade'ит `adapter.shutdown()`. Codex argues P2.4 «no dangling claude processes» недостижим без wiring, значит F2 activeSpawns sweep — dead code в P4a SIGINT path. **Fix applied (scope upgrade)**: Change 2.1 added — `dashboard/server.js` `shutdown()` function becomes async, `await orchestratorAdapter.shutdown({force:false})` between `orchestrator.stop()` и `supervisor.stop()`. G8 closed в P4a. Added V16 probe (grep `orchestratorAdapter.shutdown` в server.js).
- **F9 (bookkeeping) — stale report template**: §1 shutdown bullet выглядел как R1-pre wording; V11 label «5/5» устарел (plan теперь 7 fixtures). **Fix applied**: report §1 updated reflecting F2 activeSpawns sweep + F8 wiring + V11 label «7/7»; report §2 V15/V16 entries + threshold updates.

All 3 applied. Round 4 — pending Codex re-review.

### Round 4 — 2026-04-20 (Codex adversarial)

Invocation: mailbox reply `2026-04-20T14-43-39Z-codex-002`. Response: **«R4 clean. Новых findings по P4a plan у меня больше нет.»**

Adversarial loop closed — R1 (plan-audit skill self) + R2 (plan-audit skill self) + R3 (Codex) + R4 (Codex clean). Plan готов к execution handoff.

**Final score**: 10/10 (all F1-F9 applied inline across 4 rounds; G1-G7 honest open gaps; G8 closed in P4a via Change 2.1).

### Round 2+ — Codex adversarial

<fill after Codex replies>

---

## §9 Delta from P3

- P3 delivered: orchestrator factory + handleTaskTick state machine + MockAdapter integration + `DASHBOARD_ADAPTER` env not yet present (server.js hardcoded mock).
- P4a adds:
  - NEW `scripts/adapters/claude-code-adapter.mjs` — real adapter, same 8-method contract.
  - Modify `dashboard/server.js` — env-gated selection (mock remains default).
  - Spec append «ClaudeCodeAdapter (paperclip pivot P4a)» section.
- NO changes:
  - agent-adapter.mjs (contract locked P2)
  - mock-adapter.mjs (reference/default)
  - orchestrator.mjs (consumer stable)
  - supervisor.mjs / UI files
- Scope: **1 new file + 2 modifications (server.js + spec) + 3 handoff artefacts**.

---

## §10 Known gaps (honest flags)

### Gap G1 — Exit code taxonomy incomplete

Claude CLI docs only expose exit codes for `claude auth status` (0/1) and `--max-turns` (error on limit). Other failures (API error, model timeout, rate limit) не pinned к specific exit codes. Adapter classifyCrash uses heuristic over stderr text — same as P2 mock, same confidence. Real-world observations в Phase 2 may refine; adapter option set must remain open to `claudePath` + `env` injection.

### Gap G2 — `--session-id` collision behavior un-tested

Docs say UUID must be valid. Does not say: does claude overwrite existing session or error? Adapter guarantees no collision by generating fresh UUIDs via `crypto.randomUUID()` + internal Map prevents accidental in-memory reuse. Users supplying caller-specific sessionId responsible for uniqueness.

### Gap G3 — Windows `claude.cmd` vs `claude.exe`

Adapter spawns without shell (deterministic arg array). On Windows Node this means direct executable resolution — `.exe` first, `.cmd` shim needs explicit path. If Phase 2 Windows live invoke fails ENOENT — user sets `claudePath: 'C:\\Path\\To\\claude.cmd'` (or similar). Cross-WSL users: spawn expects `claude` on PATH inside spawn context. Not blocked для mock default.

### Gap G4 — `parseCompletionSignal` stream-json heuristic

Plan assumes stream-json events include `type:'result'` + `subtype:'success'` terminal marker. Actual schema depends on Claude Code SDK stream event spec (partially referenced в P2 research §1.4). Heuristic errs safe — only returns completed на explicit marker; false negatives handled by orchestrator (task surfaces via max-iter).

### Gap G5 — attachExisting no-op

P4a ships `attachExisting` as stub `{attached: false}`. Future P5+ may implement via session file read (`~/.claude/<id>.jsonl` discovery). No scope creep в P4a. Research §1.8 OQ-3 unresolved.

### Gap G6 — Real Claude CLI invocation deferred к Phase 2

Phase 1 V-probes use stubbed spawnFn for determinism. Real CLI invocation ≠ Codex's job; user-initiated via Phase 2 P2.3 (explicitly optional). Tradeoff: Phase 1 does not catch real-world Claude behavior drift, но isolating adapter logic от CLI runtime = contractual boundary. Drift surfaces в Phase 2 → feedback loop → P5+ adapter refinement.

### Gap G7 — No adapter-switch UI

DASHBOARD_ADAPTER env is restart-gated. Mid-session flip requires dashboard restart. UI switcher = P5+ scope (`paperclip-pivot-architecture-plan.md` §6 P5+).

### Gap G8 — CLOSED IN P4a (F8 post-R3)

Originally flagged as «orchestrator.stop() не cascade adapter.shutdown() — P5+ refinement». Codex R3 adversarial pushed back: Phase 2 P2.4 «no dangling claude processes» invariant недостижим без wiring → F2 activeSpawns sweep превращается в dead code. Scope upgraded: Change 2.1 adds `await orchestratorAdapter.shutdown({force:false})` в `dashboard/server.js` `shutdown()` function (async), between `orchestrator.stop()` и `supervisor.stop()`. V16 probe проверяет grep presence. G8 resolved внутри P4a, не P5+.

---

## §11 Signature

Planner: Claude
Date: 2026-04-20
Procedure: `claude-plan-creation-procedure.md` v1
Baseline: HEAD=`e884a03`
Input: architecture §6 P4 + P2 contract + P2 research doc + Claude Code CLI reference (WebFetch 2026-04-20)
Status: **audit-clean (Step 2-10 complete, R1+R2 applied inline)** → Step 11 Codex adversarial delivery.
