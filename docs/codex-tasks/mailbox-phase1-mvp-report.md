# Mailbox Phase 1 MVP — Execution Report

> **План**: `docs/codex-tasks/mailbox-phase1-mvp.md`
>
> **Статус**: `[ ] not started` / `[ ] in progress` / `[x] done`

---

## 0. Pre-flight

### 0.1 Environment snapshot

| Item | Value |
|------|-------|
| OS | `Linux 6.6.87.2-microsoft-standard-WSL2 x86_64 GNU/Linux` |
| Node | `v24.14.1` |
| npm | `11.11.0` |
| git | `2.43.0` |
| Python | `Python 3.12.3` via `python3`; `python` command missing in PATH |
| Working dir | `/mnt/e/project/workflow` |
| git status before init | `fatal: not a git repository (or any parent up to mount point /mnt)` |
| HEAD before init | `fatal: not a git repository (or any parent up to mount point /mnt)` |

### 0.2 Baseline snapshots

| Item | Command | Value |
|------|---------|-------|
| Existing files count | `ls -1 /mnt/e/project/workflow \| wc -l` | `6` |
| Git repo exists | `git rev-parse --is-inside-work-tree 2>&1` | `fatal: not a git repository (or any parent up to mount point /mnt)` |
| .gitignore exists | `cat .gitignore 2>&1` | `cat: /mnt/e/project/workflow/.gitignore: No such file or directory` |
| package.json exists | `cat package.json 2>&1` | `cat: /mnt/e/project/workflow/package.json: No such file or directory` |
| agent-mailbox exists | `ls agent-mailbox/ 2>&1` | `ls: cannot access '/mnt/e/project/workflow/agent-mailbox': No such file or directory` |

### 0.3 Execution note

Doc verification completed before code. D3 was a real discrepancy and was recorded. Execution continued only after explicit user instruction to proceed, while keeping official docs and actual code as the higher source of truth.

---

## 0.6 Doc verification

| # | URL | Key quote | Matches plan? |
|---|-----|-----------|---------------|
| D1 | https://docs.npmjs.com/cli/v11/commands/npm-init | "`npm init <initializer>` can be used to set up a new or existing npm package." | ✅ |
| D2 | https://vite.dev/guide/ | "`$ npm create vite@latest`" and "You can use `.` for the project name to scaffold in the current directory." | ✅ |
| D3 | https://react.dev/learn/start-a-new-project | Requested URL returned `404`. Current official React guidance says: "We recommend creating new React apps with a framework" and, when not using a framework, "roll your own custom setup with React using Vite..." | ❌ |
| D4 | https://www.npmjs.com/package/gray-matter | Direct fetch was blocked by npm robots. Fallback verification from npm registry readme: "`data`: the parsed YAML front matter" and "`content`: the contents as a string" | ✅ |
| D5 | https://marked.js.org/ | `const html = marked.parse('# Marked in Node.js...');` | ✅ |
| D6 | https://git-scm.com/docs/gitignore | "A `.gitignore` file specifies intentionally untracked files that Git should ignore." | ✅ |

---

## 1. Changes

### 1.1 git init (Change 1)

- Command: `git init`
- Output: `Initialized empty Git repository in /mnt/e/project/workflow/.git/`
- ✅/❌: ✅

### 1.2 .gitignore (Change 2)

- Created: ✅
- Contents verified: ✅
- Key entries:
  - `agent-mailbox/`
  - `node_modules/`
  - `dashboard/node_modules/`
  - `dashboard/dist/`

### 1.3 agent-mailbox dirs (Change 3)

- `to-claude/` created: ✅
- `to-codex/` created: ✅
- `archive/` created: ✅
- `.gitkeep` placeholders created locally: ✅

### 1.4 CLAUDE.md (Change 4)

- Created: ✅
- Contents match project conventions: ✅
- Includes mailbox boundary, dashboard ports, and local-only scope: ✅

### 1.5 dashboard/package.json (Change 5)

- Created: ✅
- Dependency versions verified against npm and updated to latest stable before install: ✅

| Package | Plan version | npm latest at execution | Used |
|---------|--------------|-------------------------|------|
| vite | `^8.0.8` | `8.0.8` | `^8.0.8` |
| react | `^19.2.5` | `19.2.5` | `^19.2.5` |
| react-dom | `^19.2.5` | `19.2.5` | `^19.2.5` |
| @vitejs/plugin-react | `^4.5.3` | `6.0.1` | `^6.0.1` |
| express | `^5.2.1` | `5.2.1` | `^5.2.1` |
| gray-matter | `^4.0.3` | `4.0.3` | `^4.0.3` |
| marked | `^18.0.0` | `18.0.0` | `^18.0.0` |
| concurrently | `^9.1.2` | `9.2.1` | `^9.2.1` |

- Runtime package placement adjusted:
  - `react`, `react-dom`, `express`, `gray-matter`, `marked` -> `dependencies`
  - `vite`, `@vitejs/plugin-react`, `concurrently` -> `devDependencies`

### 1.6 dashboard/server.js (Change 6)

- Created: ✅
- Listens on `127.0.0.1:3001`: ✅
- Reads mailbox via relative path `../agent-mailbox`: ✅
- Parses frontmatter with `gray-matter` on the server: ✅
- Returns grouped JSON from `/api/messages`: ✅
- Supports `/api/messages/:dir`: ✅

### 1.7 dashboard/src/App.jsx (Change 7)

- Created: ✅
- Three columns render: ✅
- Empty state shows when mailbox is empty: ✅
- Polling interval set to 3 seconds: ✅
- Manual refresh button present: ✅
- UI remains read-only: ✅

### 1.8 dashboard/vite.config.js (Change 8)

- Created: ✅
- Host `127.0.0.1`: ✅
- Port `9119`: ✅
- `strictPort: true`: ✅
- Proxy `/api` -> `http://127.0.0.1:3001`: ✅

### 1.9 npm install

- Command: `npm install` in `dashboard/`
- Output summary:
  - `added 121 packages`
  - `audited 122 packages`
  - `found 0 vulnerabilities`
- `package-lock.json` created: ✅
- `dashboard/node_modules/.package-lock.json` exists: ✅

---

## 2. Phase 1 smokes

| # | Test | Command | Output | Exit code | ✅/❌ |
|---|------|---------|--------|-----------|-------|
| V1 | git repo | `git rev-parse --is-inside-work-tree` | `true` | `0` | ✅ |
| V2 | .gitignore | `grep agent-mailbox .gitignore` | `agent-mailbox/` | `0` | ✅ |
| V3 | mailbox dirs | `ls -d agent-mailbox/to-claude agent-mailbox/to-codex agent-mailbox/archive` | `agent-mailbox/archive`, `agent-mailbox/to-claude`, `agent-mailbox/to-codex` | `0` | ✅ |
| V4 | CLAUDE.md | `head -1 CLAUDE.md` | `# Workflow Project` | `0` | ✅ |
| V5 | deps installed | `ls dashboard/node_modules/.package-lock.json` | `dashboard/node_modules/.package-lock.json` | `0` | ✅ |
| V6 | server starts | `node server.js` | `Server listening on 127.0.0.1:3001` | `manual stop after smoke` | ✅ |
| V7 | API empty | `curl -s http://127.0.0.1:3001/api/messages` | `{"toClaude":[],"toCodex":[],"archive":[]}` | `0` | ✅ |
| V8 | vite build | `cd dashboard && npx vite build` | `vite v8.0.8 ... built in 582ms` | `0` | ✅ |
| V9 | gitignore works | `git status --short \| grep agent-mailbox` | no output | `1` | ✅ |
| V10 | personal data | `grep -riE "<sanitized-user-patterns>" dashboard CLAUDE.md .gitignore --include="*.js" --include="*.jsx" --include="*.json" --include="*.md" -l` | no output | `1` | ✅ |

Additional hygiene checks:

- Absolute path scan (`/mnt/e`, `E:/`, `C:/Users/`, `/home/`) across new files: no matches ✅
- CRLF scan for new code/config files: no matches ✅

---

## Phase 2 — `[awaits user]`

| # | Test | Result |
|---|------|--------|
| V11 | Live UI test | `[awaits user]` |
| V12 | Message round-trip | `[awaits user]` |
| V13 | Archive visibility | `[awaits user]` |

---

## Phase 3 — `[awaits 3-day]`

| # | Test | Result |
|---|------|--------|
| V14 | Real mailbox usage | `[awaits 3-day]` |
| V15 | UI stability | `[awaits 3-day]` |

---

## Tools used

| Tool | Used for | ✅/BLOCKED |
|------|----------|------------|
| git | repo init and repo state checks | ✅ |
| npm | package version checks and install | ✅ |
| node | environment sanity check and API server | ✅ |
| curl | API smoke test | ✅ |
| webfetch | doc verification for D1, D2, D3, D5, D6 | ✅ |
| grep | personal-data and ignore checks | ✅ |

---

## Out-of-scope temptations

| What | Why skipped |
|------|-------------|
| Add reply/archive mutations to the dashboard | Phase 1 is read-only by spec |
| Add file watchers instead of polling | Spec says polling is sufficient for MVP and watchers on `/mnt/e/...` are not the early default |
| Create a root `package.json` just to satisfy the inconsistent whitelist entry | Plan is internally inconsistent; dashboard-local package scope was enough for install, build, and runtime |

---

## Discrepancies

| # | Plan says | Reality | Severity | Action taken |
|---|-----------|---------|----------|-------------|
| 1 | D3 URL is `https://react.dev/learn/start-a-new-project` for React 19 project setup | URL returns `404`; current official React guidance lives elsewhere and points framework-first, with Vite as the roll-your-own option | High | Recorded before code; implementation continued only after explicit user go-ahead |
| 2 | `@vitejs/plugin-react` version `^4.5.3` | `npm view @vitejs/plugin-react version` returned `6.0.1` | Medium | Updated `dashboard/package.json` to `^6.0.1` |
| 3 | `concurrently` version `^9.1.2` | `npm view concurrently version` returned `9.2.1` | Low | Updated `dashboard/package.json` to `^9.2.1` |
| 4 | Whitelist includes root `package.json` (`W6`), but Changes define only `dashboard/package.json` | Plan is internally inconsistent about whether a root package is required | Medium | Left root package absent; scoped npm work to `dashboard/`; recorded instead of inventing extra root config |
| 5 | Environment snapshot assumes `python` availability | `python` command is missing; `python3` is available (`Python 3.12.3`) | Low | Used `python3` for LF verification |
| 6 | Plan snippet places `react` and `react-dom` under `devDependencies` | They are runtime dependencies for the client app | Low | Moved them to `dependencies` in the actual implementation |

---

## Self-audit checklist

| # | Check | ✅/❌ |
|---|-------|-------|
| 1 | git init выполнен | ✅ |
| 2 | .gitignore содержит agent-mailbox/ и node_modules/ | ✅ |
| 3 | agent-mailbox/{to-claude,to-codex,archive}/ существуют | ✅ |
| 4 | CLAUDE.md создан | ✅ |
| 5 | dashboard/package.json создан с актуальными версиями | ✅ |
| 6 | npm install завершился без ошибок | ✅ |
| 7 | server.js слушает 127.0.0.1:3001 | ✅ |
| 8 | API возвращает JSON | ✅ |
| 9 | App.jsx рендерит три колонки | ✅ |
| 10 | Empty state показывается при пустом mailbox | ✅ |
| 11 | Polling работает (setInterval) | ✅ |
| 12 | vite config: порт 9119, proxy на 3001 | ✅ |
| 13 | vite build без ошибок | ✅ |
| 14 | Нет personal data в новых файлах | ✅ |
| 15 | Нет правок существующих `.md` файлов вне report | ✅ |
| 16 | Все зависимости проверены через npm view | ✅ |
| 17 | gray-matter парсится на сервере, не на клиенте | ✅ |
| 18 | Нет абсолютных путей в коде dashboard | ✅ |
| 19 | Line endings: LF в JS/JSX файлах | ✅ |
| 20 | agent-mailbox/ не попадает в git status | ✅ |


## Legacy Workflow Note (2026-04-21)

This file is preserved as a historical artifact from an earlier workflow revision.

It may mention legacy patterns such as `Claude planner / Codex executor`, user relay, `compact prompt`, or older handoff shapes.

Do not use it as the live operating template. Current contract: `docs/codex-system-prompt.md`, `AGENTS.md`, `workflow-role-distribution.md`, `workflow-instructions-claude.md`, and `workflow-instructions-codex.md`.
