# Dashboard Dropdown Hide Archive-Only Projects — Execution Plan

**Version**: v1 (2026-04-17)
**Planning-audit**: `docs/codex-tasks/dashboard-dropdown-hide-archive-only-planning-audit.md`

---

## Why this plan exists

`mailbox-autoproject-wiki-revision` handoff (merged `c45f1c3`) introduced auto-detected project from `path.basename(process.cwd())`. P2.2 live test showed dashboard dropdown accumulates project values с каждым unique cwd — включая projects из archive bucket. Current live data (2026-04-17): 5 projects visible в dropdown, 2 из них — archive-only (`explicit-override`, `my-project`). Prior planning-audit §10 gap 4 flagged this как design concern, deferred к follow-up.

This handoff: exclude archive-only projects из `/api/messages` response's `projects` array. One-line change. Reduces dropdown noise 40% на current state.

---

## Иерархия источников правды

1. **Real state of codebase** (verified via §3 full reads) — primary
2. **Live API probe** (§6 empirical) — confirms current vs predicted behavior
3. **This plan** — third, may contain errors
4. **Discrepancy-first**: `plan ≠ reality` → STOP → log → wait

---

## Doc Verification

**No §V sections** — change involves only standard JavaScript array operations (`Array.prototype.spread`, built-in `Set`), no library/framework docs required. Planning-audit §4 explicitly documents this decision per Source Integrity rule ("only official sources count, stdlib operations need no verification").

---

## Pre-flight verification (Codex executes before any Change)

Record each с raw output в report §0.

1. **Environment**: `uname -a && node --version && pwd`
2. **HEAD commit**: `git log --oneline -1` — record observed. Planning snapshot HEAD: `e22b83f fix(mailbox-lib): dynamic import() for marked — unblock Node 18+`. Drift → record, не STOP.
3. **Working tree fresh snapshot**: `git status --short`. Expected: untracked launchers + `.codex` per baseline. STOP только при unexpected mods to target file.
4. **Pre-edit diff inspection**: `git diff -w -- dashboard/server.js`. Expected empty meaningful diff. Если modified meaningfully → STOP.
5. **Read target files fully** (not grep):
   - `dashboard/server.js` (168 lines)
   - `scripts/mailbox-lib.mjs` (593 lines) — particular `collectProjectValues` 113-125
   - `dashboard/src/App.jsx` (selected dropdown flow — lines 1087-1175, 1330-1350)
6. **External consumer grep** (addresses planning-audit §10 gap 1): `grep -rn "api/messages" --include="*.js" --include="*.jsx" --include="*.mjs" --include="*.md" . | grep -v node_modules | grep -v ".git/" | grep -v "docs/codex-tasks/" | grep -v "dashboard/"`. Exclude dashboard/ (expected internal consumers: server.js routes, api.js client) + handoff artifacts self-match. Expected empty (no external consumers). Flag в Discrepancies только то, что found outside dashboard/ + docs/codex-tasks/.
7. **Filesystem root probe**:
   ```bash
   ls /mnt/e/project/workflow 2>&1 | head -3
   ls /mnt/e/Project/workflow 2>&1 | head -3
   # Export: WORKFLOW_ROOT="<whichever succeeded>"
   ```
   WIKI_ROOT not needed — этот handoff не трогает wiki.
8. **Baseline dashboard state probe** (pre-change measurement):
   ```bash
   # Dashboard must be running (if not — start сейчас: cd dashboard && npm run dev; wait for "Server listening")
   curl -s http://127.0.0.1:3003/api/messages | node -e "
   const d = JSON.parse(require('fs').readFileSync(0, 'utf8'));
   const archiveOnly = [...new Set(d.archive.map(m => m.project).filter(Boolean))]
     .filter(p => ![...d.toClaude, ...d.toCodex].some(m => m.project === p));
   console.log('current projects:', d.projects);
   console.log('archive-only (will hide):', archiveOnly);
   "
   ```
   Record output. Post-change (Phase 1 V4) compare.

If ANY pre-flight step fails → STOP → log → wait.

---

## Whitelist

### Modify (production code)

| # | Path | What changes |
|---|------|--------------|
| W1 | `dashboard/server.js` | Lines 49-53: remove `...allArchive` from `collectProjectValues` argument. 2-line net diff (delete one line + comma adjustment). |

### Meta-artifacts (allowed outside whitelist)

- `docs/codex-tasks/dashboard-dropdown-hide-archive-only-report.md` — Codex fills
- `docs/codex-tasks/dashboard-dropdown-hide-archive-only-planning-audit.md` — already written

### НЕ трогать (explicit "do not modify")

- `scripts/mailbox-lib.mjs` — `collectProjectValues` function stays generic (accepts any messages array). Consumer decides scope — this is the change point.
- `scripts/mailbox.mjs`, `scripts/mailbox-status.mjs` — CLI + hook unaffected.
- `dashboard/src/*.jsx` — UI state flow adapts automatically to narrower `projects` array (verified §3 row 3).
- `dashboard/vite.config.js`, `dashboard/package.json` — no dependency changes.
- `agent-mailbox/**` — runtime data, не part of fix.
- `docs/codex-tasks/*` (prior handoffs) — historical reports immutable.
- `E:/Project/memory claude/memory claude/**` — wiki files not touched by this handoff.

---

## Changes

### Change 1 — `dashboard/server.js` collectProjectValues scope narrowing

**File**: `dashboard/server.js`
**Lines**: 49-53 (`/api/messages` handler, projects collection).

**Current code (lines 49-53)**:
```js
    const projects = collectProjectValues([
      ...allToClaude,
      ...allToCodex,
      ...allArchive
    ]);
```

**Target code**:
```js
    const projects = collectProjectValues([
      ...allToClaude,
      ...allToCodex
    ]);
```

**Rationale**:
- `projects` array drives dashboard filter dropdown. Semantically = "active work filters".
- Archive bucket viewing remains functional (user switches bucket selector).
- `collectProjectValues` implementation unchanged — pure function, no bucket awareness.
- `filterMessagesByProject` calls (lines 54-56) unchanged — archive bucket filtering by project still works for projects currently in dropdown.
- No breaking schema change — `projects` array still present, just narrower content.
- Empirical §6 confirms 5 → 3 noise reduction on live data.

**Downstream impact** (verified via §3 full reads):
- `App.jsx:1163-1175` — `setAvailableProjects(nextProjects)` accepts any array size; `setProject` auto-resets если selected disappears. Graceful.
- No CLI / hook consumers.

---

## Verification phases

### Phase 1 — Codex self-check

Report each с command + raw stdout/exit code в report §2.x. Commands в fenced code blocks (не table cells).

| # | Test | Expected result |
|---|------|-----------------|
| V1 | Change applied (see code block V1) | Post-edit diff shows lines 49-53 changed, `...allArchive` removed |
| V2 | No syntax errors (see V2) | `node --check dashboard/server.js` returns exit 0, empty stdout |
| V3 | Dashboard starts (see V3) | `Server listening on 127.0.0.1:3003` appears within 15s |
| V4 | Live API probe — projects narrower (see V4) | `projects` array excludes archive-only values observed в Pre-flight §0.8 |
| V5 | Filter by active project still works (see V5) | `/api/messages?project=workflow` returns filtered toClaude/toCodex/archive arrays |
| V6 | Bucket-scoped endpoint unaffected (see V6) | `/api/messages/archive` returns full archive bucket, no breakage |
| V7 | `collectProjectValues` references confirmed (see V7) | grep returns **3 lines** (all expected): `dashboard/server.js:3` import + `dashboard/server.js:49` call + `scripts/mailbox-lib.mjs:113` definition. Single caller = `server.js:49`, definition in lib expected. |
| V8 | No other `api/messages` consumers (see V8) | grep (с `-v "docs/codex-tasks/"` чтобы отфильтровать handoff artifacts self-match) returns empty OR `"(no external consumers)"` |
| V9 | Personal-data scan (see V9) | Zero matches per CI regex |
| V10 | Absolute path leak scan (see V10) | Zero matches |

**Executable commands** (copy-paste-safe, cwd resets explicit, `|` real shell pipe in code blocks):

```bash
# V1 — Post-edit diff check
cd "$WORKFLOW_ROOT"
git diff -w -- dashboard/server.js

# V2 — Syntax check
cd "$WORKFLOW_ROOT"
node --check dashboard/server.js && echo "SYNTAX OK"

# V3 — Dashboard start (in background OR foreground with timeout)
cd "$WORKFLOW_ROOT/dashboard"
timeout 15 node server.js 2>&1 | head -3

# V4 — Live API probe (dashboard must be running separately — e.g. via with_server.py или background).
# After fix: projects array должен excluded archive-only values. intersect(archive-only, projects) expected []
curl -s http://127.0.0.1:3003/api/messages | node -e "
const d = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const archiveOnly = [...new Set(d.archive.map(m => m.project).filter(Boolean))]
  .filter(p => ![...d.toClaude, ...d.toCodex].some(m => m.project === p));
const leaked = archiveOnly.filter(p => d.projects.includes(p));
console.log('post-fix projects:', d.projects);
console.log('archive-only values:', archiveOnly);
console.log('leaked into projects array (must be []):', leaked);
"

# V5 — Filter by active project
curl -s 'http://127.0.0.1:3003/api/messages?project=workflow' | node -e "
const d = JSON.parse(require('fs').readFileSync(0, 'utf8'));
console.log('filtered result projects:', d.projects);
console.log('toClaude count:', d.toClaude.length, 'toCodex count:', d.toCodex.length, 'archive count:', d.archive.length);
"

# V6 — Bucket-scoped endpoint
curl -s http://127.0.0.1:3003/api/messages/archive | node -e "
const d = JSON.parse(require('fs').readFileSync(0, 'utf8'));
console.log('archive endpoint messages count:', d.messages.length);
"

# V7 — Sole consumer check
cd "$WORKFLOW_ROOT"
grep -rn "collectProjectValues" --include="*.js" --include="*.jsx" --include="*.mjs" . | grep -v node_modules

# V8 — External api/messages consumer check (exclude handoff artifacts self-match)
cd "$WORKFLOW_ROOT"
grep -rn "api/messages" --include="*.js" --include="*.jsx" --include="*.mjs" --include="*.md" . | grep -v node_modules | grep -v "dashboard/" | grep -v ".git/" | grep -v "docs/codex-tasks/" || echo "(no external consumers)"

# V9 — Personal-data scan (dynamic extraction из ci.yml)
cd "$WORKFLOW_ROOT"
PD_PATTERNS=$(grep -oP '(?<=PD_PATTERNS: ).*' .github/workflows/ci.yml)
grep -riE "$PD_PATTERNS" --include="*.js" --include="*.jsx" --include="*.json" --include="*.md" --include="*.html" --exclude-dir=.github -l .

# V10 — Absolute path leak per-pattern
cd "$WORKFLOW_ROOT"
grep -n "/mnt/" dashboard/server.js
grep -n "E:\\\\" dashboard/server.js
grep -n "C:\\\\Users" dashboard/server.js
```

### Phase 2 — `[awaits user]`

- P2.1 — User restart dashboard в его сессии → visually confirm dropdown содержит 3 projects (active only), не 5.
- P2.2 — User switches to archive bucket → confirms archive messages display correctly с текущими dropdown options as filter (archive-only projects не filterable, accepted trade-off per scope alignment).

### Phase 3 — `[awaits N-day]`

- P3.1 — 7-day observation: no user reports of missing projects UX, no CI regressions.

---

## Acceptance criteria

- [ ] `dashboard/server.js:49-53` изменён per Change 1 target (removed `...allArchive`)
- [ ] `dashboard/server.js` total line count 167 (was 168; -1 line)
- [ ] V1-V10 all ✅ в report
- [ ] `scripts/mailbox-lib.mjs` **unchanged** (collectProjectValues stays generic)
- [ ] `dashboard/src/*.jsx` **unchanged** (UI adapts automatically)
- [ ] `dashboard/package.json` **unchanged**
- [ ] V9 personal-data scan clean
- [ ] V10 absolute path scan clean
- [ ] Self-audit checklist all ✅

---

## Out of scope (НЕ делать)

- User-configurable allowlist (Tier 5.1 — deferred).
- Time-based inactive filter (Tier 5.2 — deferred).
- "Show all including archive" toggle (Tier 5.3 — deferred).
- `collectProjectValues` signature refactor (accept bucket filter param) — not needed, single consumer.
- CLI changes (`scripts/mailbox.mjs`) — archive filter already exists via `--bucket archive`.
- Dashboard UI restyling / new components.
- Dependency updates.
- Automatic git commit/push.

---

## Rollback

```bash
cd "$WORKFLOW_ROOT"
git checkout HEAD -- dashboard/server.js
```

Single file revert. No other artifacts touched.

---

## Discrepancy-first checkpoints (STOP conditions)

1. **Pre-flight Step 4** — target lines 49-53 already modified (non-whitespace) → STOP, investigate.
2. **Pre-flight Step 6** — external `api/messages` consumer found outside dashboard/ + docs/ → log, Codex does NOT modify, user decides breaking-change handling.
3. **V2 syntax check fails** → STOP, revert edit, re-inspect target lines.
4. **V3 dashboard fails to start** → STOP (ESM import chain issue); check previous handoff's mailbox-lib fix still present.
5. **V4 archive-only projects STILL в `projects` array** → Change incomplete, re-apply.
6. **V5 filter by active project returns empty** — regression, STOP.
7. **V9 personal-data scan finds matches** → STOP, sanitize.
8. **plan-audit skill score <7/10** → do NOT deliver, return к Claude.

---

## Self-audit checklist (Codex fills)

1. [ ] Pre-flight §0.1-§0.8 complete with raw command output
2. [ ] §V N/A acknowledged per plan (no doc fetch needed для stdlib)
3. [ ] Change 1 applied: diff shows only lines 49-53 of `dashboard/server.js` changed
4. [ ] V1-V10 all recorded с real stdout, не "should pass"
5. [ ] Dashboard restart verified (V3 + V4 ran после edit)
6. [ ] V9 personal data clean
7. [ ] V10 path leak clean
8. [ ] No files outside whitelist modified (`git status` verifies)
9. [ ] No git commit / push performed
10. [ ] Discrepancies completed (even if "none")
11. [ ] Out-of-scope temptations noted (если были)
12. [ ] Report file location exact: `docs/codex-tasks/dashboard-dropdown-hide-archive-only-report.md`

---

## Notes для Codex

1. **Change isolated к one file, one handler**. Smallest handoff после tiered series (mailbox-autoproject был ~440 lines plan, этот ~280).

2. **Dashboard must be running для V4-V6 live API probes — mandatory, не `[awaits user]`**. Codex starts server as part of execution:
   - Foreground с job control: `cd "$WORKFLOW_ROOT/dashboard" && node server.js &` + `SERVER_PID=$!` → wait for ready (up to 15s) → run V4/V5/V6 → `kill $SERVER_PID` when done
   - Или `with_server.py` helper если available в environment
   - Или use background tool run

   If server не start'ится — это discrepancy for Change 1 (our Change shouldn't break startup). **STOP**, log в §5 Discrepancies, wait for user. **Не** degrade к `[awaits user]` — acceptance requires V1-V10 ✅ before delivery.

3. **No library docs in §V**: stdlib change. If Codex wants to verify Array spread / Set semantics — optional, not required by Source Integrity rule (ECMAScript stdlib, not external).

4. **`collectProjectValues` stays generic** — this is intentional architectural decision. Function has no bucket knowledge; callers decide scope. Don't refactor library function в этом handoff.

5. **No 4th file**: compact invocation inline в chat message, NOT as `-prompt.md`.

---

## Commits strategy

- **Do not commit** during handoff. Codex finishes with report + modified file on disk.
- Suggested commit template (user decides `commit`):
  ```
  feat(dashboard): hide archive-only projects from filter dropdown

  dashboard/server.js:49-53 — pass only to-claude + to-codex buckets
  to collectProjectValues. Archive-only projects excluded from
  dropdown since they represent completed work, not active filters.

  Live-verified: dropdown reduced 5 → 3 entries. User can still view
  archive bucket via bucket selector; per-project filter works for
  projects currently active.

  Trade-off: archive-only projects not filterable via dropdown;
  view all archive (no filter) or use CLI `list --bucket archive
  --project <name>` for archive-only filtering.
  ```
