# Planning Audit — README Bilingual + Friendly Redesign

**Meta-procedure**: `E:/Project/memory claude/memory claude/docs/claude-plan-creation-procedure.md`.

**Plan**: `docs/codex-tasks/readme-bilingual-friendly-redesign.md` (written 2026-04-17 Step 9).

**Status**: delivery-ready — all 11 steps complete, plan-audit 9.8/10, 8-sweep clean.

---

## §0 Meta-procedure reference

Triggering: after shipping "готовый продукт" commit `e6afbe8` (README + engines + launchers), user requests README polish — bilingual (EN+RU, cross-links per GitHub convention Variant 1) + friendlier tone + screenshots + clear "what/why" opening + visual assets. Scope: docs-only, no functional code. Produce screenshots during planning (Claude research phase) using webapp-testing skill, plan references saved artifacts.

---

## §1 MCP + Skill selection

| Tool | Purpose | Priority |
|------|---------|----------|
| `context7` | GFM image syntax + markdown rules | **Mandatory** для external spec |
| `webapp-testing` skill | Dashboard screenshot production via Playwright | **Mandatory** для visual artifacts (one-time script run during Step 6) |
| `plan-audit` skill | Step 10 audit | **Mandatory** |

**Summary**: context7 + webapp-testing (one-shot) + plan-audit.

---

## §2 MCP readiness

| MCP | Probe | Output | Status |
|-----|-------|--------|--------|
| `context7` | `resolve-library-id({libraryName: "GitHub Flavored Markdown", query: "images..."})` | 5 libraries, `/websites/github_github_gfm` selected (GFM spec, High reputation) | ready |
| `webapp-testing` skill | Playwright headless script run 2026-04-17 (one-shot) | 2 screenshots saved к `docs/assets/` (dashboard-overview.png 154KB, dashboard-full.png 268KB) | completed |

---

## §3 Files read

| File | Lines | Tool | Purpose |
|------|-------|------|---------|
| `E:/Project/workflow/README.md` | 113 (full, read в prior handoff + current session) | Read | Current baseline — 8 sections, English only, minimal visuals. Target для expansion. |
| `E:/Project/workflow/CLAUDE.md` | 91 | Read (prior) | Architecture description, ports, conventions — source for README opening |
| `E:/Project/workflow/dashboard/package.json` | 26 (with engines) | Read | Dependencies list для README "What this uses" |
| `E:/Project/workflow/docs/assets/dashboard-overview.png` | 154KB binary | Read | Screenshot artifact verified — shows dashboard UI с messages, project dropdown, theme toggle, lang toggle |

---

## §4 Official docs fetched

| Topic | Source | Verbatim | Plan section |
|-------|--------|----------|--------------|
| GFM image syntax | `context7 /websites/github_github_gfm` → `https://github.github.com/gfm/index` | *"Syntax for images is like the syntax for links, with one difference. Instead of link text, we have an image description. The rules for this are the same as for link text, except that (a) an image description starts with `![` rather than `[`, and (b) an image description may contain links."* | README image references `![alt](docs/assets/*.png)` |
| GFM alt text | same | *"When an image is rendered to HTML, its `alt` attribute is typically populated with the plain string content of the image description, not the formatted version or any included links."* | Alt text descriptive для accessibility |

**Mermaid в GitHub**: widely-documented feature since early 2022 — GitHub renders `` ```mermaid `` fenced blocks inline. Not separately fetched (ubiquitous standard).

---

## §5 Commands run

| Command | Purpose | Output |
|---------|---------|--------|
| `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:9119` | Dashboard readiness probe | `200` — running |
| `python readme-screenshot.py` (one-shot, deleted) | Take 2 screenshots via Playwright | `saved: dashboard-overview.png` + `saved: dashboard-full.png` |
| `ls -la docs/assets/` | Verify artifacts | 2 PNG files, 154KB + 268KB |
| `rm readme-screenshot.py` | Cleanup one-shot | deleted |

---

## §6 Empirical — screenshots

**Dashboard overview screenshot** (`docs/assets/dashboard-overview.png`):
- Viewport 1280x800, headless Chromium, `wait_until=domcontentloaded` + 2s settle
- Captures: Mailbox header, stats (6 messages, last update), project dropdown "Все проекты", lang toggle (EN), theme toggle (Светлая/Тёмная/Авто), Refresh button, messages section "Для Claude" с real messages (project badges, threads, timestamps, reply/archive buttons)
- Visual verified via Read tool: looks clean, shows all key features

**Full-page screenshot** (`dashboard-full.png`): same content but full-page scroll, larger file. Для completeness — можно использовать alternative или оставить как supplementary.

**Decision**: плане use `dashboard-overview.png` как primary README visual. `dashboard-full.png` retained as backup/alternative reference.

---

## §7 Assumptions + verification

| Claim | Marker | Evidence |
|-------|--------|----------|
| GFM supports standard `![alt](path)` image syntax | ✅ | §4 row 1 (GFM spec verbatim) |
| GitHub renders mermaid в fenced `mermaid` blocks | ⚠️ widely-documented, не freshly fetched | `[PROJECT]` — universally known feature. Codex может fetch GitHub blog if skeptical |
| Dashboard screenshot accurately shows current product state 2026-04-17 | ✅ | §6 (fresh Playwright capture) |
| Russian translation equivalent needed — task explicit user ask | ✅ | `[PROJECT]` user directive "сделай на 2 языках" |
| README expansion adds value vs current 113-line baseline | ✅ | user explicit "повеселее + картинок + дружелюбнее + зачем нужно" |
| Cross-link convention `[English](./README.md) \| [Русский](./README.ru.md)` standard | ✅ | React/VSCode/popular OSS repos convention |
| Assets path `docs/assets/` appropriate для repo structure | ⚠️ | Convention alternative: `.github/images/`, `assets/`, root `images/`. `docs/assets/` logical given existing `docs/` dir |

---

## §8 plan-audit invocation

**Invocation**: `Skill({skill: "plan-audit", args: "..."})` — 2026-04-17.

**Score**: 9.8/10 ✅

| Measure | Score |
|---------|-------|
| Ссылки | 2/2 |
| Правила | 2/2 |
| Blast radius | 2/2 |
| Полнота | 2/2 |
| Реализуемость | 1.8/2 (mermaid verbatim honest flag — acceptable) |

**Critical**: 0. **Important**: 0. **Optional**: 2 (mermaid citation, screenshot staleness note — оба acceptable as-is).

**No fixes applied** — plan clean first pass.

**8-sweep gate results** (2026-04-17):

| # | Sweep | Result |
|---|-------|--------|
| 1 | Markdown-pipe | ✅ 0 |
| 2 | Windows-syntax | ✅ 0 |
| 3 | Stale refs | ✅ 0 |
| 4 | Planning-audit consistency | ✅ §1-§10 aligned |
| 5 | Shell state | ✅ 15 `cd "$WORKFLOW_ROOT"` resets |
| 6 | Multi-root | ✅ `$WORKFLOW_ROOT` probed в Pre-flight Step 6 |
| 7 | Baseline drift | ✅ "Drift → record" framing |
| 8 | PD-hardcode | ✅ 0 — V9 dynamic extraction |

All 8 sweeps pass. Plan ready for delivery.

---

### Codex adversarial pass (2026-04-17)

Codex caught 2 baseline-related findings (same class as prior handoffs). Auto-applied:

1. **Pre-flight Step 3 baseline incomplete (blocker)** — plan said "only `.codex` untracked + possibly `docs/assets/`". Reality: `M scripts/mailbox.mjs` (pre-existing), `?? docs/assets/`, `?? docs/codex-tasks/readme-bilingual-friendly-redesign*.md`, `.codex` already gitignored. **Fixed**: Step 3 lists full baseline с pre-existing preserved + drift note.

2. **Report §9 expected status stale** — missing `M scripts/mailbox.mjs` preservation note. **Fixed**: expected list includes pre-existing M + .codex gitignored note.

Blocker class consistent with prior handoffs (4 handoffs all hit this). Should flag: baseline stale pattern — plan template нужен standard baseline section, не fresh-re-written каждый раз. Future optimization: add standard block к plan-scope-alignment-template concept.

---

## §9 Delta from prior Tier

Follows `repo-readiness-polish` (commit `e6afbe8`) which shipped baseline README (113 lines, 8 sections, English only, no visuals). This handoff: bilingual expansion (+ Russian counterpart), friendlier tone, screenshot addition, reorganized opening ("what/why" before technical details).

---

## §10 Known gaps

1. **Russian tone calibration**: translation should feel natural, not mechanical. Codex должен review Russian version для smoothness, не только literal translation.
2. **Mermaid architecture diagram**: plan includes simple mermaid diagram. If GitHub rendering fails, fallback text retained.
3. **Screenshot staleness**: UI может change в future handoffs. Screenshot captures 2026-04-17 state. README footer note about timestamp.
4. **File size**: 2 PNGs total ~420KB, tracked в git. Acceptable for docs assets. LFS не needed для v1.
5. **Emoji + badges tone**: plan targets moderate (3-5 emoji accents, 2 badges). Balance per 2026 OSS README conventions.

---

## §11 Signature

- Author: Claude (planner)
- Date: 2026-04-17
- Slug: `readme-bilingual-friendly-redesign`
- Related:
  - Plan: `docs/codex-tasks/readme-bilingual-friendly-redesign.md`
  - Report: `docs/codex-tasks/readme-bilingual-friendly-redesign-report.md`
