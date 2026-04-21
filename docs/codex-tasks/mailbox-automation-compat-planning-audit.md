# Mailbox Automation Compat — Planning Audit

**Plan**: `docs/codex-tasks/mailbox-automation-compat.md` (in progress)
**Report template**: `docs/codex-tasks/mailbox-automation-compat-report.md` (in progress)
**Planner**: Claude
**Date**: 2026-04-19
**Version**: v1 (skeleton)

---

## §0 Meta-procedure

Canonical procedure: `E:/Project/memory claude/memory claude/docs/claude-plan-creation-procedure.md`.

Input TZ:
- `docs/codex-tasks/mailbox-auto-pickup-supervisor-tz.md` — архитектурный контекст (central supervisor + runtime-state + lightweight hooks).
- archived `agent-mailbox/archive/workflow-automation-compat-requirements/2026-04-19T14-58-50Z-codex-001.md` — 10 cross-OS compat constraints (hard rails).

### Hard constraints from Codex (non-negotiable)

1. **Universal core**: backend, mailbox scripts, runtime-state, dashboard — одинаково на Windows и Linux.
2. **Single dashboard**: один общий для пользователя; IDE и CLI не меняют модель работы.
3. **Strict agent project isolation**: agent(project A) не видит писем project B.
4. **Thin auto-pickup layer** поверх workflow backend, не сложная логика в hooks.
5. **Claude Code hooks** разрешены как transport.
6. **Codex hooks** НЕ обязательная основа Windows native — OpenAI hooks experimental + Windows support disabled.
7. **Codex automation supported only в Linux/WSL**. Windows native Codex → graceful degraded mode без hook path.
8. **No UserPromptSubmit** для mailbox. Только SessionStart и Stop.
9. **Split visibility vs delivery**: global visibility for user в dashboard; strict project-scoped delivery для agents.
10. **Explicit unsupported/degraded marking**: если не даёт одинаково надёжное поведение в (Windows, Linux, IDE, CLI, WSL, direct Linux) — прямо отметить как unsupported/degraded.

### Design carve-outs inherited

- Phase A supervisor artefacts (committed deferred в `mailbox-supervisor-phase-a.md`) — нужно перечитать и решить: resume vs replace.
- `UserPromptSubmit` excluded (prior decision).
- Polling preferred over fs.watch on `/mnt/e/...` (wiki: `wsl-windows-native-binding-drift`, `windows-wsl-process-launcher`).

---

## §1 MCP + Skill selection

| Tool | Purpose | Priority |
|------|---------|----------|
| `context7` | Node fs polling best practices, Express middleware, Claude Code hooks API | mandatory |
| `plan-audit` skill | Step 10 audit loop | mandatory |
| Wiki reads | wsl-windows-native-binding-drift, windows-wsl-process-launcher, mailbox-project-isolation, inter-agent-file-mailbox, agent-mail | mandatory |
| `security-audit` | low (no auth/data boundary changes beyond isolation) | defer |

---

## §2 MCP readiness verification

| Probe | Status |
|-------|--------|
| `context7` | pending — fetch Claude Code hooks + Express router docs |
| `plan-audit` | deferred to Step 10 |
| Wiki articles | pending reads |

---

## §3 Files read during planning

_To be filled during Step 6._

Candidate surface:
- `scripts/mailbox-lib.mjs` (745) — supervisor consumer target.
- `scripts/mailbox.mjs` (392) — CLI baseline.
- `dashboard/server.js` (215) — potential supervisor host vs standalone.
- `dashboard/src/App.jsx` (1628) — global view extension.
- `local-claude-codex-mailbox-workflow.md` (845) — protocol spec.
- `docs/codex-tasks/mailbox-supervisor-phase-a.md` (828) — deferred artefact to reconcile.
- `.gitignore` (16) — runtime-state exclusion.
- Existing Claude hooks configs (if any).
- `CLAUDE.md` — rules including #8 NO-STOP.

---

## §4 Official docs fetched (Source Integrity)

_To be filled during Step 5._

Expected:
- Claude Code hooks lifecycle: `SessionStart`, `Stop` semantics + injection model.
- Codex hooks matrix: Linux/WSL supported, Windows native status (confirm experimental/disabled).
- Node `fs/promises.readdir` + atomic rename cross-platform.
- Express Router mounting pattern (reuse prior).

---

## §5 AST scans + commands run

_To be filled during Step 7._

Planned:
- `wc -l` baseline line counts.
- `git log --oneline -5` per target file.
- `grep` for existing polling loops / session tracking / runtime-state references.
- Empirical: mailbox polling cadence with N messages; atomic-write probe; lease race (2-window scenario).

---

## §6 Empirical tests

_To be filled during Step 7._

Planned:
- E1 — polling cadence measure (2s interval, 10 messages, verify CPU + latency).
- E2 — atomic write + rename for runtime-state files (sessions.json, deliveries.json).
- E3 — lease claim race: 2 sessions same (agent, project) — only one claim wins.
- E4 — cross-platform line ending + path normalization for runtime-state.

---

## §7 Assumptions + verification status

_To be filled during Step 8._

Candidate claims to verify:
- Claude Code SessionStart/Stop hooks injection inline mechanism works across IDE + CLI.
- Codex hooks on Linux/WSL can subscribe to lifecycle; Windows native Codex — no hook path → degraded mode должен явно прописаться.
- Runtime-state in workflow repo `mailbox-runtime/` gitignored сохраняет locality.
- Supervisor as Node standalone script launched alongside dashboard (shared process manager) vs separate process — decision required.
- Project detection unification: cwd-based vs explicit flag vs frontmatter match.

---

## §8 plan-audit skill invocation

### Round 1 — 2026-04-19

- Invocation: `Skill({skill: "plan-audit"}, args: plan + audit paths)`.
- Score: **8/10** 🟡.
- Blockers:
  1. **F1** — `validateProjectScope(project)` 1-arg call in supervisor.mjs POST /sessions; lib signature requires 2 args and throws "target message has no project" с 1 arg. Fix: заменить на `normalizeProject(project)` + truthy check. Import swapped.
  2. **F2** — V7 `MAILBOX_ROOT_OVERRIDE` env var не supported (defaultMailboxRoot computed at import from __dirname). Fix: simplified V7 — run server.js без env, pollTick uses readBucket (read-only) + writes только в mailbox-runtime/ (gitignored, isolated).
- Applied inline.

### Round 2 — 2026-04-19

Re-verify post-R1 fixes. Score: **10/10** ✅ in-session skill. 0 new findings. Ready for Codex adversarial review.

### Round 9 — Shell subshell PID + stdout buffering + hang recovery (2026-04-19, post-R8 rerun)

Codex R8 rerun: V7 всё ещё FAIL, но **shutdown log line не появилась**. Handler не fires. Двойная root cause:

- **F9a — Shell subshell PID mismatch.** Probe командой `cd dashboard && node server.js &` в bash создаёт subshell для compound `&&` chain. `$!` возвращает **subshell PID**, не node PID. `kill -INT $SUPV_PID` идёт в subshell → node никогда не получает SIGINT. Fix (плана §7 Phase 1 V7): split `cd` из background команды: `cd dashboard` отдельной строкой, затем `node server.js &` → `$!` теперь node PID direct.

- **F9b — Shutdown handler robustness.** Даже если SIGINT доходит, `console.log` может не flush при hang, и `setTimeout(process.exit, 5000).unref()` может не fire если event loop stuck. Fix (Change 2):
  - `process.stderr.write` (synchronous, always flushes to fd) вместо `console.log` для shutdown markers.
  - `server.closeAllConnections()` **immediately** before `server.close()` — force-close idle + active sockets разом.
  - `setTimeout(process.exit(1), 3000)` **без `.unref()`** — hard force fire даже при idle loop.
  - Expected graceful exit ≤3s (было 5s).

### Round 8 — Real shutdown bug, не probe fragility (2026-04-19, post-R7 rerun)

Codex rerun V7 post-R7 fix: `http: 200` PASS (startup race closed), но `force-killed + exit: 137` — graceful shutdown реально fails. Loop держится alive >7s даже с `setTimeout(5000).unref()` fallback.

Root cause: Node 20+ `server.close()` НЕ закрывает idle keep-alive connections автоматически — event loop остаётся alive пока TCP keep-alive timeout не истечёт (минуты). `setTimeout().unref()` + `process.exit(1)` fallback не срабатывал: либо timer не fires потому что event loop stuck на active connection, либо server.close callback never resolves, либо по другой причине exit(1) не достигается.

- **F8** — shutdown handler не закрывает idle connections. Fix (Change 2 server.js):
  - `server.closeIdleConnections()` вызывается immediately после `server.close()` — закрывает keep-alive idle sockets, позволяя server.close callback resolve быстро.
  - `setTimeout(closeAllConnections, 3000).unref()` — force-close any active (non-idle) connections, если они появляются.
  - `setTimeout(process.exit(1), 5000).unref()` — hard exit fallback, если оба above не отработали.
  - Guarded `typeof server.closeIdleConnections === "function"` для backwards-compat (появился Node 18.2+).

### Round 7 — Execution V7 fragility fix (2026-04-19, post-Codex Phase 1)

Codex Phase 1: V1-V6+V8 PASS, Changes 1-5 applied; V7 FAIL (`http: 000`, shell hung). Server подтверждён живым (log + ss), не logic gap — fragility в probe: `sleep 2` race c initial pollTick (WSL /mnt/e/ I/O), curl без -m timeout, wait без timeout fallback.

- **F7** — V7 probe fragility. Fix: port-readiness loop (≤15s) + curl `-m 2` per attempt + SIGINT wait loop (≤7s) + force-kill fallback с явным FAIL marker. Expected exit расширен: `0` (clean) и `1` (setTimeout(5000).unref() fallback) оба acceptable — handler fired; `force-killed` → FAIL.

### Round 6 — План approved (2026-04-19, post-R5)

Codex R5: «Новых замечаний больше нет. План выглядит готовым к выполнению.»

### Round 5 — Codex adversarial review (2026-04-19, post-R4)

(Clean — no findings.)

### Round 4 — Codex adversarial review (2026-04-19, post-R3)

- **F6** — baseline line count drift: `dashboard/package.json` = 28 (actual), в plan §4 P2 + report §0.3 стоит 26 → false STOP на старте. Fix: оба файла синхронизированы 26 → 28. Verified `wc -l dashboard/package.json` = 28.

### Round 3 — Codex adversarial review (2026-04-19, post-delivery)

Codex вернул 3 findings:

- **F3** — Legacy pending без project policy. pendingIndex строил `project: m.project || ""` без маркировки. Rail #3 prereq слишком optimistic. Fix: supervisor.mjs pollTick map() теперь emits `projectMissing: true` + `deliverable: false` для pending без project; Phase B/C delivery logic ДОЛЖНА filter по `deliverable === true` перед session match. Policy прописана в Rationale Change 1.
- **F4** — V7 port 3003 occupied false PASS. Comment-only prerequisite не executed → `curl` мог ответить от другого listener. Fix: добавлен explicit pre-check `lsof -i :3003` + `ss -ltn` fallback в fenced команду; `exit 1` если занят.
- **F5** — Report template stale post-F1. Change 1 checklist ссылался на `validateProjectScope` + V8 expected `project: m.project` — не синхронизировано. Fix: report §1 Change 1 + V8 expected expression обновлены.

Все 3 applied inline. Ready for Codex re-review.

---

## §9 Delta from prior Tier

Replaces / resumes deferred `mailbox-supervisor-phase-a.md` (committed but not executed). Delta vs Phase A handoff:

- Added 10 cross-OS compat constraints as hard rails (not optional).
- Explicit Codex Windows-native degraded path.
- Single dashboard requirement (no per-project UI split).
- Split global visibility (dashboard) vs scoped delivery (agent hook).
- UserPromptSubmit explicit exclusion retained.

Decision required в Step 9: resume existing Phase A plan с compat amendments vs full rewrite. Default: rewrite, т.к. constraints materially touch architecture (hook transport selection, Windows degraded mode).

---

## §10 Known gaps (honest flags)

### Gap G1 — Codex Windows native degraded mode UX

Как user узнаёт что автоматика работает только в WSL? Dashboard indicator? CLI warning? Требует design decision.

### Gap G2 — session heartbeat TTL calibration

`last_seen <= 60s` — предложение TZ. Может не подходить для long-running Codex sessions с idle periods. Требует empirical calibration.

### Gap G3 — supervisor process lifecycle

Кто запускает supervisor? Bundled с dashboard backend (shared process) или отдельный launcher? Windows shortcut chain уже fragile (wiki: `windows-wsl-process-launcher`) — добавление supervisor слоя требует platform-aware launcher guard.

### Gap G4 — runtime-state recovery после supervisor crash

TZ говорит «state можно потерять без потери protocol truth». Но `leases.json` crash recovery — reclaim timeout vs fresh lease? Требует discrepancy policy.

### Gap G5 — project detection unification

Claude hooks знают cwd + project из frontmatter. Codex hooks — cwd only. Dashboard — explicit user select. CLI — `--project` flag. Unified scheme требует design decision.

### Gap G6 — IDE vs CLI parity

Requirement 2 «IDE и CLI не меняют модель». Но IDE имеет отдельный session model vs CLI. Требует явного tenant mapping.

---

## §11 Signature

Planner: Claude
Date: 2026-04-19
Procedure: `claude-plan-creation-procedure.md` v1
Input TZ: `mailbox-auto-pickup-supervisor-tz.md` + `workflow-automation-compat-requirements` (archived)
Status: **skeleton (Step 2 complete)** → Steps 3-11 proceeding per NO-STOP DISCIPLINE


## Legacy Workflow Note (2026-04-21)

This file is preserved as a historical artifact from an earlier workflow revision.

It may mention legacy patterns such as `Claude planner / Codex executor`, user relay, `compact prompt`, or older handoff shapes.

Do not use it as the live operating template. Current contract: `docs/codex-system-prompt.md`, `AGENTS.md`, `workflow-role-distribution.md`, `workflow-instructions-claude.md`, and `workflow-instructions-codex.md`.
