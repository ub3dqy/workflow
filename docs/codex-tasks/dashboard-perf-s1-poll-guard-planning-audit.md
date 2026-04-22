# dashboard-perf-s1 — Planning Audit

**Stage**: 1 of 4
**Task origin**: user 2026-04-22 «дашборд тормозит, глючит, ошибки в консоли»
**Scope of this stage**: poll overlap guard (correctness fix). No UI / payload / API change.

---

## §0 Meta-procedure

Per CLAUDE.md (updated 2026-04-22) Rule 8 "smallest-possible stages, commit-per-stage". Roadmap at `C:\Users\<user>\.claude\plans\4-compiled-hanrahan.md` splits the dashboard-perf task into 4 atomic stages. This is Stage 1, lowest-risk, correctness-only.

## §1 MCP + Skill inventory (this stage)

| Tool | Purpose | Priority | Readiness |
|---|---|---|---|
| `Read` / `Grep` / `Glob` | Source inspection | Primary | always |
| `context7` MCP | React 19 + marked docs | MANDATORY before plan send | ✅ §V below |
| `Bash` (`npx playwright`, `node --check`, `grep`) | Probes + syntax | Primary | ✅ §2 |
| `webapp-testing` skill | N/A — user directed to use direct Playwright via npx; `webapp-testing` skill not on Codex side per round-2 |
| `plan-audit` skill | Optional for Stage 1 (small scope, Codex adversarial review provides equivalent) | Optional | deferred |

## §2 Tool readiness verification (evidence)

```text
$ npx --no-install playwright --version
Version 1.59.1
```
Playwright CLI cached, Stage 1 probe viable without npm install.

```text
$ node --version
v24.13.0
```

```text
$ cat dashboard/package.json | jq .dependencies.react
"^19.2.5"
```

## §V1 — React 19 `useEffect` cleanup + AbortController idiom (context7, verbatim)

- **Source**: `/reactjs/react.dev` (`src/content/learn/synchronizing-with-effects.md` + `src/content/reference/react/useActionState.md`)
- **URL**: https://react.dev

**Ignore-flag pattern (doc-canonical for async-in-effect race prevention):**
```js
useEffect(() => {
  let ignore = false;
  async function startFetching() {
    const json = await fetchTodos(userId);
    if (!ignore) {
      setTodos(json);
    }
  }
  startFetching();
  return () => {
    ignore = true;
  };
}, [userId]);
```

**AbortController pattern (doc-canonical for fetch cancellation):**
```js
const abortRef = useRef(null);
if (abortRef.current) {
  abortRef.current.abort();
}
abortRef.current = new AbortController();
// pass abortRef.current.signal into the async call
```

**Applied to this stage**: both patterns combined. `AbortController` cancels in-flight fetch on new tick (saves network + server work); monotonic `reqIdRef` serves the same role as `ignore` flag but as a counter to support overlapping ticks without a closure per tick (we re-use the same outer effect closure with `setInterval`).

## §V2 — `useRef` for mutable values (context7, verbatim intent)

React docs recommend `useRef` (not `useState`) for values that shouldn't trigger re-render. `abortRef` + `reqIdRef` qualify: changing the abort controller or the current request id should NOT cause a re-render, only influence the next fetch.

## §3 Files to modify (whitelist)

| File | Lines (approx) | Authorized edit |
|---|---|---|
| `dashboard/src/App.jsx` | ~1340-1369 (runtime poll), ~1471-1514 (`refreshMessages` helper), ~1516-1531 (messages effect), 7 call-sites of `refreshMessages` (L1518, L1521, L1565, L1570, L1599, L1604, L1717) | Add component-level `abortRef` + `reqIdRef` used INSIDE the `refreshMessages` helper; all 7 call-sites unchanged in invocation (helper owns guard). Parallel `loadRuntimeState` helper with own refs covers the runtime effect's 1 call-site (L1345). Preserve `[project]` dep at L1531. Update `refreshMessages` internal call at L1478 to options-object `{ signal, project }`. |
| `dashboard/src/api.js` | `fetchMessages` (L17) + `fetchRuntimeState` (L78) | **Pinned: options-object**. `fetchMessages({ signal, project })` + `fetchRuntimeState({ signal })`. Both pass `signal` into `fetch`. Signal optional (absent → no abort). |

**Not touched**: `server.js`, `supervisor.mjs`, `mailbox-lib.mjs`, any test fixture, dashboard UI styling, any other file.

## §4 Grep audit (call-site inventory) — executed 2026-04-22

```text
$ grep -n "fetchMessages\|fetchRuntimeState\|refreshMessages" dashboard/src/App.jsx dashboard/src/api.js
dashboard/src/api.js:17:export async function fetchMessages(signal, project) {
dashboard/src/api.js:78:export async function fetchRuntimeState(signal) {
dashboard/src/App.jsx:4:  fetchMessages,
dashboard/src/App.jsx:5:  fetchRuntimeState,
dashboard/src/App.jsx:1345:        const data = await fetchRuntimeState(controller.signal);
dashboard/src/App.jsx:1471:  const refreshMessages = useEffectEvent(
dashboard/src/App.jsx:1478:        const nextMessages = await fetchMessages(signal, project);
dashboard/src/App.jsx:1518:    void refreshMessages({ signal: controller.signal });
dashboard/src/App.jsx:1521:      void refreshMessages({ background: true });
dashboard/src/App.jsx:1565:      await refreshMessages();
dashboard/src/App.jsx:1570:      await refreshMessages({ background: true });
dashboard/src/App.jsx:1599:      await refreshMessages();
dashboard/src/App.jsx:1604:      await refreshMessages({ background: true });
dashboard/src/App.jsx:1717:                      void refreshMessages();
```

**Findings**:
- 2 fetcher exports in `api.js`.
- `fetchRuntimeState` called once in-App.jsx (L1345) inside its effect.
- `fetchMessages` called once in-App.jsx via `refreshMessages` helper (L1478).
- `refreshMessages` helper has **7** call-sites: initial (L1518), interval (L1521), action handlers (L1565, L1570, L1599, L1604), manual refresh button (L1717).
- Only L1518 currently passes a signal; all 6 others are unguarded.
- No third fetcher, no additional poll site. Inventory complete.

**Resolution**: Stage 1 guard implementation must live inside the `refreshMessages` helper so ALL 7 call-sites inherit the guard with zero call-site changes.

## §5 Empirical probes

### EP1 — Playwright throttled poll probe (post-edit, Phase 3)

- Script: `tmp-probe-s1-poll-guard.mjs` at repo root (throwaway).
- Steps:
  1. `npx playwright chromium` launch headless.
  2. Throttle CPU ×4 + network (3G fast).
  3. Navigate to `http://127.0.0.1:9119/`.
  4. Record every `page.on('request')` + `page.on('requestfailed')` for 30 s focused on `/api/messages` URL.
  5. Assert: for each timer-driven request, if a prior `/api/messages` request is still pending, its final status is `aborted` (not `completed` stale).
  6. Output raw events + pass/fail summary to stdout.
- Script deleted post-capture.

### EP2 — State-id stale-drop probe (optional, console-level)

If Playwright assertion flaky under throttle, fall back to temporarily adding a console.log tag behind a `__DEBUG_POLL_GUARD` flag, open DevTools, manually refresh twice rapidly, see only the newer log reaching `setState`. Probe removed before handoff.

## §6 Assumptions + verification status

| Claim | Status | Evidence |
|---|---|---|
| Two independent polls (messages + runtime) | ✅ verified | `App.jsx:1364` + `:1471-1522` read directly; explore-agent survey. |
| No third poll site | ⚠️ grep audit at Phase 2 start; STOP-condition §10 #1 if found. |
| `fetch` supports `signal` | ✅ verified | Web Fetch API spec; Node polyfill in browser context. |
| React 19 `useRef` + AbortController pattern | ✅ verified | §V1 official docs citation. |
| Strict-mode double-invoke doesn't misbehave | ✅ verified | §V1 ignore-flag cleanup pattern handles it; cleanup-runs-before-next-effect semantics preserved in React 19. |
| No bundler / dev-mode impact | ✅ verified | Pure runtime React pattern, no Vite plugin dependency. |
| Dashboard server side accepts abort | ⚠️ assumed (downgraded per Codex round-1 Mandatory 3) | Node/Express convention: client-disconnect mid-response triggers `req.on('aborted')` / `res.on('close')`; Express 5 no-ops without exception. No empirical probe run in this package; if needed, Phase 3 can add a `curl --max-time 0.1` against a slow route. For Stage 1 the client-side abort is sufficient; server reaction is not on the critical path. |

## §7 Personal-data regex scan (CLAUDE.md Rule 10, every stage)

```text
$ PD_PATTERNS='$PD_PATTERNS'
$ grep -riE "$PD_PATTERNS" --include="*.{js,jsx,json,md,html}" --exclude-dir=.github --exclude-dir=codex-tasks --exclude-dir=agent-mailbox --exclude-dir=node_modules --exclude-dir=mailbox-runtime .
(empty)
$ echo "PD PASS: clean"
PD PASS: clean
```
Run 2026-04-22 pre-package-send.

## §8 Known gaps / honest flags

### G1 — `no-store` cache header vs AbortController

`dashboard/server.js:31` sets `Cache-Control: no-store` globally. Browser's cache layer isn't in the picture, so AbortController + stale-drop + no-cache compose cleanly. No action.

### G2 — Manual refresh button (CLOSED after grep audit)

Confirmed present at `dashboard/src/App.jsx:1712-1718`:
```jsx
<button
  aria-busy={isRefreshing}
  className="refreshButton"
  disabled={isRefreshing}
  onClick={() => {
    void refreshMessages();
  }}
  type="button"
>
  {t.refreshNow}
</button>
```
Goes through `refreshMessages()` helper — **same path** as interval ticks + action-triggered refreshes + initial fetch (all 7 call-sites in §4 grep). Stage 1 scope unifies the guard INSIDE the helper, so the button automatically benefits without call-site change. G2 closed in Stage 1 scope (per Codex round-1 Mandatory 1).

### G3 — Server receiving abort

Server side (`dashboard/server.js`) doesn't need to participate. Aborting a `fetch` closes the TCP connection; Express 5 handles client-disconnect gracefully (no-op logs at most). No change server-side.

### G4 — React 19 strict-mode double-invoke

In dev mode only. Every effect runs twice; cleanup runs between. The first run's controller is aborted by the first-run cleanup before the second run creates a new controller. No issue. React docs (§V1) cover this explicitly.

### G5 — Non-fetch async (future)

Stage 1 covers only the two polls. If future stages add other async effects (e.g., markdown parsing Stage 4), they need their own guards. Documented; not Stage 1 scope.

## §9 Delta from roadmap

Roadmap defines the 4-stage split. Stage 1 ≡ Change 0 in the original 4-in-1 plan. No scope drift.

## §10 Discrepancy-first checkpoints (also in brief §6)

See brief §6 STOP conditions (mirror).

## §11 Signature

Created: 2026-04-22
Author: Claude (workflow project)
Stage: 1 of 4
Status: ready for Codex review
