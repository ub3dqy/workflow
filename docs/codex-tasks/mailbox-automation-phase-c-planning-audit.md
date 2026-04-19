# Mailbox Automation Phase C — Planning Audit

**Plan**: `docs/codex-tasks/mailbox-automation-phase-c.md`
**Report template**: `docs/codex-tasks/mailbox-automation-phase-c-report.md`
**Planner**: Claude
**Date**: 2026-04-19
**Baseline**: HEAD=`f2e76ee`
**Version**: v1

---

## §0 Meta-procedure

Canonical procedure: `claude-plan-creation-procedure.md` v1 (NO-STOP DISCIPLINE enforced).

Inputs:
- `docs/codex-tasks/mailbox-auto-pickup-supervisor-tz.md` — Phase C «Delivery signal» section.
- `workflow-automation-compat-requirements` — 10 cross-OS compat rails.
- Phase A commit `2927af7` (supervisor + runtime-state).
- Phase B commit `f2e76ee` (SessionStart/Stop session registration hooks).

### Phase C scope (per ТЗ §«Rollout → Phase C»)

**Добавить:**
- Supervisor-generated delivery records — matching active session(agent, project) ↔ pendingIndex(to, project).
- `GET /api/agent/runtime/deliveries?session_id=X` — scoped response (filter pendingIndex entries with agent AND project match).
- NEW Claude Stop hook script `mailbox-stop-delivery.mjs` — fetches deliveries for session, injects «Есть новое письмо по project X. Проверь почту.» через stdout JSON `hookSpecificOutput.additionalContext`.
- NO auto-read / auto-reply. NO read-on-signal.

**Без:**
- Claiming / lease / expiration — Phase D.
- Multi-window protection — Phase D.
- UserPromptSubmit (rail #8).
- Codex hooks Linux/WSL (separate handoff).
- Codex Windows native (degraded per Phase A §9.3).

**Цель**: agent в end-of-turn узнаёт о pending mail по его project без manual polling.

---

## §1 MCP + Skill selection

| Tool | Purpose | Priority |
|------|---------|----------|
| `WebFetch` | Claude Code Stop hook stdout injection schema | ✅ fetched Phase B (reuse) |
| `plan-audit` skill | Step 10 audit loop | mandatory |
| Existing code reuse | `supervisor.mjs` state/router, `mailbox-session-register.mjs` CLI arg + stdin patterns | reuse |

---

## §2 MCP readiness verification

| Probe | Status |
|-------|--------|
| Claude Code hooks docs (cached R1 Phase B) | ✅ — Stop stdin includes session_id; stdout JSON allowed ≠ decision block |
| `plan-audit` skill | deferred to Step 10 |

---

## §3 Files read during planning

| File | Lines | Key findings |
|------|-------|--------------|
| `dashboard/supervisor.mjs` | 206 | `state.sessions` Map, `state.pendingIndex` array with `{relativePath, to, from, project, projectMissing, deliverable, thread, created, received_at}`. Need: new endpoint GET `/deliveries?session_id=X` — filter pendingIndex entries where `deliverable === true && to === session.agent && project === session.project`. |
| `dashboard/server.js` | 249 | `/api/runtime` mount is supervisor.router. Add endpoint там же — server.js не меняется. |
| `scripts/mailbox-session-register.mjs` | 135 | Patterns reused для new script: `readStdin`, `parseProjectArg`, `postWithTimeout` style. |
| `.claude/settings.local.json` | 32 | Stop block has 1 entry (session-register). Add 2nd entry (stop-delivery). |
| `local-claude-codex-mailbox-workflow.md` | 864 | Phase B section added. Need: append Phase C section after it. |
| Claude Code hooks docs (cached) | — | Stop stdout JSON: `{decision?, reason?, hookSpecificOutput:{hookEventName, additionalContext}}`. `decision` omit → allow stop. `additionalContext` — текст injected в transcript. Use это для «проверь почту» inject. |

---

## §4 Official docs fetched

Reuse Phase B WebFetch — Claude Code Stop hook stdout schema already documented.

---

## §5 AST scans + commands run

| Command | Output |
|---------|--------|
| `wc -l` | supervisor=206, server.js=249, App.jsx=1781, session-register=135, settings.local.json=32, spec=864 |
| `git log --oneline -3` | `f2e76ee feat(mailbox): Phase B` / `2fc5325 docs(codex-tasks): retrospective R7` / `2927af7 feat(dashboard): Phase A` |
| grep existing routes | `/state`, `POST /sessions`, `DELETE /sessions/:id` в supervisor.mjs — `/deliveries` новый prefix |

---

## §6 Empirical tests (Phase B dependency check)

| Test | Expected | Actual |
|------|----------|--------|
| E1 — supervisor state has sessions + pendingIndex после Phase B | Both populated per live probe | ✅ verified via curl http://127.0.0.1:3003/api/runtime/state in session |
| E2 — Stop hook can emit JSON к stdout для additionalContext | docs confirm | ✅ official Claude Code hooks docs |
| E3 — Same-session idempotent registration via POST /sessions | verified Phase B V6c heartbeat | ✅ |

---

## §7 Assumptions + verification status

| Claim | Evidence | Status |
|-------|----------|--------|
| Stop stdin содержит session_id | Claude Code hooks docs (WebFetch Phase B R1) | ✅ verified |
| Stop hook stdout JSON `hookSpecificOutput.additionalContext` injects в transcript | docs | ✅ verified |
| supervisor pendingIndex carries project + deliverable flags (rail #3) | supervisor.mjs L158-171 post-Phase A | ✅ verified |
| GET /deliveries можно реализовать без state machine (stateless filter) | Phase C scope — no claiming yet | ✅ design choice |
| Agent мессаж format «Есть новое письмо по project X. Проверь почту.» acceptable | ТЗ §Phase C explicit example | ✅ ТЗ-mandated |
| Stop hook timeout 5s enough для localhost GET | Phase B session-register uses 3s POST timeout | ✅ adequate |
| Silent fail if supervisor down — Stop hook exits 0 без injection | rail graceful degradation | ✅ required |

---

## §8 plan-audit skill invocation

### Round 1 — 2026-04-19

Invocation: `Skill({plan-audit})` on plan + audit files.

- Score: **10/10** ✅.
- Ссылки: 0 ошибок из 8 проверенных (baseline 206/249/135/32/864 совпадает, все supervisor symbols L11/L36/L43/L48/L70/L82/L98/L125/L173 verified).
- Правила: rule #2/#5/#8 соблюдены, rails #3/#4/#8/#9 явно enforced.
- Blast radius: tight — existing endpoints untouched, route prefix unique.
- Полнота: pre-flight + V1-V10 (4 sub-probes V7 + end-to-end V8) + Phase 2+3 + rollback + §11 discrepancies + §12 13-point self-audit.
- Реализуемость: stateless design simplest, silent-fail pattern reused из Phase B.

0 findings, ready to deliver to Codex adversarial review.

### Round 2 — Codex adversarial review (2026-04-19)

Codex нашёл 2 findings:

- **F1 blocker** — rail #9 «agent-path» заявлен, но target путь `/api/runtime/deliveries` — global supervisor router. Knowing session_id (exposed в `/state`) достаточно чтобы достать чужие scoped deliveries. Fix: endpoint переехал на `/api/agent/runtime/deliveries` под existing agentRouter. Добавлен mandatory `project` query param + server-side validation `session.project === query.project` (403 mismatch). Форджинг session_id недостаточен — caller должен ALSO match stored project.
- **F2 important** — V7c проверял only «payload clean for same session», не закрывал «foreign session_id не достаёт чужие deliveries». Fix: V7 расширен до 6 sub-probes (V7a missing session_id, V7b missing project, V7c unknown session, V7d session exists but project mismatch → 403, V7e legit scoped fetch, V7f long expire).

Additionally applied:
- Change 1 перенесён на server.js (supervisor.mjs NO CHANGE — whitelist обновлён)
- Change 2 script теперь принимает `--project` CLI flag (analog session-register)
- Change 3 settings.local.json: stop-delivery command добавлен `--project workflow`
- Self-audit §12 расширен до 14 items (added #14 accidental-mismatch protection; honest scope noted in R3)
- Report synchronized end-to-end

### Round 3 — Codex adversarial review (2026-04-19, post-R2)

- **F3 blocker** — R2 rail #9 «cross-session leak closed» claim overstated. Global `/api/runtime/state` всё ещё exposes все sessions (session_id + project) для dashboard UI (rail #2). Attacker знающий one session может pair'ить `{session_id, project}` любой foreign session and legitimately GET `/deliveries`. Fix (honest weakening): wording везде переписано «accidental-mismatch protection» (hook script с неправильным --project flag); НЕ foreign-session discovery защита. Single-user localhost trust model acknowledged в §0 Rail #9 + Change 1 Rationale + §6 Change 4 spec text + V7d label + self-audit #14. Phase C остаётся useful для logical agent-path separation + config-error catching.
- **F4 important** — V8b допускал PASS-noop, core happy-path (non-empty deliveries → stdout injection JSON) мог не verified в Phase 1. Fix: V8b переделан на **deterministic fixture** flow. `node scripts/mailbox.mjs send ...` создаёт pending message через public CLI (не programmatic mailbox edit), `sleep 4` ждёт supervisor pollTick (3s interval + margin), script вызывается с `--project workflow`, stdout validated на valid JSON + project=workflow reference. Cleanup через `mailbox.mjs archive` (public CLI). PASS-noop больше не acceptable.

### Round 4 — Codex adversarial review (2026-04-19, post-R3)

- **F5 important** — stale «cross-session leak closed» references после R3 honest weakening:
  - Plan Change 1 intro «Это закрывает cross-session leak» — переписан на honest scope + single-user localhost note.
  - Plan §8 acceptance ссылался на V7c (unknown session probe) вместо V7d (mismatch) + V7e (content no-leak).
  - Plan §14 commit strategy «cross-session leak closed» — переписан.
  - Report Change 1 checklist «cross-session leak closed» — переписан.
- **F6 important** — stale V8/scope text:
  - Plan §13 Notes «V8 может PASS-noop» — post-F4 deterministic fixture требуется; переписан.
  - Planning-audit §9 Delta «1 new endpoint (inside supervisor.mjs)» — post-F1 handler живёт в server.js agentRouter; supervisor.mjs NO CHANGE. Updated.

All 4 F5 + 2 F6 sites fixed inline. Handoff text internally consistent.

### Round 5 — Codex adversarial review (2026-04-19, post-R4)

Codex: «Re-review clean. Новых реальных findings больше нет. ... plan pair + report template теперь execution-ready.»

Plan approved. Total rounds: R1 in-session + R2-R5 Codex adversarial (F1-F6 addressed inline). Ready для execution delivery.

---

## §9 Delta from Phase B

- Phase B delivered: session registration via POST /sessions + auto-expire TTL.
- Phase C adds:
  - supervisor GET /deliveries endpoint (filter pendingIndex by session's agent+project)
  - NEW Stop hook script calling /deliveries + stdout JSON injection
  - Claude settings — Stop block gets 2nd entry
  - Spec update — Phase C section
- NO frontend changes (dashboard runtime panel остаётся как visibility tool; delivery signals — agent-facing, не user-facing)
- NO changes к Phase B script (session-register stays as-is)

Scope: **1 new file + 3 modifications (server.js + settings.local.json + spec)** + 1 new endpoint (внутри existing agentRouter в server.js; supervisor.mjs NO CHANGE post-R2 fix). Mid-scope delta.

---

## §10 Known gaps (honest flags)

### Gap G1 — No delivery claim tracking

Supervisor `/deliveries` — stateless filter. Agent получает список pending каждый Stop без tracking «уже signaled». Два последовательных Stop hooks видят один и тот же список (если message не archived/received). Agent может увидеть «есть письма» дважды — acceptable в Phase C (signal = hint, not execution). Real deduplication — Phase D lease.

### Gap G2 — Multi-window double-signal

Если agent запущен в 2 Claude Code сессиях в том же project, обе увидят тот же delivery на Stop. Acceptable в Phase C — это только hint. Phase D lease prevents dual claim.

### Gap G3 — Agent project determined via session registration; если session регистрация failed (dashboard was down), agent не получит delivery. Acceptable — graceful degradation: agent работает нормально без automation.

### Gap G4 — Projectless pending messages

Phase B flags `projectMissing: true, deliverable: false`. `/deliveries` filter excludes `deliverable === false`. Legacy/broken messages не попадают agent'у — visible только в dashboard global view (Phase A visibility).

### Gap G5 — Codex hooks Linux/WSL

Phase C = Claude only. Codex Linux/WSL could в принципе reuse same `/deliveries` endpoint (agent-agnostic), но отдельный handoff когда Codex hooks ship.

### Gap G6 — 60s TTL vs Claude Code idle turns

Phase B defers между turns могут быть больше 60s. Session expires → delivery fetch для expired session returns empty (session.project unknown). Acceptable для Phase C; Phase D может revisit TTL tuning или session resume logic.

---

## §11 Signature

Planner: Claude
Date: 2026-04-19
Procedure: `claude-plan-creation-procedure.md` v1
Baseline: HEAD=`f2e76ee`
Input: Phase A (commit `2927af7`) + Phase B (commit `f2e76ee`) + ТЗ §«Phase C: Delivery signal»
Status: **skeleton (Step 2 complete)** → Steps 3-11 proceeding per NO-STOP DISCIPLINE
