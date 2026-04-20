# Paperclip P4b — CodexAdapter — Planning Audit

**Plan**: `docs/codex-tasks/paperclip-p4b-codex-adapter.md`
**Report template**: `docs/codex-tasks/paperclip-p4b-codex-adapter-report.md`
**Architecture parent**: approved R4
**P2 parent (contract)**: commit `836999d`
**P3 parent (orchestrator)**: commit `e884a03`
**P4a parent (ClaudeCodeAdapter)**: commit `0c97c14`
**Planner**: Claude
**Date**: 2026-04-20
**Baseline**: HEAD=`0c97c14`
**Version**: v1

---

## §0 Meta-procedure

Canonical procedure: `E:/Project/memory claude/memory claude/docs/claude-plan-creation-procedure.md` v1 (NO-STOP DISCIPLINE).

Inputs:
- Architecture §6 P4 scope: CodexAdapter implements P2 contract against real Codex CLI.
- P2 contract + P4a pattern: `scripts/adapters/agent-adapter.mjs` (typedefs + validateAdapter) + `scripts/adapters/claude-code-adapter.mjs` (reference shape — spawn per turn + activeSpawns sweep + call log + classifyCrash taxonomy).
- P2 research doc `docs/codex-tasks/paperclip-pivot-adapter-contract-research.md` §2 R-OQ-3/4/5/6 placeholders — now resolved via live probe thread `paperclip-p4b-codex-adapter-live-probe` (2 Codex replies 2026-04-20 archived).
- P4a ClaudeCodeAdapter (commit `0c97c14`) as pattern reference. DASHBOARD_ADAPTER env gate already supports mock|claude-code; P4b extends to mock|claude-code|codex.

### P4b scope

**Deliverables**:
1. NEW `scripts/adapters/codex-adapter.mjs` — `createCodexAdapter({codexPath?, spawnPrefix?, spawnFn?, spawnTimeoutMs?, logger?, recordCallsTo?, model?, sandboxMode?, env?, sessionsRoot?})` factory returning P2-contract 8-method AgentAdapter. No `permissionMode` option (Codex uses `-s|--sandbox` + config `approvals_reviewer`); no `maxTurns` (no flag exists).
2. Modify `dashboard/server.js` — extend DASHBOARD_ADAPTER env: `mock` (default) | `claude-code` | `codex`.
3. Modify `local-claude-codex-mailbox-workflow.md` — append «CodexAdapter (paperclip pivot P4b)» section.
4. Modify `docs/codex-tasks/paperclip-pivot-adapter-contract-research.md` — append §2.1 «P4b live-probe findings (2026-04-20)» closing R-OQ-3/4/5/6.

**Invocation model** (probe-verified):
- First turn: `codex exec "<instruction>"` (positional arg). Creates session on disk under `~/.codex/sessions/YYYY/MM/DD/<id>.jsonl` (exact path structure un-verified — probe §6B hit EXIT=124 timeout before session file written).
- Subsequent turns: `codex exec resume --last "<message>"` OR `codex exec resume <session-id> "<message>"` (probe §6A help shows `resume` as exec subcommand).
- **`--json` flag exists on `exec` subcommand level** (corrected post-Codex-R1-F8 — initial probe 4 grep searched global `codex --help` which lacks exec-level flags; `codex exec --help` exposes `--json` + `-o, --output-last-message <FILE>`) → adapter uses `--json` via `useJsonOutput: true` default; parseCompletionSignal has json branch with text fallback.
- **No `--session-id UUID` flag** (probe §6A help didn't expose) — adapter learns Codex-side session id by directory-diff before/after first exec (`sessionsRoot` scanned).
- Cross-platform: Codex is WSL-only per rail #7 + wiki `workflow-hybrid-hook-automation`. Windows coordinator must route spawn via `wsl.exe -d Ubuntu -- bash -lc "…"`. Adapter accepts `spawnPrefix` option.

**Out of scope**:
- Long-lived Codex process reuse (contract-accurate one-spawn-per-turn).
- Windows-native Codex invocation — degraded per rail #7 (adapter may refuse to spawn on Windows without `spawnPrefix`, flag log warning).
- `attachExisting` functional (best-effort stub — future P5+ via sessions directory discovery).
- UI switch между mock|claude-code|codex (env-gated only, dashboard restart needed).
- Coordinator restart recovery P5+.

---

## §1 MCP + Skill selection

| Tool | Purpose | Priority |
|------|---------|----------|
| `plan-audit` skill | Step 10 mandatory | deferred |
| Codex CLI live probe (via mailbox) | R-OQ-3/4/5/6 data | completed 2026-04-20 |
| P4a `claude-code-adapter.mjs` | reference implementation pattern | reuse shape |
| `mock-adapter.mjs` | recordCallsTo pattern | reuse |
| `docs/codex-tasks/paperclip-pivot-adapter-contract-research.md` | §2 existing + add §2.1 delta | modify |

---

## §2 MCP readiness verification

| Probe | Result |
|-------|--------|
| Mailbox live probe thread `paperclip-p4b-codex-adapter-live-probe` | ✅ 2 Codex replies archived 2026-04-20; probe 6 resolved exec↔resume relationship |
| Read `scripts/adapters/claude-code-adapter.mjs` | ✅ P4a reference available (438 lines) |
| `plan-audit` skill | deferred Step 10 |

---

## §3 Files read during planning

| File | Tool | Purpose |
|------|------|---------|
| `scripts/adapters/claude-code-adapter.mjs` (first 80 lines + method mapping) | Read | reference shape for runClaude helper + activeSpawns + collision guard |
| `scripts/adapters/agent-adapter.mjs` | prior P4a read | contract locked — Codex adapter must match |
| `scripts/adapters/mock-adapter.mjs` | prior P4a read | recordCallsTo + atomic write pattern |
| `dashboard/server.js` L185-193 + L349-364 | prior P4a read | bootstrap env gate + shutdown handler (claude-code branch pattern) |
| `docs/codex-tasks/paperclip-pivot-adapter-contract-research.md` §1-§8 | prior read | §2 needs delta; §1 unchanged |
| Live probe archive `agent-mailbox/archive/paperclip-p4b-codex-adapter-live-probe/` | Read (2 letters) | R-OQ-3/4/5/6 raw outputs |

---

## §4 Official docs fetched

Primary source = **live `codex --help` + `codex exec --help`** probe outputs captured in live probe thread (archived 2026-04-20).

| Topic | Source | Result | Quote → plan ref |
|-------|--------|--------|------------------|
| Headless subcommand | `codex exec --help` (probe 6A) | ✅ | «Run Codex non-interactively. Usage: codex exec [OPTIONS] [PROMPT]» → V-C1 |
| Positional PROMPT semantics | probe 6A | ✅ | «If not provided as an argument (or if `-` is used), instructions are read from stdin. If stdin is piped and a prompt is also provided, stdin is appended as a `<stdin>` block» → V-C2 |
| Resume via exec subcommand | probe 6A / 6D | ✅ | «codex exec resume — Resume a previous session by id or pick the most recent with --last» → V-C3 |
| Config override -c flag | probe 6A / probe 1 | ✅ | «Override a configuration value that would otherwise be loaded from `~/.codex/config.toml`. Use a dotted path» → V-C4 |
| Model override -m | probe 6A | ✅ | «-m, --model <MODEL> — Model the agent should use» → V-C5 |
| Sandbox mode | probe 1 | ✅ | «-s, --sandbox <SANDBOX_MODE> — Select the sandbox policy. [possible values: read-only, workspace-write, danger-full-access]» → V-C6 |
| JSON output on exec subcommand | probe 4 grep was superficial; post-R1 Codex adversarial F8 confirmed `codex exec --help` exposes `--json` + `-o` | ✅ (corrected — V-C8 row added, plan Change 1 uses useJsonOutput default) |
| Sessions directory on disk | probe 3 + 6A directory listing | ✅ | `~/.codex/sessions/` exists, YYYY/ subdir structure observed (no per-file naming rule documented) → V-C7 |
| Windows-native Codex degraded | wiki `workflow-hybrid-hook-automation` + architecture rail #7 | ✅ | «Codex automation = Linux/WSL only» → adapter wsl-prefix pattern |

---

## §5 AST scans + commands run

| Command | Purpose | Key output |
|---------|---------|------------|
| `git rev-parse HEAD` | baseline | `0c97c14` |
| `wc -l` all adapters + server + spec + research | line counts | claude-code=438, mock=187, agent=142, server=388, spec=954, research=328 |
| Grep `createClaudeCodeAdapter` в dashboard/server.js | existing env gate | line 234-246 adapterKind switch block |

---

## §6 Empirical tests

| Test | Purpose | Verdict |
|------|---------|---------|
| Probe 2 bare `codex "prompt"` | prompt delivery path | ❌ tries TUI («stdin is not a terminal») — positional needs exec subcommand |
| Probe 2 stdin pipe `echo | codex -` | prompt via stdin | ❌ tries TUI — bare codex not headless |
| Probe 2 `codex --prompt` | flag variant | ❌ «unexpected argument '--prompt'» — no such flag |
| Probe 6B `codex exec "Remember 42..."` | full exec cycle | ⚠️ EXIT=124 timeout after 2 min (probably auth/model lag); session file NOT written before timeout — adapter needs `spawnTimeoutMs` ≥ 10 min default; honest flag ⚠️ assumption — exec WILL write session if given enough time (6A help documents it) |
| Probe 6C global `codex resume --last` | resume path | ❌ stdin-not-terminal error — confirms resume is only under exec subcommand for headless |
| Probe 6D grep `codex exec --help` for session keywords | exec resume location | ✅ `resume` subcommand inside exec confirmed |

---

## §7 Assumptions + verification status

| Claim | Evidence | Status |
|-------|----------|--------|
| `codex exec` is headless non-interactive entrypoint | probe 6A help verbatim | ✅ docs-verified |
| Initial prompt = positional arg (or stdin if `-`) | probe 6A | ✅ |
| Session resumption via `codex exec resume --last|<id>` | probe 6A + 6D | ✅ |
| `--json` flag on `exec` subcommand (F8 post-R1 correction) | probe 4 grep initially missed; Codex adversarial R1 confirmed | ✅ docs-verified |
| `~/.codex/sessions/YYYY/...` persistent | probe 3 + 6A dir listing | ✅ |
| `exec` writes session file on successful completion | probe 6A help wording «Resume a previous session by id» implies persistence | ⚠️ assumption — probe 6B timed out before write-confirmation; Phase 2 empirical test needed |
| Adapter learns session-id via sessions-dir diff before/after first exec | reasoned from probe 3 + absence of explicit --session-id flag | ⚠️ engineering choice — Phase 2 validates |
| Codex Windows-native degraded — WSL required | wiki + architecture rail #7 | ✅ docs-verified |
| SIGTERM→SIGKILL 5s escalation pattern works via `wsl.exe` wrapper | P4a reference + Node child_process semantics | ⚠️ needs testing — `wsl.exe` process tree kill may not cascade к inner `codex` process; Phase 2 empirical |
| classifyCrash retains P2 heuristic + exit 124 added (Codex timeout) | probe 6B EXIT=124 observed | ✅ |
| `-c key=value` + `-m model` + `-s sandbox` flags work per exec docs | probe 6A | ✅ |

---

## §8 plan-audit skill invocation

### Round 1 — 2026-04-20

Invocation: `Skill({plan-audit})`. Score: **8/10** 🟡 (1 critical, 2 important, 4 optional). Fixes applied inline:

- **F1 (critical) — runCodex spawnPrefix wrapping spec broken**: оригинальное wording бессмысленное; naive `spawn('wsl.exe', [...prefix.slice(1), codexPath, ...args])` даёт `wsl.exe -d Ubuntu bash -lc codex exec "hello"` где `-lc codex` исполняет только `codex` без args, а `exec "hello"` становятся positional bash args — adapter broken. **Fix applied**: runCodex переписан с explicit two-mode dispatch (Mode A direct / Mode B shell wrap с single-string command). shellEscape helper spec added.
- **F2 (important) — shell-escape для user-supplied prompt текста**: без escape prompt с `'`, `$`, backticks ломается / уязвим к injection в bash -lc. **Fix applied**: shellEscape helper описан (POSIX `'"'"'` idiom), runCodex Mode B applies escape ко всем argv tokens. V16 probe добавлен с hostile-prompt fixture.
- **F3 (important) — sessionsRoot Windows visibility**: на Windows Node `os.homedir()` → `C:\Users\<user>` — путь не существует для Codex (sessions в WSL home). detectNewSession always returns null → но path exists проверка unnecessary FS hit. **Fix applied**: server.js bootstrap на Windows передаёт `sessionsRoot: null`; detectNewSession при null skip'ает всё без FS access; adapter fallback к `--last` resume mode.
- **F4 (optional) — configOverrides TOML serialization**: plan был vague. **Fix applied**: explicit «caller responsibility, adapter passes verbatim» с пример `{model: '"o3"'}`.
- **F5 (optional) — V15 strengthen**: assert full wrap pattern (`argv[0]==='wsl.exe'` + includes `-lc` + last arg starts `codex exec `). **Fix applied**.
- **F6 (optional) — spawnTimeoutMs 10min rationale in spec**: probe 6B ref note added.
- **F7 (optional) — G4 wsl.exe signal cascade note в Notes to Codex**: Phase 2 P2.5 validates empirically; P5+ refinement candidate flagged.

V17/V18 renumbered (PD scan → V17, whitelist → V18). STOP checkpoints expanded к 13 items. Self-audit 16 items.

All 7 applied inline before re-audit.

### Round 2 — 2026-04-20

Invocation: `Skill({plan-audit})` again. Score: **9/10** 🟡 (0 critical, 1 important, 1 optional). Fixes applied inline:

- **R2-F1 (important) — V16 probe assertion logic buggy**: dollar-regex `/(^|[^'])\$HOME/` checks immediate preceding char, но `$HOME` на самом деле внутри outer `'...'` region (closes только в конце prompt). Regex доложит «unescaped» когда escape fact correct → V16 FAILS on correct shellEscape. **Fix applied**: replaced assertion logic — structurally count `'"'"'` escape sequences (hostile с 2 inner `'` → ≥2 sequences) + verify outer wrap begin + `codex exec ` prefix. Structural check, не bash-semantic.
- **R2-F2 (optional) — configOverrideFlags helper unspecified**: launch/resume argv build references `...configOverrideFlags` но derivation не показана. **Fix applied**: added explicit code snippet в §5 Change 1 defaults section.

Both applied. Re-audit next.

### Round 3 — 2026-04-20

Invocation: `Skill({plan-audit})` again. Score: **10/10** ✅ (0 critical, 0 important, 0 optional). Plan clean — proceed to Step 11 Codex adversarial delivery.

### Round 4 — 2026-04-20 (Codex adversarial)

Invocation: mailbox reply `2026-04-20T16-39-41Z-codex-001`. 2 blockers:

- **F8 (blocker)** — plan claimed Codex no JSON output path, but `codex exec --help` exposes `--json` и `-o, --output-last-message <FILE>` (also on `codex exec resume --help`). Initial probe 4 grep'd global `codex --help` that lacks these exec-level flags. **Fix applied**: V-C8 row added к §2; Change 1 defaults get `useJsonOutput: true` option; launch/resume argv включают `'--json'` conditionally; parseCompletionSignal restored `json` branch; Gap G1 marked RESOLVED в §10. Research doc §2.1 delta (Change 4) reworded «no --output-format» → corrected with `--json` exposure.
- **F9 (blocker)** — classifyCrash order inconsistent: step 1 `exitCode===0 → unknown` matches BEFORE step 5 `stdin is not a terminal → env`, so V12 fixture `{exitCode:0, stderr:'stdin is not a terminal'} → env` can never pass. **Fix applied**: reordered — stderr-anomaly checks (stdin-not-terminal, auth, env, timeout) moved перед `exitCode===0` default; 7-step order now: (1) stdin-not-terminal (2) auth (3) env (4) timeout (5) exit0 (6) exit1/2 (7) else.

Both applied inline. Round 5 — pending Codex re-review.

### Round 5 — 2026-04-20 (Codex adversarial)

Invocation: mailbox reply `2026-04-20T17-04-38Z-codex-002`. 3 stale-text contradictions after F8 json-exists fix:

- **F10 (blocker) — plan §5 Change 3 spec append stale**: text «No --output-format flag exists — parseCompletionSignal falls back to text heuristic + exit code» and «No JSON output: parseCompletionSignal uses text heuristic» contradicts V-C8 + useJsonOutput=true. **Fix applied**: Change 3 spec block rewritten — invocation example now includes `--json`, «differences vs P4a» line updated to «JSON output via `--json` (exec subcommand level, not global) — exact schema opaque; text branch fallback».
- **F11 (blocker) — planning-audit §2/§4/§9 stale**: L37 (§2.1 findings «No --output-format flag»), L97 (§4 table negative finding), L133 (§7 table claim «No JSON/stream flag»), L194 (§9 delta «No JSON output — text heuristic only») — contradict §10 Gap G1 RESOLVED. **Fix applied**: все 4 locations rewritten к corrected wording «--json on exec subcommand, docs-verified post-R1 Codex F8».
- **F12 (medium) — report §9 stale «No --output-format fabrication»**: output-format part no longer true. **Fix applied**: split к «No --max-turns / --session-id UUID fabrication (confirmed absent)» + «--json used via useJsonOutput=true (NOT absent)».

All 3 applied. Round 6 — pending Codex re-review.

### Round 6 — 2026-04-20 (Codex adversarial)

Invocation: mailbox reply `2026-04-20T17-09-41Z-codex-003`. Response: **«Новых замечаний у меня больше нет. … Мой текущий вердикт: plan execution-ready.»**

Adversarial loop closed — R1+R2+R3 self-audit (plan-audit skill) + R4+R5+R6 Codex adversarial. Total 9 findings (F1-F12 numbered — gaps in numbering reflect R2 optionals merged) applied inline across rounds.

**Final score**: 10/10 execution-ready. All G1 resolved, G2-G8 honest open gaps documented.

---

## §9 Delta from P4a

- P4a delivered: ClaudeCodeAdapter с JSON output + --session-id UUID + per-turn spawn + activeSpawns sweep + DASHBOARD_ADAPTER env gate (mock|claude-code).
- P4b adds:
  - NEW `scripts/adapters/codex-adapter.mjs` — same P2 contract shape, but:
    - Codex CLI positional PROMPT, not `-p` flag.
    - `exec` subcommand wrapping all calls (not bare `codex`).
    - Resume via `exec resume --last|<id>` (different subcommand path, not `-r`).
    - JSON output via `codex exec --json` flag (F8 post-R1 correction) — parseCompletionSignal primary path parses JSON; text heuristic retained as fallback.
    - No pre-assigned session-id — learn via sessions directory diff.
    - WSL-only (Windows coordinator wraps through `wsl.exe -d Ubuntu -- bash -lc`).
  - Extend `dashboard/server.js` env gate: `codex` value.
  - Extend spec with «CodexAdapter (paperclip pivot P4b)» section.
  - Update research doc §2.1 закрывая R-OQ-3/4/5/6.
- NO changes:
  - agent-adapter.mjs (contract locked P2)
  - mock-adapter.mjs (CI default)
  - claude-code-adapter.mjs (P4a stable)
  - orchestrator.mjs / supervisor.mjs
- Scope: **1 new + 3 M (server.js + spec + research) + 3 handoff artefacts**.

---

## §10 Known gaps (honest flags)

### Gap G1 — Deterministic output parsing RESOLVED (post-Codex-R1 adversarial F8)

Initial probe 4 grep'd global `codex --help` and found no output-format flags — reported as negative. Codex adversarial R1 corrected: `codex exec --help` exposes `--json` flag and `-o, --output-last-message <FILE>`. Adapter теперь uses `--json` by default (`useJsonOutput: true` option) и parseCompletionSignal has a `json` branch. Text fallback retained for unusual cases.

**Residual minor gap**: exact schema of `codex --json` output не документировано inline; heuristic accepts «any valid JSON with content = completed», Phase 2 empirical may refine к structural markers. Not blocking.

### Gap G2 — Session-id learning via directory diff (race condition potential)

Adapter discovers Codex-side session-id by listing `~/.codex/sessions/` before launch, then diffing after exec completes. Risk: if user has parallel Codex processes, another session may appear in the window, and adapter picks wrong one. Mitigation: P3 orchestrator processes tasks serially; only one Codex invocation at a time per adapter instance. Honest G2 flag — multi-task parallelism is P5+ anyway.

### Gap G3 — exec→session write empirically unvalidated

Probe 6B timed out (EXIT=124) before session file was written. Docs (probe 6A) imply exec writes session, but actual directory listing `---POST-EXEC-SESSIONS---` showed same 2026/ timestamps. Adapter assumes exec-on-success writes a file; Phase 2 validates. If false, adapter forced into «replay full context each turn» mode (heavier, но workable).

### Gap G4 — Process-tree kill through `wsl.exe` wrapper

SIGTERM/SIGKILL on `wsl.exe` Windows process may not cascade к inner `codex` process running inside WSL. Node `child.kill()` sends signal к `wsl.exe`, not к the WSL-spawned child. Gap: P4b activeSpawns sweep may leave codex zombies on Windows coordinator. Mitigation: on Windows, adapter uses `child_process.spawn('wsl.exe', [...])` with `windowsHide: true` — when wsl.exe itself is killed, WSL's internal process tree teardown handles orphan children (per wiki `windows-wsl-process-launcher`). But this is platform-dependent; Phase 2 validates.

### Gap G5 — No `--max-turns` on Codex side

Codex `exec` has no turn cap flag (probe 4 grep and probe 6A help no such). Adapter cannot enforce per-invocation turn safety; only `spawnTimeoutMs` wall-clock. Trade-off: if Codex model loops internally, only timeout kills it. Phase 2 validates typical turn duration.

### Gap G6 — attachExisting stub

Same as P4a — attachExisting returns `{attached: false}` in P4b. Codex sessions ARE на disk (unlike Claude's opaque dir), so future P5+ could implement real discovery. Out of scope.

### Gap G7 — Session timestamp format inside filename

`~/.codex/sessions/2026/.../` structure observed but per-file naming rule undocumented. Adapter treats path as opaque identifier — doesn't parse internally.

---

## §11 Signature

Planner: Claude
Date: 2026-04-20
Procedure: `claude-plan-creation-procedure.md` v1
Baseline: HEAD=`0c97c14`
Input: architecture §6 P4 + P2 contract + P4a reference + 2-letter live probe thread
Status: **skeleton+draft (Step 2-9 in progress)** → Step 10 plan-audit loop next.
