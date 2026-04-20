# Paperclip P2 — Adapter Contract + Mock — Planning Audit

**Plan**: `docs/codex-tasks/paperclip-p2-adapter-contract.md`
**Research**: `docs/codex-tasks/paperclip-pivot-adapter-contract-research.md`
**Report template**: `docs/codex-tasks/paperclip-p2-adapter-contract-report.md`
**Architecture parent**: approved R4 (`paperclip-pivot-architecture-plan.md`)
**P1 parent**: commit `f3d065d` (task queue)
**Planner**: Claude
**Date**: 2026-04-20
**Baseline**: HEAD=`f3d065d`
**Version**: v1

---

## §0 Meta-procedure

Canonical procedure: `claude-plan-creation-procedure.md` v1 (NO-STOP DISCIPLINE).

Inputs:
- Architecture §6 P2 scope (expanded post-F4): research + mock, contract-shaping BEFORE real implementation.
- Claude Code CLI docs (WebFetch): `-p` print mode, `--session-id`, `--output-format json`, `-r`/`-c` resume, `--max-turns`, stdin piping.
- Codex CLI docs (partial): `approval_policy: never` for batch mode; command-line reference incomplete — flagged в research doc.
- Wiki: `windows-wsl-process-launcher`, `wsl-windows-native-binding-drift` для process spawn gotchas.

### P2 scope

**Deliverables**:
1. Research doc `paperclip-pivot-adapter-contract-research.md` — Claude Code + Codex CLI primitives, process lifecycle, gotchas, gap flags.
2. Contract file `scripts/adapters/agent-adapter.mjs` — interface (JSDoc-documented functions with shape contracts, но no logic — это contract, не implementation).
3. Mock implementation `scripts/adapters/mock-adapter.mjs` — full 8-method interface, in-memory state recording.
4. Spec update — Adapter Contract section в `local-claude-codex-mailbox-workflow.md`.

**Out of scope** (future phases):
- Orchestrator integration (P3).
- Real ClaudeCodeAdapter / CodexAdapter implementations (P4).
- Restart recovery (P5+).

---

## §1 MCP + Skill selection

| Tool | Purpose | Priority |
|------|---------|----------|
| `WebFetch` | Claude Code CLI docs | ✅ done (R1 above) |
| `WebFetch` | Codex CLI reference — partial extraction | ⚠️ gap flagged |
| `plan-audit` skill | Step 10 | mandatory |
| Wiki reads | windows-wsl-process-launcher, wsl-windows-native-binding-drift | context inline |

---

## §2 MCP readiness verification

| Probe | Status |
|-------|--------|
| Claude Code CLI docs | ✅ verified — `-p`, `--session-id`, `--output-format`, `-r`, `-c`, `--max-turns` all documented |
| Codex CLI reference | ⚠️ partial — approval_policy: never для batch, но full flag list не extracted; research doc flags this as open question + predлагает live probe в P4 |
| `plan-audit` skill | deferred Step 10 |

---

## §3 Files read during planning

| File | Lines | Key findings |
|------|-------|--------------|
| Architecture §6 P2 (post-F4) | — | Interface list: launch, resume, shutdown, isAlive, attachExisting, injectMessage, parseCompletionSignal, classifyCrash |
| Claude Code CLI docs (WebFetch) | — | `claude -p "prompt"` headless; `--session-id UUID`; `--output-format json` для structured parsing; `-r` resume; stdin piping works |
| Codex CLI config (WebFetch) | — | approval_policy=never для batch; command-line reference at /codex/cli/reference (не fully extracted — gap для P4 live testing) |
| Wiki `windows-wsl-process-launcher` | — | Pure cmd.exe + wsl.exe pattern; quoting chains fragile; port readiness > process existence |
| Wiki `wsl-windows-native-binding-drift` | — | Shared node_modules breaks native bindings cross-OS; launcher guard pattern |
| `scripts/mailbox-session-register.mjs` (Phase B) | 135 | Pattern reference для child_process spawn lifecycle (similar concerns) |

No modifications yet в scripts/adapters/ (directory будет создана).

---

## §4 Official docs fetched

- Claude Code CLI reference (`https://code.claude.com/docs/en/cli`) — comprehensive flag list.
- Codex CLI config reference (`https://developers.openai.com/codex/config-reference`) — config primitives; CLI flag reference at `/codex/cli/reference` partially unexplored (P2 research doc notes this + предлагает live probe при P4 implementation).

---

## §5 AST scans + commands run

| Command | Output |
|---------|--------|
| `ls scripts/` | `mailbox-lib.mjs, mailbox.mjs, mailbox-session-register.mjs, mailbox-status.mjs` — `adapters/` dir будет new |
| `git log --oneline -3` | `f3d065d paperclip pivot P1` / `94c6749 revert Stop hook` / `e497ef6 Phase C` |
| `wc -l scripts/mailbox-session-register.mjs` | 135 |

---

## §6 Empirical tests

Not applicable для P2 planning — mock behavior verified в V-phase (§7 plan). Real spawn empirical в P4.

---

## §7 Assumptions + verification status

| Claim | Evidence | Status |
|-------|----------|--------|
| Claude Code `-p` print mode supports initial prompt | WebFetch R1 table confirms | ✅ verified |
| Claude Code `--session-id UUID` allows programmatic session ID control | WebFetch R1 table confirms | ✅ verified |
| Claude Code `-r sessionId query` resumes session | WebFetch R1 table confirms | ✅ verified |
| Claude Code `--output-format json` gives structured output | WebFetch R1 table confirms | ✅ verified |
| Codex CLI supports batch/non-interactive mode | approval_policy=never documented | ✅ verified |
| Codex CLI exact flag для initial prompt | partial — /codex/cli/reference not fully extracted | ⚠️ gap — research doc §«Codex Open Questions» |
| Codex CLI session resume semantics | not documented в extracted portion | ⚠️ gap |
| Mock adapter может stub full 8-method interface в memory без spawn | трivial — standard Node pattern | ✅ reasoned |
| Interface shape finalization sufficient для P3 orchestrator wiring | contract lock after Codex review — per architecture F4 commitment | ✅ design-mandated |

---

## §8 plan-audit skill invocation

### Round 1 — 2026-04-20

Invocation: `Skill({plan-audit})` on plan + audit files. Score: **10/10** ✅.

- Ссылки: 0/13 errors (baseline files + HEAD + research doc + scripts/ dir state + crypto + mock self-consistency all verified).
- Rules/rails: all соблюдены; architecture §1.0 coordinator-owned + §6 P2 F4 contract-first fixed honored.
- Blast radius: tight — new scripts/adapters/ dir, no changes к P1 infra, future-safe для P3 orchestrator import.
- Полнота: pre-flight P1-P5 + V1-V12 (+V7b + V7c added post-R2) = 14 total checks (включая 5-probe classifyCrash + 8-method validateAdapter + session-collision + injectMessage fallback) + Phase 2/3 minimal + rollback + discrepancy 11 + self-audit 12-item.
- Реализуемость: pure Node + crypto stdlib + child_process patterns known from Phase A-C; mock в-памяти trivial; research doc Claude CLI verified + Codex gaps honestly flagged для P4.

0 findings, ready для Codex adversarial review.

### Round 2 — Codex adversarial review (2026-04-20)

Codex нашёл 2 important findings:

- **F1** — `injectMessage` contract required only `processHandle` но research doc (§§3.1+8 invariants) заявлял sessionId как primary persistent identifier. После restart/attachExisting=false у P3 был sessionId но не processHandle → injectMessage unusable в exactly тех scenarios, где research doc указывает на primacy sessionId. Fix: InjectMessageArgs типdef расширен — either processHandle OR sessionId. Mock injectMessage accepts optional sessionId, falls back через resume(sessionId) если processHandle lost. Research §4 typedef updated. V7c probe added.
- **F2** — Mock launch() silently reuses non-terminated sessionId без проверки project/thread/instruction match → может скрыть relaunch-different-task-under-same-sessionId bugs в P3 testing. Fix: Mock launch проверяет existing entry args против incoming launch args; на mismatch throws `session-collision: sessionId X already live with different launch args`. V7b probe added.

Applied inline. V table expanded from 12 к 14 items (V7b + V7c added).

### Round 3 — Codex adversarial review (2026-04-20, post-R2)

Codex нашёл 1 medium finding:

- **F3** — V table expanded 12 → 14 checks (V7b+V7c), но stale `V1-V12` references остались в нескольких местах: plan §8 acceptance + §11 STOP + §12 self-audit (6/7 lines), audit §8 summary, report §2 header + self-audit + acceptance. Execution/acceptance bookkeeping confusion. Fix: все occurrences `V1-V12` → `V1-V12 (+V7b + V7c)`, report §2 добавил placeholders для V7b + V7c sub-sections.

### Round 4 — Codex adversarial review (2026-04-20, post-R3)

Codex: «Re-review clean. Новых findings по P2 plan у меня больше нет.»

Plan approved. Total rounds: R1 in-session + R2-R4 Codex adversarial (F1-F3 applied inline). Ready для execution delivery.

---

## §9 Delta from P1

- P1 delivered: storage + CRUD + read-only UI.
- P2 adds: adapter interface contract + mock + research doc + spec section.
- Scope: **3 new files** (contract, mock, research doc) + **1 modification** (spec) + **new directory** `scripts/adapters/`.
- NO changes to P1 supervisor/server/api.js/App.jsx — orchestrator integration = P3.
- NO real adapter implementations — P4.

Tight scope: contract + mock + research. Codex's review focus = interface completeness для future agents.

---

## §10 Known gaps (honest flags)

### Gap G1 — Codex CLI flag details

WebFetch extracted config reference but not full command-line options. Research doc flags as «Codex Open Questions» — actual flag confirmation требует live probe при P4 adapter implementation.

### Gap G2 — Claude Code stdin injection for mid-session messages

`injectMessage` — architecture interface method. Claude Code не supports writing к running session's stdin programmatically (per docs: `-p` starts fresh, `-r` resumes with new query — но нет mid-stream inject without relaunch). Research doc acknowledges это + предлагает `resume()` как primary message delivery mechanism; `injectMessage` может оказаться degenerate case or warrant removal в future phases.

### Gap G3 — Cross-OS process handle serialization

processHandle — in-memory Node ChildProcess object. Не serializable в JSON для coordinator restart recovery. Acceptable в P2 (mock holds in-memory); P5+ recovery will rely на sessionId (persistent) instead of processHandle.

### Gap G4 — Completion signal heuristics

`parseCompletionSignal({recentOutput})` — heuristic. Claude Code `--output-format json` gives structured signals (turn boundary, tool calls). Codex CLI — unknown (gap G1). Research doc lists candidate heuristics с flagged confidence.

### Gap G5 — classifyCrash categories

5 categories proposed: env / auth / timeout / agent-error / unknown. Derived from common failure modes observed в Phase A-C + mailbox workflow. Not exhaustive — P4 may discover additional. Contract extensible через new category value (non-breaking).

### Gap G6 — Mock determinism

Mock returns preset responses. Real adapters are non-deterministic. Mock contract doesn't include randomness simulation. P3 orchestrator tests should be deterministic на mock, но real P4 tests will need retry/flakiness tolerance.

---

## §11 Signature

Planner: Claude
Date: 2026-04-20
Procedure: `claude-plan-creation-procedure.md` v1
Baseline: HEAD=`f3d065d`
Input: architecture §6 P2 (post-F4 expanded) + Claude Code CLI docs + Codex config docs (partial)
Status: **skeleton (Step 2 complete)** → Steps 3-11 proceeding per NO-STOP DISCIPLINE
