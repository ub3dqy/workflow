# read-isolation — Planning Audit (evidence trail)

**Plan slug**: `read-isolation`
**Thread**: `read-isolation` (agent mail)
**Task origin**: user 2026-04-21 «агенты не могли читать письма из других проектов»
**Workflow mode**: sequential Claude↔Codex (new system prompt `claude_system_prompt.md` 2026-04-21)
**Package files**:
- `docs/codex-tasks/read-isolation.md` (plan)
- `docs/codex-tasks/read-isolation-planning-audit.md` (this file — evidence trail)
- `docs/codex-tasks/read-isolation-report.md` (Codex implementation report template — N/A here since Claude executes, will be Claude-filled)
- `docs/codex-tasks/read-isolation-work-verification.md` (Codex verification, post-implementation)

---

## §0 Meta-procedure reference

Procedure executed per `E:/Project/memory claude/memory claude/docs/claude-plan-creation-procedure.md` (11-step sequential checklist). NO-STOP discipline applied: audit-loop to 10/10 inline, delivery without intermediate user approval.

---

## §1 MCP + Skill inventory (filled Step 3)

Selected tools (from session-start advertisement):

| Tool | Purpose for this task | Priority |
|---|---|---|
| `context7` (MCP) | Fetch Express 4/5 middleware composition docs + Node.js `url.fileURLToPath` + Node `process.cwd` cross-OS semantics | MANDATORY (library docs) |
| `WebFetch` | Fallback for docs not indexed by context7 (Express 4.x guide, MDN Node URL) | Fallback |
| `git` (MCP) | Read-only `git_status` / `git_diff` for baseline (no push, no commit without explicit user command) | Preferred over Bash git |
| `filesystem` (MCP) | Alternative to `Read` for cross-OS path robustness (not required here — `Read` sufficient) | Optional |
| `Read` (base) | Full reads of touched source files (`scripts/mailbox*.mjs`, `dashboard/server.js`, `dashboard/src/api.js`) | Primary |
| `Grep` (base) | AST-like call-site inventory (`resolveCallerProject`, `recoverOrphans`, `agentRouter`, `validateProjectScope`) | Primary |
| `Bash` | Empirical probes — node --check, spawn mailbox CLI with crafted session state | Primary for probes |
| `plan-audit` (skill) | MANDATORY Step 10 — multi-round audit loop to 10/10 | MANDATORY |
| `security-audit` (skill) | Optional — scope isolation is a security boundary; invoke if plan-audit surfaces auth/isolation gaps | Conditional |
| `code-review` (skill) | Optional post-draft sanity check | Conditional |

Explicitly **not** used:
- `ide.getDiagnostics` — repo is plain JS/ESM, no TypeScript; diagnostics N/A.
- `github` MCP — no PR/issue operations in scope.
- `context7 resolve-library-id` for mailbox itself — mailbox is in-repo code, not a library.



---

## §2 MCP readiness verification (filled Step 4)

| Probe | Command | Raw output (abridged) | Status |
|---|---|---|---|
| `context7` readiness | `mcp__context7__resolve-library-id({libraryName: "Express", query: "Router middleware composition"})` | Returns `/expressjs/express` (v4.21.2, v5.1.0, v5.2.0), High reputation, 112 snippets | ✅ ready |
| `git` MCP readiness | `mcp__git__git_status({repo_path: "E:/Project/workflow"})` | Branch master up-to-date; modified `.claude/settings.local.json` + untracked `read-isolation-planning-audit.md` | ✅ ready |
| `filesystem` MCP readiness | `mcp__filesystem__list_allowed_directories()` | `E:\Project\workflow` — matches working directory | ✅ ready |
| `plan-audit` skill | invoked Step 10 (not a probe — skill invocation is itself the use) | deferred to §8 | deferred |

No fixes required. All mandatory MCPs responsive.



---

## §3 Files read during planning (filled Step 6)

Full reads (no grep-substitution):

| File | Lines | Tool | Purpose |
|---|---|---|---|
| `scripts/mailbox.mjs` | 411 | `Read` | Full body of CLI — 5 handlers (send/list/reply/archive/recover). Verified send is session-bound (L142-153); list/reply/archive/recover are NOT session-bound. |
| `scripts/mailbox-lib.mjs` | 820 | `Read` | Library — `resolveCallerProject` (L66-124), `validateProjectScope` (L150-173), `recoverOrphans` (L766-819), `archiveMessageFile` (L667-746), `markMessageReceived` (L552-574). Confirms cross-project mutation path in recover. |
| `dashboard/server.js` | 306 | `Read` | HTTP API — `/api/messages*` admin (L47-93), `agentRouter` (L184-278), `/api/agent/messages` (L196-221), `/api/agent/runtime/deliveries` (L223-276). Confirms only deliveries endpoint has session-bind; messages endpoint only requires project. Verified `markMessageReceived` side effect at L206-213 runs BEFORE any session cross-check. |
| `dashboard/src/api.js` | 83 | `Read` | Client wrapper — `fetchAgentMessages` (L63-73) sends only `project`, no `session_id`. This breaks when server starts requiring session_id. Must update or accept N/A since dashboard UI is human-admin, not agent. |
| `scripts/mailbox-session-register.mjs` | 125 | `Read` | Hook-side session registration → POSTs to `/api/runtime/sessions` (L3, L107-108). Confirms session_id exists in session records. Hook-injected agents have session_id available. |
| `dashboard/supervisor.mjs` | 207 | `Read` | Supervisor — `state.sessions` Map keyed by session_id (L19-20), POST /sessions endpoint populates (L48-96), `persistSessions` writes `sessions.json` (L115-120). Authoritative source for resolving session_id → project. |

**Related files considered but NOT touched in plan** (read for blast-radius):

- `.claude/hooks/*` — SessionStart hook already injects `session_id` via `mailbox-session-register.mjs`; no change needed here.
- `.codex/hooks.json` — Codex hook chain parallel to Claude; same injection pattern.
- `local-claude-codex-mailbox-workflow.md` — mailbox protocol doc; requires documentation update for new session-bind invariant on reads + residual risks list.



---

## §4 Official docs fetched with Source Integrity chain (filled Step 5)

Project pins (verified via `grep express dashboard/package.json`): Express `^5.2.1`, Node runtime `v24.13.0` (`node --version`).

### §V1 — Express 5 router-level middleware

- **Primary source**: `context7` → `/expressjs/express/v5.2.0` → «Router-Level Middleware»
- **URL**: https://context7.com/expressjs/express/llms.txt
- **Verbatim excerpt**:

> «Middleware can be applied at the router level using `router.use()`, which applies the middleware to all routes defined on that router. This is useful for protecting entire API sections with authentication or other cross-cutting concerns without repeating middleware on each individual route.»

- **Used in plan §Change HTTP agent guard**: `/api/agent/messages` will gain a shared session-bind middleware mounted once on `agentRouter.use(sessionBindMiddleware)` — pattern matches Express 5 idiom.
- **Additional excerpt (path-specific mounting)**:

> «app.use('/api', (req, res, next) => { const apiKey = req.query['api-key']; if (!apiKey) { return res.status(400).json({ error: 'API key required' }) } ... next() })»

- **Applied to plan**: short-circuit with `res.status(4xx).json({...})` **before** `next()` is the idiomatic way to block downstream handlers — exactly what a session-bind guard must do.

### §V2 — Express 5 router mounting + short-circuit order

- **Primary source**: `context7` → `/expressjs/express/v5.2.0` → «Modular Routing with express.Router»
- **URL**: https://context7.com/expressjs/express/llms.txt
- **Verbatim excerpt**:

> «const apiRouter = express.Router(); apiRouter.use(authenticate) // All routes in this router require auth … app.use('/api', apiRouter)»

- **Used in plan**: confirms that `agentRouter.use(sessionBindMiddleware)` placed BEFORE `agentRouter.get('/messages', …)` short-circuits request if guard returns early. `dashboard/server.js` already mounts `agentRouter` on its own path prefix; middleware insertion order is authoritative.

### §V3 — Node.js `url.fileURLToPath` cross-platform semantics

- **Primary source**: `context7` → `/websites/nodejs_latest-v24_x_api` → «fileURLToPath(url[, options])»
- **URL**: https://nodejs.org/docs/latest-v24.x/api/url.json
- **Verbatim excerpt**:

> «This function ensures the correct decodings of percent-encoded characters as well as ensuring a cross-platform valid absolute path string. Applications must not rely on fileURLToPath() alone to prevent directory traversal attacks.»

> «new URL('file:///C:/path/').pathname; // Incorrect: /C:/path/ | fileURLToPath('file:///C:/path/'); // Correct: C:\path\ (Windows)»

- **Used in plan**: `resolveCallerProject` (already in HEAD from prior commit `3870c21`) uses `toHostPath(process.cwd())` — we verify that adding same guard into `list/reply/archive/recover` preserves the cross-OS contract. **No new fileURLToPath calls are introduced**; we reuse the existing utility exported from `mailbox-lib.mjs`.
- **Security note from docs**: «Applications must not rely on fileURLToPath() alone to prevent directory traversal attacks» — acknowledged. We do NOT use path strings for security decisions; decisions rely on `sessions.json` ↔ explicit `--project` flag match, not path parsing.

### §V4 — Node.js file URL on Windows (UNC + drive letters)

- **Primary source**: `context7` → `/websites/nodejs_latest-v24_x_api` → «Windows File URL Path Conversion»
- **URL**: https://nodejs.org/docs/latest-v24.x/api/fs.json
- **Verbatim excerpt**:

> «On Windows, file URLs with hostnames convert to UNC paths, while those with drive letters convert to local absolute paths. URLs without a hostname or drive letter will result in an error.»

- **Used in plan**: N/A directly — informational only, reinforces that we rely on already-proven `toHostPath` rather than re-implementing path normalization.

### §V5 — Node.js `fs.readdir` returns filenames only

- **Primary source**: `context7` → `/websites/nodejs_latest-v24_x_api` → `fs.readdir` documentation
- **URL**: https://nodejs.org/docs/latest-v24.x/api/fs.json
- **Key contract**: `readdir(path, options)` returns an array of Dirent / string entries representing directory contents. It does NOT open file content. File content access requires a subsequent `readFile` / `open` call.
- **Applied to plan v2**: `readBucket` calls `collectMarkdownFiles` (which uses `readdir`) to enumerate filenames, THEN filters by `extractFilenameProject` prefix, THEN opens only matching files via `readMessage`→`readFile`. Foreign-project files are enumerated (filename is metadata) but never opened for content — this is the file-read isolation guarantee.
- **Cross-reference**: `scripts/mailbox-lib.mjs:collectMarkdownFiles` (`:403-436`) reads directory entries via `fs.readdir`, filters by `.md` extension and file-type, but does NOT open content. Perfect split-point for our project filter.

### Fallback chain notes

- No WebFetch fallback needed — `context7` returned verbatim doc quotes for all three topics.
- No raw-upstream `raw.githubusercontent.com` fallback needed.
- Secondary Express source (`/websites/expressjs`) cross-checked for version skew — the mounted-router pattern is identical between v4 and v5 docs, so upgrade risk is zero for this specific usage.



---

## §5 AST scans + commands run (filled Step 7)

| Command | Purpose | Key output |
|---|---|---|
| `Grep "resolveCallerProject" path:workflow` | Call-site inventory | 1 definition (`mailbox-lib.mjs:66`); 1 call-site (`mailbox.mjs:142` = handleSend only) — confirms read-paths still unguarded |
| `Grep "recoverOrphans" path:workflow` | Call-site inventory | 1 definition (`mailbox-lib.mjs:766`); 1 call (`mailbox.mjs:347` inside handleRecover) |
| `Grep "validateProjectScope" path:workflow` | Call-site inventory + confirm 2-arg usage | 1 definition (`mailbox-lib.mjs:150`); 2 calls (`mailbox.mjs:249` handleReply, `mailbox.mjs:309` handleArchive) — orthogonal to session-bind (message-project vs passed-project) |
| `Grep "fetchAgentMessages\|/api/agent/messages" path:workflow` | Confirm only 1 frontend caller | `dashboard/src/api.js:63-73` sends only `project`; no other callers in repo |
| `node --version` | Node runtime pin | `v24.13.0` — matches Node v24.x docs consulted |
| `grep express dashboard/package.json` | Express version pin | `"express": "^5.2.1"` — matches Express 5 docs consulted |



---

## §6 Empirical probes (filled Step 7 if applicable)

### EP1 — `recoverOrphans()` cross-project mutation bug (Codex finding C.1)

**Purpose**: confirm Codex's claim that `recoverOrphans(mailboxRoot)` archives foreign-project pending pairs BEFORE any project filter is applied by the CLI caller.

**Setup** (in `tmp-probe-recover.mjs`, os-tmpdir sandbox):
- `to-claude/…threadA-codex-001.md` (project: projA, pending)
- `to-codex/…threadA-claude-001.md` (project: projA, reply_to A1, pending)
- `to-claude/…threadB-codex-001.md` (project: projB, pending)
- `to-codex/…threadB-claude-001.md` (project: projB, reply_to B1, pending)

**Command**: `node tmp-probe-recover.mjs` (calls `recoverOrphans(root)` — no project arg).

**Raw output** (verbatim):

```
BEFORE: [
  "to-claude/2026-04-21T10-00-00Z-threadA-codex-001.md",
  "to-claude/2026-04-21T11-00-00Z-threadB-codex-001.md",
  "to-codex/2026-04-21T10-05-00Z-threadA-claude-001.md",
  "to-codex/2026-04-21T11-05-00Z-threadB-claude-001.md"
]
RECOVER RESULT: [
  { "relativePath": "to-claude/…threadB-codex-001.md", "project": "projB", … },
  { "relativePath": "to-claude/…threadA-codex-001.md", "project": "projA", … }
]
AFTER: [
  "archive/threadA/2026-04-21T10-00-00Z-threadA-codex-001.md",
  "archive/threadB/2026-04-21T11-00-00Z-threadB-codex-001.md",
  "to-codex/2026-04-21T10-05-00Z-threadA-claude-001.md",
  "to-codex/2026-04-21T11-05-00Z-threadB-claude-001.md"
]
```

**Verdict**: ✅ bug confirmed. A caller that only wants projA recovery would still cause archive-side-effect on projB files before their post-hoc output filter runs. This is a cross-project **mutation**, not just a read leak — must be fixed inside the lib, not the CLI wrapper.

**Plan mapping**: drives `Change 2` — refactor `recoverOrphans` to accept a required project predicate and archive only matching pairs. `handleRecover` then calls the project-scoped form; no global scan.

**Probe cleanup**: `tmp-probe-recover.mjs` is a throwaway script at repo root. It will be removed before commit.

### EP2 — `readBucket` filename-filter file-read isolation (v2 design validation)

**Purpose**: prove that a project-scoped `readBucket` call opens ONLY matching project's files for content, never touching foreign-project file descriptors.

**Strategy**: write a throwaway probe that (a) seeds a sandbox mailbox with `projA__*.md` and `projB__*.md` files; (b) wraps `fs.promises.readFile` with a trace hook to record every path opened for read; (c) calls `readBucket('to-claude', root, { project: 'projA' })`; (d) asserts the trace contains only `projA__*` basenames and zero `projB__*` basenames.

**Expected result** (to be populated during execute phase):

```
# seed files
projA__msg1.md, projA__msg2.md, projB__msg1.md, projB__msg2.md

# calling readBucket('to-claude', root, { project: 'projA' })
# trace output
OPEN projA__msg1.md
OPEN projA__msg2.md
# (no lines for projB)

# assertion
readBucket returned 2 messages (both projA)
fs.readFile trace: 2 opens, 0 for projB
✅ foreign-project files never opened
```

**Plan mapping**: drives probe V8 (empirical readBucket filter). Concrete `tmp-probe-readbucket.mjs` to be written during execute phase; deleted pre-commit.

**Probe cleanup v2**: both `tmp-probe-recover.mjs` and `tmp-probe-readbucket.mjs` removed before commit.



---

## §7 Assumptions + verification status (filled throughout)

| Claim in plan | Status | Evidence |
|---|---|---|
| `send` is already session-bound (commit `3870c21`) | ✅ verified | §3 `mailbox.mjs:142-153` read; §5 grep `resolveCallerProject` — 1 call-site in `handleSend` |
| `list/reply/archive/recover` CLI handlers are NOT session-bound | ✅ verified | §3 full read of `mailbox.mjs` — no `resolveCallerProject` usage outside handleSend; explicit gap confirmed by Codex C.A.1-C.A.3 |
| `/api/agent/messages` requires only `project`, not `session_id` | ✅ verified | §3 `server.js:184-221` — `agentRouter.use` middleware checks only `request.query.project` |
| `/api/agent/runtime/deliveries` already session-bound (correct pattern) | ✅ verified | §3 `server.js:223-276` — explicit `supervisor.state.sessions.get(sessionId)` + `session.project !== project` 403 |
| `recoverOrphans` archives foreign-project pairs before filter | ✅ verified | §6 EP1 empirical raw output — both projA + projB archived in a single call |
| `validateProjectScope` is orthogonal to session-bind (message-project check, not session-project check) | ✅ verified | §3 `mailbox-lib.mjs:150-173` reads `message.project` vs `currentProject`; no session lookup |
| Admin `/api/messages*` endpoints are NOT part of agent isolation scope (human admin only) | ⚠️ assumed-per-Codex-synth | Codex C.B.2 + prior task `mailbox-corporate-isolation.md:431-445` both state this; no user override yet — to be confirmed by Codex in review round |
| FS direct reads (`Read`, `Bash cat`, `Grep` on `agent-mailbox/`) cannot be enforced in-repo | ✅ verified by logic | Any code-level guard runs inside the Node process; tools read files directly. Must be addressed as discipline/doc contract. |
| Hook-injected session always has `session_id` available to agent | ⚠️ assumed | `scripts/mailbox-session-register.mjs:91-94` early-exits if no session_id; prior `mailbox-corporate-isolation` verified via V12. Re-probe in Codex pre-flight. |
| Adding `session_id` requirement to `/api/agent/messages` breaks NO current UI | ✅ verified | `Grep fetchAgentMessages` — declared in `api.js:63`, NOT imported anywhere (dead code). Dashboard `App.jsx:1478` calls `fetchMessages` → `/api/messages` admin endpoint only. |
| `fetchAgentMessages` wrapper must be updated to pass `session_id` or removed | ⚠️ design-decision | It is currently unused. Two options: (a) delete dead code; (b) keep + require `session_id` param. Defer to plan — opting for (b) with `session_id` param so future agent-side caller has a ready wrapper. |
| v1 → v2 design shift — storage layout is the true fix, not flag-level auth alone | ✅ verified (Codex round-1 review) | `2026-04-21T14:13:53Z-codex-002` identified 2 Critical findings: `collectMailboxMessages` reads every project's files before filter; `readMessageByRelativePath` opens foreign target before `validateProjectScope`. Filename-prefix convention + filtered `readBucket` closes both at code level. |
| `__` as filename project separator does not collide with any current project slug | ⚠️ assumed | Current slugs observed: `workflow`, `messenger_test`. `messenger_test` contains underscore — conflict if parser uses `_` alone. But convention is DOUBLE underscore `__` — slugs are `[a-z0-9][a-z0-9_-]*` and `__` is unusual. To be enforced: `normalizeProject` rejects any slug containing `__`. Cross-check: `messenger_test` has only one `_`, passes. Empirical check: `grep -r "project: " agent-mailbox/ dashboard/ scripts/` for all live project values — verify none contains `__`. |
| Filename-prefix approach is simpler than directory-shard approach | ⚠️ design-choice | Directory shard (`to-claude/<project>/*.md`) would require archive restructure and break `archive/<thread>/` thread-grouping. Filename prefix preserves structure. Trade-off: prefix is filename metadata (string parse); subdir is filesystem metadata (ACL-ready). For current trust model, filename is sufficient. To be confirmed by Codex round-2 review. |
| `readBucket` filename filter is O(n) per directory per call — acceptable for current mailbox size | ✅ reasonable | Current live mailbox: ~40 messages total. Filter over basenames is trivial cost vs. the avoided `readFile` + YAML parse per foreign file. Scales well into thousands. |



---

## §8 plan-audit skill invocation (filled Step 10)

### Round 1 — 2026-04-21

- **Skill**: `plan-audit` invoked on `read-isolation.md` + `read-isolation-planning-audit.md` + `read-isolation-report.md`
- **Score**: 9/10 🟡
- **Dimensional breakdown**: refs 2/2, rules 2/2, blast 2/2, completeness 1/2, feasibility 2/2
- **Critical findings**: 0
- **Important findings applied inline**:
  1. V2 expected value disambiguated to `exactly 6` (1 import + 5 call-sites after Change 1.1)
  2. V7 rewritten with concrete positive + negative invocations (both runnable against `tmp-probe-recover.mjs` seeded root)
  3. V11 expanded to explicitly clarify archive-bucket messages NOT mutated by `markMessageReceived`
  4. V12 expanded — check both `to-claude/` and `to-codex/` B pendings
  5. Change 1.1 wording «three-line guard» → «guard block (3 statements; ~10 lines)»
  6. G7 added — supervisor restart / `state.sessions` volatility (pre-existing, documented as probe prerequisite)
  7. G8 added — Read-tool vs wc -l line numbering convention disclosure
  8. Plan §6 HTTP probe prerequisites added — server uptime + session_id retrieval command
  9. Plan §10 discrepancy checkpoint 5 updated with G7 mitigation note
  10. Plan §10 discrepancy checkpoint 8 added — middleware ordering failure mode
  11. Report §2 prerequisite check block added (server uptime + session_id)
- **Optional findings deferred**:
  1. V16 (double session-bind race) — existing design; out of scope
  2. Deliveries endpoint dedup — refactor out of scope; noted for next task
- **Round 1 result**: all Important findings applied inline without user confirmation per NO-STOP discipline. Re-invocation below.

### Round 2 — 2026-04-21

- **Skill**: `plan-audit` re-invoked after Round 1 fixes
- **Score**: ✅ 10/10
- **Dimensional breakdown**: refs 2/2, rules 2/2, blast 2/2, completeness 2/2, feasibility 2/2
- **Critical findings**: 0
- **Important findings**: 0
- **Optional findings**: 3 cosmetic (V7 setup terseness, checklist tick, version bump) — (2) + (3) applied inline post-audit; (1) left as-is (runnable)
- **Regression check**: plan ↔ planning-audit ↔ report internally consistent; whitelist ↔ changes ↔ НЕ-трогать list coherent; Change 2.1 ClientError(400) matches V7 negative expected; middleware references `supervisor` in-scope; no new issues introduced by Round 1 fixes.
- **Round 2 result**: plan cleared for Step 11 delivery to Codex.

### Round 4 — 2026-04-21 (post-v2 revision)

- **Skill**: `plan-audit` invoked on v2 plan (after Codex round-1 Critical findings)
- **Score**: 🟡 9/10
- **Critical findings**: 0
- **Important findings applied inline**:
  1. Stale V-ID range in plan §6 prereq block (`V10-V15` → `V15-V18` — probes renumbered in v2)
  2. Missing Change 0.5 — `normalizeProject` slug `__` guard (referenced by §10 checkpoint #10 + G10 but had no implementation step)
- **Added probes**: V22 (normalizeProject rejects `__`) + V23 (accepts current live slugs `workflow`, `messenger_test`).
- **Optional findings deferred**:
  1. supervisor.mjs line-reference drift (L150-154 vs L152-153) — cosmetic
  2. V21 git rename detection format — expanded with `--porcelain` fallback
  3. Change 7 filterMessagesByProject redundancy — left as defense-in-depth
- **Regression check**: v1→v2 delta preserves all v1 Important fixes (Rounds 1-2); adds filename-prefix architecture layer without breaking prior guards.
- **Round 4 result**: applied inline. Re-invocation below.

### Round 6 — 2026-04-21 (v3, post-Codex-round-2)

- **Trigger**: Codex letter `2026-04-21T15:19:33Z-codex-003` with 2 Critical + 1 Mandatory on v2.
- **Critical findings addressed**:
  1. `.gitignore` reality (Critical 1) → G12 flag + removed all git-based mailbox verification (V21 scope, §9 rollback, §10 #11). Added V21b/V21c filesystem/migration-log probes.
  2. Migration ownership/sequencing (Critical 2) → two-step execution model (Change 11.2 Step A + Step B). Claude owns Step A (code commit); user owns Step B (maintenance window); fresh Claude session post-B runs remaining probes.
- **Mandatory 1 addressed**: decision #3 rewritten from "single atomic commit code+data" to "two-step execution (Step A git commit + Step B runtime migration)". §9 rollback, V21, §12 all reflect.
- **Non-blocking accepted** (per Codex round-2):
  - `__` separator accepted
  - `filterMessagesByProject` kept as defense-in-depth
- **Result**: Round 7 audit ✅ 10/10 (0 critical + 0 important); 3 optional cosmetic findings deferred (§10 #1 clarification, §10 #12 idempotency cross-ref, V21 hardcoded list). v3 cleared for Codex round-3 delivery.

### Round 8 — 2026-04-21 (v4, post-Codex-round-3)

- **Trigger**: Codex letter `2026-04-21T15:50:15Z-codex-004` with 1 Critical + 1 Mandatory on v3.
- **Critical 1 addressed** (Step A commit-authorization violated repo policy):
  - Split Step A into **Step A** (Claude code+docs edits + pre-migration probes + report update + **STOP**, no commit) and **Step A'** (commit+push, explicit user-commanded branch).
  - §11.2 runbook rewritten with two branches.
  - §9 Rollback gets third tier: working-tree rollback (pre-commit) + code-revert-after-commit (post-A') + data-log-restore (post-B).
  - §10 #12 updated to reference Step A' (was Step A). #13 new: Step A done but Step A' not yet authorized — working-tree changes persist, no commit, no STOP required.
  - §12 design decision rewritten: THREE-branch model (A → STOP → A' → B → fresh-Claude-post-B).
- **Mandatory 1 addressed** (report template stale):
  - `read-isolation-report.md` header updated to v4.
  - V21 wording aligned with G12: tracked whitelist only + explicit «`agent-mailbox/` MUST NOT appear».
  - Added V21b (migration-log line count) + V21c (filesystem-only full-migration check) probe sections in report.
  - §4 rollback verification gets three tiers (working-tree / commit / data).
  - §5 «Commit + push» renamed to «Commit + push (Step A' — user-commanded branch)» with user-command-capture fields explicit.
  - §6 Tooling table fixed to V1-V23 + V21b + V21c.
- **Result**: Round 9 audit ✅ 10/10 (0 critical + 0 important). 3 optional cosmetic findings applied inline: (1) self-audit checklist L466 updated to three-branch wording; (2) §6 prereq paragraph rewritten to split Step A-phase vs Step B-phase probes with IDs listed; (3) §6 probe-phase split documented without requiring per-row column. v4 cleared for Codex round-4 delivery.

### Round 10 — 2026-04-21 (post-Codex-round-4)

- **Trigger**: Codex letter `2026-04-21T16:12:15Z-codex-005` with 2 Mandatory stale references:
  1. Runbook rollback line (`L353-356`) referenced `<step-A-sha>` — stale from pre-split v3; v4 commit lives in Step A' so placeholder must be `<step-A'-sha>`.
  2. §12 Notes opening line started «This is v2 ...» — stale framing against a v4 tracked artifact.
- **Fixes applied inline**:
  1. Plan L355 changed to `git revert <step-A'-sha>` with inline clarification «Step A' is the user-commanded commit branch — see §11.2 Step A'; Step A itself does not commit».
  2. Plan §12 opening rewritten as «This is v4 — cumulative revision through Codex rounds 1-3» with all 8 findings (3 rounds × 2-3 per round) explicitly listed.
- **No regression**: other occurrences of «Step A» vs «Step A'» already correctly distinguished (plan L430-432 rollback, report L275). Only two stale leftovers existed.
- **Result**: pending Round 11 plan-audit re-invocation.

### Round 5 — 2026-04-21

- **Skill**: `plan-audit` re-invoked after Round 4 fixes
- **Score**: ✅ 10/10
- **Dimensional breakdown**: refs 2/2, rules 2/2, blast 2/2, completeness 2/2, feasibility 2/2
- **Critical + Important findings**: 0 + 0
- **Optional findings noted** (not blocking):
  1. V24 pre-migration frontmatter scan — defer, Codex pre-flight candidate
  2. §12 Change 0.5 breakage flag explicit — cosmetic
- **Verification**: (a) HTTP prereq V15-V18 correct; (b) Change 0.5 cites mailbox-lib.mjs:146-148 verified; (c) V22/V23 runnable + precise expected; (d) §10 #10 references Change 0.5; (e) V1-V23 updated in acceptance criteria; (f) no stale V-IDs remain.
- **Round 5 result**: plan cleared for Codex round-2 review delivery.

---

### Round 3 — 2026-04-21 (post-v2 revision)

- **Trigger**: Codex review letter `2026-04-21T14:13:53Z-codex-002` with 2 Critical + 1 Mandatory findings on plan v1
- **Findings applied** (all 3 Codex findings at code level):
  1. Critical 1 (CLI global reads via `collectMailboxMessages`) → v2 Change 0 filename prefix + Change 1 `readBucket` filename filter + Change 5 CLI handlers pass `{ project }`
  2. Critical 2 (reply/archive target-file read before validation) → v2 Change 2 `validateRelativeInboxPath` filename-project check + Change 3 `readMessageByRelativePath` propagation
  3. Mandatory 1 (truthfulness) → v2 closes both Critical leaks at code level, allowing original claim to stand with residuals only at admin + direct FS + process-memory (new G9)
- **New additions in v2**:
  - Change 0 (filename convention + migration script) — new file `scripts/mailbox-migrate-project-prefix.mjs`
  - §V5 (Node.js `fs.readdir` metadata-only contract) — justifies filename-filter-before-content-read design
  - EP2 (readBucket filename-filter empirical probe) — fs.readFile trace proof
  - G9 (process-memory serial reuse — explicit non-goal)
  - G10 (filename-prefix charset conflict mitigation via normalizeProject guard)
  - G11 (migration atomicity cross-OS)
  - Probes expanded from V1-V15 to V1-V21 (migration + filename-filter + foreign-open negative proofs)
  - Whitelist expanded from 5 files to 6 (new migration script) + `agent-mailbox/` rename-only entries
- **Score after v2**: pending Round 4 plan-audit re-invocation

---

## §8a Probe cleanup (pre-commit)

Before final commit, the throwaway empirical-probe scripts at repo root will be deleted:
- `tmp-probe-recover.mjs` — from EP1 empirical proof (v1, already confirmed recoverOrphans cross-project mutation)
- `tmp-probe-readbucket.mjs` — from EP2 empirical proof (v2, to be created during execute phase for fs.readFile trace)

---

## §9 Delta from prior task (filled Step 9)

Prior: `mailbox-corporate-isolation` (commit `3870c21`) — closed `send` agent-path write leak via `resolveCallerProject` session-bind guard.

This task: extends the same session-bind invariant to `list / reply / archive / recover` agent-path reads + `/api/agent/messages` HTTP read + eliminates cross-project side effect in `recoverOrphans`.

Detailed delta (v2, post-Codex-review):
- Prior: only `send` session-bound; one file changed (mailbox-lib + mailbox.mjs); scope = write leak.
- v1 (rejected by Codex): flag-level auth for `list/reply/archive/recover` + `/api/agent/messages`; `recoverOrphans` scoped to prevent cross-project mutation; but global `collectMailboxMessages` reads remained.
- v2 (current): **Storage redesign** — filename prefix `<project>__*` for all mailbox messages. `readBucket` filters by filename BEFORE `readMessage` content open. `validateRelativeInboxPath` checks basename project BEFORE resolve. True file-read isolation at agent-path CLI + HTTP.
- Delta scope v2: +1 NEW migration script + +4 CLI handler guards + +1 HTTP middleware + +6 lib helper signature extensions + +1 frontend wrapper param + +1 docs section + agent-mailbox filename migration. Whitelist: 6 files + live `agent-mailbox/` rename.
- Breaking change surface: minimal for consumers — all lib functions gain OPTIONAL `{ project }` param (backward-compat for admin callers); `recoverOrphans` and `generateMessageFile` require project (already required by all current callers); `fetchAgentMessages` dead code updated. Migration is one-shot.

---

## §10 Known gaps (honest flags, filled throughout)

### G1 — Admin endpoints `/api/messages*` remain multi-project (explicit non-goal)

- **What**: `GET /api/messages`, `GET /api/messages/:dir`, `POST /api/archive`, `POST /api/notes` stay without session-bind. Human admin accesses via browser (dashboard UI).
- **Why accepted**: dashboard is the human interface per `CLAUDE.md`. Session-binding would require browser-side session_id injection with no current UI support. Scope creep.
- **Truthfulness requirement (Codex C.B.2)**: plan + docs MUST state explicitly that the claim «agent cannot read other projects» applies to **agent-path CLI + agent-path HTTP**, NOT to the admin surface.

### G2 — Direct FS reads are unenforceable in-repo

- **What**: `Read`, `Bash cat`, `Grep` tools read `agent-mailbox/*` files directly without passing through any lib function.
- **Why accepted**: no process-level gate possible without OS-level ACL or separate mailbox daemon. Out of scope for this task.
- **Mitigation**: documentation contract in `local-claude-codex-mailbox-workflow.md` — explicit «agent discipline: do not bypass CLI/API» rule. Already partially present from corp-isolation task; append FS-read clause.

### G3 — `fetchAgentMessages` is dead code pre-change

- **What**: no caller imports it.
- **Option in plan**: keep + extend with `session_id` param for future callers.
- **Honest flag**: if Codex prefers deletion, change is trivial. Default decision recorded in G3-decision below.

### G4 — Session_id propagation contract

- **What**: for agents to send `session_id` on every `/api/agent/messages` call, they must know their own session_id.
- **Current state**: `scripts/mailbox-session-register.mjs` receives session_id from hook stdin and POSTs to supervisor. Agent doesn't currently have direct access to its own session_id.
- **Mitigation path**: supervisor already persists `sessions.json`. Agent can use `resolveCallerProject`-style lookup to find its own session. Or — simpler — the agent may use the CLI (which reads sessions.json via `resolveCallerProject`) instead of HTTP. HTTP endpoint primarily exists for dashboard/runtime tools, not core agent flow.
- **Decision to record in plan**: session-bind on HTTP is defensive-depth; the primary fix is CLI side. HTTP layer is secondary and agent flow does not rely on it.

### G5 — Verification of middleware order in Express 5

- **What**: docs (§V1, §V2) confirm middleware-before-route pattern. But we re-verify empirically via negative probe: `/api/agent/messages` with missing session_id returns 400 before handler runs.
- **Mitigation**: Codex pre-flight empirical probe `curl /api/agent/messages?project=X` (no session_id) → 400.

### G6 — Breaking change risk for external agent callers

- **What**: if any hook script or automation POSTs directly to `/api/agent/messages` without session_id, it will break.
- **Current state**: only one declared caller (`fetchAgentMessages` dead code). No other `/api/agent/messages` call-sites discovered (see §5 grep).
- **Mitigation**: breaking change accepted; document in release note inside `local-claude-codex-mailbox-workflow.md`.

### G7 — Supervisor restart and `state.sessions` volatility (pre-existing, not introduced)

- **What**: `dashboard/supervisor.mjs:start()` calls `persistSessions` but NOT a `loadSessions` — after a server restart, in-memory `state.sessions` Map starts empty even though `sessions.json` on disk retains the last-persisted set. Until SessionStart hooks re-fire, HTTP lookups via `state.sessions.get(sessionId)` will return undefined → V9-style 404 for previously-valid sessions.
- **Scope impact**: this plan's V8-V12 probes assume the server has been running continuously since the SessionStart hooks registered the agent. If Codex re-probes after a server restart without a fresh SessionStart, V9/V11 may false-negative.
- **Mitigation (in-plan)**: Codex verification steps must begin with an explicit SessionStart re-register or server-uptime confirmation (add as prerequisite in `read-isolation-report.md` §2 probes).
- **Mitigation (out-of-plan)**: loading sessions.json into `state.sessions` on supervisor start is the right durable fix, but **out of scope** for this task. Flag for follow-up.

### G8 — Line-count convention (Read-tool vs `wc -l`)

- **What**: planning-audit §3 reports file sizes using Read-tool line numbering (includes last content line). `wc -l` counts newline characters, so it reports one less when file ends with `\n`. Both conventions are correct; they disagree by 1.
- **Reference values**: mailbox.mjs: Read=411 / wc=410. mailbox-lib.mjs: Read=820 / wc=819. server.js: Read=306 / wc=305. api.js: Read=83 / wc=82.
- **Implication for Codex verification**: when re-verifying line references in §3, use Read-tool or an editor's line numbers (not `wc -l` arithmetic).

### G9 — Process-memory serial reuse (explicit non-goal in v2)

- **What**: a single Node process (CLI or dashboard server) handles back-to-back requests from different session_id / project bindings. Even with per-request scope, the V8 garbage collector may retain heap pages with prior-request content until GC reclaims them. A hostile agent with memory-dump capability could theoretically observe prior-request content.
- **Why out of scope**: requires process-per-project model (spawn CLI per project) or V8 sandbox isolation — substantial redesign beyond agent-path file-read isolation.
- **Truthfulness note**: plan v2 Section 1 documents this as residual explicitly in §8 Out-of-scope.

### G10 — Filename-prefix charset conflict

- **What**: if a project slug contains `__`, the `extractFilenameProject` prefix parser is ambiguous.
- **Mitigation**: `normalizeProject` will reject slugs containing `__` (to be added as a pre-flight guard in Change 0 implementation). Empirical check: observed live project slugs (`workflow`, `messenger_test`) contain max one `_` — compatible.
- **Residual**: new projects must follow slug convention `[a-z0-9][a-z0-9_-]*` without `__` substring. Documented in `local-claude-codex-mailbox-workflow.md` §11.1 storage invariant.

### G11 — Migration atomicity across WSL/Windows + execution ownership

- **What**: migration script renames live `agent-mailbox/` files. Concurrent readers (supervisor pollTick, dashboard UI, active Claude/Codex CLI) could see partial-rename flicker.
- **Execution owner (v3)**: **user**, during an explicit maintenance window (plan Change 11.2 Step B). Claude's execute session ENDS after Step A code commit.
- **Sequence**:
  1. Step A: Claude commits code + docs (git-tracked). Session ends.
  2. Step B1 (user): close dashboard server + all agent sessions.
  3. Step B2-B5 (user): dry-run → apply → idempotency check → filesystem sanity (`find agent-mailbox -name "*.md" -not -name "*__*"`).
  4. Step B6-B7 (user): restart dashboard + open fresh Claude Code session.
  5. Step B8 (fresh Claude): run remaining V-probes + fill report §2.
- **Pre-migration checkpoint**: filesystem-only count (`agent-mailbox/` is gitignored per §10 G12, so git-based baselines cannot be used).

### G12 — `.gitignore` reality for `agent-mailbox/` (v3 discovery)

- **What**: `.gitignore:1-3` ignores `agent-mailbox/` and `mailbox-runtime/`. Plan v2 incorrectly relied on `git diff / git revert / git ls-files / git status --porcelain` for mailbox rename tracking — these are no-ops on ignored paths.
- **Origin**: Codex round-2 finding `2026-04-21T15:19:33Z-codex-003` Critical 1.
- **Fix applied in v3**:
  - V21 excludes `agent-mailbox/` from expected git diff; added V21b (migration-log line count) + V21c (filesystem-only full-migration check).
  - §9 Rollback splits code (git revert) from data (migration-log restore via `--restore <log>` mode).
  - §10 #11 replaces `git ls-files agent-mailbox/archive` with `find agent-mailbox/archive -name "*.md" | wc -l`.
  - §10 #12 (new) documents the mixed-state window between Step A code commit and Step B migration — mitigated by runbook mandating session shutdown.
  - Report §2 G7 + G11 prereq use filesystem inventory, not `git status`.
- **Invariant for future work**: any verification of mailbox data state MUST use filesystem tools (`find`, `ls`, migration-log reads). Git is never authoritative for `agent-mailbox/`.



---

## §11 Signature

Created: 2026-04-21
Author: Claude (workflow project)
Status: in-progress (skeleton)
