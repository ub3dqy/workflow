# Mailbox Archive Complete Timestamps — Planning Audit

**Plan**: `docs/codex-tasks/mailbox-archive-complete.md`
**Report template**: `docs/codex-tasks/mailbox-archive-complete-report.md`
**Planner**: Claude
**Date**: 2026-04-19
**Version**: v1

---

## §0 Meta-procedure

Canonical procedure: `E:/Project/memory claude/memory claude/docs/claude-plan-creation-procedure.md`.

Design closed через mailbox thread `mailbox-archive-complete-design` (archived 2026-04-19):

- **Timeline**: 4 rows conditional в archive card — Отправлено / Получено / Ответ отправлен (only if answered) / Отправлено в архив. Simple labels, no combined «смысловой label».
- **Status chip**: separate в cardTags header, не replacement для dates. Values: answered→«Выполнено», no-reply-needed→«Закрыто без ответа», superseded→«Заменено».
- **Backfill**: `archiveMessageFile` при archive, если `received_at` отсутствует — set = `archived_at`. Гарантирует full timeline без дыр.
- **New field `answered_at`**: populated **только** при resolution=answered (reply flow); не создаётся для no-reply-needed / superseded. Codex explicit oversight.
- **answer_message_id UI**: defer — следующий handoff, не в этом scope.

---

## §1 MCP + Skill selection

| Tool | Purpose | Priority |
|------|---------|----------|
| `context7` | gray-matter frontmatter preservation через spread + update | reuse (no new fetch) |
| `plan-audit` skill | Step 10 audit loop | mandatory |
| `security-audit` | not high-risk (no auth/data boundary changes) | skip |

---

## §2 MCP readiness verification

| Probe | Status |
|-------|--------|
| `context7` | ✅ ready (reused across series) |
| `plan-audit` | ⚠️ deferred to Step 10 |

---

## §3 Files read during planning

| File | Lines (post-fbf17cf) | Key locations |
|------|---------------------|---------------|
| `scripts/mailbox-lib.mjs` | 727 | `archiveMessageFile` line 579-640: uses `...parsed.data` spread → preserves existing fields. `updatedData` adds `status/archived_at/resolution/answer_message_id`. Need: add `received_at` backfill + `answered_at` optional. `readMessage` line 380 reads `answer_message_id` (line 409) и `resolution` (line 402). Need: add `answered_at` read path. |
| `scripts/mailbox.mjs` | 377 | `handleReply` line 212: calls `generateMessageFile` (creates reply) → `archiveMessageFile({answerMessageId: created.id})`. Need: pass `answeredAt: created.created`. `handleArchive` line ~288: standalone archive without answer. |
| `dashboard/src/App.jsx` | 1580 | `MessageCard` line ~1000+: `isArchived` branch line 1039-1053 renders chip. `cardTimestamps` line 1057+: 3-row block (Sent/Received/Completed). Need: change «Completed» row logic, add conditional «Answered» row, rename «Completed»→«Archived» as event timestamp. Status chip logic uses `message.resolution \|\| message.status`. |
| `local-claude-codex-mailbox-workflow.md` | 827 | `received_at` carve-out (post-mark-on-read). Archive section exists. Need: add `answered_at` field + archive backfill rule. |

---

## §4 Official docs fetched (Source Integrity)

Reuse: `gray-matter` round-trip (§V3 prior series). `matter.stringify(content, data)` preserves frontmatter order + fields.

---

## §5 AST scans + commands run

| Command | Output |
|---------|--------|
| `wc -l` | mailbox-lib=727, mailbox.mjs=377, server.js=203, api.js=73, App.jsx=1580, spec=827 |
| `git log --oneline -3` | HEAD=`fbf17cf docs: add deferred supervisor Phase A handoff artefacts`. Prior: `7ac6343 mark-on-read`, `01ed432 isolation`. |
| `grep archiveMessageFile\|resolution\|archived_at в lib` | archiveMessageFile line 579; validateResolution line 261; spread-preserve pattern confirmed line 620 |
| `grep cardTags\|isArchived\|cardTimestamps в App.jsx` | cardTags 637 (CSS) / 1046 (JSX); isArchived 1039; cardTimestamps 673 (CSS) / 1057 (JSX) |

---

## §6 Empirical tests

| Test | Output | Verdict |
|------|--------|---------|
| E1 — frontmatter preservation через archiveMessageFile-like spread | `{...parsed.data, status:'archived', archived_at:ts}` → все original fields present + new fields added | ✅ standard JS spread behavior; no empirical run needed |

---

## §7 Assumptions + verification status

| Claim in plan | Evidence / flag | Status |
|---------------|-----------------|--------|
| `archiveMessageFile` preserves all pre-archive frontmatter | §3 lib line 620 spread; standard JS behavior | ✅ verified |
| Backfill `received_at = archived_at` если отсутствует | Codex design — fills timeline gaps | ✅ design-agreed |
| New field `answered_at` populated ONLY при resolution=answered | Codex explicit clarification | ✅ design-mandated |
| Status chip separate from timestamps (cardTags uses existing chip pattern) | §3 App.jsx existing cardTags structure | ✅ reused |
| 4 timeline rows conditional render — «Ответ отправлен» only if answered_at present | Codex agreed design | ✅ design-mandated |
| `handleReply` provides `answeredAt = created.created` (reply's own timestamp) | semantically — reply creation = «ответ отправлен» moment | ✅ reasoned |
| No UI display для answer_message_id | Codex defer — next handoff | ✅ explicit out-of-scope |

---

## §8 plan-audit skill invocation

### Round 1 — 2026-04-19

- Invocation: `Skill({skill: "plan-audit"})`.
- Score: **9/10** 🟡.
- Critical fixes: 0. Important fixes:
  1. Change 1.3 added — `generateMessageFile` return extended с `created` field (enables Change 2.1 semantic-consistent `answeredAt` без fallback к new timestamp).
  2. V1 rewritten — trivial function.length check заменён на empirical (create test file → archive с answeredAt → verify d.answered_at === expected).
  3. G5 added — recoverOrphans не passes answeredAt, accepted minor follow-up.
- Optional deferred: none.

### Round 2 — 2026-04-19

Re-run post-R1 fixes. Score: **10/10** ✅ in-session skill. 0 new findings.

### Round 3 — Codex adversarial review (2026-04-19)

Codex поймал 2 blocker дыры которые in-session skill пропустил:

- Blocker F1 — `recoverOrphans` answered path: G5 был accepted как minor follow-up. Codex: «нельзя оставлять. recovered answered archive без answered_at — прямое нарушение timeline completeness requirement». Fix: Change 1.4 added — `recoverOrphans` passes `answeredAt: matchingReply.created` (reply's normalized timestamp из `readMessage`). Timeline полный.
- Blocker F2 — `handleArchive` answered path: CLI allowed `--resolution answered` без answered_at. Same class of hole как recoverOrphans. Fix: Change 2.2 added — handleArchive accepts `--answered-at` + `--answer-message-id` flags; throws ClientError(64) если `resolution=answered` без `answered-at`. Change 2.3 — usageText updated.
- Verification gap fixed: V11 (empirical recoverOrphans → verify archived has answered_at === reply.created) + V12 (grep guard presence в mailbox.mjs).

### Round 4 — Codex adversarial (2026-04-19, post-R3)

Codex поймал ещё 3 blocker:

- Blocker F3 — `/api/archive` третий caller не обновлён. Сам план whitelist'ил server.js как «no change» но `/api/archive` тоже может пропустить resolution=answered без answered_at. Fix: Change 3 added — server.js `/api/archive` accepts `answered_at`+`answer_message_id` body params + guard на resolution=answered без answered_at (400). Whitelist расширен.
- Blocker F4 — V12 invalid command. `MAILBOX_ROOT=... node mailbox.mjs archive` — mailbox.mjs не читает env, CLI ran against real agent-mailbox. Fix: V12 переписан на simple grep guard-string check в mailbox.mjs. Added V13 — symmetric grep check for server.js.
- Blocker F5 — plan/report sync. V1-V10 references остались после V11/V12 adding. Fix: все V1-V10 → V1-V13 (plan+report acceptance+self-audit). Change 3→4 (App.jsx), Change 4→5 (spec) renumbered. Self-audit items 10→11. Report table expanded.

### Round 5 — Codex adversarial (2026-04-19, post-R4)

Один residual blocker:

- Blocker F6 — report template change-to-file mapping stale after R4 plan renumbering. Plan: Change 3=server.js, 4=App.jsx, 5=spec. Report template остался: Change 3=App.jsx, 4=spec (missing Change 5). Fix: Report §1 reordered — Change 3=dashboard/server.js, Change 4=App.jsx (4 substeps), Change 5=spec added.

### Round 6 — pending Codex re-review

### Round 7 — retrospective plan-audit skill (2026-04-19, post-commit)

Plan executed in коммите `e4c3afb`; ретроспективная сверка через skill. Score: **10/10** ✅.

| Измерение | Баллы |
|---|---|
| Точность ссылок | 2/2 |
| Соответствие правилам | 2/2 |
| Учёт blast radius | 2/2 |
| Полнота шагов | 2/2 |
| Реализуемость | 2/2 |

**Верификация ссылок (12/12 pass):**

| Ссылка в плане | Статус | Подтверждение в коде |
|---|---|---|
| `archiveMessageFile` signature +answeredAt | ✅ | `scripts/mailbox-lib.mjs:588` |
| received_at backfill logic | ✅ | `scripts/mailbox-lib.mjs:632-634` |
| answered_at conditional write (только answered) | ✅ | `scripts/mailbox-lib.mjs:642-646` |
| readMessage читает answered_at | ✅ | `scripts/mailbox-lib.mjs:413-415` |
| recoverOrphans передаёт answeredAt | ✅ | `scripts/mailbox-lib.mjs:733` |
| handleReply passes answeredAt | ✅ | `scripts/mailbox.mjs:252` |
| handleArchive schema +answered-at | ✅ | `scripts/mailbox.mjs:279` |
| handleArchive guard | ✅ | `scripts/mailbox.mjs:293-298` |
| usageText update | ✅ | `scripts/mailbox.mjs:110-111` |
| /api/archive guard | ✅ | `dashboard/server.js:97,103` |
| App.jsx новые translation keys | ✅ | 17 occurrences (V5 expected ≥10) |
| spec обе секции | ✅ | `local-claude-codex-mailbox-workflow.md:326,332` |

**Blast radius:** 4 caller архива (`handleReply` / `handleArchive` / `recoverOrphans` / `/api/archive`) все получили `answeredAt` prop или guard — симметрия закрыта в R3-R4. Whitelist из 5 файлов покрыл весь граф зависимостей.

**Соответствие правилам:** rule #2 (three-file handoff), #3 (6 review rounds), #4 (PD scan V9 + CI fix `458552b`), #5 (no commit without user command, §14 явный), #8 (NO-STOP DISCIPLINE соблюдён в плане).

**Findings:** 0 critical / 0 important / 0 optional. План выполнен без расхождений с baseline.

---

## §9 Delta from prior Tier

Post-mark-on-read iteration. Delta: (1) `archiveMessageFile` adds `received_at` backfill + optional `answered_at`; (2) `handleReply` passes `answeredAt`; (3) Archive card UI — 4-row timeline + separate status chip; (4) spec updates.

---

## §10 Known gaps (honest flags)

### Gap G1 — existing archived messages без answered_at

Legacy archived messages (до этого handoff) не have `answered_at`. UI renders «Ответ отправлен» только если `answered_at` present — OK, skip for legacy. No migration.

### Gap G2 — status chip для pending messages

Pending messages (non-archived) не имеют resolution. UI chip только когда archived — existing behavior preserved.

### Gap G3 — superseded resolution usage

`superseded` resolution — existing value but rarely used. Label «Заменено» shown if encountered. No new logic required.

### Gap G4 — answer_message_id UI

Explicit out-of-scope. Follow-up handoff для reply-link display.

### Gap G5 — recoverOrphans не передаёт answeredAt → **CLOSED в Change 1.4**

~Accepted minor.~ **Post-R3 Codex finding**: дыра в timeline completeness. Fixed как Change 1.4 — `recoverOrphans` passes `answeredAt: matchingReply.created` at archive call. Timeline полный для recovered archives.

### Gap G6 — handleArchive resolution=answered без answeredAt → **CLOSED в Change 2.2**

Post-R3 Codex finding: CLI `archive --resolution answered` без answer context тоже создаёт archive без answered_at. Fixed — handleArchive теперь требует `--answered-at` когда `--resolution=answered` (ClientError 64 если missing). Optional `--answer-message-id` тоже добавлен.

---

## §11 Signature

Planner: Claude
Date: 2026-04-19
Procedure: `claude-plan-creation-procedure.md` v1
Design thread: `mailbox-archive-complete-design` (archived 2026-04-19)
