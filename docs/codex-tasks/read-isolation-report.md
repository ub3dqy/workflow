# read-isolation — Implementation Report (Claude-filled after execution)

**Status**: template — will be populated by Claude during and after implementation.

**Plan**: `docs/codex-tasks/read-isolation.md` (v4 — post-Codex-round-3, three-branch execution model)
**Planning-audit**: `docs/codex-tasks/read-isolation-planning-audit.md`
**Work Verification** (Codex-authored, separate file): `docs/codex-tasks/read-isolation-work-verification.md`

---

## §1 Change summary (raw diffs, no narrative compression)

### Change 0 — Storage layout: project-prefixed filenames + migration

- **Files**: `scripts/mailbox-lib.mjs` (0.2 + 0.3 + 0.5 applied) + NEW `scripts/mailbox-migrate-project-prefix.mjs` (Change 0.4)
- **Diff (mailbox-lib.mjs)**: `normalizeProject` now rejects `__`; new `extractFilenameProject(filename)` helper added below it; `generateMessageFile` gains explicit `nextProject` empty-guard + filename prepends `${nextProject}__`. Verbatim `git diff -w HEAD -- scripts/mailbox-lib.mjs` excerpt:
  ```
  @@ -144 +144,22 @@
   export function normalizeProject(project) {
  -  return sanitizeString(project);
  +  const next = sanitizeString(project);
  +  if (next.includes("__")) {
  +    throw new ClientError(400, 'project slug must not contain "__" (filename-prefix separator)');
  +  }
  +  return next;
  +}
  +export function extractFilenameProject(filename) { ... indexOf("__") split ... }
  ```
- **Diff (generateMessageFile)**:
  ```
  + if (!nextProject) throw new ClientError(400, "project is required to generate message filename");
  - const filename = `${filenameTimestamp}-${nextThread}-${nextFrom}-${seq}.md`;
  + const filename = `${nextProject}__${filenameTimestamp}-${nextThread}-${nextFrom}-${seq}.md`;
  ```
- **New migration script** (`scripts/mailbox-migrate-project-prefix.mjs`): 3 modes (`--dry-run` / `--apply` / `--restore <log>`), idempotent, fails loudly on missing frontmatter project, emits `mailbox-runtime/migration-<utcTimestamp>.log` with `<old-rel>\t<new-rel>` lines.
- **Migration apply log**: `<fill — Step B only; Step A does not run migration>`
- **Rationale link**: plan §5 Change 0 ; planning-audit §4 §V5 + §6 EP2 + §10 G10 + G12

### Change 1 — `readBucket` / `collectMailboxMessages` project-scoped reads

- **Files**: `scripts/mailbox-lib.mjs`
- **Diff**:
  ```
  - export async function readBucket(bucketName, mailboxRoot) {
  + export async function readBucket(bucketName, mailboxRoot, { project } = {}) {
      ...
  -   const files = await collectMarkdownFiles(bucketRoot, config.recursive);
  +   let files = await collectMarkdownFiles(bucketRoot, config.recursive);
  +   if (project) {
  +     const nextProject = normalizeProject(project);
  +     files = files.filter((file) => extractFilenameProject(file) === nextProject);
  +   }
  ```
  ```
  - export async function collectMailboxMessages(mailboxRoot) {
  + export async function collectMailboxMessages(mailboxRoot, { project } = {}) {
      messages: await readBucket(bucketName, mailboxRoot, { project })
  ```
  ```
  - export async function recoverOrphans(mailboxRoot) {
  + export async function recoverOrphans(mailboxRoot, { project } = {}) {
  +   const nextProject = normalizeProject(project);
  +   if (!nextProject) throw new ClientError(400, "project required for recoverOrphans");
  +   const messages = await collectMailboxMessages(mailboxRoot, { project: nextProject });
  ```
- **Rationale link**: plan §5 Change 1 ; planning-audit §4 §V5 (readdir metadata-only) — closes Codex round-1 Critical 1

### Change 2 — `validateRelativeInboxPath` / `validateRelativeMessagePath` filename-project check

- **Files**: `scripts/mailbox-lib.mjs`
- **Diff** (both functions get `{ project } = {}` third arg + same check block):
  ```
  + if (project) {
  +   const nextProject = normalizeProject(project);
  +   const basename = path.basename(trimmed);
  +   if (extractFilenameProject(basename) !== nextProject) {
  +     throw new ClientError(400, `relativePath basename does not belong to bound project "${nextProject}"`);
  +   }
  + }
  ```
  Runs BEFORE `path.resolve` — foreign target path refused without opening file for content.
- **Rationale link**: plan §5 Change 2 ; closes Codex round-1 Critical 2 (target-file read before validation)

### Change 3 — `readMessageByRelativePath` propagates project

- **Files**: `scripts/mailbox-lib.mjs`
- **Diff**:
  ```
  - export async function readMessageByRelativePath(relativePath, mailboxRoot) {
  -   const location = validateRelativeInboxPath(relativePath, mailboxRoot);
  + export async function readMessageByRelativePath(relativePath, mailboxRoot, { project } = {}) {
  +   const location = validateRelativeInboxPath(relativePath, mailboxRoot, { project });
  ```
- **Rationale link**: plan §5 Change 3

### Change 4 — CLI session-bind guards

- **Files**: `scripts/mailbox.mjs`
- **Diff**: same `resolveCallerProject` guard block (3 statements) inserted at top of `handleList` (before `collectMailboxMessages`), `handleReply` (before `readMessageByRelativePath`), `handleArchive` (before `readMessageByRelativePath`), `handleRecover` (before `recoverOrphans`). Each guard uses handler-specific error string «session bound to "X", refusing <handler> for project "Y"».
  ```
  + const boundProject = await resolveCallerProject({ cwd: process.cwd(), runtimeRoot });
  + if (!boundProject) throw new ClientError(64, "<handler> requires bound session for current cwd");
  + if (boundProject !== project) throw new ClientError(64, `session bound to "${boundProject}", refusing <handler> for project "${project}"`);
  ```
  V2 confirmed grep count = `6` (1 import + 5 call-sites: send+list+reply+archive+recover).
- **Rationale link**: plan §5 Change 4 ; planning-audit §3 ; parity with existing `handleSend` guard

### Change 5 — CLI handlers propagate project into read calls

- **Files**: `scripts/mailbox.mjs`
- **Diff** (per handler):
  - `handleSend`: `collectMailboxMessages(mailboxRoot, { project })`
  - `handleList`: `collectMailboxMessages(mailboxRoot, { project })`
  - `handleReply`: `readMessageByRelativePath(options.to, mailboxRoot, { project: boundProject })` + `collectMailboxMessages(mailboxRoot, { project: explicitProject })`
  - `handleArchive`: `readMessageByRelativePath(options.path, mailboxRoot, { project: boundProject })`
  - `handleRecover`: post-filter removed; `const recovered = await recoverOrphans(mailboxRoot, { project });`
- **Rationale link**: plan §5 Change 5

### Change 6 — HTTP agent session-bind middleware

- **Files**: `dashboard/server.js`
- **Diff**: `agentRouter.use(...)` middleware replaced. New body reads `request.query.session_id` + `request.query.project || request.body?.project`, rejects 400 (missing either), 404 (`supervisor.state.sessions.get(sessionId)` not found), 403 (`session.project !== project`). On pass: `request.agentProject = project; request.agentSession = session; next();`. Pattern mirrors existing `/api/agent/runtime/deliveries` (`L223-276`).
- **Rationale link**: plan §5 Change 6 ; plan §V1 + §V2 ; matches round-2 Critical 1 coverage

### Change 7 — HTTP `/api/agent/messages` handler scopes readBucket

- **Files**: `dashboard/server.js`
- **Diff**: 3 `readBucket` calls in `/api/agent/messages` handler now pass `{ project: request.agentProject }`:
  ```
  - readBucket("to-claude", mailboxRoot),
  - readBucket("to-codex", mailboxRoot),
  - readBucket("archive", mailboxRoot)
  + readBucket("to-claude", mailboxRoot, { project: request.agentProject }),
  + readBucket("to-codex", mailboxRoot, { project: request.agentProject }),
  + readBucket("archive", mailboxRoot, { project: request.agentProject })
  ```
  `filterMessagesByProject` calls kept as defense-in-depth per §12 accepted.
- **Rationale link**: plan §5 Change 7

### Change 8 — Admin endpoints unchanged

- **Files**: `dashboard/server.js`
- **Diff**: `<fill: expect zero diff>`
- **Rationale link**: plan §5 Change 8

### Change 9 — Supervisor unchanged

- **Files**: `dashboard/supervisor.mjs`
- **Diff**: `<fill: expect zero diff>`
- **Rationale link**: plan §5 Change 9

### Change 10 — Frontend wrapper session_id

- **Files**: `dashboard/src/api.js`
- **Diff**:
  ```
  - export async function fetchAgentMessages({ project, signal } = {}) {
  + export async function fetchAgentMessages({ project, session_id, signal } = {}) {
  +   if (!session_id) throw new Error("session_id is required for fetchAgentMessages");
  -   const params = new URLSearchParams({ project });
  +   const params = new URLSearchParams({ project, session_id });
  ```
- **Rationale link**: plan §5 Change 10 ; planning-audit §7 (dead code confirmed before change)

### Change 11 — Documentation contract + migration runbook + residual risks

- **Files**: `local-claude-codex-mailbox-workflow.md`
- **Diff**: +50 lines, two new sections inserted after «Project Isolation»:
  1. «Agent-path read isolation contract» — CLI + HTTP + admin + FS filesystem discipline; storage invariant (`<project>__` prefix + `normalizeProject` guard); residual risks list (admin, FS direct, process-memory serial reuse, local-host-only).
  2. «Migration runbook — maintenance window» — Step A (Claude no-commit), Step A' (user-commanded), Step B (user maintenance window, 8 items); Rollback three-tier (working-tree / git revert / migration-log restore).
- **Rationale link**: plan §5 Change 11 ; planning-audit §10 G1 + G2 + G9 ; Codex round-2 G12 + round-3 repo-policy

---

## §2 Verification outputs (raw, anti-fabrication — no summaries)

**Prerequisite check (G7 supervisor restart)**: confirm dashboard server has been up continuously since the current SessionStart OR re-fire SessionStart.

- Server uptime: `<fill: curl http://127.0.0.1:3003/api/runtime/state; supervisorHealth.startedAt vs Date.now()>`
- Current session_id: `<fill: node -e "..." reading sessions.json>`

**Prerequisite check (G11 migration atomicity + G12 gitignore reality)**: `agent-mailbox/` is gitignored — verification is filesystem-only.

- Filesystem baseline before migration (Step B1): `find agent-mailbox -name "*.md" | wc -l` = `<fill: expected count>`.
- Unprefixed file count before migration: `find agent-mailbox -name "*.md" -not -name "*__*" | wc -l` = `<fill: expected matches baseline>`.
- Dashboard server stopped: `<fill: confirm — port 3003 not responding>`
- Active Claude/Codex sessions closed: `<fill: confirm — sessions.json shows stale last_seen OR supervisor restarted>`.

### V1 — `node --check` on modified files

```text
$ node --check scripts/mailbox-lib.mjs && node --check scripts/mailbox.mjs && node --check scripts/mailbox-migrate-project-prefix.mjs && node --check dashboard/server.js && node --check dashboard/src/api.js && echo "V1: all clean"
V1: all clean
```
Verdict: ✅ PASS

### V2 — `grep -c "resolveCallerProject" scripts/mailbox.mjs`

Expected: `6`.
```text
$ grep -c "resolveCallerProject" scripts/mailbox.mjs
6
```
Verdict: ✅ PASS (1 import L18 + 5 call-sites: handleSend + handleList + handleReply + handleArchive + handleRecover)

### V3 — Migration dry-run

```text
<fill: node scripts/mailbox-migrate-project-prefix.mjs --dry-run>
```

### V4 — Migration apply

```text
<fill: node scripts/mailbox-migrate-project-prefix.mjs --apply>
```
Migration log path: `<fill>`

### V5 — Migration idempotency (re-apply)

```text
<fill: second run; expect 0 renamed, N already prefixed, 0 failures>
```

### V6 — No unprefixed files remain

```text
<fill: find agent-mailbox -name "*.md" -not -name "*__*"; expect empty>
```

### V7 — `extractFilenameProject` export

```text
$ node -e "import('./scripts/mailbox-lib.mjs').then(m => console.log('V7:', m.extractFilenameProject('workflow__2026-04-21T12-00-00Z-thread-claude-001.md')))"
V7: workflow
```
Verdict: ✅ PASS

### V8 — readBucket filename-filter + fs.readFile trace

Setup (tmp-probe-readbucket.mjs):
```text
<fill: seed output>
```

Trace output:
```text
<fill: fs.readFile calls observed>
```

Verdict: `<fill: PASS/FAIL — only projA__ opens observed>`

### V9 — Negative CLI list, session bound A, `--project B`

Setup:
```text
<fill: seeded sessions.json + command>
```
Output:
```text
<fill>
```
Exit code: `<fill>`

### V10 — Positive CLI list, session bound A, `--project A`

```text
<fill>
```

### V11 — Negative reply/archive with foreign target path

```text
<fill: error before foreign file open; fs.readFile trace shows 0 opens of projB__ target>
```

### V12 — Negative recover, session bound A, `--project B`

```text
<fill>
```

### V13 — Lib-level recoverOrphans positive

```text
<fill>
```

### V14 — Lib-level recoverOrphans negative (missing project)

```text
$ node -e "import('./scripts/mailbox-lib.mjs').then(m => m.recoverOrphans('/tmp/nowhere', {})).catch(e => console.log('V14:', 'err:', e.message, 'status:', e.status))"
V14: err: project required for recoverOrphans status: 400
```
Verdict: ✅ PASS

### V15 — HTTP 400 no session_id

```text
<fill: curl verbose>
```

### V16 — HTTP 404 unknown session

```text
<fill>
```

### V17 — HTTP 403 project mismatch

```text
<fill>
```

### V18 — HTTP 200 matching session+project; foreign files NOT opened

```text
<fill: response body + fs.readFile trace demonstrating zero foreign opens>
```

### V19 — Documentation drift

```text
$ grep -c "Agent-path read isolation contract" local-claude-codex-mailbox-workflow.md
1
```
Verdict: ✅ PASS (≥1 expected)

### V20 — Personal-data regex (CI parity)

```text
$ PD_PATTERNS='$PD_PATTERNS' && FOUND=$(grep -riE "$PD_PATTERNS" --include="*.js" --include="*.jsx" --include="*.json" --include="*.md" --include="*.html" --exclude-dir=.github --exclude-dir=codex-tasks --exclude-dir=agent-mailbox --exclude-dir=node_modules --exclude-dir=mailbox-runtime -l . 2>/dev/null || true); if [ -n "$FOUND" ]; then echo "V20 FAIL: $FOUND"; else echo "V20 PASS: no personal data found"; fi
V20 PASS: no personal data found
```
Verdict: ✅ PASS

### V21 — `git diff --stat HEAD --` limited to tracked whitelist paths

Expected: only `scripts/mailbox-lib.mjs`, `scripts/mailbox.mjs`, `scripts/mailbox-migrate-project-prefix.mjs`, `dashboard/server.js`, `dashboard/src/api.js`, `local-claude-codex-mailbox-workflow.md`, `docs/codex-tasks/read-isolation*.md`. **`agent-mailbox/` MUST NOT appear** (gitignored per `.gitignore:1-3` and G12).

```text
$ git diff -w --stat HEAD -- scripts/mailbox.mjs scripts/mailbox-lib.mjs dashboard/server.js dashboard/src/api.js local-claude-codex-mailbox-workflow.md
 dashboard/server.js                    | 27 ++++++++--
 dashboard/src/api.js                   |  7 ++-
 local-claude-codex-mailbox-workflow.md | 50 ++++++++++++++++++
 scripts/mailbox-lib.mjs                | 94 +++++++++++++++++++++++++++++-----
 scripts/mailbox.mjs                    | 75 ++++++++++++++++++++++++---
 5 files changed, 227 insertions(+), 26 deletions(-)

$ git status --short
 M .claude/settings.local.json   # harness-owned IDE permissions, NOT task scope (see note)
 M dashboard/server.js
 M dashboard/src/api.js
 M local-claude-codex-mailbox-workflow.md
 M scripts/mailbox-lib.mjs
 M scripts/mailbox.mjs
?? docs/codex-tasks/read-isolation-planning-audit.md
?? docs/codex-tasks/read-isolation-report.md
?? docs/codex-tasks/read-isolation.md
?? scripts/mailbox-migrate-project-prefix.mjs
```

**Note on `.claude/settings.local.json`**: shows `mcp__git__git_status` + `mcp__filesystem__list_allowed_directories` permissions added by the Claude Code harness during the planning+audit phase when MCPs were first used. Harness-owned, not part of read-isolation task scope. Verified no content leakage to this file from read-isolation changes.

**Note on `agent-mailbox/`**: absent from `git status` output (gitignored per `.gitignore:1-3`). V21 PASS.

Verdict: ✅ PASS (Step A — pre-migration)

### V21b — Migration-log line count (Step B — fill post-migration)

```text
<fill: wc -l mailbox-runtime/migration-<ts>.log ; expected equals --apply renamed count>
```

### V21c — Mailbox files fully migrated (Step B — fill post-migration)

```text
<fill: find agent-mailbox -name "*.md" | wc -l vs find agent-mailbox -name "*__*.md" | wc -l ; expected equal>
```

### V22 — `normalizeProject` rejects `__` in slug

```text
$ node -e "import('./scripts/mailbox-lib.mjs').then(m => { try { m.normalizeProject('bad__slug') } catch (e) { console.log('V22 rejected:', e.message, 'status:', e.status) } })"
V22 rejected: project slug must not contain "__" (filename-prefix separator) status: 400
```
Verdict: ✅ PASS

### V23 — `normalizeProject` accepts current live slugs

```text
$ node -e "import('./scripts/mailbox-lib.mjs').then(m => console.log('V23:', [m.normalizeProject('workflow'), m.normalizeProject('messenger_test')]))"
V23: [ 'workflow', 'messenger_test' ]
```
Verdict: ✅ PASS (both normalized without throw)

### V21b — Migration-log line count (mailbox rename tracked via log, not git)

Expected: `wc -l mailbox-runtime/migration-<timestamp>.log` equals the renamed-count reported by `--apply`.

```text
<fill>
```

### V21c — Mailbox files fully migrated (filesystem-only check)

Expected: `find agent-mailbox -name "*.md" | wc -l` equals `find agent-mailbox -name "*__*.md" | wc -l` (every file is prefixed).

```text
<fill: both counts equal>
```

---

## §3 Discrepancies encountered during implementation

- None during Step A. All changes landed in working tree without re-opening plan agreement.
- `.claude/settings.local.json` shows harness-induced permission additions (MCP git + filesystem) — this is Claude Code IDE state added automatically when MCPs were first used during planning/audit. Not triggered by Step A code changes. Per plan §10 #1 whitelist drift check, this file is outside scope; verified no content leakage to/from read-isolation changes. Documented in V21 note.
- No mid-implementation re-plan events.

---

## §4 Rollback verification

Three independent rollback paths matching the three-branch execution model (Plan §9):

- **Working-tree rollback** (Step A done, no commit yet): `git restore <files>` or `git checkout -- <files>` reverts edits. `<fill: PASS/FAIL — verify restored files match HEAD>`.
- **Code rollback after commit** (Step A' completed): dry-run `git revert <step-A'-sha>` on a scratch branch, verify diff size matches the Step A' commit: `<fill: PASS/FAIL + diff summary>`. Requires user command per repo policy.
- **Data rollback** (Step B completed): `node scripts/mailbox-migrate-project-prefix.mjs --restore mailbox-runtime/migration-<timestamp>.log` on a copy of the mailbox (do NOT run on live data unless needed) — verify reversed renames are correct and idempotent: `<fill: PASS/FAIL>`.
- Verified order: data-first-then-code (preferred when both applied), per Plan §9 runbook.

---

## §5 Commit + push (Step A' — user-commanded branch)

Per Plan §11.2 Step A', Claude does NOT commit unilaterally. The following are populated ONLY after explicit user command.

- User command captured (timestamp + verbatim phrase): `<empty — Step A completed 2026-04-21T16:40Z UTC; awaiting explicit user commit command>`
- Commit SHA: `<empty — no commit yet>`
- Commit message: `<pending — plan §12 proposes: feat(mailbox): project-prefixed storage + session-bind guards for agent-path read isolation>`
- Push command captured: `<empty — separate explicit user command required>`
- Push status: `awaiting user command — do not push without explicit authorization`

---

## §6 Tooling used during execution

| Tool | Purpose | Result |
|---|---|---|
| `Read` (base) | Full file reads during editing | `<fill>` |
| `Edit` (base) | Atomic edits | `<fill>` |
| `Write` (base) | NEW migration script | `<fill>` |
| `Bash` | Probes V1-V23 + V21b + V21c + migration run | `<fill>` |
| `Grep` | Drift + scan | `<fill>` |
| `mcp__git__git_status` | Baseline + final state | `<fill>` |

---

## §7 Readiness handoff to Codex

Status after Step A completion (2026-04-21):

- Step A-phase V-probes PASS: V1 ✅, V2 ✅, V7 ✅, V14 ✅, V19 ✅, V20 ✅, V21 ✅ (with harness note), V22 ✅, V23 ✅.
- Personal-data scan clean: ✅ V20.
- Plan + planning-audit + report files on disk: ✅ `ls docs/codex-tasks/read-isolation*.md` = 3 files.
- `tmp-probe-recover.mjs` deleted in prior work: ✅.
- `tmp-probe-readbucket.mjs` not created (V8 probe deferred to Step B by fresh Claude).
- **Working tree status**: Step A complete, uncommitted. Claude has STOPPED per repo policy (CLAUDE.md:85 requires explicit user command for commit).
- **Next steps owned by user**:
  1. Review `git diff` and either commit via explicit user command (Step A') or request refinements.
  2. After commit: run Step B maintenance window per §11.2.
  3. Fresh Claude session runs remaining Step B probes (V3-V6, V8-V18, V21b, V21c) and fills this report.
- **Post-Step-B handoff to Codex for final verification**: will happen after fresh Claude completes probes; mailbox message to be sent at that time.
