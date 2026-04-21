# Mailbox Lib Dynamic ESM Import — Execution Plan

**Version**: v1 (2026-04-17)
**Planning-audit**: `docs/codex-tasks/mailbox-lib-dynamic-esm-import-planning-audit.md`

---

## Why this plan exists

P2.3 verification прошлого handoff `mailbox-autoproject-wiki-revision` (merged c45f1c3) exposed real-world regression:

- `scripts/mailbox-lib.mjs:10` uses `requireFromDashboard("marked")` — `createRequire()` of pure ESM module.
- Node 18.x (WSL Ubuntu default) throws `ERR_REQUIRE_ESM` — CLI + dashboard server ломаются.
- Node 20.19+ has `require(esm)` enabled by default (works), Node 18 does not.
- Current mitigation: `agent-mail.md` получил warning "Node 24+ required" — UX friction для WSL default users.

This handoff fixes root cause: заменить static `require("marked")` на dynamic `import()` pattern, works across Node 18+ без version gating. Removes warning from `agent-mail.md` afterwards.

---

## Иерархия источников правды

1. **Node.js v20/v22/v24 official docs** (via `context7`) — primary source
2. **Реальное состояние кода** на диске — `scripts/mailbox-lib.mjs` текущее содержимое
3. **Этот план** — третья правда, может содержать ошибки
4. **Discrepancy-first**: plan ≠ reality → STOP → log → wait

---

## Doc Verification (§V1-§V5)

Codex перепроверяет verbatim quotes перед Changes.

### §V1 — Dynamic `import()` in ESM

**Source**: `https://nodejs.org/docs/latest-v20.x/api/tls` (via `context7` `/websites/nodejs_latest-v20_x`)

**Verbatim**: *"let tls; try { tls = await import('node:tls'); } catch (err) { console.error('tls support is disabled!'); }"* — official example of dynamic `import()` within `.mjs` / ESM module.

### §V2 — Top-level `await` in `.mjs`

**Source**: `https://nodejs.org/docs/latest-v20.x/api/esm` + `https://nodejs.org/docs/latest-v22.x/api/esm.json` (via `context7`)

**Verbatim**: *"`export const five = await Promise.resolve(5);` ... `node b.mjs # works`"* — top-level await stable feature в `.mjs` files, supported Node 14.8+.

### §V3 — `ERR_REQUIRE_ESM` vs `require(esm)` behavior

**Source**: `https://github.com/nodejs/node/blob/main/doc/api/errors.md` + `CHANGELOG_V20.md` (via `context7` `/nodejs/node`)

**Verbatim**: *"An attempt was made to require() an ES Module. This error is deprecated since require() now supports loading synchronous ES modules by default."* + *"Support for loading native ES modules using require() is now enabled by default in Node.js v20.x [20.19.0]."*

**Implication**: Node < 20.19 → `require(esm)` throws. Node 20.19+ → works для sync ESM, throws `ERR_REQUIRE_ASYNC_MODULE` если target has top-level await. Dynamic `import()` works on ALL Node versions (14.8+), avoiding this split.

### §V4 — `pathToFileURL` semantics

**Source**: `https://nodejs.org/docs/latest-v20.x/api/url` (via `context7`)

**Verbatim**: *"This function ensures that `path` is resolved absolutely, and that the URL control characters are correctly encoded when converting into a File URL."* — `pathToFileURL('/foo#1')` returns `file:///foo%231` (POSIX). Needed to convert filesystem path (from `createRequire.resolve()`) to file URL для dynamic `import()`.

### §V5 — `createRequire(url).resolve(id)`

**Source**: `https://nodejs.org/docs/latest-v20.x/api/module` (via `context7`)

**Verbatim**: *"Illustrates how to create a CommonJS-style require function within an ECMAScript module using module.createRequire. The filename parameter is crucial for resolving module paths correctly."* — `createRequire()` returned function supports `.resolve(id)` per Node module resolution (returns absolute filesystem path).

---

## Pre-flight verification (Codex executes before any Change)

Record в report §0 raw outputs.

1. **Environment**: `uname -a && node --version && pwd`
2. **HEAD commit**: `git log --oneline -1` — record observed. Planning snapshot HEAD: `c45f1c3 feat(mailbox): auto-detect project from cwd + agent-mail wiki guide`. Non-match → record observed, не STOP.
3. **Working tree fresh snapshot**: `git status --short`. Expected clean or close to (untracked launchers + `.codex` per baseline discipline). STOP только при unexpected modifications to target file.
4. **Pre-edit diff inspection**: `git diff -w -- scripts/mailbox-lib.mjs` (whitespace-insensitive чтобы отфильтровать CRLF churn). Change 1 target lines 1-10 должны быть untouched from HEAD (meaningful-content wise). Для explicit review relevant lines: `nl -ba scripts/mailbox-lib.mjs | sed -n '1,12p'`. Если modified meaningfully — investigate, STOP если conflict.
5. **Read target files fully** (not grep):
   - `scripts/mailbox-lib.mjs` (590 lines)
   - `dashboard/server.js` (to verify same imports consumer) — selected lines 1-50
   - `scripts/mailbox.mjs` (321 lines — consumer)
6. **Doc Verification §V1-§V5**: fetch каждый source, verbatim quote, ✅/❌ match.
7. **Filesystem root probes** (two distinct roots — workflow repo + memory-claude wiki repo). Codex executes из своей WSL shell (inside WSL, direct Linux, no `wsl.exe` wrapper):
   
   **7a. WORKFLOW_ROOT probe**:
   ```bash
   ls /mnt/e/project/workflow 2>&1 | head -3
   ls /mnt/e/Project/workflow 2>&1 | head -3
   # Export: WORKFLOW_ROOT="<whichever succeeded, prefer Windows Explorer casing>"
   ```
   
   **7b. WIKI_ROOT probe** (memory-claude repo, отдельный filesystem root):
   ```bash
   ls "/mnt/e/project/memory claude/memory claude" 2>&1 | head -3
   ls "/mnt/e/Project/memory claude/memory claude" 2>&1 | head -3
   # Export: WIKI_ROOT="<whichever succeeded>"
   ```
   
   **7c. Export variables** для remaining steps:
   ```bash
   export WORKFLOW_ROOT="..."
   export WIKI_ROOT="..."
   ```
   
   Note: WSL2 с `case=off` оба casing могут "succeed" — выбрать matching Windows Explorer display. V10/V11/V13 используют `$WIKI_ROOT` — **никаких hardcoded paths** в executable commands.

8. **Side-effects grep** (addresses planning-audit §10 gap 4): `grep -rn "createRequire\|require(" --include="*.js" --include="*.mjs" . | grep -v node_modules` — find other potential Node version issues. Flag в Discrepancies если found outside `mailbox-lib.mjs`.
9. **Baseline Node version probe**: `node --version` (в Codex's WSL shell). Document в report §0.

If ANY pre-flight step fails → STOP → log в Discrepancies → wait for user.

---

## Whitelist

### Modify (production code)

| # | Path | What changes |
|---|------|--------------|
| W1 | `scripts/mailbox-lib.mjs` | Lines 1-10 (import block): (a) extend line 4 `import { fileURLToPath } from "node:url"` to also import `pathToFileURL`; (b) replace line 10 `const { marked } = requireFromDashboard("marked")` with dynamic `import()` block using `pathToFileURL(requireFromDashboard.resolve("marked"))` |

### Update (wiki, local-only)

| # | Path (Windows-reference / WSL-executable) | What changes |
|---|-------------------------------------------|--------------|
| W2 | `E:/Project/memory claude/memory claude/wiki/concepts/agent-mail.md` → `$WIKI_ROOT/wiki/concepts/agent-mail.md` | Remove Node 24+ warning blocks (2 places: § "Пути окружения" bullet + § "Troubleshooting" bullet). Replaced by note "Node 18+ supported" — less restrictive. |

### Meta-artifacts (allowed outside whitelist)

- `docs/codex-tasks/mailbox-lib-dynamic-esm-import-report.md` — Codex fills
- `docs/codex-tasks/mailbox-lib-dynamic-esm-import-planning-audit.md` — already written by Claude

### НЕ трогать (explicit "do not modify")

- `scripts/mailbox.mjs` — CLI consumer, no direct matter/marked use. Import chain через lib — fix propagates automatically.
- `scripts/mailbox-status.mjs` — has own inline `parseFrontmatter`, bypasses lib entirely. Out of scope.
- `dashboard/server.js` — imports lib; fix propagates. Do NOT edit.
- `dashboard/src/*.jsx`, `dashboard/vite.config.js` — frontend layer, Vite handles ESM separately. No change.
- `dashboard/package.json` — dependencies unchanged (`marked: ^18.0.0`, `gray-matter: ^4.0.3` remain). No `engines` field added в этом handoff (deferred per scope alignment).
- `docs/codex-tasks/multi-project-support*.md` + prior handoff files — historical reports. Immutable per audit-trail preservation rule.
- `wiki/concepts/inter-agent-file-mailbox.md` — background, untouched.
- `agent-mailbox/**` — runtime data, не part of this fix.

---

## Changes

### Change 1 — `scripts/mailbox-lib.mjs` dynamic import refactor

**File**: `scripts/mailbox-lib.mjs`
**Lines**: 1-10 (import block).

**Current code (lines 1-10)**:

```js
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const requireFromDashboard = createRequire(
  new URL("../dashboard/package.json", import.meta.url)
);
const matter = requireFromDashboard("gray-matter");
const { marked } = requireFromDashboard("marked");
```

**Target code**:

```js
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const requireFromDashboard = createRequire(
  new URL("../dashboard/package.json", import.meta.url)
);
const matter = requireFromDashboard("gray-matter");
const markedModule = await import(
  pathToFileURL(requireFromDashboard.resolve("marked")).href
);
const { marked } = markedModule;
```

**Rationale**:
- `gray-matter` (CJS) continues via `createRequire` — works all Node versions (§V5).
- `marked` (pure ESM) loaded via dynamic `import()` — avoids `ERR_REQUIRE_ESM` на Node 18 (§V3).
- `requireFromDashboard.resolve("marked")` returns absolute filesystem path (§V5: `require.resolve()` follows Node module resolution).
- `pathToFileURL(...).href` converts path to `file://...` URL required для dynamic `import()` (§V4).
- Top-level `await` в `.mjs` stable Node 14.8+ (§V2).
- Dynamic `import()` pattern per §V1 official example.
- Existing `fileURLToPath` import (line 4) remains for `__filename` usage (line 34). Extended to также import `pathToFileURL`.
- Empirical cross-version test (planning-audit §6): works Node 18.19.1 (WSL) + Node 24.13.0 (Windows).

**Downstream impact**:
- `marked.use({ breaks: true, gfm: true })` on line 29 unchanged (still works — `markedModule.marked` exposes same API).
- `marked.parse(body)` on line 303 unchanged.
- `matter(raw)` on line 273, `matter.stringify(...)` on lines 430, 500 — unchanged (gray-matter path unchanged).

### Change 2 — `wiki/concepts/agent-mail.md` warning removal

**File (WSL-executable)**: `$WIKI_ROOT/wiki/concepts/agent-mail.md`. Windows-reference: `E:/Project/memory claude/memory claude/wiki/concepts/agent-mail.md`.

**Path handling**: `$WIKI_ROOT` resolved via Pre-flight Step 7b probe. All Change 2 commands use `$WIKI_ROOT/wiki/concepts/agent-mail.md`, no hardcoded Windows or WSL paths in edits.

#### 2a — Remove § "Пути окружения" Node 24 warning

**Current (verbatim, bullet added в prior handoff)**:
```
- **Требуется Node.js 24+.** WSL Ubuntu default — Node 18, ломается на `ERR_REQUIRE_ESM` в `mailbox-lib.mjs` (`marked`/`gray-matter` ESM). Проверено 2026-04-17. Установить: `nvm install 24 && nvm use 24` (WSL) или Windows installer.
```

**Target**: bullet **удалить полностью**. Replace не нужна — ограничение снято этим handoff.

#### 2b — Remove § "Troubleshooting" ERR_REQUIRE_ESM bullet

**Current**:
```
- **`ERR_REQUIRE_ESM` / `Cannot use require() for ES Module` при запуске CLI** — Node version < 24. Проверить `node --version`; если 18.x/20.x — `nvm install 24 && nvm use 24`. См. § "Пути окружения".
```

**Target**: bullet **удалить полностью**. После Change 1, `ERR_REQUIRE_ESM` perестаёт occur; troubleshooting row obsolete.

---

## Verification phases

### Phase 1 — Codex self-check (mandatory, completable offline)

Report each with command + raw stdout/exit code в report §2.x. Commands in fenced code blocks (не table cells — Codex audit 4 2026-04-17 confirmed `\|` в tables breaks copy-paste).

| # | Test | Expected result |
|---|------|-----------------|
| V1 | Line 10 replacement applied (see code block V1) | Post-edit `sed -n '1,15p' scripts/mailbox-lib.mjs` shows new dynamic `import()` block |
| V2 | Import extended (see code block V2) | Line 4 contains `pathToFileURL` |
| V3 | CLI basic `list` works (see code block V3) | Table output with headers, exit 0 |
| V4 | CLI `send` works (see code block V4) | Message created, JSON output |
| V5 | Dashboard starts (see code block V5) | `Server listening on 127.0.0.1:3003` appears (allow up to 15s) |
| V6 | Dashboard `GET /api/messages` returns JSON (see code block V6) | HTTP 200 + JSON body with toClaude/toCodex/archive arrays |
| V7 | `marked.parse()` produces HTML (see code block V7) | Body contains `<p>` tag |
| V8 | `matter.stringify()` produces frontmatter (see code block V8) | Output starts with `---\n` |
| V9 | WSL Node 18 run (see code block V9) | Same results as Node 24 — no `ERR_REQUIRE_ESM` |
| V10 | Wiki article warnings removed (see code block V10) | `grep` на удалённые bullets returns empty |
| V11 | No other `require()` of ESM в repo (see code block V11) | Empty, или only `mailbox-lib.mjs:9` gray-matter (CJS, safe) |
| V12 | Personal data scan per CI regex (see code block V12) | Zero matches в staged diff |
| V13 | Absolute path leak scan (see code block V13) | Zero matches |

**Executable commands** (copy-paste-safe, cwd resets explicit):

```bash
# V1 — Post-edit line 1-15 inspection
cd "$WORKFLOW_ROOT"
sed -n '1,15p' scripts/mailbox-lib.mjs

# V2 — Import extended check
cd "$WORKFLOW_ROOT"
grep -n "pathToFileURL" scripts/mailbox-lib.mjs

# V3 — CLI list
cd "$WORKFLOW_ROOT"
node scripts/mailbox.mjs list | head -5

# V4 — CLI send (generates fixture, cleaned в V14)
cd "$WORKFLOW_ROOT"
node scripts/mailbox.mjs send --from codex --to claude --thread v4-esm-fix-smoke --body "V4 smoke" --json

# V5 — Dashboard start (longer timeout 15s per prior V15 discrepancy)
cd "$WORKFLOW_ROOT/dashboard"
timeout 15 node server.js 2>&1 | head -5

# V6 — Dashboard API probe (requires dashboard running separately OR use curl against cached server)
# Codex запускает server в background (например with_server.py), затем:
curl -s http://127.0.0.1:3003/api/messages | head -c 200

# V7 — marked.parse() smoke
cd "$WORKFLOW_ROOT"
node --input-type=module -e "import('./scripts/mailbox-lib.mjs').then(m => { /* library loads */ console.log('library loaded OK'); })"

# V8 — matter.stringify smoke (via real send then read)
cd "$WORKFLOW_ROOT"
LATEST=$(ls -t agent-mailbox/to-claude/*v4-esm-fix-smoke*.md | head -1)
head -2 "$LATEST"

# V9 — WSL Node 18 run (если environment matches)
wsl.exe bash -c "cd /mnt/e/Project/workflow && node scripts/mailbox.mjs list | head -3"

# V10 — Wiki warnings removed
cd "$WORKFLOW_ROOT"
grep -Fn "Требуется Node.js 24+" "$WIKI_ROOT/wiki/concepts/agent-mail.md" || echo "CLEAN V10a"
grep -Fn "ERR_REQUIRE_ESM" "$WIKI_ROOT/wiki/concepts/agent-mail.md" || echo "CLEAN V10b"

# V11 — Other require() of ESM check
cd "$WORKFLOW_ROOT"
grep -rn "createRequire\|require(" --include="*.js" --include="*.mjs" . 2>/dev/null | grep -v node_modules | grep -v ".git/" || echo "(no direct require outside mailbox-lib)"

# V12 — Personal data scan (dynamic extraction из .github/workflows/ci.yml PD_PATTERNS env var — single source of truth; plan НЕ hardcodes names чтобы не самоматчиться на CI regex).
cd "$WORKFLOW_ROOT"
PD_PATTERNS=$(grep -oP '(?<=PD_PATTERNS: ).*' .github/workflows/ci.yml)
grep -riE "$PD_PATTERNS" --include="*.js" --include="*.jsx" --include="*.json" --include="*.md" --include="*.html" --exclude-dir=.github -l .

# V13 — Absolute path leak scan
cd "$WORKFLOW_ROOT"
grep -n "/mnt/" scripts/mailbox-lib.mjs
grep -n "E:\\\\" scripts/mailbox-lib.mjs
grep -n "C:\\\\Users" scripts/mailbox-lib.mjs

# V14 — Cleanup test fixture (MUST run before any commit/push step — fixture otherwise may leak into staged diff)
cd "$WORKFLOW_ROOT"
rm -f agent-mailbox/to-claude/*v4-esm-fix-smoke*.md
```

### Phase 2 — `[awaits user]`

- P2.1 — User switches WSL default Node to 18.x or 20.x → runs `node scripts/mailbox.mjs list` — no ERR_REQUIRE_ESM → Codex fix verified cross-version в user's real env.
- P2.2 — User restart dashboard → visually checks UI still works (messages render Markdown via `marked`).

### Phase 3 — `[awaits N-day]`

- P3.1 — 7-day observation: no CI failures, no user reports of broken CLI.

---

## Acceptance criteria

- [ ] `scripts/mailbox-lib.mjs:1-10` replaced per Change 1 target
- [ ] Line 4 `import { fileURLToPath, pathToFileURL } from "node:url"`
- [ ] No new imports added except `pathToFileURL` (existing `createRequire`, `fileURLToPath` stay)
- [ ] `scripts/mailbox-lib.mjs` total line count 592-593 (was 590, +2-3 lines for multi-line dynamic import block; exact count depends on formatting)
- [ ] `$WIKI_ROOT/wiki/concepts/agent-mail.md` — 2 Node 24 warning bullets removed (§ "Пути окружения" + § "Troubleshooting")
- [ ] V1-V13 all ✅ в report (V14 — cleanup, не acceptance)
- [ ] `dashboard/package.json` **unchanged**
- [ ] `scripts/mailbox.mjs` **unchanged**
- [ ] No personal data leaks (V12 clean)
- [ ] No absolute path leaks в production code (V13 clean)
- [ ] Self-audit checklist all ✅

---

## Out of scope (НЕ делать)

- `scripts/package.json` creation (planning-audit §10 gap 3 — deferred to follow-up tier).
- `engines` field в `dashboard/package.json` или root (planning-audit §10 gap 5 — deferred).
- `marked@17.x` pin if version regression found (flag в Discrepancies, user decides).
- Any refactor of `matter`/`gray-matter` usage (CJS path stays).
- Dashboard UI changes.
- Other scripts (`mailbox.mjs`, `mailbox-status.mjs`) — no direct fix needed.
- Tests infrastructure (Tier 4 follow-up per scope alignment).
- Changes к `inter-agent-file-mailbox.md` wiki concept.
- Automatic git commit/push.

---

## Rollback

Codex выполняет из своей WSL-сессии. Все paths — Linux-native.

```bash
# Revert code change
cd "$WORKFLOW_ROOT"
git checkout HEAD -- scripts/mailbox-lib.mjs

# Restore Node 24+ warning в agent-mail.md (edit manually — two bullets)
# Per agent-mail.md:
# 1. § "Пути окружения" — re-add bullet "Требуется Node.js 24+..."
# 2. § "Troubleshooting" — re-add bullet "ERR_REQUIRE_ESM..."
# (article is wiki file in memory-claude repo, gitignored — not git revert)
```

---

## Discrepancy-first checkpoints (STOP conditions)

1. **Pre-flight Step 4** `git diff scripts/mailbox-lib.mjs` shows target lines already modified → STOP → investigate, log.
2. **Pre-flight Step 7** side-effects grep finds другие `createRequire` + ESM require patterns → log all в Discrepancies, Codex does NOT modify (out of scope).
3. **V3 CLI list fails** with new error (not `ERR_REQUIRE_ESM`) → STOP → investigate import resolution, check marked/gray-matter resolvable paths.
4. **V5 dashboard fails start** → STOP → check server.js import chain.
5. **V7 `marked.parse` throws** или returns non-HTML → marked 18.x API regression → pin to 17.x or flag user decision.
6. **V9 WSL Node 18 still fails** → STOP → возможно Codex's pre-flight Node version < 18.0 (dynamic import требует 14.8+, should be safe на любом 18.x).
7. **V12 personal data scan** finds anything → STOP → sanitize before commit.
8. **plan-audit skill score < 7/10** at Step 10 → do NOT deliver handoff; return to Claude for revision.

---

## Self-audit checklist (Codex fills before marking done)

1. [ ] Pre-flight §0.1-§0.8 sections complete with raw command output
2. [ ] Doc Verification §V1-§V5 each has verbatim quote + URL + ✅/❌
3. [ ] Change 1 applied: diff shows only lines 1-10 of `scripts/mailbox-lib.mjs` changed
4. [ ] Change 2a + 2b applied: 2 bullets removed из `agent-mail.md`, no других edits
5. [ ] V1-V13 all recorded с real stdout, не "should pass"
6. [ ] Test fixture cleaned (V14)
7. [ ] Personal-data scan V12 clean
8. [ ] Absolute-path scan V13 clean
9. [ ] No files modified outside whitelist (verify via `git status`)
10. [ ] No git commit / push performed
11. [ ] Discrepancies section completed (even if "none")
12. [ ] Out-of-scope temptations noted (если были)
13. [ ] Report file location exact: `docs/codex-tasks/mailbox-lib-dynamic-esm-import-report.md`

---

## Notes для Codex

1. **Planning-audit as evidence trail**: `mailbox-lib-dynamic-esm-import-planning-audit.md` contains full research chain. Каждый `[OFFICIAL]`/`[EMPIRICAL]`/`[PROJECT]` marker в этом plan имеет row в §7.

2. **Top-level `await` в `.mjs` is stable feature** per §V2. Adding `await import(...)` at top level of `scripts/mailbox-lib.mjs` safe on Node 14.8+.

3. **`require()` of ESM behavior differs by Node version** per §V3: Node 18 throws `ERR_REQUIRE_ESM`, Node 20.19+ handles sync ESM. Plan's fix (dynamic `import()`) sidesteps entire issue — works on ALL Node 14.8+.

4. **`marked` is ESM, `gray-matter` is CJS** — verified via `package.json` inspection (planning-audit §3). `marked` needs dynamic import; `gray-matter` stays via `createRequire`.

5. **Dashboard blast radius**: `dashboard/server.js:19` imports same `mailbox-lib.mjs`. Fix propagates. V5 + V6 verify dashboard works post-fix.

6. **`agent-mail.md` lives in memory-claude repo** (outside workflow git). Changes do NOT show в `workflow git diff`. Verify via explicit file read / grep per V10.

7. **Node version cross-check**: V9 runs на WSL Node 18 если WSL env available. Если Codex's shell is Node 24, V9 alternative = `nvm use 18 && node scripts/mailbox.mjs list` если nvm available. If neither works — flag в Discrepancies "V9 could not be run на Node 18; Node 14.8+ support inferred from docs §V1-§V5", acceptable.

8. **No 4th file**: compact invocation inline в chat message, NOT as `<slug>-prompt.md`.

---

## Commits strategy

- **Do not commit** anything during this handoff. Codex finishes с report + modified file(s) on disk.
- When user reviews и says `commit`, suggested **one commit** with message template:

  ```
  fix(mailbox-lib): dynamic import() for marked — unblock Node 18+

  scripts/mailbox-lib.mjs:4,10 — replace require(ESM) pattern with
  dynamic import() + createRequire.resolve() + pathToFileURL. Works
  across Node 14.8+ without ERR_REQUIRE_ESM. Empirically verified
  Node 18.19.1 + Node 24.13.0.

  agent-mail.md (memory-claude repo, outside workflow git):
  - § "Пути окружения" Node 24+ bullet removed
  - § "Troubleshooting" ERR_REQUIRE_ESM bullet removed

  Docs verified via context7 for Node v20/v22 top-level await +
  dynamic import() + pathToFileURL.
  ```
- Split commit **not recommended**: single logical fix (dependency-loading refactor).


## Legacy Workflow Note (2026-04-21)

This file is preserved as a historical artifact from an earlier workflow revision.

It may mention legacy patterns such as `Claude planner / Codex executor`, user relay, `compact prompt`, or older handoff shapes.

Do not use it as the live operating template. Current contract: `docs/codex-system-prompt.md`, `AGENTS.md`, `workflow-role-distribution.md`, `workflow-instructions-claude.md`, and `workflow-instructions-codex.md`.
