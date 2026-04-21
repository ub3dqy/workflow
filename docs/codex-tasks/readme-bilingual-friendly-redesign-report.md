# README Bilingual + Friendly Redesign — Execution Report

**Handoff plan**: `docs/codex-tasks/readme-bilingual-friendly-redesign.md`
**Planning-audit**: `docs/codex-tasks/readme-bilingual-friendly-redesign-planning-audit.md`
**Executor**: Codex
**Date completed**: `2026-04-17`

> **Anti-fabrication**: raw stdout verbatim. Sanitize hostname if uname leaks.

---

## §0 Pre-flight

### §0.1 Environment
```text
Linux <hostname-redacted> 6.6.87.2-microsoft-standard-WSL2 #1 SMP PREEMPT_DYNAMIC Thu Jun  5 18:30:46 UTC 2025 x86_64 x86_64 x86_64 GNU/Linux
v24.14.1
/mnt/e/Project/workflow
```

### §0.2 HEAD
```text
e6afbe8 docs: add README + engines field + track launchers + .codex gitignore
```
Planning snapshot `e6afbe8`. Drift: `none`.

### §0.3 Working tree
```text
 M scripts/mailbox.mjs
?? docs/assets/
?? docs/codex-tasks/readme-bilingual-friendly-redesign-planning-audit.md
?? docs/codex-tasks/readme-bilingual-friendly-redesign-report.md
?? docs/codex-tasks/readme-bilingual-friendly-redesign.md
```

### §0.4 README baseline
`test -f README.md && wc -l README.md`:
```text
113 README.md
```

### §0.5 Screenshots exist
```text
-rwxrwxrwx 1 <user-redacted> <group-redacted> 267877 Apr 17 15:58 docs/assets/dashboard-full.png
-rwxrwxrwx 1 <user-redacted> <group-redacted> 154389 Apr 17 15:58 docs/assets/dashboard-overview.png
```

### §0.6 WORKFLOW_ROOT
```text
CLAUDE.md
README.md
agent-mailbox

---
CLAUDE.md
README.md
agent-mailbox
```
Selected: `/mnt/e/Project/workflow`

---

## §V Doc Verification

### §V1 — GFM image syntax
Source: `context7 /websites/github_github_gfm → https://github.github.com/gfm/index`
Quote:
```text
Syntax for images is like the syntax for links, with one difference. Instead of link text, we have an image description. The rules for this are the same as for link text, except that (a) an image description starts with `![` rather than `[`, and (b) an image description may contain links. An image description has inline elements as its contents. When an image is rendered to HTML, this is standardly used as the image’s `alt` attribute.

When an image is rendered to HTML, its `alt` attribute is typically populated with the plain string content of the image description, not the formatted version or any included links.
```
Matches? `✅`

### §V2 — Mermaid in README
Source: `GitHub standard since 2022, not re-fetched`
Status: `honest flag preserved per plan; not freshly fetched`

---

## §1 Changes applied

### Change 1 — README.md rewritten
Diff:
```diff
diff --git a/README.md b/README.md
index 1b62728..298dacd 100644
--- a/README.md
+++ b/README.md
@@ -1,23 +1,47 @@
-# Workflow
+# Workflow — dual-agent development workflow
 
-Documentation and tooling for dual-agent workflow: **Claude** (planner) + **Codex** (executor). Mailbox protocol for async inter-agent communication + local read-only dashboard for visualization.
+[English](./README.md) | [Русский](./README.ru.md)
 
-[![CI](https://github.com/ub3dqy/workflow/actions/workflows/ci.yml/badge.svg)](https://github.com/ub3dqy/workflow/actions/workflows/ci.yml)
+[![CI](https://github.com/ub3dqy/workflow/actions/workflows/ci.yml/badge.svg)](https://github.com/ub3dqy/workflow/actions/workflows/ci.yml) [![Node](https://img.shields.io/badge/node-%3E%3D20.19-brightgreen)](./dashboard/package.json)
 
-## What this is
+> Two AI agents, one repo. **Claude** plans, **Codex** executes, **you** decide. This repo gives them a shared mailbox, a dashboard to see what's happening, and a rule book that keeps them honest.
 
-- **`scripts/mailbox.mjs`** — CLI для sending/listing/replying/archiving messages between Claude и Codex via markdown files в `agent-mailbox/`.
-- **`dashboard/`** — local read-only web UI (Express + Vite + React) для browsing mailbox, ports `127.0.0.1:3003` (API) + `127.0.0.1:9119` (Vite).
-- **`docs/codex-tasks/`** — formal handoff plans от Claude к Codex (plan + report + planning-audit triplets).
-- **`agent-mailbox/`** — gitignored async dialogue directory (`to-claude/`, `to-codex/`, `archive/`).
+---
 
-## Requirements
+## 📬 What is this?
 
-- **Node.js 20.19+** recommended (ESM module loading works out of the box; `engines` field в `dashboard/package.json` warns on older). Node 18.x technically works (prior empirical testing на Node 18.19.1) but будет показывать install-time warnings — upgrade recommended.
-- **Windows or WSL2 Linux** (launchers Windows-specific, но CLI + dashboard cross-platform).
-- **Git** (for tracked workflow).
+A practical workflow для coordinating **two AI coding assistants** (Claude Code + OpenAI Codex CLI) через shared filesystem mailbox. Instead of copy-pasting context between terminals, agents write markdown messages to each other. You stay в the loop через a local dashboard showing pending threads.
 
-## Setup
+**In short**:
+- Claude writes plans (`docs/codex-tasks/<slug>.md`)
+- Codex reads plan → executes → fills report
+- You review diff → commit → push
+- Along the way, mailbox captures any back-and-forth (questions, clarifications) without cluttering git history
+
+## 🎯 Why use it?
+
+- **Less copy-paste tax** — agents communicate async через files, not через your clipboard
+- **Clear handoffs** — every non-trivial task has a plan + planning-audit + execution report (three-file pattern)
+- **You're always the gate** — agents never commit, push, or make scope decisions solo
+- **Reproducible** — markdown on disk beats ephemeral chat; any agent joining session reads recent mailbox
+
+## 🖼️ Dashboard preview
+
+![Mailbox dashboard overview](./docs/assets/dashboard-overview.png)
+
+*Local read-only dashboard showing pending messages grouped by recipient, with project filter, language toggle (RU/EN), and light/dark themes.*
+
+---
+
+## ⚡ Quick start
+
+### Requirements
+
+- **Node.js 20.19+** (tested on 20.19, 22.x, 24.x; 18.x technically works but shows install warnings)
+- **Windows** or **WSL2 Linux** (launchers Windows-only, CLI/dashboard cross-platform)
+- **Git**
+
+### Setup
 
 ```bash
 git clone https://github.com/ub3dqy/workflow.git
@@ -25,89 +49,109 @@ cd workflow/dashboard
 npm install
 ```
 
-## Usage
-
-### Start dashboard (browse mailbox UI)
+### Launch dashboard
 
 **Any platform**:
 ```bash
 cd dashboard
 npm run dev
-# Dashboard: http://127.0.0.1:9119
+# UI:  http://127.0.0.1:9119
 # API: http://127.0.0.1:3003
 ```
 
 **Windows one-click** (optional):
 ```
-start-workflow.cmd
+start-workflow.cmd        # starts dashboard, smart npm install caching
+stop-workflow.cmd         # releases ports
+start-workflow-hidden.vbs # hides console window (shortcut-friendly)
 ```
-Smart npm install caching: skips install когда `package-lock.json` matches last snapshot.
 
-**Stop dashboard**:
-```
-stop-workflow.cmd
-```
-Uses `npx kill-port` to release ports 3003 + 9119.
-
-**Hidden console** (optional — для shortcut / tray launch):
-```
-start-workflow-hidden.vbs
-```
-Runs `start-workflow.cmd` без visible terminal window.
-
-### Send message via CLI
+### Send a message (CLI)
 
 ```bash
 # From workflow repo root:
-node scripts/mailbox.mjs send --from codex --to claude --thread my-thread --body "message text"
-
-# Auto-detects project from cwd basename. Explicit override:
-node scripts/mailbox.mjs send --from claude --to codex --thread task --project messenger --body "..."
-
-# List Claude's inbox:
-node scripts/mailbox.mjs list --bucket to-claude
-
-# Reply to inbox message:
-node scripts/mailbox.mjs reply --to to-codex/<filename>.md --body "reply text"
-
-# Archive message with resolution:
+node scripts/mailbox.mjs send \
+  --from claude --to codex \
+  --thread my-question \
+  --body "Нужен clarifying detail по pre-flight step 3"
+
+# Auto-detects project from cwd basename; --project overrides
+node scripts/mailbox.mjs list --bucket to-codex
+node scripts/mailbox.mjs reply --to to-codex/<filename>.md --body "response"
 node scripts/mailbox.mjs archive --path to-claude/<filename>.md --resolution answered
 ```
 
-See also: project conventions in [`CLAUDE.md`](./CLAUDE.md) and mailbox protocol spec in [`local-claude-codex-mailbox-workflow.md`](./local-claude-codex-mailbox-workflow.md).
+See [`local-claude-codex-mailbox-workflow.md`](./local-claude-codex-mailbox-workflow.md) для full protocol.
+
+---
+
+## 🏗️ Architecture
+
+```mermaid
+flowchart LR
+    U[👤 User]
+    C[🤖 Claude<br/>planner]
+    X[🤖 Codex<br/>executor]
+    M[(📬 Mailbox<br/>agent-mailbox/)]
+    D[📋 Handoff<br/>docs/codex-tasks/]
+    W[🖥️ Dashboard<br/>127.0.0.1:9119]
+
+    U -->|scope + commit| C
+    U -->|scope + commit| X
+    C -->|3-file handoff| D
+    D --> X
+    C <-->|async Q&A| M
+    X <-->|async Q&A| M
+    M --> W
+    W -.->|read-only view| U
+```
+
+**Roles** (non-negotiable):
 
-## Architecture
+| Who | Does | Doesn't |
+|-----|------|---------|
+| **Claude** | Plans, reviews, writes docs | Runs production code, commits |
+| **Codex** | Executes per plan, fills report | Changes scope, commits/pushes |
+| **User** | Approves scope, commits, pushes | Writes code (agents do that) |
 
-Dual-agent workflow:
-- **Claude** = planner. Writes handoff plans в `docs/codex-tasks/<slug>{,-planning-audit,-report}.md`. Никогда не executes production code.
-- **Codex** = executor. Reads plan + planning-audit → runs pre-flight → applies changes → fills report. Никогда не changes whitelist / scope.
-- **User** = decision gate. Approves scope, commits, pushes.
+**Two communication channels coexist**:
 
-Coms:
-- **Formal handoff** = git-tracked `docs/codex-tasks/` (plan + planning-audit + report, three-file pattern).
-- **Informal async** = `agent-mailbox/` (gitignored, scratchpad).
+| Channel | Location | Purpose | Git-tracked? |
+|---------|----------|---------|--------------|
+| **Formal handoff** | `docs/codex-tasks/` | Contracts: plan + planning-audit + report | Yes (immutable history) |
+| **Informal mailbox** | `agent-mailbox/` | Async Q&A, clarifications, status updates | No (scratchpad) |
 
 Detailed rules:
 - [`CLAUDE.md`](./CLAUDE.md) — project conventions
- [`workflow-instructions-claude.md`](./workflow-instructions-claude.md) — planner role
- [`workflow-instructions-codex.md`](./workflow-instructions-codex.md) — executor role
- [`workflow-role-distribution.md`](./workflow-role-distribution.md) — role separation
+- [`workflow-instructions-claude.md`](./workflow-instructions-claude.md) — planner role guide
+- [`workflow-instructions-codex.md`](./workflow-instructions-codex.md) — executor role guide
+- [`workflow-role-distribution.md`](./workflow-role-distribution.md) — role separation rules
 - [`local-claude-codex-mailbox-workflow.md`](./local-claude-codex-mailbox-workflow.md) — mailbox protocol spec
 
-## CI
+---
+
+## 🔒 CI & safety
+
+GitHub Actions (`.github/workflows/ci.yml`) runs on every push/PR:
+
+- **`build`** — `npm ci && npx vite build` (Node 24)
+- **`personal-data-check`** — regex scan for accidental PII/hostname leaks
 
-GitHub Actions (`.github/workflows/ci.yml`) runs на every push/PR to master:
-- **`build`** — `npm ci && npx vite build` на Node 24
-- **`personal-data-check`** — regex scan для accidental PII/hostname leaks
+Agents run a matching scan locally before `git push` — catches issues before they hit the public repo.
 
-## License
+## 📄 License
 
-No explicit license file in repository; all rights reserved by default. Contact maintainer for licensing questions.
+No explicit license file; all rights reserved by default. Contact maintainer для licensing questions.
 
-## Contributing
+## 🤝 Contributing
 
 Issues и PRs welcome. Workflow expects:
-1. Propose scope to maintainer (open issue).
-2. Follow handoff pattern if change is non-trivial (see `docs/codex-tasks/` examples).
-3. Personal data scan clean before push (CI enforces).
-4. One commit per logical change.
+
+1. Propose scope to maintainer (open an issue first)
+2. Follow three-file handoff pattern для non-trivial changes (see `docs/codex-tasks/` examples)
+3. Personal data scan clean before push (CI enforces)
+4. One logical change per commit
+
+---
+
+*Screenshot captured 2026-04-17; UI may evolve.*
```
Line count: `157`
Section count (`grep -c "^## " README.md`): `8`
Image reference: `![Mailbox dashboard overview](./docs/assets/dashboard-overview.png)`
Mermaid block: `1`
Acceptance: `⚠️ content copied verbatim from plan target block, but line-count expectation 180-250 not met`

### Change 2 — README.ru.md created
Line count: `157`
Cross-link в header (`grep "README.md" README.ru.md | head -1`): `[English](./README.md) | [Русский](./README.ru.md)`
Section count: `8`
Acceptance: `⚠️ content copied verbatim from plan target block, but line-count expectation 180-250 not met`

### Change 3 — Screenshots staged
`git status --short docs/assets/`:
```text
A  docs/assets/dashboard-full.png
A  docs/assets/dashboard-overview.png
```
Acceptance: `✅`

---

## §2 Phase 1 V1-V10

| # | Raw output | Pass/Fail |
|---|-----------|-----------|
| V1 | `157 README.md` | `❌` |
| V2 | `1` | `✅` |
| V3 | `1` | `✅` |
| V4 | `1` | `✅` |
| V5 | `157 README.ru.md` | `❌` |
| V6 | `1` | `✅` |
| V7 | `EN: 9 / RU: 9` | `✅` |
| V8 | `A  docs/assets/dashboard-full.png` / `A  docs/assets/dashboard-overview.png` | `✅` |
| V9 | `(empty stdout)` | `✅` |
| V10 | `(empty stdout)` | `✅` |

Total: `8 ✅ / 2 ❌`

---

## §3 Phase 2

- P2.1 GitHub page render: `awaiting`
- P2.2 Russian link navigation: `awaiting`

## §4 Phase 3 `[awaits 7-day]`

---

## §5 Discrepancies

| # | Issue | Expected | Observed | Resolution |
|---|-------|----------|----------|-----------|
| D1 | Target blocks shorter than acceptance range | `README.md` and `README.ru.md` each 180-250 lines | Both target blocks from plan are 157 lines when copied verbatim | Preserved verbatim target content per user instruction and plan Notes; did not pad files beyond target block |

Status: `1`

---

## §6 Tools used

| Tool | Purpose | Times |
|------|---------|-------|
| `context7` | §V1 GFM verification | `2` |
| `bash` | Pre-flight + V1-V10 + diff/status checks | `12` |
| `apply_patch` | Rewrite README.md, create README.ru.md, fill report | `2` |
| `git add` | Stage README.ru.md + screenshots | `1` |

---

## §7 Out-of-scope temptations

`none`

---

## §8 Self-audit

- [x] 1. Pre-flight complete
- [x] 2. §V1-§V2 verified
- [x] 3-5. Changes 1-3 applied
- [x] 6. V1-V10 recorded
- [x] 7. V9 PD clean
- [x] 8. V10 path leak clean
- [x] 9. No production code modified
- [x] 10. No git commit/push
- [x] 11. Discrepancies completed
- [x] 12. Out-of-scope noted
- [x] 13. Report path correct

Completeness: `13 / 13`

---

## §9 Final git status
```text
 M README.md
A  README.ru.md
A  docs/assets/dashboard-full.png
A  docs/assets/dashboard-overview.png
 M scripts/mailbox.mjs
?? docs/codex-tasks/readme-bilingual-friendly-redesign-planning-audit.md
?? docs/codex-tasks/readme-bilingual-friendly-redesign-report.md
?? docs/codex-tasks/readme-bilingual-friendly-redesign.md
```

Expected:
- `M README.md` (Change 1)
- `A README.ru.md` (Change 2)
- `A docs/assets/dashboard-overview.png`
- `A docs/assets/dashboard-full.png`
- `?? docs/codex-tasks/readme-bilingual-friendly-redesign{,-planning-audit,-report}.md`
- Pre-existing `M scripts/mailbox.mjs` preserved (out-of-scope, untouched)
- `.codex` NOT listed — already gitignored via prior handoff `e6afbe8`

---

## §10 Delivery signal

- [x] All sections filled
- [x] Self-audit ≥11/13

Signature: `Codex — 2026-04-17`

---

## §11 Notes back

`Plan has an internal mismatch: both verbatim target blocks are 157 lines, while V1/V5 and acceptance require 180-250.`


## Legacy Workflow Note (2026-04-21)

This file is preserved as a historical artifact from an earlier workflow revision.

It may mention legacy patterns such as `Claude planner / Codex executor`, user relay, `compact prompt`, or older handoff shapes.

Do not use it as the live operating template. Current contract: `docs/codex-system-prompt.md`, `AGENTS.md`, `workflow-role-distribution.md`, `workflow-instructions-claude.md`, and `workflow-instructions-codex.md`.
