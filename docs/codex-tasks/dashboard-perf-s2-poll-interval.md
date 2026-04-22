# dashboard-perf-s2 — Poll interval 3 s → 10 s (client-side only)

**Stage**: 2 of 4 (roadmap: `C:\Users\<user>\.claude\plans\4-compiled-hanrahan.md`)
**Version**: 1
**Thread**: `dashboard-perf-s2-poll-interval`
**Planning-audit**: `docs/codex-tasks/dashboard-perf-s2-poll-interval-planning-audit.md`
**Execution report**: `docs/codex-tasks/dashboard-perf-s2-poll-interval-report.md`
**Work-verification** (Codex, post-exec): `docs/codex-tasks/dashboard-perf-s2-poll-interval-work-verification.md`
**Depends on**: Stage 1 (`8a553b2` local; unpushed pending github.com:443 network).
**Executor**: Claude per sequential workflow. **Verifier**: Codex.

---

## 1. Why this stage exists

Stage 1 closed the concurrent-poll race (AbortController + stale-drop + foreground-lock). Stage 2 is the simplest load-reduction lever: lower the client-side poll frequency.

Baseline (Stage 1 post-fix): `/api/messages` hit every 3 s, ~5.9 MB each. Under 3G throttle probe the fetch took > 3 s → next tick immediately preempted it. Steady-state: ~20 req/min, 120 MB/min raw JSON over the wire.

Stage 2 target: 10 s → ~6 req/min, ~35 MB/min (−70 %). Frees main thread for scroll rendering (which is the user's top complaint) and reduces server-side `marked.parse(body)` × 425-message parsing rate.

## 2. Change scope

| # | File | Change |
|---|---|---|
| 1 | `dashboard/src/App.jsx:9` | `const pollIntervalMs = 3000;` → `const pollIntervalMs = 10000;` |

**That is the entire code change.** Both client-side `setInterval` call-sites (`dashboard/src/App.jsx:1386` runtime state, `:1577` messages) read the same module-scope constant directly — no other edits needed. The new value becomes observable after the rebuilt bundle is loaded; the messages effect then re-arms on `[project]` change (`:1569-1586`, deps `[project]`), and the runtime-state effect re-arms on component remount (`:1355-1392`, deps `[]`). Neither effect has `pollIntervalMs` in its dep array — it is a module constant, not reactive state. Full mechanism described in §4 «Project switch» edge case.

**Explicit non-changes** (documented so reviewers do not conflate):

- `dashboard/server.js:180` `pollIntervalMs: 3000` — **server-side supervisor config**. Controls how often the backend scans `agent-mailbox/` buckets for dashboard pending-index. Separate subsystem, separate concern (server CPU ≠ client render). Stage 2 does NOT touch.
- `dashboard/supervisor.mjs:16` — same supervisor default. Out of scope.
- Stage 1 AbortController / stale-drop / foreground-lock logic — untouched; Stage 2 inherits and remains valid at 10 s.
- `marked.parse()` server-side per `readMessage` call — still runs every request, still 425×; Stage 4 will drop this. Stage 2 only reduces request rate.

**Expected commit-tree diff** (stackable on `8a553b2`; view is EOL-insensitive to avoid autocrlf view-asymmetry between executor Windows env and reviewer Linux/WSL env — see audit §2a):
```
dashboard/src/App.jsx | 2 +-
1 file changed, 1 insertion(+), 1 deletion(-)
```

Canonical views: `git show --stat <s2-sha>` post-commit (identical across envs), or `git diff --ignore-cr-at-eol --stat HEAD -- dashboard/src/App.jsx` pre-commit.

1 LOC meaningful change. No dependency update, no new file, no data migration.

## 3. Why 10 seconds specifically

- 3 s → 10 s = 70 % request reduction at minimal UX cost. A new agent message authored at t+0 is visible at most 10 s later; for a human reviewing mailbox this is indistinguishable from real-time.
- Not 30 s: if agents are actively in a round-trip (which happens at ~1 letter/min in active review sessions), 30 s feels sluggish.
- Not 5 s: not enough load reduction to justify the break-in-half; marginal improvement vs 10 s is small, and 10 s is a cleaner round number for tuning.
- Tradeoff documented in `-planning-audit.md §7` as explicit assumption; reversible via same 1-LOC edit if user signals «too slow».

## 4. Acceptance criteria (per CLAUDE.md mandatory AC section)

### Concrete checks

- **AC-1** `grep -n "const pollIntervalMs = " dashboard/src/App.jsx` → exactly one line, value `10000`.
- **AC-2** `grep -cE "pollIntervalMs: ?3000|pollIntervalMs = 3000" dashboard/server.js dashboard/supervisor.mjs` → each file returns ≥ 1 (server-side `server.js` + `supervisor.mjs` untouched; aggregate ≥ 2). Note: the old form `grep -c "pollIntervalMs: 3000" dashboard/` errors on a directory and reports misleading `0`; do not use.
- **AC-3** Vite build succeeds (`npx vite build` in `dashboard/`) — same exit 0 as Stage 1.
- **AC-4** Playwright 30 s capture post-rebuild: `/api/messages` request count = **3 ± 1** (10 s interval). Pre-Stage-2 baseline (Stage 1 state) was ~10.
- **AC-5** No regression: dashboard loads, messages render, manual refresh button still works (same smoke pattern as Stage 1 AC-5).
- **AC-6** PD regex scan clean.
- **AC-7** Scope of evidence, split to avoid false-pass on untracked docs and false-fail on line-ending view asymmetry (see audit §2a):
  - Tracked code: `git diff --ignore-cr-at-eol --stat HEAD -- dashboard/src/App.jsx` → `1 file changed, 1 insertion(+), 1 deletion(-)`; and `git diff --ignore-cr-at-eol HEAD -- dashboard/src/App.jsx` → exactly one hunk `-const pollIntervalMs = 3000;` / `+const pollIntervalMs = 10000;`.
  - Untracked package docs: `git status --short --untracked-files=all -- docs/codex-tasks/dashboard-perf-s2-poll-interval*.md` → all three (`.md`, `-planning-audit.md`, `-report.md`) listed as `??` (or `A` after any later `git add`).
  - Raw `git diff --stat HEAD -- dashboard/src/App.jsx` is executor-local advisory only (value depends on `core.autocrlf`); it is **not** an acceptance gate.

### Edge cases closed

- **User waiting for fresh Codex letter** — visible within 10 s on the dashboard. Stage 1 background ticks still auto-abort stale fetches; no accumulated request queue.
- **Manual refresh button during a tick window** — unchanged behavior from Stage 1 (shared guard releases lock).
- **Project switch** — the new value becomes observable after the browser loads the rebuilt bundle. Once loaded, the messages poll effect (`App.jsx:1569-1586`, deps `[project]`) re-arms on `[project]` change, while the runtime-state effect (`:1355-1392`, deps `[]`) re-arms only on component remount. `pollIntervalMs` is a module-scope constant read directly by both `setInterval` call-sites (`:1386`, `:1577`); it does **not** appear in any effect's dep array. Intervals already running on the previous value continue to use it until their own cleanup fires on the next remount.

### Out of scope (Stage 2)

- **Archive collapse** — Stage 3.
- **Server-side marked + client-side markdown on expand** — Stage 4.
- **Supervisor pollTick 3 s → anything else** — separate subsystem, separate task if needed.
- **Virtualization / ETag / SSE** — only if Stages 2-4 insufficient.

## 5. Verification

### Phase 1 — Pre-package (done; evidence in planning-audit)
- PD scan clean (`audit §7`).
- Grep audit shows **6** `pollIntervalMs` hits in `dashboard/` (3 client in `App.jsx`: `:9` const + `:1386` + `:1577`; 3 server in `server.js:180` + `supervisor.mjs:16` + `:195`); only the `App.jsx:9` const changes (`audit §4`). Repo-wide verification via `rg -n "pollIntervalMs" . --glob '!docs/codex-tasks/**'` confirms no refs outside `dashboard/` (Codex 2026-04-22 + local Grep concur).
- Tool readiness inherits from Stage 1 — `npx playwright` cached 1.59.1; Vite build verified.

### Phase 2 — Edit
- Single `Edit` on `dashboard/src/App.jsx:9`.
- **Post-edit, pre-commit gate** (EOL-insensitive; see audit §2a for line-ending rationale):
  - `git diff --ignore-cr-at-eol --stat HEAD -- dashboard/src/App.jsx` → must be exactly `1 file changed, 1 insertion(+), 1 deletion(-)`.
  - `git diff --ignore-cr-at-eol HEAD -- dashboard/src/App.jsx` → must be exactly one hunk, `-const pollIntervalMs = 3000;` / `+const pollIntervalMs = 10000;`, no other line changes.
  - Anything else → STOP → `git restore dashboard/src/App.jsx` → investigate before redoing the edit.
  - Untracked docs tracked separately via `git status --short --untracked-files=all -- docs/codex-tasks/dashboard-perf-s2-poll-interval*.md` (AC-7).
- `npx vite build` in `dashboard/` (rebuilds `dist/index-*.js`; preview server picks up without restart).
- Run AC-1 / AC-2 / AC-3 / AC-6 / AC-7 (all static-grep + syntax).

### Phase 3 — Empirical probe
- `E:/tmp/pw-probe/probe-s2.mjs` (throwaway): launch Chromium, navigate to dashboard, record `/api/messages` timestamps for 30 s, print count + intervals. Delete post-capture.
- Run AC-4 (count) + AC-5 (smoke) from the captured page.

### Phase 4 — Handoff
- Package Format mailbox — split evidence per audit §2a EOL-insensitive contract:
  - Tracked code scope: `git diff --ignore-cr-at-eol --stat HEAD -- dashboard/src/App.jsx`.
  - Tracked code hunk: `git diff --ignore-cr-at-eol HEAD -- dashboard/src/App.jsx`.
  - Untracked package docs: `git status --short --untracked-files=all -- docs/codex-tasks/dashboard-perf-s2-poll-interval*.md`.
- File-by-file role table, raw probe outputs, AC status table, refs to report §1/§2, known unknowns (none new beyond Stage 1's G1-G5 which carry over), scope confirmation.

## 6. Rollback

Single-line revert: `git restore dashboard/src/App.jsx` (pre-commit) or `git revert <s2-sha>` (post-commit). Preserves Stage 1 (`8a553b2`) intact.

## 7. Discrepancy-first checkpoints (STOP conditions)

1. AC-4 shows request count outside `3 ± 1` band → something else in Stage 1's effect deps pins the old value; re-inspect.
2. AC-5 reveals console error introduced by the change → unlikely (pure constant change) but STOP + diagnose.
3. Third `pollIntervalMs` user-facing reference discovered mid-stage → add to scope, re-send to Codex. **Status: pre-verified resolved** (Codex + local repo-wide `rg` 2026-04-22: exactly 6 hits, all in `dashboard/`; kept as defense-in-depth).
4. Grep audit shows Stage 1's 4 refs + `foregroundIdRef` logic somehow depend on the 3 s timing → re-derive, STOP. (Audit §7 G1 pre-confirms this is not the case.)
5. PD scan returns hits → STOP, triage.
6. `git diff --ignore-cr-at-eol --stat HEAD -- dashboard/src/App.jsx` shows anything other than `+1 / −1` on that file, OR shows any additional tracked file changed under `dashboard/` → STOP, investigate (possible whole-file rewrite, missed call-site, or unintended edit).

## 8. Commit strategy

Single commit, message pattern:
```
perf(dashboard): poll interval 3s → 10s, ~70 % fewer /api/messages hits

Client-side only. Supervisor pollTick unchanged (separate subsystem).
Stage 1 guard logic (AbortController + stale-drop + foreground lock) still
correct at 10 s; AC-4 Playwright probe confirms 3 ± 1 req/30 s.

Closes s2 of dashboard-perf roadmap. Stages 3-4 follow.
```

Push: separate explicit user command. May be deferred if github.com:443 blocked (Stage 1 case) — commit lands locally on top of `8a553b2`; batch push when network allows.

## 9. Notes for Codex review (Rule 7 — expect ≥ 3 risks)

Candidate risks to inspect:
- Is 10 s the right value? Any user-visible latency issue? (§3 rationale addresses, but you may have stronger evidence.)
- ~~Any third `pollIntervalMs` reference I missed (my grep covered `dashboard/`; outside?).~~ **Resolved** (Codex + local `rg -n "pollIntervalMs" . --glob '!docs/codex-tasks/**'` 2026-04-22 → 6 code hits, all in `dashboard/`; see §4 Phase 1 + audit §4).
- Any test fixture, snapshot, or E2E script that hardcodes 3 s and would break.
- Stage 1's `messagesForegroundIdRef` logic — any corner where 10 s exposes a race the 3 s interval masked?
- Supervisor stays at 3 s — does any UI observable depend on client + server poll being synchronized (e.g., optimistic update handshake)?

If Critical/Mandatory — inline apply + re-send. If approved — execute Phase 2/3 → fill report → final handoff → STOP before commit.
