# mailbox-received-at-caller-scope — Execution report

**Stage**: 6. **Commit**: published in git history as the Stage 6 ship commit.
**Base HEAD**: `a5821af`.
**Branch**: `master`.
**Executor**: Codex (direct user override on 2026-04-23 because Claude hit limits).
**Report mode**: post-exec.

---

## 0. Status

Stage 6 code is implemented in the working tree and matches the v6 package scope across the planned 3 code files.

Verification completed with:

1. `node --check` on `scripts/mailbox-lib.mjs`, `scripts/mailbox.mjs`, `dashboard/server.js`
2. disposable fixture probes for helper lookup, CLI `list`, CLI `reply`, agent HTTP path, non-agent HTTP path
3. `cd dashboard && npx vite build`
4. CI-aligned PD scan from `.github/workflows/ci.yml`
5. safe real-root runtime smoke on port `3015` via non-agent `/api/messages`

I did **not** restart the active local dev server on port `3003`; see §5.

## 1. git diff --stat

```text
 dashboard/server.js     | 11 +++++++++--
 scripts/mailbox-lib.mjs | 37 +++++++++++++++++++++++++++----------
 scripts/mailbox.mjs     | 31 ++++++++++++++++++++++++++++---
 3 files changed, 64 insertions(+), 15 deletions(-)
```

## 2. File-by-file role

- `scripts/mailbox-lib.mjs`
  Extracted internal `resolveCallerSession({ cwd, runtimeRoot })`, kept `resolveCallerProject(...)` as a thin wrapper, added `resolveCallerAgent(...)`, and made `port` / `defaultMailboxRoot` env-aware.
- `scripts/mailbox.mjs`
  Made `runtimeRoot` env-aware, restricted `handleList` marking to the caller-owned inbox only, and rejected wrong-direction `reply` before any state mutation.
- `dashboard/server.js`
  Made `runtimeRoot` env-aware and restricted `/api/agent/messages` marking to the session agent's own inbox only.

## 3. Probes

### V1 — metadata

```text
HEAD=a5821af
commit_created=pending-at-report-write
```

### V2 — helper shape (AC-1)

```text
typeof resolveCallerAgent = function
resolveCallerSession exported = false
```

### V3 — helper lookup matrix (AC-2..AC-5)

```text
AC2 => claude
AC3 => codex
AC4 => ""
AC5 => ""
```

### V4 — `resolveCallerProject` equivalence (AC-6)

```text
AC6 => fx
```

### V5 — CLI `list` fixture (AC-7 + AC-8)

```text
status=0
toClaudeReceived=true
toCodexReceived=false
```

### V6 — CLI `reply` same-direction (AC-9)

```text
status=0
targetArchived=true
outgoingToCodex=true
originalStillInInbox=0
stdout=to-codex/fx__2026-04-23T16-49-22Z-reply-ok-claude-001.md
archive/reply-ok/fx__2026-04-23T16-49-20Z-reply-ok-codex-001.md
```

### V7 — CLI `reply` wrong-direction reject (AC-10)

```text
status=64
stderr=reply target bucket owned by "codex"; cannot reply as "claude"
receivedBefore=false
receivedAfter=false
archiveCount=0
toCodexCount=1
toClaudeCount=0
```

### V8 — server agent-messages (AC-11 + AC-12)

```text
AC11 register=claude => toClaudeReceived=true, toCodexReceived=false
AC12 register=codex  => toClaudeReceived=false, toCodexReceived=true
```

### V9 — server unknown-agent path (AC-13)

```text
POST /api/runtime/sessions with agent=gpt => {"error":"agent must be claude or codex"}
GET /api/agent/messages with that session_id => {"error":"session not found"}
frontmatter after call => toClaudeReceived=false, toCodexReceived=false
```

Note: the defensive `[]` branch in `dashboard/server.js` remains in place, but the public supervisor registration API rejects unknown agents before such a session can exist in live state.

### V10 — non-agent server path (AC-14)

```text
status=0
toClaudeReceived=false
toCodexReceived=false
```

### V11 — build + safe real-root runtime smoke

```text
$ cd dashboard && npx vite build
vite v8.0.8 building client environment for production...
transforming...✓ 17 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  0.39 kB | gzip:  0.27 kB
dist/assets/index-DPEQBa0Y.js  272.41 kB | gzip: 82.60 kB
✓ built in 1.90s
```

```text
PORT=3015 node dashboard/server.js
Server listening on 127.0.0.1:3015
GET /api/messages?project=workflow => {toClaude: 1, toCodex: 0, archive: 339, projects: 4}
```

### V12 — PD scan (AC-19)

```text
PD scan clean
```

### V13 — fixture cleanup (AC-20)

```text
/tmp/stage6-probe-* => absent
```

## 4. Acceptance Criteria status

| AC | Status | Evidence |
|---|---|---|
| AC-1 | PASS | V2 |
| AC-2 | PASS | V3 |
| AC-3 | PASS | V3 |
| AC-4 | PASS | V3 |
| AC-5 | PASS | V3 |
| AC-6 | PASS | V4 |
| AC-7 | PASS | V5 |
| AC-8 | PASS | V5 |
| AC-9 | PASS | V6 |
| AC-10 | PASS | V7 |
| AC-11 | PASS | V8 |
| AC-12 | PASS | V8 |
| AC-13 | N/A | public runtime API rejects unknown agents before `agentRouter`; defensive branch preserved, zero-mark behavior still observed in failed-registration probe (V9) |
| AC-14 | PASS | V10 |
| AC-15 | PASS | §1 |
| AC-16 | PASS | V11 |
| AC-17 | MODIFIED PASS | safe-equivalent real-root smoke on port `3015`; exact port `3003` restart skipped to avoid interrupting an active local dev process |
| AC-18 | PASS | no `package.json` / `dashboard/package.json` diff |
| AC-19 | PASS | V12 |
| AC-20 | PASS | V13 |

## 5. Known unknowns

1. The precise planning-audit AC-13 route is not runtime-reachable through the public supervisor API because `/api/runtime/sessions` rejects agents other than `claude` / `codex`. The defensive `[]` branch still remains correct and harmless.
2. The exact planning-audit AC-17 step said to restart the live port `3003` dev server. I intentionally used a safe equivalent on port `3015` because a `node server.js` process was already active locally and killing it would have disrupted user work.
3. Repository-level `scripts/quality.ps1` and `scripts/security.ps1` do not exist in this checkout, so that deploy gate could not be run verbatim.

## 6. Rollback

No commit exists yet. Rollback is local working-tree discard of the 3 code files or, if later committed, `git revert <stage-6-code-sha>`.

## 7. Handoff

Codex executed and verified this block in one pass because the user explicitly overrode the normal Claude-exec / Codex-verify split for this turn.
