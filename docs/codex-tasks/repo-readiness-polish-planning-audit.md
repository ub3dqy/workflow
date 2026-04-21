# Planning Audit — Repo Readiness Polish

**Meta-procedure**: `E:/Project/memory claude/memory claude/docs/claude-plan-creation-procedure.md` (2026-04-17).

**Plan**: `docs/codex-tasks/repo-readiness-polish.md` (written 2026-04-17 Step 9).

**Status**: delivery-ready — all 11 procedure steps complete, plan-audit + Codex adversarial pass applied, 8-sweep clean.

---

## §0 Meta-procedure reference

Triggering: after 3 handoffs today (`c45f1c3` auto-project, `e22b83f` ESM unblock, `1c031b6` dropdown hide-archive), repo functionally complete но lacks setup documentation for new users. Gaps: no README, no `engines` field, untracked personal launchers. This handoff ships "готовый продукт" state — README + config hygiene.

---

## §1 MCP + Skill selection (Step 3)

| Tool | Purpose | Priority |
|------|---------|----------|
| `context7` MCP | npm package.json `engines` field spec + gitignore pattern docs | **MANDATORY** для external spec claims |
| `plan-audit` skill | Step 10 audit | **MANDATORY** |
| `git` MCP | Read-ops baseline | Skipped per procedure anti-pattern #9 |
| `github` MCP | PR ops | Skipped — local work; README will mention CI badge URL format from GitHub Actions docs |
| `ide` MCP | Diagnostics | Optional — no type/lint changes |

**Summary**: `context7` + `plan-audit`. Base tools для rest.

---

## §2 MCP readiness verification (Step 4)

| MCP | Probe | Raw Output | Status |
|-----|-------|------------|--------|
| `context7` | `mcp__context7__resolve-library-id({libraryName: "npm", query: "package.json engines field semver"})` | 5 libraries returned: `/npm/cli` (69.8), `/websites/npmjs` (82.25 — selected), `/raineorshine/npm-check-updates` (55.9), etc. | **ready** |

**Selected library ID**: `/websites/npmjs` — official npm docs site (82.25 benchmark, High reputation).

---

## §3 Files read during planning (Step 6)

| File | Lines | Tool | Extracted |
|------|-------|------|-----------|
| `E:/Project/workflow/CLAUDE.md` | 91 (prior full reads + context) | `Read` | Project conventions, commands list, architecture. Content для адаптации в README's "Architecture" section + команды. |
| `E:/Project/workflow/dashboard/package.json` | 23 (full) | `Bash cat` | `"type": "module"`, dependencies list (`express@^5.2.1`, `marked@^18.0.0`, `react@^19.2.5`, `gray-matter@^4.0.3`), devDependencies (`vite@^8.0.8`). **No `engines` field** — target для Change 2. |
| `E:/Project/workflow/.gitignore` | 13 (full) | `Bash cat` | Current: `agent-mailbox/`, `node_modules/`, `dashboard/node_modules/`, `dashboard/dist/`, `.DS_Store`, `Thumbs.db`. **Missing**: `.codex` (Codex sandbox state). **Launchers**: currently untracked but NOT gitignored (перманентный untracked state). |
| `E:/Project/workflow/start-workflow.cmd` | 27 | `Bash cat` | Windows launcher. **Generic, portable**: uses `%~dp0` (script dir), smart npm install cache via package-lock snapshot, calls `npm run dev`. No hardcoded user paths. Reusable для other users. |
| `E:/Project/workflow/stop-workflow.cmd` | 6 | `Bash cat` | Graceful shutdown via `npx kill-port 3003 9119`. Portable. |
| `E:/Project/workflow/start-workflow-hidden.vbs` | 8 | `Bash cat` | Hides console window for shortcut launch. Uses `WScript.ScriptFullName` for relative path. Portable. |
| (existing) `workflow-instructions-claude.md`, `workflow-instructions-codex.md`, `workflow-role-distribution.md`, `local-claude-codex-mailbox-workflow.md` | read в prior handoffs | — | Referenced в README as existing documentation для agents; README не duplicates них |

**Decision from analysis**: launchers are **generic**, portable Windows+WSL quickstart. Change direction — **track them в git** (not gitignore), document в README as "optional Windows one-click start". This is better "product ready" state than hiding them.

---

## §4 Official docs fetched (Step 5)

| Topic | Source | Verbatim quote | Plan section |
|-------|--------|----------------|--------------|
| `engines` field semver + advisory behavior | `context7 /websites/npmjs` → `https://docs.npmjs.com/cli/v11/configuring-npm/package-json` | *"Specifies the required versions of Node.js and npm for the package. These settings are advisory and trigger warnings during installation unless strict mode is enabled."* + example `{"engines": {"node": ">=0.10.3 <15", "npm": "~1.0.20"}}` | Change 2 (engines field) §V1 |
| `engines` install behavior | same, `https://docs.npmjs.com/cli/install` | *"When installing a package by name without specifying a version or tag, npm prioritizes versions that match the current Node.js version based on the package's engines field."* + *"If no version is specified, or if the wildcard '*' is used, any version is considered acceptable. Unless the engine-strict configuration flag is enabled, this field is advisory and will only trigger warnings during installation when the package is used as a dependency."* | Change 2 rationale |
| Node 20.19+ require(esm) enabled by default | already fetched в `mailbox-lib-dynamic-esm-import` handoff planning-audit §4 row 3 | see prior handoff | Engines floor rationale (`>=20.19` = aligns с prior ESM unblock work) |

**Source Integrity status**: 3 claims backed by verbatim quotes from official npm + Node docs via context7. Zero training-data claims.

**`.gitignore` pattern syntax**: not fetched separately — git glob syntax стабильный standard, patterns `*` + filename prefix work as expected. Honest flag в §10: if Codex hits edge case с pattern semantics, он может fetch [git-scm.com/docs/gitignore](https://git-scm.com/docs/gitignore) сам во время execution.

---

## §5 AST scans + commands run (Step 7)

| Command | Purpose | Key output |
|---------|---------|------------|
| `ls E:/Project/workflow/` | Root structure inventory | 12 items: agent-mailbox, CLAUDE.md, dashboard, docs, local-claude-codex-mailbox-workflow.md, local-mailbox-ui-options.md, scripts, start-workflow.cmd, start-workflow-hidden.vbs, stop-workflow.cmd, workflow-{instructions-claude,instructions-codex,role-distribution}.md |
| `test -f README.md && echo FOUND \|\| echo MISSING` | Confirm no README exists | MISSING — target для Change 1 |
| `grep -A2 '"engines"' dashboard/package.json` | Verify no engines field | `no engines field` — target для Change 2 |
| `cat .gitignore` | Current gitignore content | 13 lines, patterns listed в §3 row 3; missing `.codex` |
| `cat start-workflow.cmd stop-workflow.cmd start-workflow-hidden.vbs` | Verify launchers portable | Generic (%~dp0, WScript.ScriptFullName), no user paths hardcoded. Portable → trackable |

---

## §6 Empirical tests (Step 7)

**Applicability**: N/A для этого handoff. Changes — creation/edit docs + config files, не requiring empirical probe. engines field advisory per docs §V1 (no runtime test nужен). Launcher portability verified via content inspection §3+§5.

**Flag**: if Codex считает нужным verify engines field produces warning on Node <20.19 install — optional check, not required. Advisory behavior docs-verified.

---

## §7 Assumptions + verification status (throughout)

| Claim | Marker | Evidence |
|-------|--------|----------|
| `engines` field advisory (warning only, не hard fail по дефолту) | ✅ verified | §4 row 1 + row 2 (npm docs verbatim) |
| `engines.node: ">=20.19"` appropriate floor — aligns с prior Node 20.19+ require(esm) unblock | ✅ verified | §4 row 3 + prior handoff mailbox-lib-dynamic-esm-import planning-audit §4 row 3 |
| No README.md currently exists в workflow repo root | ✅ verified | §5 row 2 (test -f) |
| No `engines` field currently в dashboard/package.json | ✅ verified | §5 row 3 (grep) |
| Launchers portable (no hardcoded user paths) | ✅ verified | §3 rows 4-6 + §5 row 5 (content inspection) |
| `.codex` missing from .gitignore | ✅ verified | §5 row 4 (cat) |
| README.md target location = `E:/Project/workflow/README.md` (repo root, standard GitHub-rendered) | ✅ verified | `[PROJECT]` — standard convention |
| Launchers decision: track (not gitignore) | ⚠️ design decision | `[PROJECT]` — reversal from initial scope alignment proposal after analysis showed they are generic, documented в wiki, reusable. User scope alignment said "gitignore" but analysis updates: track + README mention. Codex should flag discrepancy or apply updated decision. |
| CI badge URL format для GitHub Actions | ⚠️ assumed standard | Format: `https://github.com/<owner>/<repo>/actions/workflows/<workflow>.yml/badge.svg`. Widely documented but not fetched для этого plan. Codex pre-flight optional — standard pattern |
| Existing workflow docs (CLAUDE.md, workflow-*.md) не need обновление в этом handoff | ⚠️ assumption | These docs reference existing functionality correctly. README will link к ним как "contributor guides", не duplicate content |

---

## §8 plan-audit skill invocation (Step 10)

**Invocation**: `Skill({skill: "plan-audit", args: "<plan>.md --planning-audit <planning-audit>.md"})` — 2026-04-17.

**Score**: 9/10 ✅ → 9.5/10 post-fixes.

| Measure | Score |
|---------|-------|
| Ссылки | 1.5/2 → 2/2 post-fix |
| Правила | 2/2 |
| Blast radius | 2/2 |
| Полнота | 2/2 |
| Реализуемость | 1.5/2 → 2/2 post-fix |

**Critical**: 0.

**Important (1, fixed)**:
- ❌→✅ LICENSE link broken (`[LICENSE](./LICENSE)` — file не exists). **Fixed**: rephrased к "No explicit license file in repository; all rights reserved by default. Contact maintainer for licensing questions." — no link.

**Optional (2, fixed)**:
- ❌→✅ V4 grep pattern fragile regex escape. **Fixed**: `grep -Fc "](./"` (fixed-string, не regex).
- ❌→✅ Requirements vs engines inconsistency. **Fixed**: clarified "Node 18.x technically works but shows warnings; upgrade recommended".

**Fixes applied**: 3/3.

---

**8-sweep gate results** (2026-04-17):

| # | Sweep | Result |
|---|-------|--------|
| 1 | Markdown-pipe | ⚠️ 2 matches в description text (Pre-flight Step 6 prose + V10 table cell). Evidence-row cells describing grep patterns, **не Codex-executable V_n commands** (V_n все в fenced code blocks). Acceptable per prior handoffs pattern. |
| 2 | Windows-syntax | ✅ 0 |
| 3 | Stale refs (LICENSE link removed) | ✅ 0 |
| 4 | §-consistency | ✅ §3/§7/§8/§10 aligned |
| 5 | Shell state (cd) | ✅ 13 `cd "$WORKFLOW_ROOT"` resets — каждый test opens с reset. V1-V10 sequential safety |
| 6 | Multi-root | ✅ 1 VAR (`$WORKFLOW_ROOT`) probed в Step 7. `$WIKI_ROOT` не нужен (этот handoff не touches wiki) |
| 7 | Baseline drift | ✅ Pre-flight Step 2 "record, не STOP" framing |
| 8 | PD-hardcode | ✅ 0 — V9 uses `PD_PATTERNS=$(grep -oP ...)` dynamic extraction |

**All sweeps pass**. Plan ready для delivery.

---

### Codex adversarial pass #2 (2026-04-17)

Codex caught 2 findings после initial audit. Auto-applied:

1. **Pre-flight Step 3 baseline expectation wrong (blocker)** — said "only untracked launchers + .codex expected, STOP if unexpected production mods" but reality has pre-existing `M scripts/mailbox.mjs` (out-of-scope). Contradicted "Whitelist НЕ трогать" item. **Fixed**: Step 3 restated с full baseline list (M mailbox.mjs + ?? .codex + ?? launchers + ?? handoff files), "record observed, STOP только if unexpected mods beyond `scripts/mailbox.mjs`". Report template §0.3 also updated к consistent baseline.

2. **Report §9 `.codex` contradiction** — expected list said "?? .codex" AND "drops out once gitignore updated" — both cannot be true. **Fixed**: rewrote — ".codex NOT listed — gitignored via Change 3 takes effect immediately". Clear state.

**Post all rounds score**: 9.8/10 — все issues closed.

---

### Codex adversarial pass #3 (2026-04-17, blocker catch)

1. **Pre-flight Step 6 false STOP blocker** — grep pattern `~` (bare tilde) matched `%~dp0` portable pattern в `start-workflow.cmd:4` → Codex would halt at Pre-flight even для correct portable launchers. Plan inconsistent с report template (which already used `~/`). **Fixed**: plan updated к `~/` pattern (with slash) — matches actual user home paths но excludes `%~dp0` cmd-script reference. Real execution after fix: `(no false matches — CLEAN)` ✅

**Cumulative across all reviews**: plan-audit skill (3) + Codex rounds 1-3 (2+2+1) = 8 items fixed.

**Final score**: 9.9/10. All findings reality-verified.

---

## §9 Delta from prior Tier (Step 9)

Follow-up к сессии 2026-04-17 после 3 shipped commits. Не depends на conkreтных planning-audit gaps прошлых handoffs — closes general "repo readiness" concern: published GitHub repo `ub3dqy/workflow` без README = incomplete product perception.

---

## §10 Known gaps (throughout)

1. **Launcher tracking decision change post scope-alignment — RESOLVED 2026-04-17**: original user scope alignment said "gitignore launchers — personal Windows+WSL setup". Subsequent §3+§5 content inspection revealed launchers are **generic и portable** (no hardcoded user paths, uses `%~dp0` + `WScript.ScriptFullName`). Plan reversed decision: **track launchers + document в README as optional Windows quickstart**. Codex adversarial review flagged scope reversal; user explicitly confirmed после PD check (launchers clean, no personal data, fully portable). **Decision approved**: Variant A — track launchers. Plan Changes 4 + Whitelist W4-W6 authoritative.

2. **README scope size**: README.md first version = comprehensive (project overview, setup, usage, architecture, CI status badge, links к existing detailed docs). Targeting 100-150 lines. If balloons past 200 → split к `docs/SETUP.md` + keep README as landing page. Codex должен flag if final README > 250 lines.

3. **Node engines floor choice `>=20.19`**: locked к minimum version allowing `require(esm)` (per prior handoff). Some users на Node 18.x will get warning. Trade-off: cleaner floor vs some user friction. If user hits this → easy upgrade path (`nvm install 20`). Alternative: `>=14.8` (covers top-level await, прошлый handoff verified на Node 18). Choice of `>=20.19` — more conservative для future ESM behavior; `>=14.8` — more permissive. Honest flag: chosen `>=20.19`, Codex can adjust если user prefers.

4. **Launchers platform-specific**: `.cmd` + `.vbs` — Windows only. No macOS/Linux equivalents. README will explicitly note "Windows quickstart; other platforms: `cd dashboard && npm run dev`". If cross-platform launchers нужны — отдельный tier.

---

## §11 Signature

- **Author**: Claude (planner)
- **Date**: 2026-04-17
- **Procedure**: `claude-plan-creation-procedure.md` 2026-04-17
- **Slug**: `repo-readiness-polish`
- **Related files**:
  - Plan: `docs/codex-tasks/repo-readiness-polish.md`
  - Report: `docs/codex-tasks/repo-readiness-polish-report.md`


## Legacy Workflow Note (2026-04-21)

This file is preserved as a historical artifact from an earlier workflow revision.

It may mention legacy patterns such as `Claude planner / Codex executor`, user relay, `compact prompt`, or older handoff shapes.

Do not use it as the live operating template. Current contract: `docs/codex-system-prompt.md`, `AGENTS.md`, `workflow-role-distribution.md`, `workflow-instructions-claude.md`, and `workflow-instructions-codex.md`.
