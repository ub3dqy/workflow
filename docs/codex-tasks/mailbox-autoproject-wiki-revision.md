# Mailbox Autoproject + Wiki Revision — Execution Plan

**Version**: v1 (2026-04-17)
**Planning-audit**: `docs/codex-tasks/mailbox-autoproject-wiki-revision-planning-audit.md`

---

## Why this plan exists

Дважды self-execution ранее (CLI auto-project + wiki operational article) был корректно отклонён Codex adversarial review с двумя замечаниями:

1. **CLI**: тихая смена documented contract "send без `--project` = unscoped" (`multi-project-support.md:43` + V2 `:184`). Моя правка добавляла cwd basename, не обновляя spec.
2. **Wiki article**: команды `node E:/Project/workflow/...` — Windows-only, ломаются в WSL с `MODULE_NOT_FOUND` (половина целевой аудитории — Codex — использует WSL).

Оба изменения откачены (`scripts/mailbox.mjs` → HEAD; `wiki/concepts/agent-mail.md` удалён; `wiki/index.md` revert).

Этот handoff — правильное переделывание через Codex workflow с explicit contract change (Block A) и cross-OS commands (Block B).

---

## Иерархия источников правды

1. **Офдока** (Node.js v24 API docs через `context7`) — главная правда
2. **Реальное состояние кода** на диске — вторая правда
3. **Этот план** — третья, может содержать ошибки
4. **Discrepancy-first**: при `plan ≠ reality` → STOP → Discrepancy log → wait

---

## Doc Verification (§V1-§V3)

Codex должен перепроверить каждый verbatim quote перед применением Changes.

### §V1 — `path.basename()`

**Source**: `https://nodejs.org/docs/latest-v24.x/api/path.json` (via `context7` `/websites/nodejs_latest-v24_x_api`)

**Verbatim**: *"The `path.basename()` method returns the last portion of a `path`, similar to the Unix `basename` command. Trailing directory separators are ignored."*

**Signature**: `path.basename(path[, suffix])` — throws TypeError if path not string.

### §V2 — `process.cwd()`

**Source**: `https://nodejs.org/docs/latest-v24.x/api/process.json`

**Verbatim**: *"Returns the current working directory of the Node.js process."* — returns string (absolute path).

### §V3 — Cross-platform path behavior

**Source**: `https://nodejs.org/docs/latest-v24.x/api/path.json`

**Verbatim**: *"The default operation of the `node:path` module varies based on the operating system. On Windows, it assumes Windows-style paths. For consistent results across platforms, use `path.win32` for Windows paths and `path.posix` for POSIX paths."*

**Empirical** (from planning-audit §6): `path.basename(process.cwd())` gives `"workflow"` from both `E:\Project\workflow` (Windows) and `/mnt/e/project/workflow` (WSL). Drive root (`E:\`) yields empty string — acceptable fallback (no `project:` field written).

---

## Pre-flight verification (Codex executes before any Change)

Record each step in report §0 and §0.6 with raw output.

1. **Environment**: `uname -a && node --version` (record in §0.1)
2. **HEAD commit**: `git log --oneline -1` — record observed SHA. Planning snapshot был `6a65e46` (2026-04-17 morning), но **baseline drifts** — main может получить новые коммиты между plan writing и execution. **Не STOP** при mismatch; просто record observed SHA в §0.1.
3. **Working tree**: `git status --short` — record observed state в §0.2.

   **Baseline may be stale (planning снимок 2026-04-17 morning)**: изначально было `M dashboard/*, scripts/mailbox-lib.mjs, scripts/mailbox-status.mjs, scripts/mailbox.mjs` + untracked launchers + untracked `docs/codex-tasks/multi-project-support*.md`. User мог закомитить/откатить эти файлы между plan writing и execution — поэтому Codex делает **fresh snapshot** и документирует observed, не сверяет с plan'овским list.

   **Expected after fresh snapshot** (любой):
   - `scripts/mailbox.mjs` — либо `M` (still uncommitted) либо clean (если user закомитил) — Change 1 будет edit regardless
   - `docs/codex-tasks/multi-project-support.md` — либо `M`, либо `??`, либо committed; Change 2 edits regardless of current git state
   - `docs/codex-tasks/mailbox-autoproject-wiki-revision{,-planning-audit,-report}.md` — этот handoff, untracked
   - launcher files (`start-workflow*`, `stop-workflow.cmd`, `.codex`) — untracked, out of scope

   **STOP только** если Change 1 target line (127) не содержит `const project = normalizeProject(options.project)` — это точный pre-edit probe (Step 4.5 ниже). Остальные baseline differences — фиксировать observed, не STOP.
4. **Baseline file sizes**: `wc -l scripts/mailbox.mjs scripts/mailbox-lib.mjs docs/codex-tasks/multi-project-support.md docs/codex-tasks/multi-project-support-report.md` — expected 321 / 590 / 248 / 150.
4.5. **Pre-edit diff inspection** (новая проверка из-за dirty working tree): `git diff scripts/mailbox.mjs` — убедиться что точка применения (line 127 + lines 105-109) НЕ затронута existing модификациями. Если затронута — STOP, log в Discrepancies, ask user.
5. **Read target files fully** before editing (not grep):
   - `scripts/mailbox.mjs` (321 lines)
   - `scripts/mailbox-lib.mjs` (590 lines) — particular `generateMessageFile` 378-441
   - `docs/codex-tasks/multi-project-support.md` (248 lines)
   - `docs/codex-tasks/multi-project-support-report.md` (150 lines)
6. **WSL path casing live probe** — **два separate filesystem roots**, каждый нужен отдельный probe:

   **6a. WORKFLOW_ROOT probe** (для Block A code changes — workflow repo):
   ```bash
   ls /mnt/e/project/workflow 2>&1 | head -3
   ls /mnt/e/Project/workflow 2>&1 | head -3
   ```
   Export: `WORKFLOW_ROOT="/mnt/e/Project/workflow"` (или lowercase если probe показал). Choose whichever matches Windows Explorer display.

   **6b. WIKI_ROOT probe** (для Block B wiki article — **memory-claude repo, не workflow**):
   ```bash
   ls "/mnt/e/project/memory claude/memory claude" 2>&1 | head -3
   ls "/mnt/e/Project/memory claude/memory claude" 2>&1 | head -3
   ```
   Export: `WIKI_ROOT="/mnt/e/Project/memory claude/memory claude"` (или lowercase соответственно).

   **6c. Derived variable**:
   ```bash
   ARTICLE="$WIKI_ROOT/wiki/concepts/agent-mail.md"
   ```

   Note: на WSL2 с `case=off` оба casing могут "succeed" — WSL2 сопоставляет files case-insensitive при reading. Выбирать canonical form соответствующий Windows Explorer display.

   **Никаких hardcoded lowercase paths в V8/V11/V13** — только `$WORKFLOW_ROOT`, `$WIKI_ROOT`, `$ARTICLE`.
7. **Side-effects grep** (addresses planning-audit §10 gap 3):
   - `grep -l "send --from" docs/codex-tasks/*.md` — list reports that may break
   - For each: read the "send without --project" test row. If matches "without project field" semantics, note in Discrepancy.
8. **Dashboard filtering smoke** (addresses §10 gap 4):
   - After Block A change, start dashboard (`cd dashboard && npm run dev` — via existing `start-workflow.cmd` if applicable). Manually send 2 messages from different cwds. Check dropdown content.
9. **Doc Verification** (§V1/§V2/§V3): fetch each source, record verbatim quote, ✅/❌ match with this plan.

If ANY pre-flight step fails → STOP → record in Discrepancies → wait for user decision.

---

## Whitelist

### Modify (production code)

| # | Path | What changes |
|---|------|--------------|
| W1 | `scripts/mailbox.mjs` | `handleSend` (lines 113-152): replace line 127 `const project = normalizeProject(options.project)` with auto-detect fallback. Update usage text lines 105-109. |
| W2 | `docs/codex-tasks/multi-project-support.md` | (a) add changelog block at top (after status/задача); (b) update contract line 43; (c) update V2 row line 184; (d) update Acceptance criterion if affected |

### Create (wiki, local-only)

> **Path handling note**: В whitelist ниже указаны Windows-native paths как human-reference. Codex из WSL-сессии должен использовать `$WIKI_ROOT` (substituted из Pre-flight Step 6 probe result, e.g. `/mnt/e/Project/memory claude/memory claude`). Фактические `Write`/`Edit` commands используют `$WIKI_ROOT/wiki/concepts/agent-mail.md`, не `E:/...`.

| # | Path (Windows-reference / WSL-executable) | Description |
|---|-------------------------------------------|-------------|
| W4 | `E:/Project/memory claude/memory claude/wiki/concepts/agent-mail.md` → `$WIKI_ROOT/wiki/concepts/agent-mail.md` | Operational guide for agents. Frontmatter: `title`, `type: concept`, `tags: [agent-mail, mailbox, почта, inter-agent, operational]`. Two-column Windows/WSL command tables. References `[[concepts/inter-agent-file-mailbox]]` for background. |

### Update (local-only)

| # | Path | What changes |
|---|------|--------------|
| W5 | `E:/Project/memory claude/memory claude/index.md` → `$WIKI_ROOT/index.md` | Add one line entry in `## Concepts` section: `- [[concepts/agent-mail]] — Агентская почта: operational guide с Windows/WSL командами [memory-claude]` |

### Meta-artifacts (allowed outside whitelist)

- `docs/codex-tasks/mailbox-autoproject-wiki-revision-report.md` — Codex fills
- `docs/codex-tasks/mailbox-autoproject-wiki-revision-planning-audit.md` — already written by Claude

### НЕ трогать (explicit "do not modify")

- `scripts/mailbox-lib.mjs` — logic already supports project=""; no change needed. Important: `generateMessageFile:425-427` empty-check stays.
- `scripts/mailbox-status.mjs` — SessionStart hook; not in scope.
- `dashboard/server.js`, `dashboard/src/*`, `dashboard/vite.config.js` — UI and API untouched by this handoff.
- `local-claude-codex-mailbox-workflow.md` — protocol spec не в scope этого handoff'а (auto-detect — CLI ergonomics, не protocol change).
- `wiki/concepts/inter-agent-file-mailbox.md` — existing background article остаётся authoritative. Новый `agent-mail.md` ссылается, не заменяет.
- Other `docs/codex-tasks/*.md` reports кроме `multi-project-support*` — даже если pre-flight step 7 найдёт ссылки на "send без project", флагать в Discrepancy, не трогать.

---

## Changes

### Change 1 — `scripts/mailbox.mjs` auto-detect (Block A)

**File**: `scripts/mailbox.mjs`
**Lines**: 113-152 (`handleSend` function); 102-111 (usage text).

**Current code** (line 125-128):
```js
  const from = validateSender(options.from);
  const thread = validateThread(options.thread);
  const project = normalizeProject(options.project);
  const body = await readBody(options);
```

**Target code**:
```js
  const from = validateSender(options.from);
  const thread = validateThread(options.thread);
  const explicitProject = normalizeProject(options.project);
  const project = explicitProject || path.basename(process.cwd());
  const body = await readBody(options);
```

**Import note**: `path` уже импортирован в `scripts/mailbox.mjs:2` (`import path from "node:path";`) — НЕ добавлять duplicate import. `normalizeProject` импортирован из `./mailbox-lib.mjs` (line 12). Никаких новых imports не требуется.

**Rationale**:
- Per §V1, `path.basename()` returns last portion of path string — deterministic per docs.
- Per §V2, `process.cwd()` returns absolute string path.
- Per §V3 + empirical §6: cross-platform result identical for absolute workflow paths.
- `explicitProject || fallback` pattern: explicit `--project X` wins over auto-detect.
- Empty-string fallback at filesystem root (§6 row 3) naturally cascades to existing `generateMessageFile:425-427` empty-check → no `project:` written → matches historic unscoped behavior.

**Current usage text** (lines 105-109):
```
"  node scripts/mailbox.mjs send --from <user|claude|codex> --to <claude|codex> --thread <slug> [--project <name>] (--body <text> | --file <path>) [--reply-to <id>] [--existing-thread]",
```

**Target usage text**:
```
"  node scripts/mailbox.mjs send --from <user|claude|codex> --to <claude|codex> --thread <slug> [--project <name> | auto=basename(cwd)] (--body <text> | --file <path>) [--reply-to <id>] [--existing-thread]",
```

**Rationale**: Users invoking `--help` see the auto-fallback explicitly, not silent surprise.

### Change 2 — `multi-project-support.md` contract update (Block A)

**File**: `docs/codex-tasks/multi-project-support.md`

#### 2a — Changelog block (new, insert after line 7 "Design decision" block)

```markdown
---

## Changelog

- **2026-04-17**: Default behavior changed. `send` without `--project` now auto-detects project from `path.basename(process.cwd())`. Previously created file without `project:` field (unscoped). Explicit `--project <value>` still overrides. Edge case (filesystem root) yields empty string → falls through to legacy unscoped behavior. See `docs/codex-tasks/mailbox-autoproject-wiki-revision.md` for migration rationale.

---
```

#### 2b — Line 43 contract update

**Current**: `- `project` — optional string. Если не указан, сообщение считается "unscoped" (видно во всех проектах).`

**Target**: `- `project` — optional string. Если не указан через `--project`, CLI автоматически подставляет `path.basename(process.cwd())` (auto-detect from cwd). Empty-string fallback (filesystem root edge case) сохраняет legacy unscoped behavior (no `project:` field written). Значения: свободные slug'и (`messenger`, `office`, `memory-claude`, `workflow`).`

#### 2c — Line 184 V2 row update

**Current (verbatim from file)**: `| V2 | send without --project | File created without \`project\` field |`

**Target**: `| V2 | send without --project | File created with \`project: <cwd basename>\`; empty basename (filesystem root edge case) → unscoped (no field) |`

### Change 3 — `multi-project-support-report.md` — **НЕ ТРОГАТЬ** (Audit Trail Preservation)

**Decision (post-plan-audit revision)**: report `multi-project-support-report.md:88` НЕ редактируется. Это исторический snapshot — на момент его создания поведение "send without --project → no project field" было **правдой и корректным результатом теста**. Переписывание задним числом смешивает две разные эпохи контракта и ломает audit trail.

**Где фиксируется новая реальность**:
1. В spec `multi-project-support.md` через **changelog block** (Change 2a) — documented contract change.
2. В этом handoff's report `mailbox-autoproject-wiki-revision-report.md` через Phase 1 §V1 / §V2 — live-observed migration outcome с raw stdout.
3. Явно в §1 этого отчёта (Change 3 row): "SKIPPED — audit trail preservation. Исторический результат в старом report остаётся immutable. Migration outcome captured в §V1/§V2 этого отчёта."

Это закрывает замечание Codex audit #2 ("rewriting historical report ломает audit trail").

### Change 4 — `wiki/concepts/agent-mail.md` creation (Block B)

**File (WSL-executable via Pre-flight Step 6 probe)**: `$WIKI_ROOT/wiki/concepts/agent-mail.md` (new file). Windows-reference path: `E:/Project/memory claude/memory claude/wiki/concepts/agent-mail.md`.

**Frontmatter**:
```yaml
---
title: Агентская почта (agent mail) — operational guide
type: concept
created: 2026-04-17
updated: 2026-04-17
sources: [wiki/concepts/inter-agent-file-mailbox.md]
confidence: extracted
status: active
project: memory-claude
tags: [agent-mail, mailbox, почта, inter-agent, operational, commands, claude-code, codex]
---
```

**Body structure** (minimum sections):

1. **TL;DR** — one-paragraph summary: "Operational CLI guide for inter-agent mailbox. For protocol semantics see [[concepts/inter-agent-file-mailbox]]."
2. **When to invoke** — user-trigger phrases ("проверь почту", "спроси Codex'а про X", "ответь Клоду", "архивируй это", "восстанови orphans").
3. **Environment paths** — one-time note: Windows `E:\Project\workflow`, WSL `/mnt/e/project/workflow` (or correct casing per pre-flight Step 6).
4. **Command tables (two-column Windows / WSL per command)**:

   For each of `send`, `list`, `reply`, `archive`, `recover`:

   | Scenario | Windows cmd / PowerShell | WSL bash |
   |----------|--------------------------|----------|
   | ... | `node "E:\Project\workflow\scripts\mailbox.mjs" send ...` | `node /mnt/e/project/workflow/scripts/mailbox.mjs send ...` |

   Auto-detect scenarios: if agent invokes from inside workflow repo cwd, both columns can use `node scripts/mailbox.mjs ...` relative form. Article должен also show this.

5. **What NOT to do** — brief list:
   - Mailbox не для task assignment (это `docs/codex-tasks/` handoff path)
   - Никаких decisions без user go/no-go
   - Не архивировать чужие сообщения без reply
   - Не редактировать existing messages (append-only protocol)

6. **See also** — `[[concepts/inter-agent-file-mailbox]]` (background/spec), `[[concepts/codex-dual-window-workflow]]`, `[[concepts/windows-wsl-process-launcher]]`.

**Length target**: 150-250 lines. Concise operational guide, not protocol rewrite.

### Change 5 — `wiki/index.md` entry (Block B)

**File (WSL-executable)**: `$WIKI_ROOT/index.md`. Windows-reference: `E:/Project/memory claude/memory claude/index.md`.

**Insert line** (within `## Concepts` section, alphabetically near existing `inter-agent-file-mailbox`):

```markdown
- [[concepts/agent-mail]] — Агентская почта: operational CLI guide с Windows/WSL two-column командами [memory-claude]
```

---

## Verification phases

### Phase 1 — Codex self-check (mandatory, completable offline)

Report each with command + raw stdout + exit code in report §2.x.

**Важное замечание по syntax**: команды с shell pipe (`|`) вынесены в fenced code blocks ниже таблицы — в markdown table cell `\|` это markdown escape для literal pipe, но Codex при copy-paste получает `\|` в shell где `\` escapes `|` = literal argument (не pipe redirect), команда ломается (`grep: |: No such file or directory`). Table cells содержат описание + ссылку на code block; executable команда — в code block.

| # | Test | Expected result |
|---|------|-----------------|
| V1 | From workflow-root (see code block V1 below): send + inspect frontmatter | `project: workflow` present; no other frontmatter changes |
| V2 | From dashboard/ subdir (code block V2): nested cwd send | `project: dashboard` |
| V3 | Explicit `--project` override (code block V3) | `project: messenger` (explicit wins over auto) |
| V4 | Usage text shows auto hint (code block V4) | Output contains `auto=basename(cwd)` hint |
| V5 | Spec Changelog visible (code block V5) | Changelog block visible with 2026-04-17 entry |
| V6 | Spec V2 row updated (code block V6) | Shows new wording `project: <cwd basename>` |
| V7 | **SKIPPED** (Change 3 удалён per audit trail preservation) | N/A |
| V8 | Wiki article exists (code block V8) | File exists, 100 ≤ lines ≤ 300 |
| V9 | Wiki article frontmatter valid (code block V9) | 13 frontmatter lines including `tags: [...]` |
| V10 | Wiki article command structure (code block V10) | Scenario rows ≥5, section headers ≥6 |
| V11 | Wiki index entry (code block V11) | Exactly 1 match with expected wording |
| V12 | **Backward-compat unscoped legacy** — multi-step, see code block V12 | Final step выводит JSON с `"filename": "<BASENAME>"` — legacy unscoped message listed |
| V13 | Personal-data scan per-name (code block V13) | Zero matches для каждого имени |
| V14 | Absolute path leak per-pattern (code block V14) | Все команды Zero matches (empty stdout, exit 1) |
| V15 | Dashboard still starts (code block V15) | `Server listening on 127.0.0.1:3003`; exit 124 (timeout) |
| V16 | CLI list produces table (code block V16) | Header + data rows, no error |

**Executable commands for each test** (copy-paste-safe, self-contained per test — cwd reset перед каждым root-relative command):

> **Shell state discipline**: каждый test starts с `cd "$WORKFLOW_ROOT"` потому что sequential bash commands persist cwd. V2 делает `cd dashboard` (nested scenario) — следующий test V3 должен explicitly reset cwd обратно.

```bash
# V1 — from workflow root
cd "$WORKFLOW_ROOT"
node scripts/mailbox.mjs send --from codex --to claude --thread v1-autoproject --body "V1"
# Inspect written file frontmatter via ls + head

# V2 — from nested dir (cwd changes intentionally для test scope)
cd "$WORKFLOW_ROOT/dashboard"
node ../scripts/mailbox.mjs send --from codex --to claude --thread v2-autoproject-nested --body "V2"

# V3 — explicit --project override (RESET cwd после V2 nested)
cd "$WORKFLOW_ROOT"
node scripts/mailbox.mjs send --from codex --to claude --thread v3-explicit --project messenger --body "V3"

# V4 — usage text (pipe здесь real shell pipe, НЕ markdown escape)
cd "$WORKFLOW_ROOT"
node scripts/mailbox.mjs send 2>&1 | head

# V5 — spec changelog
cd "$WORKFLOW_ROOT"
grep -A2 "Changelog" docs/codex-tasks/multi-project-support.md | head -8

# V6 — spec V2 row
cd "$WORKFLOW_ROOT"
sed -n '184p' docs/codex-tasks/multi-project-support.md

# V8 — wiki article exists (path уже absolute — cwd irrelevant)
ls "$ARTICLE"
wc -l "$ARTICLE"

# V9 — wiki article frontmatter
head -14 "$ARTICLE"

# V10 — wiki article structure
grep -c "^| Scenario " "$ARTICLE"
grep -c "^## " "$ARTICLE"

# V11 — wiki index entry
grep "agent-mail" "$WIKI_ROOT/index.md"

# V12 — backward-compat unscoped legacy (multi-step; cwd = workflow для agent-mailbox)
cd "$WORKFLOW_ROOT"
FIXTURE=$(find agent-mailbox -name "*.md" -exec grep -L "^project:" {} \; | head -1)
if [ -z "$FIXTURE" ]; then
  printf -- "---\nid: v12-fixture\nthread: v12-legacy\nfrom: user\nto: claude\nstatus: pending\ncreated: 2026-04-17T00:00:00Z\n---\nV12 backward compat fixture" > agent-mailbox/to-claude/v12-fixture.md
  FIXTURE=agent-mailbox/to-claude/v12-fixture.md
  CREATED_FIXTURE=1
fi
BASENAME=$(basename "$FIXTURE")
node scripts/mailbox.mjs list --json | grep -F "$BASENAME"
# Cleanup if fixture created:
if [ -n "$CREATED_FIXTURE" ]; then rm "$FIXTURE"; fi

# V13 — personal-data scan per-name (cwd = workflow для relative script path)
# Names extracted dynamically из .github/workflows/ci.yml PD_PATTERNS env var (single source of truth; plan НЕ hardcodes имена чтобы не триггерить сам CI PD check).
cd "$WORKFLOW_ROOT"
PD_PATTERNS=$(grep -oP '(?<=PD_PATTERNS: ).*' .github/workflows/ci.yml)
IFS='|' read -ra NAMES <<< "$PD_PATTERNS"
for n in "${NAMES[@]}"; do
  echo "=== <pd-target-${n:0:2}> ==="  # header обрезан до 2 символов чтобы не leak полное имя в report
  grep -ril "$n" scripts/mailbox.mjs docs/codex-tasks/multi-project-support*.md "$ARTICLE" "$WIKI_ROOT/index.md" || true
done

# V14 — absolute path leak per-pattern (cwd = workflow)
cd "$WORKFLOW_ROOT"
grep -n "/mnt/" scripts/mailbox.mjs
grep -n "E:\\\\" scripts/mailbox.mjs
grep -n "/home/" scripts/mailbox.mjs
grep -n "C:\\\\Users" scripts/mailbox.mjs

# V15 — dashboard starts (cwd меняется на dashboard/ явно)
cd "$WORKFLOW_ROOT/dashboard"
timeout 5 node server.js

# V16 — CLI list (RESET cwd после V15 dashboard)
cd "$WORKFLOW_ROOT"
node scripts/mailbox.mjs list | head -3
```

### Phase 2 — `[awaits user]`

- P2.1 — Live UX test: user запускает CLI из `E:\Project\messenger\` — project auto-detects as `messenger`
- P2.2 — Dashboard UI: new auto-detected `project` appears in dropdown
- P2.3 — User читает new `agent-mail.md`, command works в его WSL Codex session (one command `send` executed)

### Phase 3 — `[awaits N-day]`

- P3.1 — 7-day observation: no Codex reports of unexpected project values breaking existing workflows

---

## Acceptance criteria

- [ ] `scripts/mailbox.mjs:127` replaced with `explicitProject || path.basename(process.cwd())` pattern
- [ ] `scripts/mailbox.mjs:105-109` usage text mentions `auto=basename(cwd)`
- [ ] `multi-project-support.md` gains changelog block with 2026-04-17 entry
- [ ] `multi-project-support.md:43` contract reflects new default (auto-detect)
- [ ] `multi-project-support.md:184` V2 row updated
- [ ] `multi-project-support-report.md:88` **НЕ тронут** (audit trail preservation — contract change documented в changelog spec + live outcome в этом handoff's report)
- [ ] `wiki/concepts/agent-mail.md` created with valid frontmatter (required tags include `почта` for wiki hook matching)
- [ ] Wiki article has 5 command tables with Windows + WSL columns
- [ ] Wiki article references `[[concepts/inter-agent-file-mailbox]]` (background) without duplicating semantics
- [ ] `index.md` gains one `agent-mail` entry
- [ ] Phase 1 V1-V16 all ✅ in report
- [ ] No personal data (V13), no absolute paths leak (V14)
- [ ] Self-audit checklist all ✅

---

## Out of scope (НЕ делать)

- Dashboard UI changes (project dropdown, badge).
- SessionStart hook changes (`scripts/mailbox-status.mjs` stays standalone).
- Protocol spec update (`local-claude-codex-mailbox-workflow.md`) — auto-detect = CLI ergonomics, not protocol concern.
- Changes to `inter-agent-file-mailbox.md` (existing wiki article remains authoritative).
- Other CLI commands (`list`, `reply`, `archive`, `recover`) — auto-detect applies ONLY to `send`.
- Opt-in flag or env var alternatives (user explicitly chose Option 2).
- Automatic git commit / push.
- Retrieving prior unscoped messages and adding project field retroactively.
- Creating wrapper `mb` script для shorter invocation.
- Updating any report other than `multi-project-support-report.md` even if grep finds stale references — flag in Discrepancy only.
- **Rewriting historical reports** (including `multi-project-support-report.md:88`) — запрещено. Historical reports immutable (они — snapshot observed reality on moment). Contract changes documented via changelog в live spec + new report в new handoff. Codex audit 2026-04-17 замечание #2.

---

## Rollback

Codex выполняет rollback из своей WSL-сессии. Все пути — Linux-native, используют `$WIKI_ROOT` из Pre-flight Step 6 probe (не hardcoded Windows `E:/...`):

```bash
# Revert code changes (workflow repo — stays as WSL-mounted path)
git checkout HEAD -- scripts/mailbox.mjs docs/codex-tasks/multi-project-support.md
# multi-project-support-report.md: Change 3 SKIPPED, не трогали; если по ошибке modified — git checkout HEAD -- docs/codex-tasks/multi-project-support-report.md

# Remove wiki article (wiki/ gitignored — file не под git). $WIKI_ROOT — из Pre-flight Step 6.
# Example если probe дал casing /mnt/e/Project: WIKI_ROOT="/mnt/e/Project/memory claude/memory claude"
rm "$WIKI_ROOT/wiki/concepts/agent-mail.md"

# Revert wiki index (index.md also gitignored — edit manually)
# Remove the single added line matching /agent-mail/:
sed -i '/\[\[concepts\/agent-mail\]\]/d' "$WIKI_ROOT/index.md"
```

---

## Discrepancy-first checkpoints (STOP conditions)

1. **Pre-flight Step 3 git status** shows modified/untracked files вне baseline listing (см. Pre-flight #3) → STOP → log → ask user.
2. **Pre-flight Step 4 wc -l** shows line counts different from planning-audit §5 (321 / 590 / 248 / 150) → STOP → file may have been modified since planning.
3. **Pre-flight Step 6 WSL casing** shows neither `/mnt/e/project/workflow` nor `/mnt/e/Project/workflow` exists → STOP → ask user about actual WSL mount.
4. **Pre-flight Step 7 side-effects grep** finds reports mentioning "send without --project" semantics outside `multi-project-support*` → log all of them in Discrepancy; Codex does NOT modify them (they're outside whitelist). User decides per-file.
5. **Change 1 target line mismatch**: `scripts/mailbox.mjs:127` doesn't match "const project = normalizeProject(options.project);" literally → STOP. File may have changed. Re-read, log actual line, ask.
6. **V1-V3 auto-detect produces unexpected basename** (e.g., empty or `.`) from workflow root → STOP. Indicates process.cwd() normalized differently in execution environment.
7. **V10 count mismatch** (< 5 WSL + Windows pairs) → wiki article incomplete → return to Change 4, not report.
8. **plan-audit skill score < 7/10** at Step 10 of procedure → do NOT deliver handoff; return to Claude for revision.

---

## Self-audit checklist (Codex fills before marking done)

1. [ ] Pre-flight §0.1-§0.6 sections complete with raw command output
2. [ ] Doc Verification §V1-§V3 each has verbatim quote + URL + ✅/❌
3. [ ] Change 1 applied: diff shows only lines 125-128 + 105-109 in `scripts/mailbox.mjs`
4. [ ] Change 2a/2b/2c applied: diff shows changelog + lines 43, 184 in spec
5. [ ] Change 3 **SKIPPED** per audit trail preservation; `multi-project-support-report.md:88` **unchanged** (verify via `git diff docs/codex-tasks/multi-project-support-report.md` → empty diff for line 88)
6. [ ] Change 4 created: `agent-mail.md` with valid frontmatter, 5 command tables, `[[concepts/inter-agent-file-mailbox]]` link
7. [ ] Change 5 applied: one new line in index.md
8. [ ] V1-V16 all recorded with real stdout, not "should pass"
9. [ ] Test messages cleaned up after V1-V3 (don't leave `v1-autoproject` / `v2-autoproject-nested` / `v3-explicit` messages littering inbox)
10. [ ] Personal-data scan (V13) clean
11. [ ] Absolute-path scan (V14) clean
12. [ ] No files modified outside whitelist (double-check with `git status`)
13. [ ] No git commit / push performed
14. [ ] Discrepancies section completed (even if "none" — say "none")
15. [ ] Out-of-scope temptations noted
16. [ ] Report file location exact: `docs/codex-tasks/mailbox-autoproject-wiki-revision-report.md`

---

## Notes для Codex

1. **Planning-audit as evidence trail**: `docs/codex-tasks/mailbox-autoproject-wiki-revision-planning-audit.md` contains the full research chain. Each `[OFFICIAL]` / `[EMPIRICAL]` / `[PROJECT]` marker in this plan has a row in planning-audit §7. If any marker lacks backing → discrepancy.

2. **WSL path casing** (planning-audit §10 gap 2): verify via `ls` before using paths in wiki article. Previous sessions показывали lowercase `/mnt/e/project/workflow`, но я явно не probe'il в этой сессии.

3. **No git commands без user approval**: per `claude-plan-creation-procedure.md` anti-pattern #9, read-only git is still a tool call = action. Pre-flight Step 3 (`git status`) is authorized by this plan for baseline; any other git invocation — ask user first.

4. **WSL uv discipline** (from `workflow-instructions-codex.md:110`): not applicable here (no Python / uv ops).

5. **Report placement of live-observed results**: Change 3 удалён per audit trail preservation (замечание Codex audit #2 2026-04-17). Live-observed migration outcome для "send without --project" фиксируется ТОЛЬКО в Phase 1 §V1/§V2 этого handoff's report (`mailbox-autoproject-wiki-revision-report.md`). Старый `multi-project-support-report.md:88` остаётся untouched as historical snapshot. При необходимости добавить кросс-ссылку "superseded by handoff mailbox-autoproject-wiki-revision on 2026-04-17" — это **не edit старого файла**, а запись в Discrepancies / Notes этого отчёта.

6. **Message cleanup**: V1-V3 leave 3 test messages in `agent-mailbox/to-claude/` and `to-codex/`. Archive or delete them after verification. Mention in report §"Out-of-scope temptations".

7. **Dashboard dropdown UX concern** (planning-audit §10 gap 4): if Codex notices while testing that the dropdown becomes noisy (`dashboard`, `workflow`, etc.), flag in Discrepancies for user to decide follow-up. Don't fix in this handoff.

8. **No 4th file**: compact invocation lives in chat message, not as `<slug>-prompt.md` file (procedure anti-pattern #5). When Codex finishes, signal is the report file — not any additional artifact.

9. **Two-review-round gate**: this plan underwent my "Round 1 design" implicitly during Steps 3-9 and will undergo "Round 2 consistency" via `plan-audit` skill at Step 10. If Codex finds design-level concerns → Discrepancy → back to user.

---

## Commits strategy

- **Do not commit** anything during this handoff. Codex finishes with report + modified files on disk.
- When user reviews and says `pr` / `commit`, separate commit strategy will be defined (not in this plan).
- Suggested when user approves: **one commit** covering all 5 changes with commit message template:
  ```
  feat(mailbox): auto-detect project from cwd + agent-mail wiki guide

  - scripts/mailbox.mjs: send auto-detects project from path.basename(process.cwd())
    when --project not given (Option 2 default change per user choice)
  - docs/codex-tasks/multi-project-support.md: changelog + contract + V2 row update
  - docs/codex-tasks/multi-project-support-report.md: UNCHANGED (historical snapshot preserved; migration outcome captured в этом handoff's report)
  - wiki/concepts/agent-mail.md: new operational guide with Windows/WSL command tables
  - wiki/index.md: concept entry for agent-mail

  Docs verified via context7 for Node v24 path.basename and process.cwd.
  Backward compat: filesystem root edge case preserves unscoped behavior via
  generateMessageFile empty-check.
  ```
- Split commits **not recommended**: all 5 changes are one logical feature (default-change + docs-alignment).


## Legacy Workflow Note (2026-04-21)

This file is preserved as a historical artifact from an earlier workflow revision.

It may mention legacy patterns such as `Claude planner / Codex executor`, user relay, `compact prompt`, or older handoff shapes.

Do not use it as the live operating template. Current contract: `docs/codex-system-prompt.md`, `AGENTS.md`, `workflow-role-distribution.md`, `workflow-instructions-claude.md`, and `workflow-instructions-codex.md`.
