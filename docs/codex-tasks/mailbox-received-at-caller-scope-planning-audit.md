# mailbox-received-at-caller-scope — Planning audit

**Stage**: 6. **Brief**: `docs/codex-tasks/mailbox-received-at-caller-scope.md`.
**Base commit**: v5 (this) rebases on top of v4 commit `e334c55`; prerequisite chore `fea959e` (`.gitattributes`) already landed. Exec starts from whatever HEAD is at the moment v5 is approved (expected: `e334c55` + the v5 docs commit).
**Audit mode**: pre-exec — this package goes to Codex BEFORE any code change.
**Revision history**: v1 → v2 → v3 → v4 → v5 (this). See brief §8 for per-round summary. v5 applies Codex round-4 findings: absolute SCRIPT path for CLI-child-process probes (fix for non-existent `scripts/mailbox.mjs` relative to fixture cwd), duplicate §2.4 resolved (env-overrides is now §2.4, server.js fix is §2.5), stale base-ref in report template unpinned, brief version/scope labels bumped to v5.

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
- `scripts/mailbox.mjs:274-303` — `handleReply`: reads target via `readMessageByRelativePath` (accepts any in-project to-claude/* or to-codex/* path — Codex round-2 blocker 2), calls `markMessageReceived(location)` unconditionally, reads body, writes outgoing reply via `sendMessage`, archives the target. **Scope change from v1:** wrong-direction caller (e.g., Claude invoking reply with a `to-codex/*` target) can silently archive Codex's inbox item. v3 rejects such reply with `ClientError(64)` before any filesystem mutation.
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

### 2.3 `scripts/mailbox.mjs` — `handleReply` reject wrong-direction (Codex blocker 2, v3 tightening)

v2 attempted «skip mark, let reply proceed». Codex round-2 correctly flagged that as incomplete — the reply flow also archives the target and writes an outgoing letter, so even without marking, a cross-direction caller can still close foreign inbox items. v3 rejects wrong-direction reply entirely, BEFORE any state mutation.

Before (current, lines ~274-303):

```js
const targetMessage = await readMessageByRelativePath(options.to, mailboxRoot, { project: boundProject });
validateProjectScope(explicitProject, targetMessage);
const location = path.resolve(mailboxRoot, targetMessage.relativePath);
await markMessageReceived(location);
const body = await readBody(options);
const to = getReplyTargetForMessage(targetMessage, from);
// … sendMessage + archiveMessage …
```

After:

```js
const targetMessage = await readMessageByRelativePath(options.to, mailboxRoot, { project: boundProject });
validateProjectScope(explicitProject, targetMessage);

const boundAgent = await resolveCallerAgent({ cwd: process.cwd(), runtimeRoot });
if (!boundAgent) {
  throw new ClientError(64, "reply requires a bound session (claude or codex) for current cwd");
}
if (targetMessage.to !== boundAgent) {
  throw new ClientError(
    64,
    `reply target bucket owned by "${targetMessage.to}"; cannot reply as "${boundAgent}"`
  );
}

const location = path.resolve(mailboxRoot, targetMessage.relativePath);
await markMessageReceived(location);
const body = await readBody(options);
const to = getReplyTargetForMessage(targetMessage, from);
// … sendMessage + archiveMessage (unchanged) …
```

Reject happens BEFORE any filesystem mutation — no partial state. Rest of `handleReply` unchanged for the same-direction case.

### 2.4 Env-based overrides for mailboxRoot / runtimeRoot / port (Codex blocker 3, v3 new)

Required so the fixture harness can run a throwaway server + CLI child-process against disposable roots. Codex round-2 correctly flagged that the current code hard-codes these.

`scripts/mailbox-lib.mjs:11,31` — replace constants:

```js
const port = Number(process.env.PORT) || 3003;
const defaultMailboxRoot = process.env.MAILBOX_ROOT
  ? path.resolve(process.env.MAILBOX_ROOT)
  : path.resolve(__dirname, "..", "agent-mailbox");
```

`scripts/mailbox.mjs:27-30` — mirror:

```js
const runtimeRoot = process.env.RUNTIME_ROOT
  ? path.resolve(process.env.RUNTIME_ROOT)
  : path.resolve(__dirname, "..", "mailbox-runtime");
const mailboxRoot = defaultMailboxRoot; // already env-aware via lib
```

`dashboard/server.js:5-27` — same pattern for `mailboxRoot` + `runtimeRoot` + `port`.

Behaviour: env vars unset → defaults unchanged (backward compatible). Env vars set → fully overridable. Fixture probes set `MAILBOX_ROOT`, `RUNTIME_ROOT`, `PORT` before spawning server / CLI child processes.

### 2.5 `dashboard/server.js` — agent `GET /messages` fix

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

## 3. Acceptance Criteria (v4 — CLI-child-process + HTTP, no direct-import)

### 3.0 Test harness (Codex blockers 3 + round-3 re-blocker)

All CLI / server ACs below use **disposable fixture data** so the real `workflow` mailbox and active `mailbox-runtime/sessions.json` stay intact. **Invocation is CLI-child-process or HTTP only** — v4 drops the direct-import of `handleList` / `handleReply` because they are NOT exported from `scripts/mailbox.mjs` (Codex round-3 finding 1). All probes route through the existing external interfaces.

- **Fixture root**: `E:/tmp/stage6-probe-<ISO>/` (outside repo) — contains `mailbox/to-claude/`, `mailbox/to-codex/`, `mailbox/archive/`, and `runtime/sessions.json`. Populated by a throwaway `tmp-probe-stage6.mjs` driver script at the start of each AC run.
- **CLI probes (AC-7..10)**: the driver computes `SCRIPT = path.resolve(repoRoot, "scripts", "mailbox.mjs")` — **absolute** path, resolved from the repo root where the driver lives, NOT relative to the fixture cwd (the fixture has no `scripts/` tree). Invocation: `child_process.spawnSync("node", [SCRIPT, "list", "--bucket", "all", "--project", "fx"], { cwd: "<fix>/work", env: { ...process.env, MAILBOX_ROOT: "<fix>/mailbox", RUNTIME_ROOT: "<fix>/runtime" } })`. `cwd` stays at `<fix>/work` so that `resolveCallerProject` / `resolveCallerAgent` (which read `RUNTIME_ROOT/sessions.json` and match against `process.cwd()`) resolve via the fixture session entry. Same pattern for `reply`. After each invocation, the driver reads fixture frontmatter via `fs.readFileSync` + `gray-matter` and asserts expected `received_at` presence/absence, archive status, outgoing-letter existence, exit code, stderr text (for reject cases).
- **Helper probes (AC-1..6)**: the driver imports ONLY `resolveCallerAgent` from `../scripts/mailbox-lib.mjs` (named export). `resolveCallerSession` is NOT imported — AC-1 confirms it via negative-test. No `handleList` / `handleReply` imports anywhere.
- **Server-side ACs (AC-11..14)**: spawn throwaway `node dashboard/server.js` with env `PORT=3013 MAILBOX_ROOT=<fix>/mailbox RUNTIME_ROOT=<fix>/runtime`; wait for readiness via `curl 127.0.0.1:3013/api/messages?project=fx` → 200; run probes via `curl` (HTTP surface); shut down with SIGTERM; `await` child exit.
- **Cleanup (AC-20)**: driver's `finally` block does `rm -rf E:/tmp/stage6-probe-*` and `kill -TERM` on any leftover child processes. Runs on both pass and fail paths.
- **AC-17 scope**: restart the prod dev-server process on port 3003 (Ctrl-C current `npm run dev`, relaunch) + `curl /api/messages` → 200. Catches import/syntax regressions that `npx vite build` cannot (vite builds the client bundle only; the server.js + mailbox-lib.mjs live-run is separate). No test letters, no real frontmatter mutation. Full end-to-end smoke with real letters is user-driven AFTER work-verification and NOT an AC.

### 3.1 ACs

| AC | Description | Probe | Expected |
|---|---|---|---|
| AC-1 | `resolveCallerAgent` on exported surface; `resolveCallerSession` internal-only | Fixture probe: `import("../scripts/mailbox-lib.mjs")` → `typeof resolveCallerAgent === "function"` AND `typeof resolveCallerSession === "undefined"` | Pass |
| AC-2 | `resolveCallerAgent` returns `"claude"` for claude-registered cwd | Fixture session `{agent:"claude", project:"fx", cwd:"<fix>/work"}`; call with `cwd:"<fix>/work"` | `"claude"` |
| AC-3 | `resolveCallerAgent` returns `"codex"` for codex-registered cwd | Same with `agent:"codex"` | `"codex"` |
| AC-4 | `resolveCallerAgent` returns `""` for invalid `agent` field | Session `{agent:"gpt", …}` or missing | `""` |
| AC-5 | `resolveCallerAgent` returns `""` when cwd has no matching session | Session at `<fix>/foo`, call with `cwd:"<fix>/bar"` | `""` |
| AC-6 | `resolveCallerProject` post-refactor preserves expected output for known inputs (no git-stash) | Fixture session `{agent:"claude", project:"fx", cwd:"<fix>/work"}`; call `resolveCallerProject({cwd:"<fix>/work", runtimeRoot:"<fix>/runtime"})` on revised code. Assert return value matches expected string. | `"fx"` |
| AC-7 | CLI child-process `list` from Claude-bound cwd does NOT mark `to-codex` pending | Fixture session `{agent:"claude", project:"fx", cwd:"<fix>/work"}`; pending letter in `<fix>/mailbox/to-codex/fx__*.md` without `received_at`; `spawnSync("node", [SCRIPT /* absolute path to repo's scripts/mailbox.mjs */,"list","--bucket","all","--project","fx"], {cwd:"<fix>/work", env:{...process.env, MAILBOX_ROOT:"<fix>/mailbox", RUNTIME_ROOT:"<fix>/runtime"}})`; exit code 0. Read fixture letter frontmatter via fs+gray-matter post-call. | Exit 0; `received_at` STILL absent from `to-codex` letter |
| AC-8 | CLI child-process `list` from Claude-bound cwd DOES mark `to-claude` pending | Same fixture + env + cwd + absolute SCRIPT path; pending letter in `<fix>/mailbox/to-claude/fx__*.md` without `received_at`; same `spawnSync`. | Exit 0; `received_at` now present in `to-claude` letter |
| AC-9 | CLI child-process `reply` with same-direction target → full flow succeeds | Fixture session `{agent:"claude", …}`; pending `to-claude/fx__…codex-001.md`; `spawnSync("node", [SCRIPT, "reply","--from","claude","--project","fx","--to","to-claude/fx__…codex-001.md","--body","x"], { cwd: "<fix>/work", env })`. | Exit 0; target's `received_at` stamped; target moved to `archive/`; outgoing reply letter created in `to-codex/` |
| AC-10 | CLI child-process `reply` with wrong-direction target → **rejected** (exit 64, zero mutation) | Same fixture with a pending `to-codex/fx__…claude-001.md` (wrong direction for a Claude caller); `spawnSync("node", [SCRIPT, "reply", …, "--to", "to-codex/fx__…claude-001.md", "--body", "x"], {cwd, env})`. | Exit code 64; stderr contains `reply target bucket owned by "codex"; cannot reply as "claude"`; target frontmatter untouched (no `received_at`, no `status: archived`, still in `to-codex/`); no new letter in any bucket |
| AC-11 | Server `GET /api/agent/messages` with `session.agent:"claude"` marks only `to-claude` | Throwaway server on port 3013 + fixture; register fixture claude-session with known `session_id`; seed 1 pending letter in each of `to-claude/` + `to-codex/`; `curl "http://127.0.0.1:3013/api/agent/messages?project=fx&session_id=<id>"` (auth middleware at `server.js:186-205` takes session_id as QUERY PARAM, not header — Codex round-2 finding 4). Inspect both letters post-call. | `to-claude` stamped; `to-codex` NOT stamped |
| AC-12 | Server: mirror with `session.agent:"codex"` marks only `to-codex` | Same fixture, switch session's `agent` to `"codex"`, restart throwaway server. | `to-codex` stamped; `to-claude` NOT stamped |
| AC-13 | Server: unknown `session.agent` skips marking entirely | Session `{agent:"gpt", …}`; repeat AC-11 shape. | Both buckets untouched |
| AC-14 | Server `GET /api/messages` (non-agent) does not mark anything | `curl 127.0.0.1:3013/api/messages?project=fx` with seeded pending letters; inspect post-call. | Neither bucket stamped |
| AC-15 | Post-exec diff scope sane | Real-repo `git diff --stat` post-code-exec | Only `scripts/mailbox.mjs`, `scripts/mailbox-lib.mjs`, `dashboard/server.js`. ~130-170 LOC net (v3 scope includes env overrides + reply reject). |
| AC-16 | `npx vite build` clean | `cd dashboard && npx vite build` | Pass |
| AC-17 | Prod dev-server (port 3003) restart succeeds post-exec | Kill + `npm run dev` restart; `curl 127.0.0.1:3003/api/messages` → 200; vite log shows no import / syntax error. | Pass |
| AC-18 | No new deps | `git diff --stat package.json dashboard/package.json` post-exec | 0 lines |
| AC-19 | PD scan clean | CI parity grep | Exit 1, 0 hits outside ci.yml |
| AC-20 | Fixture cleanup complete | `ls E:/tmp/stage6-probe-*` | Absent |

## 4. Out of scope

Enumerated in §4 of brief. Notable items: no retroactive correction of bogus `received_at` values; no body/metadata separation refactor; no change to session binding format; no client-side UI change.

## 5. Risks / adversarial bait for Codex (v4 — reply reject + env overrides + CLI-only probes)

Not anchoring — Codex forms ≥3 independent risks per Rule #7. Candidates:

1. **Agent detection false negative (stale sessions)**: if `sessions.json` contains an expired entry whose cwd still matches, `resolveCallerAgent` returns the stale `agent`. Mitigation options: (a) accept — same risk already in `resolveCallerProject`; (b) narrow by `last_seen` cutoff. v2 plan does NOT add cutoff; inherits the existing behaviour.
2. **Case-sensitivity edge on Linux (non-WSL)**: `resolveCallerSession` will mirror `resolveCallerProject`'s `.toLowerCase()` cwd match. Case-sensitive fs → different-case cwd treated as match here. Pre-existing; not worsened.
3. **Race: list + simultaneous send**: `markMessageReceived` is idempotent (skips if `received_at` set), so no double-stamp. Sub-second race between send and recipient-side list still possible — acceptable as pre-existing behaviour.
4. **Fixture invocation via env overrides**: resolved in v3 by §2.5 scaffolding — `MAILBOX_ROOT`, `RUNTIME_ROOT`, `PORT` env vars now honored across `mailbox-lib.mjs`, `mailbox.mjs`, `dashboard/server.js`. Fixture probes spawn child processes / HTTP clients with the env vars set; defaults unchanged when env absent.
5. **Reply reject vs. pass-through (v3 tightening)**: v2 planned «skip mark, reply proceeds»; Codex round-2 correctly flagged this still lets a caller archive a foreign inbox item. v3 rejects wrong-direction reply with `ClientError(64)` before any state mutation. Edge case: a caller with no bound session at all → same error as current «reply requires bound session» path, no change needed there.
6. **Server restart + prod port**: AC-17 tests prod port 3003 restart. If user is actively reading dashboard at time of exec, that restart drops their browser connection for ~1-2 s. Not destructive, but worth noting before exec starts.
7. **Rule #8 size (v4)**: ~130-170 LOC net (env overrides + reply reject + resolveCallerSession + caller-scope). Still one commit per Codex round-1 «one commit fine once base-state is clean». If you want splits at env-overrides / reply-reject / caller-scope boundaries — say so; clean cut points.

## 6. Rollback

Multi-commit landing on master:

- `fea959e` (prerequisite chore, `.gitattributes` + renormalization) — landed pre-v3 docs. Independent of Stage 6 code; leave in place on Stage-6 rollback (it's repo hygiene).
- `f9a3cd1` (v3 docs) — `.md` artifacts only, zero code impact; no rollback needed.
- `<v4 docs sha>` (this revision) — `.md` artifacts only; no rollback needed.
- `<stage-6-code sha>` (TBD, post-approval) — the actual code change; `git revert <that sha>` restores pre-Stage-6 behaviour of `mailbox-lib.mjs` / `mailbox.mjs` / `server.js`.

Pushing any revert to `origin/master` requires an explicit user command per Rule #11. No data migration.

## 7. Handoff package

Planning-audit (this doc) + brief go to Codex via mailbox thread `mailbox-received-at-caller-scope` for pre-exec adversarial review. Execution starts only after Codex responds with either «no blockers» or «apply findings first». The 3rd artifact (`-report.md`) is written post-exec; Codex writes `-work-verification.md` after.
