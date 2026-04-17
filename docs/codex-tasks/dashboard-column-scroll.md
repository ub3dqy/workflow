# Dashboard Column Scroll — Execution Plan

**Version**: v1 (2026-04-17)
**Planning-audit**: `docs/codex-tasks/dashboard-column-scroll-planning-audit.md`

---

## Why

Dashboard три колонки (Для Claude / Для Codex / Архив) растут vertically без ограничений. При 7+ archived messages (current state) — page scroll становится awkward: чтобы перейти от одной колонки к другой, нужно prокручивать весь body. User ожидает independent scroll per column.

**Fix**: `.column` gets bounded `max-height: calc(100vh - offset)`, становится flex container; `.columnBody` gets `overflow-y: auto; flex: 1`. Sticky `.columnHeader`. Pure CSS, zero JSX changes, zero dependencies.

---

## Иерархия источников правды

1. Real state `dashboard/src/App.jsx` CSS rules — primary
2. Live dashboard visual probe — secondary
3. This plan — third
4. Discrepancy-first

---

## Doc Verification

**§V — N/A**: standard CSS features (overflow-y, flex, calc, viewport units). Per planning-audit §4 honest flag — no context7 fetch needed. If Codex wants confirmation, fetch MDN `overflow` + `flex` docs (optional, не required).

---

## Pre-flight

1. Environment + HEAD (`git log --oneline -1`; expected `a29b590 docs: fix read-only...`, drift → record)
2. Working tree `git status --short` — expected baseline на 2026-04-17:
   - `M scripts/mailbox.mjs` — pre-existing, preserved out-of-scope per Whitelist
   - `?? docs/codex-tasks/dashboard-column-scroll{,-planning-audit,-report}.md` — этот handoff (untracked until user stages)
   - `.codex`, launchers — уже tracked или gitignored через прошлые коммиты
   
   Record observed; STOP only на unexpected production mods beyond `scripts/mailbox.mjs`.
3. `wc -l dashboard/src/App.jsx` — record baseline line count (for post-change diff stat sanity)
4. Target CSS rules unchanged (pre-edit diff empty or CRLF only): `git diff -w -- dashboard/src/App.jsx`
5. Dashboard runnable: verify `cd dashboard && timeout 5 node server.js` starts. Can skip если already running.
6. WORKFLOW_ROOT probe

STOP на unexpected production mods.

---

## Whitelist

### Modify

| # | Path | What |
|---|------|------|
| W1 | `dashboard/src/App.jsx` | CSS rules (inside template literal, ~lines 497-546): (a) `.column` convert к flex column layout + add bounded `max-height`; (b) `.columnHeader` add `flex-shrink: 0`; (c) `.columnBody` add `overflow-y: auto; flex: 1`. Media query @1280px inherits automatically или получает slight adjustment. |

### НЕ трогать

- JSX structure (lines 1436-1472) — no changes needed, CSS-only fix
- All other CSS rules
- `server.js`, `scripts/*.mjs`, all non-App.jsx files
- `package.json`, `package-lock.json` — no new deps
- Themes, tokens, colors — preserved
- Historical handoff artifacts

---

## Changes

### Change 1 — `.column` flex layout + bounded max-height

**File**: `dashboard/src/App.jsx`, CSS block around line 507.

**Current (lines 507-514)**:
```css
.column {
  min-height: 420px;
  border: 1px solid var(--border-soft);
  border-radius: 24px;
  background: var(--surface-column);
  box-shadow: var(--shadow-column);
  overflow: hidden;
}
```

**Target**:
```css
.column {
  min-height: 420px;
  max-height: calc(100vh - 240px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-soft);
  border-radius: 24px;
  background: var(--surface-column);
  box-shadow: var(--shadow-column);
  overflow: hidden;
}
```

**Rationale**:
- `max-height: calc(100vh - 240px)` — bounds column к viewport-relative height. Offset 240px = approx hero (title+subhead ~130px) + toolbar-gap (~30px) + section-margin (~20px) + bottom padding (40px) + some slack. Codex visual probe may adjust ±40px if looks off.
- `display: flex; flex-direction: column` — enables child `.columnBody` к fill remaining space после header.
- `overflow: hidden` preserved на parent (child scrolls, not parent).

### Change 2 — `.columnHeader` sticky-at-top

**Current (lines 516-524)**: flexbox header с padding. Нет `flex-shrink`.

**Target**: добавить `flex-shrink: 0` чтобы header не squishilся при tall content:

```css
.columnHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--surface-header);
}
```

**Rationale**: flex-shrink default = 1. Without explicit `0`, tall child может compress header. Safe guard.

### Change 3 — `.columnBody` scrollable

**Current (lines 542-546)**:
```css
.columnBody {
  display: grid;
  gap: 14px;
  padding: 16px;
}
```

**Target**:
```css
.columnBody {
  display: grid;
  gap: 14px;
  padding: 16px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}
```

**Rationale**:
- `overflow-y: auto` — scrollbar appears только when content exceeds container height. No scrollbar для short lists.
- `flex: 1` — expand к fill remaining space under header.
- `min-height: 0` — critical для flex children containing overflowing content (без этого flex child defaults `min-height: auto` = content-sized, overflow-y ignored).

---

## Verification phases

### Phase 1 — Codex self-check

| # | Test | Expected |
|---|------|----------|
| V1 | `.column` block has `max-height: calc(100vh` + `display: flex` | scoped sed extraction of `.column { ... }` block, grep both tokens found |
| V2 | `.columnBody` block has `overflow-y: auto` + `flex: 1` + `min-height: 0` | scoped sed extraction of `.columnBody { ... }` block, grep all three tokens found |
| V3 | `.columnHeader` block has `flex-shrink: 0` | scoped sed extraction of `.columnHeader { ... }` block (the block at line ~516, not other `.columnHeader h2` or similar), grep token found |
| V4 | No JSX changes | `git diff dashboard/src/App.jsx` — only CSS template literal region (near lines 500-550) affected |
| V5 | Dashboard starts cleanly после change | `cd dashboard && timeout 10 node server.js` → "Server listening" |
| V6 | Vite hot-reload не breaks (build still works) | `cd dashboard && npx vite build` exit 0 |
| V7 | Live visual probe (optional — requires Playwright/python) | If env has python3+playwright: screenshot shows bounded columns с scroll. Если нет — skip, mark `[awaits user]` в report, defer к Phase 2 |
| V8 | Narrow viewport probe (optional — same env dependency) | Same as V7 + viewport 1200x800. Если env не supports — skip, `[awaits user]` |
| V9 | PD scan | dynamic `$PD_PATTERNS` — zero matches |
| V10 | No abs path leak | per-pattern scan |

**Executable commands**:

```bash
# V1 — Scoped check .column block only (avoid false matches from other CSS rules)
cd "$WORKFLOW_ROOT"
sed -n '/^  \.column {$/,/^  }$/p' dashboard/src/App.jsx | grep -E "max-height: calc\(100vh|display: flex"
# Expect 2 lines: max-height:... AND display: flex

# V2 — Scoped check .columnBody block only
cd "$WORKFLOW_ROOT"
sed -n '/^  \.columnBody {$/,/^  }$/p' dashboard/src/App.jsx | grep -E "overflow-y: auto|flex: 1|min-height: 0"
# Expect 3 lines

# V3 — Scoped check .columnHeader block only (not .columnHeader h2 etc.)
cd "$WORKFLOW_ROOT"
sed -n '/^  \.columnHeader {$/,/^  }$/p' dashboard/src/App.jsx | grep "flex-shrink: 0"
# Expect 1 line

# V4 — JSX unchanged (diff only in CSS region)
cd "$WORKFLOW_ROOT"
git diff -w -- dashboard/src/App.jsx | grep -E "^[+-]" | grep -vE "^[+-]{3}" | head -25

# V5 — Dashboard starts
cd "$WORKFLOW_ROOT/dashboard"
timeout 10 node server.js 2>&1 | head -3

# V6 — Vite build passes
cd "$WORKFLOW_ROOT/dashboard"
npx vite build 2>&1 | tail -10

# V7/V8 — OPTIONAL visual probe. Runs ONLY if Codex env has python3 + playwright.
# Env check first:
which python3 && python3 -c "import playwright" 2>&1 && echo "PLAYWRIGHT AVAILABLE" || echo "SKIP V7/V8 — env missing python3/playwright; defer к Phase 2 user visual check"

# If PLAYWRIGHT AVAILABLE — run probes:
#   cat > /tmp/scroll-probe.py << 'EOF'
#   from playwright.sync_api import sync_playwright
#   with sync_playwright() as p:
#       b = p.chromium.launch(headless=True)
#       for w, label in [(1440, "wide"), (1200, "narrow")]:
#           page = b.new_page(viewport={"width":w,"height":800})
#           page.goto("http://127.0.0.1:9119", wait_until="domcontentloaded")
#           page.wait_for_selector(".column", timeout=15000)
#           page.wait_for_timeout(2000)
#           page.screenshot(path=f"/tmp/scroll-{label}.png", full_page=False)
#       b.close()
#   EOF
#   python3 /tmp/scroll-probe.py
#   ls -la /tmp/scroll-wide.png /tmp/scroll-narrow.png
# Если env does NOT have python3 + playwright: mark V7/V8 как `[awaits user]` в report §2,
# acceptance не требует V7/V8 если tooling отсутствует. User проверит в browser manually (Phase 2).

# V9 — PD scan (dynamic extraction)
cd "$WORKFLOW_ROOT"
PD_PATTERNS=$(grep -oP '(?<=PD_PATTERNS: ).*' .github/workflows/ci.yml)
grep -riE "$PD_PATTERNS" --include="*.js" --include="*.jsx" --include="*.json" --include="*.md" --include="*.html" --exclude-dir=.github -l .

# V10 — Absolute path leak
cd "$WORKFLOW_ROOT"
grep -n "/mnt/" dashboard/src/App.jsx
grep -n "E:\\\\" dashboard/src/App.jsx
grep -n "C:\\\\Users" dashboard/src/App.jsx
```

### Phase 2 — `[awaits user]`

- P2.1 — User refresh dashboard visually confirms independent column scroll on wide viewport
- P2.2 — User tests narrow viewport (mobile / 1200px), confirms graceful scroll behavior

### Phase 3 — `[awaits N-day]`

- P3.1 — 7-day observation: no user reports of UX regressions

---

## Acceptance

- [ ] `dashboard/src/App.jsx` `.column` has `max-height: calc(100vh - 240px)` + `display: flex` + `flex-direction: column`
- [ ] `dashboard/src/App.jsx` `.columnBody` has `overflow-y: auto` + `flex: 1` + `min-height: 0`
- [ ] `dashboard/src/App.jsx` `.columnHeader` has `flex-shrink: 0`
- [ ] No JSX changes
- [ ] Dashboard starts (V5 ✅)
- [ ] Vite build passes (V6 ✅)
- [ ] V7/V8 visual probes (optional): either screenshots attached OR `[awaits user]` note (if python3/playwright unavailable в Codex env). Not mandatory for acceptance — user does browser check Phase 2.
- [ ] PD scan clean (V9)
- [ ] Path leak clean (V10)

---

## Out of scope

- JSX restructuring
- New dependencies (react-window etc.)
- Theme/color changes
- Mobile-specific layout overhaul (current responsive breakpoint preserved)
- Scroll position persistence между refreshes
- Scrollbar styling (native scrollbar acceptable)
- Tests infrastructure
- Automatic git commit/push

---

## Rollback

```bash
cd "$WORKFLOW_ROOT"
git checkout HEAD -- dashboard/src/App.jsx
```

---

## Discrepancy

1. Pre-flight Step 4 — target CSS rules already modified → investigate
2. V5 dashboard startup fails after change → CSS syntax error, revert
3. V6 vite build fails → CSS breaks build; likely unclosed brace или invalid property
4. V7/V8 screenshots show broken layout (e.g. header collapsed, body zero-height) → `min-height: 0` missing, or flex wrong axis; inspect and fix
5. V9 PD scan matches → sanitize
6. plan-audit <7/10 → revision
7. Unexpected JSX changes → accidental edit outside CSS region, revert + retry
8. `calc(100vh - 240px)` results в unreadable short columns на short viewports (<600px height) → adjust offset k меньшему value или add media query для very short viewports (low priority flagging only)

---

## Self-audit (Codex fills)

1. Pre-flight §0.1-§0.6 complete
2. §V N/A acknowledged
3. Change 1 applied (`.column`)
4. Change 2 applied (`.columnHeader`)
5. Change 3 applied (`.columnBody`)
6. V1-V10 recorded with real stdout
7. V9 PD clean
8. V10 path clean
9. No JSX modifications (verify via diff scope)
10. No files outside whitelist touched
11. No git commit/push
12. Discrepancies completed
13. Out-of-scope noted
14. Screenshots attached to report (if applicable) или path-referenced

---

## Notes для Codex

1. All three Changes в **same CSS block template literal** `<style>` (App.jsx ~lines 200-800). Edits surgical.
2. **Visual probe (V7/V8) recommended но не strict blocker**: dashboard (API + Vite UI) должен работать в background для Playwright probes. Visual probes hit port 9119 (Vite), not 3003 (API only). Start full stack:
   ```bash
   cd "$WORKFLOW_ROOT/dashboard"
   npm run dev > /tmp/dashboard.log 2>&1 &
   DASH_PID=$!
   sleep 8  # concurrently starts node server.js + vite — takes longer than single server
   curl -s http://127.0.0.1:9119 > /dev/null && curl -s http://127.0.0.1:3003/api/messages > /dev/null && echo READY
   # ... run V7/V8 ...
   kill $DASH_PID
   npx kill-port 3003 9119 2>/dev/null || true
   ```
   If Playwright не reachable в Codex env (python3/playwright missing), skip V7/V8 с discrepancy note "awaits user visual check" — acceptance relies on V1-V6 + V9-V10.
3. **Offset `240px` is initial estimate**. If Codex observes visual issue (header hidden, columns too small), tune ±40px (180-300 reasonable range). Record actual value в report.
4. No 4th file.

---

## Commits strategy

- No commit during handoff.
- Suggested:
  ```
  feat(dashboard): independent scroll per column

  dashboard/src/App.jsx CSS:
  - .column: add max-height: calc(100vh - 240px) + flex column layout
  - .columnHeader: flex-shrink: 0 guard
  - .columnBody: overflow-y: auto + flex: 1 + min-height: 0

  Fixes user-reported issue where accumulating archive messages caused
  awkward whole-page scroll. Each column now bounded к viewport height
  with independent vertical scrollbar.
  ```
