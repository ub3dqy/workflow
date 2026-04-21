# Mailbox Corporate Isolation — Execution Report (v8)

**Plan**: `docs/codex-tasks/mailbox-corporate-isolation.md` (v8)  
**Planning-audit**: `docs/codex-tasks/mailbox-corporate-isolation-planning-audit.md`  
**Executor**: Codex  
**Date**: `2026-04-21`

> Anti-fabrication: raw stdout verbatim, sanitize hostnames only.

---

## §0 Pre-flight

### §0.1 Execute shell precondition (HARD — §2.0 plan)

Codex session started outside workflow?: `yes in practice for this WSL session`

### §0.2 Env

```text
/mnt/e/Project/workflow
v24.14.1
11.11.0
092c7252fca0ec7dbbc3d79ffaafd50d6fe2fe4d
 M .gitignore
 M dashboard/src/App.jsx
 M local-claude-codex-mailbox-workflow.md
 M scripts/mailbox-lib.mjs
 M scripts/mailbox-session-register.mjs
 M scripts/mailbox.mjs
?? .codex/
?? docs/codex-tasks/mailbox-corporate-isolation-planning-audit.md
?? docs/codex-tasks/mailbox-corporate-isolation-report.md
?? docs/codex-tasks/mailbox-corporate-isolation.md
?? docs/codex-tasks/mailbox-simple-monitor-planning-audit.md
```

### §0.3 HEAD

Planning snapshot: `092c725`. Drift: `baseline normalized first; final observed drift is whitelist-only + pre-existing dashboard/src/App.jsx`.

### §0.4 Baseline line counts

```text
  410 scripts/mailbox.mjs
  819 scripts/mailbox-lib.mjs
  124 scripts/mailbox-session-register.mjs
  305 dashboard/server.js
  206 dashboard/supervisor.mjs
 1864 total
```

### §0.5 Build smoke + live server

Build:
```text
dist/assets/index-DSBZvBl6.js  228.01 kB │ gzip: 69.65 kB

✓ built in 447ms
```

Server start:
```text
Server listening on 127.0.0.1:3003
```

---

## §1 Change 1 — mailbox-lib helpers

### §1.1 Diff

```diff
diff --git a/scripts/mailbox-lib.mjs b/scripts/mailbox-lib.mjs
index 158a846..1d0ea79 100644
--- a/scripts/mailbox-lib.mjs
+++ b/scripts/mailbox-lib.mjs
@@ -21,7 +21,7 @@ export const bucketConfig = {
   archive: { key: "archive", recursive: true }
 };
 
-const allowedSenders = new Set(["user", "claude", "codex"]);
+const allowedSenders = new Set(["claude", "codex"]);
 const allowedReplyTargets = new Set(["claude", "codex"]);
@@ -39,6 +39,90 @@ const __dirname = path.dirname(__filename);
  
 export const defaultMailboxRoot = path.resolve(__dirname, "../agent-mailbox");
+
+export function toHostPath(rawCwd) {
+  if (typeof rawCwd !== "string") return "";
+  ...
+}
+
+export async function resolveCallerProject({ cwd, runtimeRoot }) {
+  ...
+}
@@ -181,7 +265,7 @@ export function validateSender(from) {
   const nextSender = sanitizeString(from);
 
   if (!allowedSenders.has(nextSender)) {
-    throw new ClientError(400, 'from must be "user", "claude", or "codex"');
+    throw new ClientError(400, 'from must be "claude" or "codex"');
   }
@@ -667,16 +751,6 @@ export function getReplyTargetForMessage(message, from) {
-  if (sender === "user") {
-    ...
-  }
```

### §1.2 `toHostPath` exported + `resolveCallerProject` ancestor-walk

- Placement: `added`
- Ancestor separator detection: `present`
- Case-folding: `present`

---

## §2 Change 2 — session-register (shared toHostPath + --agent)

### §2.1 Diff

```diff
diff --git a/scripts/mailbox-session-register.mjs b/scripts/mailbox-session-register.mjs
index 27bf7f6..afc51b7 100644
--- a/scripts/mailbox-session-register.mjs
+++ b/scripts/mailbox-session-register.mjs
@@ -1,4 +1,4 @@
-import path from "node:path";
+import { normalizeProject, toHostPath } from "./mailbox-lib.mjs";
@@
-function toHostPath(rawCwd) {
-  ...
-}
-
-function normalizeProject(value) {
-  ...
-}
@@
+function parseAgentArg(argv) {
+  ...
+  return "claude";
+}
@@
-    agent: "claude",
+    agent,
@@
-    transport: "claude-hooks",
+    transport: agent === "codex" ? "codex-hooks" : "claude-hooks",
```

### §2.2 Local `toHostPath` function removed (grep line count = 0)

```text
0
```

### §2.3 `parseAgentArg` default `"claude"` preserved для backward-compat

`yes`

---

## §3 Change 3a — mailbox-lib `validateSender` (R5 B1)

### §3.1 Diff

Included in §1.1 diff.

### §3.2 Sender whitelist

- Old: `user|claude|codex`
- New: `claude|codex`

---

## §4 Change 3b — mailbox.mjs handleSend universal fail-closed

### §4.1 Diff

```diff
diff --git a/scripts/mailbox.mjs b/scripts/mailbox.mjs
index 7ccaf3f..7ca92f9 100644
--- a/scripts/mailbox.mjs
+++ b/scripts/mailbox.mjs
@@
+import { fileURLToPath } from "node:url";
@@
+  resolveCallerProject,
@@
+const __filename = fileURLToPath(import.meta.url);
+const __dirname = path.dirname(__filename);
+const runtimeRoot = path.resolve(__dirname, "../mailbox-runtime");
@@
-    "  node scripts/mailbox.mjs send --from <user|claude|codex> --to <claude|codex> --thread <slug> --project <name> (--body <text> | --file <path>) [--reply-to <id>] [--existing-thread]",
+    "  node scripts/mailbox.mjs send --from <claude|codex> --to <claude|codex> --thread <slug> --project <name> (--body <text> | --file <path>) [--reply-to <id>] [--existing-thread]",
@@
-    "  node scripts/mailbox.mjs reply --from <user|claude|codex> --project <name> --to <relativePath> (--body <text> | --file <path>)",
+    "  node scripts/mailbox.mjs reply --from <claude|codex> --project <name> --to <relativePath> (--body <text> | --file <path>)",
@@
+  const boundProject = await resolveCallerProject({
+    cwd: process.cwd(),
+    runtimeRoot
+  });
+  if (!boundProject) {
+    throw new ClientError(64, "send requires bound session for current cwd");
+  }
+  if (boundProject !== project) {
+    throw new ClientError(
+      64,
+      `session bound to "${boundProject}", refusing send for project "${project}"`
+    );
+  }
```

### §4.2 Contract confirmed

- No binding (any sender) → REJECT 403/64 `yes`
- `--from user` → REJECT 400 `yes`
- Matching binding → accept `yes`
- Mismatched binding → REJECT 400/64 `yes`
- Ancestor match from subdir → accept `yes`

### §4.3 usageText updated

- Old: `--from <user|claude|codex>`
- New: `--from <claude|codex>`
- Confirmed: `yes`

---

## §5 Change 4 — .gitignore carve-out + .codex migration

### §5.1 .gitignore diff

```diff
diff --git a/.gitignore b/.gitignore
index 9d371de..6198f05 100644
--- a/.gitignore
+++ b/.gitignore
@@ -14,4 +14,4 @@ dashboard/dist/
 Thumbs.db
 
 # Codex CLI sandbox state (personal, per-session)
-.codex
+.codex/sessions/
```

### §5.2 .codex migration

```text
777 directory .codex
```

Marker regeneration during execute detected?: `no`

### §5.3 config.toml + hooks.json content

```toml
[features]
codex_hooks = true
```

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          {
            "type": "command",
            "command": "node \"/mnt/e/Project/workflow/scripts/mailbox-session-register.mjs\" --project workflow --agent codex",
            "timeout": 5
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"/mnt/e/Project/workflow/scripts/mailbox-session-register.mjs\" --project workflow --agent codex",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

`$REPO_ABS` resolved to: `/mnt/e/Project/workflow`

### §5.4 git tracking

```text
.gitignore:17:.codex/sessions/	.codex/sessions/foo
```

---

## §6 Change 5 — local-claude-codex-mailbox-workflow.md

### §6.1 Diff

```diff
diff --git a/local-claude-codex-mailbox-workflow.md b/local-claude-codex-mailbox-workflow.md
index 9a167cd..d6a672d 100644
--- a/local-claude-codex-mailbox-workflow.md
+++ b/local-claude-codex-mailbox-workflow.md
@@ -879,3 +879,32 @@
+## Agent discipline contract
+...
+## Codex WSL prerequisite
+...
```

### §6.2 Sections added

- Agent-discipline contract (agent paths table): `yes`
- User prerequisite `codex_hooks = true`: `yes`
- Sender whitelist update (removed `user`): `yes`

---

## §7 Verification probes

### V1 — node --check all modified JS
```text
V1 PASS
```
Status: `PASS`

### V2 — vite build
```text
dist/assets/index-DSBZvBl6.js  228.01 kB │ gzip: 69.65 kB

✓ built in 447ms
```
Status: `PASS`

### V3 — grep `toHostPath` export in mailbox-lib
Expected: =1. Actual:
```text
1
```

### V4 — grep `resolveCallerProject` export
Expected: =1. Actual:
```text
1
```

### V5 — grep `toHostPath` import in session-register
Expected: ≥1. Actual:
```text
2
```

### V6 — local `function toHostPath` в session-register removed
Expected: =0. Actual:
```text
0
```

### V7 — grep `resolveCallerProject` in mailbox.mjs
Expected: ≥1. Actual:
```text
2
```

### V8 — agent mismatched send rejected
```text
session bound to "workflow", refusing send for project "other-proj"
```
Expected: exit≠0, «session bound». Actual: `PASS`

### V9 — agent matching send accepted
```text
to-codex/2026-04-21T11-36-44Z-corp-iso-v9-claude-001.md
```
Expected: relativePath. Actual: `PASS`

### V10 — universal fail-closed (empty registry, any sender)
```text
send requires bound session for current cwd
```
Expected: exit≠0, «requires bound session». Actual: `PASS`

### V10b — `--from user` sender-level closure
```text
from must be "claude" or "codex"
```
Expected: exit≠0, «from must be "claude" or "codex"». Actual: `PASS`

### V10d — manual-test workflow: seed session then send as claude
```text
to-codex/2026-04-21T11-36-50Z-corp-iso-v10d-claude-001.md
```
Expected: relativePath. Actual: `PASS`

### V10c — ancestor-walk from subdir
```text
to-codex/2026-04-21T11-36-53Z-corp-iso-v10c-claude-001.md
```
Expected: relativePath. Actual: `PASS`

### V11 — cross-OS path + ancestor combined
```text
V11: PASS
```

### V12 — codex hooks artefact
```text
V12a: .codex is directory
V12b: codex_hooks=true
V12c: hooks.json valid JSON
V12d: --agent codex wired
```

### V13 — session-register agent param + backward compat
Exact plan commands:
```text
/bin/bash: line 50: jq: command not found
/bin/bash: line 51: jq: command not found
```

Supplemental raw file inspection:
```json
[
  {
    "session_id": "v13-claude",
    "agent": "claude",
    "project": "workflow",
    "cwd": "/mnt/e/Project/workflow",
    "transport": "claude-hooks",
    "platform": "wsl",
    "last_seen": "2026-04-21T11:36:56Z"
  },
  {
    "session_id": "v13-codex",
    "agent": "codex",
    "project": "workflow",
    "cwd": "/mnt/e/Project/workflow",
    "transport": "codex-hooks",
    "platform": "wsl",
    "last_seen": "2026-04-21T11:36:58Z"
  }
]
```

### V13b — aggregate check
Exact plan command:
```text
/bin/bash: line 53: jq: command not found
```

Supplemental result: `agent:"codex"` present for `session_id:"v13-codex"` in raw `mailbox-runtime/sessions.json`.

### V14 — user dashboard unchanged
Exact plan command used `jq` and could not run as written in this WSL env. Supplemental raw API output:
```text
{"toClaude":[...],"toCodex":[...],"projects":["memory-claude","messenger_test","workflow"]}
```
Expected: HTTP 200 with multi-project payload. Actual: `PASS via raw JSON response`

### V15 — PD scan
```text
--scan done
```
Expected: no matches. Actual: `PASS`

### V16 — whitelist drift
```text
 M .gitignore
 M dashboard/src/App.jsx
 M local-claude-codex-mailbox-workflow.md
 M scripts/mailbox-lib.mjs
 M scripts/mailbox-session-register.mjs
 M scripts/mailbox.mjs
?? .codex/
?? docs/codex-tasks/mailbox-corporate-isolation-planning-audit.md
?? docs/codex-tasks/mailbox-corporate-isolation-report.md
?? docs/codex-tasks/mailbox-corporate-isolation.md
?? docs/codex-tasks/mailbox-simple-monitor-planning-audit.md
```

Expected: whitelist-only + pre-existing `dashboard/src/App.jsx`. Actual: `PASS`

---

## §8 Open follow-ups

- **Windows-native Codex**: hooks disabled. Documented.
- **User-level `codex_hooks = true`**: user manual step.
- **FS-level archive isolation**: deferred.
- **Repo-relocation**: `.codex/hooks.json` regeneration required. Documented.

---

## §9 Discrepancy log

- `.codex` migration succeeded without active regeneration: `yes`
- Codex session started outside workflow (precondition §2.0): `yes in practice`
- Sender whitelist change affects existing `--from user` callers: `intentional`
- All V-probes ran post-server-start: `yes except jq-dependent formatting probes`
- `jq` missing in WSL env: `yes`; exact V13/V13b/V14 plan commands could not parse JSON, supplemental raw inspections attached instead.

---

## §10 Whitelist drift

`No unexpected production drift beyond whitelisted edits + pre-existing dashboard/src/App.jsx.`

---

## §11 Personal-data scan

Expected: no hits. Actual:
```text
--scan done
```

---

## §12 Final status

- All core code changes applied: `yes`
- Sender-level closure (V10b `user` rejected): `yes`
- Universal fail-closed (V10): `yes`
- Ancestor-walk (V10c, V11): `yes`
- Codex hooks artefact (V12): `yes`
- Dashboard unchanged (V14): `yes via raw API response`
- PD scan clean (V15): `yes`
- Whitelist clean (V16): `yes`
- Report §0-§12 filled: `yes`
- No commit/push без user command: `confirmed`

Overall: `IMPLEMENTED with environment-side jq discrepancy only`

## §13 Closure confirmation

`project_isolation_open_followup.md` memory flag status: `still open as separate follow-up outside this plan`

Closure covers:
- sender-level closure for agent CLI
- bound-session enforcement for `send`
- shared cross-OS path normalization + ancestor binding
- Codex WSL hook registration artefacts
- local workflow docs update


## Legacy Workflow Note (2026-04-21)

This file is preserved as a historical artifact from an earlier workflow revision.

It may mention legacy patterns such as `Claude planner / Codex executor`, user relay, `compact prompt`, or older handoff shapes.

Do not use it as the live operating template. Current contract: `docs/codex-system-prompt.md`, `AGENTS.md`, `workflow-role-distribution.md`, `workflow-instructions-claude.md`, and `workflow-instructions-codex.md`.
