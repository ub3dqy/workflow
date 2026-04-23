# mailbox-received-at-caller-scope — Planning audit

**Stage**: 6. **Brief**: `docs/codex-tasks/mailbox-received-at-caller-scope.md`.
**Base commit**: v1 of this package = `6c347e5` on `master` = `origin/master` (fixed per Codex round-1 blocker 1). v2 lands this revision on top; exec starts from whatever HEAD is at the moment v2 is approved.
**Audit mode**: pre-exec — this package goes to Codex BEFORE any code change.
**Revision history**: v2 (this) applies Codex round-1 findings: base-SHA fix, reply-path scope expansion, helper extraction to `resolveCallerSession`, fixture-based AC probes, rollback-text tightening.

---

## 1.0 Base-state check

```
$ git rev-parse HEAD
<HEAD before v2 docs commit>

$ git status --short
<clean>
```

Any CRLF/whitespace churn that appears after git-attribute normalisation is tracked down and committed OR discarded BEFORE code execution; the execution report will include a fresh `git status --short` + `git diff --stat` captured at the moment the code changes begin.

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

### 2.1 `scripts/mailbox-lib.mjs` — extract `resolveCallerSession` + wrappers (Codex rec #1)

Step 1 — extract shared lookup as internal helper (not a new export):

```js
async function resolveCallerSession({ cwd, runtimeRoot }) {
  // Body = current resolveCallerProject body minus the final
  // `normalizeProject(entry.project) || ""` returns; instead returns
  // the matching `entry` object or `null`.
  // Same case-folded exact-or-ancestor cwd match, same ENOENT handling,
  // same JSON-parse fallback to null.
}
```

Step 2 — refactor existing `resolveCallerProject` to a thin wrapper:

```js
export async function resolveCallerProject({ cwd, runtimeRoot }) {
  const entry = await resolveCallerSession({ cwd, runtimeRoot });
  return normalizeProject(entry?.project) || "";
}
```

Step 3 — add new `resolveCallerAgent` as a thin wrapper:

```js
export async function resolveCallerAgent({ cwd, runtimeRoot }) {
  const entry = await resolveCallerSession({ cwd, runtimeRoot });
  return sanitizeAgent(entry?.agent);
}

function sanitizeAgent(value) {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  return v === "claude" || v === "codex" ? v : "";
}
```

`resolveCallerAgent` is added to the existing export set. `resolveCallerSession` is NOT exported (internal only). Behaviour of `resolveCallerProject` is observable-identical to the current version; the refactor exists purely for DRY and to land Codex's rec #1.

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

### 2.3 `scripts/mailbox.mjs` — `handleReply` caller-scope mark (Codex blocker 2)

Before (current, lines ~274-282):

```js
const targetMessage = await readMessageByRelativePath(options.to, mailboxRoot, { project: boundProject });
validateProjectScope(explicitProject, targetMessage);
const location = path.resolve(mailboxRoot, targetMessage.relativePath);
await markMessageReceived(location);
```

After:

```js
const targetMessage = await readMessageByRelativePath(options.to, mailboxRoot, { project: boundProject });
validateProjectScope(explicitProject, targetMessage);
const location = path.resolve(mailboxRoot, targetMessage.relativePath);
const boundAgent = await resolveCallerAgent({ cwd: process.cwd(), runtimeRoot });
if (boundAgent && targetMessage.to === boundAgent) {
  await markMessageReceived(location);
}
// else: reply still proceeds (writes the outgoing letter), but the WRONG-direction target is NOT stamped.
```

The rest of `handleReply` (body read, outgoing-letter write via `sendMessage`) is unchanged.

### 2.4 `dashboard/server.js` — agent `GET /messages` fix

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

## 3. Acceptance Criteria (v2 — fixture-based, no live-mailbox mutation)

### 3.0 Test harness (Codex blocker 3)

All CLI / server ACs below use **disposable fixture data** so the real `workflow` mailbox and active `mailbox-runtime/sessions.json` stay intact:

- **Fixture root**: `E:/tmp/stage6-probe-<ISO>/` (outside repo) — contains `mailbox/to-claude/`, `mailbox/to-codex/`, `mailbox/archive/`, and `runtime/sessions.json`. Populated by a throwaway `tmp-probe-stage6.mjs` script at the start of each AC run.
- **Helper / handleList / handleReply unit tests**: the probe script `import`s from the repo's `scripts/mailbox-lib.mjs` and `scripts/mailbox.mjs`, passing explicit `runtimeRoot` + `mailboxRoot` to the helpers and calling their internal logic. No live CLI invocation.
- **Server-side ACs**: run a **throwaway** `node dashboard/server.js` instance on port **3013** (not prod `3003`) using env `PORT=3013 MAILBOX_ROOT=<fix>/mailbox RUNTIME_ROOT=<fix>/runtime`. Wait for readiness via `curl 127.0.0.1:3013/api/messages?project=fx` → 200. Run probes. Shut down with SIGTERM.
- **Cleanup (AC-20)**: `rm -rf E:/tmp/stage6-probe-*` at probe-script exit (always, even on failure via `finally`).
- **Post-exec smoke against real mailbox**: happens AFTER Codex work-verification, NOT as part of ACs. It's a separate user-initiated check on `workflow` mailbox after commit + push.

### 3.1 ACs

| AC | Description | Probe | Expected |
|---|---|---|---|
| AC-1 | `resolveCallerAgent` on exported surface; `resolveCallerSession` internal-only | Fixture probe: `import("../scripts/mailbox-lib.mjs")` → `typeof resolveCallerAgent === "function"` AND `typeof resolveCallerSession === "undefined"` | Pass |
| AC-2 | `resolveCallerAgent` returns `"claude"` for claude-registered cwd | Fixture session `{agent:"claude", project:"fx", cwd:"<fix>/work"}`; call with `cwd:"<fix>/work"` | `"claude"` |
| AC-3 | `resolveCallerAgent` returns `"codex"` for codex-registered cwd | Same with `agent:"codex"` | `"codex"` |
| AC-4 | `resolveCallerAgent` returns `""` for invalid `agent` field | Session `{agent:"gpt", …}` or missing | `""` |
| AC-5 | `resolveCallerAgent` returns `""` when cwd has no matching session | Session at `<fix>/foo`, call with `cwd:"<fix>/bar"` | `""` |
| AC-6 | `resolveCallerProject` refactor preserves observable behaviour | Fixture probe: same inputs as AC-2; run once against baseline (`git stash` of changes) and once against revised code; compare return. | Identical output |
| AC-7 | Fixture `handleList`: Claude caller does NOT mark `to-codex` pending | Session `{agent:"claude", project:"fx"}`; pending letter in `<fix>/mailbox/to-codex/fx__*.md` with no `received_at`; invoke `handleList` logic directly (not via CLI). Inspect letter frontmatter post-call. | `received_at` STILL absent |
| AC-8 | Fixture `handleList`: Claude caller DOES mark `to-claude` pending | Same fixture; pending letter in `<fix>/mailbox/to-claude/fx__*.md` with no `received_at`. | `received_at` present after call |
| AC-9 | Fixture `handleReply`: reply target matches caller inbox → stamp | Pending `to-claude` letter; `boundAgent = "claude"` → `targetMessage.to = "claude"` → mark proceeds. | Target `received_at` set |
| AC-10 | Fixture `handleReply`: reply target in opposite bucket → DO NOT stamp | Pending `to-codex` letter; `boundAgent = "claude"` → `targetMessage.to = "codex"` ≠ `boundAgent` → skip mark, but outgoing reply letter MUST still be written. | Outgoing reply letter present in fixture; target `received_at` STILL absent |
| AC-11 | Server `GET /api/agent/messages` with `session.agent:"claude"` marks only `to-claude` | Throwaway server on port 3013 + fixture; register fixture claude-session; seed 1 pending letter in each of `to-claude/` + `to-codex/`; HTTP call to endpoint with `x-session-id`. Inspect both letters post-call. | `to-claude` stamped; `to-codex` NOT stamped |
| AC-12 | Server: mirror with `session.agent:"codex"` marks only `to-codex` | Same fixture, switch session's `agent` to `"codex"`, restart throwaway server. | `to-codex` stamped; `to-claude` NOT stamped |
| AC-13 | Server: unknown `session.agent` skips marking entirely | Session `{agent:"gpt", …}`; repeat AC-11 shape. | Both buckets untouched |
| AC-14 | Server `GET /api/messages` (non-agent) does not mark anything | `curl 127.0.0.1:3013/api/messages?project=fx` with seeded pending letters; inspect post-call. | Neither bucket stamped |
| AC-15 | Post-exec diff scope sane | Real-repo `git diff --stat` post-code-exec | Only `scripts/mailbox.mjs`, `scripts/mailbox-lib.mjs`, `dashboard/server.js`. ~80-120 LOC net. |
| AC-16 | `npx vite build` clean | `cd dashboard && npx vite build` | Pass |
| AC-17 | Prod dev-server (port 3003) restart succeeds post-exec | Kill + `npm run dev` restart; `curl 127.0.0.1:3003/api/messages` → 200; vite log shows no import / syntax error. | Pass |
| AC-18 | No new deps | `git diff --stat package.json dashboard/package.json` post-exec | 0 lines |
| AC-19 | PD scan clean | CI parity grep | Exit 1, 0 hits outside ci.yml |
| AC-20 | Fixture cleanup complete | `ls E:/tmp/stage6-probe-*` | Absent |

## 4. Out of scope

Enumerated in §4 of brief. Notable items: no retroactive correction of bogus `received_at` values; no body/metadata separation refactor; no change to session binding format; no client-side UI change.

## 5. Risks / adversarial bait for Codex (v2 updated — reply path moved to in-scope, new risks added)

Not anchoring — Codex forms ≥3 independent risks per Rule #7. Candidates:

1. **Agent detection false negative (stale sessions)**: if `sessions.json` contains an expired entry whose cwd still matches, `resolveCallerAgent` returns the stale `agent`. Mitigation options: (a) accept — same risk already in `resolveCallerProject`; (b) narrow by `last_seen` cutoff. v2 plan does NOT add cutoff; inherits the existing behaviour.
2. **Case-sensitivity edge on Linux (non-WSL)**: `resolveCallerSession` will mirror `resolveCallerProject`'s `.toLowerCase()` cwd match. Case-sensitive fs → different-case cwd treated as match here. Pre-existing; not worsened.
3. **Race: list + simultaneous send**: `markMessageReceived` is idempotent (skips if `received_at` set), so no double-stamp. Sub-second race between send and recipient-side list still possible — acceptable as pre-existing behaviour.
4. **handleList inner-logic invocation in fixture**: `scripts/mailbox.mjs` is a CLI entry point that wires `process.argv` + process.exit. Fixture probes need to either (a) invoke the `handleList` function directly (if exported) or (b) call the CLI as a child_process with env overrides. If (a) is not available without a refactor, v2 defaults to (b) via `child_process.spawn("node", ["scripts/mailbox.mjs", "list", …], { env: { ...process.env, MAILBOX_ROOT: fix, RUNTIME_ROOT: fix } })` — this works ONLY if mailbox.mjs and mailbox-lib.mjs honor those env vars (grep suggests yes — current paths use `mailboxRoot` + `runtimeRoot` passed in, resolved from module-level constants read from process). Codex please confirm that env-override path is viable or flag if a small refactor is needed to expose internals for test injection.
5. **Reply path scope change**: v2 now adds the mark-scope guard to `handleReply`. Edge-case worth flagging: if a Claude caller replies to a letter they themselves SENT (i.e. target is in `to-codex` with `from: claude`, which is semantically «I'm replying to myself»), reply proceeds but target not stamped. That's the correct fix, but the UX is «replied but letter remains pending» — visible in dashboard as «unread» still. Confirm that's intended.
6. **Server restart + prod port**: AC-17 tests prod port 3003 restart. If user is actively reading dashboard at time of exec, that restart drops their browser connection for ~1-2 s. Not destructive, but worth noting before exec starts.
7. **Rule #8 size**: ~80-120 LOC net (v2 scope). Still single commit. If Codex prefers a split — (a) helper extraction + `resolveCallerAgent`, (b) call-sites — say so.

## 6. Rollback

Single commit. `git revert <sha>` locally. Pushing the revert to `origin/master` requires explicit user command per Rule #11 — not implied here. No data migration to undo.

## 7. Handoff package

Planning-audit (this doc) + brief go to Codex via mailbox thread `mailbox-received-at-caller-scope` for pre-exec adversarial review. Execution starts only after Codex responds with either «no blockers» or «apply findings first». The 3rd artifact (`-report.md`) is written post-exec; Codex writes `-work-verification.md` after.
