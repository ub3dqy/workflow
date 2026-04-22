# dashboard-perf-s2 — Planning Audit

**Stage**: 2 of 4
**Task origin**: user 2026-04-22 «дашборд тормозит». Stage 2 = load-reduction via poll frequency, 1-LOC change.
**Depends on**: Stage 1 (`8a553b2` local, unpushed).

---

## §0 Meta-procedure

Per CLAUDE.md Rule 8 (smallest atomic stages, commit-per-stage). Stage 2 is the smallest viable stage in the roadmap — a single constant update. Full Codex review cycle per Rule 8 regardless of scope.

User decision (2026-04-22 after Stage 1 Codex full agreement): **Stage 2 starts locally on top of unpushed Stage 1**; network push (github.com:443 blocked) batches later. Rule 8 satisfied by local-history atomicity.

## §1 MCP + Skill inventory

| Tool | Purpose | Priority | Readiness |
|---|---|---|---|
| `Read` / `Grep` | `pollIntervalMs` call-site audit | Primary | always |
| `Bash` (`node --check`, `npx vite build`, grep, PD regex) | Syntax + build + scan | Primary | ✅ (Stage 1 cache) |
| `webapp-testing` skill via `npx playwright` | AC-4 30s interval capture | MANDATORY | ✅ inherits Stage 1 cache (`Version 1.59.1`, confirmed 2026-04-22) |
| `context7` | N/A for Stage 2 — no new docs required (pure constant change, no new API) | — | — |

## §2 Tool readiness

Inherits from Stage 1 (same environment, no restart between stages):

```text
$ npx --no-install playwright --version
Version 1.59.1   (cached)

$ node --version
v24.13.0
```

Vite build available in `dashboard/node_modules/.bin/vite` (Stage 1 rebuild verified).

## §2a Line-ending state

**Why this section exists**: Codex's first Stage 2 review (2026-04-22T11:11:18Z) flagged a `git diff --stat HEAD -- dashboard/src/App.jsx` full-file rewrite in the reviewer env that did not reproduce on the executor env. This is view-level asymmetry, not semantic drift, but the package must make the verification contract EOL-insensitive so both parties see the same invariant.

**Executor env (Windows, this machine)**:

```text
$ git config --show-origin --get core.autocrlf
file:C:/ProgramData/Git/config    true

$ git ls-files --eol dashboard/src/App.jsx
i/lf    w/crlf  attr/                 	dashboard/src/App.jsx

$ git status --short -- dashboard/src/App.jsx
(empty)

$ git diff --stat HEAD -- dashboard/src/App.jsx
(empty)

$ git diff --ignore-cr-at-eol --stat HEAD -- dashboard/src/App.jsx
(empty)
```

`core.autocrlf=true` normalizes CRLF→LF pre-diff, so the raw `git diff --stat` is clean. `i/lf w/crlf` is the normal autocrlf resting state.

**Reviewer env (Codex, Linux/WSL)** per Codex 2026-04-22T11:49:26Z:

```text
$ git config --show-origin --get-all core.autocrlf
(empty)

$ git ls-files --eol dashboard/src/App.jsx
i/lf   w/crlf

$ git diff --stat HEAD -- dashboard/src/App.jsx
1884 insertions(+), 1884 deletions(-)

$ git diff --ignore-cr-at-eol --stat HEAD -- dashboard/src/App.jsx
(empty)
```

No autocrlf on reviewer side → working-tree CRLF vs index LF renders as full-file rewrite in raw diff.

**Commit-path invariant**:

`Edit` → staging on executor with `core.autocrlf=true` normalizes CRLF→LF → commit tree stores exactly 1 LOC change. Post-commit `git show --stat <sha>` is `+1/-1` identically across any env. The commit content is not subject to view asymmetry.

**Verification contract (EOL-insensitive, applies on any env)**:

- Pre-package baseline: `git diff --ignore-cr-at-eol --stat HEAD -- dashboard/src/App.jsx` → empty.
- Post-Edit pre-commit: `git diff --ignore-cr-at-eol --stat HEAD -- dashboard/src/App.jsx` → `1 file changed, 1 insertion(+), 1 deletion(-)`.
- Post-Edit pre-commit: `git diff --ignore-cr-at-eol HEAD -- dashboard/src/App.jsx` → one hunk, `-const pollIntervalMs = 3000;` / `+const pollIntervalMs = 10000;`.
- Raw `git diff --stat` / `git diff` may be inspected as executor-local advisory, but are **not** acceptance gates.
- Unconditional renormalization commit is **not** proposed — Codex 2026-04-22 confirms this reads as view-level asymmetry, not semantic drift, so a renormalize would be noise rather than a fix.

## §3 Files

| File | Role |
|---|---|
| `dashboard/src/App.jsx:9` | **Only file modified.** Single-constant update. |
| `dashboard/server.js:180` | Out of scope (supervisor config, separate subsystem). |
| `dashboard/supervisor.mjs:16` | Out of scope. |

## §4 Grep audit (executed 2026-04-22)

```text
$ grep -rn "pollIntervalMs" dashboard/
dashboard/server.js:180:  pollIntervalMs: 3000,
dashboard/supervisor.mjs:16:  pollIntervalMs = 3000,
dashboard/supervisor.mjs:195:    }, pollIntervalMs);
dashboard/src/App.jsx:9:const pollIntervalMs = 3000;
dashboard/src/App.jsx:1386:    const intervalId = window.setInterval(load, pollIntervalMs);
dashboard/src/App.jsx:1577:    }, pollIntervalMs);
```

**Findings**:
- 3 hits in `App.jsx` — one const declaration + two `setInterval` consumers. Change the declaration; consumers auto-propagate.
- 3 hits in `server.js` + `supervisor.mjs` — server-side supervisor. Independent. Out of Stage 2 scope.
- **6 total hits in `dashboard/`** (3 client + 3 server).
- **Tests/specs absence + raw `3000` literal scope** (narrow-claim evidence, replacing an earlier overclaim that cited the identifier grep):
  - `rg --files dashboard | rg '(test|spec)'` → empty. No test/spec source files under `dashboard/` (node_modules vendor files excluded by `.gitignore`).
  - `rg -n "\b3000\b" dashboard` → 4 hits: `App.jsx:9` (client const, in-scope), `server.js:180` + `supervisor.mjs:16` (server supervisor arg + default — out of scope, see §3), and `server.js:320` (unrelated: SIGINT/SIGTERM shutdown force-exit timeout `setTimeout(..., 3000)`, not a poll interval). No `3000` literal leaks into tests, fixtures, snapshots, or configs under `dashboard/`. The earlier claim citing the `pollIntervalMs` identifier grep only proved call-sites of the identifier, not absence of raw literals; this evidence is the correct proof.

**Repo-wide verification** (executed 2026-04-22 by Codex and independently locally):

```text
$ rg -n "pollIntervalMs" . --glob '!docs/codex-tasks/**'
dashboard/server.js:180:  pollIntervalMs: 3000,
dashboard/supervisor.mjs:16:  pollIntervalMs = 3000,
dashboard/supervisor.mjs:195:    }, pollIntervalMs);
dashboard/src/App.jsx:9:const pollIntervalMs = 3000;
dashboard/src/App.jsx:1386:    const intervalId = window.setInterval(load, pollIntervalMs);
dashboard/src/App.jsx:1577:    }, pollIntervalMs);
```

Exactly 6 code hits, all under `dashboard/`. No references in root `*.md`, tests, configs, scripts, or other code paths. «Third reference outside `dashboard/`» risk (brief §7 item 3, §9) → **resolved**.

## §5 No new doc verification required

Stage 2 does not introduce new APIs, libraries, or patterns. Stage 1's AbortController + refs + `useEffectEvent` remain authoritative; the constant change does not interact with any React 19 idiom.

## §6 Empirical probe plan

### EP1 — AC-4 30 s interval capture

Script: `E:/tmp/pw-probe/probe-s2.mjs` (throwaway). Chromium headless, no throttle (we want real-steady-state intervals, not overlap stress). Load dashboard, `page.on("request")` for `/api/messages` URLs, 30 s window, print count + delta timestamps.

Expected: count = 3 ± 1 (first tick on mount + 3 × 10 s interval = 4 ticks max; depends on how many ticks fire within 30 s wall-clock given initial load ordering). Pre-Stage-2 baseline: ~10 requests (3 s interval = ~10 ticks / 30 s).

Script deleted post-capture.

## §7 Assumptions + verification status

| Claim | Status | Evidence |
|---|---|---|
| `pollIntervalMs` declared once in App.jsx | ✅ verified | `§4` grep shows one `const` at `:9` |
| Both App.jsx call-sites use the const (not hardcoded 3000) | ✅ verified | `§4` grep `:1386` + `:1577` |
| Server-side `pollIntervalMs: 3000` is independent | ✅ verified | `server.js:180` is `createSupervisor({ pollIntervalMs: 3000 })` — supervisor factory arg, no shared module boundary with App.jsx const |
| Stage 1 AbortController / stale-drop / foreground lock remain correct at 10 s | ✅ reasoned | Stage 1 guard is timing-agnostic — aborts on *next tick* regardless of duration between ticks |
| No test/spec source files exist under `dashboard/` | ✅ verified | §4 — `rg --files dashboard \| rg '(test\|spec)'` → empty (node_modules excluded by `.gitignore`) |
| Raw `3000` literal scope under `dashboard/` known exhaustively | ✅ verified | §4 — `rg -n "\b3000\b" dashboard` → 4 hits: `App.jsx:9` (in-scope const), `server.js:180`, `supervisor.mjs:16` (server supervisor, out of scope), `server.js:320` (unrelated SIGINT force-exit timeout). No fixtures/snapshots. |
| 10 s is the right value | ⚠️ assumed / reversible | Rationale in brief §3. Reversible via same 1-LOC edit if user signals too slow. |
| No user-visible regression on manual refresh | ✅ reasoned | Manual refresh bypasses `pollIntervalMs` entirely (it's immediate, not interval-driven) |
| No race exposed by longer tick gap | ⚠️ assumed | Stage 1's guard handles out-of-order responses regardless of interval length. Playwright AC-4 implicitly tests (any race would show as stuck UI or duplicate state). |
| Commit-tree diff is `+1/-1` regardless of reviewer env | ✅ reasoned | §2a — executor `core.autocrlf=true` normalizes CRLF→LF on staging; commit content is independent of working-tree CRLF view. EOL-insensitive gate (`--ignore-cr-at-eol`) is the acceptance view on both ends. |
| No repo-wide `pollIntervalMs` reference outside `dashboard/` | ✅ verified | §4 repo-wide `rg` (Codex + local) — 6 hits, all in `dashboard/`. |

## §8 Known gaps (honest flags)

- **G1 (from Stage 1, carry-over)**: server-side abort handling still assumed-not-probed. Not actionable in Stage 2.
- **G2 (Stage 2-specific)**: latency between new agent message and its UI display rises from ≤ 3 s to ≤ 10 s. Documented UX tradeoff, not a bug.
- **G3**: if user runs dev mode (`npm run dev` instead of `preview`), Vite HMR picks up the change without rebuild. In preview mode, `npx vite build` is required (same as Stage 1).

## §9 Delta from roadmap

Roadmap (`4-compiled-hanrahan.md` §Stage order) lists Stage 2 as «Fix 3 — `pollIntervalMs` 3000→10000 (`App.jsx:9`) + audit all references». Stage 2 package confirms the audit: 6 refs total in `dashboard/` (3 client + 3 server), only 1 in-scope (`App.jsx:9`). Repo-wide verification confirms no refs outside `dashboard/`. No scope drift.

## §10 Discrepancy checkpoints

Mirror of brief §7.

## §11 Signature

Created: 2026-04-22
Author: Claude (workflow project)
Stage: 2 of 4
Status: ready for Codex review
