# Planning Audit — Dashboard Column Scroll

**Meta-procedure**: `E:/Project/memory claude/memory claude/docs/claude-plan-creation-procedure.md`.

**Plan**: `docs/codex-tasks/dashboard-column-scroll.md` (written 2026-04-17 Step 9).

**Status**: delivery-ready — all 11 steps complete, plan-audit 9.8/10 + Codex adversarial pass applied, 8-sweep clean.

---

## §0 Meta-procedure

Triggering: user test 2026-04-17 — "нужно сделать скрол во всех табличках". Dashboard сейчас три колонки (Для Claude / Для Codex / Архив) — contents растут vertically, страница scroll'ится whole-page, не per-column. С большим числом сообщений (7+ в archive уже) UX ломается: нужно scroll к низу одной колонки чтобы увидеть другие. Fix: independent `overflow-y` per column + bounded `max-height`.

---

## §1 MCP + Skill selection

| Tool | Purpose | Priority |
|------|---------|----------|
| `context7` | MDN CSS `overflow-y` + flex layout (advisory only — standard CSS) | Optional |
| `plan-audit` skill | Step 10 | **Mandatory** |

**Summary**: `plan-audit`. CSS изменения — standard web features, docs через context7 только если plan-audit flags gap.

---

## §2 MCP readiness

N/A — only plan-audit skill, no external MCP probe needed. If Step 5 triggers context7 fetch, probe there.

---

## §3 Files read

| File | Lines | Tool | Extracted |
|------|-------|------|-----------|
| `E:/Project/workflow/dashboard/src/App.jsx` | 497-514 (CSS `.grid` + `.column`), 516-546 (`.columnHeader` + `.columnBody`), 790-799 (media query @1280px), 1436-1472 (JSX structure) | `Read` | **Current state**: `.grid` = 3-col grid. `.column` = `min-height: 420px` + `overflow: hidden` **но `max-height` отсутствует** — root cause of unbounded growth. `.columnBody` = `display: grid; gap: 14px; padding: 16px` — no scroll. `.columnHeader` = separate flex row. At @1280px single-column collapse via `grid-template-columns: 1fr`. JSX wraps column-header + column-body в one `<section>`. |

**Target change point**: `.column` + `.columnBody` CSS rules. Convert `.column` к flex-column, `.columnBody` gets `overflow-y: auto; flex: 1`. Add bounded `max-height` к `.column` via `calc(100vh - <offset>)`.

---

## §4 Official docs fetched

**Honest flag**: standard CSS features (`overflow-y`, `flex`, `calc()`, viewport units) — ubiquitous, не freshly fetched. Если plan-audit skill flags missing doc coverage → fetch MDN через context7. Baseline claims:
- `overflow-y: auto` creates scrollbar only when content exceeds container height
- `display: flex; flex-direction: column` + child `flex: 1` with `overflow-y: auto` = bounded scrolling child
- `calc(100vh - Npx)` = viewport-relative height minus fixed offset (hero + toolbar + margins)

Все три — universally documented web standards since 2012+.

---

## §5 Commands run

| Command | Purpose | Output |
|---------|---------|--------|
| `grep -n "columns\\|column " dashboard/src/App.jsx` | Find column definitions | Found CSS rules on 497, 500, 507, 542, 797 (media query); JSX usage 1437 |
| `wc -l dashboard/src/App.jsx` | Baseline file size | Expected ~1600 lines (prior handoffs referenced 1087, 1335-1347 etc.) — actual to be verified by Codex pre-flight |

---

## §6 Empirical

**Live state probe** (dashboard running via earlier session):
- Current: 7+ messages в archive column, unbounded vertical growth
- Page scroll = whole-page, не per-column
- Mobile/narrow (@1280px) = stacked 1-column layout; same unbounded growth problem

No fixture data creation needed — current live state sufficient evidence.

---

## §7 Assumptions

| Claim | Marker | Evidence |
|-------|--------|----------|
| Target CSS rules at `.column` + `.columnBody` (App.jsx:507-546) | ✅ | §3 Read |
| `.column` lacks `max-height` | ✅ | §3 read rules 507-514 verified |
| Single grid parent `.grid` at 497-505 | ✅ | §3 |
| Media query @1280px switches к single-column via `grid-template-columns: 1fr` | ✅ | §3 line 795-799 |
| Viewport-based `max-height` via `calc(100vh - Npx)` requires estimating hero/toolbar offset | ⚠️ | Plan initial estimate: **240px** (hero title+subhead ~130px + toolbar ~30px + section margin ~20px + bottom padding ~40px + slack ~20px). Adjustable ±40px (200-280px reasonable range). Codex visual check tunes based on live viewport. |
| JSX structure не requires changes (CSS-only fix) | ✅ | §3 verified `.columnHeader` + `.columnBody` already separate blocks |
| No new dependencies required | ✅ | Pure CSS |
| Change propagates к single-column mobile mode automatically | ⚠️ | Need verify — mobile may need different `max-height` calculation (e.g. `calc(100vh - different offset)` due to wrapped hero). Codex visual check. |

---

## §8 plan-audit

**Invocation**: `Skill({skill: "plan-audit", ...})` 2026-04-17.
**Score**: 9.8/10 ✅

| Measure | Score |
|---------|-------|
| Ссылки | 2/2 |
| Правила | 2/2 |
| Blast radius | 2/2 |
| Полнота | 2/2 |
| Реализуемость | 1.8/2 |

**Fixes applied (auto)**:
- Important: offset inconsistency 240 vs 280-320 → audit §7 row 5 updated к "Plan initial 240px, adjustable ±40px"
- Optional: V7/V8 dashboard-running implicit → Notes #2 now includes explicit start/stop commands

**8-sweep results**:

| # | Sweep | Result |
|---|-------|--------|
| 1 | Markdown-pipe | ⚠️ 2 matches в fenced code blocks (V1/V2 grep BRE alternation `"a\|b"`). Legitimate в bash double-quoted context, не markdown-table escape hazard. Acceptable |
| 2 | Windows-syntax | ✅ 0 |
| 3 | Stale refs | ✅ 0 |
| 4 | §-consistency | ✅ post-fix |
| 5 | Shell state | ✅ 9 + 2 cd — all reset к WORKFLOW_ROOT or nested dashboard |
| 6 | Multi-root | ✅ 1 VAR |
| 7 | Baseline drift | ✅ "drift → record" |
| 8 | PD-hardcode | ✅ dynamic extraction |

All 8 pass. Plan ready.

---

### Codex adversarial pass (2026-04-17)

Codex caught 2 findings + 1 cosmetic. Auto-applied:

1. **V1-V3 false-positive grep (blocker)** — patterns `display: flex`, `flex: 1`, `flex-shrink: 0` matched other CSS rules elsewhere в 1478-line App.jsx, giving green signal без target edits. **Fixed**: V1-V3 rewritten на scoped `sed -n '/^  \.columnName {$/,/^  }$/p' | grep` extraction — проверяют только target block, не whole file.

2. **V7/V8 Python dependency** — plan listed V7/V8 as mandatory но Codex WSL env лишён python3/playwright. Contradiction между acceptance и executable env. **Fixed**: V7/V8 explicitly marked optional в table, code block prefix с env check, acceptance updated к "either screenshots OR `[awaits user]` note", Phase 2 user visual check remains authoritative.

3. **Cosmetic — planning-audit header stale** ("TBD Step 9 / in progress Step 2 skeleton"). **Fixed**: updated к "written 2026-04-17 Step 9 / delivery-ready".

All findings closed.

---

### Codex adversarial pass #2 (2026-04-17)

3 more findings. Auto-applied:

1. **V7/V8 dashboard start command incomplete** — started only `node server.js` (port 3003) но visual probes hit Vite on 9119. Causes false-fail если Playwright actually runs. **Fixed**: Notes #2 updated — `npm run dev` (concurrently runs both API+Vite), sleep 8 instead of 3, dual curl probe on оба ports.

2. **Baseline pre-flight + report §9 stale** — Pre-flight Step 3 mentioned "launchers untracked" but они tracked since `e6afbe8`. Not accounting для pre-existing `M scripts/mailbox.mjs`. Report §9 similar. **Fixed**: both updated с current baseline (M mailbox.mjs preserved + handoff files only).

3. **Report self-audit #14 screenshot mandatory** despite V7/V8 optional — contradiction. **Fixed**: checklist reformulated к "screenshots referenced if V7/V8 executed; иначе `[awaits user]` note (not mandatory)".

All 3 + prior 3 = 6 total fixes across adversarial rounds.

---

## §9 Delta from prior Tier

Follow-up after 7 commits этой session. Dashboard UI tier (`1c031b6` hide-archive filter, `898a0f0` README screenshot, `a29b590` read-only misdescription fix). Current: dashboard layout doesn't bound column heights — with accumulating archive messages, page becomes awkward. Pure layout fix.

---

## §10 Known gaps

1. **Viewport offset constant**: plan specifies `calc(100vh - 240px)` as starting `max-height` для `.column`. Actual offset (hero + toolbar + margins) может differ slightly — Codex visual probe может tune ±40px (200-280px range). Tolerance acceptable.

2. **Mobile single-column mode**: media @1280px collapses к 1-column. Need separate consideration: should still allow scroll, но offset возможно меньше (no horizontal hero-toolbar split, compressed). Plan provides fallback "inherit .column max-height + let natural content overflow scroll — visually verify на narrow viewport".

3. **Smooth scrollbar styling**: native scrollbars could look jarring с current rounded column borders. Plan marks как optional polish (scrollbar-width + scrollbar-color properties для modern browsers). Codex может skip if visually acceptable without.

4. **Scroll position preservation**: if user scrolls archive to bottom, затем toggles project filter or language, current behavior — scroll resets. Acceptable UX; preservation = future tier if needed.

---

## §11 Signature

- Author: Claude
- Date: 2026-04-17
- Slug: `dashboard-column-scroll`
- Related:
  - Plan: `docs/codex-tasks/dashboard-column-scroll.md`
  - Report: `docs/codex-tasks/dashboard-column-scroll-report.md`


## Legacy Workflow Note (2026-04-21)

This file is preserved as a historical artifact from an earlier workflow revision.

It may mention legacy patterns such as `Claude planner / Codex executor`, user relay, `compact prompt`, or older handoff shapes.

Do not use it as the live operating template. Current contract: `docs/codex-system-prompt.md`, `AGENTS.md`, `workflow-role-distribution.md`, `workflow-instructions-claude.md`, and `workflow-instructions-codex.md`.
