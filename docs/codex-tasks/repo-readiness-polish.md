# Repo Readiness Polish — Execution Plan

**Version**: v1 (2026-04-17)
**Planning-audit**: `docs/codex-tasks/repo-readiness-polish-planning-audit.md`

---

## Why this plan exists

После 3 handoffs сегодня (`c45f1c3`, `e22b83f`, `1c031b6`) workflow project functionally complete, но lacks setup documentation for new users. Gaps:
- No `README.md` — публичный repo `ub3dqy/workflow` без landing page.
- No `engines` field в `dashboard/package.json` — silent install на старых Node.
- `.codex` + launchers — perpetually untracked (dirty `git status`).

This handoff ships "готовый продукт" state: README + config hygiene. Zero functional code changes — docs/config only.

---

## Иерархия источников правды

1. **Npm docs** (via `context7`) — engines field spec, advisory behavior
2. **Реальное состояние workflow repo** — files existence, content, .gitignore
3. **Existing workflow docs** (CLAUDE.md, workflow-*.md) — README references, не duplicates
4. **Этот план** — может содержать ошибки
5. **Discrepancy-first** — plan ≠ reality → STOP → log → wait

---

## Doc Verification

### §V1 — `engines` field semver + advisory behavior

**Source**: `https://docs.npmjs.com/cli/v11/configuring-npm/package-json` (via context7 `/websites/npmjs`)

**Verbatim**: *"Specifies the required versions of Node.js and npm for the package. These settings are advisory and trigger warnings during installation unless strict mode is enabled."* + example:
```json
{"engines": {"node": ">=0.10.3 <15", "npm": "~1.0.20"}}
```

### §V2 — `engines` install behavior

**Source**: `https://docs.npmjs.com/cli/install` (via context7)

**Verbatim**: *"If no version is specified, or if the wildcard '*' is used, any version is considered acceptable. Unless the engine-strict configuration flag is enabled, this field is advisory and will only trigger warnings during installation when the package is used as a dependency."*

### §V3 — Node 20.19+ require(esm) enabled by default (reused from prior handoff)

**Source**: `https://github.com/nodejs/node/blob/main/doc/changelogs/CHANGELOG_V20.md` (via context7 `/nodejs/node`, prior handoff `mailbox-lib-dynamic-esm-import` planning-audit §4)

**Verbatim**: *"Support for loading native ES modules using require() is now enabled by default in Node.js v20.x [20.19.0]."*

**Implication**: `engines.node: ">=20.19"` floor aligns с prior `mailbox-lib.mjs` ESM fix. Older Node would work технически (prior handoff verified Node 18.19.1), but 20.19+ — cleaner contract для future ESM evolution.

---

## Pre-flight verification

Record в report §0 raw output.

1. **Environment**: `uname -a && node --version && pwd`
2. **HEAD commit**: `git log --oneline -1`. Planning snapshot `1c031b6 feat(dashboard): hide archive-only projects from filter dropdown`. Drift → record, не STOP.
3. **Working tree**: `git status --short`. Expected baseline на 2026-04-17 (может drift — fresh probe authoritative):
   - `M scripts/mailbox.mjs` — **pre-existing**, preserved как out-of-scope per Whitelist "НЕ трогать"
   - `?? .codex` — Codex sandbox state (будет gitignored via Change 3, исчезнет из status после git recognizes updated .gitignore)
   - `?? start-workflow.cmd`, `?? start-workflow-hidden.vbs`, `?? stop-workflow.cmd` — launchers (будут staged via Change 4)
   - `?? docs/codex-tasks/repo-readiness-polish*.md` — этот handoff's three files
   
   **Record observed**, не STOP на pre-existing state. STOP только если unexpected production code modifications (anything beyond `scripts/mailbox.mjs`) outside whitelist.
4. **No README.md существует** (Change 1 target creation): `test -f README.md || echo "MISSING — correct for creation"`. If EXISTS → STOP, existing README требует decision на merge vs replace.
5. **No engines field в package.json** (Change 2 target): `grep -A2 '"engines"' dashboard/package.json || echo "absent — correct"`. If already present → STOP.
6. **Launchers portability check** (Change 4 decision to track): `grep -nE "C:\\\\Users|/home/|~/" start-workflow.cmd start-workflow-hidden.vbs stop-workflow.cmd`. Expected empty (no hardcoded user paths). **Note**: pattern uses `~/` (with slash) not bare `~` — bare `~` would false-match `%~dp0` portable pattern в cmd scripts. If found → STOP, launchers have user-specific content, не fit для tracking.
7. **Filesystem root probe**:
   ```bash
   ls /mnt/e/project/workflow 2>&1 | head -3
   ls /mnt/e/Project/workflow 2>&1 | head -3
   # Export: WORKFLOW_ROOT="<whichever succeeded>"
   ```

If ANY pre-flight fails → STOP → log → wait.

---

## Whitelist

### Create

| # | Path | What |
|---|------|------|
| W1 | `README.md` (repo root) | New comprehensive README per Change 1 skeleton below |

### Modify (production config)

| # | Path | What |
|---|------|------|
| W2 | `dashboard/package.json` | Add `"engines": { "node": ">=20.19" }` per Change 2 |
| W3 | `.gitignore` | Add `.codex` line per Change 3 |

### Track (git add — previously untracked)

| # | Path | What |
|---|------|------|
| W4 | `start-workflow.cmd` | Stage existing file (content unchanged) |
| W5 | `start-workflow-hidden.vbs` | Stage existing file (content unchanged) |
| W6 | `stop-workflow.cmd` | Stage existing file (content unchanged) |

### Meta-artifacts

- `docs/codex-tasks/repo-readiness-polish-report.md` — Codex fills
- `docs/codex-tasks/repo-readiness-polish-planning-audit.md` — already written

### НЕ трогать

- `scripts/mailbox.mjs` — pre-existing M preserved (uncommitted user state, out of scope).
- `scripts/mailbox-lib.mjs`, `scripts/mailbox-status.mjs`, `dashboard/server.js`, `dashboard/src/*.jsx` — production code unchanged.
- `CLAUDE.md`, `workflow-instructions-{claude,codex}.md`, `workflow-role-distribution.md`, `local-claude-codex-mailbox-workflow.md`, `local-mailbox-ui-options.md` — existing docs preserved; README links к ним.
- `docs/codex-tasks/*` (prior handoffs) — immutable historical.
- `dashboard/package-lock.json` — if exists, no regeneration в этом handoff.
- `agent-mailbox/**` — runtime data.
- Wiki `E:/Project/memory claude/**` — не в scope.

---

## Changes

### Change 1 — `README.md` creation

**File**: `README.md` (repo root).

**Target content** (markdown):

```markdown
# Workflow

Documentation and tooling for dual-agent workflow: **Claude** (planner) + **Codex** (executor). Mailbox protocol for async inter-agent communication + local read-only dashboard for visualization.

[![CI](https://github.com/ub3dqy/workflow/actions/workflows/ci.yml/badge.svg)](https://github.com/ub3dqy/workflow/actions/workflows/ci.yml)

## What this is

- **`scripts/mailbox.mjs`** — CLI для sending/listing/replying/archiving messages between Claude и Codex via markdown files в `agent-mailbox/`.
- **`dashboard/`** — local read-only web UI (Express + Vite + React) для browsing mailbox, ports `127.0.0.1:3003` (API) + `127.0.0.1:9119` (Vite).
- **`docs/codex-tasks/`** — formal handoff plans от Claude к Codex (plan + report + planning-audit triplets).
- **`agent-mailbox/`** — gitignored async dialogue directory (`to-claude/`, `to-codex/`, `archive/`).

## Requirements

- **Node.js 20.19+** recommended (ESM module loading works out of the box; `engines` field в `dashboard/package.json` warns on older). Node 18.x technically works (prior empirical testing на Node 18.19.1) but будет показывать install-time warnings — upgrade recommended.
- **Windows or WSL2 Linux** (launchers Windows-specific, но CLI + dashboard cross-platform).
- **Git** (for tracked workflow).

## Setup

```bash
git clone https://github.com/ub3dqy/workflow.git
cd workflow/dashboard
npm install
```

## Usage

### Start dashboard (browse mailbox UI)

**Any platform**:
```bash
cd dashboard
npm run dev
# Dashboard: http://127.0.0.1:9119
# API: http://127.0.0.1:3003
```

**Windows one-click** (optional):
```
start-workflow.cmd
```
Smart npm install caching: skips install когда `package-lock.json` matches last snapshot.

**Stop dashboard**:
```
stop-workflow.cmd
```
Uses `npx kill-port` to release ports 3003 + 9119.

**Hidden console** (optional — для shortcut / tray launch):
```
start-workflow-hidden.vbs
```
Runs `start-workflow.cmd` без visible terminal window.

### Send message via CLI

```bash
# From workflow repo root:
node scripts/mailbox.mjs send --from codex --to claude --thread my-thread --body "message text"

# Auto-detects project from cwd basename. Explicit override:
node scripts/mailbox.mjs send --from claude --to codex --thread task --project messenger --body "..."

# List Claude's inbox:
node scripts/mailbox.mjs list --bucket to-claude

# Reply to inbox message:
node scripts/mailbox.mjs reply --to to-codex/<filename>.md --body "reply text"

# Archive message with resolution:
node scripts/mailbox.mjs archive --path to-claude/<filename>.md --resolution answered
```

See also: project conventions in [`CLAUDE.md`](./CLAUDE.md) and mailbox protocol spec in [`local-claude-codex-mailbox-workflow.md`](./local-claude-codex-mailbox-workflow.md).

## Architecture

Dual-agent workflow:
- **Claude** = planner. Writes handoff plans в `docs/codex-tasks/<slug>{,-planning-audit,-report}.md`. Никогда не executes production code.
- **Codex** = executor. Reads plan + planning-audit → runs pre-flight → applies changes → fills report. Никогда не changes whitelist / scope.
- **User** = decision gate. Approves scope, commits, pushes.

Coms:
- **Formal handoff** = git-tracked `docs/codex-tasks/` (plan + planning-audit + report, three-file pattern).
- **Informal async** = `agent-mailbox/` (gitignored, scratchpad).

Detailed rules:
- [`CLAUDE.md`](./CLAUDE.md) — project conventions
- [`workflow-instructions-claude.md`](./workflow-instructions-claude.md) — planner role
- [`workflow-instructions-codex.md`](./workflow-instructions-codex.md) — executor role
- [`workflow-role-distribution.md`](./workflow-role-distribution.md) — role separation
- [`local-claude-codex-mailbox-workflow.md`](./local-claude-codex-mailbox-workflow.md) — mailbox protocol spec

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs на every push/PR to master:
- **`build`** — `npm ci && npx vite build` на Node 24
- **`personal-data-check`** — regex scan для accidental PII/hostname leaks

## License

No explicit license file in repository; all rights reserved by default. Contact maintainer for licensing questions.

## Contributing

Issues и PRs welcome. Workflow expects:
1. Propose scope to maintainer (open issue).
2. Follow handoff pattern if change is non-trivial (see `docs/codex-tasks/` examples).
3. Personal data scan clean before push (CI enforces).
4. One commit per logical change.
```

**Rationale**:
- Landing page для публичного GitHub repo — standard convention
- Links к существующим detailed docs — не duplicates
- Setup + usage minimal but complete
- Requirements aligned с prior handoffs (Node 20.19+ из ESM unblock)
- CI badge standard GitHub Actions pattern

### Change 2 — `dashboard/package.json` engines field

**File**: `dashboard/package.json`.

**Current** (lines 10-23):
```json
  "dependencies": {
    "express": "^5.2.1",
    ...
    "react-dom": "^19.2.5"
  },
  "devDependencies": {
    ...
  }
}
```

**Target** (insert `engines` field после `"build"` script, перед `"dependencies"`):
```json
  "scripts": {
    "dev": "concurrently \"node server.js\" \"vite\"",
    "server": "node server.js",
    "build": "vite build"
  },
  "engines": {
    "node": ">=20.19"
  },
  "dependencies": {
    ...
  },
```

**Rationale**:
- Declarative minimum Node version per §V1-§V3
- `>=20.19` = first stable `require(esm)` per Node release notes (§V3)
- Advisory per §V1/§V2 (warning on install, не hard fail)
- Aligned с prior handoff ESM fix — empirically tested на Node 18.19.1 и 24.13.0

### Change 3 — `.gitignore` add `.codex`

**File**: `.gitignore`.

**Current** (13 lines, § §3):
```
# Mailbox is local working memory, not a project artifact.
agent-mailbox/

# Dependencies
node_modules/
dashboard/node_modules/

# Build output
dashboard/dist/

# OS
.DS_Store
Thumbs.db
```

**Target** (append new section, оригинальные patterns preserved):
```
# Mailbox is local working memory, not a project artifact.
agent-mailbox/

# Dependencies
node_modules/
dashboard/node_modules/

# Build output
dashboard/dist/

# OS
.DS_Store
Thumbs.db

# Codex CLI sandbox state (personal, per-session)
.codex
```

**Rationale**:
- `.codex` = Codex CLI sandbox state, appears untracked каждую session (see prior handoffs' git status)
- Personal/per-session, не product artifact
- Simple addition, preserves existing patterns

### Change 4 — Track launchers (git add, content unchanged)

**Files**:
- `start-workflow.cmd`
- `start-workflow-hidden.vbs`
- `stop-workflow.cmd`

**Current state**: untracked (`??` in git status since repo creation).

**Target**: `git add` all three. Content **unchanged** (не rewriting — just staging existing portable files).

**Rationale** (per §7 assumption row 8 + §3 rows 4-6 content inspection):
- Launchers portable: no hardcoded user paths (use `%~dp0` + `WScript.ScriptFullName`)
- Generic Windows+WSL quickstart pattern per wiki `windows-wsl-process-launcher`
- Useful к other users — better as product artifacts than personal debris
- README Change 1 documents them as "optional Windows one-click start"

---

## Verification phases

### Phase 1 — Codex self-check

Report each с command + raw output в report §2.x.

| # | Test | Expected |
|---|------|----------|
| V1 | `README.md` exists at repo root | `test -f README.md && echo "EXISTS"` returns EXISTS |
| V2 | `README.md` has Requirements + Setup + Usage sections | `grep -c "^## " README.md` returns ≥6 |
| V3 | `README.md` length reasonable | `wc -l README.md` returns between 80 and 250 |
| V4 | `README.md` links existing docs | `grep -c "\\]\\(./" README.md` returns ≥5 (CLAUDE.md + workflow-*.md) |
| V5 | `engines` field added | `grep -A2 '"engines"' dashboard/package.json` returns 3 lines с `"node": ">=20.19"` |
| V6 | `package.json` still valid JSON | `node --check <(cat dashboard/package.json)` exits 0 OR `node -e "JSON.parse(require('fs').readFileSync('dashboard/package.json'))"` silent |
| V7 | `.gitignore` includes `.codex` | `grep -x "\\.codex" .gitignore` returns 1 line |
| V8 | Launchers staged | `git status --short` shows no `??` для `start-workflow*` / `stop-workflow.cmd` (they're `A` or absent) |
| V9 | Personal-data scan | CI regex returns empty |
| V10 | Absolute path leak scan | `grep -nE '/mnt/e\|E:\\\\Project\|C:\\\\Users' README.md dashboard/package.json .gitignore` returns empty |

**Executable commands** (copy-paste-safe, cwd resets):

```bash
# V1 — README exists
cd "$WORKFLOW_ROOT"
test -f README.md && echo "EXISTS" || echo "MISSING"

# V2 — Section count
cd "$WORKFLOW_ROOT"
grep -c "^## " README.md

# V3 — Length
cd "$WORKFLOW_ROOT"
wc -l README.md

# V4 — Doc links count (fixed-string, не regex)
cd "$WORKFLOW_ROOT"
grep -Fc "](./" README.md

# V5 — engines field
cd "$WORKFLOW_ROOT"
grep -A2 '"engines"' dashboard/package.json

# V6 — package.json JSON valid
cd "$WORKFLOW_ROOT"
node -e "JSON.parse(require('fs').readFileSync('dashboard/package.json','utf8')); console.log('VALID')"

# V7 — .gitignore .codex line
cd "$WORKFLOW_ROOT"
grep -x "\.codex" .gitignore

# V8 — Launchers staged
cd "$WORKFLOW_ROOT"
git status --short | grep -E "^\?\? start-workflow|^\?\? stop-workflow" && echo "STILL UNTRACKED — STOP" || echo "STAGED OR ABSENT"

# V9 — Personal-data scan (dynamic extraction из ci.yml — per Sweep 8 rule)
cd "$WORKFLOW_ROOT"
PD_PATTERNS=$(grep -oP '(?<=PD_PATTERNS: ).*' .github/workflows/ci.yml)
grep -riE "$PD_PATTERNS" --include="*.js" --include="*.jsx" --include="*.json" --include="*.md" --include="*.html" --exclude-dir=.github -l .

# V10 — Absolute path leaks (per-pattern)
cd "$WORKFLOW_ROOT"
grep -n "/mnt/e" README.md dashboard/package.json .gitignore 2>/dev/null || true
grep -n "E:\\\\Project" README.md dashboard/package.json .gitignore 2>/dev/null || true
grep -n "C:\\\\Users" README.md dashboard/package.json .gitignore 2>/dev/null || true
```

### Phase 2 — `[awaits user]`

- P2.1 — User visits repo's GitHub page (after user's push в separate phase), confirms README renders correctly with badge + links clickable.
- P2.2 — User runs `start-workflow.cmd` from fresh clone OR existing → confirms dashboard starts normally (smoke через launcher path).

### Phase 3 — `[awaits N-day]`

- P3.1 — 7-day observation: no CI regressions, no user reports of broken workflows.

---

## Acceptance criteria

- [ ] `README.md` created at repo root, 80 ≤ lines ≤ 250
- [ ] `README.md` contains sections: What this is, Requirements, Setup, Usage, Architecture, CI, License, Contributing (≥6 headings)
- [ ] `README.md` links к CLAUDE.md + workflow-*.md (≥5 relative links)
- [ ] `README.md` CI badge URL correct: `https://github.com/ub3dqy/workflow/actions/workflows/ci.yml/badge.svg`
- [ ] `dashboard/package.json` has `"engines": { "node": ">=20.19" }`
- [ ] `dashboard/package.json` remains valid JSON
- [ ] `.gitignore` contains `.codex` line
- [ ] Launchers staged via `git add` (previously untracked files now tracked): `start-workflow.cmd`, `start-workflow-hidden.vbs`, `stop-workflow.cmd`
- [ ] V1-V10 all ✅
- [ ] V9 PD scan clean
- [ ] V10 absolute path leak scan clean
- [ ] Self-audit checklist all ✅
- [ ] No production code files modified (`scripts/*`, `dashboard/src/*`, `dashboard/server.js` untouched)

---

## Out of scope (НЕ делать)

- LICENSE file creation (README mentions conditionally)
- CONTRIBUTING.md file (section в README достаточно для v1)
- V15 dashboard timeout fix (отдельный potential handoff)
- Tier 5.x dropdown enhancements (separate tier)
- Tests infrastructure (separate big tier)
- macOS/Linux launcher equivalents (Windows-only for now)
- `package-lock.json` regeneration
- `dashboard/package.json` dependency updates
- Rewriting existing workflow docs (CLAUDE.md, workflow-*.md) — only linking
- README internationalization
- Automatic git commit/push

---

## Rollback

```bash
cd "$WORKFLOW_ROOT"
rm README.md
git checkout HEAD -- dashboard/package.json .gitignore
git reset HEAD start-workflow.cmd start-workflow-hidden.vbs stop-workflow.cmd
```

---

## Discrepancy-first checkpoints

1. **Pre-flight Step 4 finds existing README.md** → STOP, decision на merge vs replace required.
2. **Pre-flight Step 5 finds existing engines field** → STOP, check current value.
3. **Pre-flight Step 6 finds hardcoded user paths в launchers** → STOP, reversal of tracking decision needed.
4. **V6 package.json fails JSON parse** → syntax error в Change 2, revert + retry.
5. **V8 launchers still `??` after git add** → staging failed, investigate git state.
6. **V9 PD scan finds matches** → STOP, sanitize before commit.
7. **V10 absolute path leak** → README или other artifact contains user's paths, sanitize.
8. **plan-audit skill <7/10** → do NOT deliver; revision needed.

---

## Self-audit checklist

1. [ ] Pre-flight §0.1-§0.7 complete с raw output
2. [ ] §V1-§V3 verbatim quotes matched
3. [ ] Change 1 applied: README.md exists, length в range
4. [ ] Change 2 applied: engines field, JSON valid
5. [ ] Change 3 applied: `.codex` в gitignore
6. [ ] Change 4 applied: 3 launchers staged (not untracked anymore)
7. [ ] V1-V10 recorded с real stdout
8. [ ] V9 PD scan clean
9. [ ] V10 path leak clean
10. [ ] No production code modified (`git status` shows only planned files)
11. [ ] No git commit / push performed
12. [ ] Discrepancies section completed (even "none")
13. [ ] Out-of-scope temptations noted
14. [ ] Report file location exact: `docs/codex-tasks/repo-readiness-polish-report.md`

---

## Notes для Codex

1. **README is net-new** — full file content provided в Change 1 target. Copy verbatim, adjust only если obvious typo.

2. **engines field insertion position**: after `"scripts"` block, before `"dependencies"` (standard package.json ordering). Preserve existing JSON formatting (2-space indent).

3. **`.codex` gitignore** — append as new section с comment. Preserve existing patterns.

4. **Launcher tracking** — Change 4 is `git add` (staging previously untracked files), not content modification. Files already exist на disk. Do NOT modify their content.

5. **CI badge URL assumes GitHub owner `ub3dqy`** and workflow filename `ci.yml`. If different in user's actual setup, Codex should use actual owner/workflow names. Check via existing `.github/workflows/ci.yml` filename.

6. **No 4th file**: compact invocation inline в chat.

---

## Commits strategy

- **Do not commit** during handoff. Codex finishes с files on disk.
- Suggested template для user's `commit`:
  ```
  docs: add README + engines field + track launchers + .codex gitignore

  - README.md: landing page с setup, CLI usage, dashboard start,
    architecture overview, CI badge, links к existing workflow docs
  - dashboard/package.json: engines field "node": ">=20.19" (aligns
    с prior mailbox-lib ESM fix минимум Node version)
  - .gitignore: add .codex (Codex sandbox state, personal)
  - start-workflow.cmd, start-workflow-hidden.vbs, stop-workflow.cmd:
    track previously untracked Windows launchers (generic portable
    scripts, no hardcoded user paths; documented в README)

  Ship "готовый продукт" state — no functional code changes.
  ```
- Single commit for logical unity ("repo readiness polish").
