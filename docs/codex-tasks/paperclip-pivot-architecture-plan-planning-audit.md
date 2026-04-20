# Paperclip Pivot Architecture Plan — Planning Audit

**Plan**: `docs/codex-tasks/paperclip-pivot-architecture-plan.md`
**Planner**: Claude
**Date**: 2026-04-20
**Baseline**: HEAD=`94c6749` (post-cleanup)
**Version**: v1

---

## §0 Meta-procedure

Canonical procedure: `claude-plan-creation-procedure.md` v1 (NO-STOP DISCIPLINE).

Inputs:
- Codex letter `paperclip-style-automation-pivot` (archived 2026-04-20T00:16:29Z) — user direct request через Codex forwarder.
- Reference architecture: `https://github.com/ub3dqy/paperclip` (fetched 2026-04-20).
- Current infrastructure post-cleanup: Phase A+B + `/api/agent/runtime/deliveries` endpoint остаются; Phase C Stop injection + Phase D dedup убраны.
- 10 cross-OS compat rails (inherited from automation cycle).

### Pivot scope (per user request via Codex)

**Deliverable**: **architecture plan**, not executable step-by-step handoff. Plan должен:
1. Определить **что именно заимствуется** из paperclip.
2. Определить **что НЕ заимствуется** (corporate layer).
3. Минимальный rollout по фазам (P1-P5+).
4. Integration стратегия в existing workflow repo (reuse Phase A/B/C infrastructure).
5. Cross-platform: Windows dashboard, Codex WSL, Claude CLI/IDE.
6. Project isolation сохранена (logical + content-level scope из существующей базы).

### Hard constraints

- Не тащить corporate features paperclip (companies, budgets, approvals, org charts, goal alignment).
- Hooks НЕ core — коли нужны, то thin adapter layer.
- Heavy logic в server-side workflow runtime (existing `dashboard/server.js` + supervisor).
- Cross-platform mandatory (rail #1 из automation cycle).
- Project isolation mandatory (rail #3 + spec L304).
- No commit/push без user gate (rule #5).
- Old project isolation open issue — separate follow-up, не часть этого плана.

---

## §1 MCP + Skill selection

| Tool | Purpose | Priority |
|------|---------|----------|
| `WebFetch` | Paperclip repo README + architecture (done; cached для R1) | ✅ done |
| `plan-audit` skill | Step 10 audit loop | mandatory |
| Wiki read | `workflow-hybrid-hook-automation`, `mailbox-auto-pickup-supervisor`, `windows-wsl-process-launcher`, `wsl-windows-native-binding-drift` | for architecture decisions |
| `security-audit` | skip — plan не prod-impacting |

---

## §2 MCP readiness verification

| Probe | Status |
|-------|--------|
| `WebFetch` paperclip | ✅ fetched, architecture extracted |
| `plan-audit` | deferred to Step 10 |
| Wiki (automation hybrid concepts) | ✅ in context |

---

## §3 Files read during planning

| File | Lines | Key findings |
|------|-------|--------------|
| Paperclip README (via WebFetch) | — | Paperclip core = Node server + PostgreSQL + React UI + agent adapter layer + task queue + heartbeat. Corporate layer = org/budgets/goals/governance/multi-company. |
| `dashboard/supervisor.mjs` | 206 | Current always-alive coordinator-lite. Polls mailbox каждые 3s, state = sessions + pendingIndex. Can host task queue + adapter layer additions. |
| `dashboard/server.js` | 305 | Express server, agent-path endpoints. Base для external coordinator expansion. |
| `scripts/mailbox-lib.mjs` | 745 | Mailbox protocol CLI+lib — существующий queue/delivery substrate (message files = tasks). |
| `.claude/settings.local.json` | 32 (post-cleanup) | SessionStart mailbox-status+session-register, Stop session-register only. Heartbeat transport уже здесь. |
| wiki/workflow-hybrid-hook-automation | — | Hybrid hooks decision precedent; affirms thin hook + thick backend pattern that pivot extends. |
| wiki/windows-wsl-process-launcher | — | Cross-platform launcher patterns — pure cmd > PowerShell; relevant для spawn agent processes. |

---

## §4 Official docs fetched

Paperclip README + architecture extraction via WebFetch (R1). No Anthropic/OpenAI docs needed для planning phase (plan = architecture, not code).

---

## §5 AST scans + commands run

| Command | Output |
|---------|--------|
| `git log --oneline -5` | `94c6749 revert(mailbox): remove broken Stop hook delivery` / `e497ef6 Phase C` / `f2e76ee Phase B` / `2fc5325 retrospective R7` / `2927af7 Phase A` |
| `wc -l` dashboard+scripts+settings | supervisor=206, server.js=305, mailbox-lib=745, mailbox.mjs=392, settings=32 |
| `ls agent-mailbox/` | active project inboxes (to-claude/to-codex/archive) |
| `ls mailbox-runtime/` | sessions.json, pending-index.json, supervisor-health.json (Phase A runtime files) |

---

## §6 Empirical tests

Not applicable для architecture plan — no code execution. Feasibility checks будут в per-phase P1-P5+ handoffs.

---

## §7 Assumptions + verification status

| Claim | Evidence | Status |
|-------|----------|--------|
| Paperclip architecture реально основан на Node coordinator + adapter layer | WebFetch R1 | ✅ verified |
| Existing workflow dashboard server.js может стать coordinator | supervisor.mjs уже polls + state, server.js уже Express router | ✅ verified |
| Existing mailbox .md protocol может служить queue substrate | mailbox-lib.mjs send/read/archive/recover — all primitives present | ✅ verified |
| Claude Code можно spawn программно | Per claude.com/claude-code docs + codex CLI docs, existing wiki concepts confirm spawn patterns | ⚠️ need deep research в P2 handoff |
| Codex CLI можно spawn программно из Windows Node server (через WSL) | wiki `windows-wsl-process-launcher` — cmd.exe /c start wsl.exe -d Ubuntu bash -lc "..." proven | ✅ verified |
| Adapter абстракция для разных agents работоспособна | Paperclip precedent + Node child_process.spawn стандарт | ✅ reasoned |
| PostgreSQL не нужен — JSON files достаточны для single-user | Phase A uses atomic writeFile + rename; scale = 1 user, handful проектов | ✅ design decision |
| React UI тяжёлый — наш existing Vite frontend достаточен | current dashboard React + Vite, can extend | ✅ reasoned |

---

## §8 plan-audit skill invocation

### Round 1 — 2026-04-20

Invocation: `Skill({plan-audit})` on plan + audit files. Score: **10/10** ✅.

- Ссылки: 0 ошибок из 10 (baseline files + HEAD + paperclip ref — все verified).
- Rules/rails: rule #2/#5/#8 + rails #1/#3/#4/#5/#7/#8/#10 все explicitly соблюдены; project isolation followup memory acknowledged в §11+§13.
- Blast radius: architectural level — каждая Phase P1-P5+ имеет dedicated blast radius в per-phase handoffs; §9 risks + mitigations comprehensive.
- Полнота: 14 sections покрывают rationale/borrow/skip/reuse/architecture/cross-OS/rollout/integration/constraints/risks/success/out-of-scope/per-phase-commitment/notes/status.
- Реализуемость: paperclip reference precedent + existing workflow infrastructure (A+B+C carry-over) + honest gap flagging (adapter spawn research deferred к P4).

0 findings, ready для Codex adversarial review.

### Round 2 — Codex adversarial review (2026-04-20)

Codex нашёл 3 existentially-important findings + 1 risk:

- **F1 blocker** — architecture plan смешивал 2 execution models (coordinator-owned vs signals-to-live-sessions). Hands-off goal требует coordinator-owned commitment BEFORE P2. Fix: §1.0 explicit primary model decision — coordinator-owned; Phase B session registration + deliveries endpoint downgraded до observability/discovery surface, NOT inject path.
- **F2 important** — P1 task schema thin, state enum too coarse, missing fields. Fix: §6 P1 expanded schema adds `currentAgent`, `nextAgent`, `thread`, `sessionIds {claude, codex}`, `lastInbound/OutboundMessageId`, `stopReason`, `error`, `resolvedAt`. State enum расширен до `pending/launching/awaiting-reply/handing-off/resolved/failed/stopped/max-iter-exceeded`. State machine explicit.
- **F3 blocker** — plan simultaneously claims isolation preserved + defers к post-P4 followup. Honest fix: §8 #3 reformulated — «baseline isolation preserved, no new leak vectors introduced»; existing foreign-session discovery + mailbox agent-path gaps остаются post-P4 per memory. §10 success criteria explicit — not claim «full isolation preserved», только «no regression vs baseline».
- **F4 risk** — mock-first adapter interface risked cementing wrong contract. Fix: §6 P2 renamed «Agent Adapter Contract» — research deliverable added (`paperclip-pivot-adapter-contract-research.md`), interface expanded (+`isAlive`, `attachExisting`, `injectMessage`, `parseCompletionSignal`, `classifyCrash`), P4 downgraded до pure implementation phase. §9 risk table updated.

Все 4 applied inline.

### Round 3 — Codex adversarial review (2026-04-20, post-R2)

Codex нашёл 2 consistency findings:

- **F5 important** — §4 ASCII architecture block Task Queue states всё ещё old coarse enum (pending | in-flight | waiting-reply | done | failed), противоречит canonical model в §6 P1 (expanded 8-state enum). Architecture summary = source of truth для first reader. Fix: §4 block синхронизирован с §6 P1 canonical enum.
- **F6 important** — §10 success criteria переобещал restart story («Coordinator survives restart (tasks persist via JSON runtime)»). §6 P5+ defers auto loop recovery для in-flight tasks. Fix: §10 honest scope — «Task records persist across restart. Auto loop recovery = P5+ — in-flight tasks may need user intervention (marked failed с reason) until P5 implements recovery logic».

Applied inline.

### Round 4 — Codex adversarial review (2026-04-20, post-R3)

Codex: «Re-review clean. Новых findings по architecture plan у меня больше нет. ... Можно показывать пользователю как architecture-level proposal и, если он согласен, переходить к отдельному executable handoff для P1.»

Plan approved. Total rounds: R1 in-session + R2-R4 Codex adversarial (F1-F6 applied inline). Ready для user review + decision.

**Deliverable type**: architecture plan ≠ executable handoff. После user approval, Phase P1 = first executable cycle (separate 11-step handoff).

---

## §9 Delta from prior architecture

**Before (hook-centric design)**:
- A: dashboard visibility
- B: session registration via hooks
- C: Stop hook delivery (BROKEN — reverted)
- D: dedup layer (NEVER committed — discarded)

**After (paperclip-light coordinator)**:
- Keep: A+B infrastructure + Phase C endpoint (`/api/agent/runtime/deliveries`).
- Add: coordinator loop layer — task queue + agent adapter + cycle orchestration.
- Shift: hooks remain только as heartbeat/discovery, не как inject path.
- SessionStart mailbox-status.mjs — existing working inject path; coordinator может enhance через additionalContext.

**Removed from scope**:
- PostgreSQL / embedded DB — reuse JSON runtime.
- Corporate layer (org/budgets/goals/governance/multi-company).
- Heavy React UI — extend existing dashboard incrementally.

---

## §10 Known gaps (honest flags)

### Gap G1 — Paperclip deeper mechanics not yet extracted

WebFetch R1 = README level. Actual adapter interface, heartbeat protocol, task schema — requires read actual repo code в P1-P2 handoffs. Current architecture plan работает на README-level precedent, детали refine per phase.

### Gap G2 — Agent spawn mechanism per agent type

Claude Code spawn from Node: доступны ли IPC / CLI args / stdin injection? Codex CLI spawn: WSL process chain. Neither formally specified здесь — per-phase detail.

### Gap G3 — Resume vs new session decision

Paperclip sessions «resume same context across heartbeats» (per README). Our Claude Code/Codex sessions имеют session_id + transcript_path — можно ли resume программно? Phase B existing session-register tracks, но не resumes. Research task для P3-P4.

### Gap G4 — Loop break conditions

Paperclip uses «budget enforcement» + «governance gates». Мы не делаем budgets. Break conditions для цикла Codex↔Claude:
- Thread resolution (answered/no-reply-needed/superseded) — existing mailbox invariant.
- Max iterations / timeout safety.
- User Stop button.
Details per phase.

### Gap G5 — Concurrency / multi-project

Coordinator обрабатывает multiple projects simultaneously? Single event loop OK для low-QPS user load. Scope choice per phase.

### Gap G6 — Project isolation в queue layer

Existing invariants (spec L304 mandatory project + `/api/agent/*` validation) сохраняются. Queue must не leak tasks across projects. Design carry-over.

### Gap G7 — Old project isolation follow-up

Per existing project memory `project_isolation_open_followup.md` — full isolation не закрыта. Phase-after-paperclip follow-up. Не часть этого плана.

---

## §11 Signature

Planner: Claude
Date: 2026-04-20
Procedure: `claude-plan-creation-procedure.md` v1
Baseline: HEAD=`94c6749`
Input: paperclip pivot request (Codex letter) + paperclip repo (WebFetch) + existing A+B+C infrastructure
Status: **skeleton (Step 2 complete)** → Steps 3-11 proceeding per NO-STOP DISCIPLINE
