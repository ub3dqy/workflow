# Mailbox Phase 3 — Helper Scripts — Execution Report

> **План**: `docs/codex-tasks/mailbox-helper-scripts.md`
>
> **Статус**: `[x] done`

---

## 0. Pre-flight

### 0.1 Environment snapshot

| Item | Value |
|------|-------|
| OS | `Linux 6.6.87.2-microsoft-standard-WSL2` |
| Node | `v24.14.1` |
| npm | `11.11.0` |
| git | `git version 2.43.0` |
| Working dir | `repo root` |
| git status | `M dashboard/server.js`, `?? scripts/mailbox-lib.mjs`, `?? scripts/mailbox.mjs`, pre-existing untracked `.codex` + plan/report files |
| HEAD | `17272f8ec662cc580ab6d64a71d6637605b1f99a` |

### 0.2 Baseline snapshots

| Item | Command | Value |
|------|---------|-------|
| server.js line count | `wc -l dashboard/server.js` | `150 dashboard/server.js` (after refactor) |
| scripts/ contents | `ls scripts` | `mailbox-lib.mjs`, `mailbox-status.mjs`, `mailbox.mjs` |
| Root package.json exists | `cat package.json 2>&1` | `cat: package.json: No such file or directory` |
| Server API works | `curl -s http://127.0.0.1:3001/api/messages` | `{"toClaude":[],"toCodex":[],"archive":[]}` |
| vite build | `npx vite build` (from `dashboard/`) | `✓ built in 688ms` after `npm install` environment repair |

---

## 0.6 Doc verification

| # | URL | Key quote | Matches plan? |
|---|-----|-----------|---------------|
| D1 | https://nodejs.org/api/util.html#utilparseargsconfig | `util.parseArgs([config])` / `Added in: v18.3.0, v16.17.0` | ✅ |
| D2 | https://www.npmjs.com/package/gray-matter | `console.log(matter.stringify('foo bar baz', {title: 'Home'}));` | ✅ |

---

## 1. Changes

### 1.1 scripts/mailbox-lib.mjs (Change 1)

- Created: ✅
- Functions extracted from server.js: `collectMarkdownFiles`, `readMessage`, `readBucket`, `generateMessageFile`, `archiveMessageFile`, `nextSequenceForThreadFrom`, validation helpers, message parsing/rendering helpers
- mailboxRoot parameterized: ✅
- recoverOrphans() added: ✅

### 1.2 scripts/mailbox.mjs (Change 2)

- Created: ✅
- `send` command works: ✅
- `list` command works: ✅
- `reply` command works (inherits thread + auto-archive): ✅
- `archive` command works: ✅
- `recover` command works: ✅
- Uses parseArgs() built-in: ✅

### 1.3 Root package.json (Change 3)

- Created: ❌
- gray-matter + marked only: ❌
- npm install clean: N/A

Reason skipped: plan suggested root `package.json`, but whitelist did not allow it. Shared lib instead resolves `gray-matter` and `marked` from `dashboard/package.json` via `createRequire(...)`, so no scope expansion was needed.

### 1.4 dashboard/server.js refactor (Change 4)

- Imports from shared lib: ✅
- Server API still works: ✅
- vite build still works: ✅

---

## 2. Phase 1 smokes

| # | Test | Command | Output | Exit code | ✅/❌ |
|---|------|---------|--------|-----------|-------|
| V1 | send | `node scripts/mailbox.mjs send --from user --to codex --thread phase3-send --body 'Question from user'` | `to-codex/...phase3-send-user-001.md` | `0` | ✅ |
| V2 | list | `node scripts/mailbox.mjs list` | table with `phase3-send`, `phase3-reply`, `phase3-recover` | `0` | ✅ |
| V3 | list --json | `node scripts/mailbox.mjs list --json` | JSON array with 3 pending messages | `0` | ✅ |
| V4 | reply + auto-archive | `node scripts/mailbox.mjs reply --to 'to-codex/...phase3-reply-claude-001.md' --body 'Answer from user' --json` | reply created in `to-claude/`; original archived to `archive/phase3-reply/...`; `thread: phase3-reply` inherited | `0` | ✅ |
| V5 | archive | `node scripts/mailbox.mjs archive --path 'to-codex/...phase3-send-user-001.md' --resolution no-reply-needed --json` | `archive/phase3-send/...`, `alreadyArchived: false` | `0` | ✅ |
| V6 | recover | `node scripts/mailbox.mjs recover --json` | archived orphaned `phase3-recover` pending message with `answerMessageId` | `0` | ✅ |
| V7 | server GET | `curl -s http://127.0.0.1:3001/api/messages` | JSON mailbox payload returned before and after cleanup | `0` | ✅ |
| V8 | server POST | `curl -s -X POST http://127.0.0.1:3001/api/reply ...` and `curl -s -X POST http://127.0.0.1:3001/api/archive ...` | reply created, archive moved to `archive/phase3-api/...` | `0` | ✅ |
| V9 | vite build | `npx vite build` | `✓ built in 688ms` | `0` | ✅ |
| V10 | personal data | `grep scan for real username/hostname tokens in changed files + report` | no matches | `1` | ✅ |
| V11 | absolute paths | `grep scan for absolute local filesystem paths in changed files + report` | no matches | `1` | ✅ |
| V12 | thread validation | `node scripts/mailbox.mjs send --from user --to codex --thread '../bad' --body 'bad'` | `thread must be a safe relative slug`, shell `exit=64` | `64` | ✅ |

---

## Phase 2 — `[awaits user]`

| # | Test | Result |
|---|------|--------|
| V13 | Agent uses CLI | `[awaits user]` |
| V14 | Cross-agent round-trip | `[awaits user]` |

---

## Tools used

| Tool | Used for | ✅/BLOCKED |
|------|----------|------------|
| node | syntax checks, CLI runs, server run | ✅ |
| npm | `dashboard` environment repair for Vite optional binding | ✅ |
| curl | API smokes + official doc fetch for `parseArgs()` | ✅ |
| webfetch | not needed after direct official docs / npm readme verification | BLOCKED |
| grep | personal data + absolute path scan | ✅ |

---

## Out-of-scope temptations

| What | Why skipped |
|------|-------------|
| root `package.json` | outside whitelist; solved cleanly with `createRequire(new URL("../dashboard/package.json", import.meta.url))` |
| changes to `scripts/mailbox-status.mjs` | explicitly forbidden; hook remained standalone |
| UI changes in `dashboard/src/*` | Phase 3 scope was helpers + server refactor only |

---

## Discrepancies

| # | Plan says | Reality | Severity | Action taken |
|---|-----------|---------|----------|-------------|
| 1 | Add root `package.json` with `gray-matter` + `marked` | whitelist allowed only `scripts/mailbox-lib.mjs`, `scripts/mailbox.mjs`, `dashboard/server.js` | medium | did not expand scope; used `createRequire` from `dashboard/package.json` |
| 2 | `vite build` should verify directly after refactor | build failed first due missing optional `rolldown` native binding in `dashboard/node_modules`, unrelated to code changes | medium | ran `npm install` in `dashboard`; build then passed, `dashboard/package*.json` stayed unchanged |

---

## Self-audit checklist

| # | Check | ✅/❌ |
|---|-------|-------|
| 1 | `scripts/mailbox-lib.mjs` created with extracted functions | ✅ |
| 2 | `scripts/mailbox.mjs` CLI with 5 subcommands | ✅ |
| 3 | send creates correct mailbox file | ✅ |
| 4 | list shows table + `--json` works | ✅ |
| 5 | reply inherits thread from target | ✅ |
| 6 | reply auto-archives original message | ✅ |
| 7 | archive moves to `archive/<thread>/` | ✅ |
| 8 | recover finds and archives orphans | ✅ |
| 9 | server.js imports from shared lib | ✅ |
| 10 | server API unchanged (GET + POST) | ✅ |
| 11 | vite build passes | ✅ |
| 12 | root package.json with gray-matter + marked | ❌ by design (whitelist discrepancy) |
| 13 | npm install clean | ✅ |
| 14 | thread validation blocks path traversal | ✅ |
| 15 | No personal data | ✅ |
| 16 | No absolute paths | ✅ |
| 17 | Test messages cleaned up | ✅ |
| 18 | `mailbox-status.mjs` NOT modified | ✅ |
