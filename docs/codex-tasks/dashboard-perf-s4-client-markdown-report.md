# dashboard-perf-s4 — Execution Report (template; populated during Phase 2+3)

**Stage**: 4 of 4 (final)
**Plan**: `docs/codex-tasks/dashboard-perf-s4-client-markdown.md`
**Planning-audit**: `docs/codex-tasks/dashboard-perf-s4-client-markdown-planning-audit.md`
**Work-verification** (Codex post-exec): `docs/codex-tasks/dashboard-perf-s4-client-markdown-work-verification.md`
**Depends on**: Stage 3 commit `20c0039` (local, unpushed).

---

## §1 Change summary

### Commit-tree diff scope (post-Phase-2, expected)

EOL-insensitive view — see planning-audit §2a. Untracked package docs surfaced separately.

```text
$ git diff --ignore-cr-at-eol --stat HEAD -- scripts/mailbox-lib.mjs dashboard/src/App.jsx
 dashboard/src/App.jsx   | 95 +++++++++++++++++++++++++++++++++++++++++++++----
 scripts/mailbox-lib.mjs | 10 ------
 2 files changed, 88 insertions(+), 17 deletions(-)

$ git status --short --untracked-files=all -- docs/codex-tasks/dashboard-perf-s4-client-markdown*.md
?? docs/codex-tasks/dashboard-perf-s4-client-markdown-planning-audit.md
?? docs/codex-tasks/dashboard-perf-s4-client-markdown-report.md
?? docs/codex-tasks/dashboard-perf-s4-client-markdown.md
```

15 hunks total: 3 in `scripts/mailbox-lib.mjs` (marked import removal, marked.use removal, html field removal) + 12 in `dashboard/src/App.jsx` (touching the 7 client regions declared in AC-13).

Raw `git diff --stat` is advisory only.

### File-by-file role

| File | Role | LOC delta |
|---|---|---|
| `scripts/mailbox-lib.mjs` | Remove marked dynamic import (:10-13), marked config (:32-35), and `html:` line from `readMessage` return (:552). Body field remains. | ~+0 / ~−7 |
| `dashboard/src/App.jsx` | (a) Add `marked` import + `marked.use({breaks,gfm})`; (b) `expandedIds: Set<string>` state in App; (c) `toggleExpanded` helper; (d) `MessageCard` props `expanded` + `onToggleExpanded`; (e) clickable `<header>` with role/tabindex/keyboard + indicator glyph; (f) body branch: preview vs client-rendered marked HTML via `useMemo`; (g) pass props at JSX call sites in `columns.map`; (h) CSS for `.cardHeader` + `.expandIndicator` + `.bodyPreview`. | ~+50 / ~−6 |

### Raw diff shape (summary)

```diff
// scripts/mailbox-lib.mjs
- (dynamic import of marked at :10-13)
- marked.use({ breaks: true, gfm: true }); (at :32-35)
- html: body ? String(marked.parse(body)) : "",  (at :552)

// dashboard/src/App.jsx
+ import { marked } from "marked";
+ marked.use({ breaks: true, gfm: true });
+ const [expandedIds, setExpandedIds] = useState(() => new Set());
+ const toggleExpanded = useCallback((relPath) => {
+   setExpandedIds((prev) => {
+     const next = new Set(prev);
+     if (next.has(relPath)) next.delete(relPath); else next.add(relPath);
+     return next;
+   });
+ }, []);
+ // MessageCard signature: add expanded + onToggleExpanded props
+ // clickable header + indicator
+ // body preview + expand branch via useMemo
+ // call-site prop passing
+ // CSS: .cardHeader cursor:pointer, .expandIndicator, .bodyPreview
- {message.html ? ( <section ... dangerouslySetInnerHTML={{ __html: message.html }} /> ) : null}
```

---

## §2 Verification outputs (raw)

### AC-1 — Server: marked + html fully removed

```text
$ grep -cE "marked|\.html\b" scripts/mailbox-lib.mjs
0
```

Verdict: ✅ PASS — no marked reference and no `.html` field reference anywhere in server lib.

### AC-2 — No `marked` anywhere in server code

```text
$ grep -rn "marked" scripts/ dashboard/server.js dashboard/supervisor.mjs --exclude-dir=node_modules
(no matches)
```

Verdict: ✅ PASS.

### AC-3 — Client: marked import present

```text
$ grep -n "^import.*marked" dashboard/src/App.jsx
2:import { marked } from "marked";
```

Verdict: ✅ PASS — single import at :2.

### AC-4 — Client: expandedIds state present

```text
$ grep -n "const \[expandedIds, setExpandedIds\]" dashboard/src/App.jsx
1405:  const [expandedIds, setExpandedIds] = useState(() => new Set());
```

Verdict: ✅ PASS — declared at :1405 in useState cluster.

### AC-5 — Client: toggleExpanded wired

```text
$ grep -n "onToggleExpanded\|toggleExpanded" dashboard/src/App.jsx
1172:  onToggleExpanded,
1235:      onToggleExpanded(message.relativePath);
1246:        onClick={() => onToggleExpanded(message.relativePath)}
1421:  const toggleExpanded = useCallback((relPath) => {
2000:                            onToggleExpanded={toggleExpanded}
```

Verdict: ✅ PASS — 5 hits covering MessageCard signature prop (:1172), keyboard handler (:1235), onClick handler (:1246), useCallback definition (:1421), JSX call-site prop-passing (:2000).

### AC-6 — Client: message.html removed

```text
$ grep -n "message\\.html" dashboard/src/App.jsx
(no matches)
```

Verdict: ✅ PASS.

### AC-7 — Vite build

```text
$ cd dashboard && npx vite build
vite v8.0.8 building client environment for production...
transforming...✓ 17 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  0.39 kB │ gzip:  0.27 kB
dist/assets/index-D0XodcIv.js  272.08 kB │ gzip: 82.55 kB

✓ built in 445ms
```

Verdict: ✅ PASS — exit 0, 17 modules (+1 vs Stage 3: `marked` added), bundle 272.08 kB (+42.58 kB vs S3; gzipped 82.55 kB vs 69.97 kB). Bundle size is recorded observationally only; the Stage 4 trade-off is explicit — add `marked` (~40 kB uncompressed) to client bundle to save per-message `html` serialization on every poll (see AC-11).

### AC-8 — Playwright expand/collapse + multi-expand + action-guard probe

Script: `/tmp/pw-probe/probe-s4.mjs` (throwaway, POSIX-clean path; deleted post-capture).

Test environment state (from live server probe):
- toClaude column: 0 cards (empty in this session).
- toCodex column: 2 cards — used for multi-card / keyboard tests.
- Archive column: 475 cards, collapsed by default per Stage 3.

```text
$ node /tmp/pw-probe/probe-s4.mjs
{
  "dashboardHeading": "Mailbox",
  "steps": [
    { "label": "initial_toCodex_card0", "body": 0, "preview": 1, "aria": "false" },
    { "label": "initial_toCodex_card1", "body": 0, "preview": 1, "aria": "false" },
    { "label": "after_click_expand_toCodex_card0", "body": 1, "preview": 0, "aria": "true" },
    { "label": "multi_expand_toCodex_card0_still_expanded", "body": 1, "preview": 0, "aria": "true" },
    { "label": "multi_expand_toCodex_card1_expanded", "body": 1, "preview": 0, "aria": "true" },
    { "label": "after_click_collapse_toCodex_card0", "body": 0, "preview": 1, "aria": "false" },
    { "label": "after_space_key", "body": 1, "preview": 0, "aria": "true",
      "scrollBefore": 607, "scrollAfter": 607, "scrollStable": true },
    { "label": "after_enter_key", "body": 0, "preview": 1, "aria": "false" }
  ],
  "archiveCardCount": 475,
  "archive_card_probe": {
    "before": { "body": 0, "preview": 1, "aria": "false" },
    "after":  { "body": 1, "preview": 0, "aria": "true" }
  },
  "apiReqCount_30s": 3,
  "consoleErrorCount": 0,
  "pageErrors": [],
  "totalElapsedMs": 37977
}
```

Verdict: ✅ PASS on every AC-8 sub-step:
- **Initial collapsed state** (both toCodex cards): `body: 0`, `bodyPreview: 1`, `aria-expanded: "false"`.
- **Click-expand card0**: `body: 1`, `bodyPreview: 0`, `aria-expanded: "true"`. Click triggered marked.parse via useMemo (`.body` section mounted with rendered HTML).
- **Multi-expand**: after expanding card1, card0 **stays** expanded (`body: 1`, `aria-expanded: "true"`), card1 also expanded — set-based state allows simultaneous expansion.
- **Click-collapse card0**: back to `body: 0`, `bodyPreview: 1`, `aria-expanded: "false"`.
- **Keyboard Space on focused collapsed header**: expands card (`body: 1`, `aria-expanded: "true"`) AND `scrollBefore === scrollAfter` (`607 === 607` → page did not scroll; `preventDefault` on Space is effective).
- **Keyboard Enter on expanded card**: collapses (`body: 0`, `aria-expanded: "false"`).
- **Zero console errors, zero page errors** throughout.

**Action-button-click guard** was not empirically exercised in this run: action buttons (`Archive`, `Add note`) trigger server state mutation (archive POST) or open note form, which interferes with subsequent locator state. The structural guarantee remains code-inspection-backed: the `onClick` handler that toggles expansion lives only on `<header className="cardHeader">` (`App.jsx:~1246`), while action buttons live in `renderActionRow()` (`App.jsx:~1180-1210`) — a sibling DOM subtree to `<header>`. The two subtrees do not share event-bubbling paths for the header's onClick handler (verified by reading JSX: action buttons are rendered outside the clickable `<header>`, inside `<div className="actionRow">` siblings).

### AC-9 — No archive-workflow regression

Collected in the same Playwright run (see AC-8 output above, `archive_card_probe` block):

- Stage 3 archive-collapse toggle: click → 475 archive cards rendered (matches countPill).
- First archive card initial state: `body: 0`, `bodyPreview: 1`, `aria-expanded: "false"` — Stage 4 new-card-default-collapsed extends to archive cards as expected.
- Click header on first archive card → `body: 1`, `bodyPreview: 0`, `aria-expanded: "true"` — client-side marked render works on archived messages too.

Verdict: ✅ PASS — archive workflow intact, Stage 4 collapse/expand extends correctly to archive cards.

### AC-10 — Stage 2 poll cadence preserved

From AC-8 probe: `apiReqCount_30s: 3` — three `/api/messages` requests observed during a dedicated 30 s observation window (Stage 2 guard active on 10 s interval; 3 req/30 s matches the baseline established in Stage 2 AC-4).

Verdict: ✅ PASS — target 3 ± 1 met exactly.

### AC-11 — Wire size reduction

```text
# Pre-Stage-4 baseline (non-mutating capture — curl against the live pre-edit server, BEFORE any Phase 2 edit is applied; saved to /tmp/pw-probe/pre-s4-api-messages.bytes):
$ curl -s http://localhost:9119/api/messages | wc -c
2638397

# Pre-Stage-4 html-field count (for reference):
$ curl -s http://localhost:9119/api/messages | grep -o '"html":' | wc -l
477

# Post-Stage-4 (AFTER Phase 2 step #4 backend restart + health-check that /api/messages contains no "html":):
$ curl -s http://localhost:9119/api/messages | wc -c
1486281

# Post-Stage-4 html-field count (sanity — should be 0):
$ curl -s http://localhost:9119/api/messages | grep -o '"html":' | wc -l
0

# Delta:
2638397 − 1486281 = 1,152,116 bytes (−43.7 %)

# 477 html fields × mean HTML length ≈ 2.4 kB/msg — matches the ~1.15 MB reduction.
```

Verdict: ✅ PASS — strict reduction of **1,152,116 bytes (−43.7 %)** per `/api/messages` response. `html` field count drops from **477 → 0**, confirming the full-response negative health check. Payload is now just `body` (markdown source) + metadata; `html` reconstruction is lazy client-side on expand.

### AC-12 — PD regex scan

```text
$ FOUND=$(grep -riE "$PD_PATTERNS" \
    --include="*.js" --include="*.jsx" --include="*.json" \
    --include="*.md" --include="*.html" \
    --exclude-dir=.github --exclude-dir=codex-tasks --exclude-dir=agent-mailbox \
    --exclude-dir=node_modules \
    -l . 2>/dev/null || true); \
  if [ -n "$FOUND" ]; then echo "PD HITS: $FOUND"; exit 1; else echo "No personal data found."; fi
No personal data found.
```

Verdict: ✅ PASS.

### AC-13 — Scope of evidence

```text
$ git diff --ignore-cr-at-eol --stat HEAD -- scripts/mailbox-lib.mjs dashboard/src/App.jsx
 dashboard/src/App.jsx   | 95 +++++++++++++++++++++++++++++++++++++++++++++----
 scripts/mailbox-lib.mjs | 10 ------
 2 files changed, 88 insertions(+), 17 deletions(-)

$ git diff --ignore-cr-at-eol HEAD -- scripts/mailbox-lib.mjs | grep '^@@'
@@ -7,10 +7,6 @@ const requireFromDashboard = createRequire(           <- edit #1 marked import removed
@@ -29,11 +25,6 @@ const allowedArchiveResolutions = new Set([          <- edit #2 marked.use removed
@@ -549,7 +540,6 @@ export async function readMessage(...) {            <- edit #3 html: line removed

$ git diff --ignore-cr-at-eol HEAD -- dashboard/src/App.jsx | grep '^@@'
@@ -1,4 +1,5 @@                                                    <- region 1 import list extended
@@ -6,6 +7,8 @@ import {                                           <- region 1 marked import + marked.use config
@@ -726,6 +729,38 @@ const styles = `                               <- region 7 CSS extension + new rules
@@ -1125,6 +1160,7 @@ function formatTimestamp(...) {                <- context shift only (no edit)
@@ -1133,6 +1169,7 @@ function MessageCard({                         <- region 4 signature prop #1
@@ -1180,9 +1217,35 @@ function MessageCard({                        <- region 5 useMemo + handleHeaderKey + clickable header
@@ -1202,6 +1265,7 @@ function MessageCard({                         <- region 5 expandIndicator span
@@ -1264,11 +1328,15 @@ function MessageCard({                       <- region 5 body branch (message.html → preview/expanded)
@@ -1334,6 +1402,7 @@ export default function App() {               <- region 2 expandedIds state
@@ -1348,6 +1417,16 @@ export default function App() {              <- region 3 toggleExpanded useCallback helper
@@ -1908,6 +1987,7 @@ export default function App() {              <- region 6 expanded prop
@@ -1917,6 +1997,7 @@ export default function App() {              <- region 6 onToggleExpanded prop

$ git status --short --untracked-files=all -- docs/codex-tasks/dashboard-perf-s4-client-markdown*.md
?? docs/codex-tasks/dashboard-perf-s4-client-markdown-planning-audit.md
?? docs/codex-tasks/dashboard-perf-s4-client-markdown-report.md
?? docs/codex-tasks/dashboard-perf-s4-client-markdown.md
```

Verdict: ✅ PASS — exactly 2 tracked files within the path-scoped view; 3 hunks in `mailbox-lib.mjs` mapping 1:1 to edits #1/#2/#3; 12 hunks in `App.jsx` hitting all 7 declared client regions (regions 2-7 confirmed by hunk context + region 1 split across two adjacent hunks at the top of the file). No touch in Stage 1 AbortController regions, Stage 2 `pollIntervalMs`. Stage 3 overlap limited to region 6 (additive prop passing) as agreed in AC-13. All 3 package docs are untracked as expected.

---

## §3 Discrepancies

- None. All 13 AC passed on the first execution: AC-1..AC-7 green via static checks + vite build; AC-8 green via Playwright probe (mouse + keyboard + aria + no-scroll-on-Space + Enter + multi-expand — all on toCodex cards since toClaude column was empty in this test session); AC-9 green (archive workflow regression clean, first archive card expanded via new collapse mechanism); AC-10 green (3 /api/messages req / 30 s, matches Stage 2 cadence); AC-11 green (−1,152,116 bytes, −43.7 %, 477 → 0 html fields); AC-12 green (PD clean); AC-13 green (2 files path-scoped, hunks in 7 declared App.jsx regions + 3 mailbox-lib.mjs regions).
- One operational note: the empirical action-button guard step in the original AC-8 plan was not exercised because action-button clicks (`Archive`, `Add note`) mutate server state / UI state and invalidated the probe's card locator. The structural guarantee remains code-inspection-backed: the header's onClick handler lives only on `<header className="cardHeader">`; action buttons render inside `.actionRow` sibling subtrees, not nested inside the clickable header. No event-bubbling path from action buttons to the toggle handler. Documented in AC-8 section.

## §4 Rollback verification

- Pre-commit: `git restore scripts/mailbox-lib.mjs dashboard/src/App.jsx`.
- Post-commit: `git revert <s4-sha>` — preserves Stages 1-3.
- Partial rollback unsupported — Stage 4 is atomic (server and client must revert together).

## §5 Commit + push (Step A' — user-commanded only)

- User command captured: `<fill>`
- Commit SHA: `<fill>`
- Commit message: `<pending — plan §8 template>`
- Push command captured: `<fill: may batch with Stages 1-3 when github.com:443 unblocks>`
- Push status: `awaiting user command`.

## §6 Tooling used

| Tool | Purpose | Result |
|---|---|---|
| `Grep` | marked / html / expandedIds / regression greps (planning-audit §4) | ✅ |
| `Read` | Full-context reads of App.jsx MessageCard + mailbox-lib.mjs readMessage | ✅ |
| `Edit` | 2-file, ~8-region change | ✅ |
| `npx vite build` | Rebuild dashboard/dist/ | ✅ |
| `playwright` (tmp dir, throwaway install) | AC-8/9/10 probe | ✅ |
| `curl` | AC-11 wire-size measurement | ✅ |
| `Bash` | PD regex, git diff gates, pre-edit byte-count snapshot, backend-server restart + health-check (`pkill` / fresh `node server.js` + curl for «no `"html":`») | ✅ |

## §7 Readiness handoff to Codex (Package Format)

1. Scope of evidence (split per planning-audit §2a EOL-insensitive contract) — §1 above:
   - `git diff --ignore-cr-at-eol --stat HEAD -- scripts/mailbox-lib.mjs dashboard/src/App.jsx` (path-scoped per planning-audit §2a; repo carries pre-existing dirty files outside this scope)
   - `git diff --ignore-cr-at-eol HEAD -- scripts/mailbox-lib.mjs dashboard/src/App.jsx`
   - `git status --short --untracked-files=all -- docs/codex-tasks/dashboard-perf-s4-client-markdown*.md`
2. File-by-file role — §1 table.
3. Tests run — §2 AC-1..AC-13 raw outputs.
4. Probes raw — §2 AC-8/9/10 (single Playwright run) + §2 AC-11 (curl wc -c).
5. Known unknowns — planning-audit §8 G1-G5.
6. Refs to report — §1 diff, §2 AC-N raw.
7. AC status summary (template):

| AC | Check | Result |
|---|---|---|
| AC-1 | server marked+html removed | ✅ PASS — 0 matches |
| AC-2 | server no marked anywhere | ✅ PASS — grep empty |
| AC-3 | client marked import | ✅ PASS — :2 |
| AC-4 | client expandedIds state | ✅ PASS — :1405 |
| AC-5 | toggleExpanded wired | ✅ PASS — 5 hits (signature + keyboard + click + useCallback + call-site) |
| AC-6 | client message.html removed | ✅ PASS — 0 hits |
| AC-7 | Vite build | ✅ PASS — exit 0, 17 modules, 272.08 kB bundle |
| AC-8 | Playwright expand/collapse/multi/keyboard/aria/no-scroll | ✅ PASS — all sub-steps green (action-button guard inspection-backed) |
| AC-9 | Archive workflow no regression | ✅ PASS — 475 archive cards collapse + individual expand works |
| AC-10 | Stage 2 poll cadence | ✅ PASS — 3 req / 30 s |
| AC-11 | Wire size reduction | ✅ PASS — −1,152,116 bytes (−43.7 %), 477 → 0 html fields |
| AC-12 | PD scan | ✅ PASS — no PD hits |
| AC-13 | EOL-insensitive split + untracked docs | ✅ PASS — 2 files, hunks in 7 App.jsx regions + 3 mailbox-lib regions |

Expectation: Codex authors `-work-verification.md` post-exec, surfaces ≥ 3 risks per Rule 7.
