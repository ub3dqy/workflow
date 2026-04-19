# Mailbox Automation Phase B — Execution Report

**Plan**: `docs/codex-tasks/mailbox-automation-phase-b.md`
**Planning-audit**: `docs/codex-tasks/mailbox-automation-phase-b-planning-audit.md`
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
2fc5325

$ git status --short
?? docs/codex-tasks/mailbox-automation-phase-b-planning-audit.md
?? docs/codex-tasks/mailbox-automation-phase-b-report.md
?? docs/codex-tasks/mailbox-automation-phase-b.md
```

### §0.3 Baseline line counts (P2)

```
$ wc -l scripts/mailbox-status.mjs dashboard/supervisor.mjs dashboard/server.js .claude/settings.local.json local-claude-codex-mailbox-workflow.md
  262 scripts/mailbox-status.mjs
  206 dashboard/supervisor.mjs
  249 dashboard/server.js
   16 .claude/settings.local.json
  845 local-claude-codex-mailbox-workflow.md
 1578 total
```

Expected (plan §4 P2):
- `scripts/mailbox-status.mjs` = 262
- `dashboard/supervisor.mjs` = 206
- `dashboard/server.js` = 249
- `.claude/settings.local.json` = 16
- `local-claude-codex-mailbox-workflow.md` = 845

### §0.4 Pre-existing baseline notes

Pre-existing baseline clean for tracked files. Only handoff trio was untracked at start.

### §0.5 P3 endpoint probe

```
P3 INFO: dashboard not running; P3 requires running dashboard — start before running P3 or skip to V4 structural check
```

### §0.6 P4 baseline build

```
npm warn cleanup Failed to remove some directories [
npm warn cleanup   [
npm warn cleanup     '/mnt/e/project/workflow/dashboard/node_modules/@rolldown/.binding-win32-x64-msvc-UV3pxCrw',
npm warn cleanup     [Error: EIO: i/o error, unlink '/mnt/e/project/workflow/dashboard/node_modules/@rolldown/.binding-win32-x64-msvc-UV3pxCrw/rolldown-binding.win32-x64-msvc.node'] {
npm warn cleanup       errno: -5,
npm warn cleanup       code: 'EIO',
npm warn cleanup       syscall: 'unlink',
npm warn cleanup       path: '/mnt/e/project/workflow/dashboard/node_modules/@rolldown/.binding-win32-x64-msvc-UV3pxCrw/rolldown-binding.win32-x64-msvc.node'
npm warn cleanup     }
npm warn cleanup   ]
npm warn cleanup ]

added 4 packages, and removed 2 packages in 2s

computing gzip size...
dist/index.html                  0.39 kB │ gzip:  0.27 kB
dist/assets/index-D56cPRHQ.js  227.22 kB │ gzip: 69.46 kB

✓ built in 550ms
```

### §0.7 P5 existing hooks config

```
$ cat .claude/settings.local.json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/scripts/mailbox-status.mjs\"",
            "timeout": 3
          }
        ]
      }
    ]
  }
}
```

---

## §1 Changes applied

### Change 1 — `scripts/mailbox-session-register.mjs` (NEW)

- [x] File created
- [x] Stdin read via `readStdin()`
- [x] Cross-OS path normalization (`toHostPath`) — для cwd informational только
- [x] **`--project` flag parsing** (both `--project name` and `--project=name`) — NO cwd-walk
- [x] No `findProjectRoot` / no `inferProjectFromCwd` (spec L306: explicit flag only)
- [x] Silent exit 0 if --project flag missing (opt-in per repo)
- [x] Platform detection (windows/linux/wsl)
- [x] POST via global `fetch()` with AbortController timeout (3s)
- [x] transport value = "claude-hooks"
- [x] Silent fail: all errors → `exit 0` + stderr warning
- [x] Idempotent (POST same id = upsert, no duplicate record)

### Change 2 — `.claude/settings.local.json`

- [x] SessionStart block has 2 entries (mailbox-status.mjs + mailbox-session-register.mjs)
- [x] New Stop block with 1 entry (mailbox-session-register.mjs)
- [x] Timeouts: mailbox-status=3s, session-register=5s
- [x] Valid JSON

### Change 3 — `local-claude-codex-mailbox-workflow.md`

- [x] «Phase B: Session lifecycle hooks» section added after existing archive section
- [x] Describes SessionStart + Stop POST semantics + silent fail + 60s TTL
- [x] Codex degraded mode note (rail #7)
- [x] Scope boundaries noted (rail #4, #8)

---

## §2 Verification Phase 1 (V1-V9)

### V1 — Script parses

```
$ node --check scripts/mailbox-session-register.mjs && echo "V1 PASS"
V1 PASS
```

Expected: `V1 PASS`. Actual: ☒ PASS ☐ FAIL

### V2 — Empty stdin

```
$ echo -n "" | node scripts/mailbox-session-register.mjs
$ echo "V2 exit: $?"
V2 exit: 0
```

Expected: `V2 exit: 0`. Actual: ☒ PASS ☐ FAIL

### V3 — Malformed JSON stdin

```
$ echo -n "not json" | node scripts/mailbox-session-register.mjs
$ echo "V3 exit: $?"
V3 exit: 0
```

Expected: `V3 exit: 0`. Actual: ☒ PASS ☐ FAIL

### V4 — settings.local.json structure

```
V4 SessionStart entries: 2
V4 Stop entries: 1
```

Expected: SessionStart entries: 2; Stop entries: 1. Actual: ☒ PASS ☐ FAIL

### V5 — Spec section

```
$ grep -c "Phase B: Session lifecycle hooks\|Phase B — Session lifecycle hooks" local-claude-codex-mailbox-workflow.md
1
```

Expected: 1. Actual: ☒ PASS ☐ FAIL

### V6 — Empirical: (6a) --project flag enforcement + (6b) initial register + (6c) heartbeat refresh

```
V6a PASS: no --project → silent exit (exit 0)
V6b PASS: registered last_seen=2026-04-19T18:09:37Z (exit 0)
V6c PASS: heartbeat refreshed REFRESHED:2026-04-19T18:09:40Z (exit 0)
```

Expected: `V6a PASS` + `V6b PASS` + `V6c PASS` (session registered only with --project flag; heartbeat refreshes last_seen without duplicate), or `V6 SKIP` if dashboard down. Actual: ☒ PASS ☐ SKIP ☐ FAIL

### V7 — Silent fail when dashboard down

```
V7 PASS: dashboard down + stderr warning present + exit 0
```

Expected: `V7 PASS` (silent-fail invariant: exit 0 always; stderr warning present if dashboard down, empty if dashboard up). Actual: ☒ PASS ☐ FAIL

### V8 — PD scan

```
--scan done
```

Expected: `--scan done` только. Actual: ☒ PASS ☐ FAIL

### V9 — Whitelist drift

```
$ git status --short
 M .claude/settings.local.json
 M local-claude-codex-mailbox-workflow.md
?? docs/codex-tasks/mailbox-automation-phase-b-planning-audit.md
?? docs/codex-tasks/mailbox-automation-phase-b-report.md
?? docs/codex-tasks/mailbox-automation-phase-b.md
?? scripts/mailbox-session-register.mjs
```

Expected: 2 whitelist M + 1 new `??` + 3 handoff artefacts. Actual: ☒ PASS ☐ FAIL

---

## §3 Verification Phase 2 (user visual `[awaits user]`)

- [ ] P2.1 Claude Code restart → dashboard «Активные сессии» shows agent=claude, project=workflow, transport=claude-hooks, correct platform
- [ ] P2.2 Multi-turn working → session stays active (last_seen refreshes)
- [ ] P2.3 90s idle без Stop → session auto-expires
- [ ] P2.4 Dashboard down сценарий — Claude session не hang, optional stderr warning

---

## §4 Verification Phase 3 (cross-OS parity `[awaits user]`)

- [ ] P3.1 Windows native → platform="windows"
- [ ] P3.2 WSL → platform="wsl" или "linux"
- [ ] P3.3 Codex Linux/WSL — out-of-scope (not delivered в Phase B)
- [ ] P3.4 Codex Windows native — degraded per Phase A §9.3 (manual curl POST)

---

## §5 Discrepancies

- P3 baseline endpoint probe went through INFO branch because dashboard was not running at pre-flight time.
- P4 baseline build initially failed with `@rolldown/binding-linux-x64-gnu` missing native binding. Applied standard environment repair per wiki: `cd dashboard && npm install --no-audit --no-fund`, then reran build successfully (`✓ built in 550ms`). No tracked lockfile drift remained in final `git status`.
- V6 first attempt skipped because dashboard was down. Started `dashboard/server.js` locally, reran exact V6 block, got PASS on V6a/V6b/V6c, then shut server down cleanly.
- Claude updated V7 fenced command inline to include `--project workflow` and redefined PASS correctly around exit-0 invariant. Rerun result: `V7 PASS: dashboard down + stderr warning present + exit 0`.

---

## §6 Self-audit

Plan §12 checklist — ≥11/12 required.

- [x] 1: P1-P5 pre-flight OK
- [x] 2: Change 1 created
- [x] 3: Change 2 applied
- [x] 4: Change 3 applied
- [x] 5: V1-V9 recorded verbatim
- [x] 6: V9 whitelist drift clean
- [x] 7: No commit/push
- [x] 8: Discrepancies recorded
- [x] 9: Report §0-§10 filled
- [x] 10: No hooks outside SessionStart + Stop (rail #8)
- [x] 11: Script transport = "claude-hooks"
- [x] 12: Platform detection includes wsl

---

## §7 Acceptance summary

Plan §8 criteria:

- [x] Phase 1 V1-V9 PASS
- [x] Report filled
- [x] No files outside whitelist
- [x] PD scan clean
- [x] Hook script extractable
- [x] settings.local.json valid JSON + correct structure
- [x] Spec updated
- [x] No commit/push без user command
- [x] Phase 2 + Phase 3 awaiting user

---

## §8 Rollback state

- [x] `git diff --stat` clean before stash
- [x] Stash command prepared: `git stash push -m "phase-b-rollback" -- .claude/settings.local.json local-claude-codex-mailbox-workflow.md scripts/mailbox-session-register.mjs`
- [x] No backend/frontend deltas

---

## §9 Out-of-scope confirmations

- [x] No backend API changes (reuse Phase A /api/runtime/sessions)
- [x] No dashboard frontend changes
- [x] No Phase C delivery logic
- [x] No Phase D lease/claim
- [x] No UserPromptSubmit
- [x] No Codex hooks scripts
- [x] No new deps in package.json/lockfile

---

## §10 Compat rails compliance

- [x] Rail #5 (Claude hooks as transport): hook scripts delivered
- [x] Rail #8 (no UserPromptSubmit): only SessionStart + Stop
- [x] Rail #4 (thin layer): hook scripts only POST — no execution, no mailbox reads
- [x] Rail #3 prerequisite: session records carry project field
- [x] Rail #7 (Codex Windows degraded): documented in spec

---

## §11 Sign-off

Executor: Codex
Date: 2026-04-19
HEAD at completion: 2fc5325
Commit: **NOT CREATED** — awaits explicit user command.
