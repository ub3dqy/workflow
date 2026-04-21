# Mailbox Supervisor Phase A — Planning Audit

**Plan**: `docs/codex-tasks/mailbox-supervisor-phase-a.md`
**Report template**: `docs/codex-tasks/mailbox-supervisor-phase-a-report.md`
**ТЗ source**: `docs/codex-tasks/mailbox-auto-pickup-supervisor-tz.md`
**Planner**: Claude
**Date**: 2026-04-18
**Version**: v1
**Scope**: Phase A (visibility only) из 4-phase rollout ТЗ. Phase B/C/D — отдельные handoff'ы.

---

## §0 Meta-procedure

This audit follows the canonical 11-step procedure at:
`E:/Project/memory claude/memory claude/docs/claude-plan-creation-procedure.md`

Pre-plan design negotiation: Q1/Q2 из ТЗ §«Open design questions» закрыты через mailbox thread `mailbox-auto-pickup-supervisor-tz` (agreed with Codex):

- **Q1 — runtime-state location**: `mailbox-runtime/` внутри workflow repo, gitignored. Причина: близость к `agent-mailbox/`, одна точка для backup/diag, нет cross-OS HOME resolution.
- **Q2 — supervisor process**: встроен в dashboard backend (полл + state module), **но** с жёстким требованием модульной границы — supervisor logic живёт в отдельном extractable `dashboard/supervisor.mjs` (или `scripts/mailbox-supervisor.mjs`), не размазан по `server.js`. Codex'овский conditional requirement. Phase-up к Q2: в Phase B/C/D, если потребуется standalone daemon, extractable module выносится без переписывания core logic.
- **Q3 project detection unification**: отложено до Phase B/C (релевантно для hooks session binding).
- **Q4 delivery contract**: отложено до Phase C.
- **Q5 acknowledged state**: отложено до Phase C/D.

---

## §1 MCP + Skill selection

Scan advertised session tools, match against task needs:

| Tool | Purpose | Priority |
|------|---------|----------|
| `context7.resolve-library-id` + `query-docs` | Node.js `fs.readdir`/`fs.writeFile`/`fs.rename` atomicity + timers patterns; Express middleware extraction / route mounting; optional: polling best-practices для cross-OS NTFS | mandatory (Source Integrity) |
| `plan-audit` skill | Step 10 — структурный audit, scoring 0-10 | mandatory |
| `WebFetch` | fallback для context7 gaps | conditional |
| `git` MCP | not used — no explicit user command (anti-pattern #9) | skip |
| `filesystem` MCP | not needed — base `Read`/`Write`/`Edit` покрывают | skip |
| `github` MCP | not needed — no PR/issue ops | skip |
| `ide` MCP | disconnected (session reminder) | unavailable |
| `security-audit` skill | defer к post-execution review | defer |

---

## §2 MCP readiness verification

| Probe | Raw output (excerpt) | Status |
|-------|---------------------|--------|
| `mcp__context7__resolve-library-id({libraryName: "Node.js", query: "atomic file write rename polling readdir"})` | 5 libraries returned. Top: `/nodejs/node` (High, benchmark 87.61, 16836 snippets). Also `/websites/nodejs_latest-v24_x_api` (benchmark 78.59). | ✅ ready |
| `plan-audit` skill | deferred to Step 10; availability confirmed in session-start reminder | ⚠️ deferred |
| `WebFetch` | deferred; fallback-only if context7 gap | ⚠️ deferred |

---

## §3 Files read during planning

| File | Lines | Tool | Purpose/extracted |
|------|-------|------|-------------------|
| `docs/codex-tasks/mailbox-auto-pickup-supervisor-tz.md` | 276 | `Read` | Source ТЗ — all architecture details, constraints, rollout phases, open questions |
| `scripts/mailbox-lib.mjs` | 593 (commit `44a704c`) | `Read` (prior turn) | `collectMarkdownFiles` (line 217) shows readdir pattern; `readBucket` (line 312) — readable reference для supervisor polling. `defaultMailboxRoot` (line 40) — mailbox root derivation. |
| `dashboard/server.js` | 167 (post-commit 173) | `Read` (prior turn) | Express pattern: try/catch + `sendClientError`. Current routes: `/api/messages`, `/api/messages/:dir`, `/api/reply`, `/api/archive`, `/api/notes`. Supervisor adds `/api/runtime/*` via extractable router. |
| `local-claude-codex-mailbox-workflow.md` | 777 | `Read` (prior turn) | Protocol truth; §"Optional local UI layer" already permits "localhost-only", "dashboard без становления primary state"; Phase A подтверждает этим guardrails. |
| `CLAUDE.md` | in context | in-context | Project rules: no commit/push, personal data scan, mailbox не для scope decisions. Phase A plan соблюдает. |
| `.gitignore` | 17 | `Read` | `agent-mailbox/` already gitignored. Add `mailbox-runtime/` line в whitelist. |
| `dashboard/package.json` | 27 | `Read` | Runtime: Node ≥20.19. Deps: express 5.2.1, gray-matter 4.0.3, marked 18.0.1, react 19.2.5. **No chokidar** — Phase A uses `setInterval` polling (confirms ТЗ preference). |
| `dashboard/src/App.jsx` | 1558 (post commit `44a704c`) | in-context / grep | UI component for global view; Phase A adds dashboard section «Active sessions» + «Undelivered messages». Extends hero/toolbar или adds new section between hero и grid. |

---

## §4 Official docs fetched (Source Integrity chain)

| Topic | Primary source | Result | Verbatim quote | §V_n |
|-------|---------------|--------|----------------|------|
| `fs.writeFile` atomic semantics | context7 `/websites/nodejs_latest-v24_x_api` | ✅ found | "Asynchronously writes data to a file, replacing the file if it already exists. … Defaults: encoding `'utf8'`, mode `0o666`, flag `'w'`. For performance-sensitive applications or scenarios requiring multiple writes to the same file, using `fs.createWriteStream()` is recommended over calling `fs.writeFile()` repeatedly. Repeatedly calling `fs.writeFile()` without waiting for the callback is considered unsafe." (source: nodejs.org/docs/latest-v24.x/api/fs) | §V1 |
| `fs.rename` atomic rename semantics | context7 `/websites/nodejs_latest-v24_x_api` | ✅ found | "Asynchronously rename file at oldPath to the pathname provided as newPath. In the case that newPath already exists, it will be overwritten. If there is a directory at newPath, an error will be raised instead." (source: nodejs.org/docs/latest-v24.x/api/fs) | §V2 |
| `setInterval`/`clearInterval` timers | context7 `/websites/nodejs_latest-v24_x_api` | ✅ found | "Schedules repeated execution of a callback function every delay milliseconds." clearInterval: "Clears an interval timer set with `setInterval()`." Promises variant (`node:timers/promises`) available для async-iterator pattern. (source: nodejs.org/docs/latest-v24.x/api/globals, .../timers) | §V3 |
| Express modular router / `express.Router()` | context7 `/expressjs/express/v5.2.0` | ✅ found | "The Express Router allows for the creation of modular, mountable route handlers. This is useful for organizing routes into separate files and modules … Routers can be mounted at specific paths using middleware" (source: context7.com/expressjs/express/llms.txt). Pattern: `const runtimeRouter = express.Router(); ...; app.use("/api/runtime", runtimeRouter);` | §V4 |
| `fs.readdir` + dirent filter | planner-implementation knowledge backed by existing code `scripts/mailbox-lib.mjs:217` using `fs.readdir(directory, { withFileTypes: true })` — **already verified in repo, no external docs fetch needed** | ✅ in-repo | `entries = await fs.readdir(directory, { withFileTypes: true })` — pattern reused from mailbox-lib. | §V5 |
| Graceful shutdown (SIGINT/SIGTERM, `server.close()`) | not fetched в этом audit — stock Node pattern, standard across versions; if needed Codex verifies через empirical test в pre-flight | ⚠️ implementation-knowledge | — | §V6 (⚠️) |

---

## §5 AST scans + commands run

| Command | Purpose | Key output |
|---------|---------|------------|
| `wc -l dashboard/src/App.jsx dashboard/server.js scripts/mailbox-lib.mjs local-claude-codex-mailbox-workflow.md .gitignore dashboard/package.json` | Baseline line counts post-`44a704c` commit | App.jsx=1722, server.js=201, mailbox-lib.mjs=674, spec=790, .gitignore=16, package.json=26 |
| `git log --oneline -3` | Planning snapshot | HEAD=`44a704c feat(dashboard): user-authored append-notes`. Clean tree expected modulo preserved CRLF drift on WSL |

---

## §6 Empirical tests

| Test | Purpose | Raw output | Verdict |
|------|---------|------------|---------|
| E1 — atomic write via writeFile+rename | Confirm atomic JSON state write pattern для `mailbox-runtime/*.json` (supervisor writes tmp, renames to final — readers никогда не видят partial file) | `node -e "fs.writeFileSync(tmp); fs.renameSync(tmp, final); fs.readFileSync(final)"` → `rename ok: {"a":1}` | ✅ PASS — confirmed pattern works on Windows NTFS from dashboard cwd |

Reproducer:

```bash
cd dashboard && node -e "
const fs = require('fs');
const tmp = '/tmp/atomic-test.json';
const final = '/tmp/atomic-test-final.json';
fs.writeFileSync(tmp, JSON.stringify({a:1}));
fs.renameSync(tmp, final);
console.log('rename ok:', fs.readFileSync(final, 'utf8'));
fs.unlinkSync(final);
"
```

---

## §7 Assumptions + verification status

| Claim in plan | Evidence / flag | Status |
|---------------|-----------------|--------|
| `fs.writeFile` + `fs.rename` pattern atomic для JSON state | §4 V1 + V2 verbatim + §6 E1 empirical | ✅ verified |
| `setInterval`/`clearInterval` годятся для polling loop | §4 V3 | ✅ verified |
| `express.Router()` позволяет extractable supervisor module mounted via `app.use("/api/runtime", runtimeRouter)` | §4 V4 | ✅ verified |
| `fs.readdir({withFileTypes: true})` pattern для scan mailbox buckets | §3 existing code (mailbox-lib.mjs:217) reuse | ✅ verified |
| Phase A не требует chokidar (polling достаточен) | ТЗ §«Жёсткие ограничения» preference polling over watchers; §3 package.json отсутствие chokidar; empirical precedent в mailbox workflow polling ~3s | ✅ reasoned |
| Poll interval 2-5s — безопасный диапазон для `/mnt/e/...` NTFS | ТЗ §«Central supervisor» recommendation; наблюдаемый в dashboard App.jsx constant `pollIntervalMs = 3000` | ✅ by-example |
| Graceful shutdown (SIGINT/SIGTERM + `server.close()` + `clearInterval`) работает в Node 24 | implementation-knowledge; pattern standard; empirical verify в Codex pre-flight | ⚠️ assumed — Codex empirical confirms |
| Supervisor module modular boundary (Codex requirement от Q2 agreement) | Codex reply 2026-04-18T11:21:16Z: "supervisor logic должна жить в отдельном extractable service/module, а не быть размазана по server.js" | ⚠️ contract — план включает `dashboard/supervisor.mjs` as dedicated module |
| Phase A non-goals (hooks, delivery signals, lease) — defer | ТЗ §«Предлагаемый rollout» разделяет A→B→C→D explicitly | ✅ per-ТЗ |
| Runtime-state files JSON-serializable; tests re-load after restart | implementation-knowledge; standard JSON round-trip | ✅ reasoned |

Legend:
- ✅ verified
- ⚠️ assumed-to-verify-by-codex / contract-only
- ❌ implementation-knowledge, not docs-backed

---

## §8 plan-audit skill invocation

### Round 1 — 2026-04-18

- Invocation: `Skill({skill: "plan-audit", args: "<plan>.md --planning-audit <audit>.md"})`
- Score: **9/10** 🟡
- Critical fixes applied: none (no critical findings)
- Important fixes applied:
  1. §6 Change 2 wording — «добавить перед app.listen» заменено на explicit «**заменить** существующий блок app.listen» с показом original block + expanded block. Устраняет риск двойного `app.listen` → EADDRINUSE.
  2. §6 Change 2 import section — elided `// ... (unchanged)` заменён на полный список всех 17 imports explicitly. Устраняет риск случайного удаления existing imports.
  3. §6 Change 4 substep 5 — уточнена location insertion: «сразу после `</section>` hero и перед errorBanner». Явный порядок hero → runtimePanel → errorBanner → grid.
  4. §7 Phase 1 order dependency — добавлен first-line mandatory order: Change 5 (.gitignore) apply first, потом Changes 1-4, потом V1-V9. Предотвращает `mailbox-runtime/` в untracked state до .gitignore update.
- Optional fixes applied: `supervisor.start()` throw-behavior documented в §6 Change 2 Rationale.
- Optional fixes deferred: V7 PID management explicit capture (Codex сам решит); empty catch replaced with `return` (ESLint cosmetic).

### Round 2 — 2026-04-18

- Invocation: re-run `Skill({skill: "plan-audit"})` после R1 fixes.
- Score: **10/10** ✅ (in-session plan-audit).
- Critical fixes: 0. Important fixes: 0. Only 1 optional cosmetic (prose «14 imports» vs code block 17). Applied inline.

### Round 3 — Codex adversarial review (2026-04-18)

External Codex adversarial found 3 findings plan-audit skill пропустил:

- Blocker F1 — **baseline drift**. Plan был написан против `44a704c`, но после него закоммичен `92231a4 fix(mailbox): remove implicit user reply sender`. Новый baseline: server.js=159 (было 201), App.jsx=1544 (1722), api.js=61 (79). Also `/api/reply` route удалён, imports `generateMessageFile`/`validateReplyTarget`/`validateThread` и `postReply` удалены. Fix: rebase plan §4 P2 line counts, §4 P5 routes, §6 Change 2 imports (17→14), §6 Change 4.1 App.jsx imports (убран postReply), §13 planning snapshot `44a704c` → `92231a4`, report template §0.3 baseline.
- Blocker F2 — **V3/V8 markdown-pipe escape**. V3 command `cd dashboard && npx vite build 2>&1 \| tail -5` — в markdown table cell `\|` shell читает literal, `CACError: Unknown option -5`. Fix: вынесены все multi-part verification commands из table cells в fenced code block ниже таблицы.
- Important F3 — **fire-and-forget fs writes**. `router.post/delete("/sessions")` использовали `void persistSessions()` — 201/200 возвращается до disk flush, на write failure unhandled rejection + false success. Fix: route handlers async + await persistSessions + try/catch → 500 при write failure.

**Plan-audit skill limitation observed**: R2 skill invocation не fetched current HEAD, reported 10/10 на устаревшем baseline. External Codex review поймал drift. Confirms wiki [[multi-round-adversarial-review-dynamic]] — plan-audit skill catches structural issues, external Codex catches baseline/runtime-correctness issues.

### Round 4 — post-F fixes, pending Codex re-review

---

## §9 Delta from prior Tier

Initial v1 plan. Delta: N/A.

This plan is Phase **A** of 4-phase rollout described в ТЗ `mailbox-auto-pickup-supervisor-tz.md` §«Предлагаемый rollout»:
- **Phase A (this plan)**: visibility-only. Polling + index + runtime session registry + dashboard section. No hooks, no delivery signals, no claim/lease.
- Phase B: passive hook integration (SessionStart/Stop heartbeat + backlog summary). Separate handoff.
- Phase C: delivery signal (supervisor-generated delivery records, lightweight Stop check, continuation prompt). Separate handoff.
- Phase D: lease/claim hardening. Separate handoff.

---

## §10 Known gaps (honest flags)

### Gap G1 — Graceful shutdown pattern not docs-verified

Standard `process.on("SIGINT"/"SIGTERM", ...)` + `server.close()` + `clearInterval()` — implementation-knowledge, not fetched as verbatim docs. Mitigation: Codex pre-flight empirical test (start dashboard with supervisor → send SIGINT → verify no orphaned intervals / file handles).

### Gap G2 — No cross-OS clock skew handling for `last_seen`

ТЗ §«Timestamp rule» already states UTC writer-side. Phase A registers sessions with `last_seen` от writer (hook host's clock). No normalization. Documented acceptance; Phase B/C может revisit если skew causes false-stale sessions.

### Gap G3 — Dashboard bundle size growth not capped

Adding UI section «Active sessions» + «Undelivered messages» добавит JSX/state. Current size: `224.82 kB` (post-append-note). No hard cap в plan'е — Codex reports actual delta, user решает если >10% growth unacceptable.

### Gap G4 — Supervisor concurrent-poll guard

Если polling tick занимает больше интервала (long scan на large archive), следующий tick может стартовать прежде чем предыдущий завершился. Phase A mitigation: `setInterval` с guard-flag `isScanning` (skip tick if previous не completed). Empirical re-check в Codex pre-flight.

### Gap G5 — Session discovery без hooks (Phase A only)

Phase A registers sessions **только** через direct HTTP POST `/api/runtime/sessions` (manual or test tool). Phase B добавит SessionStart hook для auto-registration. Planner acknowledgment: Phase A dashboard section «Active sessions» может показывать 0 sessions в реальном workflow до Phase B.

Mitigation pattern: each gap has either (a) Codex pre-flight empirical step, (b) `[awaits-user]` marker, or (c) explicit acceptance as implementation-knowledge. All five gaps have explicit mitigation above.

---

## §11 Signature

Planner: Claude
Date: 2026-04-18
Procedure followed: `claude-plan-creation-procedure.md` v1
Design agreement thread: `mailbox-auto-pickup-supervisor-tz` (archived 2026-04-18)


## Legacy Workflow Note (2026-04-21)

This file is preserved as a historical artifact from an earlier workflow revision.

It may mention legacy patterns such as `Claude planner / Codex executor`, user relay, `compact prompt`, or older handoff shapes.

Do not use it as the live operating template. Current contract: `docs/codex-system-prompt.md`, `AGENTS.md`, `workflow-role-distribution.md`, `workflow-instructions-claude.md`, and `workflow-instructions-codex.md`.
