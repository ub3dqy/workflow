# dashboard-perf-s5-ui-compact - Work Verification

**Stage**: 5 of 5 (retroactive)  
**Verifier**: Codex  
**Date**: 2026-04-23  
**Plan**: `docs/codex-tasks/dashboard-perf-s5-ui-compact.md`  
**Planning audit reviewed**: `docs/codex-tasks/dashboard-perf-s5-ui-compact-planning-audit.md`  
**Execution report reviewed**: `docs/codex-tasks/dashboard-perf-s5-ui-compact-report.md`

## Findings

1. No blocking code findings were identified in the landed Stage 5 implementation (`6040961`).
2. Process finding: Stage 5 was committed and pushed before the planned Codex review step, and the landed change crossed the package's stage-size discipline (`dashboard/src/App.jsx`, `+200/-180`). I do not recommend a retroactive revert-and-split absent a correctness defect, but it should be recorded as process debt rather than treated as a normal pre-reviewed stage.

## What I verified directly

### 1. The landed change matches the claimed single-file scope

```text
$ git show 6040961 --stat
 dashboard/src/App.jsx | 380 ++++++++++++++++++++++++++------------------------
 1 file changed, 200 insertions(+), 180 deletions(-)
```

The current task package accurately describes Stage 5 as a client-only change in `dashboard/src/App.jsx`.

### 2. The compact-card and unread-indicator edits are present, and the removed UI is actually gone

Direct inspection of `dashboard/src/App.jsx` confirms the core Stage 5 shape:

- `dashboard/src/App.jsx:664-674` adds `grid-auto-rows: min-content` and `align-content: start` to `.columnBody`.
- `dashboard/src/App.jsx:706-758` adds `min-width: 0` to `.card` plus `.card--collapsed`, `.cardTitleLine`, and `.unreadDot`.
- `dashboard/src/App.jsx:1246-1398` shows `showUnreadDot = !isArchived && !message.metadata?.received_at`, prepends the dot in the title line, and gates the rest of the card body behind one `expanded ? (...) : null` branch.
- `dashboard/src/App.jsx:1465-1474` builds `pendingReceivedMap` from both `messages.toClaude` and `messages.toCodex`.
- `dashboard/src/App.jsx:1937-1943` consumes that map to prepend the unread dot in the pending banner.

I also independently reproduced the contract-critical removals:

```text
$ git show 6040961:dashboard/src/App.jsx | grep -cE "refreshButton|refreshNow"
0

$ git show 6040961:dashboard/src/App.jsx | grep -cE "bodyPreview"
0
```

That closes the main Stage 5 claims: the refresh button is removed, the preview path is removed, the collapsed layout exists, and unread-state indicators are wired into both the message cards and the pending banner.

### 3. The unread-state implementation uses the correct mailbox field, not the misleading derived fallback

The implementation detail that matters most for correctness is the distinction between raw frontmatter `metadata.received_at` and the derived top-level `received_at` fallback:

- `scripts/mailbox-lib.mjs:529-543` shows `readMessage()` populating top-level `received_at` from `parsed.data.received_at ?? parsed.data.created`, while preserving the raw frontmatter under `metadata`.
- `scripts/mailbox-lib.mjs:604-625` shows `markMessageReceived()` writing a real `received_at` timestamp only when the field is absent.
- `dashboard/supervisor.mjs:156-170` shows `pendingIndex.received_at` being derived from `message.received_at`, which means unread messages still appear non-empty there because they fall back to `created`.

Because of that, using `metadata.received_at` in `MessageCard` and building `pendingReceivedMap` from `messages.toClaude` / `messages.toCodex` is the correct design. I did not find a correctness defect in the unread-dot logic.

### 4. Independent build verification is clean

```text
$ cd dashboard && npx vite build
vite v8.0.8 building client environment for production...
transforming...✓ 17 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  0.39 kB │ gzip:  0.27 kB
dist/assets/index-DWc-JHje.js  272.36 kB │ gzip: 82.58 kB

✓ built in 555ms
```

I reproduced a successful production build independently from Claude's report.

## Residual risks / gaps

1. I did not perform a verifier-side browser replay or visual diff in this pass, so final UI behavior still relies on code inspection plus Claude's screenshot-driven acceptance loop rather than independent interaction evidence.
2. The refresh button problem was avoided by removal, not diagnosed. That is acceptable for this stage only if loss of manual refresh is an intentional product tradeoff.
3. The unread-dot color remains a hard-coded literal (`#e07a00`) rather than a theme token. That is cosmetic debt, not a blocker.
4. `pendingReceivedMap` updates on the normal messages poll cadence, so the pending banner can lag read-state changes until the next successful poll. I treat that as expected polling latency, not a correctness regression.

## Verdict

Stage 5 is acceptable as landed. I do not see a code defect that justifies blocking the change or forcing a rollback, but I do consider the retroactive review path and oversize single-file commit a real process violation that should remain documented with the task package.
