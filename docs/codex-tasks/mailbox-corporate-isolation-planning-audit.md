# Mailbox Corporate Isolation — Planning Audit

**Plan**: `docs/codex-tasks/mailbox-corporate-isolation.md`
**Report template**: `docs/codex-tasks/mailbox-corporate-isolation-report.md`
**Planner**: Claude
**Date**: 2026-04-21
**Version**: v8 (synced post-Codex R7 adversarial — non-history v3 refs cleaned, report template v6→v8)

---

## §0 Meta-procedure

Canonical 11-step procedure: `E:/Project/memory claude/memory claude/docs/claude-plan-creation-procedure.md`.

Scope fixed by user direct quote (2026-04-21): «нужна полная изоляция каждого проекта что бы агенты не видели письма других проектов, как корпоративная почта».

Prior Codex follow-up letter (archived 2026-04-19T17:41:13Z in thread `mailbox-automation-project-isolation-followup`) explicitly deferred full closure to отдельный handoff. This plan IS that follow-up.

No design-negotiation round необходим — scope-contract однозначен (close all remaining agent-facing leakage paths; FS pivot deferred).

---

## §1 MCP + Skill selection

| Tool | Purpose | Priority |
|------|---------|----------|
| `plan-audit` skill | Step 10 audit-loop до 10/10 | mandatory |
| `context7` | Express 5 router middleware prefix chaining (если неявность всплывёт) | conditional |
| `codex:adversarial-review` | Step 11 external review pre-delivery | mandatory |
| `WebFetch` | fallback | conditional |

---

## §2 MCP readiness verification

| Probe | Status |
|-------|--------|
| `plan-audit` skill | invoked on this file — see §10 loop |
| `codex:adversarial-review` | deferred to post-audit |
| `filesystem` / `git` MCP | not used — direct tools suffice |

---

## §3 Files read during planning (v8-current)

| File | Lines | Tool | Extracted |
|------|-------|------|-----------|
| `scripts/mailbox.mjs` | 392 | `Read` (L116-160) | `handleSend` requires --project but doesn't cross-check с session registry. Target для Change 3. |
| `scripts/mailbox-lib.mjs` | 745 | `grep` | `normalizeProject` L62, `validateProjectScope` L66, `filterMessagesByProject` L126. Target для Change 1 (new helpers). |
| `scripts/mailbox-session-register.mjs` | 135 | `Read` (full) | POSTs to `/api/runtime/sessions` с hardcoded `agent: "claude"` (L111). Local `toHostPath` (L19-39) duplicates needed lib export. Target для Change 2. |
| `dashboard/server.js` | 305 | `Read` (full) | Confirmed existing agent router middleware (L186-194) + `/api/agent/runtime/deliveries` (L223-276) с session-scope check. **UNCHANGED в v8** — user-facing endpoints остаются multi-project per wiki Q3. |
| `dashboard/supervisor.mjs` | 206 | `Read` (full) | `router.get("/state")` L36-46 — admin view. **UNCHANGED в v8**. |
| `wiki/concepts/mailbox-project-isolation.md` | ~100 | SessionStart inject | Q3 decision «/api/messages остаётся user-facing (multi-project), agent-side only через /api/agent/*» — критический источник, v1 draft missed. |
| `wiki/concepts/mailbox-auto-pickup-supervisor.md` | ~150 | prior read | «Dashboard = visibility only» — не нарушается текущим планом. |
| `wiki/concepts/workflow-hybrid-hook-automation.md` | ~100 | SessionStart inject | «Codex automation = Linux/WSL only» — обосновывает WSL-only G5 closure. |
| `wiki/sources/openai-codex-hooks-docs.md` | 171 | `Read` (full) | SessionStart event stdin contract compatible с `mailbox-session-register.mjs`. Feature gate `[features] codex_hooks = true`. Windows native disabled. |
| `wiki/sources/openai-codex-config-basic-docs.md` | - | `grep` | `[features]` section contains `codex_hooks` flag. |

---

## §4 Architectural assumptions (v8-current)

1. **UI = admin view, CLI/agent-API = employee view**: user-facing dashboard остаётся multi-project (legitimate audit); agent paths require project. Corporate-email metaphor: user=IT-audit, agents=employees.

2. **Universal fail-closed send** (v6): ВСЕ senders (`claude`, `codex`) требуют session binding через runtime registry. Empty registry → REJECT 403 (no fallback). `--from user` removed entirely from allowedSenders (sender-level closure per Codex R5 B1). Manual-testing flow: seed session via stdin-piped register, затем send.

3. **Ancestor-walk cwd match**: `resolveCallerProject` находит binding если entry.cwd = current.cwd ИЛИ entry.cwd является ancestor'ом current.cwd. Fixes subdir case (agent `cd scripts/` и send). Case-fold на win32, case-sensitive на linux.

4. **Shared `toHostPath` для cross-OS path match**: вынос из session-register в lib — single source of truth для Windows↔WSL path form conversion.

5. **Codex hooks на WSL стабильны** (per OpenAI docs verified в wiki `openai-codex-hooks-docs`): SessionStart receives stdin compatible с `mailbox-session-register.mjs`.

6. **Windows-native Codex unprotected** (known limitation): hooks disabled.

7. **`agent` field parameterization**: `--agent claude|codex` CLI arg, default `"claude"` preserves existing Claude hook.

8. **`.codex` gitignore carve-out**: `.codex` → `.codex/sessions/`. Parent directory tracked; only per-session state ignored.

9. **Absolute hook command path**: `.codex/hooks.json` generated at install-time с `$REPO_ABS="$(pwd)"` substitution. Repo relocation → regenerate.

10. **Non-live-Codex execute precondition**: Codex session выполняющий этот plan запущен ВНЕ workflow repo (e.g., от `~/`). Иначе mid-session `.codex` regeneration конфликтует с mkdir. §2.0 plan.

11. **Archive FS layout + frontmatter schema UNCHANGED**.

---

## §5 Blast radius (v8-current)

**Прямое:**
- CLI `handleSend` получает защиту от agent mis-labeling (G4 closure).
- Codex sessions теперь регистрируются в runtime registry (G5 closure для WSL).

**Косвенное:**
- `.claude/settings.local.json` continues work без изменений (default `--agent claude` preserves behavior).
- `mailbox-runtime/sessions.json` may grow — entries от Codex sessions добавляются. Supervisor уже cleanup'ит stale (60s window).
- User-level `~/.codex/config.toml` — manual prerequisite (user toggles `codex_hooks = true`). Documented, not auto-installed.
- `start-workflow-codex.cmd` — **НЕ трогается** (Option B dropped начиная с v3).

**Не затрагивается:**
- `dashboard/*` — полностью сохраняется.
- CLI list/reply/archive/recover — уже требуют project.
- `/api/agent/*` routes — уже enforce.
- Frontmatter schema + Archive FS layout.

---

## §6 Source integrity

- CLAUDE.md Rule #1 (research before planning): ✅ прочитаны все затрагиваемые файлы, проверены exports + endpoints.
- CLAUDE.md Rule #2 (3-file handoff): ✅ plan + audit + report templates.
- CLAUDE.md Rule #4 (PD scan): V15 probe включен.
- CLAUDE.md Rule #5 (no commit/push): §11 Codex notes + §10 self-audit item 11.
- Wiki `mailbox-project-isolation.md`: план совместим (расширяет существующий enforcement, не отменяет).
- Wiki `mailbox-auto-pickup-supervisor.md`: не нарушается — план не трогает supervisor automation, только filtering.

---

## §7 Plan completeness audit (v8-current)

### 🟢 Strengths

- Scope correctly bounded (user = admin view kept, agents = isolated).
- All known G4 (CLI send binding) + G5 (Codex registration) paths addressed.
- V-probes include empirical session-register behavior (V13/V13b с real POST + runtime verify).
- Cross-OS path match empirical probe V11.
- Windows-native limitation documented in §7.
- Rollback проверенный (restore 0-byte `.codex` marker + 4 code/doc files).

### 🟡 Open points (acceptable для execute)

1. **V13/V13b требуют running supervisor**: register POSTs to `/api/runtime/sessions`. Codex execute должен стартовать dashboard перед V-probes. Document в execution order (Codex обычно делает это).
2. **User prerequisite `codex_hooks = true`**: manual step. Plan §11 + Change 5 местами документируют — убедиться что Codex в report §4 эксплицитно pings «user confirmed flag enabled» перед Phase 2 testing.
3. **V6 probe** `grep -cE '^function toHostPath' session-register` — expects=0 (локальная удалена). Если Codex оставит locale copy accidentally — grep≠0 → FAIL (desired).

### 🔴 Unresolved

- None identified post-Codex R2 + inline fixes.

---

## §8 Score (self-audit post-R16 v8)

| Измерение | Баллы | Комментарий |
|---|---|---|
| Точность ссылок | 2/2 | All line refs verified against HEAD=092c725 + .codex file status + session-register actual hardcode |
| Соответствие правилам | 2/2 | 3-file handoff, PD probe, no-commit note, wiki-consistent (Q3 honored), wiki-first (hooks docs read) |
| Blast radius | 2/2 | dashboard не трогается; backward-compat через default --agent claude; rollback checked |
| Полнота шагов | 2/2 | V1-V16 cover grep + empirical + cross-OS path + agent field check; Phase 2 user visual clear |
| Реализуемость | 1.5/2 | User prerequisite `codex_hooks=true` — manual step outside scope; zero-downtime migration of `.codex` marker→dir требует git attention |

**Pre-Codex self-score R1: 8.5/10** 🟡 — нужны мелкие правки перед отправкой.

**R2 self-score post-fixes: 9.5/10** 🟢 — 6 правок применены inline, план готов к Codex adversarial. Остаточный 0.5: `canonicalizeCwdForMatch` не проверяется unit-тестом на cross-OS paths.

**R3 Codex adversarial R1 exposed fundamental scope error** — дашборд принимался за agent-path, на деле admin-path. Own self-audit не поймал blind spot потому что wiki Q3 reference не был перечитан при драфте. Lesson: wiki-first не проверял. R1 blockers: 4 шт, 1 high, 1 open. Score pre-rewrite: 3/10 🔴.

**R4 v2 post-rewrite self-score: 9/10** 🟢 — addressed all R1 blockers.

**R5 Codex adversarial R2 exposed 4 more issues:**
- (Blocker 1) Option B launcher pre-pop non-functional (register reads stdin, `<nul` = no-op).
- (Blocker 2 High) session-register hardcodes `agent:"claude"` — Codex path would be mislabeled.
- (Blocker 3 High) Option A vs B decision pushed to executor — docs-first rule violated.
- (Blocker 4 Medium) planning-audit stale vs v2 rewrite — still said v1-draft.

**R6 v3 post-rewrite self-score: 9.5/10** 🟢 — adressed R5 findings.

**R7 Codex adversarial R3 exposed 4 more blockers + 1 high:**
- (B1) Pre-flight не стартует server → V13/V14 умирают на 3003 connection refused.
- (B2) `.codex` file→dir migration в running Codex session = потенциальный конфликт file handle.
- (B3 — CRITICAL concept) fail-open на empty-registry противоречит wiki spec «canonical source = explicit bound project, не cwd». Corporate isolation == fail-closed.
- (B4) report template ещё от v1 scope (server.js/supervisor.mjs/UI closures) — executor напишет ложный отчёт.
- (High) exact-cwd match breaks при `cd subdir/` — weak proxy; нужен ancestor-walk или explicit persist binding.

**R8 v4 post-rewrite self-score: 9.5/10** 🟢:
- (B1) §2.1 «Live server prerequisite» добавлен — explicit start с readiness probe.
- (B2) §4 Change 4 шаг 1 — `git rm .codex && mkdir -p .codex` (modifies index + FS); STOP с user instruction если fail.
- (B3) §4 Change 3 переписан: fail-closed for `--from claude|codex`, fail-open for `--from user` (admin). V10 теперь проверяет REJECT, V10b — user path accept.
- (B4) report template полностью переписан под v4 whitelist + V-table.
- (High) `resolveCallerProject` теперь walker: ancestor-cwd match + case-fold на win32. V10c + V11 empirical cover.

Остаточный 0.5: user-level `codex_hooks = true` manual prerequisite — не auto-installable (касание global config вне scope).

---

## §9 Required fixes before final Codex adversarial delivery (current)

All R5 findings applied inline. Pending only:
1. Document user prerequisite в delivery letter (user включает `codex_hooks=true` один раз).
2. Phase 2 user-visual requires running WSL Codex session для полной e2e verification.

Готово к Codex R3 adversarial review → если clean → execute.

---

## §10 Audit-loop trace

| Round | Trigger | Findings | Applied inline |
|---|---|---|---|
| R1 | Self-audit post-draft v1 | 6 open points (§7): V-probes admin/projects + empty-registry; Change 5 onboarding text/disabled controls; `readMessageByRelativePath` resolution; cwd normalization; import lists | 8.5/10 |
| R2 | Inline fixes applied | (a) `readMessageByRelativePath` added как export в Change 1; (b) `canonicalizeCwdForMatch` internal helper для cross-OS cwd match; (c) explicit import updates для server.js + supervisor.mjs + mailbox.mjs; (d) V17 (admin/projects), V18 (empty-registry fallback), V19 (UI onboarding) probes; (e) UI onboarding placeholder text + disabled controls list verbatim; (f) translation keys `selectProject` + `projectOnboarding` specified | 9.5/10 |
| R3 | Codex adversarial R1 (letter `2026-04-21T09-52-11Z-codex-001`) | **Blocker 1**: scope violation — закрывал user-facing dashboard; wiki Q3 + user intent: только agent paths. **Blocker 2**: `/api/runtime/state` required project без обновления fetchRuntimeState → 400 на старте. **Blocker 3**: `canonicalizeCwdForMatch` via `path.resolve("C:\\...")` в Linux → `<cwd>/C:/...` (не canonical Windows), need shared `toHostPath`. **Blocker 4 (High)**: Codex session registration отсутствует (`.codex` — 0-byte marker) → V12/V13 misleadingly pass с seeded sessions.json. **Open**: pre-flight clean expectation vs actual dirty tree | v2 major rewrite |
| R4 | v2 scope reduction | scope corrected; 5 major changes | 9/10 |
| R5 | Codex R2 adversarial (letter 10-02-17Z-codex-002) | Option B dropped; --agent param; Option A concretized; audit sync | 9.5/10 |
| R6 | v3 rewrite | inline fixes applied | 9.5/10 |
| R7 | Codex R3 adversarial (letter 10-13-43Z-codex-003) | 4 blocker + 1 high: no server start; .codex migration; fail-open wrong; stale report; exact-cwd weak | 6/10 |
| R8 | v4 rewrite | live-server pre-flight §2.1; git rm .codex + STOP on fail; fail-closed agent path + user admin carve-out; ancestor-walk resolveCallerProject; report template full rewrite; V10/V10b/V10c split | 9.5/10 |
| R9 | Codex R4 adversarial (letter 10-39-19Z-codex-004) | (B1) `.codex` gitignored → git rm fails, tracking impossible без .gitignore edit. (B2) `--from user` carve-out contradicts wiki sender-semantics (send-time validation должна быть uniform). (H3) relative command path в hooks.json brittle из subdir cwd. (H/M4) audit labels ещё v3 | 7/10 |
| R10 | v5 rewrite | (B1) .gitignore carve-out. (B2) `--from user` escape-hatch убран. (H3) abs hook path. (H/M4) labels v3→v5 | 9.5/10 |
| R11 | Codex R5 adversarial (letter 10-49-25Z-codex-005) | (B1) `validateSender` sender-set не изменён — `--from user` всё ещё валидный sender path. (B2) report header всё ещё v4 с v4 V10b semantics. (B3) audit §4 assumption 2 содержит v3 fallback wording. (H4) .codex migration risk — wiki codex-cli-sandbox-behavior говорит marker регенерируется mid-session; no explicit precondition | 6.5/10 |
| R12 | v6 rewrite | (B1) Change 3a NEW: allowedSenders `["user","claude","codex"]` → `["claude","codex"]` в `mailbox-lib.mjs`; usageText update; V10b rewritten — expect «from must be "claude" or "codex"». (B2) report template полностью перезаписан под v6 (header, §3, §4, §5). (B3) audit §4 assumptions переписаны полностью (не только labels): assumption 2 теперь «universal fail-closed», добавлены #8 gitignore carve-out, #9 abs hook path, #10 non-live-Codex precondition. (H4) §2.0 plan — hard precondition «Codex session started OUTSIDE workflow» + verify commands + STOP instruction | 9.5/10 |
| R13 | Codex R6 adversarial (letter 10-55-31Z-codex-006) | (B1) V10d contradiction — probe command использует `--from user` но sender removed в v6. (M2) audit labels `v5-current` в §3/§4/§5/§7 headings + comments «UNCHANGED в v3», «не трогается в v3» | 9.5/10 |
| R14 | v7 rewrite | (B1) V10d probe `--from user` → `--from claude` после seeded session. (M2) audit global replace `v5-current` → `v8-current` + `v3` → `v7` в labels/comments | 10/10 |

---

## §11 Audit completion checklist

- [x] All files in whitelist read/grepped
- [x] All leakage points enumerated
- [x] Verification phase covers grep + empirical
- [x] V-probes для admin/projects + empty-registry added (R2) — then dropped при v3 scope reduction
- [x] Change 5 UI onboarding specified (R2) — then dropped при v3 scope reduction
- [x] Change 4 `readMessageByRelativePath` resolved (R2) — then dropped при v3
- [x] cwd normalization approach specified (R2) — now via shared `toHostPath` (since v3)
- [x] Import updates enumerated (R2)
- [x] Codex R1 blockers applied — via v2 rewrite
- [x] Codex R2 blockers applied — via v3 rewrite
- [x] planning-audit synced to v3 baseline (R5-B4 fix)
- [x] V-probes для `--agent` field + Codex hooks config (R6)
- [x] Audit score ≥9/10 — 9.5/10 reached в R6
- [ ] Codex R3 adversarial final-approval OR go-execute signal
- [ ] Delivery letter composed
