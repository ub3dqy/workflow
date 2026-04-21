# read-isolation — True file-read isolation via project-prefixed storage

**Version**: 4 (post-Codex-round-3 — addresses 1 Critical + 1 Mandatory from `2026-04-21T15:50:15Z-codex-004` about commit authorization policy + report-template staleness)
**Thread**: `read-isolation` (agent mail)
**Planning-audit**: `docs/codex-tasks/read-isolation-planning-audit.md` (all evidence traced)
**Executor**: Claude (per new sequential workflow — `docs/codex-system-prompt.md` + `claude_system_prompt.md`)
**Reviewer / Verifier**: Codex (plan agreement + post-implementation verification)
**Prior task**: `mailbox-corporate-isolation` (commit `3870c21`) — closed `send` agent-path WRITE leak.

---

## 1. Why this plan exists

User task (2026-04-21, verbatim): «агенты не могли читать письма из других проектов».

**What changed from v1**: Codex round-1 review (`2026-04-21T14:13:53Z-codex-002`) found that v1's flag-level session-bind + `recoverOrphans` scope fix did NOT close true file-read isolation:

- `handleList / handleReply / handleRecover / handleSend` all call `collectMailboxMessages(mailboxRoot)` (`mailbox.mjs:156/195/254/recoverOrphans→767`) which reads EVERY mailbox file across all projects into the Node process BEFORE any filter. Flag-level rejection prevents USE of foreign content but not PARSE.
- `handleReply / handleArchive` call `readMessageByRelativePath` BEFORE `validateProjectScope` (`mailbox.mjs:248-249`, `308-309`). A session bound to A with foreign target path parses the foreign file before the project-mismatch is detected.
- Claim «agents cannot read other projects» was therefore overstated for agent-path CLI (true for flag-level auth, false for actual file reads).

**Resolution**: redesign storage so project is encoded in the FILENAME, and every read path filters filenames by project BEFORE opening files for content. This closes both Critical findings at code level and lets us keep the original truthfulness claim without downgrade.

Residuals remain only at human-admin endpoints (explicit non-goal) and direct `fs.readFile` of `agent-mailbox/*` by a rogue agent (discipline contract — unenforceable in-repo).

---

## 2. Иерархия источников правды

1. Official documentation (Express 5.2, Node.js v24.x url/fs + readdir).
2. User's explicit instruction (verbatim quote §1).
3. Factual probes — planning-audit §5 (grep call-sites), §6 (empirical EP1 cross-project mutation + EP2 readBucket filename-filter contract).
4. Codex review remarks — `2026-04-21T13:13:01Z-codex-001` (synthesis) + `2026-04-21T14:13:53Z-codex-002` (v1 critical findings).
5. Wiki — contextual memory only.

**Conflict rule**: if empirical probes contradict the plan during implementation, STOP and re-open agreement before continuing (per workflow rule 9).

---

## 3. Doc Verification (§V1-§V5)

(See planning-audit §4 for full verbatim quotes and URLs.)

- **§V1** — Express 5 router-level middleware short-circuits on early `res.status().json()` return. Source: `/expressjs/express/v5.2.0` context7.
- **§V2** — Express 5 router mounting via `app.use('/prefix', router)` preserves middleware order. Same source.
- **§V3** — Node v24.x `url.fileURLToPath` is cross-platform and must not be relied upon alone for traversal prevention. Source: `nodejs.org/docs/latest-v24.x/api/url.json` via context7.
- **§V4** — Node v24.x Windows file URL conversion. Informational.
- **§V5** — Node v24.x `fs.readdir` returns filenames only; no content read. Filtering by basename before `fs.readFile` guarantees foreign-file content is never loaded. Source: `nodejs.org/docs/latest-v24.x/api/fs.json` via context7.

---

## 4. Whitelist (files this plan is authorized to modify)

| File | Authorized changes |
|---|---|
| `scripts/mailbox-lib.mjs` | Add `extractFilenameProject` helper. Extend `readBucket / collectMailboxMessages / readMessageByRelativePath / validateRelativeInboxPath / validateRelativeMessagePath / generateMessageFile / recoverOrphans` with optional `{ project }` param; when set, filter filenames / guard basename BEFORE content read. No API renames for existing exports. |
| `scripts/mailbox.mjs` | Wire `resolveCallerProject` session-bind guards into `handleList / handleReply / handleArchive / handleRecover`. Propagate bound project into every read call (`collectMailboxMessages`, `readMessageByRelativePath`, `recoverOrphans`). |
| `scripts/mailbox-migrate-project-prefix.mjs` | NEW FILE. Idempotent migration script: scan `agent-mailbox/`, for each file lacking `<project>__` basename prefix, read frontmatter project, rename. Fails loudly on files with missing / empty frontmatter project (no silent skips). |
| `dashboard/server.js` | Replace `agentRouter.use(...)` middleware with session+project bind (pattern from `/api/agent/runtime/deliveries`). In `/api/agent/messages` handler, pass `{ project: request.agentProject }` into all three `readBucket` calls. Admin endpoints `/api/messages*` remain unchanged (multi-project by design). |
| `dashboard/src/api.js` | Update `fetchAgentMessages({ project, session_id, signal })` to include `session_id` query param. Dead code — zero callers. |
| `local-claude-codex-mailbox-workflow.md` | Document: (a) session-bind invariant on CLI + HTTP; (b) filename-prefix storage convention with rationale; (c) migration procedure + rollback; (d) explicit residual-risk list (admin endpoints, direct FS reads). |
| `agent-mailbox/**/*.md` | **Runtime operation — NOT git-tracked** (`.gitignore:1-3` ignores `agent-mailbox/` and `mailbox-runtime/`). Rename performed by migration script (Change 0.4). Content unchanged. Archive subdirectory structure preserved. Tracked only via migration-log (`mailbox-runtime/migration-<timestamp>.log`) and Change Summary §1 of implementation report. User executes during explicit maintenance window (see Change 11.2 runbook). |

### Explicit «НЕ трогать»

- `scripts/mailbox.mjs:handleSend` — session-bind preserved. Only additive: pass `{ project }` to its `collectMailboxMessages` call.
- `dashboard/server.js` admin endpoints `/api/messages*`, `/api/archive`, `/api/notes` — out of scope (see §10); their `readBucket` calls stay unscoped.
- `dashboard/supervisor.mjs` — `pollTick` scans all buckets to build cross-project pending index for human dashboard. Unchanged (supervisor runs in trusted server boundary; index is cross-project by design).
- `dashboard/src/App.jsx` — uses admin endpoints only; no change.
- `.claude/hooks/*`, `.codex/hooks.json`, `scripts/mailbox-session-register.mjs` — session registration unchanged.
- Frontmatter schema (`project`, `thread`, `id`, `from`, `to`, etc.) — unchanged. Prefix is FILENAME-only.
- Thread-based archive subdirectory (`archive/<thread>/...`) — preserved.

---

## 5. Changes

### Change 0 — Storage layout: project-prefixed filenames + migration

**Files**: `scripts/mailbox-lib.mjs` + NEW `scripts/mailbox-migrate-project-prefix.mjs`

**0.1 — Filename convention**: every message file basename starts with `<project>__` (double-underscore separator). Example: `workflow__2026-04-21T14-05-19Z-read-isolation-claude-002.md`. Rationale: double-underscore is unlikely to appear inside project slugs; grep-friendly; fast `startsWith` check without regex.

**0.2 — Add `extractFilenameProject(filename)` helper** in `mailbox-lib.mjs`:

```javascript
export function extractFilenameProject(filename) {
  if (typeof filename !== "string") return "";
  const base = path.basename(filename);
  const idx = base.indexOf("__");
  if (idx <= 0) return "";
  return base.slice(0, idx);
}
```

**0.3 — `generateMessageFile` prepends project prefix** (current file at `mailbox-lib.mjs:601-665`). Inside the existing function, after `nextProject` normalization, construct:

```javascript
const filename = `${nextProject}__${filenameTimestamp}-${nextThread}-${nextFrom}-${seq}.md`;
```

`nextProject` is already validated non-empty by downstream writers (every current caller provides it). Add explicit guard: `if (!nextProject) throw new ClientError(400, "project is required to generate message filename")`.

**0.4 — Migration script `scripts/mailbox-migrate-project-prefix.mjs`** (the **script file** is in git; its **execution** is a separate runtime step owned by the user during a maintenance window — see Change 11.2 runbook):
- Reads `--dry-run` flag (default true). Only `--apply` performs renames.
- Walks `agent-mailbox/to-claude/`, `to-codex/`, `archive/` (recursive for archive).
- For each `.md` file: if `extractFilenameProject(basename)` is non-empty → skip (already migrated).
- Else: read frontmatter via `gray-matter`. Require `data.project` non-empty. If missing/empty → print error + file path + exit 1 (refuses to silently skip).
- Rename file from `<old>.md` to `<project>__<old>.md` in the same directory via `fs.rename`.
- Emit `mailbox-runtime/migration-<utcTimestamp>.log` with one line per rename: `<old-relative-path>\t<new-relative-path>`. Log file is also gitignored but persists locally for rollback.
- Final summary to stdout: count renamed + count already-prefixed + list of failures + path to migration-log.

**0.4-rollback — Reverse migration** (documented in runbook Change 11.2): a helper invocation `node scripts/mailbox-migrate-project-prefix.mjs --restore <log-path>` reads the log in reverse and renames files back. Idempotent (skips entries where the current name already matches the "old" side).

**0.5 — `normalizeProject` rejects `__` in slug** (current at `mailbox-lib.mjs:146-148`):

```javascript
export function normalizeProject(project) {
  const next = sanitizeString(project);
  if (next.includes("__")) {
    throw new ClientError(
      400,
      'project slug must not contain "__" (filename-prefix separator)'
    );
  }
  return next;
}
```

Rationale: `__` is the filename prefix separator (Change 0.1). A slug containing `__` would make `extractFilenameProject` ambiguous. Empirical check (planning-audit §7): current live slugs `workflow` and `messenger_test` both pass — each has at most one `_`. No regression. Future slugs constrained.

Breaking change flag: any third-party project attempting to register a slug containing `__` will fail at `normalizeProject` — 400 error is explicit + actionable. Documented in §11.1 storage invariant.

### Change 1 — `readBucket` / `collectMailboxMessages` project-scoped reads

**File**: `scripts/mailbox-lib.mjs`

**1.1** — Update `readBucket` signature and filter (current at `mailbox-lib.mjs:508-530`):

```javascript
export async function readBucket(bucketName, mailboxRoot, { project } = {}) {
  const config = bucketConfig[bucketName];
  if (!config) throw new Error(`Unknown mailbox bucket: ${bucketName}`);
  const bucketRoot = path.join(mailboxRoot, bucketName);
  let files = await collectMarkdownFiles(bucketRoot, config.recursive);
  if (project) {
    const nextProject = normalizeProject(project);
    files = files.filter((file) => extractFilenameProject(file) === nextProject);
  }
  const messages = await Promise.all(
    files.map((filePath) => readMessage(filePath, bucketName, mailboxRoot))
  );
  // sort + map unchanged
  ...
}
```

The filename filter runs BEFORE `readMessage` — foreign files are never opened for content (§V5).

**1.2** — Update `collectMailboxMessages`:

```javascript
export async function collectMailboxMessages(mailboxRoot, { project } = {}) {
  const buckets = await Promise.all(
    knownBuckets.map(async (bucketName) => ({
      bucketName,
      messages: await readBucket(bucketName, mailboxRoot, { project })
    }))
  );
  return buckets.flatMap((bucket) => bucket.messages);
}
```

**1.3** — Update `recoverOrphans(mailboxRoot, { project })`:
- `project` required — throws `ClientError(400, "project required for recoverOrphans")` if empty.
- Internal: `const messages = await collectMailboxMessages(mailboxRoot, { project })` — scoped at source.
- No additional post-filter needed; kept for defense-in-depth (messages array is already scoped, filter is no-op).

### Change 2 — `validateRelativeInboxPath` + `validateRelativeMessagePath` project filename check

**File**: `scripts/mailbox-lib.mjs`

**2.1** — Extend `validateRelativeInboxPath(relativePath, mailboxRoot, { project } = {})` (current at `mailbox-lib.mjs:274-307`):
- After the `trimmed.startsWith("to-claude/") || ...` check,
- If `project` is truthy: compute `basename = path.basename(trimmed)`; verify `extractFilenameProject(basename) === normalizeProject(project)`; throw `ClientError(400, 'relativePath basename does not belong to bound project "${project}"')` otherwise.
- Foreign target path refused BEFORE `path.resolve` and BEFORE `readMessage` — closes Critical 2.

**2.2** — Same extension to `validateRelativeMessagePath` (current at `mailbox-lib.mjs:309-343`).

### Change 3 — `readMessageByRelativePath` propagates project

**File**: `scripts/mailbox-lib.mjs`

**3.1** — Current signature `readMessageByRelativePath(relativePath, mailboxRoot)` (`:543`). Extend to `(relativePath, mailboxRoot, { project } = {})`. Pass `{ project }` into `validateRelativeInboxPath`. No other change.

### Change 4 — CLI session-bind guards

**File**: `scripts/mailbox.mjs`

**4.1** — At top of `handleList`, `handleReply`, `handleArchive`, `handleRecover`, insert the same guard block (3 statements; ~10 lines) as `handleSend` (`L142-153`):

```javascript
const boundProject = await resolveCallerProject({
  cwd: process.cwd(),
  runtimeRoot
});
if (!boundProject) {
  throw new ClientError(64, "<handler> requires bound session for current cwd");
}
if (boundProject !== project) {
  throw new ClientError(
    64,
    `session bound to "${boundProject}", refusing <handler> for project "${project}"`
  );
}
```

- `<handler>` = literal handler name in the error string.
- Runs after `normalizeProject` + `--project`-missing check, BEFORE any message read or archive call.

### Change 5 — CLI handlers propagate project into read calls

**File**: `scripts/mailbox.mjs`

**5.1** — In each handler, replace unscoped read calls with scoped:
- `handleSend` (`:156`): `const messages = await collectMailboxMessages(mailboxRoot, { project });`
- `handleList` (`:195`): same.
- `handleReply` (`:248`): `const targetMessage = await readMessageByRelativePath(options.to, mailboxRoot, { project: boundProject });` — `boundProject` is the session-bound project from Change 4.1. `(:254)`: `const messages = await collectMailboxMessages(mailboxRoot, { project });`.
- `handleArchive` (`:308`): `const targetMessage = await readMessageByRelativePath(options.path, mailboxRoot, { project: boundProject });`.
- `handleRecover` (`:347`): `const recovered = await recoverOrphans(mailboxRoot, { project });` (post-filter removed).

### Change 6 — HTTP agent session-bind middleware

**File**: `dashboard/server.js`

**6.1** — Replace `agentRouter.use(...)` middleware (`L186-194`) with session+project bind modeled on `/runtime/deliveries` pattern (`L223-276`):

```javascript
agentRouter.use((request, response, next) => {
  const sessionId = typeof request.query.session_id === "string"
    ? request.query.session_id.trim()
    : "";
  const project = normalizeProject(
    request.query.project || request.body?.project
  );
  if (!sessionId) {
    response.status(400).json({ error: "session_id query param is required for /api/agent/*" });
    return;
  }
  if (!project) {
    response.status(400).json({ error: "project query/body param is required for /api/agent/*" });
    return;
  }
  const session = supervisor.state.sessions.get(sessionId);
  if (!session) {
    response.status(404).json({ error: "session not found" });
    return;
  }
  if (session.project !== project) {
    response.status(403).json({ error: "project scope mismatch for session" });
    return;
  }
  request.agentProject = project;
  request.agentSession = session;
  next();
});
```

### Change 7 — HTTP `/api/agent/messages` handler scopes readBucket calls

**File**: `dashboard/server.js`

**7.1** — In the `/api/agent/messages` handler (current `L196-221`), replace the three unscoped `readBucket(bucketName, mailboxRoot)` calls (`L199-201`) with:

```javascript
const [allToClaude, allToCodex, allArchive] = await Promise.all([
  readBucket("to-claude", mailboxRoot, { project: request.agentProject }),
  readBucket("to-codex", mailboxRoot, { project: request.agentProject }),
  readBucket("archive", mailboxRoot, { project: request.agentProject })
]);
```

- `filterMessagesByProject` calls at `L203-205` become no-ops (messages already scoped) — leave in place as defense-in-depth or remove with justification.
- `markMessageReceived` side effect (`L206-213`) already operates on filtered `toClaude / toCodex` which are now also file-read-scoped. No further change needed.

### Change 8 — Admin endpoints unchanged

**File**: `dashboard/server.js`

**8.1** — No-op placeholder for clarity. `/api/messages` (`L47-70`) and `/api/messages/:dir` (`L72-93`) continue to call `readBucket(bucket, mailboxRoot)` WITHOUT `{ project }`. Dashboard UI reads all projects for human browsing — by design.

### Change 9 — Supervisor unchanged

**File**: `dashboard/supervisor.mjs`

**9.1** — No-op placeholder. `pollTick` at `L150-154` calls `readBucket("to-claude", mailboxRoot)` and `readBucket("to-codex", mailboxRoot)` without scope. Supervisor builds cross-project pending index for dashboard UI — by design. Trusted server-process context.

### Change 10 — Frontend wrapper session_id

**File**: `dashboard/src/api.js`

**10.1** — Update `fetchAgentMessages({ project, session_id, signal })`:

```javascript
export async function fetchAgentMessages({ project, session_id, signal } = {}) {
  if (!project) throw new Error("project is required for fetchAgentMessages");
  if (!session_id) throw new Error("session_id is required for fetchAgentMessages");
  const params = new URLSearchParams({ project, session_id });
  const response = await fetch(`/api/agent/messages?${params.toString()}`, {
    cache: "no-store",
    signal
  });
  return parseJsonResponse(response, `Agent API returned ${response.status}`);
}
```

### Change 11 — Documentation contract + migration runbook + residual risks

**File**: `local-claude-codex-mailbox-workflow.md`

**11.1** — Add section «Agent-path read isolation contract»:
- CLI: every agent-path op requires bound session matching `--project`. All read paths scope by filename prefix BEFORE file-content access.
- HTTP: every `/api/agent/*` call requires `session_id` + `project`; readBucket calls are project-scoped. 400 / 404 / 403 on missing / unknown / mismatched.
- Admin: `/api/messages*`, `/api/archive`, `/api/notes` remain multi-project (human scope).
- Filesystem: agents MUST NOT call `fs.readFile` / `Read` / `Bash cat` on `agent-mailbox/`. Discipline contract.
- Storage invariant: every message filename starts with `<project>__`. Enforced by `generateMessageFile`.
- Residual risks: admin endpoints, direct FS reads, shared-process memory leakage between agent turns (same Node process reads many projects serially — mitigated by session-bind + per-request project scope).

**11.2** — Add section «Migration runbook — maintenance window» with the explicit two-step execution model (`agent-mailbox/` is NOT in git; migration is a runtime operation, not a git commit):

**Step A — Code + docs changes** (Claude-executed, working-tree edits only; **no git commit or push without explicit user command** per `CLAUDE.md:85`, `README.md:31`, `README.md:139`, `workflow-role-distribution.md:70`):
1. Claude applies all code changes (Changes 0.1, 0.2, 0.3, 0.5, 1-7, 10) + docs (Change 11). Changes land in the working tree; NO `git add` / `git commit` yet.
2. Claude runs V-probes that do NOT require migration to have happened: V1 (node --check), V2 (grep count), V7 (extractFilenameProject export), V22 (normalizeProject rejects __), V23 (normalizeProject accepts current live slugs), V14 (lib-level recoverOrphans negative — missing project throws), V19 (doc drift), V20 (PD scan).
3. Claude updates `read-isolation-report.md` §1 (Change diffs via `git diff`) + §2 (pre-migration V-probe outputs).
4. Claude's execute session **STOPS here** and surfaces the final state to the user. Claude does NOT commit.

**Step A' — Commit + push** (explicit user-authorized branch, distinct from Step A):
1. Triggered only when the user explicitly commands commit / push.
2. User reviews `git status` + `git diff` in the working tree.
3. On user command («закоммить», «commit», «push», etc.), Claude executes `git commit` (with appropriate message per §12) and — only if user additionally authorizes push — `git push`.
4. Commit SHA is recorded in report §5. Without this user-authorized branch, the working tree changes remain uncommitted indefinitely — acceptable, since `agent-mailbox/` migration is a separate downstream step that also requires user action.

**Step B — Maintenance-window migration** (user-executed on local host, NOT git-tracked). **Prerequisite**: Step A' commit must have landed (either just-committed or already-pushed) — migration script uses helpers from Step A's code which must be readable from disk. If the commit is still pending (working tree only), the `extractFilenameProject` import inside the migration script will still resolve because it reads source files directly, but the two-step model assumes commit-before-migration for cleaner rollback semantics.
1. User stops dashboard server (`Ctrl+C` on `npm run dev`) and any active Claude/Codex Code sessions in the workflow project (so no process is reading/writing `agent-mailbox/` concurrently).
2. User runs `node scripts/mailbox-migrate-project-prefix.mjs --dry-run` from `E:/Project/workflow/` — reviews the list of planned renames.
3. User runs `node scripts/mailbox-migrate-project-prefix.mjs --apply` — observes final summary + noted path to `mailbox-runtime/migration-<timestamp>.log`.
4. User runs idempotency re-check: `node scripts/mailbox-migrate-project-prefix.mjs --apply` again — expected `0 renamed, N already prefixed`.
5. User runs filesystem sanity: `find agent-mailbox -name "*.md" -not -name "*__*"` — expected zero lines.
6. User restarts dashboard (`cd dashboard && npm run dev`).
7. User opens a fresh Claude Code session in the workflow project (SessionStart hook re-registers with the just-restarted supervisor).
8. Fresh Claude session runs the remaining V-probes (V3-V6 migration verification, V8-V18 runtime probes, V21 code-only git diff scope) and fills `read-isolation-report.md` §2.

**Rollback procedure** (if Step B reveals problems):
- Data restore: `node scripts/mailbox-migrate-project-prefix.mjs --restore mailbox-runtime/migration-<timestamp>.log` — reads log in reverse, renames files back.
- Code restore: `git revert <step-A'-sha>` (Step A' is the user-commanded commit branch — see §11.2 Step A'; Step A itself does not commit), then restart dashboard + fresh sessions.
- Restore order: data first (while new code expects prefixed names and would break), then code. Alternative order (code first) also works but agent-path reads return empty between code-revert and data-restore.

---

## 6. Verification

Claude runs the probes below according to the three-branch execution model (Change 11.2): **Step A-phase probes** (pre-commit, no migration yet; listed in §7 acceptance: V1, V2, V7, V14, V19, V20, V22, V23) run during Claude's Step A execution; **Step B-phase probes** (post-migration: V3-V6, V8-V18, V21, V21b, V21c) run by the fresh Claude session after the user completes Step B. Codex independently re-runs them during post-implementation verification.

**Prerequisites for HTTP probes V15-V18**: dashboard server must be running continuously since the SessionStart hook registered the test session (see planning-audit §10 G7). If the server was restarted, re-fire SessionStart before running V15-V18. Test session_id: `node -e "import('node:fs').then(fs => console.log(JSON.parse(fs.readFileSync('mailbox-runtime/sessions.json', 'utf8')).find(s => s.project === 'workflow').session_id))"`.

**Prerequisite for storage-layout probes V6-V8**: migration has been run in `--apply` mode AND all `agent-mailbox/` files have been confirmed prefixed via `find agent-mailbox -name "*.md" -not -name "*__*" | wc -l` → `0`.

| ID | Probe | Expected |
|---|---|---|
| V1 | `node --check` on all whitelisted JS files | clean exit |
| V2 | `grep -c "resolveCallerProject" scripts/mailbox.mjs` | exactly `6` (1 import + 5 call-sites: send, list, reply, archive, recover) |
| V3 | Migration dry-run: `node scripts/mailbox-migrate-project-prefix.mjs --dry-run` | exit 0; reports N files to migrate, 0 already prefixed, 0 failures |
| V4 | Migration apply: `node scripts/mailbox-migrate-project-prefix.mjs --apply` | exit 0; all files renamed to `<project>__*`; idempotency: second run reports 0 to migrate |
| V5 | Migration idempotency: run `--apply` again | exit 0; 0 renamed, N already prefixed, 0 failures |
| V6 | `find agent-mailbox -name "*.md" -not -name "*__*"` | empty output (0 lines) |
| V7 | `extractFilenameProject` export: `node -e "import('./scripts/mailbox-lib.mjs').then(m => console.log(m.extractFilenameProject('workflow__x-y-z.md')))"` | `workflow` |
| V8 | readBucket filename filter — empirical, `tmp-probe-readbucket.mjs` seeds root with projA__ + projB__ files, calls `readBucket('to-claude', root, { project: 'projA' })` and a parallel `fs.open` trace | returns only projA messages; `fs.open` trace shows zero reads of projB__ files |
| V9 | Negative CLI probe: session bound to A, `node scripts/mailbox.mjs list --project B` | exit 64, error `session bound to "A", refusing list for project "B"` |
| V10 | Positive CLI probe: same session, `list --project A` | exit 0, lists only A messages |
| V11 | Negative reply/archive — foreign target path `to-claude/projB__x.md` with session bound A, `--project A` | exit 64, error `relativePath basename does not belong to bound project "A"`; foreign file NOT opened (fs.open trace) |
| V12 | Negative recover: session bound A, `recover --project B` | exit 64, session-bind fail |
| V13 | Lib-level recover — positive `node -e "import('./scripts/mailbox-lib.mjs').then(m => m.recoverOrphans(process.env.ROOT, { project: 'projA' })).then(r => console.log('recovered-count:', r.length, 'projects:', [...new Set(r.map(x => x.project))]))"` | `recovered-count: 1 projects: [ 'projA' ]`; projB pending untouched |
| V14 | Lib-level recover — negative missing project | `err: project required for recoverOrphans status: 400` |
| V15 | HTTP 400 `curl /api/agent/messages?project=workflow` no session_id | 400, error `session_id query param is required` |
| V16 | HTTP 404 `curl /api/agent/messages?project=workflow&session_id=unknown` | 404, error `session not found` |
| V17 | HTTP 403 session A, `curl /api/agent/messages?project=B&session_id=<A>` | 403, error `project scope mismatch for session` |
| V18 | HTTP 200 session A, matching `/api/agent/messages?project=A&session_id=<A>` | 200; response.toClaude/toCodex/archive contain ONLY A messages; A-project pending in to-claude/to-codex buckets receive `received_at`; archive-bucket messages NOT mutated; B-project pending files NOT opened (fs.open trace) |
| V19 | Doc drift — `grep -c "Agent-path read isolation contract" local-claude-codex-mailbox-workflow.md` | ≥1 |
| V20 | Personal-data regex — same CI scan as `.github/workflows/ci.yml` | clean |
| V21 | `git diff --stat HEAD --` limited to tracked whitelist paths | only `scripts/mailbox-lib.mjs`, `scripts/mailbox.mjs`, `scripts/mailbox-migrate-project-prefix.mjs`, `dashboard/server.js`, `dashboard/src/api.js`, `local-claude-codex-mailbox-workflow.md`, `docs/codex-tasks/read-isolation*.md` appear. **`agent-mailbox/` MUST NOT appear** (gitignored — any appearance indicates `.gitignore` regression). |
| V21b | Mailbox rename tracked via migration-log, not git — `wc -l mailbox-runtime/migration-<ts>.log` | positive line count matching (renamed count reported by migration --apply) |
| V21c | Mailbox files fully migrated — `find agent-mailbox -name "*.md" | wc -l` vs `find agent-mailbox -name "*__*.md" | wc -l` | two counts equal (every file is prefixed) |
| V22 | `normalizeProject` rejects `__` in slug — `node -e "import('./scripts/mailbox-lib.mjs').then(m => { try { m.normalizeProject('bad__slug') } catch (e) { console.log('rejected:', e.message, 'status:', e.status) } })"` | `rejected: project slug must not contain "__" (filename-prefix separator) status: 400` |
| V23 | `normalizeProject` accepts current live slugs — `node -e "import('./scripts/mailbox-lib.mjs').then(m => console.log([m.normalizeProject('workflow'), m.normalizeProject('messenger_test')]))"` | `[ 'workflow', 'messenger_test' ]` (both pass; no throw) |

---

## 7. Acceptance criteria

- V1-V23 + V21b + V21c all PASS (Step A pre-migration subset: V1, V2, V7, V14, V19, V20, V22, V23; remainder post-maintenance).
- No touch to admin endpoints (`/api/messages*`, `/api/archive`, `/api/notes`).
- No touch to supervisor pollTick or App.jsx.
- No touch to frontmatter schema — only filenames.
- Migration is idempotent + has rename-log for rollback.
- `recoverOrphans` signature: `(root, { project })`; project required.
- `readBucket / collectMailboxMessages / readMessageByRelativePath / validateRelativeInboxPath / validateRelativeMessagePath / generateMessageFile` all accept `{ project }` opt (generateMessageFile requires it, others treat absent as admin-scope pass-through).
- Docs updated with layered truthfulness: flag-auth + mutation-iso + file-read-iso-at-agent-path-only; residual risks explicit (admin + FS direct + process-memory serial reuse).
- Codex Work Verification Report: no unresolved Critical / Mandatory findings.

---

## 8. Out of scope (explicit non-goals)

- Admin endpoints `/api/messages*`, `/api/archive`, `/api/notes` — human surface, multi-project by design.
- Direct FS reads via `Read / Bash cat / Grep` on `agent-mailbox/` — unenforceable in-repo; discipline contract.
- Per-process memory isolation between back-to-back agent turns in the same Node process (theoretical side-channel; not a realistic attack vector in local dev).
- OS-level ACL or sandbox on mailbox files.
- Dashboard UI changes.
- Session hooks changes.
- Supervisor persistence redesign (G7 out-of-plan follow-up).
- Cross-host isolation (dashboard 127.0.0.1 only).

---

## 9. Rollback

The rollback model matches the three-branch execution (Change 11.2 runbook). `agent-mailbox/` is gitignored (`.gitignore:1-3`) — git cannot roll back mailbox filenames.

- **Working-tree rollback** (Step A edits, no commit yet): plain `git checkout -- <files>` on the working tree or `git restore <files>`. No git history touched since nothing was committed. Trivial because Step A stops before commit.
- **Code + docs rollback after commit** (Step A' completed): `git revert <step-A'-sha>` reverses all tracked changes (`scripts/`, `dashboard/`, `local-claude-codex-mailbox-workflow.md`, `docs/codex-tasks/*`). Requires explicit user command per repo policy.
- **Data rollback** (Step B completed): `node scripts/mailbox-migrate-project-prefix.mjs --restore mailbox-runtime/migration-<timestamp>.log`. The migration-log is the sole source of truth for data rollback — NOT git. Log is also gitignored but persists locally.
- **Order matters**: if Step B completed and Step A' also committed, roll back DATA first (while new code still expects prefixes, so no runtime drift), then code via user-commanded `git revert`. If only Step A' committed (Step B maintenance window never ran) — plain user-commanded `git revert` suffices.
- Live mailbox content unchanged by either step; only filenames altered. No data-loss path.

---

## 10. Discrepancy-first checkpoints (STOP conditions)

Stop implementation and re-open agreement if any of:

1. Any whitelist file contains unexpected pending changes (detect via `git status` before touching).
2. A probe in §6 fails after applying the corresponding change (including CI personal-data scan).
3. A new caller of `recoverOrphans / readBucket / readMessageByRelativePath / collectMailboxMessages` is discovered in-repo during implementation — re-grep.
4. `resolveCallerProject` behavior changes between Windows + WSL.
5. Session `session_id` not available via supervisor `state.sessions.get(id)` for just-registered session. G7 prereq applies.
6. User requests scope expansion (admin endpoints, FS-level guard, etc.) — new task.
7. Empirical probe V13 shows cross-project archive even after Change 1 — filter is wrong, re-derive.
8. `agentRouter.use` middleware in Express 5 does not run before route handlers — treat as implementation error.
9. Migration script encounters a message file WITHOUT frontmatter project — exit 1, user triage required. Do NOT silently default or skip.
10. Filename-prefix parsing ambiguity: a legitimate project slug contains `__` — refused by `normalizeProject` guard (Change 0.5). If Codex pre-flight finds existing live slug with `__` substring — STOP + user triage; current live slugs (`workflow`, `messenger_test`) verified compatible.
11. Archive path model breakage: if `archive/<thread>/` subdirectory is changed by some external script between plan agreement and execution, migration may skip/double-migrate. Pre-migration sanity (filesystem-only, since `agent-mailbox/` is gitignored): `find agent-mailbox/archive -name "*.md" | wc -l` matches expected baseline count recorded at plan-agreement time by the user during Step B.
12. Step A' commit deployed but Step B migration NOT yet run: agent-path `readBucket` with `{ project }` returns empty (no files have the prefix). Dashboard UI (admin endpoints) still sees all legacy messages. If any agent attempts a CLI send/reply between Step A' and Step B, the new `generateMessageFile` will write prefixed files into an otherwise-unprefixed corpus — not a corruption, but creates a mixed state. Mitigation: runbook §11.2 Step B1 mandates closing all agent sessions before migration; migration script's idempotency check tolerates a mixed corpus (already-prefixed files skipped per Change 0.4 algorithm).
13. Step A completed (working tree changed) but Step A' commit NOT yet authorized by user: agent-path reads continue to work under OLD unscoped semantics (code from HEAD, not working tree — unless user restarted dashboard server after Step A edits landed, in which case new code loads). Normal state; no STOP required; waiting for user commit command.

---

## 11. Self-audit checklist (Claude)

- [x] All whitelist files listed and scoped (5 existing + 1 NEW + agent-mailbox rename-only)
- [x] Every change cites a §V row OR a §6 empirical probe OR a planning-audit §3 file-read
- [x] Every probe has expected output defined up front
- [x] Residual-risk list is explicit and addresses Codex C.B.2 truthfulness
- [x] Breaking change surfaces: `readBucket / collectMailboxMessages / readMessageByRelativePath / validateRelativeInboxPath / validateRelativeMessagePath` gain optional `{ project }`; `recoverOrphans` requires it; `generateMessageFile` filename format changes
- [x] Out of scope section explicit (§8)
- [x] Rollback includes both code + data paths (§9 — git revert for code, migration-log restore for data)
- [x] Three-branch execution model (Step A → STOP → Step A' user-commanded → Step B) documented (Change 11.2) — addresses Codex round-3 Critical 1 (commit authorization) + round-2 Critical 2 (migration ownership)
- [x] `.gitignore` reality (G12) acknowledged — no git tracking for `agent-mailbox/`
- [ ] plan-audit skill run to 10/10 before delivery

---

## 12. Notes for Codex review

- This is v4 — cumulative revision through Codex rounds 1-3 (synthesis → v1 → v2 → v3 → v4). All prior findings addressed at code level:
  - Round 1 Critical 1 (CLI global reads via `collectMailboxMessages`) → Change 1 `readBucket` filename filter + Change 5 CLI handlers pass project
  - Round 1 Critical 2 (reply/archive target read before validation) → Change 2 `validateRelativeInboxPath` basename project check + Change 3 `readMessageByRelativePath` propagates
  - Round 1 Mandatory 1 (truthfulness) → preserves original claim at code level (agent-path CLI + HTTP) with residuals only at admin + direct FS (§11.1 docs) + process-memory serial reuse (§8)
  - Round 2 Critical 1 (`.gitignore` reality) → G12 flag; V21 code-only + V21b/V21c filesystem + migration-log; §9 data-log restore
  - Round 2 Critical 2 (migration ownership) → two-step → three-branch model (v4) in §11.2
  - Round 2 Mandatory 1 (single atomic commit impossible) → §12 three-branch replacement
  - Round 3 Critical 1 (Step A commit-authorization policy) → Step A / Step A' split with repo policy cited at L331
  - Round 3 Mandatory 1 (report template stale) → report header v4 + V21 aligned + §4/§5/§6 refreshed
- **Scope total**: v4 adds filename migration + 6 lib helpers extended + migration script + three-branch execution. Size ~2x v1. Justified by findings across all three rounds.
- Please flag any remaining read path you see open, any probe gap, any migration hazard.
- Design decisions for your confirmation:
  - `__` as separator: **accepted** (your round-2 non-blocking).
  - Keep `filterMessagesByProject` in `/api/agent/messages` after scoped `readBucket`: **accepted** (defense-in-depth, zero cost).
  - **THREE-branch execution model (v4)**: Step A code-edits + pre-migration V-probes + report-update (Claude, NO commit) → **STOP** → Step A' commit + push (explicit user command only) → Step B maintenance-window migration (user-executed, migration-log-tracked, NOT git-tracked) → fresh-Claude-post-B-verification. Addresses Codex round-3 Critical 1. Runbook §11.2. Accept or counter?
  - Migration idempotency: skip on prefix-present (no frontmatter re-verification). Confirm or counter?
  - Commit message for Step A' (used only when user commands commit): `feat(mailbox): project-prefixed storage + session-bind guards for agent-path read isolation`. Confirm or counter?
- Push policy: no push without explicit user command.
