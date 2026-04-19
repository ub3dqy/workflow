# Mailbox Automation Phase B — Planning Audit

**Plan**: `docs/codex-tasks/mailbox-automation-phase-b.md`
**Report template**: `docs/codex-tasks/mailbox-automation-phase-b-report.md`
**Planner**: Claude
**Date**: 2026-04-19
**Baseline**: HEAD=`2fc5325`
**Version**: v1

---

## §0 Meta-procedure

Canonical procedure: `claude-plan-creation-procedure.md` v1 (NO-STOP DISCIPLINE enforced).

Input context:
- `docs/codex-tasks/mailbox-auto-pickup-supervisor-tz.md` — Phase B из 4-phase rollout.
- `workflow-automation-compat-requirements` (archived) — 10 cross-OS compat rails.
- Phase A delivered в commit `2927af7` (supervisor + runtime-state + dashboard panel).

### Phase B scope (per ТЗ §«Rollout → Phase B»)

**Добавить только:**
- `SessionStart` registration (session binds to supervisor via POST /api/runtime/sessions)
- `Stop` heartbeat (refresh last_seen via POST /api/runtime/sessions)
- `SessionStart` backlog summary (already exists via `scripts/mailbox-status.mjs`)

**Без** automatic continuation prompt — delivery signal = Phase C.
**Без** lease/claim — Phase D.
**Без** UserPromptSubmit (rail #8 + TZ explicit).

Цель Phase B: session discovery стабильна, supervisor знает какие agents активны по какому project.

---

## §1 MCP + Skill selection

| Tool | Purpose | Priority |
|------|---------|----------|
| `WebFetch` | Claude Code hooks docs (SessionStart/Stop stdin/stdout, settings.json) | ✅ done (Step 5) |
| `plan-audit` skill | Step 10 audit loop | mandatory |
| Existing code reuse | `scripts/mailbox-status.mjs` (cwd normalization, findProjectRoot, project detection) | reuse patterns |
| `security-audit` | low (localhost-only API, no auth; hook talks to 127.0.0.1) | skip |

---

## §2 MCP readiness verification

| Probe | Status |
|-------|--------|
| `WebFetch` Claude Code hooks docs | ✅ fetched (stdin schema + settings.json format + timeouts) |
| `plan-audit` | deferred to Step 10 |
| Wiki reads | ✅ (windows-wsl-process-launcher — polling over watch, mailbox-project-isolation — agent scope) |

---

## §3 Files read during planning

| File | Lines | Key findings |
|------|-------|--------------|
| `scripts/mailbox-status.mjs` | 263 | Existing SessionStart hook. Reuses: `readStdin()`, `toHostPath()` (cross-OS path mapping WSL↔Windows), `findProjectRoot()` (walks up to find agent-mailbox/), `inferProjectFromCwd()` (basename), `normalizeProject()`. Stdin JSON schema confirmed. Stdout: `{hookSpecificOutput:{hookEventName,additionalContext}}`. exit 0. |
| `.claude/settings.local.json` | 16 | Registered hook `SessionStart` → `node "$CLAUDE_PROJECT_DIR/scripts/mailbox-status.mjs"` timeout 3. Format matches docs. |
| `dashboard/supervisor.mjs` | 206 (post-`2927af7`) | POST /sessions accepts: session_id, agent, project, cwd, transport, platform. Validates: truthy + agent ∈ {claude,codex} + normalizeProject. Returns 201. DELETE /sessions/:id → 204. |
| `dashboard/server.js` | 247 (post-`2927af7`) | Supervisor mounted on /api/runtime. Host=127.0.0.1:3003. |
| Claude Code hooks docs | — | SessionStart stdin: session_id, transcript_path, cwd, hook_event_name, source (startup/resume/clear/compact), model. Stop stdin: session_id, transcript_path, cwd, permission_mode, hook_event_name. Timeout default 600s command. |

---

## §4 Official docs fetched

- **Claude Code hooks** (`https://code.claude.com/docs/en/hooks`) — SessionStart + Stop stdin/stdout + settings.json + timeout ranges.
- **Node http/fetch** — reuse Node 18+ global `fetch()` для POST (no external dep).

---

## §5 AST scans + commands run

| Command | Output |
|---------|--------|
| `ls scripts/` | `mailbox.mjs mailbox-lib.mjs mailbox-status.mjs` — Phase B добавит `mailbox-session-register.mjs` |
| `git log --oneline -3` | `2fc5325 docs(codex-tasks): retrospective R7` / `2927af7 feat(dashboard): mailbox automation compat — Phase A` / `458552b ci:` |
| `grep SessionStart .claude/settings.local.json` | 1 entry pointing к mailbox-status.mjs |

---

## §6 Empirical tests (Phase A dependency check)

| Test | Expected | Actual |
|------|----------|--------|
| E1 — /api/runtime/sessions POST via curl | 201 + session record | ✅ P2.4 PASS (Phase A Phase 2) |
| E2 — /api/runtime/sessions DELETE /:id | 200 ok:true | expected per supervisor.mjs:98-113 |
| E3 — hook script cwd read via stdin | mailbox-status.mjs pattern confirmed | ✅ existing infra |

---

## §7 Assumptions + verification status

| Claim | Evidence | Status |
|-------|----------|--------|
| SessionStart stdin содержит `session_id` | Claude Code docs (WebFetch R1) | ✅ verified |
| Stop stdin содержит `session_id` + cwd | Claude Code docs | ✅ verified |
| POST /api/runtime/sessions accepts Phase B payload shape | supervisor.mjs L48-96 | ✅ verified |
| Node 18+ `fetch()` available в hook script env | Node 24.14.1 (Codex) / 24.13 (Claude) per Phase A P1 baseline | ✅ verified |
| Hook timeout 3s enough for POST на localhost | existing mailbox-status.mjs uses 3s для file I/O | ⚠️ increase to 5s для POST safety |
| transport="claude-hooks" is agreed naming | default in supervisor.mjs validation | ✅ accepted |
| Codex hooks на Windows — degraded (rail #7) | OpenAI Codex hooks Windows disabled | ✅ documented §9.3 (inherited from Phase A) |
| Silent fail on server down — hook exits 0 без error context | TZ requirement: "graceful degradation: если supervisor down, агентская сессия не должна ломаться" | ✅ design-mandated |

---

## §8 plan-audit skill invocation

### Round 1 — 2026-04-19

Invocation: `Skill({plan-audit})` on plan + audit files. Score: **9/10** 🟡.

- **F1** (important) — Change 1 `detectPlatform()` contained dead code: `const release = typeof process.release === "object" ? "" : ""` (обе ветви ternary = `""`, unused variable). Также unnecessary `try {} catch {}` вокруг `process.env.*` access. Fix: упрощён до чистого if-chain — `if (WSL_DISTRO_NAME || WSL_INTEROP) return "wsl"; else return "linux"`.
- **F2** (important) — Baseline line counts drift: plan §4 P2 expected `mailbox-status.mjs=263, server.js=247`, actual `262, 249` (drift 1-2 lines, within ±5 tolerance but sloppy). Fix: updated plan + report P2 values.

### Round 2 — 2026-04-19

Re-verify. Score: **10/10** ✅. 0 new findings. Ready для Codex adversarial review.

### Round 3 — Codex adversarial review (2026-04-19)

Codex поймал 3 blocker:

- **F3 blocker** — Plan Change 1 использовал cwd-based project detection (`findProjectRoot + inferProjectFromCwd`), что напрямую нарушает spec L306 («project для agent session = explicit bound project через CLI flag или API param, никогда не cwd»). Это отменяет isolation fix из commit `01ed432`. Fix: script now accepts `--project <name>` CLI flag ONLY. No cwd-derivation. Missing flag → silent exit 0 (opt-in per-repo).
- **F4 blocker** — Original cwd-walk algorithm работал бы только для workflow repo pilot. В любой Claude session вне workflow агент silently exits без регистрации. Fix subsumed by F3 — теперь scope = explicit per-repo opt-in via settings.local.json command flag.
- **F5 important** — V6 тестировал только initial create. Нет heartbeat verification. Fix: V6 расширен до 3 sub-probes:
  - V6a: no `--project` flag → silent exit, no registration (new scope enforcement)
  - V6b: with flag → initial create (original test)
  - V6c: 2nd POST same session_id → last_seen refreshes, single record (no duplicate)

settings.local.json command updated: `node "$CLAUDE_PROJECT_DIR/scripts/mailbox-session-register.mjs" --project workflow` в обеих SessionStart и Stop entries.

### Round 4 — Codex adversarial review (2026-04-19, post-R3)

- **F6 blocker** — Change 3 spec-target snippet всё ещё содержал строку «Project выводится из `findProjectRoot` (walk up до `agent-mailbox/`) + `basename`» (plan line 421). После F3/F4 fix это противоречит actual Change 1 behaviour + spec L306. Executor verbatim copy-paste внёс бы в spec неверное описание. Fix: переписано — «Project приходит только из explicit `--project <name>` CLI flag, per-repo opt-in; missing flag → silent exit».
- **F7 stale** — §13 Notes to Codex советовало reuse `toHostPath/findProjectRoot/normalizeProject` patterns из mailbox-status.mjs. После F3/F4 `findProjectRoot`/`inferProjectFromCwd` removed from Change 1. Fix: переписано на «только `toHostPath` + `normalizeProject`; findProjectRoot не используется».

### Round 6 — Execution V7 plan-gap fix (2026-04-19, post-Codex Phase 1)

Codex Phase 1: V1-V6, V8, V9 PASS; V7 partial FAIL. Не code bug — plan verification gap. После F3/F4 fix script требует explicit `--project` flag; V7 fenced command запускал script без flag → script exits 0 до POST attempt → stderr warning не fires, даже если dashboard down.

- **F8** — V7 fenced command не синхронизирован с F3/F4 script signature. Fix: добавлен `--project workflow` во V7 command + expected логика переделана — silent-fail invariant = exit 0 всегда, stderr warning условен от dashboard state (down → warning present, up → POST succeeds → empty stderr + cleanup via DELETE). Оба состояния acceptable.

### Round 5 — Codex adversarial review (2026-04-19, post-R4)

Codex: «Перепроверил. Новых замечаний у меня больше нет. Исправленные места теперь сходятся: Change 3 snippet уже не противоречит Change 1/spec, §13 Notes тоже дочищен. Для меня plan execution-ready.»

Plan approved. Total rounds: R1-R2 in-session + R3-R5 Codex adversarial (F3-F7 addressed inline). Ready для execution delivery.

---

## §9 Delta from Phase A

- Phase A delivered: supervisor + runtime-state + global dashboard visibility + session POST endpoint.
- Phase B adds: hook SCRIPTS calling existing endpoint.
- No backend changes в этот handoff.
- Frontend changes: нет (runtime panel уже visible).
- Spec update: new «Phase B: Session lifecycle hooks» section в local-claude-codex-mailbox-workflow.md.

Это делает Phase B minimal-scope delivery: **2 new files + 2 modifications**.

---

## §10 Known gaps (honest flags)

### Gap G1 — Stop hook clean exit (no DELETE call)

В Phase B Stop hook НЕ удаляет session через DELETE. Причина: Claude Code Stop fires на end-of-turn, не end-of-session. Session auto-expires через 60s TTL — это cleaner семантика (heartbeat refresh via POST; отсутствие refresh = session стала idle → auto-expire). Если agent сессия действительно завершена, 60s TTL её уберёт.

### Gap G2 — Codex hooks Linux/WSL scripts не включены

Phase B покрывает **только Claude hooks** per rail #5 (Claude hooks разрешены как transport). Codex hooks Linux/WSL — следующий отдельный handoff если OpenAI Codex shipping Linux hook support. Windows native Codex = degraded mode (rail #7) — manual curl POST per §9.3 Phase A.

### Gap G3 — Session ID stability across resume/compact

SessionStart fires на `source=resume` и `source=clear` — в этих случаях session_id может быть тот же или новый (Claude Code docs unclear). supervisor.mjs POST /sessions — upsert logic (Map set by session_id), так что повторный POST с тем же id = refresh, новый id = new record. Robust по design.

### Gap G4 — Hook failure observability

Silent fail если server down (rail graceful degradation). User не увидит что registration failed. Alternatives: stderr log (visible in transcript) — включено: `[mailbox-hook] register failed: ${message}` на stderr exit 0. Это non-blocking ошибка (Claude Code docs: exit other != 2 → transcript displays stderr, does не block).

### Gap G5 — Multiple Claude projects в одной сессии

Если user `cd` между workflow projects внутри одной Claude Code сессии, session_id тот же но project меняется. Phase B hook fires только на SessionStart/Stop, не на cwd change. Следствие: supervisor.sessions.project = project at session start. Это acceptable для Phase B visibility; fine-grained tracking — Phase C/D + отдельный cwd-change hook.

### Gap G6 — Windows node.exe path в settings.json

settings.local.json uses `node "$CLAUDE_PROJECT_DIR/scripts/..."` — `node` должен быть в PATH. На Windows это обычно есть через Node installer; если нет — hook silently fails per exit code handling. Acceptable — user environment issue, не handoff scope.

---

## §11 Signature

Planner: Claude
Date: 2026-04-19
Procedure: `claude-plan-creation-procedure.md` v1
Baseline: HEAD=`2fc5325`
Input: Phase A (commit `2927af7`) + ТЗ section «Phase B: Passive hook integration» + Claude Code hooks docs
Status: **skeleton (Step 2 complete)** → Steps 3-11 proceeding per NO-STOP DISCIPLINE
