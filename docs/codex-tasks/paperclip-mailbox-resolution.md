# Paperclip Mailbox Resolution — Close P3-R2 F5 carryover

**Version**: v1
**Planning-audit**: `docs/codex-tasks/paperclip-mailbox-resolution-planning-audit.md`
**Report template**: `docs/codex-tasks/paperclip-mailbox-resolution-report.md`
**Architecture parent**: approved R4 §6 P3 (orchestrator break conditions)
**P4b parent**: commit `274a62a`
**Baseline**: HEAD=`274a62a`

---

## §0 Why this plan exists

P3 orchestrator implemented 3 of 4 canonical break conditions (max-iter, failed, stopped). F5 post-P3-R2 honest-downgraded thread-resolution detection to P4 carryover because at the time archive-aware helper was not designed. Now that P4a + P4b are merged and adapter contract is stable, the missing `resolved` transition path can be closed with a small supervisor helper + orchestrator hook. Scope: 1 helper, 1 insertion, 1 spec section.

---

## §1 Иерархия источников

1. Existing committed code HEAD=`274a62a`:
   - `scripts/mailbox-lib.mjs` `readBucket("archive", mailboxRoot)` + `readMessage` with parsed `resolution` / `thread` / `project` fields.
   - `scripts/mailbox-lib.mjs` `validateResolution` — valid set `{answered, no-reply-needed, superseded}`.
   - `dashboard/supervisor.mjs` `ALLOWED_TRANSITIONS` L175-192 — `awaiting-reply → resolved` AND `handing-off → resolved` уже allowed; `transitionTask` sets `resolvedAt` automatically для TERMINAL_STATES.
   - `dashboard/orchestrator.mjs` `handleTaskTick` L78+ `awaiting-reply` branch — insertion point before findReplyInPendingIndex.
2. `docs/codex-tasks/paperclip-p3-orchestrator-planning-audit.md` §10 Gap G1 / F5 post-R2 rationale — closure source.
3. Architecture plan §6 P3 — original 4-break-condition contract (resolution being the 4th).

---

## §2 Pre-flight (Codex)

### P1 — Environment baseline

```bash
pwd
git status --short
git log --oneline -4
node -v
```

### P2 — HEAD matches baseline

```bash
git rev-parse HEAD  # expect 274a62a
```

FAIL → STOP.

### P3 — File existence + absence (no NEW file — всё additive к existing)

```bash
ls -la dashboard/supervisor.mjs dashboard/orchestrator.mjs scripts/mailbox-lib.mjs local-claude-codex-mailbox-workflow.md
```

### P4 — Baseline build

```bash
cd dashboard && npx vite build 2>&1 | tail -3
```

### P5 — Baseline line counts

```bash
wc -l dashboard/supervisor.mjs dashboard/orchestrator.mjs scripts/mailbox-lib.mjs local-claude-codex-mailbox-workflow.md
```

Expected baseline: supervisor=439, orchestrator=271, spec=969.

---

## §3 Whitelist (strict)

**Изменить**:
1. `dashboard/supervisor.mjs` — add `isThreadResolved` helper function inside factory closure + expose via returned object.
2. `dashboard/orchestrator.mjs` — insert resolution check at top of `awaiting-reply` branch (before existing `findReplyInPendingIndex` call).
3. `local-claude-codex-mailbox-workflow.md` — append «Thread Resolution (paperclip mailbox-resolution)» section.

**Handoff artefacts**:
4. `docs/codex-tasks/paperclip-mailbox-resolution.md` (this plan)
5. `docs/codex-tasks/paperclip-mailbox-resolution-planning-audit.md`
6. `docs/codex-tasks/paperclip-mailbox-resolution-report.md`

**НЕ ТРОГАТЬ**:
- `scripts/adapters/*.mjs` — adapter contract locked.
- `scripts/mailbox-lib.mjs` — reuse read-only API; no modification.
- `dashboard/server.js`, `dashboard/src/**`, `dashboard/api.js`, `dashboard/supervisor.mjs` state graph / ALLOWED_TRANSITIONS / TASK_STATES (only adding helper, not schema).
- `scripts/mailbox*.mjs` (кроме lib reuse).
- TASK_SCHEMA_VERSION (schema unchanged).
- Hooks config.

---

## §4 Changes

### Change 1 — `dashboard/supervisor.mjs` new helper

**Location**: inside `createSupervisor` factory closure, alongside existing task helpers (near `listTasks` / `transitionTask` / `stopTask` definitions, around L300+). Uses `mailboxRoot` closure var (already in scope).

**Import addition**: **none required** — `readBucket` и `normalizeProject` already imported в supervisor.mjs L5-6 (baseline `grep '^import.*mailbox-lib' dashboard/supervisor.mjs` confirms). Codex executor verifies + proceeds; if any reason баseline drifted, merge в existing import block, не duplicate.

**Helper body** (F1 post-Codex-R1 — `since` timestamp filter protects против stale-thread-reuse false-resolve):

```js
const RESOLVED_STATUSES = new Set(["answered", "no-reply-needed", "superseded"]);

async function isThreadResolved({ thread, project, since }) {
  if (!thread || !project) return false;
  const normalized = normalizeProject(project);
  const sinceMs = since ? Date.parse(since) : null;
  const sinceValid = Number.isFinite(sinceMs);
  try {
    const archived = await readBucket("archive", mailboxRoot);
    return archived.some((message) => {
      if (message.thread !== thread) return false;
      if (normalizeProject(message.project) !== normalized) return false;
      if (!RESOLVED_STATUSES.has(message.resolution)) return false;
      if (sinceValid) {
        // F3 post-R2 fix: missing/invalid archived_at under a non-null since MUST exclude,
        // NOT fall through к true. Prevents legacy archive rows без archived_at field
        // from being treated as "recent" by default.
        // F10 post-exec fix: readMessage() не exposes archived_at как top-level field —
        // frontmatter попадает в message.metadata. Fall back к metadata accessor если
        // top-level missing. Same dual-read applies для future readMessage surface changes.
        const archivedRaw = message.archived_at || message.metadata?.archived_at;
        if (!archivedRaw) return false;
        const archivedMs = Date.parse(archivedRaw);
        if (!Number.isFinite(archivedMs)) return false;
        if (archivedMs <= sinceMs) return false;
      }
      return true;
    });
  } catch (error) {
    logger.error?.("[supervisor] isThreadResolved read failed:", error);
    return false;  // non-blocking: archive unreadable ≠ resolved
  }
}
```

**Rationale for `since`**: archive history is per-thread cumulative — if a thread slug was reused across tasks (e.g., `feature-x` used by Task A → archived `answered`, later reused by Task B), new Task B must NOT inherit Task A's resolution signal. Caller passes pivot timestamp (orchestrator uses `task.createdAt`); helper filters archive к messages archived STRICTLY AFTER pivot. Legacy archive rows без valid `archived_at` field excluded explicitly (F3 post-R2 fix) — no fall-through к default-true.

**Export**: add `isThreadResolved` к return object. Existing factory returns `{router, start, stop, state, addTask, setOrchestrator, transitionTask, stopTask, listTasks, getTask, persistTasks}` (supervisor.mjs L426-438) — append `isThreadResolved` alongside.

### Change 2 — `dashboard/orchestrator.mjs` awaiting-reply branch insert

**Location**: in `handleTaskTick` function, at start of `awaiting-reply` branch (currently L120 `if (task.state === "awaiting-reply") {`). Insert BEFORE existing `findReplyInPendingIndex` call.

**Current** (L120-124):
```js
if (task.state === "awaiting-reply") {
  const reply = findReplyInPendingIndex(task, state);
  if (!reply) {
    return { noop: true, reason: "no-reply-yet" };
  }
```

**Target** (F1 post-Codex-R1 — `since: task.createdAt` prevents stale-thread-reuse false-resolve):
```js
if (task.state === "awaiting-reply") {
  if (await supervisor.isThreadResolved({
    thread: task.thread,
    project: task.project,
    since: task.createdAt
  })) {
    supervisor.transitionTask(task.id, "resolved", {
      stopReason: "thread-resolved"
    });
    healthCounters.taskTransitions += 1;
    return { transition: "resolved", reason: "thread-resolved" };
  }

  const reply = findReplyInPendingIndex(task, state);
  if (!reply) {
    return { noop: true, reason: "no-reply-yet" };
  }
```

`since: task.createdAt` gate: если в архиве есть резолюция того же thread+project, но archived ДО task.createdAt — это stale history от более старого task с тем же thread slug → не триггерит false-resolve. `transitionTask(...,'resolved',...)` auto-sets `resolvedAt` (supervisor L290-291 TERMINAL_STATES branch). counter increments `taskTransitions`. `stopReason: "thread-resolved"` additive к existing values (Gap G4). Race с findReplyInPendingIndex: resolution check wins when both signals true same tick (Gap G3).

### Change 3 — spec append

At end of «ClaudeCodeAdapter (paperclip pivot P4a)» или «CodexAdapter (paperclip pivot P4b)» section (whichever appears last), append:

```markdown
### Thread Resolution (paperclip mailbox-resolution)

`supervisor.isThreadResolved({thread, project, since})` async helper reads `agent-mailbox/archive/<thread>/*.md` via mailbox-lib `readBucket("archive")` и returns `true` если есть archived message под заданным thread+project с `resolution ∈ {answered, no-reply-needed, superseded}` И `archived_at > since` (F1 post-Codex-R1 — `since` pivot blocks stale-thread-reuse false-resolve; F3 post-R2 — legacy rows без valid `archived_at` explicitly excluded, не fall-through).

Orchestrator consumes helper at the top of `handleTaskTick` `awaiting-reply` branch — before pendingIndex reply-lookup — passing `since: task.createdAt`. If resolved, task transitions к `resolved` terminal state с `stopReason: "thread-resolved"` и `resolvedAt` auto-populated by supervisor. This closes the 4th canonical break condition (completing: max-iter-exceeded, failed, stopped, resolved) originally specified в architecture §6 P3 and honest-downgraded from P3 via F5 post-R2.

Scope: resolution check gated к `awaiting-reply` only. `handing-off` state intentionally not covered в this iteration — mid-handoff resolution signal semantics deferred к P5+ (known gap G1).

Runtime overhead: each supervisor pollTick с active awaiting-reply task triggers one archive directory scan (`readBucket` recursive). Typical archive size (<200 messages) = O(ms). Large archive optimisation (thread-scoped listing / fs.watch cache) — P5+ (gap G2).
```

---

## §5 Verification phases

### Phase 1 — Codex (WSL)

| # | Check | Expected |
|---|-------|----------|
| V1 | `node --check dashboard/supervisor.mjs` | PASS |
| V2 | `node --check dashboard/orchestrator.mjs` | PASS |
| V3 | Build clean | `✓ built` |
| V4 | supervisor exports `isThreadResolved` | grep `isThreadResolved` в supervisor.mjs count ≥2 (helper + return-object) |
| V5 | orchestrator calls supervisor.isThreadResolved | grep count ≥1 |
| V6 | spec section added | grep «Thread Resolution (paperclip mailbox-resolution)» count = 1 |
| V7 | `RESOLVED_STATUSES` set включает 3 valid resolutions | grep `answered.*no-reply-needed.*superseded` |
| V8 | stopReason string `thread-resolved` documented | grep count ≥1 in code + spec |
| V9 | Empirical: archived thread с `resolution: answered` → task transitions к `resolved` | stubbed filesystem probe |
| V10 | Empirical: archived thread с `resolution: ""` (legacy) → task stays в awaiting-reply (no false-fire) | stubbed probe |
| V11 | Empirical: archived thread с `resolution: random-string` не-valid → no false-fire | stubbed probe |
| V12 | Empirical: cross-project archive не triggers false-fire | probe с two projects |
| V13 | Empirical: stale-thread-reuse false-resolve blocked (F1 post-Codex-R1) | answered message с archived_at BEFORE pivot `since` → helper returns false |
| V14 | PD scan | clean |
| V15 | Whitelist drift | 3 M + 3 handoff |

Verification commands:

```bash
# V1-V3
node --check dashboard/supervisor.mjs && echo "V1 PASS"
node --check dashboard/orchestrator.mjs && echo "V2 PASS"
cd dashboard && npx vite build 2>&1 | tail -3

# V4
grep -cE 'isThreadResolved' dashboard/supervisor.mjs
# Expected: >=2

# V5
grep -cE 'supervisor\.isThreadResolved' dashboard/orchestrator.mjs
# Expected: >=1

# V6
grep -c 'Thread Resolution (paperclip mailbox-resolution)' local-claude-codex-mailbox-workflow.md
# Expected: 1

# V7
grep -cE 'answered.*no-reply-needed|no-reply-needed.*superseded|RESOLVED_STATUSES' dashboard/supervisor.mjs
# Expected: >=1

# V8
grep -cE 'thread-resolved' dashboard/orchestrator.mjs dashboard/supervisor.mjs local-claude-codex-mailbox-workflow.md
# Expected: >=3 (orchestrator + spec at minimum; supervisor may not mention string)

# V9-V12 — empirical probe via ephemeral mailbox fixture
node -e "
import('./dashboard/supervisor.mjs').then(async (sup) => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const rt = '/tmp/mr-v9-' + process.pid;
  const mb = rt + '/mailbox';
  await fs.mkdir(path.join(mb, 'to-claude'), {recursive: true});
  await fs.mkdir(path.join(mb, 'to-codex'), {recursive: true});
  const archiveDir = path.join(mb, 'archive', 'test-thread');
  await fs.mkdir(archiveDir, {recursive: true});
  // V9 fixture — answered resolution
  await fs.writeFile(
    path.join(archiveDir, '2026-04-20T00-00-00Z-answered.md'),
    '---\nid: a\nthread: test-thread\nfrom: codex\nto: claude\nproject: workflow\nstatus: archived\nresolution: answered\ncreated: 2026-04-20T00:00:00Z\n---\nbody\n'
  );
  const supervisor = sup.createSupervisor({mailboxRoot: mb, runtimeRoot: rt, pollIntervalMs: 999999});
  const v9 = await supervisor.isThreadResolved({thread: 'test-thread', project: 'workflow'});
  console.log('V9 answered-resolves:', v9 === true ? 'PASS' : 'FAIL ' + v9);

  // V10 legacy (empty resolution)
  const archiveDir2 = path.join(mb, 'archive', 'legacy-thread');
  await fs.mkdir(archiveDir2, {recursive: true});
  await fs.writeFile(
    path.join(archiveDir2, '2026-04-20T00-00-00Z-legacy.md'),
    '---\nid: b\nthread: legacy-thread\nfrom: codex\nto: claude\nproject: workflow\nstatus: archived\ncreated: 2026-04-20T00:00:00Z\n---\nbody\n'
  );
  const v10 = await supervisor.isThreadResolved({thread: 'legacy-thread', project: 'workflow'});
  console.log('V10 legacy-empty-no-fire:', v10 === false ? 'PASS' : 'FAIL ' + v10);

  // V11 invalid resolution value
  const archiveDir3 = path.join(mb, 'archive', 'weird-thread');
  await fs.mkdir(archiveDir3, {recursive: true});
  await fs.writeFile(
    path.join(archiveDir3, '2026-04-20T00-00-00Z-weird.md'),
    '---\nid: c\nthread: weird-thread\nfrom: codex\nto: claude\nproject: workflow\nstatus: archived\nresolution: random-string\ncreated: 2026-04-20T00:00:00Z\n---\nbody\n'
  );
  const v11 = await supervisor.isThreadResolved({thread: 'weird-thread', project: 'workflow'});
  console.log('V11 invalid-resolution-no-fire:', v11 === false ? 'PASS' : 'FAIL ' + v11);

  // V12 cross-project false-fire
  const archiveDir4 = path.join(mb, 'archive', 'xp-thread');
  await fs.mkdir(archiveDir4, {recursive: true});
  await fs.writeFile(
    path.join(archiveDir4, '2026-04-20T00-00-00Z-xp.md'),
    '---\nid: d\nthread: xp-thread\nfrom: codex\nto: claude\nproject: OTHER-PROJECT\nstatus: archived\nresolution: answered\ncreated: 2026-04-20T00:00:00Z\n---\nbody\n'
  );
  const v12 = await supervisor.isThreadResolved({thread: 'xp-thread', project: 'workflow'});
  console.log('V12 cross-project-no-fire:', v12 === false ? 'PASS' : 'FAIL ' + v12);

  // V13 stale-thread-reuse false-resolve guard (F1 post-Codex-R1)
  const archiveDir5 = path.join(mb, 'archive', 'reused-thread');
  await fs.mkdir(archiveDir5, {recursive: true});
  await fs.writeFile(
    path.join(archiveDir5, '2026-04-20T00-00-00Z-stale.md'),
    '---\nid: e\nthread: reused-thread\nfrom: codex\nto: claude\nproject: workflow\nstatus: archived\nresolution: answered\ncreated: 2026-04-20T00:00:00Z\narchived_at: 2026-04-20T00:00:00Z\n---\nbody\n'
  );
  // Pivot AFTER stale archive → should NOT false-resolve
  const v13 = await supervisor.isThreadResolved({thread: 'reused-thread', project: 'workflow', since: '2026-04-20T12:00:00Z'});
  console.log('V13 stale-archive-blocked:', v13 === false ? 'PASS' : 'FAIL ' + v13);

  await fs.rm(rt, {recursive: true, force: true});
});
" 2>&1

# V14 — PD scan
PD_PATTERNS='$PD_PATTERNS'
grep -riE "$PD_PATTERNS" --include="*.js" --include="*.jsx" --include="*.mjs" --include="*.html" --include="*.json" dashboard/ scripts/ 2>/dev/null
grep -riE "$PD_PATTERNS" --include="*.md" CLAUDE.md README.md README.ru.md local-claude-codex-mailbox-workflow.md workflow-*.md 2>/dev/null
echo "--scan done"

# V15 — whitelist drift
git status --short
# Expected: 3 M (supervisor, orchestrator, spec) + 3 handoff artefacts.
```

### Phase 2 — user visual `[awaits user]`

| # | Check |
|---|-------|
| P2.1 | Dashboard restart (любой adapter kind) — supervisor starts clean; no regression. |
| P2.2 | Create task; archive a message в task.thread через `node scripts/mailbox.mjs archive --path <msg> --project workflow --resolution answered --answered-at <UTC> --answer-message-id <id>`; within ~3s (pollTick) task flips к `state=resolved`, `stopReason=thread-resolved`, `resolvedAt` populated. |
| P2.3 | Create second task с thread that doesn't have any archived answered/no-reply-needed/superseded message — task remains awaiting-reply (no false-fire). |
| P2.4 | Dashboard UI Tasks panel shows `resolved` state с correct color/badge (если implemented) — graceful если badge absent. |

### Phase 3 — cross-OS
Not applicable — pure Node / fs logic.

---

## §6 Acceptance criteria

- [ ] Phase 1 V1-V15 PASS
- [ ] Report §0-§11 filled
- [ ] No files outside whitelist
- [ ] PD scan clean
- [ ] supervisor.mjs diff shows only isThreadResolved additions (no state graph / ALLOWED_TRANSITIONS change)
- [ ] orchestrator.mjs diff shows only awaiting-reply branch insertion (no other logic touched)
- [ ] spec section appended после last existing section
- [ ] No commit/push без user command
- [ ] Phase 2 + Phase 3 awaits user

---

## §7 Out of scope

- `handing-off` branch resolution check — P5+ (G1).
- Archive scan caching / incremental — P5+ (G2).
- Resolution UI badge customization в dashboard/src/App.jsx — existing task state display already accommodates `resolved`.
- Change TASK_SCHEMA_VERSION / task schema fields.
- Change к ALLOWED_TRANSITIONS.
- Auto-archive when task hits `resolved` (task resolution ≠ mailbox resolution).

---

## §8 Rollback

**До commit**:
1. `git diff --stat dashboard/supervisor.mjs dashboard/orchestrator.mjs local-claude-codex-mailbox-workflow.md`.
2. `git checkout -- dashboard/supervisor.mjs dashboard/orchestrator.mjs local-claude-codex-mailbox-workflow.md`.
3. Restart dashboard → no-op (helper simply not called → nothing new runs).

**После commit**: `git revert <sha>`.

---

## §9 Discrepancy checkpoints (STOP)

1. Baseline HEAD ≠ `274a62a` → STOP.
2. scripts/adapters/*.mjs / mailbox-lib.mjs / server.js / dashboard/src/** modified → STOP.
3. TASK_SCHEMA_VERSION change tempted → STOP.
4. ALLOWED_TRANSITIONS change tempted → STOP.
5. Phase 1 V1-V15 any FAIL → STOP.
6. Temptation cache archive scan (`Map<thread,…>` + invalidation) → STOP (P5+ scope).
7. Temptation add check to `handing-off` branch → STOP (P5+ scope per G1).
8. Temptation add resolution side-effect (auto-archive Codex reply) → STOP.
9. V14 PD hit → STOP.
10. V15 whitelist drift → STOP.

---

## §10 Self-audit checklist

- [ ] 1: Pre-flight P1-P5 OK
- [ ] 2: Change 1 isThreadResolved helper added
- [ ] 3: Change 2 orchestrator awaiting-reply insert applied
- [ ] 4: Change 3 spec section appended
- [ ] 5: V1-V15 recorded verbatim
- [ ] 6: V13 stale-thread-reuse guard empirical PASS
- [ ] 7: V14 PD scan clean
- [ ] 8: V15 whitelist drift clean
- [ ] 9: No commit/push
- [ ] 10: Discrepancies recorded
- [ ] 11: Report §0-§11 filled
- [ ] 12: agent-adapter.mjs unchanged
- [ ] 13: mock-adapter / claude-code-adapter / codex-adapter unchanged
- [ ] 14: ALLOWED_TRANSITIONS diff empty
- [ ] 15: server.js / dashboard/src/** diff empty
- [ ] 16: mailbox-lib.mjs diff empty

≥14/16 OK → ready for review.

---

## §11 Notes to Codex

- Environment: WSL, cwd=`/mnt/e/Project/workflow`.
- Baseline HEAD=`274a62a`.
- No commit/push без user command.
- Don't modify ALLOWED_TRANSITIONS — `awaiting-reply → resolved` уже allowed per supervisor.mjs L178-184.
- Don't bump TASK_SCHEMA_VERSION — only adding read-only helper + branch insertion.
- `readBucket("archive", mailboxRoot)` from mailbox-lib.mjs — already committed API (P0 vintage), read-only. Reuse verbatim.
- `normalizeProject` также reuse — ensures workflow / WORKFLOW / WorkFlow all match.
- stopReason string `thread-resolved` — new value, consistent with existing naming convention.
- If archive directory doesn't exist (fresh install) — `readBucket` returns `[]`; helper returns `false` gracefully.
- Logger access: supervisor closure already has `logger` parameter from createSupervisor signature — reuse `logger.error?.(...)` pattern for non-blocking diagnostic.
- Race condition (Gap G3) accepted: resolution check runs FIRST в awaiting-reply branch → wins race when both conditions true same tick.

---

## §12 Commits strategy

Single commit covering Change 1 + 2 + 3 + 3 handoff artefacts.
