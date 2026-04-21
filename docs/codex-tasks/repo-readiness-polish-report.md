# Repo Readiness Polish — Execution Report

**Handoff plan**: `docs/codex-tasks/repo-readiness-polish.md`
**Planning-audit**: `docs/codex-tasks/repo-readiness-polish-planning-audit.md`
**Executor**: Codex
**Date completed**: `2026-04-17`

> **Anti-fabrication**: raw stdout verbatim. Hostname sanitized in §0.1.

---

## §0 Pre-flight

### §0.1 Environment

**Command**: `uname -a && node --version && pwd`
```text
Linux <hostname-redacted> 6.6.87.2-microsoft-standard-WSL2 #1 SMP PREEMPT_DYNAMIC Thu Jun  5 18:30:46 UTC 2025 x86_64 x86_64 x86_64 GNU/Linux
v24.14.1
/mnt/e/Project/workflow
```

### §0.2 HEAD commit

**Command**: `git log --oneline -1`
```text
1c031b6 feat(dashboard): hide archive-only projects from filter dropdown
```
**Planning snapshot**: `1c031b6`. Drift: `none`.

### §0.3 Working tree

**Command**: `git status --short`
```text
 M scripts/mailbox.mjs
?? .codex
?? docs/codex-tasks/repo-readiness-polish-planning-audit.md
?? docs/codex-tasks/repo-readiness-polish-report.md
?? docs/codex-tasks/repo-readiness-polish.md
?? start-workflow-hidden.vbs
?? start-workflow.cmd
?? stop-workflow.cmd
```

**Expected baseline (per plan Pre-flight Step 3, 2026-04-17)**:
- `M scripts/mailbox.mjs` — pre-existing, preserved out-of-scope per Whitelist
- `?? .codex` — Codex sandbox state (будет gitignored via Change 3)
- `?? start-workflow.cmd`, `?? start-workflow-hidden.vbs`, `?? stop-workflow.cmd` — launchers (будут staged via Change 4)
- `?? docs/codex-tasks/repo-readiness-polish{,-planning-audit,-report}.md` — этот handoff

**Match**: `✅`

### §0.4 README absence

**Command**: `test -f README.md && echo "EXISTS" || echo "MISSING"`
```text
MISSING
```

### §0.5 engines absence

**Command**: `grep -A2 '"engines"' dashboard/package.json || echo "absent"`
```text
absent
```

### §0.6 Launcher portability

**Command**: `grep -nE "C:\\\\Users|/home/|~/" start-workflow.cmd start-workflow-hidden.vbs stop-workflow.cmd`
```text
```
**Portable?** `✅`

### §0.7 WORKFLOW_ROOT probe

```bash
ls /mnt/e/project/workflow 2>&1 | head -3
ls /mnt/e/Project/workflow 2>&1 | head -3
```
```text
CLAUDE.md
agent-mailbox
dashboard

CLAUDE.md
agent-mailbox
dashboard
```
**Selected**: `WORKFLOW_ROOT=/mnt/e/Project/workflow`

---

## §V Doc Verification

### §V1 — engines advisory

**Source**: `context7 /websites/npmjs → https://docs.npmjs.com/cli/v11/configuring-npm/package-json`
**Raw quote**:
```text
Specifies the required versions of Node.js and npm for the package. These settings are advisory and trigger warnings during installation unless strict mode is enabled.

{
  "engines": {
    "node": ">=0.10.3 <15",
    "npm": "~1.0.20"
  }
}
```
**Matches plan §V1?** `✅`

### §V2 — engines install behavior

**Source**: `context7 /websites/npmjs → https://docs.npmjs.com/cli/install`
**Raw quote**:
```text
The engines field allows you to specify the versions of node or npm that your package is compatible with. If you do not specify a version or use '*', any version is considered acceptable. Unless the engine-strict config flag is enabled, this field is advisory and will only trigger warnings when the package is installed as a dependency.
```
**Matches plan §V2?** `✅`

### §V3 — Node 20.19+ require(esm)

**Source**: `context7 /nodejs/node → https://github.com/nodejs/node/blob/main/doc/changelogs/CHANGELOG_V20.md`
**Raw quote**:
```text
Support for loading native ES modules using `require()` is now enabled by default in Node.js v20.x, removing the need for the `--experimental-require-module` flag.
```
**Matches plan §V3?** `✅`

---

## §1 Changes applied

### Change 1 — README.md created

**File**: `README.md` at repo root.

**Line count**: `113`

**Section headings** (`grep "^## " README.md`):
```text
## What this is
## Requirements
## Setup
## Usage
## Architecture
## CI
## License
## Contributing
```

**Doc links count** (`grep -Fc "](./" README.md`):
```text
6
```

**First 10 lines** (verbatim):
```text
# Workflow

Documentation and tooling for dual-agent workflow: **Claude** (planner) + **Codex** (executor). Mailbox protocol for async inter-agent communication + local read-only dashboard for visualization.

[![CI](https://github.com/ub3dqy/workflow/actions/workflows/ci.yml/badge.svg)](https://github.com/ub3dqy/workflow/actions/workflows/ci.yml)

## What this is

- **`scripts/mailbox.mjs`** — CLI для sending/listing/replying/archiving messages between Claude и Codex via markdown files в `agent-mailbox/`.
- **`dashboard/`** — local read-only web UI (Express + Vite + React) для browsing mailbox, ports `127.0.0.1:3003` (API) + `127.0.0.1:9119` (Vite).
```

**Acceptance**: `✅ matches plan skeleton`

### Change 2 — engines field

**Diff** (`git diff -w -- dashboard/package.json`):
```diff
diff --git a/dashboard/package.json b/dashboard/package.json
index 3f4fe3f..90b2a32 100644
--- a/dashboard/package.json
+++ b/dashboard/package.json
@@ -8,6 +8,9 @@
     "server": "node server.js",
     "build": "vite build"
   },
+  "engines": {
+    "node": ">=20.19"
+  },
   "dependencies": {
     "express": "^5.2.1",
     "gray-matter": "^4.0.3",
```

**JSON validity** (`node -e "JSON.parse(require('fs').readFileSync('dashboard/package.json','utf8'))"`):
```text
VALID
```

**Acceptance**: `✅`

### Change 3 — .gitignore .codex

**Diff**:
```diff
diff --git a/.gitignore b/.gitignore
index 4e8e975..b702d0c 100644
--- a/.gitignore
+++ b/.gitignore
@@ -11,3 +11,6 @@ dashboard/dist/
 # OS
 .DS_Store
 Thumbs.db
+
+# Codex CLI sandbox state (personal, per-session)
+.codex
```

**grep `.codex` в .gitignore**:
```text
.codex
```

**Acceptance**: `✅`

### Change 4 — Launchers tracked

**git status before/after**:
```text
Before: ?? start-workflow.cmd, ?? start-workflow-hidden.vbs, ?? stop-workflow.cmd
After:  A  start-workflow.cmd, A  start-workflow-hidden.vbs, A  stop-workflow.cmd
```

**Content unchanged** (`git diff --cached start-workflow.cmd` should be all additions, no prior content):
```text
diff --git a/start-workflow-hidden.vbs b/start-workflow-hidden.vbs
new file mode 100644
index 0000000..cd24558
--- /dev/null
+++ b/start-workflow-hidden.vbs
@@ -0,0 +1,7 @@
+' Launches start-workflow.cmd with a hidden window.
+' Shortcut target should point here so the terminal does not stay visible.
+Set shell = CreateObject("WScript.Shell")
+Set fso = CreateObject("Scripting.FileSystemObject")
+scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
+cmdPath = scriptDir & "\start-workflow.cmd"
+shell.Run Chr(34) & cmdPath & Chr(34), 0, False
diff --git a/start-workflow.cmd b/start-workflow.cmd
new file mode 100644
index 0000000..8da96e0
--- /dev/null
+++ b/start-workflow.cmd
@@ -0,0 +1,26 @@
+@echo off
+setlocal enableextensions enabledelayedexpansion
+
+cd /d "%~dp0dashboard"
+
+rem Skip npm install when package-lock.json matches snapshot from last install
+set "STAMP=node_modules\.package-lock.snapshot"
+set "NEED_INSTALL=0"
+
+if not exist node_modules (
+  set "NEED_INSTALL=1"
+) else if not exist "%STAMP%" (
+  set "NEED_INSTALL=1"
+) else (
+  fc /b package-lock.json "%STAMP%" >nul 2>&1
+  if errorlevel 1 set "NEED_INSTALL=1"
+)
+
+if "!NEED_INSTALL!"=="1" (
+  echo Installing dependencies...
+  call npm install --no-audit --no-fund
+  if errorlevel 1 exit /b 1
+  copy /y package-lock.json "%STAMP%" >nul
+)
+
+call npm run dev
diff --git a/stop-workflow.cmd b/stop-workflow.cmd
new file mode 100644
index 0000000..08e527c
--- /dev/null
+++ b/stop-workflow.cmd
@@ -0,0 +1,6 @@
+@echo off
+setlocal
+
+echo Stopping workflow dashboard...
+call npx --yes kill-port 3003 9119
+echo Done.
```

**Acceptance**: `✅`

---

## §2 Phase 1 verification — V1 to V10

| # | Test | Raw output | Pass/Fail |
|---|------|------------|-----------|
| V1 | README exists | `EXISTS` | `✅` |
| V2 | Section count ≥6 | `8` | `✅` |
| V3 | Length 80-250 | `113 README.md` | `✅` |
| V4 | Doc links ≥5 | `6` | `✅` |
| V5 | engines field | `"engines": {` / `"node": ">=20.19"` / `},` | `✅` |
| V6 | package.json JSON valid | `VALID` | `✅` |
| V7 | .codex в gitignore | `.codex` | `✅` |
| V8 | Launchers staged | `STAGED OR ABSENT` | `✅` |
| V9 | PD scan | `(empty stdout)` | `✅` |
| V10 | Path leak | `(all three commands empty)` | `✅` |

**Total**: `10 ✅ / 0 ❌`

---

## §3 Phase 2 — `[awaits user]`

- P2.1 — User visits GitHub repo page (после user's push), confirms README renders: `awaiting`
- P2.2 — User runs `start-workflow.cmd` from clone, dashboard starts: `awaiting`

## §4 Phase 3 — `[awaits N-day]`

- P3.1 — 7-day observation. No action by Codex.

---

## §5 Discrepancies

| # | Issue | Expected | Observed | Resolution |
|---|-------|----------|----------|------------|

**Status**: `none`

---

## §6 Tools used

| Tool | Purpose | Times |
|------|---------|-------|
| `context7 query-docs` | §V1-§V3 | `3` |
| `Read` / `Bash cat` | Full-reads | `8` |
| `Write` | README.md creation | `1` |
| `Edit` | package.json + .gitignore + report | `3` |
| `Bash git add` | Stage launchers + planned artifacts | `2` |

---

## §7 Out-of-scope temptations

- `none`

---

## §8 Self-audit

- [x] 1. Pre-flight §0.1-§0.7 complete
- [x] 2. §V1-§V3 verbatim quotes matched
- [x] 3. Change 1 applied
- [x] 4. Change 2 applied
- [x] 5. Change 3 applied
- [x] 6. Change 4 applied
- [x] 7. V1-V10 all recorded
- [x] 8. V9 PD scan clean
- [x] 9. V10 path leak clean
- [x] 10. No production code modified
- [x] 11. No git commit / push
- [x] 12. Discrepancies completed
- [x] 13. Out-of-scope noted
- [x] 14. Report path correct

**Completeness**: `14 / 14`

---

## §9 Final git status

**Command**: `git status --short`
```text
M  .gitignore
A  README.md
M  dashboard/package.json
 M scripts/mailbox.mjs
A  start-workflow-hidden.vbs
A  start-workflow.cmd
A  stop-workflow.cmd
?? docs/codex-tasks/repo-readiness-polish-planning-audit.md
?? docs/codex-tasks/repo-readiness-polish-report.md
?? docs/codex-tasks/repo-readiness-polish.md
```

**Expected** (after Change 3 applies — `.codex` gitignored disappears from `git status`):
- `A README.md`
- `M dashboard/package.json`
- `M .gitignore`
- `A start-workflow.cmd`
- `A start-workflow-hidden.vbs`
- `A stop-workflow.cmd`
- `?? docs/codex-tasks/repo-readiness-polish.md`
- `?? docs/codex-tasks/repo-readiness-polish-planning-audit.md`
- `?? docs/codex-tasks/repo-readiness-polish-report.md`
- Pre-existing `M scripts/mailbox.mjs` preserved (not in scope)
- **`.codex` NOT listed** — gitignored via Change 3 takes effect immediately (subsequent git status commands exclude it)

**Match**: `✅`

---

## §10 Delivery signal

- [x] All §0-§8 filled
- [x] Self-audit ≥12/14
- [x] No "STOPPED" discrepancies

**Signature**: `Codex — 2026-04-17`

---

## §11 Notes back to Claude

- Final git state is coherent after staging planned artifacts; pre-existing `M scripts/mailbox.mjs` remained untouched.


## Legacy Workflow Note (2026-04-21)

This file is preserved as a historical artifact from an earlier workflow revision.

It may mention legacy patterns such as `Claude planner / Codex executor`, user relay, `compact prompt`, or older handoff shapes.

Do not use it as the live operating template. Current contract: `docs/codex-system-prompt.md`, `AGENTS.md`, `workflow-role-distribution.md`, `workflow-instructions-claude.md`, and `workflow-instructions-codex.md`.
