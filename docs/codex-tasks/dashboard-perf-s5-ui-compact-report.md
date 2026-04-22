# dashboard-perf-s5-ui-compact — Execution report (retroactive)

**Stage**: 5 (retroactive — see §0 of brief). **Commit**: `6040961`. **Branch**: `master` → `origin/master` (pushed).
**Executor**: Claude. **Report mode**: post-hoc — code landed before any artifact existed.

---

## 1. git diff --stat

```
$ git show 6040961 --stat
commit 60409612c47338b55fb107be1e8656173e2f652c
Author: UB3DQY <ub3dqy@mail.ru>
Date:   Thu Apr 23 00:55:37 2026 +0300

    feat(dashboard): compact collapsed cards + unread indicator

 dashboard/src/App.jsx | 380 ++++++++++++++++++++++++++------------------------
 1 file changed, 200 insertions(+), 180 deletions(-)
```

Single file, `dashboard/src/App.jsx`. No changes outside the client bundle.

## 2. File-by-file role

| File | Role | Nature |
|---|---|---|
| `dashboard/src/App.jsx` | UI-only | JSX restructure of `MessageCard` (collapse gate broadened to wrap all sub-blocks including chips); new `showUnreadDot` + `<div className="cardTitleLine">` in header; removal of duplicate `renderActionRow()` call and `bodyPreview` useMemo/JSX/CSS; new `pendingReceivedMap` useMemo at root `App` render; unread-dot rendering in `runtimeList` pending banner; new CSS rules `.card--collapsed*`, `.cardTitleLine`, `.unreadDot`, plus `min-width:0` on `.card` and `grid-auto-rows: min-content; align-content: start` on `.columnBody`; removal of refresh button JSX + all `.refreshButton` CSS rules + `refreshNow` translation keys (both `ru` + `en`). |

No server, no supervisor, no build config, no deps, no CI touched.

## 3. Probes (raw output)

### V1 — commit metadata

```
$ git show 6040961 --stat
commit 60409612c47338b55fb107be1e8656173e2f652c
Author: UB3DQY <ub3dqy@mail.ru>
Date:   Thu Apr 23 00:55:37 2026 +0300

    feat(dashboard): compact collapsed cards + unread indicator
```

### V2 — refresh button fully removed

```
$ git show 6040961:dashboard/src/App.jsx | grep -cE "refreshButton|refreshNow"
0
```

### V3 — `bodyPreview` fully removed

```
$ git show 6040961:dashboard/src/App.jsx | grep -cE "bodyPreview"
0
```

### V4 — new classes + helpers present

```
$ git show 6040961:dashboard/src/App.jsx | grep -cE "unreadDot|card--collapsed|cardTitleLine|pendingReceivedMap"
12
```

### V5 / V6 — `renderActionRow` exactly one JSX call-site

```
$ git show 6040961:dashboard/src/App.jsx | grep -cE "renderActionRow"
2    # 1 helper definition + 1 JSX call

$ git show 6040961:dashboard/src/App.jsx | grep -cE "\{renderActionRow\(\)\}"
1    # exactly one call-site (duplicate was removed)
```

### V7 — `.card` has `min-width: 0` and no `overflow: hidden`

```
$ git show 6040961:dashboard/src/App.jsx | awk '/^  \.card \{/,/^  \}/' | grep -E "min-width|overflow"
    min-width: 0;
```

Only `min-width: 0` present. No `overflow` line inside the `.card` base rule.

### V8 — `.columnBody` has defensive grid sizing

```
$ git show 6040961:dashboard/src/App.jsx | awk '/^  \.columnBody \{/,/^  \}/' | grep -E "grid-auto-rows|align-content"
    grid-auto-rows: min-content;
    align-content: start;
```

### V9 — `npx vite build` clean

```
$ cd dashboard && npx vite build
vite v8.0.8 building client environment for production...
✓ 17 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  0.39 kB │ gzip:  0.27 kB
dist/assets/index-mTJuR5PV.js  272.35 kB │ gzip: 82.57 kB
✓ built in 339ms
```

### V10 — dashboard + API live

```
$ curl -s -o /dev/null -w 'dashboard:%{http_code}\n' http://127.0.0.1:9119/
dashboard:200
$ curl -s -o /dev/null -w 'api:%{http_code}\n' http://127.0.0.1:3003/api/messages
api:200
```

### V11 — PD regex scan clean (CI parity)

```
$ grep -riE "dmaka|ONLYHOME|bitfighter|bitfighterfox|olynapros" \
    --include="*.js" --include="*.jsx" --include="*.json" \
    --include="*.md" --include="*.html" \
    --exclude-dir=.github --exclude-dir=codex-tasks \
    --exclude-dir=agent-mailbox --exclude-dir=node_modules \
    --exclude-dir=.git --exclude-dir=dist \
    -l . 2>/dev/null; echo "exit:$?"
exit:1
```

Zero matches outside whitelist.

### V12 — user-visual sign-off log (informal)

User iteratively approved the UI via screenshots during the session: `000807`, `000815`, `000132`, `000212`, `002554`. Final state accepted with «отлично теперь комит и пуш». No automated visual probe was captured — noted as known unknown.

## 4. Acceptance Criteria status

| AC | Description | Probe | Result |
|---|---|---|---|
| AC-1 | No `refreshButton` / `refreshNow` in bundle | V2 | ✅ PASS (`0` matches) |
| AC-2 | `bodyPreview` class removed | V3 | ✅ PASS (`0` matches) |
| AC-3 | Collapsed card renders only the header; details gated by `expanded` | Read-code in §2 + V4 count | ✅ PASS — single `{expanded ? (<>…</>) : null}` at line ~1292 wraps `cardMeta + cardFilename + cardTimestamps + relatedFiles + renderActionRow + body + noteForm`. |
| AC-4 | `cardTags` chips gated by `expanded` | Read-code: JSX block at ~1270 `{expanded ? (<div className="cardTags">…</div>) : null}` | ✅ PASS |
| AC-5 | `.card--collapsed` reduced padding + title tightening | `grep -E "card--collapsed" -A 6` inside file | ✅ PASS — 4 rules present (padding 10/14, cardHeader margin 0, threadTitle margin+nowrap+ellipsis, cardHeading overflow) |
| AC-6 | `.unreadDot` + `.cardTitleLine` present + sane | Grep | ✅ PASS — 8×8 px circle `#e07a00` `flex-shrink: 0`; `.cardTitleLine` flex+gap+min-width 0 |
| AC-7 | Unread-dot logic `!isArchived && !metadata.received_at` | Read-code: `const showUnreadDot = !isArchived && !message.metadata?.received_at;` + `{showUnreadDot ? <span className="unreadDot" …/> : null}` | ✅ PASS |
| AC-8 | `pendingReceivedMap` built from `toClaude ∪ toCodex` | Read-code around line ~1465: `useMemo(() => { const map = new Map(); for (const m of messages.toClaude) map.set(m.relativePath, Boolean(m.metadata?.received_at)); for (const m of messages.toCodex) map.set(…); return map; }, [messages.toClaude, messages.toCodex]);` | ✅ PASS |
| AC-9 | Pending banner consumes the map | Read-code ~1937: `{runtimeState.pendingIndex.map((message) => { const isUnread = !pendingReceivedMap.get(message.relativePath); return <li>{isUnread ? <span className="unreadDot"…/> : null}…</li>; })}` | ✅ PASS |
| AC-10 | Duplicate `renderActionRow()` call removed | V5 + V6 | ✅ PASS — 1 JSX call-site, 2 total occurrences (call + helper) |
| AC-11 | `.columnBody` has `grid-auto-rows: min-content` + `align-content: start` | V8 | ✅ PASS |
| AC-12 | `.card` has `min-width: 0` but NOT `overflow: hidden` | V7 | ✅ PASS |
| AC-13 | `npx vite build` clean | V9 | ✅ PASS |
| AC-14 | PD scan clean | V11 | ✅ PASS (exit 1, 0 matches) |
| AC-15 | Commit metadata sane | V1 | ✅ PASS — 1 file, +200/−180, title matches |

**All 15 ACs PASS against `6040961`.**

## 5. Known unknowns

- **No Playwright / automated visual-regression** run. User-visual acceptance only (screenshots in §3 V12).
- **Refresh-button onClick root cause** — never diagnosed; button removed instead. If Codex wants a bug-report-quality explanation, it will need fresh investigation on a branch that restores the button.
- **Theme-token discipline** — `#e07a00` is a literal, not a `var(--unread-dot-bg)` CSS variable. Cosmetic only.
- **Single-card-column stretch** — I verified via code-reading that `grid-auto-rows: min-content` + `align-content: start` prevent row-stretch, but did not capture a pre/post screenshot showing the single-card case at actual content height. Defensive edit — if it's a no-op visually in some themes / breakpoints, that's fine; if it changes layout somewhere, Codex should flag.
- **Redundancy smell** — `.card--collapsed .cardHeading { overflow: hidden }` + `.card--collapsed .threadTitle { overflow: hidden; text-overflow: ellipsis }`: the outer `overflow: hidden` on `cardHeading` is belt-and-braces; title already self-trims. Works but could be tightened to one level.

## 6. Rule-#8 size violation (self-report)

Commit is +200/−180 on one file, crossing the roadmap's «~50 LOC per stage» guideline. Root cause: scope grew during screenshot-driven iteration without a pre-stage plan. Logically the commit is three concerns:

1. **Visual restructure** — collapse gate broadened, strip styling, grid defensive sizing, overflow fix (~120 LOC of the change).
2. **Refresh-button removal** — JSX + CSS + translations (~40 LOC).
3. **Unread-dot feature** — `showUnreadDot` + `.unreadDot` CSS + `pendingReceivedMap` useMemo + pending-banner consumer (~40 LOC).

A cleaner landing would have been three commits. Codex is within rights to flag this as a process finding. Fix would be `git revert 6040961` + re-land as `6040961a`, `6040961b`, `6040961c` with the split. Not done preemptively; awaiting Codex call on whether split is worth the churn for a landed commit.

## 7. Rollback

```
git revert 6040961
git push origin master
```

Single commit, single file; rollback reverts user-visible UI to Stage 4 but re-introduces the duplicate action-row bug and the broken refresh button. Not recommended unless Codex finds a correctness issue.
