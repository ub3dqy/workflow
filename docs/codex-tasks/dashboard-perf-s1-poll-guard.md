# dashboard-perf-s1 — Poll overlap guard (AbortController + stale-drop)

**Stage**: 1 of 4 (roadmap: `C:\Users\<user>\.claude\plans\4-compiled-hanrahan.md`)
**Version**: 2 (post-Codex-round-1 — addresses 3 Mandatory + 2 Additional from `2026-04-22T09:42:57Z-codex-001`)
**Thread**: `dashboard-perf-s1-poll-guard`
**Planning-audit**: `docs/codex-tasks/dashboard-perf-s1-poll-guard-planning-audit.md`
**Execution report**: `docs/codex-tasks/dashboard-perf-s1-poll-guard-report.md`
**Work-verification** (Codex, post-exec): `docs/codex-tasks/dashboard-perf-s1-poll-guard-work-verification.md`

---

## 1. Why this stage exists

Codex round-1 Mandatory on prior 4-in-1 package: `refreshMessages()` at `dashboard/src/App.jsx:1471-1522` and the parallel runtime poll at `:1364` start fresh fetches on every 3 s timer tick without any in-flight guard. With 5.9 MB `/api/messages` payload, fetches can overlap under load → concurrent requests, stale-response race (late fetch overwrites newer state).

This stage closes that race as the **smallest atomic fix**: add `AbortController` cancellation on tick-replace + monotonic `reqIdRef` stale-drop, **unified across ALL refresh call sites** (not only the timer tick but also the manual refresh button and action-triggered refreshes — see full call-site inventory in §2). No UI change, no payload reduction, no server-API change. Internal fetcher signatures in `api.js` switch to options-object (`{ signal, project }`) — this is an internal module boundary evolution, not a public API change.

Other fixes (poll interval, archive collapse, client-side markdown) are deferred to Stages 2-4.

## 2. Change scope

| # | File | Change |
|---|---|---|
| 1 | `dashboard/src/App.jsx` | Move `abortRef` + `reqIdRef` (component-level `useRef`) into the `refreshMessages` helper at `:1471-1514`. All existing callers are re-routed through the shared helper: initial fetch (`:1518`), interval ticks (`:1521`), action-triggered refreshes (`:1565`, `:1570`, `:1599`, `:1604`), and **manual refresh button (`:1712-1718`)** — 7 call sites total, all now share the same abort/stale-drop guard. Parallel guard for runtime state effect at `:1340-1369` via shared `loadRuntimeState` helper (its own `runtimeAbortRef` + `runtimeReqIdRef`). Messages effect `[project]` dependency at `:1531` **preserved** — project change re-mounts effect, cleanup aborts prior fetch. |
| 2 | `dashboard/src/api.js` | **Pinned choice: options-object only.** `fetchMessages(signal, project)` → `fetchMessages({ signal, project } = {})`; `fetchRuntimeState(signal)` → `fetchRuntimeState({ signal } = {})`. Both pass `signal` into `fetch(url, { cache: "no-store", signal })`. Update the two in-App.jsx direct callers (`L1345` `fetchRuntimeState`, `L1478` `fetchMessages`). Signal is optional — absent → no abort capability for that call, backward-safe. |

**Expected git diff scope** (`git diff --stat HEAD -- dashboard/`):
```
dashboard/src/App.jsx  | ~35 +/-   (both helpers: refreshMessages + loadRuntimeState with shared refs)
dashboard/src/api.js   | ~10 +/-   (options-object signature for both fetchers)
```
No edits elsewhere. No new dependencies. No mailbox/data touch. No route or admin-endpoint change.

## 3. Acceptance criteria (per CLAUDE.md mandatory AC section)

### Concrete checks

- **AC-1** Syntax: `node --check dashboard/src/App.jsx && node --check dashboard/src/api.js` — clean exit.
- **AC-2** Grep presence: `grep -n "AbortController\|abortRef\|reqIdRef" dashboard/src/App.jsx` shows ≥ 4 hits (both polls, guards, cleanups).
- **AC-3** Signal propagation: `grep -n "signal" dashboard/src/api.js` shows ≥ 2 hits in `fetchMessages` + `fetchRuntimeState`.
- **AC-4** Playwright throttled-network probe (see Stage planning §6 EP1): open `http://127.0.0.1:9119/`, enable DevTools throttle to 3G, observe poll cycle under load via page.on('request'/'response'). Expect: **on every tick, any still-pending previous request is aborted**; only the latest fetch's response updates state (confirmed by monotonic timestamp on state snapshot).
- **AC-5** No regression: dashboard still loads + displays messages; scrolling still works as before (i.e. no worse than Stage 0 baseline — fixing scroll is Stage 3 scope, not here).
- **AC-6** Personal-data regex scan — clean.
- **AC-7** `git diff --stat HEAD -- .` shows only the two whitelisted files + `docs/codex-tasks/dashboard-perf-s1-*.md` changes.

### Expected diff scope

~30 LOC total across 2 files. See §2 table.

### Edge cases closed

- **Manual refresh button (`:1716-1717`) + background tick overlap** — both invoke the same `refreshMessages` helper, which owns the shared `abortRef`/`reqIdRef`. Any new call (from any site) aborts the prior in-flight and supersedes its request-id. Explicitly covered.
- **Action-triggered refreshes** after archive / note / resolution actions (`:1565`, `:1570`, `:1599`, `:1604`) — same shared helper; same guard.
- **Project selector change** → messages effect at `:1516-1531` re-subscribes (dep on `[project]`); cleanup aborts prior in-flight fetch before new effect starts.
- **Component unmount mid-fetch** (cleanup aborts controller).
- **Slow fetch that outlives next tick** — new tick aborts old; even if abort is slow, monotonic `reqIdRef` drops stale response at `.then`.
- **React 19 strict-mode double-invoke** in dev — cleanup-before-next-effect preserves abort order; first run's controller aborted by its own cleanup before second run starts.

### Out of scope (Stage 1)

- **Poll interval tuning** → Stage 2.
- **Archive collapse** → Stage 3.
- **Client-side markdown + payload reduction** → Stage 4.
- **Virtualization / ETag / SSE** → not pre-committed; only if Stages 1-4 leave perf target unmet.
- **`MessageCard` duplicate action row** at `App.jsx:1237`+`:1246` (Codex round-1 Additional 1) — cosmetic, separate micro-task.
- **`/api/messages` multi-bucket read** at `server.js:47-63` (Codex round-1 Additional 2) — separate task if needed.

## 4. Verification (Claude self-check + Codex)

### Phase 1 — Pre-package (already done; evidence in planning-audit)
- `npx --no-install playwright --version` → 1.59.1 (planning-audit §2).
- React 19 docs: AbortController + ignore-flag idioms verbatim (planning-audit §V1).
- PD scan clean (planning-audit §7).

### Phase 2 — Edit + syntax
- Apply changes. Run AC-1 through AC-7.

### Phase 3 — Playwright empirical probe
- Script at `E:/Project/workflow/tmp-probe-s1-poll-guard.mjs` (throwaway).
- Opens dashboard under 3G throttle, records `fetch()` event stream for 30 s, asserts: for each tick, prior in-flight request is aborted within 100 ms of next tick starting.
- Raw stdout pasted into `-report.md §2`.
- Script deleted pre-handoff.

### Phase 4 — Handoff to Codex
Per CLAUDE.md Package Format: git diff --stat + file-by-file role + AC status (pass/fail/N/A per AC-N) + raw probe outputs + known unknowns + refs to `-report.md` lines.

## 5. Rollback

- Working-tree before commit: `git restore dashboard/src/App.jsx dashboard/src/api.js`.
- Post-commit: `git revert <stage-1-sha>`. Single commit, single revert, no data.

## 6. Discrepancy-first checkpoints (STOP conditions)

1. Grep audit finds a third poll site not covered by the two polls at `:1364` + `:1471-1522` → scope expand, re-plan.
2. `react` API changed mid-React-19 patch level such that `useRef` + `AbortController` behave differently than docs cited → STOP, re-cite docs.
3. Playwright probe reveals `fetch` doesn't actually abort (server ignores client disconnect) → STOP; if that's the case, `fetchMessages` wrapper must also early-return-on-abort at resolve time (which the monotonic `reqIdRef` already does — acceptable, document as documentation gap not plan gap).
4. PD regex scan → any hit → STOP + triage.

## 7. Commit strategy

Single commit at end of Stage 1, message pattern:
```
perf(dashboard): AbortController + stale-drop guard on mailbox + runtime polls

- App.jsx: abortRef + reqIdRef in fetchMessages + fetchRuntimeState effects
- api.js: accept optional signal in both fetchers
- No functional / UI / API change; correctness fix for concurrent-poll race

Closes s1 of dashboard-perf roadmap. Stages 2-4 follow.
```

Push: separate explicit user command.

## 8. Notes for Codex review

Per CLAUDE.md Rule 7, expect ≥ 3 risks/findings. Candidate surface areas to inspect:
- Does my React 19 docs citation match the specific version pinned (`19.2.5`)?
- Is there a third poll site I missed (e.g., inside `MessageCard` or a modal)?
- Does `fetchMessages` have non-poll callers (e.g., manual refresh button) that bypass the guard?
- Does `no-store` cache header interact with AbortController (browser cache edge case)?
- `useRef` with AbortController inside effect — does strict-mode double-invoke cause first tick to stomp on second tick's controller?
