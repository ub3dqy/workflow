# dashboard-perf-s4 - Work Verification

**Stage**: 4 of 4  
**Verifier**: Codex  
**Date**: 2026-04-22  
**Plan**: `docs/codex-tasks/dashboard-perf-s4-client-markdown.md`  
**Execution report reviewed**: `docs/codex-tasks/dashboard-perf-s4-client-markdown-report.md`

## Findings

No blocking findings were identified in the Stage 4 implementation.

## What I verified directly

### 1. Change scope still matches the agreed two-file contract

```text
$ git diff --ignore-cr-at-eol --stat HEAD -- scripts/mailbox-lib.mjs dashboard/src/App.jsx
 dashboard/src/App.jsx   | 95 +++++++++++++++++++++++++++++++++++++++++++++----
 scripts/mailbox-lib.mjs | 10 ------
 2 files changed, 88 insertions(+), 17 deletions(-)
```

That reproduces the path-scoped scope claim from the execution report: only the planned server/client pair is touched in tracked code.

### 2. Server-side `html` generation is gone, client-side wiring is present

```text
$ grep -cE 'marked|\.html\b' scripts/mailbox-lib.mjs
0
```

```text
$ grep -n '^import.*marked\|message\.html\|const \[expandedIds, setExpandedIds\]\|onToggleExpanded\|toggleExpanded' dashboard/src/App.jsx
2:import { marked } from "marked";
1172:  onToggleExpanded,
1235:      onToggleExpanded(message.relativePath);
1246:        onClick={() => onToggleExpanded(message.relativePath)}
1405:  const [expandedIds, setExpandedIds] = useState(() => new Set());
1421:  const toggleExpanded = useCallback((relPath) => {
2000:                            onToggleExpanded={toggleExpanded}
```

These checks close the contract-critical shape:

- `scripts/mailbox-lib.mjs` no longer contains `marked` or `.html`.
- `dashboard/src/App.jsx` imports `marked`, owns `expandedIds`, defines `toggleExpanded`, and passes the expand handler into `MessageCard`.
- `message.html` is no longer referenced on the client.

I also read the current `MessageCard` implementation directly:

- clickable header + keyboard handler live at `dashboard/src/App.jsx:1241-1248`
- preview / expanded body branch lives at `dashboard/src/App.jsx:1331-1340`
- `expandedIds` state + `toggleExpanded` helper live at `dashboard/src/App.jsx:1405-1428`
- prop passing at the render site lives at `dashboard/src/App.jsx:1987-2000`

That matches the planned 7-region App.jsx model.

### 3. Independent build reproduction is clean

```text
$ cd dashboard && npx vite build
vite v8.0.8 building client environment for production...
transforming...✓ 17 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  0.39 kB │ gzip:  0.27 kB
dist/assets/index-DZcIQUxA.js  272.09 kB │ gzip: 82.55 kB

✓ built in 520ms
```

The build succeeds independently in my pass. The asset hash differs from Claude's report, but the semantic result is consistent:

- 17 modules transformed
- ~272 kB uncompressed bundle
- ~82.55 kB gzip bundle

### 4. Reported residual risks are real but not blockers

I checked the main adversarial angles Claude flagged:

- **Empty live-column coverage**: the execution report explicitly says `toClaude` was empty in the empirical probe, so one live-column branch remains unexercised by automation in this run.
- **Action-button guard**: the report correctly downgrades this from probe-backed to inspection-backed. Reading `MessageCard` confirms the expand toggle is attached only to the `<header>`, while action buttons are rendered by `renderActionRow()` outside that header subtree.
- **Security posture**: Stage 4 still feeds `marked.parse(...)` into `dangerouslySetInnerHTML`; that is unchanged in trust model, not a newly introduced hardening regression.
- **Bundle growth trade-off**: the client bundle grew to ~272 kB, but that comes with the measured per-poll API reduction documented in the execution report.

## Residual risks / gaps

1. I did not independently rerun the Playwright probe from the verifier side in this pass, so runtime interaction evidence for expand/collapse, keyboard handling, and archive-card behavior still relies on Claude's raw probe output plus my code inspection.
2. The empty `toClaude` live-column branch was not exercised in the executor's browser probe; only the `toCodex` live column had cards available for multi-card interaction checks in this session.
3. The action-button guard remains inspection-backed rather than empirically re-executed in verification. I agree with Claude's reasoning that the DOM structure isolates the header click handler, but it is still one step short of direct probe evidence.
4. Security posture is intentionally unchanged, not improved: `marked` output still flows into `dangerouslySetInnerHTML` without DOMPurify. That is an accepted tradeoff for this stage, but it remains the main long-term hardening gap.
5. The client bundle increase is real. I do not treat it as a defect because the measured API shrink is much larger, but it should still be considered part of the trade-off if later stages target cold-load size.

## Verdict

Stage 4 is acceptable as implemented. I did not find a code or contract defect that should block the user from reviewing the result or issuing a commit command.
