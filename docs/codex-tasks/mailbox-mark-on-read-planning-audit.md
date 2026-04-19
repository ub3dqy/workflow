# Mailbox Mark-on-Read + Completion Label — Planning Audit

**Plan**: `docs/codex-tasks/mailbox-mark-on-read.md`
**Report template**: `docs/codex-tasks/mailbox-mark-on-read-report.md`
**Planner**: Claude
**Date**: 2026-04-19
**Version**: v1
**Scope**: real mark-on-read semantic для `received_at` (агент-side populate на первом чтении) + UI label «Выполнено» для archived карточек.

---

## §0 Meta-procedure

Canonical procedure: `E:/Project/memory claude/memory claude/docs/claude-plan-creation-procedure.md`.

Design negotiation (4 Qs) closed через mailbox thread `mailbox-mark-on-read-design` (archived 2026-04-19):

- **Q1 — UI «Выполнено» label** → (a) rename existing «Архивировано» → «Выполнено». Single timestamp row, no duplication.
- **Q2 — mark-on-read trigger paths** → agent-only narrow scope: filtered project + `to-claude`/`to-codex` bucket + pending status. Entry points: `/api/agent/*`, `mailbox.mjs list --project`, `mailbox.mjs reply` (target message). **CRITICAL caveat**: reads остаются **pure** — `readMessage`/`readBucket`/`collectMailboxMessages`/`readMessageByRelativePath` не mutate. Вместо этого new explicit function `markMessageReceived(filePath)` экспортируется и вызывается callers **только после** project+bucket filter. User dashboard через `readBucket → readMessage` никогда не триггерит populate (no call). **Post-R3 Codex finding**: option-threading через read chain был отклонён — мутировал бы ALL buckets до filter.
- **Q3 — concurrent readers race** → best-effort, no lock. First writer wins, second reader видит populated field and skips. Documented.
- **Q4 — sender vs reader semantic** → writer creates without `received_at`, receiver agent populates on first read. Correct cross-agent semantic.

---

## §1 MCP + Skill selection

| Tool | Purpose | Priority |
|------|---------|----------|
| `context7` | fs atomic write+rename (reuse из prior); gray-matter round-trip на mutation | mandatory |
| `plan-audit` skill | Step 10 loop | mandatory |
| `security-audit` skill | side-effect introduction в read path — review relevance | recommended |
| Git/GitHub/filesystem/ide MCP | skip | skip |

---

## §2 MCP readiness verification

| Probe | Status |
|-------|--------|
| `context7` | ✅ ready (reuse из isolation handoff series) |
| `plan-audit` skill | ⚠️ deferred to Step 10 |

---

## §3 Files read during planning

| File | Lines (post-01ed432) | Purpose |
|------|----------------------|---------|
| `scripts/mailbox-lib.mjs` | 704 | `readMessage` line 380; `received_at` fallback line 405-406; `readBucket` line 421; `readMessageByRelativePath` line 456; `generateMessageFile` writes `received_at: created` line 531 (to remove) |
| `scripts/mailbox.mjs` | 364 | `handleList` / `handleReply` use `collectMailboxMessages` + `readMessageByRelativePath` (pure). Post-filter — call `markMessageReceived(absPath)` on narrow scope (pending + to-claude/to-codex in filtered set). |
| `dashboard/server.js` | 193 | `/api/agent` mounted at 189; agentRouter at 158; agent handler uses `readBucket` 173-175 (pure). После project filter — `markMessageReceived` only на `[...toClaude, ...toCodex].filter(pending)`. User `/api/messages` at line 44-46 — **никогда не mark**. |
| `dashboard/src/App.jsx` | 1580 | translations `timestampArchived` line 37 (ru) / 93 (en); usage line 1068 |
| `local-claude-codex-mailbox-workflow.md` | 821 | `received_at` section (post-isolation carve-out) — rephrase «initially = created» → «populated on first agent-side read» |

---

## §4 Official docs fetched (Source Integrity chain)

Reuse:
- `fs.writeFile` + `fs.rename` atomicity (§V1+V2 prior handoffs).
- `gray-matter` round-trip preservation (§V3 prior).
- `matter.stringify(content, data)` preserves frontmatter w/o data loss.

---

## §5 AST scans + commands run

| Command | Purpose | Key output |
|---------|---------|------------|
| `wc -l` whitelist | Baseline post-`01ed432` | mailbox-lib=704, mailbox.mjs=364, server.js=193, api.js=73, App.jsx=1580, spec=821 |
| `grep received_at\|readMessage\|generateMessageFile\|readBucket\|readMessageByRelativePath` в lib | Identify mutation points + consumer plumbing | readMessage:380, received_at-fallback:405, readBucket:421, readMessageByRelativePath:456, generateMessageFile:490, received_at-emit:531 |
| `grep timestampArchived` в App.jsx | Label rename locations | ru:37, en:93, jsx-usage:1068 |
| `grep agentRouter\|/api/agent\|readBucket` в server.js | Agent path plumbing | agentRouter:158, middleware:160, get:170, readBucket:44-46 (user), 173-175 (agent), mount:189 |

---

## §6 Empirical tests

| Test | Raw output | Verdict |
|------|------------|---------|
| E1 — mutation pattern read→populate→atomic rename preserves frontmatter и body | `initial had received_at: false` → after write: `2026-04-19T11:00:00Z`, body preserved, all other fields intact | ✅ PASS |

Reproducer:
```bash
cd dashboard && node -e "
const fs = require('fs');
const matter = require('gray-matter');
const tmp = '/tmp/markread-test.md';
const initial = matter.stringify('Body', {id:'t', thread:'x', from:'a', to:'b', status:'pending', created:'2026-04-19T10:00:00Z', project:'workflow'});
fs.writeFileSync(tmp, initial);
const raw = fs.readFileSync(tmp, 'utf8');
const parsed = matter(raw);
if (!('received_at' in parsed.data)) {
  parsed.data.received_at = '2026-04-19T11:00:00Z';
  const tmpPath = tmp + '.tmp';
  fs.writeFileSync(tmpPath, matter.stringify(parsed.content, parsed.data));
  fs.renameSync(tmpPath, tmp);
}
const parsed2 = matter(fs.readFileSync(tmp, 'utf8'));
console.log('received_at:', parsed2.data.received_at, 'body:', parsed2.content.trim());
fs.unlinkSync(tmp);
"
```

---

## §7 Assumptions + verification status

| Claim in plan | Evidence / flag | Status |
|---------------|-----------------|--------|
| `readMessage` stays pure (no mutation) | Q2 design agreement + §3 file read confirms line 380 has no side-effect currently | ✅ design-backed |
| Mutation via explicit `markMessageReceived(filePath)` call on narrow scope (filtered project + to-claude/to-codex + pending) | R3 redesign после Codex finding — option-threading отвергнут как cross-project leak risk | ✅ design-mandated |
| Atomic write pattern (write tmp + rename) preserves frontmatter+body | §6 E1 empirical PASS | ✅ verified |
| `readMessage`/`readBucket`/`collectMailboxMessages`/`readMessageByRelativePath` остаются pure | R3 Codex finding: option-threading отклонён (мутировал бы ALL buckets до filter) | ✅ design-mandated |
| New export `markMessageReceived(filePath)` — explicit atomic mutation, idempotent | Empirical §6 E1 + R3 finding rationale | ✅ verified |
| Callers mark only narrow scope (filtered project + to-claude/to-codex + pending) | R3 design; V3 cross-project test covers | ✅ design-mandated, test-verified |
| Concurrent readers race acceptable (first writer wins) | Q3 design + file-based no-lock convention | ✅ accepted |
| UI label rename `timestampArchived` → `timestampCompleted` (RU «Выполнено», EN «Completed») | Q1(a) single-row rename | ✅ design-agreed |
| Remove `received_at: created` from `generateMessageFile` | Q2 writer не emits | ✅ design-agreed |
| Existing messages created between isolation-commit и mark-on-read-commit (с received_at = created) — обрабатываются fallback logic | reader populate only when field absent; existing messages уже имеют field, skip mutate | ⚠️ noted — messages between commits не будут retroactively remarked; accepted as transient |
| Breaking compat: agent inbox reader now mutates files — supervisor (Phase A hold) must know | documented as gap для Phase A resumption | ⚠️ awaits Phase A |

Legend:
- ✅ verified / design-agreed
- ⚠️ assumed / accepted with rationale

---

## §8 plan-audit skill invocation

### Round 1 — 2026-04-19

- Invocation: `Skill({skill: "plan-audit"})`.
- Score: **9/10** 🟡.
- Critical fixes: 0. Important fixes:
  1. V1 expected «function 4» → «function 3» (JS Function.length игнорирует params с defaults).
  2. V3 переписан на isolated `/tmp/` mailbox с manual setup + cleanup; избегает конфликта с §11.5 и не оставляет residue в real `agent-mailbox/`.
  3. V5 added expected count = 3.
  4. §11 checkpoint 5 clarified: manual edit STOP, programmatic mutation under test — expected.
- Optional deferred: note about `toUtcTimestamp` existing import — already implicit in rationale.

### Round 2 — 2026-04-19

- Re-run post-R1 fixes (in-session skill). Score: 10/10. 0 new findings.

### Round 3 — Codex adversarial review (2026-04-19)

Codex caught a design-level blocker that in-session plan-audit missed: option threading через `readBucket`/`collectMailboxMessages` мутировал ALL buckets перед project filter — single agent-read помечал received_at у чужих проектов и в обоих inbox directions. Also V3 empirical test был слишком узкий и не ловил этот regression (testing только one bucket).

- Blocker F1 — broad mutation before filter. Fix: **rewrite** Change 1-3. `readMessage`/`readBucket`/`collectMailboxMessages`/`readMessageByRelativePath` — остаются pure (no option threading). New export `markMessageReceived(filePath)` — explicit atomic mutation. Callers (CLI handleList, CLI handleReply, server `/api/agent/messages`) mark **only** filtered narrow set: matching project + `to-claude`/`to-codex` bucket + pending status. Archive bucket никогда не mutated (already processed).
- Blocker F2 — V3 coverage gap. Fix: V3 rewrite — 3-message test scenario (workflow/to-claude pending, messenger/to-codex pending, workflow/archive archived). Executes full read → filter → mark flow. Verifies: workflow target marked, messenger NOT marked (cross-project leak prevented), archive NOT marked (scope respected).

Confirms `multi-round-adversarial-review-dynamic` wiki — in-session skill catches structural/reference issues; external Codex catches semantic/scope violations.

### Round 4 — Codex adversarial review (2026-04-19, post-R3)

Codex caught **internal plan inconsistency** — R3 rewrite исправил Change 1-3 код блоки, но оставил 8 stale text references на старый option-threading paradigm. Also report template V1-V8 wording stale.

- Blocker F3 — stale references. Lines fixed:
  1. §1 Q2 — rewritten на explicit markMessageReceived + narrow-scope semantic.
  2. §3 §V3 — обновлён с «adds option branch» на «separate markMessageReceived».
  3. §5 Whitelist 3 rows — actualized (lib/CLI/server).
  4. §7 V1 check — «readMessage accepts option» → «markMessageReceived exported + idempotent».
  5. §7 V1 command — rewritten на isolated temp file + idempotence verify.
  6. §14 commit message — updated.
- Blocker F4 — report template V1-V8 stale wording. Fix: V1-V8 rows updated for R3 semantics (markMessageReceived export, narrow-scope filter test).

V3 block on-disk — verified end-to-end complete (Codex видел truncation в своём reading, не реальный defect; fenced block правильно закрыт).

### Round 5 — Codex adversarial (2026-04-19, post-R4)

Codex found **planning-audit internal inconsistency** — я синхронизировал plan + report, но забыл audit document:

- Blocker F5 — planning-audit §0 Q2 / §3 file rows / §7 assumptions / §9 delta / §10 G2 содержали stale references на old option-threading model. Fixed verbatim в этом round:
  1. §0 Q2 — rewritten на markMessageReceived + narrow scope language.
  2. §3 mailbox.mjs + server.js rows — «plumb option» → «pure reads + post-filter markMessageReceived».
  3. §7 assumptions table — removed old «option» rows, added R3 design-mandated rows.
  4. §9 Delta — rewritten на R3 terminology.
  5. §10 G2 — supervisor rationale corrected (reads pure by design, no option needed).

### Round 6 — Codex adversarial (2026-04-19, post-R5)

Один residual stale row:

- Blocker F6 — §7 assumption line «Mutation via option flag threaded from agent entry points» всё ещё описывала отвергнутый design. Fix: rewrite — «Mutation via explicit markMessageReceived on narrow scope» с R3 rationale.

### Round 7 — pending Codex re-review after F6 fix

---

## §9 Delta from prior Tier

Post-isolation iteration. Delta: (1) remove writer emit of `received_at`; (2) add explicit `markMessageReceived(filePath)` export called on narrow agent-path scope after bucket+project filter; (3) UI label rename archived → completed. R3 design: reads stay pure, mutation only via explicit function call on filtered targets.

---

## §10 Known gaps (honest flags)

### Gap G1 — messages created между isolation commit и mark-on-read commit

isolation landing (01ed432) writes `received_at = created` at generation. Pending messages созданные в этом window имеют field populated уже. After mark-on-read landing, reader sees field present → skip mutation. So their `received_at = created` (writer-side) permanently. Not retroactively remarked. Accepted as transient — small population, не critical для visibility.

### Gap G2 — Supervisor Phase A still on hold

Supervisor plan referenced `readBucket` для polling. После mark-on-read landing `readBucket` остаётся pure — supervisor polling не мутирует ничего (reads pure by design). Supervisor индексирует, не «читает» в agent-semantic смысле, и не должен вызывать `markMessageReceived`. Planner acknowledges; Phase A rebase при resumption это уже соблюдает (supervisor не в agent-path, не должен звать mark).

### Gap G3 — Concurrent reader race accepted

Two agent readers same file: both read (no field), both write new received_at. Second write overwrites first с very close timestamp. No correctness issue — both timestamps равны по ms resolution. Accepted.

### Gap G4 — Windows file locking

NTFS allows concurrent reads. Write via rename атомарно. No Windows-specific risk.

Mitigation: each gap has (a) Codex pre-flight empirical OR (b) documented accept OR (c) awaits-next-handoff marker. All 4 gaps covered.

---

## §11 Signature

Planner: Claude
Date: 2026-04-19
Procedure: `claude-plan-creation-procedure.md` v1
Design thread: `mailbox-mark-on-read-design` (archived 2026-04-19)
