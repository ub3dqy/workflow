# Mailbox Project Isolation — Execution Report

**Plan**: `docs/codex-tasks/mailbox-project-isolation.md`
**Planning-audit**: `docs/codex-tasks/mailbox-project-isolation-planning-audit.md`
**ТЗ source**: `docs/codex-tasks/mailbox-project-isolation-tz.md`
**Executor**: Codex
**Date**: `2026-04-19`

> Anti-fabrication: raw stdout verbatim, sanitize hostnames only.

---

## §0 Pre-flight

### §0.1 Env

```text
v24.14.1
v24.14.1
11.11.0
92231a4
?? docs/codex-tasks/mailbox-auto-pickup-supervisor-tz.md
?? docs/codex-tasks/mailbox-project-isolation-planning-audit.md
?? docs/codex-tasks/mailbox-project-isolation-report.md
?? docs/codex-tasks/mailbox-project-isolation-tz.md
?? docs/codex-tasks/mailbox-project-isolation.md
?? docs/codex-tasks/mailbox-supervisor-phase-a-planning-audit.md
?? docs/codex-tasks/mailbox-supervisor-phase-a-report.md
?? docs/codex-tasks/mailbox-supervisor-phase-a.md
```

### §0.2 HEAD

```text
92231a4
fix(mailbox): remove implicit user reply sender
```

Planning snapshot: `92231a4`. Drift: `none`.

### §0.3 Baseline line counts (P2)

```text
   674 scripts/mailbox-lib.mjs
   322 scripts/mailbox.mjs
   159 dashboard/server.js
    61 dashboard/src/api.js
  1544 dashboard/src/App.jsx
   796 local-claude-codex-mailbox-workflow.md
    16 .gitignore
    26 dashboard/package.json
  3598 total
```

| File | Plan | Actual | Δ | Verdict |
|------|------|--------|---|---------|
| `scripts/mailbox-lib.mjs` | 674 | `674` | `0` | `PASS` |
| `scripts/mailbox.mjs` | 322 | `322` | `0` | `PASS` |
| `dashboard/server.js` | 159 | `159` | `0` | `PASS` |
| `dashboard/src/api.js` | 61 | `61` | `0` | `PASS` |
| `dashboard/src/App.jsx` | 1544 | `1544` | `0` | `PASS` |
| `local-claude-codex-mailbox-workflow.md` | 796 | `796` | `0` | `PASS` |
| `.gitignore` | 16 | `16` | `0` | `PASS` |
| `dashboard/package.json` | 26 | `26` | `0` | `PASS` |

### §0.4 Pre-edit tree

```text
?? docs/codex-tasks/mailbox-auto-pickup-supervisor-tz.md
?? docs/codex-tasks/mailbox-project-isolation-planning-audit.md
?? docs/codex-tasks/mailbox-project-isolation-report.md
?? docs/codex-tasks/mailbox-project-isolation-tz.md
?? docs/codex-tasks/mailbox-project-isolation.md
?? docs/codex-tasks/mailbox-supervisor-phase-a-planning-audit.md
?? docs/codex-tasks/mailbox-supervisor-phase-a-report.md
?? docs/codex-tasks/mailbox-supervisor-phase-a.md
```

### §0.5 P3 empirical received_at fallback

```text
legacy fallback ok: true
```

Verdict: `PASS`.

### §0.6 P4 baseline build

```text
computing gzip size...
dist/index.html                  0.39 kB │ gzip:  0.27 kB
dist/assets/index-DCZjQHMY.js  221.60 kB │ gzip: 68.43 kB

✓ built in 658ms
```

Verdict: `PASS after authorized npm install repair; original FAIL retained in §5 Discrepancies`.

### §0.7 P5 existing routes

```text
39:app.get("/api/messages", async (request, response) => {
64:app.get("/api/messages/:dir", async (request, response) => {
87:app.post("/api/archive", async (request, response) => {
124:app.post("/api/notes", async (request, response) => {
157:app.listen(port, host, () => {
```

Verdict: `PASS`.

### §0.8 WORKFLOW_ROOT

```text
/mnt/e/Project/workflow
```

---

## §1 Changes applied

### Change 1 — `scripts/mailbox-lib.mjs`

```diff
@@
+export function validateProjectScope(currentProject, message) {
+  const nextCurrent = normalizeProject(currentProject);
+  ...
+}
@@
+    received_at: toMessageTimestamp({
+      data: { created: parsed.data.received_at ?? parsed.data.created }
+    }),
@@
-    created
+    created,
+    received_at: created
@@
-      answerMessageId: matchingReply.id
+      answerMessageId: matchingReply.id,
+      project: message.project || ""
```

Substeps: `1.1 validateProjectScope`, `1.2 readMessage received_at fallback`, `1.3 generateMessageFile writes received_at`, `1.4 recoverOrphans propagates project`.

### Change 2 — `scripts/mailbox.mjs`

```diff
@@
-    "  node scripts/mailbox.mjs send --from <user|claude|codex> --to <claude|codex> --thread <slug> [--project <name> | auto=basename(cwd)] (--body <text> | --file <path>) [--reply-to <id>] [--existing-thread]",
+    "  node scripts/mailbox.mjs send --from <user|claude|codex> --to <claude|codex> --thread <slug> --project <name> (--body <text> | --file <path>) [--reply-to <id>] [--existing-thread]",
@@
-  const explicitProject = normalizeProject(options.project);
-  const project = explicitProject || path.basename(process.cwd());
+  const project = normalizeProject(options.project);
+  if (!project) {
+    throw new ClientError(64, "--project is required ...");
+  }
@@
+  validateProjectScope(explicitProject, targetMessage);
@@
+  const allRecovered = await recoverOrphans(mailboxRoot);
+  const recovered = allRecovered.filter((item) => item.project === project);
```

Substeps: `2.1 send requires project`, `2.2 list requires project`, `2.3 recover requires project`, `2.4 reply scope-check`, `2.5 archive scope-check`, `2.6 import/usage text update`.

### Change 3 — `dashboard/server.js`

```diff
@@
+const agentRouter = express.Router();
+agentRouter.use((request, response, next) => {
+  const project = normalizeProject(request.query.project || request.body?.project);
+  if (!project) {
+    response.status(400).json({ error: "project query/body param is required for /api/agent/*" });
+    return;
+  }
+  request.agentProject = project;
+  next();
+});
+agentRouter.get("/messages", async (request, response) => {
+  ...
+  response.json({ toClaude, toCodex, archive, project: request.agentProject });
+});
+app.use("/api/agent", agentRouter);
```

### Change 4 — `dashboard/src/api.js`

```diff
@@
+export async function fetchAgentMessages({ project, signal } = {}) {
+  if (!project) {
+    throw new Error("project is required for fetchAgentMessages");
+  }
+  ...
+}
```

### Change 5 — `dashboard/src/App.jsx`

```diff
@@
+    timestampSent: "Отправлено",
+    timestampReceived: "Получено",
+    timestampArchived: "Архивировано",
@@
+    timestampSent: "Sent",
+    timestampReceived: "Received",
+    timestampArchived: "Archived",
@@
+  .cardTimestamps {
+    display: flex;
+    flex-direction: column;
+    ...
+  }
+  .timestampLabel {
+    font-weight: 700;
+    color: var(--text-accent);
+  }
@@
-        <div className="timestamp">{formatTimestamp(message.created, lang, t)}</div>
+        <div className="cardTimestamps">
+          ...
+        </div>
```

Substeps: `5.1 translations`, `5.2 JSX timestamps block`, `5.3 CSS styles`.

### Change 6 — `local-claude-codex-mailbox-workflow.md`

```diff
@@
+### Project field is mandatory
+...
+### `received_at` timestamp field
+...
```

---

## §2 Phase 1 V1-V9

| # | Check | Output | Pass/Fail |
|---|-------|--------|-----------|
| V1 | validateProjectScope export | `function` | `PASS` |
| V2 | send без --project → 64 error | `--project is required (agent-path isolation); cwd autodetect removed per ТЗ` + `EXIT:64` | `PASS` |
| V3 | list без --project → 64 error | `--project is required (agent-path list must be scoped to one project)` + `EXIT:64` | `PASS` |
| V4 | /api/agent без project → 400 | `FAIL: our server not up` + `Server listening on 127.0.0.1:3003` | `FAIL (plan command shell trap; see §5 #2)` |
| V5 | /api/agent?project=workflow → filtered | `project: workflow counts: 0 1 41` then command required external cleanup due hung wait | `FAIL (plan command shell trap; see §5 #3)` |
| V6 | build | `computing gzip size...` / `dist/assets/index-oPWeeW0F.js  222.58 kB` / `✓ built in 599ms` | `PASS` |
| V7 | spec carve-out grep | `1` + `3` | `PASS` |
| V8 | personal data scan | `--scan done` | `PASS` |
| V9 | git status | `M` on 6 whitelist files + expected `??` handoff artefacts only | `PASS` |

---

## §3 Phase 2 `[awaits user]`

- P2.1 Dashboard 3-timestamp labels: `[awaits user]`
- P2.2 Sent/Received совпадают для pending, Archived скрыт: `[awaits user]`
- P2.3 Archived card показывает все 3 timestamps: `[awaits user]`
- P2.4 `/api/agent/messages?project=workflow` filtered: `[awaits user]`
- P2.5 CLI list без --project → 64 error: `[awaits user]`
- P2.6 CLI list --project=workflow работает: `[awaits user]`

---

## §4 Phase 3

N/A.

---

## §5 Discrepancies

| # | Issue | Expected | Observed | Resolution |
|---|-------|----------|----------|------------|
| 1 | P4 baseline build broken before execution | `cd dashboard && npx vite build` succeeds pre-change | `rolldown` Linux native binding missing (`@rolldown/binding-linux-x64-gnu`) and build exits 1 before any whitelist edit | Repaired via user-authorized `cd /mnt/e/Project/workflow/dashboard && npm install`; no `dashboard/package-lock.json` drift remained; re-run P4 passed |
| 2 | Literal V4 command false-fails | `kill -0 $SERVER_PID` should prove the started server owns port 3003, then curl returns 400 JSON | Exact plan command printed `FAIL: our server not up` even though log already contained `Server listening on 127.0.0.1:3003` | Supplemental smoke with `cd dashboard; node server.js ... & SERVER_PID=$!` confirmed expected 400 + JSON body. Root cause: plan command backgrounds a shell shape where `SERVER_PID` is not the listener PID |
| 3 | Literal V5 command prints filtered counts but does not terminate cleanly | `project: workflow counts: ...` and clean shutdown | Exact plan command printed `project: workflow counts: 0 1 41` but then hung until external cleanup | Supplemental smoke with corrected backgrounding confirmed filtered response. Root cause same as #2 (`SERVER_PID`/`wait` trap in plan command) |

---

## §6 Tools

| Tool | Times |
|------|-------|
| `exec_command` | `22` |
| `apply_patch` | `7` |

---

## §7 Out-of-scope temptations

`Editing docs/codex-tasks/mailbox-project-isolation.md to “fix” the V4/V5 shell commands. Not done; execution stayed within whitelist + report.`

---

## §8 Self-audit

- [x] 1: P1-P5 pre-flight OK
- [x] 2: Change 1 applied
- [x] 3: Change 2 applied (6 substeps)
- [x] 4: Change 3 applied
- [x] 5: Change 4 applied
- [x] 6: Change 5 applied (3 substeps)
- [x] 7: Change 6 applied
- [x] 8: V1-V9 recorded verbatim
- [x] 9: V9 whitelist drift clean
- [x] 10: No commit/push performed
- [x] 11: Discrepancies recorded
- [x] 12: Report §0-§11 filled

---

## §9 Final git status

```text
 M dashboard/server.js
 M dashboard/src/App.jsx
 M dashboard/src/api.js
 M local-claude-codex-mailbox-workflow.md
 M scripts/mailbox-lib.mjs
 M scripts/mailbox.mjs
?? docs/codex-tasks/mailbox-auto-pickup-supervisor-tz.md
?? docs/codex-tasks/mailbox-project-isolation-planning-audit.md
?? docs/codex-tasks/mailbox-project-isolation-report.md
?? docs/codex-tasks/mailbox-project-isolation-tz.md
?? docs/codex-tasks/mailbox-project-isolation.md
?? docs/codex-tasks/mailbox-supervisor-phase-a-planning-audit.md
?? docs/codex-tasks/mailbox-supervisor-phase-a-report.md
?? docs/codex-tasks/mailbox-supervisor-phase-a.md
```

Expected (execution artefacts):
- `M scripts/mailbox-lib.mjs`
- `M scripts/mailbox.mjs`
- `M dashboard/server.js`
- `M dashboard/src/api.js`
- `M dashboard/src/App.jsx`
- `M local-claude-codex-mailbox-workflow.md`
- `?? docs/codex-tasks/mailbox-project-isolation{,-planning-audit,-report}.md`

Plus preserved baseline drift в §0.4 — unchanged.

---

## §10 Delivery signal

- [x] All sections filled
- [x] ≥10/12 ✅ in §8
- [x] No commit/push performed

Signature: `Codex`

---

## §11 Notes back

`Execution completed with three recorded discrepancies: one repaired environment issue (P4 rolldown binding drift) and two plan-command shell traps in literal V4/V5. Code changes are on disk; no commit/push performed.`
