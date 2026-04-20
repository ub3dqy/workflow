# Mailbox Simple Monitor + UI Polish — Planning Audit

**Plan**: `docs/codex-tasks/mailbox-simple-monitor.md`
**Report template**: `docs/codex-tasks/mailbox-simple-monitor-report.md`
**Parent**: commit `903af96`
**Planner**: Claude
**Date**: 2026-04-21
**Baseline**: HEAD=`903af96`

---

## §0 Meta-procedure

Canonical procedure: `E:/Project/memory claude/memory claude/docs/claude-plan-creation-procedure.md` v1 (NO-STOP DISCIPLINE).

### Goal

User хочет простой minimal monitor: «робот проверяет папки, увидел новое письмо — дал агенту сигнал проверить почту». Сигнал теперь locked к project-scoped prompt «Проверь почту проекта ${project}: node scripts/mailbox.mjs list --project ${project}» (F1 post-R1 — короткое «проверь почту» без project context не даёт agent'у знать target project, т.к. adapter ignores `project` arg at execution time). User объяснил задачу много раз; предыдущие handoff'ы ушли в paperclip over-engineering. Codex от имени user прислал явный scope contract — реализовать именно то что просилось + 3 дополнительных полировки из ранних сообщений.

**Не ломаем и не откатываем** paperclip stack (supervisor + orchestrator + adapters + tasks + mailbox-resolution). Добавляем **поверх** легковесный монитор как отдельный feature, который user может включить одной кнопкой.

### Scope

**5 пунктов в одном handoff**:

1. **Simple mail monitor**: supervisor pollTick (уже каждые 3с) видит непрочитанное (`!received_at`) письмо в to-claude / to-codex → fire-and-forget spawn соответствующего агента через существующий adapter с project-scoped промптом `Проверь почту проекта ${project}: node scripts/mailbox.mjs list --project ${project}` (F1 post-R1 — adapter не пробрасывает project, поэтому project включён в prompt text). НЕ создаёт tasks, НЕ resume sessions, НЕ tracking. Серия «busy-flag» предотвращает параллельный spawn одного агента.
2. **UI toggle**: кнопка вкл/выкл monitor'а в шапке дашборда с цветовой индикацией статуса.
3. **Sound signal reliability**: WebAudio AudioContext unlock после первого пользовательского gesture (click / keydown).
4. **Received / not-read badge**: карточка сообщения показывает два timestamp'а — «отправлено» (created) + «прочитано» (received_at, или «не прочитано» badge).
5. **Local time**: formatTimestamp без `timeZone: "UTC"` → браузерная локальная зона.

### Out of scope (per user + Codex scope letter)

- Task queue / state machine (не добавляем к monitor'у).
- Orchestrator integration для monitor (monitor = отдельный mechanism).
- Session registry linkage (fire-and-forget).
- Lease / claim locks.
- Любые adapter contract changes.
- Multi-phase rollout.

---

## §1 MCP + Skill selection

| Tool | Purpose | Priority |
|------|---------|----------|
| `plan-audit` skill | Step 10 | deferred |
| Existing adapters (claude-code-adapter, codex-adapter) | re-use для spawn с коротким промптом | verbatim import |
| Existing mailbox-lib `readBucket` + markMessageReceived | already wired в supervisor pollTick | no change |

---

## §2 MCP readiness verification

| Probe | Result |
|-------|--------|
| Read `dashboard/supervisor.mjs` pollTick L356-404 | ✅ — `state.pendingIndex` обновляется after reading to-claude/to-codex buckets; insertion point для monitor logic = сразу после pendingIndex set |
| Read `dashboard/server.js` | ✅ — existing mount pattern для supervisor router + top-level endpoints confirmed |
| Read `dashboard/src/App.jsx` — playNotificationChime L175, formatTimestamp L1177-1184, soundEnabled+pending-watcher L1406-1531, MessageCard timestamp L1292, header button region L1755-1775 | ✅ — all insertion points mapped |
| Read `scripts/adapters/claude-code-adapter.mjs` factory signature | ✅ — can be instantiated ad-hoc в supervisor closure |
| Read `scripts/adapters/codex-adapter.mjs` — spawnPrefix Windows wrap | ✅ — pattern same as server.js bootstrap |
| `plan-audit` skill | deferred Step 10 |

---

## §3 Files read during planning

| File | Purpose |
|------|---------|
| `dashboard/supervisor.mjs` L1-30, 355-450 | factory state + pollTick insertion site |
| `dashboard/server.js` L181-220 | supervisor mount + orchestrator bootstrap |
| `dashboard/src/App.jsx` L175-203 chime, L1177-1184 formatTimestamp, L1286-1310 MessageCard, L1400-1535 sound watcher, L1750-1775 header buttons | 5 UI insertion sites |
| `scripts/adapters/claude-code-adapter.mjs` + `codex-adapter.mjs` | existing 8-method adapters, re-usable through `launch()` for one-shot spawn |
| Codex scope letter 2026-04-20T22-23-33Z (archived) | explicit scope contract from user via Codex |

---

## §4 Official docs fetched

Not applicable — pure internal feature using committed primitives.

---

## §5 AST scans + commands run

| Command | Key output |
|---------|------------|
| `git rev-parse HEAD` | `903af96` |
| `wc -l dashboard/*.js* scripts/mailbox-lib.mjs` | supervisor=467, server=401, App.jsx=1972 |
| Grep `state.pendingIndex = pending` supervisor.mjs | L387 (monitor insertion) |
| Grep `timeZone: "UTC"` App.jsx | L1182 (only instance) |

---

## §6 Empirical tests

Not applicable для planning.

---

## §7 Assumptions + verification status

| Claim | Evidence | Status |
|-------|----------|--------|
| Reusing existing adapters via ad-hoc `launch()` для «one-shot ping» signal работает | adapter contract uses spawn+await | ✅ reasoned |
| Fire-and-forget `void adapter.launch(...)` безопасен — adapter.activeSpawns tracks children + shutdown sweep | claude-code-adapter F2 post-R1 activeSpawns design | ✅ |
| busyAgents Set предотвращает двойной spawn для одного агента mid-flight | Set semantics + serial pollTick invariant | ✅ |
| Monitor ≠ orchestrator: monitor не изменяет task registry и не пишет в persistent state beyond toggle flag | scope design explicit | ✅ |
| «Проверь почту» короткий prompt → agent сам через CLI инструменты увидит inbox | agent instruction-following capability | ⚠️ assumed — Phase 2 validates live agent response |
| markMessageReceived срабатывает когда agent через `mailbox.mjs list` смотрит ящик | mailbox-lib L468-489 + confirmed на live Phase 2 P2.4 cycle P4b | ✅ verified |
| WebAudio `ctx.resume()` внутри click/keydown listener разблокирует audio для последующих chime invocations | standard browser AutoPlay policy | ✅ |
| Local timezone через Intl.DateTimeFormat без `timeZone` option | MDN / ECMA-402 default behavior | ✅ |
| Toggle persistence через отдельный runtime JSON file | pattern tasks.json / supervisor-health.json | ✅ |

---

## §8 plan-audit skill invocation

### Round 1 — 2026-04-21

Invocation: `Skill({plan-audit})`. Score: **10/10** ✅ (0 critical, 0 important, 0 optional). Scope tight, соответствует user-explicit scope letter, all insertion points verified. Paperclip intact.

Ready для Codex adversarial delivery.

### Round 2 — 2026-04-21 (Codex adversarial)

Invocation: mailbox reply `2026-04-20T22-39-15Z-codex-001`. 4 findings:

- **F1 (critical) — adapter ignores `project` arg**: both adapters receive `project` только для internal Map tracking (claude-code-adapter.mjs:188, codex-adapter.mjs:232), не передают агенту как cwd / workspace / prompt context. Короткий «проверь почту» spawn'ит агента без project hint. **Fix applied**: prompt expanded к `Проверь почту проекта ${project}: node scripts/mailbox.mjs list --project ${project}` — explicit project name + CLI invocation. User's «short signal» idea сохранена структурно, но agent теперь знает project.
- **F2 (important) — Change 3.4 regresses archive timestamps**: baseline App.jsx L1285-1306 showed 4 timestamps (sent/received/answered/archived). Plan wholesale replaced с 2-line — стерло бы answered_at + archived_at. **Fix applied**: Change 3.4 теперь conditional ONLY на «received» span — если received_at пустой, badge «не прочитано», иначе timestamp как было; answered + archived spans unchanged.
- **F3 (important) — false isolation claim**: report §10 rails assertion «pendingIndex already project-scoped» неверно (supervisor.mjs L365-387 — cross-project pending). **Fix applied**: §10 rails reformulated: «monitor iterates cross-project pendingIndex, но для каждого message spawn'ит с message.project — per-message isolation preserved, cross-project bleed blocked».
- **F4 (medium) — planning-audit status inconsistent**: §8 R1 said 10/10 ready, §11 still said draft. **Fix applied**: §11 updated к «audit-clean post R1 Codex adversarial (Step 2-10 complete) → Step 11 Codex re-review pending».

All 4 applied. R3 — pending Codex re-review.

### Round 3 — 2026-04-21 (Codex adversarial)

Invocation: mailbox reply `2026-04-20T22-43-48Z-codex-002`. 3 findings:

- **F5 (important) — prompt contract inconsistent через package**: после F1 actual prompt расширился, но plan §0/§3/§6 P2.3, planning-audit §0, G4, report §9 all still said «short signal проверь почту». **Fix applied**: all 6 locations synced к new locked contract «`Проверь почту проекта ${project}: node scripts/mailbox.mjs list --project ${project}`». §9 STOP condition #7 updated. Gap G4 marked RESOLVED с trade-off note (prompt ~60 chars vs original 13).
- **F6 (important) — V10/report still check `messageCardTimestamps` which F2 removed**: F2 fix only patches existing received span, no new className. **Fix applied**: V10 split к V10a (grep `notRead` ≥2) + V10b (baseline `timestampAnswered`/`timestampArchived` regression check ≥2). Report §2 V10 slot reworded.
- **F7 (medium) — V12 description-command mismatch**: table said «fire-and-forget stubbed adapter launch capture», command only checked `isMonitorEnabled()===false`. **Fix applied**: V12 command expanded к V12a/V12b/V12c structural sequence (default false → setMonitorEnabled(true) → persisted flag check). Table description reworded «monitor enable/disable lifecycle». Real spawn verification explicitly scheduled Phase 2 P2.3.

All 3 applied. R4 — pending Codex re-review.

### Round 4 — 2026-04-21 (Codex adversarial)

Invocation: mailbox reply `2026-04-20T22-49-11Z-codex-003`. 3 medium stale cleanups (0 blockers):

- **F8 (medium) — planning-audit footer stale**: §11 still said «post R1 ... F1-F4» despite Round 3 already documented F5-F7 earlier в the file. **Fix applied**: footer обновлён к «post R3 Codex adversarial (Step 2-10 complete, F1-F7 + F8-F10 doc cleanup applied)».
- **F9 (medium) — plan stale «two-line» / «проверь почту»**: plan §3 L47 + §10 self-audit item 7 L548 + §11 Notes L569. **Fix applied**: L47 «received-span conditional notRead badge (answered/archived spans untouched)»; L548 item 7 аналогично reworded; L569 Notes prompt contract explicit.
- **F10 (medium) — report template stale wording**: report §1 Change 3.4 L56 + V12 title L128 + P2.3/P2.5 L152/L154 + §6 item 7 L180. **Fix applied**: все 5 locations sync'нуты к final shape.

All 3 applied. R5 — pending Codex re-review.

### Round 5 — 2026-04-21 (Codex adversarial)

Invocation: mailbox reply `2026-04-20T22-54-01Z-codex-004`. 2 tiny stale cleanups (0 blockers):

- **F11 (medium) — planning-audit footer one round behind**: §11 still said post-R3. **Fix applied**: «post R4 Codex adversarial (Step 2-10 complete, F1-F10 + F11-F12 doc cleanup applied inline)».
- **F12 (minor) — narrative lines still use «проверь почту»**: plan L76 comment + planning-audit §0 L18. **Fix applied**: оба переписаны к project-scoped prompt contract «Проверь почту проекта ${project}: node scripts/mailbox.mjs list --project ${project}».

Both applied. R6 — pending Codex re-review.

### Round 6 — 2026-04-21 (Codex adversarial)

Invocation: mailbox reply `2026-04-20T23-02-10Z-codex-005`. Codex вердикт: **«No new blockers ... the package is execution-ready after the footer sync; no new substantive findings»**. 2 tiny stale cleanups:

- **F13 (medium) — footer still R4**: §11 footer one round behind. **Fix applied**: «post R5 Codex adversarial (F1-F12 + F13-F14 doc cleanup applied across 5 rounds) → Step 11 delivery».
- **F14 (minor) — plan L136 narrative «проверь почту без контекста»**: slightly less consistent phrasing. **Fix applied**: comment reworded «Без project hint агент не знает какой ящик проверять. Поэтому prompt включает project + explicit mailbox CLI invocation — locked contract.»

Adversarial loop closed. **Final**: execution-ready per Codex R6 acknowledgement.

---

## §9 Delta from `903af96`

- Recent work — paperclip stack (P1-P4b + mailbox-resolution) + launcher UX.
- This handoff adds **parallel lightweight monitor** — не заменяет paperclip, user выбирает какую automation использовать (paperclip via task queue / monitor via ping-on-new-mail).
- 3 UI polishing items поверх monitor toggle.

---

## §10 Known gaps (honest flags)

### Gap G1 — WebAudio unlock первый chime

AudioContext requires user gesture before sound можно play. Unlock attached to document click/keydown → первый chime _после_ первого взаимодействия надёжен; если первое письмо приходит _до_ первого клика — первая нота возможно silent. Cosmetic.

### Gap G2 — «Не прочитано» badge после restart

Dashboard restart — agents не сразу вычитают inbox → badge показывает «не прочитано» несколько секунд пока monitor не spawn'нет их. Cosmetic.

### Gap G3 — Monitor + orchestrator simultaneously enabled

Если включены оба (paperclip orchestrator + simple monitor), оба могут попробовать spawn агента для одного и того же письма. Monitor checks `!received_at`; orchestrator фokусируется на tasks. Пересечение возможно если паперклип task uses same thread where новое mail. Mitigation: проси user использовать ровно ONE из двух (UI не предотвращает, но документирует в tooltip). Accept risk.

### Gap G4 — RESOLVED post-Codex-R1 F1

Gap первоначально был «prompt требует от агента знать про mailbox.mjs list». F1 post-R1 Codex adversarial pointed out что adapter не пробрасывает project context — короткое «проверь почту» вообще не даст агенту target project. **Resolved**: prompt теперь `Проверь почту проекта ${project}: node scripts/mailbox.mjs list --project ${project}` — explicit project + CLI. Sub-gap: user's original «short signal» preference теперь не 100% дословно (prompt ~60 символов вместо 13). Trade-off принят — без project hint agent не может работать.

### Gap G5 — Default monitor = false

После first run monitor OFF. User должен нажать кнопку ON. Explicit opt-in per safety. Следующий restart — persists last state.

### Gap G6 — busyAgents memory-only

busy state не persists; если supervisor crash mid-spawn — next start не знает что agent был busy. Acceptable — busyAgents в memory, agents короткоживущие.

---

## §11 Signature

Planner: Claude
Date: 2026-04-21
Procedure: `claude-plan-creation-procedure.md` v1
Baseline: HEAD=`903af96`
Status: **audit-clean post R5 Codex adversarial (Step 2-10 complete; F1-F12 + F13-F14 doc cleanup applied across 5 rounds; Codex вердикт «execution-ready»)** → Step 11 delivery к Codex execute thread.
