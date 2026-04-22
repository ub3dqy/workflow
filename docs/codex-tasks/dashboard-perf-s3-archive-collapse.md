# dashboard-perf-s3 — Archive column collapsed by default (summary strip + toggle)

**Stage**: 3 of 4 (roadmap: `C:\Users\<user>\.claude\plans\4-compiled-hanrahan.md`)
**Version**: 1
**Thread**: `dashboard-perf-s3-archive-collapse`
**Planning-audit**: `docs/codex-tasks/dashboard-perf-s3-archive-collapse-planning-audit.md`
**Execution report**: `docs/codex-tasks/dashboard-perf-s3-archive-collapse-report.md`
**Work-verification** (Codex, post-exec): `docs/codex-tasks/dashboard-perf-s3-archive-collapse-work-verification.md`
**Depends on**: Stage 2 (`8c2a704` local, unpushed on top of `8a553b2`).
**Executor**: Claude per sequential workflow. **Verifier**: Codex.

---

## 1. Why this stage exists

Stages 1-2 reduced the concurrent-poll race and dropped `/api/messages` hit rate 3 s → 10 s. The **rendered DOM size** is still the top user-visible cost: the Archive column renders every archived card inline (current production dataset: 267 cards), each a `MessageCard` with a metadata block, action row, and body rendered via `dangerouslySetInnerHTML`. On the user's machine this blocks scroll even after Stages 1-2.

Stage 3 target: **default the Archive column to a collapsed summary strip** («Archive (N) [show]»). Full list renders only after an explicit user click; a visible toggle collapses it back. `toClaude` + `toCodex` columns remain fully expanded (they are user-facing workqueues, small in size).

Expected impact: initial render drops from ~270 cards to ~15-30 (two live columns only); scroll becomes smooth immediately after load; manual «show» stays one click away.

## 2. Change scope

| # | File | Change |
|---|---|---|
| 1 | `dashboard/src/App.jsx:1294-1318` | Add `const [archiveExpanded, setArchiveExpanded] = useState(false);` into the existing `useState` cluster. |
| 2 | `dashboard/src/App.jsx:18-83` (ru) + `:84-150` (en) | Add 2 i18n keys per language: `archiveShow` («Показать архив» / «Show archive») and `archiveHide` («Скрыть архив» / «Hide archive»). |
| 3 | `dashboard/src/App.jsx:1850-1876` | In `columnBody`, branch rendering for `column.key === "archive"`: if `!archiveExpanded` AND `messages.archive.length > 0` → render a single `<button className="archiveToggle">{t.archiveShow} ({messages.archive.length})</button>` that flips the state. If `archiveExpanded` → keep the existing `.map()` but prepend a `<button className="archiveToggle">{t.archiveHide}</button>` that flips back. If `messages.archive.length === 0` → fall through to the existing `.columnHint` placeholder (no toggle). `toClaude` / `toCodex` paths unchanged. |
| 4 | `dashboard/src/App.jsx` styles block (after `.columnHint` at `:682-686`) | Add one `.archiveToggle` CSS rule reusing existing design tokens (`--surface-control`, `--text-strong`, `--button-outline-border`) — matches `.langButton` / `.soundButton` visual weight. |
| 5 | `dashboard/src/App.jsx` (after the existing `[project]` localStorage-write effect at `:1348-1353`) | Add a small independent effect `useEffect(() => { setArchiveExpanded(false); }, [project]);` — guarantees every project switch starts with archive collapsed (see §3 rationale, «Why reset on project change»). |

**That is the entire code change.** No new dependency, no new component file, no API/schema touch. Scope ≤ ~35 LOC net addition (one useState, two i18n pairs, one conditional render block, one CSS rule, one 3-line project-reset effect).

**Explicit non-changes** (documented to prevent scope creep):

- `messages.archive` state + fetch semantics — untouched. Stage 4 will deal with card body rendering cost; Stage 3 only defers the render itself.
- `archiveInboxMessage` action + `showActions={column.key !== "archive"}` — unchanged. Archive cards remain read-only when expanded.
- `MessageCard` component — unchanged. Same rendering, just conditionally mounted.
- Poll interval (Stage 2) + guard (Stage 1) — untouched. Counts still refresh every 10 s; the toggle state is client-only React state and is independent of polling.
- `toClaude` / `toCodex` collapse — **intentionally out of scope**. These are live workqueues; collapsing them would hide incoming work.
- Persisting `archiveExpanded` across reloads (localStorage) — out of scope. Default-collapse-on-each-load is the intended UX (user explicitly opts in to the heavy render each session).

**Expected commit-tree diff** (EOL-insensitive, per s2 audit §2a precedent):

```
dashboard/src/App.jsx | ~40 +++++++++-
1 file changed, ~35 insertions(+), ~3 deletions(-)
```

Canonical views: `git show --stat <s3-sha>` post-commit, or `git diff --ignore-cr-at-eol --stat HEAD -- dashboard/src/App.jsx` pre-commit. Raw `git diff --stat` remains executor-local advisory.

## 3. Why this design (vs alternatives)

- **Why default collapsed, not expanded-with-option-to-collapse**: the user complaint is scroll lag on load. Defaulting to collapsed means every session starts smooth without the user having to take any action. Expanded-by-default would require the user to remember to collapse every session.
- **Why a symmetric show/hide toggle, not one-way expand**: users sometimes want to re-hide the archive after scanning it (e.g., after finding the letter they were looking for). Symmetric toggle is ~4 extra LOC and removes the «stuck-in-expanded» trap.
- **Why not persist state in localStorage**: persistence would mean users who expanded once always pay the full render cost forever — defeats the stage's purpose. Default-collapse-per-session matches the rationale.
- **Why reset on project change (not «persist across projects»)**: `messages` state is not cleared on `[project]` change — the existing effect at `App.jsx:1569-1586` kicks off a new `fetchMessages` but leaves the previous project's cards mounted until the new response arrives (`setMessages` only fires after `fetchMessages` resolves — see `App.jsx:1515`, `:1534`). If `archiveExpanded` persisted across project switches, the incoming project's archive would auto-mount expanded as soon as its data arrived, re-incurring the heavy-mount cost the stage exists to avoid. Resetting `archiveExpanded` to `false` on `[project]` change preserves the «smooth by default» contract on every project switch too, not just first load. This is the design decision codex-001 requested we make explicit.
- **Why not memoize archive `.map()` with `useMemo`**: the cost is DOM mount, not array iteration. Memoizing the JSX tree still forces React to mount 267 components on first expand. Collapse is the only meaningful reduction.
- **Why not virtualize the archive list**: virtualization is explicitly Stage 5 territory (brief §4 out-of-scope) and would require new dependencies (e.g., `@tanstack/react-virtual`). Collapse is a smaller, reversible first step.

## 4. Acceptance criteria (per CLAUDE.md mandatory AC section)

### Concrete checks

- **AC-1a** Declaration exists exactly once: `grep -n "const \[archiveExpanded, setArchiveExpanded\] = useState(false)" dashboard/src/App.jsx` → exactly 1 hit in the useState cluster (:~1306-1319).
- **AC-1b** Setter wired for show, hide, and project-reset: `grep -c "setArchiveExpanded" dashboard/src/App.jsx` → ≥ 4 hits (destructuring declaration + show onClick + hide onClick + project-reset effect). Report records the exact integer.
- **AC-2** `grep -nE "archiveShow|archiveHide" dashboard/src/App.jsx` → ≥ 6 hits: 2 × 2 i18n keys (ru + en) + ≥ 2 JSX references (`t.archiveShow`, `t.archiveHide`).
- **AC-3** `cd dashboard && npx vite build` → exit 0; bundle parses; no new runtime warnings in the build log.
- **AC-4** Playwright post-load probe (headless Chromium, no throttle). Probe first observes `messages.archive.length` via the archive column's `.countPill` and **branches on it** (both branches are explicit acceptance paths, not one with a degraded fallback):
  - **Branch A — non-empty archive** (`.countPill` > 0): on load, archive column body contains exactly **1** clickable element (the `.archiveToggle` button) and **0** `.card` descendants. Click the toggle → within 500 ms `.card` count is ≥ 1 and equals the `.countPill` integer. Click the toggle again → back to 1 toggle + 0 cards.
  - **Branch B — empty archive** (`.countPill` === 0): on load, archive column body contains **0** `.archiveToggle` buttons (toggle is intentionally skipped per §4 «Empty archive» edge case) and **0** `.card` descendants. The existing `.columnHint` placeholder is present instead. **No click step** — there's nothing to click, and expanding an empty archive is meaningless. This is a PASS path, not a degraded probe.
  - Both branches: `toClaude` and `toCodex` columns render exactly as before (same card count as pre-Stage-3 baseline under identical data).
- **AC-5** No regression: dashboard loads, `/api/messages` still fires once on mount + every 10 s (Stage 2 guard), manual Refresh button still works. Zero console errors, zero `pageerror`.
- **AC-6** PD regex scan clean (same regex as CI `.github/workflows/ci.yml`).
- **AC-7** Scope of evidence (EOL-insensitive split, per Stage 2 §2a contract):
  - `git diff --ignore-cr-at-eol --stat HEAD -- dashboard/src/App.jsx` → exactly one tracked file changed.
  - `git diff --ignore-cr-at-eol HEAD -- dashboard/src/App.jsx` → confined to **five** regions introduced by Stage 3: (1) useState cluster `:1294-1318` (add `archiveExpanded` slot); (2) i18n dicts `:18-150` (add `archiveShow` + `archiveHide` keys ×2 languages); (3) `[project]` reset effect region `:~1350-1360` (new `useEffect` after the localStorage-write effect); (4) JSX columnBody `:1842-1879` (conditional render + toggle buttons); (5) CSS styles block after `.columnHint` at `:682-686` (new `.archiveToggle` rule). No edits in Stage 1/2 regions (AbortController logic `:1355-1392` + `:1569-1586`; `const pollIntervalMs = 10000` at `:9`).
  - `git status --short --untracked-files=all -- docs/codex-tasks/dashboard-perf-s3-archive-collapse*.md` → three `??` entries.

### Edge cases closed

- **Empty archive** (`messages.archive.length === 0`) — skip the toggle entirely; render the existing `.columnHint` placeholder («No messages.» / «Нет сообщений.»). Avoids the ugly «Show archive (0)» button.
- **Archive fill mid-session** (poll tick adds a new card while collapsed) — `messages.archive.length` still updates via existing poll; `.countPill` in the column header continues to reflect the real count; toggle label re-renders with the new number on next React cycle.
- **User expands → refresh-button tick arrives** — archive list re-renders with fresh data in place; `archiveExpanded` state is independent and survives the setState (state lives in `App` component, not inside `.map`).
- **Project switch** — the existing `[project]` messages effect (`App.jsx:1569-1586`) kicks off a new `fetchMessages` but does **not** clear the current `messages` state up-front: `setMessages` fires only after the new fetch resolves (`:1515`, `:1534`). A new **independent effect** introduced by this stage — `useEffect(() => { setArchiveExpanded(false); }, [project])` — resets the collapse state synchronously on project change. Net behavior: switching to a new project immediately collapses the archive view, so (a) the outgoing project's archive cards that are still mounted stay hidden behind the toggle until the user opts in, and (b) the incoming project's archive data — once fetched — also mounts collapsed. First-load and every-project-switch both hit the «smooth by default» path.
- **Language switch mid-session** — `t.archiveShow` / `t.archiveHide` re-render via `t` being derived from `lang`; toggle label updates on re-render. Standard React i18n behavior.
- **Theme switch** — `.archiveToggle` uses CSS custom properties (`--surface-control`, etc.); colors flip with theme. No special case needed.

### Out of scope (Stage 3)

- **Server-side markdown parse** — Stage 4.
- **Card-body collapse inside live columns** — Stage 4 (Fix 2).
- **Virtualization of `toClaude` / `toCodex`** — only if Stage 4 insufficient.
- **Persisting `archiveExpanded` across reloads** — rejected by design (defeats the stage's purpose).
- **Lazy-loading archive data** (fetch only when expanded) — server already returns archive in the same `/api/messages` payload; changing that is a separate stage (Stage 4 or later).

## 5. Verification

### Phase 1 — Pre-package (evidence in planning-audit)

- PD scan clean (audit §7).
- Grep audit: archive rendering call-sites, useState cluster, i18n dicts (audit §4).
- Tool readiness: inherits Stage 1/2 caches (Playwright 1.59.1, Vite build).

### Phase 2 — Edit

- Five `Edit` operations on `dashboard/src/App.jsx`, one logical change = one commit:
  1. useState add (cluster :1294-1318);
  2. ru i18n add (:18-83);
  3. en i18n add (:84-150);
  4. JSX conditional + CSS rule (columnBody :1842-1879 + styles block after `.columnHint` :682-686);
  5. `[project]` reset effect (inserted after the existing localStorage-write effect at :1348-1353).
- **Post-edit, pre-commit gate** (EOL-insensitive, per Stage 2 §2a contract):
  - `git diff --ignore-cr-at-eol --stat HEAD -- dashboard/src/App.jsx` → exactly one file changed with modest LOC delta (~35 insertions, ~3 deletions).
  - `git diff --ignore-cr-at-eol HEAD -- dashboard/src/App.jsx` → hunks touch only the expected regions (useState cluster :1294-1318; i18n :18-150; `[project]` reset effect region around :1350-1360; JSX :1842-1879; CSS post-`.columnHint` :682-686). No touch in `pollIntervalMs` region (:9) or Stage 1 AbortController regions (runtime poll :1355-1392, messages poll :1569-1586).
  - `git status --short --untracked-files=all -- docs/codex-tasks/dashboard-perf-s3-archive-collapse*.md` → three `??` entries.
  - Anything else → STOP, `git restore dashboard/src/App.jsx`, investigate.
- `npx vite build` in `dashboard/`.
- Run AC-1 / AC-2 / AC-3 / AC-6 / AC-7 (static grep + syntax + scope).

### Phase 3 — Empirical probe

- `E:/tmp/pw-probe/probe-s3.mjs` (throwaway; same pattern as Stage 2). Branch-aware, mirrors AC-4 Branch A / Branch B:
  - Navigate to `http://localhost:9119/`.
  - **Language-agnostic locator** (app defaults to `ru` on clean session → heading is «Архив», not «Archive» — `App.jsx:1308-1310`): locate the archive column via `page.locator('.column').filter({ hasText: /Archive|Архив/i })`. Equivalent fallback: `page.locator('.column').nth(2)` since the 3rd column in `getColumns(t)` (`App.jsx:1072-1078`) is always `key: "archive"` regardless of `lang`.
  - Read the archive column's `.countPill` text as an integer → `archiveCount`. Use it to pick a branch (both are explicit PASS paths):
    - **Branch A — `archiveCount > 0`**: assert `.columnBody` contains exactly 1 `.archiveToggle` and 0 `.card`. Click toggle → `waitForFunction` for `.card` count === `archiveCount` within 1000 ms. Click toggle again → `waitForFunction` for `.card` count back to 0 and `.archiveToggle` count back to 1 within 1000 ms.
    - **Branch B — `archiveCount === 0`**: assert `.columnBody` contains 0 `.archiveToggle` and 0 `.card`; the existing `.columnHint` placeholder is the only content. No click step.
  - Collect console errors + page errors on both branches.
- Delete script post-capture.

### Phase 4 — Handoff

- Package Format mailbox — split evidence per §2a EOL-insensitive contract:
  - Tracked code scope: `git diff --ignore-cr-at-eol --stat HEAD -- dashboard/src/App.jsx`.
  - Tracked code hunks: `git diff --ignore-cr-at-eol HEAD -- dashboard/src/App.jsx`.
  - Untracked package docs: `git status --short --untracked-files=all -- docs/codex-tasks/dashboard-perf-s3-archive-collapse*.md`.
- File-by-file role table, raw probe output, AC status table, refs to report §1/§2, known unknowns (Stage 1/2 carry-overs + Stage 3 specifics if any), scope confirmation.

## 6. Rollback

- Pre-commit: `git restore dashboard/src/App.jsx`.
- Post-commit: `git revert <s3-sha>`. Preserves Stage 1/2 commits.
- UX rollback (if user prefers archive-expanded-by-default after shipping): requires **two** edits, not just the useState initial value flip — the `[project]` reset effect would otherwise re-collapse on every project switch and defeat the rollback:
  1. `useState(false)` → `useState(true)` in the useState cluster.
  2. Remove (or no-op) the `useEffect(() => { setArchiveExpanded(false); }, [project])` effect inserted in Stage 3 edit #5.
  Total ~2-4 LOC hotfix stage.

## 7. Discrepancy-first checkpoints (STOP conditions)

1. `git diff --ignore-cr-at-eol --stat HEAD -- dashboard/src/App.jsx` shows >1 file changed OR touches Stage 1/Stage 2 regions → STOP, investigate.
2. `npx vite build` fails → STOP, diagnose (likely syntactic error in JSX or missing i18n key).
3. AC-4 probe shows archive column body containing >1 clickable element on initial load (e.g., toggle button + stale card still mounted) → STOP, re-inspect conditional render.
4. Console/page errors during AC-5 smoke → STOP, diagnose.
5. PD scan returns hits → STOP, triage.
6. `messages.archive` shape mismatch detected post-edit (e.g., some unexpected access pattern broken by the guard) → STOP, re-derive.

## 8. Commit strategy

Single commit, message pattern:

```
perf(dashboard): archive column collapsed by default (summary toggle)

Cuts initial DOM mount from ~270 cards to ~15-30 in typical sessions.
Archive column body renders a single Show/Hide button until user opts in;
toClaude + toCodex columns unchanged. State is client-only, per-session.

Closes s3 of dashboard-perf roadmap. Stage 4 (client-side markdown render
+ card-body collapse) follows.
```

Push: separate explicit user command; may batch with Stage 1 + Stage 2 when github.com:443 unblocks.

## 9. Notes for Codex review (Rule 7 — expect ≥ 3 risks)

Candidate risks to inspect:

- Is default-collapsed the right UX? Will users be confused that archive appears «empty» at first glance despite the countPill showing 267? (§3 rationale addresses; button label explicitly shows count; your call whether to push harder on surfacing.)
- Is the symmetric show/hide pattern right, or should it be one-way expand? (§3 addresses; open to reconsidering if you see a UX argument I missed.)
- Any place that reads `messages.archive.length` and assumes cards are mounted (e.g., a hypothetical ref-forward or `querySelector` on card DOM)? My grep didn't find any, but I'd appreciate a second pair of eyes on call-sites of `messages.archive`.
- Any CSS class collision with `.archiveToggle` name? I assumed unique — verified via grep (no hits). You may have a stronger naming preference.
- Any hydration issue from client-only state (SSR not applicable here — Vite SPA — but flagging anyway).
- ~~State-reset semantics on project switch: `archiveExpanded` does NOT reset on `[project]` change.~~ **Resolved in this V2** (per codex-001): `archiveExpanded` **resets to `false`** on project change via an independent `useEffect(() => { setArchiveExpanded(false); }, [project])`. See §2 edit #5 and §3 rationale block «Why reset on project change».

If Critical/Mandatory — inline apply + re-send. If approved — execute Phase 2/3 → fill report → final handoff → STOP before commit.
