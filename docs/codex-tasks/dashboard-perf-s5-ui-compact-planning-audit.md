# dashboard-perf-s5-ui-compact — Planning audit (retroactive)

**Stage**: 5 (retroactive — see §0 disclosure in `dashboard-perf-s5-ui-compact.md`)
**Package base commit**: `6040961` on `origin/master` (pushed).
**Previous stage base**: `ba52c4a` (Stage 4 — pre-rewrite SHA was `490b4e9`; filter-branch rewrite on 2026-04-22 changed all pre-s5 hashes).
**Audit mode**: Codex reviews Stage 5 as landed — no pre-exec planning existed. AC below are verification probes, not "what should be shipped".

---

## 0. Pre-exec research (retroactive record)

Evidence gathered while fixing, not before:

1. **`marked` v18 already client-side** — import at `dashboard/src/App.jsx:2` from Stage 4. No new dep added in S5.
2. **`metadata.received_at` semantics** — set explicitly by `markMessageReceived(filePath)` at `scripts/mailbox-lib.mjs:604-626` when an agent first reads a message via CLI. Absence of key in frontmatter == unread. `parsed.data.received_at` is the raw value; `readMessage` at `scripts/mailbox-lib.mjs:530-531` exposes a derived fallback on the top-level `received_at` (`parsed.data.received_at ?? parsed.data.created`) but preserves the raw frontmatter under `metadata:`. The client uses `metadata.received_at` — correct distinction.
3. **`pendingIndex` derivation** — `dashboard/supervisor.mjs:156-171` emits `received_at: message.received_at || ""` where `message.received_at` is the derived field. That field cannot distinguish read vs unread — it's always non-empty for unread messages (falls back to `created`). Therefore the pending-banner unread check must NOT use `pendingIndex[*].received_at`; it must cross-reference `messages.toClaude/toCodex[*].metadata.received_at`. The `pendingReceivedMap` useMemo in Stage 5 implements exactly this.
4. **`useEffectEvent` availability** — React 19.2.5 (per `dashboard/package.json:19`) exposes `useEffectEvent` as a stable export (`node -e "console.log(typeof require('react').useEffectEvent)"` → `function`). Per React docs, it is intended to be called from inside Effects; calling from event handlers "works" but carries a warning and weaker guarantees. Stage 5 removed the refresh button (which was the only direct event-handler call into a `useEffectEvent` helper; other call sites are Effects or inside other `useEffectEvent` wrappers). Unknown: whether that mis-use pattern is what caused the button's onClick to appear unresponsive to the user. Not diagnosed; button removed.
5. **Grid auto-row behavior** — default `grid-auto-rows` is `auto`, which sizes each row to max-content of its tracks. Explicit `min-content` is stricter — the row will not grow beyond its content even if the container has extra space. `align-content: start` packs rows to the start of the column body. Both are defensive and should not change the visual baseline when the column is full (archive case) but prevent any stretch in the sparse case (0-2 cards in agent columns).
6. **`--surface-column` vs `--surface-card` low contrast** — `:root` defines them as `rgba(255, 251, 243, 0.82)` and `rgba(255, 255, 255, 0.76)`; `[data-theme="dark"]` defines `rgba(36, 32, 28, 0.88)` / `rgba(45, 40, 34, 0.88)`. Visual delta is small in both themes. User noted the agent column "looks all one light field" — that is perceptual, not a bug in S5. Not addressed here.

## 1. Audit of the commit (`6040961`)

Raw `git show 6040961 --stat`:

```
dashboard/src/App.jsx | 380 ++++++++++++++++++++++++++------------------------
 1 file changed, 200 insertions(+), 180 deletions(-)
```

Sanity grep on the landed commit:

```bash
$ git show 6040961:dashboard/src/App.jsx | grep -cE "refreshButton|refreshNow"
0

$ git show 6040961:dashboard/src/App.jsx | grep -cE "unreadDot|card--collapsed|cardTitleLine|pendingReceivedMap"
11

$ git show 6040961:dashboard/src/App.jsx | grep -cE "bodyPreview"
0
```

Semantics confirmed: refresh button and `bodyPreview` gone; new classes present; `pendingReceivedMap` present.

## 2. Tool readiness

- **Vite dev server**: running on `127.0.0.1:9119` throughout exec (iterative HMR confirmed per edit; `curl dashboard:200` after each change).
- **Node syntax check**: not meaningful for JSX (`node --check` rejects `.jsx`). Substitute: `npx vite build` run once post-exec — clean output, `dist/assets/index-mTJuR5PV.js  272.35 kB`.
- **PD regex scan**: run pre-commit per CLAUDE.md Rule 10; clean (exit 1, 0 matches outside `.github/workflows/ci.yml`).
- **No Playwright / visual-regression probe** — roadmap never provisioned it for S5, and the original 4-stage roadmap said «If after Stage 4 perf target unmet — trigger Stage 5 planning cycle» (not pre-committed). S5 shipped without that provisioning.

## 3. Dependencies + security posture

- No new npm deps.
- `marked` trust model unchanged (still unsanitized → `dangerouslySetInnerHTML`, per Stage 4 decision; same mailbox-writer trust model — local Claude + Codex CLI only, not untrusted web input).
- `#e07a00` color literal — no cross-origin fetch, no user-controlled string fed to CSS; safe.
- `title={t.notRead}` + `aria-label={t.notRead}` on `<span className="unreadDot">` — derived from static translation table, no injection surface.
- `pendingReceivedMap` — `Map` keyed on `message.relativePath` (already mailbox-validated; not user input).

## 4. Acceptance Criteria (probes for Codex to run against `6040961`)

| AC | Description | Probe | Expected |
|---|---|---|---|
| AC-1 | No `refreshButton` / `refreshNow` left in bundle | `git show 6040961:dashboard/src/App.jsx \| grep -cE "refreshButton\|refreshNow"` | `0` |
| AC-2 | `bodyPreview` class removed (JSX + CSS) | `git show 6040961:dashboard/src/App.jsx \| grep -cE "bodyPreview"` | `0` |
| AC-3 | Collapsed card renders only the header; all detail gated by `expanded` | Inspect `dashboard/src/App.jsx` around line 1292: `{expanded ? (<> cardMeta + cardFilename + cardTimestamps + relatedFiles + renderActionRow + body + noteForm </>) : null}`. Confirm NO code outside this fragment renders those six sub-blocks. | Single `expanded ?` gate wraps all six. |
| AC-4 | `cardTags` (status/project chips) also gated by `expanded` | Grep the file for `cardTags` — should appear inside an `expanded ? (` branch. | 1 JSX hit, gated. |
| AC-5 | `.card--collapsed` sets reduced padding, no threadTitle margin, nowrap+ellipsis on title | `git show 6040961:dashboard/src/App.jsx \| grep -E "card--collapsed" -A 6` | 4 rules: padding 10/14, cardHeader margin-bottom 0, threadTitle margin 0 + nowrap + overflow hidden + text-overflow ellipsis, cardHeading overflow hidden. |
| AC-6 | `.unreadDot` + `.cardTitleLine` CSS present and sane | Grep for `.unreadDot` and `.cardTitleLine`. | `.unreadDot` 8×8 px circle, `#e07a00`, `flex-shrink: 0`. `.cardTitleLine` flex+gap+min-width:0. |
| AC-7 | Unread dot logic: dot only when `!isArchived && !metadata.received_at` | Read MessageCard: `const showUnreadDot = !isArchived && !message.metadata?.received_at;` and the JSX `{showUnreadDot ? <span className="unreadDot" …/> : null}` | Both present exactly once. |
| AC-8 | `pendingReceivedMap` constructed from `messages.toClaude ∪ messages.toCodex` | Grep `pendingReceivedMap`. | `useMemo` with both buckets, Map.set per relativePath. |
| AC-9 | Pending banner consumes the map to emit dot | Grep `<li>` render inside `runtimeList.map` — should have `!pendingReceivedMap.get(…)` check + `<span className="unreadDot"…/>` prepended. | Present. |
| AC-10 | Duplicate `renderActionRow()` removed | Grep `renderActionRow\(\)` in the file. | `1` JSX call-site (inside expanded fragment), plus the helper definition (line ~1189). Total 2 occurrences, not 3. |
| AC-11 | `.columnBody` has `grid-auto-rows: min-content` + `align-content: start` | Grep `.columnBody` block. | Both properties present. |
| AC-12 | `.card` has `min-width: 0` but NOT `overflow: hidden` | Grep `.card {` block. | `min-width: 0` present, no `overflow: hidden` in the base `.card` rule (absent deliberately — tried, reverted because it clipped archive titles vertically). |
| AC-13 | `npx vite build` clean | `cd dashboard && npx vite build` | Succeeds, no errors, 1 JS asset produced. |
| AC-14 | PD scan clean | CI regex `dmaka\|ONLYHOME\|bitfighter\|bitfighterfox\|olynapros` with CI exclusions against repo at `6040961`. | 0 hits outside `.github/workflows/ci.yml`. |
| AC-15 | Commit metadata sane | `git show 6040961 --stat` | 1 file, +200/−180, title `feat(dashboard): compact collapsed cards + unread indicator`. |

**Scope boundary**: AC-1 through AC-15 cover Stage 5 code. Anything outside `dashboard/src/App.jsx` is out-of-scope for this stage.

## 5. Out of scope (explicit)

- **Dashboard capability to compose/reply from the UI** — no `app.post(…note|archive)` handler invoked by a visible form element was added. Existing note form + archive button (inside expanded) behave as before.
- **Supervisor `pendingIndex` schema change** — deliberately did NOT add `read_at` or similar field to `pendingIndex`. Client cross-references `messages.*.metadata.received_at` instead (§0.3 above).
- **Theme-token for the dot color** — hard-coded `#e07a00`; no `--unread-dot-bg` variable.
- **Visual regression test** — no Playwright / screenshot diff.
- **Focus-outline audit on the new header interaction** — no automated a11y test.
- **Fix / diagnose the refresh-button onClick bug** — skipped in favor of removal.
- **All Rule-#8 stage-size discipline** — explicitly violated in this stage (~200 LOC). See §0 of the brief.

## 6. Rollback plan

```
git revert 6040961
git push origin master
```

Single commit, single file. No migrations, no data touched. User-visible effect: restores Stage 4 UI (dense cards, duplicate action row, refresh button back, no unread dot anywhere, column-overflow complaint re-opens).

## 7. Adversarial bait for Codex review (suggested risks to formulate around)

Codex is expected to produce ≥3 independent findings per Rule #7. Candidate risks, not an exhaustive list — do not anchor on these:

1. `min-content` + `align-content: start` on `.columnBody` may change layout in some edge case (very-narrow viewport, mobile breakpoint near `:1042` media query) where previously the rows auto-sized differently.
2. `pendingReceivedMap` has a stale window: between `/api/messages` tick (which updates `metadata.received_at`) and the derived map rebuild. Not a correctness bug — just a polling-window latency — but worth explicit mention.
3. `showUnreadDot` evaluates `!message.metadata?.received_at` — falsy on `undefined` AND on explicit `""`. The mailbox-lib protocol only ever writes an ISO timestamp string to the field (non-empty), so `""` shouldn't appear in practice, but a defensive `typeof m.metadata?.received_at === "string" && m.metadata.received_at.length > 0` would harden.
4. Removing the refresh button closed the user's direct re-fetch lever. If polling stalls (network hiccup, supervisor pause), there is no manual nudge. Polling's existing AbortController guard (Stage 1) handles most such cases but not all.
5. Commit crosses the Rule-#8 size threshold (~200 LOC). Codex may reasonably refuse to verify as-is and request a split into 3 logical mini-commits (visual restructure / refresh-button removal / unread-dot + pendingReceivedMap). That is a process finding, not a code finding.
6. `.card--collapsed .cardHeading { overflow: hidden }` combined with `.card--collapsed .threadTitle { overflow: hidden; text-overflow: ellipsis }` — redundant double overflow: hidden on a nested container. Works but smells.
