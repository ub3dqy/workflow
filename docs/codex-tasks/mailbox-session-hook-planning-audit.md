# Mailbox SessionStart Hook — Planning Audit

> **План**: `docs/codex-tasks/mailbox-session-hook.md`

---

## 1. Files read

| # | File | Lines | What extracted |
|---|------|-------|----------------|
| F1 | `local-claude-codex-mailbox-workflow.md` | 656-669 | Phase 2 spec: SessionStart only, count + preview, no UserPromptSubmit |
| F2 | `~/.claude/settings.json` | 1-80 | Existing global hooks: SessionStart for memory-claude, UserPromptSubmit for wiki. Must NOT modify. |
| F3 | `E:/Project/memory claude/memory claude/hooks/session-start.py` | 1-8 | Reference: delegates to shared_context.py, simple entry point |
| F4 | `E:/Project/memory claude/memory claude/hooks/shared_context.py` | 1-50 | Reference: reads stdin JSON for cwd, builds context sections with budgets |
| F5 | `dashboard/server.js` | 81-108 | readMessage() pattern: frontmatter parsing, Date handling — NOT reused in hook (no deps) |

---

## 2. Commands run

| # | Command | Key output | What it proved |
|---|---------|------------|----------------|
| C1 | `ls E:/Project/workflow/hooks 2>/dev/null` | `no hooks dir` | Directory doesn't exist yet |
| C2 | `ls E:/Project/workflow/scripts 2>/dev/null` | `no scripts dir` | Directory doesn't exist yet |
| C3 | `cat ~/.claude/settings.json \| head -80` | Existing hooks for memory-claude | Global settings has SessionStart, UserPromptSubmit, SessionEnd, PreCompact, PostToolUse, Stop hooks |
| C4 | `git log --oneline -5` | HEAD at 8800e20 | Clean state after Phase 2 commit |

---

## 3. URLs fetched

| # | URL | Key finding | Used in plan |
|---|-----|-------------|-------------|
| — | Not fetched during planning | Deferred to Codex doc verification (D1-D2) | — |

---

## 4. Wiki articles

| # | Article | What used |
|---|---------|-----------|
| W1 | `[[concepts/wiki-hook-injection-tuning]]` | Confirmed: UserPromptSubmit injection is noise amplifier, SessionStart is safe |
| W2 | `[[concepts/inter-agent-file-mailbox]]` | Confirmed: Phase 2 = SessionStart summary only |

---

## 5. Assumptions + verification

| # | Утверждение | Source | Status | Evidence |
|---|-------------|--------|--------|----------|
| A1 | `.claude/settings.local.json` мержится с глобальным | `[OFFICIAL]` | ⚠️ assumed | Codex верифицирует D2 |
| A2 | SessionStart hook получает JSON с `cwd` на stdin | `[OFFICIAL]` | ⚠️ assumed | memory-claude hooks читают stdin, Codex верифицирует D1 |
| A3 | Hook stdout инжектится в контекст сессии | `[OFFICIAL]` | ⚠️ assumed | memory-claude hooks выводят в stdout, Codex верифицирует D1 |
| A4 | Node.js уже доступен (не нужен npm install) | `[EMPIRICAL]` | ✅ verified | C4: dashboard работает на Node |
| A5 | `scripts/` не существует | `[EMPIRICAL]` | ✅ verified | C2 |
| A6 | `.claude/` не существует в проекте | `[EMPIRICAL]` | ✅ verified | C2 |
| A7 | Глобальный settings.json содержит hooks для memory-claude | `[EMPIRICAL]` | ✅ verified | C3 |
| A8 | Spec запрещает UserPromptSubmit для mailbox | `[PROJECT]` | ✅ verified | F1: spec line 667-668 |

---

## 6. Baselines captured

| # | Measurement | Command | Value |
|---|------------|---------|-------|
| B1 | HEAD commit | `git rev-parse --short HEAD` | 8800e20 |
| B2 | scripts/ exists | `ls scripts/` | not found |
| B3 | .claude/ exists | `ls .claude/` | not found |


## Legacy Workflow Note (2026-04-21)

This file is preserved as a historical artifact from an earlier workflow revision.

It may mention legacy patterns such as `Claude planner / Codex executor`, user relay, `compact prompt`, or older handoff shapes.

Do not use it as the live operating template. Current contract: `docs/codex-system-prompt.md`, `AGENTS.md`, `workflow-role-distribution.md`, `workflow-instructions-claude.md`, and `workflow-instructions-codex.md`.
