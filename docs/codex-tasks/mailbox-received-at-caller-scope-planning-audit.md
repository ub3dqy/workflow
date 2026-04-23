# mailbox-received-at-caller-scope — Planning audit

**Stage**: 6. **Brief**: `docs/codex-tasks/mailbox-received-at-caller-scope.md`.
**Base commit**: `f9cd404` on `master` = `origin/master`.
**Audit mode**: pre-exec — this package goes to Codex BEFORE any code change.

---

## 1. Pre-exec research

### 1.1 Current marking paths

- `scripts/mailbox-lib.mjs:604-626` — `markMessageReceived(filePath)` reads YAML frontmatter via `gray-matter`, returns early if `"received_at" in parsed.data`, otherwise writes `received_at = toUtcTimestamp()` via atomic `.tmp` + `fs.rename`. Idempotent. No caller context.
- `scripts/mailbox.mjs:215-223` — call site inside `handleList`; loops over `filtered` messages, marks every pending `to-claude` or `to-codex` entry. No caller-agent check.
- `scripts/mailbox.mjs:281` — call site inside `handleReply`; marks the reply target. Caller = replier by construction, so semantics are correct here (the replier has read the message they're replying to). No change needed.
- `dashboard/server.js:225-232` — agent-authenticated router `GET /messages`; marks every pending entry from both buckets after reading them. `request.agentSession.agent` is already populated by the session-auth middleware at `:196-212` but is never consulted during the mark loop.
- `dashboard/server.js:/api/messages` (non-agent, `:47-70`) — no marking. Dashboard polling is safe and unaffected.
- `scripts/supervisor.mjs` — does not call `markMessageReceived`. Supervisor only derives a fallback `received_at` for its `pendingIndex` output (derived field, distinct from raw frontmatter).

### 1.2 Session-agent lookup pattern

`scripts/mailbox-lib.mjs:57-118` — `resolveCallerProject({ cwd, runtimeRoot })` reads `runtimeRoot/sessions.json`, does case-folded `targetHost` vs `entry.cwd` match (exact or ancestor-prefixed with platform-appropriate separator), returns `normalizeProject(entry.project)` or `""`. The same matching logic is exactly what we need for `resolveCallerAgent`; the only difference is the returned field (`entry.agent` vs `entry.project`).

Session entry shape (per `mailbox-runtime/sessions.json` inspected on 2026-04-23):

```json
{
  "session_id": "b5ffb21f-d66c-4de8-b6fb-901f65e64fe8",
  "agent": "claude",
  "project": "workflow",
  "cwd": "E:\\Project\\workflow\\dashboard",
  "transport": "claude-hooks",
  "platform": "windows",
  "last_seen": "2026-04-22T22:40:01Z"
}
```

`entry.agent` is always `"claude"` or `"codex"` for sessions registered by the existing `claude-hooks` + `codex-hooks` pipelines. Future transports could theoretically register other roles, so the fix treats anything not in the allow-list `{"claude","codex"}` as «no marking».

### 1.3 Existing letter corpus — will any behaviour regress?

Sampled frontmatter on disk (2026-04-23):

- Pending in `to-codex/memory-claude__…bug-compile-yaml-list-fix-claude-001.md` — `created: 2026-04-22T23:51:42Z`, `received_at: 2026-04-22T23:51:50Z`. The 8-second gap indicates the bogus-marking path (Claude sent, something immediately stamped). Will not retroactively fix.
- Archived `workflow__…s5-ui-compact-claude-002.md` — `created: 22:43:56`, `received_at: 23:30:46`, `archived_at: 23:32:05`. The 47-minute gap between create and mark is consistent with an actual Codex list/read before reply. This one was probably genuine.
- Archived Codex replies (`codex-001`, `codex-002` in s5 thread) — `received_at` stamped at near-archive time on Claude's side. Correct under current buggy semantics; will be correct (but possibly later) under fixed semantics because Claude's CLI marks its own inbox on next list.

Conclusion: the fix will CHANGE which moment `received_at` gets written for existing in-flight letters — some letters that «were marked» under the bug will now remain unmarked until the real recipient runs their list/poll. That is the intended behaviour.

### 1.4 Dependencies

No new npm packages. All fixes use already-imported functions (`path`, `fs`, `normalizeProject`, `toHostPath` from mailbox-lib; nothing new on server.js beyond rearranging the existing `toMark` filter).

## 2. Change list (concrete)

### 2.1 `scripts/mailbox-lib.mjs` — new export `resolveCallerAgent`

```js
export async function resolveCallerAgent({ cwd, runtimeRoot }) {
  // Implementation identical to resolveCallerProject body (lines 58-121),
  // EXCEPT the two `return normalizeProject(entry.project) || ""` lines
  // return `sanitizeAgent(entry.agent) || ""` instead, where sanitizeAgent
  // validates the value is "claude" | "codex" (else returns "").
  // Exact and ancestor-prefix match logic is unchanged — same case-folding,
  // same separator handling, same ENOENT / JSON-parse fallback to "".
}

function sanitizeAgent(value) {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  return v === "claude" || v === "codex" ? v : "";
}
```

Export added to the existing `export` set at the top of mailbox-lib.mjs (same pattern as `resolveCallerProject`).

### 2.2 `scripts/mailbox.mjs` — `handleList` fix

Before (current, lines ~195-223):

```js
const boundProject = await resolveCallerProject({ cwd: process.cwd(), runtimeRoot });
if (!boundProject) throw new ClientError(64, "list requires bound session for current cwd");
if (boundProject !== project) throw new ClientError(64, `session bound to "${boundProject}", refusing list for project "${project}"`);
const messages = await collectMailboxMessages(mailboxRoot, { project });
const filteredByBucket = // …
const filtered = filteredByBucket; // or filtered by args
// …
for (const msg of filtered) {
  if (msg.status === "pending" && (msg.bucket === "to-claude" || msg.bucket === "to-codex")) {
    const abs = path.resolve(mailboxRoot, msg.relativePath);
    await markMessageReceived(abs);
  }
}
```

After:

```js
const boundProject = await resolveCallerProject({ cwd: process.cwd(), runtimeRoot });
if (!boundProject) throw new ClientError(64, "list requires bound session for current cwd");
if (boundProject !== project) throw new ClientError(64, `…`);
const boundAgent = await resolveCallerAgent({ cwd: process.cwd(), runtimeRoot });
// no error if boundAgent is "" — list still prints; just skip the mark step
const callerBucket = boundAgent ? `to-${boundAgent}` : null;
const messages = await collectMailboxMessages(mailboxRoot, { project });
// … (filtering unchanged) …
for (const msg of filtered) {
  if (msg.status === "pending" && callerBucket && msg.bucket === callerBucket) {
    const abs = path.resolve(mailboxRoot, msg.relativePath);
    await markMessageReceived(abs);
  }
}
```

Import added to the top-of-file destructure: `resolveCallerAgent`.

### 2.3 `dashboard/server.js` — agent `GET /messages` fix

Before (current, lines ~222-232):

```js
const toClaude = filterMessagesByProject(allToClaude, request.agentProject);
const toCodex = filterMessagesByProject(allToCodex, request.agentProject);
const archive = filterMessagesByProject(allArchive, request.agentProject);
const toMark = [...toClaude, ...toCodex].filter(m => m.status === "pending");
await Promise.all(toMark.map(m => markMessageReceived(path.resolve(mailboxRoot, m.relativePath))));
```

After:

```js
const toClaude = filterMessagesByProject(allToClaude, request.agentProject);
const toCodex = filterMessagesByProject(allToCodex, request.agentProject);
const archive = filterMessagesByProject(allArchive, request.agentProject);
const agentRole = request.agentSession.agent;
const callerInbox =
  agentRole === "claude" ? toClaude :
  agentRole === "codex" ? toCodex :
  null;                                 // unknown role → skip marking
const toMark = callerInbox ? callerInbox.filter(m => m.status === "pending") : [];
await Promise.all(toMark.map(m => markMessageReceived(path.resolve(mailboxRoot, m.relativePath))));
```

No other changes to the endpoint (response shape, archive retrieval, session-mismatch middleware — all unchanged).

## 3. Acceptance Criteria

| AC | Description | Probe | Expected |
|---|---|---|---|
| AC-1 | `resolveCallerAgent` exported and resolves correctly | `node -e 'import("./scripts/mailbox-lib.mjs").then(m => console.log(typeof m.resolveCallerAgent))'` | `function` |
| AC-2 | `resolveCallerAgent` returns claude for a claude-registered cwd | Setup a temp session with `agent: "claude"` at cwd `/tmp/test-cwd`, call `resolveCallerAgent({ cwd: "/tmp/test-cwd", runtimeRoot: … })` | `"claude"` |
| AC-3 | `resolveCallerAgent` returns codex for a codex-registered cwd | Same pattern, `agent: "codex"` | `"codex"` |
| AC-4 | `resolveCallerAgent` returns `""` for corrupt / missing agent field | Session with `agent: "invalid"` or missing | `""` |
| AC-5 | `resolveCallerAgent` returns `""` when cwd has no matching session | Random cwd | `""` |
| AC-6 | `mailbox.mjs list` from Claude session does NOT mark `to-codex` pending | Send a fresh test letter to codex via `mailbox.mjs send --from claude --to codex --thread test-caller-scope-ac6 --project workflow --body "x"` → run `node scripts/mailbox.mjs list --bucket all --project workflow` from Claude-bound cwd → inspect frontmatter of the sent letter | `received_at` absent from frontmatter |
| AC-7 | `mailbox.mjs list` from Claude session DOES mark `to-claude` pending | Simulate an incoming-to-claude letter (e.g., have Codex send one via its own bound session, or manually create a pending letter in `to-claude/workflow__…` with no `received_at`) → run `list` from Claude session → check frontmatter | `received_at` present after list |
| AC-8 | `mailbox.mjs reply` still marks reply target | Reply to a pending letter in `to-claude` from Claude session → check target frontmatter | `received_at` present (unchanged behaviour) |
| AC-9 | Dashboard `GET /api/agent/messages` with session.agent=claude marks only `to-claude` | HTTP call with a claude session → check both buckets' pending letters | `to-claude` pending get `received_at`, `to-codex` pending do not |
| AC-10 | Dashboard `GET /api/agent/messages` with session.agent=codex marks only `to-codex` | Mirror of AC-9 with codex session | Correct bucket marked |
| AC-11 | Dashboard `GET /api/agent/messages` skips marking when session.agent is unknown | Manually poison sessions.json entry with `agent: "other"` temporarily → call endpoint → verify nothing stamped | Nothing stamped |
| AC-12 | Dashboard `GET /api/messages` (non-agent) continues to not mark | Any call → check frontmatter timestamps | No new `received_at` from this path |
| AC-13 | `npx vite build` clean (server.js is read by vite-node but let's confirm no regression) | `cd dashboard && npx vite build` | Pass |
| AC-14 | No new deps in `package.json` / `dashboard/package.json` | `git diff --stat package.json dashboard/package.json` after exec | 0 lines |
| AC-15 | PD regex scan clean (CI parity) | Same grep as prior stages | Exit 1, 0 hits outside ci.yml |

## 4. Out of scope

Enumerated in §4 of brief. Notable items: no retroactive correction of bogus `received_at` values; no body/metadata separation refactor; no change to session binding format; no client-side UI change.

## 5. Risks / adversarial bait for Codex

Not anchoring — Codex forms ≥3 independent risks per Rule #7. Candidates:

1. **Agent detection false negative**: if `sessions.json` is stale (session process long dead but entry remains), `resolveCallerAgent` could return the wrong agent role for a new transient process sharing that cwd. Current `resolveCallerProject` has the same risk by design; the fix does not worsen it but inherits it.
2. **Case-sensitivity edge**: `resolveCallerProject` uses `.toLowerCase()` on host paths. Linux (not WSL) filesystems are case-sensitive; same-path but different-case cwd would be treated as match here. Could mis-resolve on case-sensitive Linux. Acceptable trade for WSL/NTFS parity; pre-existing; not fixed or worsened by this stage.
3. **Race between list + simultaneous send**: if Codex sends a letter to Claude and Claude's poll cycle fires in the same second, the letter could be marked in-flight. `markMessageReceived` is idempotent (returns early if `received_at` is set), so no double-stamp; but the «was it read in <1 sec?» semantic question remains. Not a new risk.
4. **Agent auth middleware vs anonymous `/messages`**: the non-agent path `/api/messages` (no auth, no markMessageReceived) is used by the public dashboard. If someone lands on the dashboard page, they see messages without any mark. The fixed agent path requires session auth. Not a regression — clean separation.
5. **Reply edge-case**: Claude replies to a letter IN `to-codex` (odd but syntactically possible — user could target any path). `handleReply` still marks the target. Under fixed semantics, Claude marking a `to-codex` target via reply is still semantically defensible ("I read what I'm replying to"), but it's slightly weird since the target's proper recipient is Codex. Candidate for a follow-up tightening; not in this stage's scope per §1.1 «unchanged».
6. **Rule #8 size**: expected ~50-80 LOC. If Codex prefers even finer split (new helper in separate commit, then consumers in another), say so — easy to split.

## 6. Rollback

Single commit. `git revert <sha>` + `git push origin master`. No data migration to undo.

## 7. Handoff package

Planning-audit (this doc) + brief go to Codex via mailbox thread `mailbox-received-at-caller-scope` for pre-exec adversarial review. Execution starts only after Codex responds with either «no blockers» or «apply findings first». The 3rd artifact (`-report.md`) is written post-exec; Codex writes `-work-verification.md` after.
