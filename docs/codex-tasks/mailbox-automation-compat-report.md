# Mailbox Automation Compat — Execution Report

**Plan**: `docs/codex-tasks/mailbox-automation-compat.md`
**Planning-audit**: `docs/codex-tasks/mailbox-automation-compat-planning-audit.md`
**Executor**: Codex
**Date**: 2026-04-19

---

## §0 Environment baseline

### §0.1 Node + npm

```
$ node --version
v24.14.1

$ (cd dashboard && node --version && npm --version)
v24.14.1
11.11.0
```

### §0.2 Git state

```
$ git rev-parse --short HEAD
458552b

$ git status --short
 M docs/codex-tasks/mailbox-archive-complete-planning-audit.md
?? docs/codex-tasks/mailbox-automation-compat-planning-audit.md
?? docs/codex-tasks/mailbox-automation-compat-report.md
?? docs/codex-tasks/mailbox-automation-compat.md
```

### §0.3 Baseline line counts (P2)

```
$ wc -l dashboard/server.js dashboard/src/App.jsx dashboard/src/api.js .gitignore dashboard/package.json scripts/mailbox-lib.mjs
  215 dashboard/server.js
 1628 dashboard/src/App.jsx
   73 dashboard/src/api.js
   16 .gitignore
   28 dashboard/package.json
  745 scripts/mailbox-lib.mjs
 2705 total
```

Expected (plan §4 P2):
- `dashboard/server.js` = 215
- `dashboard/src/App.jsx` = 1628
- `dashboard/src/api.js` = 73
- `.gitignore` = 16
- `dashboard/package.json` = 28
- `scripts/mailbox-lib.mjs` = 745

Drift >5 lines на whitelist file → STOP + §5 Discrepancies.

### §0.4 Pre-existing baseline notes

Pre-existing outside whitelist baseline accepted:
- `M docs/codex-tasks/mailbox-archive-complete-planning-audit.md`
- `?? docs/codex-tasks/mailbox-automation-compat-planning-audit.md`
- `?? docs/codex-tasks/mailbox-automation-compat-report.md`
- `?? docs/codex-tasks/mailbox-automation-compat.md`

### §0.5 P3 atomic write empirical

```
atomic rename ok: {"a":1}
```

Expected: `atomic rename ok: {"a":1}`.

### §0.6 P4 baseline build

```
computing gzip size...
dist/index.html                  0.39 kB │ gzip:  0.27 kB
dist/assets/index-BBQg1Sx0.js  223.73 kB │ gzip: 68.81 kB

✓ built in 484ms
```

### §0.7 P5 existing routes

```
25:app.use((request, response, next) => {
29:app.use(express.json());
42:app.get("/api/messages", async (request, response) => {
67:app.get("/api/messages/:dir", async (request, response) => {
90:app.post("/api/archive", async (request, response) => {
139:app.post("/api/notes", async (request, response) => {
211:app.use("/api/agent", agentRouter);
213:app.listen(port, host, () => {
```

Expected routes (plan §4 P5): middleware, express.json, `/api/messages` (×2), `/api/archive`, `/api/notes`, `/api/agent` mount, `app.listen`. New `/api/runtime` prefix не конфликтует.

---

## §1 Changes applied

### Change 1 — `dashboard/supervisor.mjs` (NEW)

- [x] File created
- [x] `createSupervisor` exported
- [x] `atomicWriteJson` = writeFile + rename
- [x] `pollTick` uses `readBucket` + filters `status=pending`
- [x] `pendingIndex.map()` preserves `project` + emits `deliverable` + `projectMissing` fields (rail #3 prereq hardening)
- [x] `isScanning` guard present
- [x] router routes: GET `/state`, POST `/sessions`, DELETE `/sessions/:id`
- [x] Session validation: `session_id`, `agent ∈ {claude,codex}`, `project` (via `normalizeProject` + truthy check)
- [x] `start()` calls `fs.mkdir(runtimeRoot, {recursive:true})` + initial tick + `setInterval`
- [x] `stop()` clears timer

### Change 2 — `dashboard/server.js`

- [x] `path` + `fileURLToPath` + `createSupervisor` imports added
- [x] All 15 existing named imports из `mailbox-lib.mjs` preserved
- [x] `__dirname` derivation + `runtimeRoot` const added
- [x] Supervisor mount: `app.use("/api/runtime", supervisor.router)`
- [x] `await supervisor.start()` present
- [x] `app.listen` assigned to `const server`
- [x] `shutdown(signal)` handler calls `supervisor.stop()` + `server.close()`
- [x] SIGINT + SIGTERM registered
- [x] `closeAllConnections()` called immediately before `server.close()`
- [x] Hard fallback: `setTimeout(process.exit(1), 3000)` without `.unref()`

### Change 3 — `dashboard/src/api.js`

- [x] `fetchRuntimeState(signal)` exported
- [x] Uses existing `parseJsonResponse` helper
- [x] `cache: "no-store"`

### Change 4 — `dashboard/src/App.jsx`

- [x] 4.1: Import update: +`fetchRuntimeState`
- [x] 4.2: Translations added (ru + en) — 6 keys each
- [x] 4.3: `runtimeState` state added
- [x] 4.4: Runtime polling effect added (separate from messages effect)
- [x] 4.5: `<section className="runtimePanel">` JSX added after `hero`
- [x] 4.6: CSS added: runtimePanel, runtimeBlock, runtimeList, supervisorFooter, media query

### Change 5 — `.gitignore`

- [x] `mailbox-runtime/` line added after `agent-mailbox/`

---

## §2 Verification Phase 1 (V1-V10)

### V1 — Supervisor module loads

```
$ cd dashboard && node -e "import('./supervisor.mjs').then(m => console.log(typeof m.createSupervisor))"
function
```

Expected: `function`. Actual: ☑ PASS ☐ FAIL

### V2 — createSupervisor shape

```
$ cd dashboard && node -e "import('./supervisor.mjs').then(m => { const s = m.createSupervisor({mailboxRoot: '/tmp/mbox', runtimeRoot: '/tmp/rt', pollIntervalMs: 3000}); console.log(Object.keys(s).sort().join(',')); })"
router,start,state,stop
```

Expected: `router,start,state,stop`. Actual: ☑ PASS ☐ FAIL

### V3 — Build

```
$ cd dashboard && npx vite build 2>&1 | tail -5
computing gzip size...
dist/index.html                  0.39 kB │ gzip:  0.27 kB
dist/assets/index-D56cPRHQ.js  227.22 kB │ gzip: 69.46 kB

✓ built in 459ms
```

Expected: `✓ built`. Actual: ☑ PASS ☐ FAIL

### V4 — server.js mount

```
$ grep -cE "api/runtime|createSupervisor" dashboard/server.js
3
```

Expected: ≥3. Actual: ☑ PASS ☐ FAIL

### V5 — `.gitignore` entry

```
$ grep -c "^mailbox-runtime/" .gitignore
1
```

Expected: 1. Actual: ☑ PASS ☐ FAIL

### V6 — Dashboard UI wired

```
$ grep -cE "runtimePanel|fetchRuntimeState|activeSessionsTitle" dashboard/src/App.jsx dashboard/src/api.js
dashboard/src/App.jsx:8
dashboard/src/api.js:1
```

Expected: ≥4. Actual: ☑ PASS ☐ FAIL

### V7 — Graceful shutdown

```
http: 200
exit: 0
```

Expected: `http: 200`, `exit: 0`, elapsed ≤5s. Actual: ☑ PASS ☐ FAIL

### V8 — pendingIndex project + deliverable + projectMissing hardening (rail #3 prereq)

```
$ grep -cE "project: normalized|deliverable:|projectMissing:" dashboard/supervisor.mjs
4
```

Expected: ≥3. Actual: ☑ PASS ☐ FAIL

### V9 — PD scan

```
$ PD_PATTERNS='$PD_PATTERNS'
$ grep -riE "$PD_PATTERNS" --include="*.js" --include="*.jsx" --include="*.mjs" --include="*.html" --include="*.json" dashboard/ scripts/ 2>/dev/null
$ grep -riE "$PD_PATTERNS" --include="*.md" CLAUDE.md README.md README.ru.md local-claude-codex-mailbox-workflow.md workflow-instructions-*.md 2>/dev/null
$ echo "--scan done"
--scan done
```

Expected: только `--scan done`. Actual: ☑ PASS ☐ FAIL

### V10 — Whitelist drift

```
$ git status --short
 M .gitignore
 M dashboard/server.js
 M dashboard/src/App.jsx
 M dashboard/src/api.js
 M docs/codex-tasks/mailbox-archive-complete-planning-audit.md
?? dashboard/supervisor.mjs
?? docs/codex-tasks/mailbox-automation-compat-planning-audit.md
?? docs/codex-tasks/mailbox-automation-compat-report.md
?? docs/codex-tasks/mailbox-automation-compat.md
```

Expected: 5 whitelist M + 3 handoff artefacts (mailbox-automation-compat{,.planning-audit,.report}.md). Actual: ☑ PASS ☐ FAIL

---

## §3 Verification Phase 2 (user visual `[awaits user]`)

- [ ] P2.1 Dashboard loads
- [ ] P2.2 «Активные сессии» visible, empty state
- [ ] P2.3 «Незабранные сообщения» count matches mailbox pending
- [ ] P2.4 POST session → 201 → appears в активных через 3s
- [ ] P2.5 Session auto-expires >60s
- [ ] P2.6 `mailbox-runtime/*.json` created and updating

---

## §4 Verification Phase 3 (user visual Windows native `[awaits user]`)

- [ ] P3.1 Windows dashboard via `start-workflow.cmd` — runtime JSON files created
- [ ] P3.2 Windows POST/expire parity
- [ ] P3.3 Windows Ctrl+C shutdown — clean exit

---

## §5 Discrepancies

- P4 baseline build initially failed before any code changes:

  ```
  file:///mnt/e/Project/workflow/dashboard/node_modules/rolldown/dist/shared/binding-s-V_wTpj.mjs:507
  		if (loadErrors.length > 0) throw new Error("Cannot find native binding. npm has a bug related to optional dependencies (https://github.com/npm/cli/issues/4828). Please try `npm i` again after removing both package-lock.json and node_modules directory.", { cause: loadErrors.reduce((err, cur) => {
  		                                 ^

  Error: Cannot find native binding. npm has a bug related to optional dependencies (https://github.com/npm/cli/issues/4828). Please try `npm i` again after removing both package-lock.json and node_modules directory.
  ...
  [cause]: Error: Cannot find module '@rolldown/binding-linux-x64-gnu'
  ...
  Node.js v24.14.1
  ```

  Environment repair applied per wiki: `cd dashboard && npm install --no-audit --no-fund`

  Output:

  ```
  npm warn cleanup Failed to remove some directories [
  npm warn cleanup   [
  npm warn cleanup     '/mnt/e/Project/workflow/dashboard/node_modules/@rolldown/.binding-win32-x64-msvc-UItbpsm0',
  npm warn cleanup     [Error: EIO: i/o error, unlink '/mnt/e/Project/workflow/dashboard/node_modules/@rolldown/.binding-win32-x64-msvc-UItbpsm0/rolldown-binding.win32-x64-msvc.node'] {
  npm warn cleanup       errno: -5,
  npm warn cleanup       code: 'EIO',
  npm warn cleanup       syscall: 'unlink',
  npm warn cleanup       path: '/mnt/e/Project/workflow/dashboard/node_modules/@rolldown/.binding-win32-x64-msvc-UItbpsm0/rolldown-binding.win32-x64-msvc.node'
  npm warn cleanup     }
  npm warn cleanup   ]
  npm warn cleanup ]

  added 4 packages, and removed 2 packages in 2s
  ```

- V7 re-run with amended plan block still failed:

  ```
  http: 200
  force-killed
  exit: 137
  ```

  - amended readiness loop solved startup race: server became reachable on `127.0.0.1:3003`;
  - graceful shutdown still hung >7s after `kill -INT $SUPV_PID`;
  - probe had to `kill -KILL`, which per plan is explicit FAIL;
  - `/tmp/supv-v7.log` still contained only `Server listening on 127.0.0.1:3003`; shutdown log line did not appear;
  - V9 and V10 were run afterwards only as supplemental checks; execution status remains STOPPED on V7.

- V7 final rerun after F9 fix PASS:

  ```
  http: 200
  exit: 0
  ```

  - split `cd dashboard` fixed PID targeting;
  - updated shutdown handler now logs and exits cleanly;
  - `/tmp/supv-v7.log` contained:

    ```
    Server listening on 127.0.0.1:3003
    [server] SIGINT received, shutting down
    [server] clean exit
    ```

---

## §6 Self-audit

Plan §12 checklist — ≥11/13 required.

- [x] 1: P1-P5 pre-flight OK
- [x] 2: Change 1 (supervisor.mjs) created
- [x] 3: Change 2 (server.js) applied
- [x] 4: Change 3 (api.js) applied
- [x] 5: Change 4 (App.jsx) applied — 6 substeps
- [x] 6: Change 5 (.gitignore) applied
- [x] 7: V1-V10 recorded verbatim
- [x] 8: V10 whitelist drift clean
- [x] 9: No commit/push
- [x] 10: Discrepancies recorded
- [x] 11: Report §0-§11 filled
- [x] 12: Supervisor module Q2 requirement verified
- [x] 13: pendingIndex project field preserved

---

## §7 Acceptance summary

Plan §8 criteria pass state:

- [x] Phase 1 V1-V10 PASS
- [x] Report filled
- [x] No files outside whitelist
- [x] Build size growth ≤10 kB
- [x] PD scan clean
- [x] `mailbox-runtime/` runtime-only + gitignored
- [x] `dashboard/supervisor.mjs` extractable module (Q2)
- [x] Supervisor logic fully internal
- [x] Graceful shutdown (V7)
- [x] pendingIndex project field (rail #3 prereq)
- [x] No commit/push без user command
- [x] Phase 2 + Phase 3 awaiting user

---

## §8 Rollback state

- [ ] `git diff --stat` clean before stash
- [x] Stash command prepared: `git stash push -m "automation-compat-rollback" -- dashboard/supervisor.mjs dashboard/server.js dashboard/src/api.js dashboard/src/App.jsx .gitignore`
- [x] `mailbox-runtime/` delete safe (runtime-only)

---

## §9 Out-of-scope confirmations

- [x] No hooks code added (Phase B deferred)
- [x] No delivery signals added (Phase C deferred)
- [x] No lease/claim added (Phase D deferred)
- [x] No UserPromptSubmit references (rail #8)
- [x] No `scripts/mailbox-lib.mjs` API changes
- [x] No new deps in `package.json`/lockfile

---

## §10 Compat rails compliance

- [x] Rail #1 (universal core): P3 atomic rename passed cross-OS
- [x] Rail #2 (single dashboard): existing server.js extended, не duplicated
- [x] Rail #3 prerequisite (pendingIndex preserves project + marks deliverable/projectMissing): V8 PASS
- [x] Rail #4 (thin layer): Phase A = polling + persist only
- [x] Rail #8 (no UserPromptSubmit): no hook code added
- [x] Rail #9 (split visibility/delivery): Phase A = visibility only
- [x] Rail #10 (explicit unsupported marking): plan §9.3 degraded-mode table documented

---

## §11 Sign-off

Executor: Codex
Date: 2026-04-19
HEAD at completion: `458552b`
Commit: **NOT CREATED** — awaits explicit user command.


## Legacy Workflow Note (2026-04-21)

This file is preserved as a historical artifact from an earlier workflow revision.

It may mention legacy patterns such as `Claude planner / Codex executor`, user relay, `compact prompt`, or older handoff shapes.

Do not use it as the live operating template. Current contract: `docs/codex-system-prompt.md`, `AGENTS.md`, `workflow-role-distribution.md`, `workflow-instructions-claude.md`, and `workflow-instructions-codex.md`.
