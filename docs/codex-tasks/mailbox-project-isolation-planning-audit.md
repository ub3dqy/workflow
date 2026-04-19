# Mailbox Project Isolation — Planning Audit

**Plan**: `docs/codex-tasks/mailbox-project-isolation.md`
**Report template**: `docs/codex-tasks/mailbox-project-isolation-report.md`
**ТЗ source**: `docs/codex-tasks/mailbox-project-isolation-tz.md`
**Planner**: Claude
**Date**: 2026-04-18
**Version**: v1

---

## §0 Meta-procedure

Canonical 11-step procedure: `E:/Project/memory claude/memory claude/docs/claude-plan-creation-procedure.md`.

Design negotiation (5 questions) закрыта через mailbox thread `mailbox-project-isolation-tz` (archived 2026-04-18):

- **Q1 — canonical project source** → (b) explicit `--project` mandatory на agent path; `path.basename(process.cwd())` autodetect **removed** как agent-routing mechanism. Codex reinforcement: «canonical source project для agent session = explicit bound project, не cwd».
- **Q2 — scope validation layer** → (b) central gate `validateProjectScope(currentProject, targetMessage)` в `scripts/mailbox-lib.mjs`, все ops (CLI, backend, supervisor, hooks) pass через неё.
- **Q3 — dashboard API** → (b) `/api/messages` остаётся user-facing (multi-project), agent-side only через новые `/api/agent/*` endpoints с mandatory `project` query/body param.
- **Q4 — error shape** → (b) 400 + `ClientError` при missing/mismatched project. Silent filter запрещён.
- **Q5 — `received_at` semantics** → (b) отдельное frontmatter поле `received_at`. Для legacy messages fallback `received_at = created`. Новые producers пишут explicitly, initially может совпадать с created — schema ready для later delivery-layer expansion.

Additional user-requirement (baked into Codex follow-up): карточки в dashboard обязаны явно показывать: `тема (thread) / отправка (created) / получение (received_at) / архивация (archived_at)`. Not optional polish.

---

## §1 MCP + Skill selection

| Tool | Purpose | Priority |
|------|---------|----------|
| `context7.resolve-library-id` + `query-docs` | Express 5 router prefix mount + middleware validation pattern; Node fs schema mutation backward-compat; gray-matter frontmatter field addition | mandatory (Source Integrity) |
| `plan-audit` skill | Step 10 audit-fix-reaudit loop до clean | mandatory |
| `security-audit` skill | project isolation = security-sensitive (cross-project leakage = access control defect). Invoke post-draft для validation | recommended |
| `WebFetch` | fallback для context7 gaps | conditional |
| `git` / `github` MCP | not used — anti-pattern #9 без explicit user command | skip |
| `filesystem` MCP | not needed — base `Read`/`Write`/`Edit` suffice | skip |
| `ide` MCP | disconnected | unavailable |

---

## §2 MCP readiness verification

| Probe | Raw output (excerpt) | Status |
|-------|---------------------|--------|
| `context7.resolve-library-id` | reuse from earlier этой сессии/серии (top `/nodejs/node` + `/expressjs/express/v5.2.0` — verified ready при Phase A planning) | ✅ ready |
| `plan-audit` skill | deferred to Step 10 | ⚠️ deferred |
| `security-audit` skill | deferred to post-draft Step 10 companion | ⚠️ deferred |

---

## §3 Files read during planning

| File | Lines | Tool | Purpose/extracted |
|------|-------|------|-------------------|
| `docs/codex-tasks/mailbox-project-isolation-tz.md` | 189 | `Read` | ТЗ source — requirements, constraints, acceptance criteria |
| `scripts/mailbox-lib.mjs` | 674 | `Read` (prior) | Core lib — `normalizeProject` (line 62), `filterMessagesByProject` (101), `generateMessageFile` (476 — writes frontmatter), `readMessage` (374 — reads frontmatter). No `received_at` field currently; need to add. |
| `scripts/mailbox.mjs` | 322 | `Read` | CLI — **key leakage site**: `handleSend` line 128 `path.basename(process.cwd())` fallback (remove); `handleList` line 162 unscoped если no --project (make mandatory); `handleReply` inherits project from target (OK); `handleRecover` scans all (needs --project). |
| `dashboard/server.js` | 159 | `Read` (prior) | Existing: `/api/messages` (line 42), `/api/messages/:dir` (67) — multi-project user-facing. New `/api/agent/*` routes must mount with mandatory project validation. |
| `dashboard/src/api.js` | 61 | `Read` (prior) | Current wrappers: `fetchMessages`, `archiveMessage`, `postNote`. No reply wrapper (removed in `92231a4`). Add `fetchAgentMessages({project})` для agent-side usage. |
| `dashboard/src/App.jsx` | 1544 | partial | MessageCard timestamp at line 1036 (`<div className="timestamp">`). Render only `created`. Нужно заменить на 3-timestamp block: sent / received / archived. Use conditional rendering для archived (только если archived_at truthy). |
| `local-claude-codex-mailbox-workflow.md` | 796 | `Read` (prior) | Spec — line 27 RU/80 EN mention "optional related files"; project field не упомянут как mandatory. Carve-out: add explicit «project mandatory» + `received_at` schema field section. |

§3 purpose: identify all touchpoints для isolation changes + current-state verification.

---

## §4 Official docs fetched (Source Integrity chain)

Reuse из предыдущих серий docs (no new external fetch needed — all patterns already verified):

| Topic | Source | Cross-ref | §V_n |
|-------|--------|-----------|------|
| Express 5 `Router` mount + prefix | context7 `/expressjs/express/v5.2.0` (prior handoff §V4) | "Express Router allows modular, mountable route handlers. Can be mounted at specific paths using middleware." Pattern: `app.use('/api/agent', agentRouter)` | §V1 |
| `fs.promises.writeFile` + `fs.rename` atomic schema write | context7 `/websites/nodejs_latest-v24_x_api` (prior handoff §V1+V2) | verified pattern для frontmatter updates without partial-read risk | §V2 |
| `gray-matter` frontmatter field addition backward-compatible | context7 `/jonschlinkert/gray-matter` (prior append-note handoff §V3) | Adding new fields к frontmatter не ломает existing parse; missing field = `undefined` в data object; reader provides fallback | §V3 |
| Express 5 async handler error propagation | context7 `/expressjs/express/v5.2.0` (prior §V2) | Try/catch + `sendClientError` pattern consistent across existing handlers — copy для новых `/api/agent/*` | §V4 |
| `ClientError(400, ...)` existing lib class | in-repo `scripts/mailbox-lib.mjs:42` | reused mechanism — no external docs needed | §V5 |

---

## §5 AST scans + commands run

| Command | Purpose | Key output |
|---------|---------|------------|
| `wc -l` whitelist files | Baseline HEAD=92231a4 | mailbox-lib.mjs=674, mailbox.mjs=322, server.js=159, api.js=61, App.jsx=1544, spec=796, .gitignore=16, package.json=26 |
| `git log --oneline -3` | Planning snapshot | HEAD=92231a4 (sender-fix). Prior: 44a704c (append-notes), bb0249e (marked bump) |
| `grep normalizeProject\|filterMessagesByProject\|path.basename(process.cwd())` | Locate project touchpoints | mailbox.mjs:128 (cwd fallback — **remove**), :162 (list unscoped — make mandatory), :127 (keep as explicit normalize); server.js:41, 73 (existing multi-project — keep user-facing, add agent endpoints separately); mailbox-lib.mjs:62 (normalize), :101 (filter), :374 (readMessage project parse), :475 (generateMessageFile project emit) |
| `grep created\|archived_at\|timestamp\|cardMeta` в App.jsx | Card timestamp render point | line 1036: `<div className="timestamp">{formatTimestamp(message.created, lang, t)}</div>` — single timestamp, replace с 3-row block |

---

## §6 Empirical tests

| Test | Purpose | Raw output | Verdict |
|------|---------|------------|---------|
| E1 — `received_at` fallback for legacy messages | gray-matter parses bare-ISO-string created как Date object (добавляет `.000`). Fallback reader должен использовать normalizer same as existing `toMessageTimestamp` — иначе string comparison fails. Test: normalize Date → string ISO без ms, fallback работает. | `legacy fallback ok: true value: 2026-04-18T10:00:00Z` | ✅ PASS — design assumption corrected: reader MUST use normalizer identical к existing `toMessageTimestamp` |
| E2 — new frontmatter с `received_at` field | Verify gray-matter parses added field without breaking existing fields | `new fmt received_at: 2026-04-18T10:00:05.000Z` (Date object) | ✅ PASS — schema addition safe; reader applies same normalizer |

Reproducer:

```bash
cd dashboard && node -e "
const matter = require('gray-matter');
function toTs(v) {
  if (typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString().replace(/\.\d{3}Z\$/, 'Z');
  return '';
}
const legacy = '---\nthread: t\nfrom: claude\nto: codex\ncreated: 2026-04-18T10:00:00Z\nproject: workflow\n---\nBody';
const p = matter(legacy);
const createdStr = toTs(p.data.created);
const receivedAt = typeof p.data.received_at === 'string' ? p.data.received_at : createdStr;
console.log('legacy fallback ok:', receivedAt === '2026-04-18T10:00:00Z');
"
```

---

## §7 Assumptions + verification status

| Claim in plan | Evidence / flag | Status |
|---------------|-----------------|--------|
| `path.basename(process.cwd())` fallback в mailbox.mjs:128 должен удаляться | §3 grep + ТЗ §5.1 mandatory + Codex agreement | ✅ verified |
| `--project` становится mandatory в `send`, `list`, `recover` | ТЗ §3 agent-side list/read/reply/archive/recover + Codex (b) | ✅ design-agreed |
| `reply` inherits project от target message — остаётся как есть | §3 mailbox.mjs line 206: `project: targetMessage.project`. Target message obligatorily has project после isolation. Reply path fine. | ✅ verified |
| `archive` operates на explicit path — project inferred от target | §3 mailbox.mjs `handleArchive` не фильтрует project. Безопасно — path уже references specific message | ✅ verified |
| Central gate `validateProjectScope(currentProject, targetMessage)` throws ClientError(400) при mismatch | §4 V5 existing pattern; §2 ТЗ + Codex (b) | ✅ design-agreed |
| New `/api/agent/*` endpoints require mandatory project query param | §4 V1 Router; §3 ТЗ Q3(b) | ✅ design-agreed |
| `/api/messages` остаётся user-facing multi-project | ТЗ §2 dashboard multi-project OK для user | ✅ spec-backed |
| `received_at` — новое frontmatter поле, fallback `received_at = created` | §6 E1 empirical; Codex (b) + backward-compatible fallback clause | ✅ verified |
| Reader нормализует Date → ISO-string через existing `toMessageTimestamp` pattern | §6 E1 empirical; existing code precedent mailbox-lib.mjs lines 262-272 | ✅ verified |
| Card rendering shows `thread / created / received_at / archived_at` labels | ТЗ + Codex must-have requirement; §3 App.jsx:1036 single-timestamp replacement point | ✅ design-required |
| Spec doc gets carve-out для mandatory project + received_at schema | ТЗ §5.1 hard requirement; spec changes precedent (prior user-note carve-out) | ✅ precedent-backed |
| Supervisor Phase A plan остаётся на hold; после isolation возможно минорное rebasing | user decision: «потом вернёмся» | ⚠️ awaits-user (scope boundary) |
| Breaking change CLI (`--project` mandatory в `list`/`recover`) не ломает existing workflow users | no existing scripted users known; user — single primary operator | ⚠️ assumed — user accepts breaking change per ТЗ urgency |

Legend:
- ✅ verified / design-agreed / spec-backed / precedent-backed
- ⚠️ assumed-to-verify-by-Codex / awaits-user
- ❌ implementation-knowledge, not docs-backed

---

## §8 plan-audit skill invocation

<fill: Step 10 — all rounds>

### Round 1 — 2026-04-18

- Invocation: `Skill({skill: "plan-audit"})`.
- Score: **9/10** 🟡.
- Critical fixes: 0. Important fixes:
  1. Change 1.4 — explicit spec для `recoverOrphans` project field propagation. Was implicit в Change 2.3 Note; applied как proper substep с current/target code.
  2. §7 V9 Expected — расширен текст «6 whitelist + 3 handoff + preserved baseline drift из §0.4 unchanged». Убирает риск false STOP на CRLF drift.
  3. §12 self-audit item #2 — обновлён на «4 substeps» reflecting Change 1.4.
- Optional deferred: `toMessageTimestamp` normalization consistency (scope creep).

### Round 2 — 2026-04-18

- Invocation: re-run `Skill({skill: "plan-audit"})` после R1 fixes.
- Score: **10/10** ✅.
- Critical fixes: 0. Important fixes: 0. No new findings в in-session skill.
- Loop clean → Step 11 delivery.

### Round 3 — Codex adversarial review (2026-04-18)

External Codex review нашёл 4 findings которые in-session skill пропустил:

- Blocker F1 — status code mismatch. `validateProjectScope` throws `ClientError(403, ...)` на mismatch, но Q4 agreement = 400 везде. Fix: 403 → 400 в Change 1.1.
- Blocker F2 — card display inconsistency. Change 1.3 пишет `received_at = created` для новых messages, Change 5.2 скрывает Received когда `received_at === created`. Result: user требовал обязательный show, но pending cards не показывают Received. Fix: always render Received row с fallback `received_at || created`.
- Important F3 — V2/V3 false green. Pattern `node ... 2>&1 | head -5 || echo "EXIT:$?"` глотает node exit code (pipe returns head's exit 0). Fix: убран pipe, separate `echo "EXIT:$?"` после команды.
- Important F4 — V4/V5 stale server false pass. Если 3003 уже занят старым process, curl отвечает, но это не новый код. Fix: `ss -ltn` port-busy guard перед start + wait-loop на `Server listening` marker в log + `kill -0 $SERVER_PID` ownership check.

Confirms wiki [[multi-round-adversarial-review-dynamic]] — plan-audit skill catches structural issues, external Codex review catches runtime-correctness issues.

### Round 4 — pending re-review after F1-F4 fixes

---

## §9 Delta from prior Tier

Initial v1 plan. Delta: N/A.

Related handoff artefacts: `mailbox-supervisor-phase-a*` — **paused on hold** by user decision. Isolation handoff runs first; supervisor Phase A resumes after (and may need minor rebase due to isolation-introduced agent endpoints).

---

## §10 Known gaps (honest flags)

### Gap G1 — received_at legacy migration timing

New reader falls back `received_at = created` для legacy messages. No bulk migration script (writing `received_at` в existing archive files) — это would be out-of-scope file mutation. Legacy files остаются как есть; reader provides fallback forever (cheap, deterministic).

### Gap G2 — supervisor Phase A plan обнимает stale baseline

После isolation landing, Phase A plan baseline counts (server.js=159, api.js=61, App.jsx=1544) изменятся. При возобновлении Phase A execution — обязательный baseline rebase (precedent: уже произошло раз на 92231a4). Planner acknowledges; rebase — задача следующего handoff цикла.

### Gap G3 — breaking change CLI users

Removing cwd fallback + making `--project` mandatory в `list`/`recover` — breaking CLI change. Mitigation: ТЗ urgency overrides compat; user = sole primary operator; change error message ясно указывает на `--project` requirement. No npm-published consumers.

### Gap G4 — Dashboard SSE/polling semantics для fresh `received_at`

Если `received_at` writer-side == `created` initially (Codex (b) phrasing «initially может совпадать»), пока нет дedicated delivery layer, `received_at` UI value === `created` во всех новых messages. User потенциально подумает «оба timestamps одинаковые, зачем separate column?». Mitigation: это intentional Phase-A-of-bigger-plan — supervisor Phase C later вводит real delivery layer который populates `received_at` по-настоящему. Acceptance ok для now; UI можно показывать same value дважды.

### Gap G5 — `/api/agent/*` не имеет auth — localhost only

Spec prior decision: dashboard localhost-only, no auth. Isolation handoff не меняет это. Cross-project leak prevention = routing/validation layer, not auth. Document acceptance; re-evaluate если dashboard goes non-local (out of current scope).

Mitigation pattern: каждый gap has (a) Codex pre-flight empirical OR (b) `[awaits-user]` marker OR (c) explicit acceptance с rationale. Все пять имеют explicit mitigation выше.

---

## §11 Signature

Planner: Claude
Date: 2026-04-18
Procedure: `claude-plan-creation-procedure.md` v1 (with audit-fix-loop rule 2026-04-18)
Design thread: `mailbox-project-isolation-tz` (archived 2026-04-18)
