# Mailbox Card Append-Note — Planning Audit

**Plan**: `docs/codex-tasks/mailbox-card-append-note.md`
**Report template**: `docs/codex-tasks/mailbox-card-append-note-report.md`
**Planner**: Claude
**Date**: 2026-04-18
**Version**: v1

---

## §0 Meta-procedure

This audit follows the canonical 11-step procedure at:
`E:/Project/memory claude/memory claude/docs/claude-plan-creation-procedure.md`

Each section below corresponds to a step in that procedure. Sections are
filled **in parallel** with plan drafting, not post-hoc.

---

## §1 MCP + Skill selection

Scan session-start advertised tools, match against task needs:

| Tool | Purpose | Priority |
|------|---------|----------|
| `context7.resolve-library-id` + `query-docs` | Node.js `fs.promises.appendFile` semantics (atomicity, encoding), Express 5 handler contract (async errors, body parsing), gray-matter parsing invariant (что append в body не ломает frontmatter), marked renderer behavior | mandatory (Source Integrity) |
| `plan-audit` skill | Step 10 — структурный audit финального плана, scoring 0-10 | mandatory |
| `WebFetch` | fallback для context7 gaps | conditional |
| `git` MCP (`git_status`, `git_diff`) | read-only state verification — **НЕ использовать без explicit user command** (anti-pattern #9) | deferred |
| `filesystem` MCP | not needed — base `Read`/`Write`/`Edit` покрывают all touched paths | skip |
| `github` MCP | not needed — no PR/issue ops в handoff | skip |
| `ide` MCP | disconnected (session-start reminder) | unavailable |
| `code-review` / `security-audit` skills | рассмотрено, но скоуп handoff'а — сам Codex execute + Claude independent review post-Codex. Skills релевантнее для post-execution review phase | defer to post-execution |

---

## §2 MCP readiness verification

Minimal probes before relying on any MCP. Verbatim outputs, no summaries.

| Probe | Raw output (excerpt) | Status |
|-------|---------------------|--------|
| `mcp__context7__resolve-library-id({libraryName: "Node.js", query: "readiness probe"})` | Returned 5 libraries. Top: `/nodejs/node` (High reputation, benchmark 87.61, 16836 snippets). Also `/websites/nodejs_latest-v24_x_api` (benchmark 76.38). | ✅ ready |
| `WebFetch` | not probed — deferred; known-working in prior sessions, will fallback-invoke if context7 gap detected in Step 5 | ⚠️ deferred |
| `plan-audit` skill | not probed — invocation is Step 10; skill availability confirmed in session-start reminder | ⚠️ deferred to Step 10 |
| `git` / `github` MCP | not in active set for this handoff (anti-pattern #9) | skip |

---

## §3 Files read during planning

Full reads (not grep, not partial) of every file the plan's whitelist will
touch, plus related files for blast-radius verification.

| File | Lines | Tool | Purpose/extracted |
|------|-------|------|-------------------|
| `scripts/mailbox-lib.mjs` | 593 | `Read` | core lib — `validateRelativeInboxPath` restricted to `to-claude/` + `to-codex/`; extension для archive needed. `readMessage`/`matter.stringify` pattern для rewriting files. |
| `dashboard/server.js` | 168 | `Read` (prior turn) | Express 5 handler pattern: try/catch inside each handler, `sendClientError` helper, `express.json()` middleware. |
| `dashboard/src/api.js` | 65 | `Read` (prior turn) | fetch wrapper pattern: `parseJsonResponse` + POST with JSON body. |
| `dashboard/src/App.jsx` | 1552 (post-edits) | in-context | UI state/translations/card structure. `MessageCard` component accepts action callbacks — one more callback for "add note" fits the pattern. |
| `scripts/mailbox.mjs` | 323 | `Read` | CLI consumer — for symmetry, append operation likely wants CLI counterpart `node scripts/mailbox.mjs note --path <p> --body <text>` in a follow-up handoff (out of scope here, but flagged). |
| `local-claude-codex-mailbox-workflow.md` | 778 | `Read` | **CRITICAL CONFLICT**: §"Anti-pattern: do not edit existing messages" (lines 411-428) explicitly forbids "дописывать новый turn в конец существующего файла". See §10 for discrepancy. |
| `agent-mailbox/archive/greetings-mood-check/2026-04-17T13-41-44Z-greetings-mood-check-user-001.md` | 14 | `Read` | Sample archive file — confirms format: YAML frontmatter (`status: archived`, `archived_at`, `resolution`) + plain markdown body. No `---` inside sample body. |

---

## §4 Official docs fetched (Source Integrity chain)

Verbatim quotes from primary docs. Each claim in plan links to §V_n row here.

| Topic | Primary source | Result | Verbatim quote | §V_n |
|-------|---------------|--------|----------------|------|
| `fs.promises.appendFile` semantics | context7 `/websites/nodejs_latest-v24_x_api` | ✅ found | "Asynchronously appends data to a file, creating the file if it does not yet exist. `data` can be a string or a Buffer. … default encoding `'utf8'`, flag `'a'`, mode `0o666`. Fulfills with `undefined` upon success." (source: https://nodejs.org/docs/latest-v24.x/api/fs) | §V1 |
| Express 5 async handler error propagation | context7 `/expressjs/express/v5.2.0` | ✅ found | "Express 5+ automatically catches rejected promises from async route handlers, eliminating the need for manual try-catch blocks in async functions. This simplifies error handling for asynchronous operations by automatically passing unhandled promise rejections to error middleware." (source: context7.com/expressjs/express/llms.txt) | §V2 |
| gray-matter frontmatter parsing | context7 `/jonschlinkert/gray-matter` | ✅ found | "Parses front-matter from a given string. It returns an object containing the parsed data, the content, and other metadata." Default delimiter is `---`. Parser identifies **one** frontmatter block at the start; remainder is `content`. (source: github.com/jonschlinkert/gray-matter/blob/master/README.md) | §V3 |
| gray-matter: behavior when body contains `---` | context7 `/jonschlinkert/gray-matter` | ⚠️ not explicit in docs — inferred from "block at start + delimiter pattern" description. Requires empirical test (Step 7) to confirm body-internal `---` not consumed as closing delimiter | §V3 (annotated ⚠️) |
| marked rendering of horizontal rule / heading / bold | context7 not fetched — rendering is standard CommonMark behavior, stable across marked versions; any inconsistency would be caught in Step 7 empirical render test | standard | — | §V4 (empirical only) |

---

## §5 AST scans + commands run

| Command | Purpose | Key output |
|---------|---------|------------|
| `grep -n "validateRelativeInboxPath\|validateRelativeMessage\|isKnownBucket\|BUCKETS" scripts/mailbox-lib.mjs` | Find current path-validation callsites | 5 hits: line 50 (`isKnownBucket`), 165 (`validateRelativeInboxPath` definition), 348 (`readMessageByRelativePath` consumer), 454 (`archiveMessageFile` consumer). Plan: extend or wrap `validateRelativeInboxPath` without breaking existing callers. |
| `ls agent-mailbox/archive/` | Inspect archive layout | `greetings-mood-check/`, `launcher-9119-fix/`, `p2-2-dropdown-workflow/`, etc. — confirms `archive/<thread>/<file>.md` recursive layout; validator must allow depth. |
| `npm outdated` (prior turn) | Baseline dep state | marked 18.0.0 → 18.0.1 already bumped in commit `bb0249e`; no drift blocks plan. |

---

## §6 Empirical tests

| Test | Purpose | Raw output (excerpt) | Verdict |
|------|---------|---------------------|---------|
| E1 — gray-matter roundtrip with body-internal `---` | Resolve G2 (docs didn't confirm) | parse→stringify→re-parse yields identical `data`; `content` preserved including internal `---` literal. `data equal: true`, content 134 bytes with `---\n\n**User note...` intact. | ✅ PASS — body-internal `---` not consumed as closing delimiter; design safe |
| E2 — marked render of bold + hr inside body | Confirm visual result | `<hr>\n<p><strong>User note · ...</strong></p>\n<p>note with --- inside it<br>and second line</p>` | ✅ PASS — `---` renders as `<hr>` separator, bold timestamp line, paragraph with inline `---` preserved |

Reproducer commands (Codex can re-run in pre-flight to confirm environment parity):

```bash
cd dashboard && node -e "
const matter = require('gray-matter');
const original = '---\nid: test-001\nfrom: user\nto: claude\nthread: demo\nstatus: pending\n---\nOriginal body paragraph 1.\n\nOriginal paragraph 2.';
const parsed1 = matter(original);
const withNote = matter.stringify(parsed1.content.trim() + '\n\n---\n\n**User note · 2026-04-18T12:34:56Z**\n\nnote line 1\nline 2', parsed1.data);
const parsed2 = matter(withNote);
console.log('data equal:', JSON.stringify(parsed1.data) === JSON.stringify(parsed2.data));
console.log('body has ---:', parsed2.content.includes('---'));
"
```

---

## §7 Assumptions + verification status

| Claim in plan | Evidence / flag | Status |
|---------------|-----------------|--------|
| `fs.promises.appendFile` safe for utf8 text append | §4 V1 verbatim quote | ✅ verified |
| Better: read → parse → append-to-content → `matter.stringify` → `writeFile`, not raw `appendFile` | Rationale in §9: controlled newline handling + no dependence on original file trailing newline | ✅ reasoned |
| Express 5 async handler errors auto-forward | §4 V2 verbatim quote | ✅ verified |
| gray-matter parses only first `---` block; body-internal `---` safe | §4 V3 (docs partial) + §6 E1 (empirical PASS) | ✅ verified empirically |
| marked renders `---` as `<hr>`, `**bold**` as `<strong>` | §6 E2 empirical PASS | ✅ verified empirically |
| `validateRelativeInboxPath` current behavior restricts to `to-claude/`+`to-codex/` | §3 file read + §5 grep | ✅ verified |
| Archive layout is `archive/<thread>/<file>.md` (1 level deep) | §3 file read (mailbox-lib line 483: `archiveDirPath = path.join(mailboxRoot, "archive", thread)`) + §5 ls | ✅ verified |
| Protocol invariant allows user-authored append blocks (after Path A carve-out) | Requires spec update in plan whitelist (G1 Path A resolution) | ⚠️ depends on spec edit — Codex executes the edit as part of handoff |
| marked version does not change rendering between 18.0.0 and 18.0.1 | Patch bump, semver convention = bugfix only | ⚠️ assumed; empirical render test in Codex pre-flight is cheap confirmation |
| CLI parity (`mailbox.mjs note`) deferred to follow-up | out of scope for v1 | ❌ explicitly out of scope (§10 G3) |

Legend:
- ✅ verified (cite evidence row)
- ⚠️ assumed-to-verify-by-codex
- ❌ out-of-scope / implementation-knowledge, not docs-backed

---

## §8 plan-audit skill invocation

- Invocation: `Skill({skill: "plan-audit", args: "<plan>.md --planning-audit <audit>.md"})` — 2026-04-18.
- Score: **8/10** 🟡.
- Critical fixes applied:
  1. V8 personal data scan: replaced literal placeholder `<PD pattern from CLAUDE.md>` with actual pattern `$PD_PATTERNS` (source: `.github/workflows/ci.yml`).
- Important fixes applied:
  1. Baseline line counts в §4 P2 updated: server.js 168→167, api.js 65→64, App.jsx 1552→1554, spec 778→777 (mailbox-lib.mjs 593 unchanged).
  2. Change 4 header "Четыре surgical вставки" → "Пять surgical вставок" (consistency с 4.1-4.5 subsections).
- Optional fixes (deferred):
  - §12 self-audit item #12 (screenshot as self-check) — cosmetic, оставляем как есть.
  - Change 4.5 CSS choice indeterminacy — Codex выберет по шаблону, deterministic-enough.
  - §2 п.3 "derived" — cosmetic.

### Round 2 — Codex adversarial review (2026-04-17)

Post-fix external review через mailbox thread `mailbox-card-append-note-review`.
Codex нашёл 3 находки (2 blockers + 1 medium). Все применены:

- Blocker B1 — V8 false-fail. V8 grep при scan всего repo хватал handoff artefacts в `docs/codex-tasks/` (которые намеренно содержат PD pattern как literal для V8 самого). Fix: V8 теперь сканит только production paths (`dashboard/`, `scripts/`, root-level `*.md`), excluding `docs/codex-tasks/` и `agent-mailbox/`. Echo `--scan done` marker — гарантирует, что stdout не может быть fake-empty из-за command crash.
- Blocker B2 — spec contract mismatch. Оригинальный текст «agents игнорируют user-note blocks» намекал на parsing-level separation, которого `readMessage()` не обеспечивает (весь `parsed.content` возвращается как body/html). Fix: переформулировано как **поведенческое** guidance: parsing-level разделения нет; user-note трактуется как reader context, не как agent turn.
- Medium M1 — rollback `git checkout --` destructive. Fix: rollback section переписан non-destructively — `git stash push` с условием «только whitelist files», STOP + surface для смешанных changes.

### Round 3 — Codex adversarial review (2026-04-17, post-R2 fixes)

Post-R2 review в том же thread. Codex нашёл ещё 2 blockers:

- Blocker B3 — V8 `&&`-chain false-clean. R2 fix использовал `&&` между двумя grep-группами; в clean-case первая grep возвращает exit 1 (no matches), вторая не запускается, root-level `*.md` остаются непроверенными. Fix R3: заменён `&&` на `;` — обе grep выполняются независимо. Marker `--scan done` пишется всегда.
- Blocker B4 — baseline stale. Plan §4 P1 "Expected" жёстко перечислял ожидаемый drift (`mailbox-lib.mjs` + handoff artefacts), но actual preserved worktree drift у executor может отличаться (например `M scripts/mailbox.mjs` от cross-OS CRLF). Fix R3: `Expected` переписан non-prescriptive — Codex записывает actual baseline verbatim в report §0.4; preserved `M` outside whitelist остаётся untouched, unexpected `M` → STOP. Report template §9 также зафиксирован: expected execution artefacts + preserved baseline из §0.4.

### Round 4 — Codex adversarial review (2026-04-17, post-R3 fixes)

Еще один blocker в том же thread:

- Blocker B5 — model conflict между §4 P1 и §9. R3 fix §4 P1 запретил "any tracked M outside whitelist" → STOP; но §9 final status допускает preserved baseline M outside whitelist (если зафиксирован в §0.4). Две модели одновременно. Fix R4: §4 P1 единая модель — pre-existing M outside whitelist acceptable если (a) verbatim зафиксирован в §0.4, (b) файл не трогается, (c) §9 показывает ту же запись unchanged. STOP только при **новом** M outside whitelist, появившемся во время execution.

---

## §9 Delta from prior Tier

<fill: Step 9 — N/A if v1, else delta from previous version>

This is the initial v1 plan — no prior Tier. Delta: N/A.

---

## §10 Known gaps (honest flags)

### Gap G1 — **BLOCKER**: Protocol invariant conflict

**Discrepancy discovered in Step 6**: `local-claude-codex-mailbox-workflow.md`
lines 411-428 define an explicit anti-pattern:

> Mailbox — append-only protocol.
> Это значит:
> - не редактировать чужие сообщения in place
> - не переписывать body старого message для "уточнения"
> - **не дописывать новый turn в конец существующего файла**
>
> Любое содержательное обновление идёт через новый файл с тем же `thread`...
>
> Единственное допустимое in-place изменение — техническое обновление
> frontmatter в момент архивирования: `status`, `answer_message_id`,
> `resolution`, `archived_at`.

The user's requested feature (Option 1: append-only user notes on existing
cards) literally does what that rule forbids: appending new content to an
existing file.

**Three resolution paths**, each requires user go/no-go:

- **Path A — Protocol carve-out**. Update spec to explicitly allow user-authored
  append blocks (not agent turns). Rationale: user is decision-maker, not an
  agent; the invariant protects agent trust model, not user annotations.
  Whitelist grows by one file (`local-claude-codex-mailbox-workflow.md`).

- **Path B — Sidecar file**. Note stored in a separate file
  (`<original>.notes.md` or `archive/notes/<id>.md`), UI merges for display.
  Original file stays untouched → invariant preserved. Trade-off: more complex
  read path, two files per annotated message.

- **Path C — New message in same thread**. User creates a regular reply
  (`from: user`) via existing `/api/reply`. This is already supported — no
  new feature needed. Trade-off: does not match user's UX intent ("note
  directly on the card").

**Planner recommendation**: Path A. User is explicitly outside the two-agent
trust model that the invariant protects; spec author likely didn't consider
user-authored annotations as a distinct case. Carve-out is clean, UX matches
request, single-file storage.

**STOP condition**: plan drafting (Step 9) cannot proceed until user chooses
A, B, or C. This audit is paused at Step 6.

**Resolution (2026-04-18)**: user selected **Path A**. Spec
`local-claude-codex-mailbox-workflow.md` will be added to plan whitelist and
carved out to explicitly allow user-authored append blocks while keeping
agent-authored messages immutable.

---

### Gap G2 — gray-matter body-internal `---` behavior

Docs describe frontmatter as "one block at the start" but do not explicitly
confirm that `---` appearing later in body is not consumed as a closing
delimiter on re-parse. Requires empirical test in Codex pre-flight
(Step 7 placeholder).

### Gap G3 — CLI symmetry

Whether `scripts/mailbox.mjs` should grow a `note` subcommand is out of scope
for v1 (which is dashboard-only), but worth flagging for a follow-up handoff
so the two interfaces don't drift.

Mitigation pattern: each gap must have either (a) Codex pre-flight step in
plan's §Pre-flight, (b) `[awaits-user]` marker with concrete question, or (c)
explicit acceptance as implementation-knowledge with rationale.

---

## §11 Signature

Planner: Claude
Date: 2026-04-18
Procedure followed: `claude-plan-creation-procedure.md` v1


## Legacy Workflow Note (2026-04-21)

This file is preserved as a historical artifact from an earlier workflow revision.

It may mention legacy patterns such as `Claude planner / Codex executor`, user relay, `compact prompt`, or older handoff shapes.

Do not use it as the live operating template. Current contract: `docs/codex-system-prompt.md`, `AGENTS.md`, `workflow-role-distribution.md`, `workflow-instructions-claude.md`, and `workflow-instructions-codex.md`.
