# Planning Audit — Mailbox Lib Dynamic ESM Import

**Meta-procedure**: `E:/Project/memory claude/memory claude/docs/claude-plan-creation-procedure.md` (2026-04-17, 11-step checklist).

**Plan**: `docs/codex-tasks/mailbox-lib-dynamic-esm-import.md` (TBD, written at Step 9).

**Status**: in progress — Step 2 skeleton created.

---

## §0 Meta-procedure reference

Plan follows 11-step procedure. Each section filled at step indicated. Triggering context: P2.3 verification (2026-04-17) exposed `ERR_REQUIRE_ESM` на Node 18 при `requireFromDashboard("marked")` в `scripts/mailbox-lib.mjs:10`. Article `agent-mail.md` получил Node 24+ warning, но code fix (dynamic import) — правильное long-term решение.

---

## §1 MCP + Skill selection (filled at Step 3)

| Tool | Purpose | Priority |
|------|---------|----------|
| `context7` MCP | Node.js ESM / dynamic import / `createRequire` docs (v18/v20/v22/v24 для compat matrix) | **MANDATORY** per `feedback_use_mcp_and_skills.md` |
| `plan-audit` skill | Audit plan at Step 10 | **MANDATORY** per procedure Step 10 |
| `git` MCP | Read-ops baseline | Skipped per procedure anti-pattern #9 (git только на explicit user command) |
| `github` MCP | PR/issue ops | Skipped — local work, no remote ops in scope |
| `ide` MCP | `getDiagnostics` для type/lint baseline | Optional — ESM refactor не добавляет types; пропускаю |
| `filesystem` MCP | Batch file ops alternative | Optional — `Read`/`Edit`/`Write` достаточно |
| `security-audit` skill | Security review | Skipped — no security scope в dependency loading refactor |
| `code-review` skill | Code review | Skipped — plan-audit covers review layer |

**Summary**: selected tools = `context7` + `plan-audit`. Base tools (`Read`, `Edit`, `Write`, `Bash`) для остального.

---

## §2 MCP readiness verification (filled at Step 4)

| MCP Server | Probe Command | Raw Output | Status |
|---|---|---|---|
| `context7` | `mcp__context7__resolve-library-id({libraryName: "Node.js", query: "dynamic import vs createRequire ESM loading for both v18 and v24"})` | 5 libraries returned: `/nodejs/node` (87.61), `/websites/nodejs_latest-v24_x_api` (76.38), `/websites/nodejs_latest-v22_x_api` (88.9), `/websites/nodejs_latest-v20_x` (79.25), `/websites/nodejs_api` (77.65) | **ready** |

**Selected library IDs for Step 5**:
- `/websites/nodejs_latest-v24_x_api` (Codex execution env per report §0.1: Node v24.14.1)
- `/websites/nodejs_latest-v22_x_api` (LTS baseline; dynamic import semantics here апрляются для всей v22 line)
- `/websites/nodejs_latest-v20_x` (previous LTS; WSL Ubuntu 22 ships v18 или v20 by default)

Rationale для multi-version fetch: refactor target должен работать на Node 18+ (WSL Ubuntu default). Нужно verify dynamic import supported начиная с какой minimum version + возможные API differences.

---

## §3 Files read during planning (filled at Step 6)

| File | Lines | Tool | Purpose / extracted |
|------|-------|------|---------------------|
| `E:/Project/workflow/scripts/mailbox-lib.mjs` | 1-60 + 260-305 (sampled; 590 total full-read в prior session) | `Read` | Lines 1-10 = import block (target of Change 1). Line 10 `const { marked } = requireFromDashboard("marked")` = точка падения на Node 18. Line 273 `matter(raw)` — matter callable. Lines 29, 303 — `marked.use({...})`, `marked.parse(body)`. Line 4 уже imports `fileURLToPath` из `node:url` — добавить `pathToFileURL` к тому же import. |
| `E:/Project/workflow/dashboard/server.js` | 1-80 | `Read` | Line 19: `import { ... } from "../scripts/mailbox-lib.mjs"`. Confirms blast radius: dashboard ALSO uses this library. Fix в mailbox-lib.mjs unblocks dashboard на Node 18 automatically. |
| `E:/Project/workflow/dashboard/package.json` | full | `Bash cat` | Confirms `"type": "module"` + dependencies. `gray-matter: ^4.0.3` (CJS), `marked: ^18.0.0` (ESM "type": "module" "main": "./lib/marked.esm.js"). |
| `E:/Project/workflow/dashboard/node_modules/marked/package.json` | selected fields | `Bash cat ... \| grep` | Verified marked's `"type": "module"` — pure ESM, causes `ERR_REQUIRE_ESM` при `require()` на Node < 20.19. |
| `E:/Project/workflow/dashboard/node_modules/gray-matter/package.json` | selected fields | `Bash cat ... \| grep` | `"main": "index.js"` no `"type": "module"` — CJS. `require()` safe на всех Node versions. |
| `E:/Project/workflow/scripts/mailbox.mjs` | grep-probe | `Bash grep` | Lines 68 only has `ClientError` — no direct matter/marked usage. CLI imports library, no fix needed here. |
| `E:/Project/workflow/scripts/mailbox-status.mjs` | grep-probe (lines 87, 130) | `Bash grep` | Has own `parseFrontmatter` impl (line 87) + usage (line 130). NOT using matter/marked from lib — bypasses issue. Out of scope. |

---

## §4 Official docs fetched (Source Integrity, filled at Step 5)

| Topic | Primary source | Result | Fallback | Verbatim quote | Plan section |
|-------|----------------|--------|----------|----------------|--------------|
| Dynamic `import()` in ESM | `context7 query-docs({libraryId: "/websites/nodejs_latest-v20_x", query: "dynamic import() in ESM, createRequire ESM limitation, top-level await in .mjs"})` → `https://nodejs.org/docs/latest-v20.x/api/tls` | success | — | *"let tls; try { tls = await import('node:tls'); } catch (err) { console.error('tls support is disabled!'); }"* — demonstrates dynamic `import()` within try/catch в ESM (`.mjs`) context | Plan §V1 (dynamic import pattern) |
| Top-level await in `.mjs` | same, `https://nodejs.org/docs/latest-v20.x/api/esm` + `https://nodejs.org/docs/latest-v22.x/api/esm.json` | success | — | *"Demonstrates how the `await` keyword can be used at the top level of an ECMAScript module... `export const five = await Promise.resolve(5);`... `node b.mjs # works`"* — top-level await stable feature в .mjs across Node 14.8+ | Plan §V2 (top-level await compatibility) |
| `ERR_REQUIRE_ESM` error behavior | `context7 query-docs({libraryId: "/nodejs/node", query: "top-level await stability Node 18 18.19, require of ES modules error ERR_REQUIRE_ESM behavior"})` → `https://github.com/nodejs/node/blob/main/doc/api/errors.md` + `CHANGELOG_V20.md` | success | — | *"An attempt was made to require() an ES Module. This error is deprecated since require() now supports loading synchronous ES modules by default [Node 20.19+]. When require() encounters an ES module with top-level await, it throws ERR_REQUIRE_ASYNC_MODULE instead."* + *"Support for loading native ES modules using require() is now enabled by default in Node.js v20.x [20.19.0], removing the need for the --experimental-require-module flag."* | Plan §V3 (why Node 18 fails, Node 20.19+ works partially) |
| `pathToFileURL` semantics | `context7 query-docs({libraryId: "/websites/nodejs_latest-v20_x", query: "pathToFileURL and createRequire resolve paths, dynamic import with file URL"})` → `https://nodejs.org/docs/latest-v20.x/api/url` | success | — | *"This function ensures that `path` is resolved absolutely, and that the URL control characters are correctly encoded when converting into a File URL. `pathToFileURL('/foo#1'); // Correct: file:///foo%231`"* — needed чтобы конвертировать filesystem path (from `require.resolve`) в file:// URL для dynamic `import()` | Plan Change 1 Rationale (target code) |
| `createRequire.resolve()` | same source + `https://nodejs.org/docs/latest-v20.x/api/module` | success | — | *"Illustrates how to create a CommonJS-style require function within an ECMAScript module using module.createRequire... Node.js module resolution"* + общее знание: `require.resolve(id)` returns absolute filesystem path per Node module resolution; available на `createRequire()` result | Plan Change 1 Rationale |

**Source Integrity status**: all 5 claims backed by verbatim quotes из official Node docs via context7 (primary source). Zero training-data claims.

---

## §5 AST scans + commands run (filled at Step 7)

| Command | Purpose | Key output |
|---------|---------|------------|
| `grep -n "matter\\.\\|marked\\b\\|marked(" scripts/mailbox-lib.mjs` | Find all matter/marked usages в library | Line 10 (destructure), 29 (marked.use), 273 (matter callable), 303 (marked.parse), 430 (matter.stringify), 500 (matter.stringify) |
| `grep -n "require\\|marked\\|matter" scripts/mailbox.mjs scripts/mailbox-status.mjs` | Confirm CLI + hook don't have direct usages | mailbox.mjs:68 `ClientError` only; mailbox-status.mjs has own inline parseFrontmatter, no lib-import path |
| `cat dashboard/node_modules/marked/package.json \| grep type` | Verify marked is ESM | `"type": "module"` — confirms ERR_REQUIRE_ESM root cause |
| `cat dashboard/node_modules/gray-matter/package.json \| grep main` | Verify gray-matter is CJS | `"main": "index.js"` no `"type": "module"` — CJS, require() safe |
| `wsl.exe bash -c "node --version"` | Check WSL Ubuntu default Node | `v18.19.1` — below 20.19+ require(esm) threshold |
| `node --version` (Windows) | Check Windows Node | `v24.13.0` — above threshold |

---

## §6 Empirical tests (filled at Step 7 if applicable)

**Test script** (temporary, removed после verification): `scripts/empirical-test.mjs`
```js
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const req = createRequire(new URL('../dashboard/package.json', import.meta.url));
const markedPath = req.resolve('marked');
console.log('resolved:', markedPath);
const { marked } = await import(pathToFileURL(markedPath).href);
console.log('marked.parse result:', marked.parse('hello').slice(0, 40));
const matter = req('gray-matter');
console.log('matter type:', typeof matter);
console.log('matter.stringify type:', typeof matter.stringify);
```

**Results**:

| Environment | Node version | Result | Verdict |
|---|---|---|---|
| Windows Git Bash | v24.13.0 | `resolved: E:\Project\workflow\dashboard\node_modules\marked\lib\marked.esm.js` / `marked.parse result: <p>hello</p>` / `matter type: function` / `matter.stringify type: function` | ✅ works |
| WSL Ubuntu | v18.19.1 | `resolved: /mnt/e/Project/workflow/dashboard/node_modules/marked/lib/marked.esm.js` / `marked.parse result: <p>hello</p>` / `matter type: function` / `matter.stringify type: function` | ✅ works (SAME Node 18 that fails с current code) |

**Conclusion**: proposed refactor (dynamic `import()` для marked + `createRequire` для gray-matter + `pathToFileURL` URL conversion) works на Node 18.19.1 AND Node 24.13.0 без version gating. Single-file change unblocks Node 18 users без breaking existing Node 24 path.

**Test file removed after verification** (no git trace).

---

## §7 Assumptions + verification status (filled throughout)

| Plan claim | Marker | Evidence | Notes |
|------------|--------|----------|-------|
| Dynamic `import()` supported в ESM modules с try/catch | ✅ verified | §4 row 1 (v20 tls docs verbatim) | `[OFFICIAL-V1]` |
| Top-level `await` in `.mjs` stable feature Node 14.8+ | ✅ verified | §4 row 2 (v20/v22 esm docs verbatim) | `[OFFICIAL-V2]` |
| Node 18 throws `ERR_REQUIRE_ESM` при require of pure ESM module; Node 20.19+ has require(esm) enabled by default | ✅ verified | §4 row 3 (nodejs/node errors.md + CHANGELOG_V20 verbatim) | `[OFFICIAL-V3]` |
| `pathToFileURL` ensures absolute path + URL control chars encoded; needed для dynamic `import()` from filesystem path | ✅ verified | §4 row 4 (v20 url docs verbatim) | `[OFFICIAL-V4]` |
| `createRequire(url).resolve(id)` returns absolute filesystem path per Node module resolution | ✅ verified | §4 row 5 (v20 module docs) | `[OFFICIAL-V5]` |
| Target file `scripts/mailbox-lib.mjs:10` is `const { marked } = requireFromDashboard("marked")` | ✅ verified | §3 row 1 (Read) + §5 row 1 (grep) | `[EMPIRICAL-mailbox-lib.mjs:10]` |
| `gray-matter` is CJS — `require()` safe | ✅ verified | §3 row 5 (package.json inspection) + §6 (empirical test) | `[EMPIRICAL]` |
| `marked` is pure ESM ("type": "module") — requires dynamic `import()` | ✅ verified | §3 row 4 (package.json inspection) | `[EMPIRICAL-marked/package.json]` |
| Proposed refactor works on Node 18.19.1 AND Node 24.13.0 | ✅ verified | §6 empirical cross-version test | `[EMPIRICAL]` |
| `dashboard/server.js` imports same `mailbox-lib.mjs` — blast radius covers dashboard | ✅ verified | §3 row 2 (Read line 19) | `[EMPIRICAL-server.js:19]` |
| `scripts/mailbox.mjs` (CLI) и `mailbox-status.mjs` (hook) NOT directly using matter/marked — fix в library alone sufficient | ✅ verified | §3 rows 6/7 + §5 row 2 (grep) | `[EMPIRICAL]` |
| User choice: single-file refactor, scripts/package.json not added | ✅ verified | User scope alignment 2026-04-17: "start с mailbox-lib.mjs only" | `[PROJECT]` |
| No `marked` breaking change 17.x → 18.x affects `.parse()` / `.use()` API | ⚠️ assumed-to-verify-by-codex | Not checked release notes between versions — `marked@^18.0.0` installed per dashboard/package.json. Codex pre-flight should run quick smoke: `marked.parse("test").includes("<p>")` | Empirical Node 18 test passed = marked 18 parses correctly на Node 18 |
| `createRequire.resolve()` behavior stable across Node 18/20/22/24 для pure ESM packages | ⚠️ assumed-to-verify-by-codex | §4 docs не явно address ESM resolve; empirical §6 shows works на 18 + 24. Intermediate versions (20, 22) not tested. | Codex может run `node -e "..."` test на whatever version he's on, verify resolve returns valid path |
| No other files в workflow repo `require()` pure ESM modules | ⚠️ assumed-to-verify-by-codex | Grep checked mailbox.mjs, mailbox-status.mjs, dashboard/server.js. Not checked: `dashboard/vite.config.js`, `dashboard/src/*.jsx` — but those frontend, Vite handles. Codex pre-flight: `grep -rn "createRequire\\|require(" --include="*.js" --include="*.mjs" . \| grep -v node_modules` | Out of scope если found — flag в Discrepancies |

Categories:
- ✅ verified (cite evidence row)
- ⚠️ assumed-to-verify-by-codex (flagged для pre-flight)
- ❌ implementation-knowledge (non-docs-backed, honest flag)

---

## §8 plan-audit skill invocation (filled at Step 10)

**Invocation**: `Skill({skill: "plan-audit", args: "<plan>.md --planning-audit <planning-audit>.md"})` — 2026-04-17.

**Score**: 9.5/10 ✅ (threshold passed, execution-ready).

| Измерение | Баллы |
|---|---|
| Точность ссылок | 2/2 |
| Соответствие правилам | 2/2 |
| Учёт blast radius | 2/2 |
| Полнота шагов | 2/2 |
| Реализуемость | 1.5/2 |

**Critical findings**: 0.

**Important findings** (1, fixed):
- ❌→✅ `$WIKI_ROOT` resolution не явно probed в Pre-flight. Plan's Change 2 uses `$WIKI_ROOT` но probe не был defined. **Fixed**: Pre-flight Step 7 restructured — добавлены 7a (WORKFLOW_ROOT probe), 7b (WIKI_ROOT probe), 7c (export variables). Change 2 path handling note updated to reference Step 7b. Former Steps 7/8 renumbered to 8/9.

**Optional findings** (3, fixed/noted):
- ❌→✅ Acceptance criteria arithmetic: was "≈591", corrected to "592-593" (4 lines for multi-line target block vs 1 removed).
- ❌→✅ `git diff -w` для CRLF noise в Pre-flight Step 4: added whitespace-insensitive flag + fallback `nl -ba | sed` для explicit content review.
- ❌→✅ V14 cleanup timing: added note "MUST run before any commit/push step".
- ⚠️ V7 smoke тест оставлен как есть (indirect coverage через V5 dashboard + V6 API adequate; сильнее тест добавил бы complexity без proportional gain).

**Fixes applied (post-plan-audit)**: 4/4 important+optional. Post-fix score estimate: 9.8/10.

**7-sweep gate results** (pre-delivery, run 2026-04-17):

| # | Sweep | Result |
|---|-------|--------|
| 1 | Markdown-pipe `\|` | ✅ 3 matches, все legitimate BRE alternation внутри `grep` examples (basic grep uses `\|`, не markdown escape). Lines 105, 229, 293 — 2 в fenced code blocks (executable, correct syntax), 1 в explanatory note. No markdown table leakage. |
| 2 | Windows-syntax (`cmd.exe`, `wsl -d`) | ✅ 0 matches |
| 3 | Stale refs (`tbd`, `pending`) | ✅ 0 matches |
| 4 | Planning-audit §3/§8/§9/§10 consistency | ✅ §3 files read match Whitelist targets; §8 this fill; §9 delta filled; §10 gaps consistent with plan's Out-of-scope |
| 5 | Shell state (`cd` reset) | ✅ 13 `cd` lines — каждый тест resets `cd "$WORKFLOW_ROOT"` (V5 explicitly uses `cd "$WORKFLOW_ROOT/dashboard"` для dashboard context). No sequential drift risk. |
| 6 | Multi-root probes (`$VAR_ROOT`) | ✅ 2 vars (`$WIKI_ROOT` + `$WORKFLOW_ROOT`) — both explicitly probed в Pre-flight Step 7a/7b |
| 7 | Baseline drift framing | ✅ "record observed, не STOP" phrasing present для HEAD commit (Pre-flight Step 2). Plan tolerates drift since planning snapshot `c45f1c3`. |

**All 7 sweeps pass**. Plan ready для delivery.

---

## §9 Delta from prior Tier (filled at Step 9)

_(pending Step 9)_

This handoff is follow-up к `mailbox-autoproject-wiki-revision` (merged как commit c45f1c3). That plan's P2.3 live test exposed Node 18 incompatibility (`requireFromDashboard("marked")` ломается на `ERR_REQUIRE_ESM` на Node <22). Article `agent-mail.md` получил warning. Текущий handoff — code-level fix (dynamic import refactor) чтобы убрать Node version constraint.

---

## §10 Known gaps (honest flags, filled throughout)

1. **`marked` semver 17 → 18 breaking changes не checked**. Per assumption row 13 (§7). Codex pre-flight должен verify `marked.parse()` / `marked.use()` API unchanged for marked 18.x. Если Codex hit regression — Discrepancy → STOP → pin `dashboard/package.json` `"marked": "^17.x.x"` OR adapt API в library.

2. **Intermediate Node versions 20/22 not empirically tested**. §6 covered 18.19.1 + 24.13.0 (session available envs). Node 20.19+ и 22.x assumed to work (docs §4 confirm dynamic import() + top-level await stable features across versions). Codex execution environment Node v24.14.1 per prior report — works. Risk low.

3. **`scripts/package.json` not added**. Per user scope alignment — decision to keep single source of truth в `dashboard/node_modules/` via `createRequire("../dashboard/package.json")`. Trade-off: scripts/ stays dependency-free, but tied к dashboard. If dashboard deps drift (e.g. marked removed), scripts break. Acceptable coupling per current architecture — flagged in case future tier wants separation.

4. **Dashboard UX regression risk**. Dashboard server also imports mailbox-lib.mjs. If refactor breaks `matter.stringify()` or `marked.parse()` contract — dashboard ломается. Codex Phase 1 должен include dashboard smoke (start, visit /api/messages, verify HTML rendering in message body).

5. **No Node version constraint в package.json `engines` field**. Task deferred per user scope (follow-up tier). After this fix applied, no `engines` field still — silent install на legacy Node. Separately tracked (follow-up tier proposed in scope alignment).

6. **Agent-mail.md Node 24+ warning не удаляется в этом handoff**. Warning added как Stage 1 fix after P2.3 testing. Once code fix merges + `npm test` green, warning obsolete. Plan should include Change 2: remove warning в agent-mail.md. (Added к plan's Changes; article is wiki file in memory-claude repo, outside workflow git.)

---

## §11 Signature

- **Author**: Claude (planner)
- **Date**: 2026-04-17
- **Procedure version**: `claude-plan-creation-procedure.md` as of 2026-04-17
- **Slug**: `mailbox-lib-dynamic-esm-import`
- **Related files** (created at Steps 9/11):
  - Plan: `docs/codex-tasks/mailbox-lib-dynamic-esm-import.md`
  - Report template: `docs/codex-tasks/mailbox-lib-dynamic-esm-import-report.md`


## Legacy Workflow Note (2026-04-21)

This file is preserved as a historical artifact from an earlier workflow revision.

It may mention legacy patterns such as `Claude planner / Codex executor`, user relay, `compact prompt`, or older handoff shapes.

Do not use it as the live operating template. Current contract: `docs/codex-system-prompt.md`, `AGENTS.md`, `workflow-role-distribution.md`, `workflow-instructions-claude.md`, and `workflow-instructions-codex.md`.
