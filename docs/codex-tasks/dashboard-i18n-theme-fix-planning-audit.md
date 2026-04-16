# Dashboard i18n + Dark Theme + Refresh Fix — Planning Audit (v2)

> **План**: `docs/codex-tasks/dashboard-i18n-theme-fix.md` (v2, revised after review)

---

## 1. Files read

| # | File | Lines | What extracted |
|---|------|-------|----------------|
| F1 | `dashboard/src/App.jsx` | 1-15 | columns array with hardcoded EN titles |
| F2 | `dashboard/src/App.jsx` | 16-30 | CSS `:root` with `color-scheme: light`, hardcoded light palette |
| F3 | `dashboard/src/App.jsx` | 115-137 | refreshButton CSS: disabled `opacity: 0.72` — source of flash |
| F4 | `dashboard/src/App.jsx` | 451 | `formatTimestamp()`: returns "No timestamp" hardcoded, `en-GB` hardcoded |
| F5 | `dashboard/src/App.jsx` | 504 | status chip: `message.status || "pending"` — raw protocol value |
| F6 | `dashboard/src/App.jsx` | 626-664 | refreshMessages: `background: true` skips isRefreshing; initial load does not |
| F7 | `dashboard/src/App.jsx` | 685-691 | Client-side errors: hardcoded EN strings |
| F8 | `dashboard/src/App.jsx` | 750-862 | All JSX text hardcoded English |

---

## 2. Commands run

| # | Command | Key output | What it proved |
|---|---------|------------|----------------|
| C1 | `wc -l dashboard/src/App.jsx` | 862 | Current size |
| C2 | `wc -l scripts/*.mjs dashboard/server.js dashboard/src/api.js` | 1914 total | Only App.jsx needs changes |

---

## 3. Assumptions + verification

| # | Утверждение | Source | Status | Evidence |
|---|-------------|--------|--------|----------|
| A1 | `prefers-color-scheme` supported | `[OFFICIAL]` | ⚠️ assumed | D1 |
| A2 | `localStorage` available localhost | `[OFFICIAL]` | ⚠️ assumed | D2 |
| A3 | `matchMedia("change")` event fires on OS theme switch | `[OFFICIAL]` | ⚠️ assumed | D3 — Codex verifies |
| A4 | CSS custom properties work with Vite | `[EMPIRICAL]` | ✅ verified | Vite doesn't transform them |
| A5 | Only App.jsx needs changes | `[EMPIRICAL]` | ✅ verified | C2 |
| A6 | Flash caused by opacity on disabled, not by polling | `[EMPIRICAL]` | ✅ verified | F3 + F6: polling uses background:true |
| A7 | "No timestamp" is hardcoded in formatTimestamp | `[EMPIRICAL]` | ✅ verified | F4 |
| A8 | Client errors hardcoded EN | `[EMPIRICAL]` | ✅ verified | F7 |

---

## 4. Review feedback incorporated (v1 → v2)

| # | v1 issue | Fix in v2 |
|---|----------|-----------|
| R1 | Change 3 misdiagnosed as "polling" flash | Corrected: flash is initial load + manual refresh, not polling |
| R2 | Auto theme missing matchMedia listener | Added D3, explicit matchMedia + addEventListener + cleanup |
| R3 | Missing i18n: "No timestamp", client errors, status chip | Added keys, explicit rules for protocol values (raw) |
| R4 | Heading still says "read-only" | Updated to "Просмотр и управление" / "View and manage" |
| R5 | Theme control type undefined | Specified: segmented control (3 buttons), not dropdown/cycle |
| R6 | Rollback via `git checkout --` dangerous | Changed: create revert commit instead |
| R7 | Arch question mixed into execution plan | Moved out of scope, noted as separate follow-up |
| R8 | Timestamp locale not specified | Added: ru-RU for RU, en-GB for EN |
| R9 | No acceptance for dark-flash-on-reload | Added explicit note: 1-frame flash допустим, inline script out of scope |

---

## 5. Baselines

| # | Measurement | Value |
|---|------------|-------|
| B1 | HEAD | 3cb16c3 |
| B2 | App.jsx lines | 862 |
