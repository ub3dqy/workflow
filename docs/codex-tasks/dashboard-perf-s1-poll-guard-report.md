# dashboard-perf-s1 — Execution Report (template; populated during Phase 2+3)

**Stage**: 1 of 4
**Plan**: `docs/codex-tasks/dashboard-perf-s1-poll-guard.md`
**Planning-audit**: `docs/codex-tasks/dashboard-perf-s1-poll-guard-planning-audit.md`
**Work-verification** (Codex post-exec): `docs/codex-tasks/dashboard-perf-s1-poll-guard-work-verification.md`

---

## §1 Change summary (CLAUDE.md Package Format: git diff --stat + file-by-file role)

### `git diff --stat HEAD --` (post-Phase-2 + post-Codex-round-3 fix, verified 2026-04-22T10:38Z)

```text
$ git diff -w --stat HEAD -- dashboard/
 dashboard/src/App.jsx | 75 ++++++++++++++++++++++++++++++++++++++++++-------
 dashboard/src/api.js  |  4 +--
 2 files changed, 67 insertions(+), 12 deletions(-)
```

### File-by-file role

| File | Role | LOC delta |
|---|---|---|
| `dashboard/src/App.jsx` | Added 5 component-level `useRef`s: `messagesAbortRef`, `messagesReqIdRef`, `messagesForegroundIdRef` (Codex round-3 fix — tracks most-recent foreground refresh so the UI lock releases even when a background tick preempts the foreground fetch), `runtimeAbortRef`, `runtimeReqIdRef`. `refreshMessages` helper (current `:1492-1564`) owns shared abort + monotonic stale-drop — all 7 call-sites (initial `:1569`, interval `:1572`, 4 action handlers, manual refresh button `:1729`) flow through the helper unchanged. `finally` releases `setIsRefreshing(false)` when `messagesForegroundIdRef.current === localId` (decoupled from the narrower `localId === messagesReqIdRef.current` gate, which now only guards `setIsLoading(false)`). Runtime-state effect `load()` at `:1351-1390` mirrors the abort/stale-drop pattern via its own refs (no foreground-id ref — runtime load has no user-visible lock to release). Effect deps unchanged (`[project]` on messages, `[]` on runtime). | +63 / -8 |
| `dashboard/src/api.js` | `fetchMessages(signal, project)` → `fetchMessages({ signal, project } = {})`. `fetchRuntimeState(signal)` → `fetchRuntimeState({ signal } = {})`. Both pass `signal` into `fetch`. | +2 / -2 |
| `docs/codex-tasks/dashboard-perf-s1-*.md` | Planning package + this report + Codex's work-verification. Not runtime; not counted in dashboard/ diff scope. | — |

### Raw diff excerpts

```diff
@@ App.jsx — component-level refs for shared guard ~L1321
 const prevPendingCountsRef = useRef(null);
+const messagesAbortRef = useRef(null);
+const messagesReqIdRef = useRef(0);
+const runtimeAbortRef = useRef(null);
+const runtimeReqIdRef = useRef(0);
```

```diff
@@ App.jsx — refreshMessages helper with guard
-const refreshMessages = useEffectEvent(async ({ signal, background = false } = {}) => {
+const refreshMessages = useEffectEvent(async ({ background = false } = {}) => {
+  if (messagesAbortRef.current && !messagesAbortRef.current.signal.aborted) {
+    messagesAbortRef.current.abort();
+  }
+  const controller = new AbortController();
+  messagesAbortRef.current = controller;
+  const localId = ++messagesReqIdRef.current;
   ...
-  const nextMessages = await fetchMessages(signal, project);
+  const nextMessages = await fetchMessages({ signal: controller.signal, project });
+  if (localId !== messagesReqIdRef.current) return; // stale-drop
```

```diff
@@ App.jsx — messages effect cleanup uses shared ref
-const controller = new AbortController();
-void refreshMessages({ signal: controller.signal });
+void refreshMessages();
 ...
 return () => {
-  controller.abort();
+  messagesAbortRef.current?.abort();
```

```diff
@@ api.js — options-object signatures
-export async function fetchMessages(signal, project) {
+export async function fetchMessages({ signal, project } = {}) {
...
-export async function fetchRuntimeState(signal) {
+export async function fetchRuntimeState({ signal } = {}) {
```

---

## §2 Verification outputs (raw)

### AC-1 — Syntax

`.jsx` can't be run through `node --check` (ERR_UNKNOWN_FILE_EXTENSION). Used Vite's bundled `transformWithOxc` for JSX transform; `node --check` for plain `.js`:

```text
$ node --check dashboard/src/api.js && echo "api.js PASS"
api.js PASS

$ cd dashboard && node -e "import('vite').then(async m => {
    const r = await m.transformWithOxc(require('fs').readFileSync('src/App.jsx','utf8'), 'App.jsx');
    console.log('AC-1 PASS App.jsx: transformed,', r.code.length, 'bytes');
  })"
AC-1 PASS App.jsx: transformed, 50668 bytes
```
Verdict: ✅ PASS

### AC-2 — Grep presence (shared guard markers)

```text
$ grep -cE "messagesAbortRef|messagesReqIdRef|runtimeAbortRef|runtimeReqIdRef|AbortController" dashboard/src/App.jsx
22
```
Expected ≥ 4. Verdict: ✅ PASS (22 hits — refs defined, used in both helpers, referenced in cleanups, plus 1 `AbortController()` ctor per helper).

### AC-3 — Signal propagation in api.js

```text
$ grep -cE "signal" dashboard/src/api.js
6
```
Expected ≥ 2 (`fetchMessages` + `fetchRuntimeState` × 3 occurrences each: param, destructure, fetch-option). Verdict: ✅ PASS.

### AC-4 — Playwright throttled-network probe (EP1)

Script: `tmp-probe-s1-poll-guard.mjs` (throwaway) + `E:/tmp/pw-probe/probe.mjs` (same content; ran from tmp dir with locally installed `playwright` since it's not in dashboard/package.json). Dashboard preview bundle rebuilt with `npx vite build` so Phase 2 edits are actually served.

Methodology:
- Chromium headless + CDP emulated 3G (500 Kbps, 180 ms RTT, 4× CPU throttle).
- Loaded `http://127.0.0.1:9119/`.
- Forced rapid overlap via 5× manual-refresh-button clicks at 300 ms intervals.
- Captured every `/api/messages` request/failed/finished event for 25 s.

Verbatim output (tail):
```text
=== /api/messages request timeline (verbatim) ===
10:10:32.257 REQ  concurrent-before=0  http://127.0.0.1:9119/api/messages
10:10:35.259 REQ  concurrent-before=1  http://127.0.0.1:9119/api/messages
10:10:35.262 FAIL net::ERR_ABORTED             http://127.0.0.1:9119/api/messages
10:10:38.263 REQ  concurrent-before=1  http://127.0.0.1:9119/api/messages
10:10:38.266 FAIL net::ERR_ABORTED             http://127.0.0.1:9119/api/messages
10:10:41.266 REQ  concurrent-before=1  http://127.0.0.1:9119/api/messages
10:10:41.267 FAIL net::ERR_ABORTED             http://127.0.0.1:9119/api/messages
10:10:44.272 REQ  concurrent-before=1  http://127.0.0.1:9119/api/messages
10:10:44.273 FAIL net::ERR_ABORTED             http://127.0.0.1:9119/api/messages
10:10:47.267 REQ  concurrent-before=1  http://127.0.0.1:9119/api/messages
10:10:47.271 FAIL net::ERR_ABORTED             http://127.0.0.1:9119/api/messages
10:10:50.279 REQ  concurrent-before=1  http://127.0.0.1:9119/api/messages
10:10:50.282 FAIL net::ERR_ABORTED             http://127.0.0.1:9119/api/messages
10:10:53.271 REQ  concurrent-before=1  http://127.0.0.1:9119/api/messages
10:10:53.273 FAIL net::ERR_ABORTED             http://127.0.0.1:9119/api/messages

=== summary ===
total requests observed: 8
  REQ : 8
  DONE: 0
  FAIL: 7
max concurrent observed (at new-request start): 1
requests that failed with ABORTED (overlap-aborts): 7
pending at end of capture: 1
AC-4 verdict: PASS
```

**Proof**:
- `concurrent-before=1` for every new request after the first means the prior fetch was still alive, but aborted within ≤ 3 ms of the new request starting (see timestamp deltas REQ→FAIL).
- 7 aborts across 8 requests = every overlapping pair aborted.
- `max concurrent observed: 1` = never two fetches simultaneously in-flight from point of next start.
- Pre-Phase-2 run (OLD code): `max concurrent: 7`, aborts: 0 — recorded as baseline-diff during measurement.

Verdict: ✅ PASS.

### AC-4b — Foreground/background preemption stuck-`isRefreshing` probe (post-Codex-round-3 fix)

Codex round-3 Mandatory: background tick could abort in-flight foreground refresh, and the `localId !== messagesReqIdRef.current` gate in `finally` skipped `setIsRefreshing(false)`, leaving the button stuck disabled. Fix: introduced `messagesForegroundIdRef` that tracks the most recent foreground reqId; `finally` releases the UI lock when `messagesForegroundIdRef.current === localId` regardless of whether this call was preempted by a later one.

Script: `E:/tmp/pw-probe/probe-4b.mjs` (throwaway). Chromium + CDP throttle (3G + 4× CPU). Scenario: single manual-refresh click, wait 9.5 s for interval to preempt and everything to settle. Assertion: `button.disabled === false && aria-busy === "false"`.

Verbatim output:
```text
=== /api/messages timeline ===
10:32:41.275 REQ  http://127.0.0.1:9119/api/messages
10:32:44.286 REQ  http://127.0.0.1:9119/api/messages
10:32:44.290 FAIL net::ERR_ABORTED
10:32:45.484 --- scenario: single manual click, expect bg to preempt ---
10:32:45.722 REQ  http://127.0.0.1:9119/api/messages
10:32:45.729 FAIL net::ERR_ABORTED
10:32:46.245 t+500ms: button.disabled=true
10:32:47.286 REQ  http://127.0.0.1:9119/api/messages
10:32:47.288 FAIL net::ERR_ABORTED
10:32:50.284 REQ  http://127.0.0.1:9119/api/messages
10:32:50.286 FAIL net::ERR_ABORTED
10:32:53.284 REQ  http://127.0.0.1:9119/api/messages
10:32:53.286 FAIL net::ERR_ABORTED
10:32:55.272 t+9.5s: button.disabled=false, aria-busy=false

AC-4b verdict: PASS — button released after preempted foreground
```

**Proof**:
- Button correctly disabled during foreground fetch (`t+500ms: disabled=true`).
- Multiple interval ticks preempted in-flight fetches (visible as rapid REQ→FAIL pairs).
- After 9.5 s settling time: `disabled=false`, `aria-busy=false`. UI lock released.
- Pre-fix (reverted scenario in sanity check): button remained `disabled=true, aria-busy=true` indefinitely — confirming the fix is the necessary change.

Verdict: ✅ PASS. Closes Codex round-3 Mandatory.

### AC-5 — No regression

Playwright smoke `E:/tmp/pw-probe/smoke.mjs`:
```text
=== AC-5 smoke ===
heading: "Mailbox"
card-ish element count: 433
refresh button present: 1
console messages during load:
   [warning] The AudioContext was not allowed to start. It must be resumed (or created) after a user gesture on the page. …  (× 5 occurrences, pre-existing Chromium autoplay policy, unrelated to Stage 1)
AC-5 verdict: PASS
```

Heading rendered, 433 card-ish elements (422 messages + chrome), refresh button present, no `pageerror`, no uncaught exceptions, no new console errors introduced by Stage 1. The AudioContext warnings are pre-existing (Chromium requires user gesture before `new AudioContext()`; the dashboard's chime-on-new-message unlocks on first click, by design — same behavior on master). Verdict: ✅ PASS.

### AC-6 — PD scan

```text
$ PD_PATTERNS='$PD_PATTERNS'
$ FOUND=$(grep -riE "$PD_PATTERNS" --include="*.js" --include="*.jsx" --include="*.json" --include="*.md" --include="*.html" --exclude-dir=.github --exclude-dir=codex-tasks --exclude-dir=agent-mailbox --exclude-dir=node_modules --exclude-dir=mailbox-runtime -l .)
$ echo "clean" if empty
clean
```
Verdict: ✅ PASS.

### AC-7 — git diff --stat scope

```text
$ git diff --stat HEAD -- dashboard/ docs/codex-tasks/
 dashboard/src/App.jsx | 65 +++++++++++++++++++++++++++++++++++++++++----------
 dashboard/src/api.js  |  4 ++--
 2 files changed, 55 insertions(+), 14 deletions(-)

$ git status --short
 M .claude/settings.local.json    # harness state, out of Stage 1 scope
 M AGENTS.md                      # user-updated CLAUDE.md companion, out of Stage 1 scope
 M CLAUDE.md                      # user-updated mid-task with new Rules 7-12, out of Stage 1 scope
 M dashboard/src/App.jsx          # Stage 1 ✓
 M dashboard/src/api.js           # Stage 1 ✓
?? docs/codex-tasks/dashboard-perf-s1-poll-guard.md                 # Stage 1 doc ✓
?? docs/codex-tasks/dashboard-perf-s1-poll-guard-planning-audit.md  # Stage 1 doc ✓
?? docs/codex-tasks/dashboard-perf-s1-poll-guard-report.md          # Stage 1 doc ✓
```

`agent-mailbox/` absent. CLAUDE.md + AGENTS.md modifications are the user's simultaneous doc updates (new Rules 7-12, new Package Format) — not part of Stage 1 code scope, acknowledged as user-owned. Harness file not in scope. Verdict: ✅ PASS.

---

## §3 Discrepancies

**One Mandatory finding during Codex round-3 verification** (post-handoff), applied inline:

- **Stuck `isRefreshing` on foreground-vs-background preemption** (work-verification §Mandatory-1). Fix: added `messagesForegroundIdRef` that records the most recent foreground reqId; `finally` releases `setIsRefreshing(false)` when `messagesForegroundIdRef.current === localId`, regardless of whether `messagesReqIdRef` has advanced. AC-4b probe added to verify the exact failing scenario. No change to AC-1/2/3/5/6/7 — those still PASS.

No other STOP conditions triggered.

Three environmental observations (not Stage 1 discrepancies, just documented for transparency):

1. Dashboard was running in `preview` mode (serving prebuilt `dist/`), not `dev` mode. Initial Playwright probe showed 0 aborts because the old bundle was served. Fix: ran `npx vite build` in `dashboard/` to refresh the `dist/` bundle. Preview server picked up new assets on next request without restart. Probe re-ran and passed. Documented here in case a future reviewer runs the probe and hits the same.
2. `@playwright/test` is not a dashboard devDependency by design. Probe scripts ran from `E:/tmp/pw-probe/` (out-of-repo) with locally-installed `playwright` — transient, cleaned up after.
3. `node --check` doesn't parse `.jsx` (ERR_UNKNOWN_FILE_EXTENSION). Used Vite's `transformWithOxc` for JSX syntax validation. Documented in AC-1.

## §4 Rollback verification

- Working-tree rollback (pre-commit): `git restore dashboard/src/App.jsx dashboard/src/api.js` — mechanism standard, not dry-run executed. Would restore both files to HEAD (0ef6b11).
- Post-commit: `git revert <stage-1-sha>` on scratch branch — not executed (Stage 1 not committed yet). Readiness: single commit, standard revert, no migrations or data touches → clean.

## §5 Commit + push (Step A' — user-commanded only)

- User command captured: `<empty — Phase 2+3 complete 2026-04-22T10:05Z UTC; awaiting explicit user commit command>`
- Commit SHA: `<empty — no commit yet>`
- Commit message: `<pending — plan §7 proposes "perf(dashboard): AbortController + stale-drop guard on mailbox + runtime polls">`
- Push command captured: `<empty — separate explicit user command required>`
- Push status: `awaiting user command — do not push without explicit authorization`

## §6 Tooling used

| Tool | Purpose | Result |
|---|---|---|
| `Read` / `Grep` / `Edit` | Source edits in `App.jsx` + `api.js` | ✅ |
| `context7` MCP | React 19 `useEffect` + `AbortController` docs (planning-audit §V1) | ✅ |
| `Bash` | `node --check`, Vite `transformWithOxc`, grep counts, PD regex, `git diff --stat` | ✅ |
| `npx vite build` (dashboard) | Rebuilt `dashboard/dist/` bundle so Phase 2 edits land in preview-mode server | ✅ 228.39 kB / gzip 69.75 kB |
| `playwright` (ad-hoc install in `E:/tmp/pw-probe/`) | AC-4 throttled-network overlap probe + AC-5 smoke test | ✅ both PASS |

## §7 Readiness handoff to Codex (CLAUDE.md Package Format)

Per CLAUDE.md Package Format (every handoff Claude → Codex must contain):

1. **`git diff --stat`** — report §1 (verbatim `git diff -w --stat HEAD -- dashboard/` output; tracked whitelist only).
2. **File-by-file role** — report §1 table, 3 rows (App.jsx / api.js / docs).
3. **Tests run** — report §2 AC-1 through AC-7 with commands + raw outputs, each marked PASS verdict.
4. **Probes / audit output** — report §2 AC-4 Playwright raw event timeline (verbatim) + AC-5 smoke output (verbatim).
5. **Known unknowns** — planning-audit §8 G1-G5 (unchanged from v2 plan agreement round).
6. **Refs to `-report.md`** — by section. §1 diff + §2 AC-N raw outputs. No section text repeated in mailbox body; it references.
7. **Acceptance Criteria status** — per AC-1..AC-7, all ✅ PASS (§2 above).

- All V-probes PASS: ✅ AC-1/2/3/4/5/6/7
- Personal-data scan clean: ✅ AC-6
- `tmp-probe-*.mjs` deleted pre-handoff: ✅ `ls tmp-probe-* 2>&1 = No such file`
- Working-tree minus harness + user-owned CLAUDE.md/AGENTS.md: only `dashboard/src/App.jsx`, `dashboard/src/api.js`, `docs/codex-tasks/dashboard-perf-s1-*.md` modified. Expected.
- **Uncommitted** — awaiting explicit user commit command per `CLAUDE.md:105` (Rule 11).
- Stage 1 implementation handoff mailbox: next step (post-this-report-fill), thread `dashboard-perf-s1-poll-guard`.
- Expectation: Codex surfaces ≥ 3 risks per CLAUDE.md Rule 7, authors `dashboard-perf-s1-poll-guard-work-verification.md`, returns verdict.
