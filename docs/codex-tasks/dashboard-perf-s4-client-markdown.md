# dashboard-perf-s4 — Client-side markdown render + per-card body collapse

**Stage**: 4 of 4 (roadmap: `C:\Users\<user>\.claude\plans\4-compiled-hanrahan.md`)
**Version**: 1
**Thread**: `dashboard-perf-s4-client-markdown`
**Planning-audit**: `docs/codex-tasks/dashboard-perf-s4-client-markdown-planning-audit.md`
**Execution report**: `docs/codex-tasks/dashboard-perf-s4-client-markdown-report.md`
**Work-verification** (Codex, post-exec): `docs/codex-tasks/dashboard-perf-s4-client-markdown-work-verification.md`
**Depends on**: Stage 3 (`20c0039` local, unpushed) on top of Stage 2 (`8c2a704`) + Stage 1 (`8a553b2`).
**Executor**: Claude per sequential workflow. **Verifier**: Codex.

---

## 1. Why this stage exists

Stages 1-3 closed the concurrent-poll race, lowered poll frequency 3 s → 10 s, and cut the Archive-column DOM from ~270 cards to a single toggle by default. The remaining top cost on the user's machine: every `/api/messages` response carries an `html` field per card produced server-side by `marked.parse(body)` — for a 456-card dataset that's 456 `marked.parse` calls on every 10 s tick, and the resulting HTML ships as part of the response payload (multiplies payload size). On the client, every non-archive card mounts its body via `dangerouslySetInnerHTML` on first render, even when the user never expands it.

Stage 4 target: move markdown rendering off the server path entirely and make per-card body render lazy + collapsed by default.

- **Server win**: drop `marked.parse(body)` from hot path in `readMessage`; drop `html` field from JSON payload → smaller wire size, faster server tick.
- **Client win**: `toClaude` + `toCodex` cards mount with a plain-text preview only; full HTML renders only when the user clicks the card header to expand. After Stage 3's archive collapse, Stage 4 extends the «render what the user looks at, not what the server has» principle to the two live columns.

Expected impact: `/api/messages` payload drops roughly proportional to summed `html.length` across all cards (typically 2-4× body length due to markdown → HTML expansion); initial mount of `toClaude` / `toCodex` columns becomes ~linear in card count × metadata only (no body render).

## 2. Change scope

| # | File | Change |
|---|---|---|
| 1 | `scripts/mailbox-lib.mjs:10-13` | Remove `marked` dynamic import (no remaining consumer in server code — verified via grep below). |
| 2 | `scripts/mailbox-lib.mjs:32-35` | Remove `marked.use({ breaks: true, gfm: true })` call (no consumer left). |
| 3 | `scripts/mailbox-lib.mjs:552` | Remove `html: body ? String(marked.parse(body)) : "",` line from `readMessage` return object. `body` field remains. |
| 4 | `dashboard/src/App.jsx:1` | Add `marked` import from `"marked"` (client-side, v18.0.1 already in `dashboard/package.json`). Apply the same `marked.use({ breaks: true, gfm: true })` config to preserve rendering parity with the old server path. |
| 5 | `dashboard/src/App.jsx` (useState cluster near `:1336`) | Add `const [expandedIds, setExpandedIds] = useState(() => new Set());` top-level in `App`. |
| 6 | `dashboard/src/App.jsx` (new `toggleExpanded` helper in `App`, passed to `MessageCard` via prop) | Add stable `useCallback` toggle via explicit branch: `setExpandedIds((prev) => { const next = new Set(prev); if (next.has(relPath)) next.delete(relPath); else next.add(relPath); return next; });`. `.delete()` returns a boolean — do not chain — and there is no `Set.prototype.toggle`. |
| 7 | `dashboard/src/App.jsx:1126-1139` (`MessageCard` signature) | Add two props: `expanded: boolean` + `onToggleExpanded: (relativePath) => void`. |
| 8 | `dashboard/src/App.jsx` (`MessageCard` internals, replacing old `message.html` block at :1267-1272) | (a) Make `<header className="cardHeader">` button-like with full a11y contract: `onClick={() => onToggleExpanded(message.relativePath)}`, `role="button"`, `tabIndex={0}`, `aria-expanded={expanded}`, and a keyboard handler `onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggleExpanded(message.relativePath); } }}` (Space MUST `preventDefault` to stop the default page-scroll-on-Space behavior). Add a small `<span className="expandIndicator" aria-hidden="true">` showing `▸` when collapsed and `▾` when expanded. (b) Replace the old server-html body: if `!expanded && message.body` → render `<p className="bodyPreview">` with the first non-empty line (up to ~160 chars) of `message.body`; if `expanded && message.body` → run `marked.parse(message.body)` via a local `useMemo([expanded, message.body])` and feed the result into `<section className="body" dangerouslySetInnerHTML={...} />` (same CSS class as before for visual parity; same security posture — see §3 «Security posture»); if no body at all → nothing. |
| 9 | `dashboard/src/App.jsx` JSX call sites at `:~1876` (inside `columns.map`) | Pass `expanded={expandedIds.has(message.relativePath)}` + `onToggleExpanded={toggleExpanded}` down to every `MessageCard` instance (both the archive-expanded path and the live-column path). |
| 10 | `dashboard/src/App.jsx` styles block (existing `.cardHeader` rule at `:723`; `.card` at `:716`) | **Extend** the existing `.cardHeader` rule with `cursor: pointer; user-select: none;` (plus `:hover` / `:focus-visible` treatments for affordance and keyboard access). **Add** 2 new rules: `.expandIndicator` (small muted glyph, margin-left) and `.bodyPreview` (muted text color, single-line with `text-overflow: ellipsis`). |

**That is the entire code change.** Total touch: 2 files. Scope per roadmap estimate: ~60 LOC.

**Explicit non-changes** (documented to prevent scope creep):

- `dashboard/package.json` — `marked: ^18.0.1` is **already** a runtime dependency (line 19), no `npm install` needed. Stage 4 does not add or remove packages.
- `dashboard/server.js`, `dashboard/supervisor.mjs`, other scripts in `scripts/` — none currently read `.html` from `readMessage` return (grep-verified in audit §4). Removing the field is safe.
- Stage 1 AbortController logic (`:1388-1425` post-Stage-3 shift) — untouched.
- Stage 2 `pollIntervalMs = 10000` — untouched.
- Stage 3 `archiveExpanded` state + `[project]` reset effect + `.archiveToggle` — untouched. Stage 4 stacks alongside; archive cards, when the user expands the archive column, still go through the new collapsed-by-default body path.
- Existing `message.body` shape on the wire — unchanged. Only `html` field disappears.
- DOMPurify / sanitization — **out of scope**. Marked does NOT sanitize output HTML (upstream `README.md:53-56`); pre-Stage-4 the project already fed unsanitized `marked.parse` into `dangerouslySetInnerHTML`; Stage 4 preserves that exact pipeline, just moving the parse step from server to client. Adding DOMPurify between `marked.parse` and the `dangerouslySetInnerHTML` prop would be a separate, narrower hardening stage. Trust model: mailbox body originates from local Claude + Codex CLI writers — not untrusted web input.
- `showActions` prop + action row rendering — unchanged. Click on action buttons inside a card must NOT toggle the expand state — the click handler is scoped to `<header>` only, which contains no buttons (verified at `App.jsx:1185-1205`).
- `localStorage` persistence for `expandedIds` — out of scope. Per-session state matches Stage 3's archive-collapse philosophy.

**Expected commit-tree diff** (EOL-insensitive view, per Stage 2 §2a contract):

```
dashboard/src/App.jsx     | ~+50 / ~-6
scripts/mailbox-lib.mjs   | ~+0  / ~-7
```

Estimate; actual measured post-edit under AC-9.

## 3. Why this design (vs alternatives)

- **Why drop server-side `marked.parse` entirely vs keep server html + add client collapse**: keeping server html would still ship the full HTML per card in every payload — Stage 3's collapse would then only save DOM mount, not payload size. Dropping server html saves both wire cost and server CPU per tick.
- **Why `expandedIds: Set<string>` state (not `expandedId: string` singleton)**: users frequently open 2-3 cards side-by-side to compare threads. Singleton would collapse-on-open-next, which users called out as friction in Stage 0 planning.
- **Why per-card `useMemo` caching, not a global `Map` ref in `App`**: `MessageCard` is already keyed by `message.relativePath`, so React keeps the component instance across poll updates — the `useMemo` persists alongside the component. Deps `[expanded, message.body]` mean `marked.parse` runs on every expand **transition** (collapse → expand flips `expanded`, invalidating the memo), and also runs when the server updates `message.body`. Collapse does NOT throw away the cached HTML: while `expanded` is `true` and the body is unchanged, the memo holds; but a collapse-then-re-expand DOES re-parse because `expanded` is in the deps. This is acceptable: a single `marked.parse` of a typical mailbox body is sub-millisecond on modern engines, and this lazy pattern is still a large net win versus the pre-Stage-4 path where every card was rendered on every load + every poll. If later profiling shows recompute-on-re-expand is a bottleneck, an `App`-level `Map<relativePath, { body, html }>` cache is a localized fix — out of scope for Stage 4.
- **Why click on `<header>` not on `<article>`**: the card contains interactive children (`<button>`, `<textarea>` inside the note form) — making `<article>` clickable would require `e.stopPropagation` in every interactive child. `<header>` at `App.jsx:1185-1205` contains only `<h3>` + two `<span>` chips, no event conflicts.
- **Why plain-text preview (first non-empty line)**: gives users enough to decide «open or skip» at a glance; first line is typically a TL;DR or salutation in the agent letters. Alternatives: char-count (arbitrary cut), first paragraph (may be long), markdown-stripped preview (needs extra parsing). First line is cheapest and usually informative.
- **Why reuse existing `.body` CSS class for the expanded render**: zero visual drift. Old server-rendered HTML went into `<section className="body" dangerouslySetInnerHTML={...}>`. New client-rendered HTML reuses the exact same container, so typography / spacing / links all match what Stage 3 and before shipped.

### Security posture (not «default-safe»)

Per `dashboard/node_modules/marked/README.md:53-56`, **Marked does not sanitize output HTML** and the authors explicitly recommend pairing it with DOMPurify if the input may come from untrusted sources. Pre-Stage-4 the project already ran `marked.parse(body)` server-side and piped the result into `dangerouslySetInnerHTML` **without** DOMPurify. Stage 4 moves that same operation to the client and still feeds `dangerouslySetInnerHTML` **without** DOMPurify. **Net security posture: identical to pre-Stage-4.** The project accepts this because mailbox `body` content originates from two trusted local writers (Claude + Codex via CLI), not from arbitrary web input. Adding DOMPurify is a legitimate hardening step but is **explicitly out of scope for Stage 4** — see brief §4 «Out of scope» and §9 bullet 1 for the explicit flag to Codex. If the user later decides untrusted input is a risk, a separate stage wires DOMPurify between `marked.parse` and the `dangerouslySetInnerHTML` prop.
- **Why default collapsed for all cards (not only archive)**: Stage 3 already proved the collapse pattern is acceptable on the heaviest column. Extending it to live columns gives the scroll win for the default «just loaded the dashboard» state too. Expanding is one keyboard / mouse action away.

## 4. Acceptance criteria

### Concrete checks

- **AC-1** Server: `grep -cE "marked|\\.html\\b" scripts/mailbox-lib.mjs` → **0** hits (marked import, config, and html field all removed).
- **AC-2** Server: `grep -rn "marked" scripts/ dashboard/server.js dashboard/supervisor.mjs` → **0** hits outside `package.json` / `package-lock.json` (already checked: no other consumer).
- **AC-3** Client: `grep -n "^import.*marked" dashboard/src/App.jsx` → **exactly 1** hit (new import).
- **AC-4** Client: `grep -n "const \[expandedIds, setExpandedIds\]" dashboard/src/App.jsx` → **exactly 1** hit in the useState cluster.
- **AC-5** Client: `grep -n "onToggleExpanded\|toggleExpanded" dashboard/src/App.jsx` → **≥ 4** hits (helper definition + prop on `MessageCard` signature + prop passed at call sites × 1 or 2 + `onClick` handler).
- **AC-6** Client: `grep -n "message\\.html" dashboard/src/App.jsx` → **0** hits (old server-html consumer removed).
- **AC-7** `cd dashboard && npx vite build` → exit 0; new bundle size reported observationally (expected delta is `+marked dependency size` minus `– message.html payload savings on wire`; wire savings accrue post-deploy, not in bundle).
- **AC-8** Playwright probe (headless, no throttle), branch-free (every real session has at least some cards):
  - On load, for the first fully-mounted `toClaude` / `toCodex` card: the card's `.body` section (rendered HTML) is absent; a `.bodyPreview` element exists with non-empty text (trimmed, ≤ ~160 chars). The card's `.cardHeader` has `aria-expanded="false"`.
  - Click the card's `<header>` (not its action buttons): within 500 ms the `.body` section appears, the `.bodyPreview` disappears, and `.cardHeader` has `aria-expanded="true"`. The `<section className="body">` innerHTML is a non-empty string containing typical marked output for non-trivial bodies (e.g., `<p>` tag).
  - Click the header again: `.body` disappears, `.bodyPreview` reappears, `aria-expanded` back to `"false"`.
  - Keyboard test: tab focus to a collapsed card's header; press `Space` → card expands AND the page does not scroll (Space preventDefault holds); press `Enter` on an expanded card → card collapses.
  - Opening 3 different cards does NOT collapse the previously opened ones (multi-expand works; all three headers report `aria-expanded="true"` simultaneously).
  - Clicking an action button inside an expanded card (e.g., «Archive» or «Add note») does NOT collapse the card (click scoped to `<header>` only; action buttons live outside it, so no event-bubbling conflict — see brief §3 «Why click on `<header>` not on `<article>`»).
- **AC-9** No regression in live-column Archive workflow: Stage 3 archive toggle still works; after expanding the archive column and then expanding an archive card, the body renders correctly.
- **AC-10** No regression on Stage 2 poll cadence: 30 s capture still shows 3 ± 1 `/api/messages` requests.
- **AC-11** `/api/messages` payload is smaller than pre-Stage-4 baseline for the same dataset. Measured via `curl -s http://localhost:9119/api/messages | wc -c` before and after Stage 4; expected: strict reduction roughly matching `sum(messages[].html.length)` pre-Stage-4.
- **AC-12** PD regex scan clean (same CI regex).
- **AC-13** Scope of evidence (EOL-insensitive split, per Stage 2 §2a contract):
  - `git diff --ignore-cr-at-eol --stat HEAD -- scripts/mailbox-lib.mjs dashboard/src/App.jsx` → exactly two tracked files changed within this scope (unscoped `HEAD --` will also report the repo's pre-existing dirty files in `.claude/settings.local.json`, `AGENTS.md`, `CLAUDE.md`, `docs/codex-system-prompt.md`; those are not part of Stage 4). Path-scoped view is the acceptance gate.
  - `git diff --ignore-cr-at-eol HEAD -- scripts/mailbox-lib.mjs` → confined to the marked import region (:10-13), marked config (:32-35), and the `html:` line in `readMessage` (:552).
  - `git diff --ignore-cr-at-eol HEAD -- dashboard/src/App.jsx` → confined to **seven** client regions (same partition as brief §2 and Phase 2 step #2):
     1. top-of-file imports + `marked.use` config (:1);
     2. `useState` cluster — `expandedIds` slot (post-Stage-3 :1322-1347);
     3. **`toggleExpanded` `useCallback` helper** — a new App-body declaration sitting between the useState cluster and the existing `[project]` / runtime-state effects (~:1349-1360 post-Stage-3 — exact line determined by where the executor inserts it, inside the `App` function body but outside any JSX or existing effect);
     4. `MessageCard` signature adds `expanded` + `onToggleExpanded` props (:1126-1139);
     5. `MessageCard` internals around the old body block (:1267-1272) — clickable `<header>`, aria/keyboard, indicator, `useMemo`-gated marked render, plain-text preview;
     6. `columns.map` prop-passing (:~1876 — lives inside the Stage 3 archive-collapse JSX branch; see Stage 3 overlap note below);
     7. CSS block around existing `.card` / `.cardHeader` rules (:716-:723 extension + new `.expandIndicator` / `.bodyPreview` sibling rules).
     No touch in Stage 1 AbortController regions or Stage 2 `pollIntervalMs`. **Stage 3 region interaction is limited and expected**: the `columns.map` `MessageCard` call-site (region 6) lives inside the Stage 3 archive-collapse JSX branch (:1884-1925 post-Stage-3), so edit #9 **adds two new props** (`expanded`, `onToggleExpanded`) on that `MessageCard` instance — this is the only overlap, and it is additive (no rewrite of the Stage 3 branching logic). All other Stage 3 touchpoints (`archiveExpanded` state, `setArchiveExpanded` calls, `[project]` reset effect, `.archiveToggle` CSS rule, `archiveShow`/`archiveHide` i18n keys) remain untouched.
  - `git status --short --untracked-files=all -- docs/codex-tasks/dashboard-perf-s4-client-markdown*.md` → three `??` entries.

### Edge cases closed

- **Card with empty `body`** — skip both the preview and the expanded section. Existing code already had `{message.html ? ... : null}`; new code becomes `{message.body ? ... : null}` around both branches.
- **Expand a card → mailbox poll replaces `messages` with a fresh fetch** — `expandedIds` persists (it's in `App` state, independent of `messages`). Card with same `relativePath` keeps its expanded state. If the server dropped the card (archived), it disappears from render; `expandedIds` may still hold a stale id — benign (never read without a matching card).
- **Expand a card → user switches `project`** — `expandedIds` is NOT reset on `[project]` change. Intentional: user might have expanded a card in project A, switch to B briefly, switch back to A — expecting their expansions to remain. Archive-collapse (Stage 3) explicitly DOES reset on project change because that's about render cost; `expandedIds` is small (Set of strings) and cheap to keep.
- **Language switch mid-session** — markdown render is language-agnostic. Preview and expanded body both re-render with correct translations on surrounding UI. No change to the body content.
- **User clicks an action button inside an expanded card** — click scoped to `<header>`; action buttons live in `renderActionRow()` outside the header. No `stopPropagation` needed, confirmed by DOM structure read.
- **Very long body (>10k chars)** — `marked.parse` handles large inputs fine; preview is limited to the first ~160 chars so loading is instant. Expanded render is lazy (useMemo only runs when `expanded` becomes true).
- **Race: user clicks header twice rapidly** — setState with the function-form `(prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }` is deterministic; React batches and re-applies with the latest prev, so no updates are dropped.

### Out of scope (Stage 4)

- **DOMPurify / sanitization** — preserves pre-Stage-4 security posture; stricter sanitization is a separate stage.
- **Virtualization of live columns** — Stage 5 territory.
- **Persisting `expandedIds` across reloads** — rejected; matches Stage 3's per-session design.
- **Syntax highlighting for code fences** — would require an additional library; separate stage if user asks.
- **Streaming / incremental render on expand** — marked.parse is synchronous and fast for typical mailbox message sizes.

## 5. Verification

### Phase 1 — Pre-package (audit §4 + §7)

- PD scan clean.
- Grep audit of `marked` + `.html` + `message.html` consumers (audit §4).
- marked v18.0.1 confirmed in `dashboard/package.json`.
- No other consumer of `mailbox-lib.mjs`'s `.html` field (audit §4).

### Runtime architecture (context for Phase 2 / Phase 3 ordering)

- `dashboard/package.json` scripts: `npm run serve` = `concurrently "node server.js" "npm run preview"`. Two long-lived processes:
  - **API server** on `127.0.0.1:3003` — `node server.js`, which `import`s from `../scripts/mailbox-lib.mjs`.
  - **Preview (Vite)** on `127.0.0.1:9119` — `vite preview`, which proxies `/api` → `:3003` (see `dashboard/vite.config.js:11-13`).
- Node.js does **not** hot-reload ES modules. Once `node server.js` is running, it holds the pre-edit `mailbox-lib.mjs` in memory; editing the file on disk does NOT retroactively change what `:3003` serves. `npx vite build` rebuilds only the frontend bundle; it has no effect on the API process.
- **Implication for Stage 4**: after editing `scripts/mailbox-lib.mjs`, the API server must be explicitly restarted before any post-edit measurement or probe — otherwise AC-8 / AC-9 / AC-10 / AC-11 would silently exercise old server code and report false-pass on wire-size or false-fail on shape.

### Phase 2 — Edit

Execution order matters; sub-steps must run in this sequence:

1. **Pre-edit baseline capture** (non-mutating, BEFORE touching either source file):
   - `mkdir -p /tmp/pw-probe && curl -s http://localhost:9119/api/messages | wc -c > /tmp/pw-probe/pre-s4-api-messages.bytes`.
   - The live API server is still serving the pre-Stage-4 `mailbox-lib.mjs` at this point (`html` field present). Saved byte count becomes the AC-11 baseline. No `git stash` — see audit §6 EP3 for the rationale.
2. **Apply the 10 edits** per brief §2:
   - `scripts/mailbox-lib.mjs` — 3 server regions: marked dynamic import (:10-13), `marked.use` call (:32-35), `html:` line in `readMessage` (:552).
   - `dashboard/src/App.jsx` — 7 client regions: top-of-file `marked` import + `marked.use` config (:1); `expandedIds` `useState` slot in the useState cluster (:~1336); `toggleExpanded` `useCallback` helper in `App`; `MessageCard` signature `expanded` + `onToggleExpanded` props (:1126-1139); `MessageCard` body block replacement at the old `message.html` site (:1267-1272) covering clickable `button`-like `<header>` with `aria-expanded` / keyboard / no-scroll-on-Space / indicator glyph, plain-text `<p className="bodyPreview">`, and `useMemo`-gated `marked.parse` into `<section className="body">`; JSX call-sites in `columns.map` (:~1876) passing `expanded` + `onToggleExpanded`; CSS styles block extending existing `.cardHeader` at :723 plus new `.expandIndicator` + `.bodyPreview` rules.
   - Stage 4 does **not** touch the i18n dicts and does **not** introduce any new `[project]` effect — those are Stage 3 artifacts and remain unmodified.
3. **Frontend rebuild**: `cd dashboard && npx vite build`. Preview (`:9119`) picks up the new bundle without restart.
4. **Backend restart** (MANDATORY — Node does not hot-reload ESM):
   - Stop the running `node server.js` process on `127.0.0.1:3003` (executor-chosen mechanism: `pkill -f "node server.js"` on POSIX; equivalent Windows-aware kill via `taskkill` or managed concurrent-session stop if `npm run serve` was started through a managed lifecycle).
   - Start a fresh `node server.js` (background). This loads the post-Stage-4 `mailbox-lib.mjs`, so `/api/messages` now returns responses WITHOUT the `html` field.
   - Health-check the new process — **full-response negative check** (a byte-sample would miss `html` because `mailbox-lib.mjs:523-553` places that field late in each message object, after `body`/`related_files`/etc.):
     - `curl -sSf http://127.0.0.1:3003/api/messages -o /tmp/pw-probe/post-restart-api.json` must exit 0 (server reachable + 2xx status).
     - `grep -q '"html":' /tmp/pw-probe/post-restart-api.json` must exit **non-zero** (no match anywhere in the full JSON payload, confirming the `html` field is absent from every message object, not just from a truncated prefix).
     - If either the curl or the grep-negation check fails → STOP, investigate (either the server is not reachable, OR the restart failed to pick up the post-Stage-4 `mailbox-lib.mjs` and is still running old code).
5. **Post-edit, pre-commit gate** (EOL-insensitive, per Stage 2 §2a contract):
   - `git diff --ignore-cr-at-eol --stat HEAD -- scripts/mailbox-lib.mjs dashboard/src/App.jsx` → exactly 2 tracked files (path-scoped to ignore the repo's pre-existing unrelated dirty files).
   - `scripts/mailbox-lib.mjs`: diff confined to :10-13, :32-35, :552.
   - `dashboard/src/App.jsx`: diff confined to the 7 `dashboard/src/App.jsx` regions enumerated in AC-13 (imports + `marked.use`; useState `expandedIds` slot; `toggleExpanded` `useCallback` helper; `MessageCard` signature props; `MessageCard` internals body block; `columns.map` prop-passing; CSS extension + new rule siblings). **Stage 3 overlap is narrow and allowed**: prop passing on the `MessageCard` call-site inside the archive-collapse JSX branch (`:1884-1925 post-Stage-3`) — additive only, no rewrite of Stage 3 branching logic. All other Stage 3 touchpoints (`archiveExpanded` state, `setArchiveExpanded`, `[project]` reset effect, `.archiveToggle` CSS, `archiveShow` / `archiveHide` i18n keys) stay untouched. No touch in Stage 1 AbortController regions or Stage 2 `pollIntervalMs`.
6. Run AC-1..AC-7 + AC-12 + AC-13 (static grep + syntax + scope).

### Phase 3 — Empirical probe

**Precondition**: Phase 2 step #4 (backend restart) has completed AND the health-check confirmed no `"html":` in `/api/messages`. Probes below assume the live API is serving post-Stage-4 code.

- `/tmp/pw-probe/probe-s4.mjs` (throwaway; POSIX-clean path so the commands are valid in both the executor's git-bash on Windows and any WSL / Linux shell; install playwright locally via `npm install playwright --no-save` in the probe dir, same pattern as Stage 3):
  - Navigate `http://localhost:9119/`, wait for `/api/messages` response.
  - Assert AC-8 (all sub-steps including aria + keyboard + no-scroll + action-guard) and AC-9 (Stage 3 archive workflow intact).
  - Bonus: assert AC-10 (30 s poll cadence still 3 ± 1).
- AC-11 post-edit measurement:
  - `curl -s http://localhost:9119/api/messages | wc -c` — compare to `/tmp/pw-probe/pre-s4-api-messages.bytes` saved in Phase 2 step #1. Expect strict reduction roughly equal to `sum(messages[].html.length)` in the pre-Stage-4 dataset.
- Script + throwaway `node_modules` + baseline file deleted post-capture.

### Phase 4 — Handoff

- Package Format mailbox — split evidence per §2a EOL-insensitive contract:
  - Tracked code scope: `git diff --ignore-cr-at-eol --stat HEAD -- scripts/mailbox-lib.mjs dashboard/src/App.jsx` (path-scoped — repo carries pre-existing dirty files outside this scope).
  - Hunks: `git diff --ignore-cr-at-eol HEAD -- scripts/mailbox-lib.mjs dashboard/src/App.jsx`.
  - Untracked package docs: `git status --short --untracked-files=all -- docs/codex-tasks/dashboard-perf-s4-client-markdown*.md`.
- File-by-file role table, raw probe output, AC status table, refs to report §1/§2, known unknowns, scope confirmation.

## 6. Rollback

- Pre-commit: `git restore scripts/mailbox-lib.mjs dashboard/src/App.jsx`.
- Post-commit: `git revert <s4-sha>`. Preserves Stages 1-3.
- Partial rollback (server-only): unlikely — the server remove and client add are coupled. If ever needed, revert both hunks atomically.

## 7. Discrepancy-first checkpoints (STOP conditions)

1. `git diff --ignore-cr-at-eol --stat HEAD -- scripts/mailbox-lib.mjs dashboard/src/App.jsx` shows anything other than those two files within the path-scoped view OR touches Stage 1 AbortController regions OR touches Stage 2 `pollIntervalMs` region OR expands beyond the allowed narrow Stage 3 overlap (additive prop passing on the `MessageCard` call-site at `:1884-1925 post-Stage-3`; anything else under Stage 3 regions — `archiveExpanded` state, `[project]` reset effect, `.archiveToggle` CSS, `archiveShow` / `archiveHide` i18n — is a STOP).
2. `npx vite build` fails → STOP, likely JSX or missing `marked` export issue.
3. AC-8 shows `.body` mounted on load for a collapsed card → STOP, re-inspect conditional render / default state.
4. AC-8 shows multi-expand collapsing previous cards → STOP, re-inspect `expandedIds` logic (likely singleton bug).
5. AC-11 shows equal or larger payload than baseline → STOP, verify `html` field is actually gone from server response.
6. Console / page errors during probe → STOP, diagnose.
7. `marked` import path fails at build time (Vite) → STOP, verify dependency is `dependencies` not `devDependencies`.
8. PD scan hits → STOP, triage.

## 8. Commit strategy

Single commit, message pattern:

```
perf(dashboard): client-side markdown render + per-card body collapse

Drops server-side marked.parse from the /api/messages hot path; trims
the html field from readMessage's return. Client imports marked and
renders per card only on user expand (useMemo cache per (expanded, body)).
All cards default collapsed with a plain-text preview of the first line.

Expand state (expandedIds: Set<string>) persists across poll ticks and
project switches, independent of Stage 3's archive collapse.

Closes s4 of dashboard-perf roadmap.
```

Push: separate explicit user command; github.com:443 unblocking status unchanged from Stage 3.

## 9. Notes for Codex review (Rule 7 — expect ≥ 3 risks)

Candidate risks to inspect:

- **Security posture**: current code ships HTML rendered by `marked.parse(body)` into `dangerouslySetInnerHTML` with no additional sanitization. Stage 4 moves the exact same operation from server to client — no net change — but this is an invariant worth your eyes. If you believe we should ship DOMPurify alongside Stage 4, flag as Mandatory and I'll re-scope.
- **Wire size AC-11**: is `curl ... | wc -c` the right measurement, or do you want gzipped size since that's what browsers see?
- **Multi-expand**: any concern that `expandedIds: Set<string>` grows unbounded across long sessions? In practice each id is ~40 chars × 456 max cards = <20 kB worst-case; probably fine, but flag if you disagree.
- **Project switch semantics**: Stage 3 resets `archiveExpanded` on `[project]`; Stage 4 does NOT reset `expandedIds` on `[project]` (brief §4 «Project switch»). Different defaults on purpose — is that the right split?
- **`useMemo([expanded, message.body])` deps**: markdown parse only re-runs when `message.body` changes. Is that sufficient, or are there edge cases where marked's config change would invalidate (e.g., future stage changes `breaks` / `gfm`)? At Stage 4 the config is constant, so deps are fine.
- **Archive collapsed AND card expanded**: if a user expands archive (Stage 3), expands several archive cards (Stage 4), then collapses archive — cards unmount, their `useMemo` caches drop. Re-expanding archive and then the same cards forces marked.parse again. Acceptable? (My read: yes, archive collapse is rare, and even 456 × marked.parse is < 100 ms on any machine. Flag if you see a risk.)
- **Server remove**: any operational client still out there reading `.html`? Dashboard is a single SPA bundle; no external consumers.

If Critical/Mandatory — inline apply + re-send. If approved — execute Phase 2/3 → fill report → final handoff → STOP before commit.
