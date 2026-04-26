# Mailbox Automation Master Roadmap — Planning Audit

**Plan**: `docs/codex-tasks/mailbox-automation-master-roadmap.md`
**Planner**: Codex
**Mode**: pre-exec planning audit
**Status**: complete for roadmap packaging, not an implementation approval

## 1. Why This Audit Exists

The repository already had multiple valid but fragmented planning artifacts:

- original 4-phase supervisor rollout;
- compat rewrite for cross-OS rails;
- separate Phase B and Phase C plans;
- a draft point-7 Codex bridge plan;
- operator UX refinements discussed later in chat.

What was missing was one canonical roadmap that:

- preserves point 7 as point 7;
- keeps only the points still materially useful for the real workflow;
- distinguishes delivered baseline from future work;
- hardens execution discipline so later implementation cannot be hand-waved from memory.

## 2. Source Inventory

### 2.1 Wiki sources read or inherited as current task context

| Source | Why it matters |
|---|---|
| `concepts/doc-first-proof-second-workflow.md` | Confirms docs -> proof -> plan -> code discipline. |
| `connections/agent-automation-scope-discipline.md` | Prevents scope creep and overbuilding. |
| `concepts/claude-mcp-and-skill-usage-matrix.md` | Supports mandatory MCP/skill logging instead of from-memory claims. |
| `concepts/mailbox-auto-pickup-supervisor.md` | Original phased automation framing. |
| `concepts/workflow-hybrid-hook-automation.md` | Confirms backend-first logic, thin hooks, WSL/Linux-only Codex automation. |
| `concepts/cli-agent-no-inbound-api.md` | Confirms plain CLI still has no inbound prompt API. |
| `concepts/windows-wsl-process-launcher.md` | Anchors hidden-launcher and Windows->WSL support-process pattern. |
| `concepts/mailbox-project-isolation.md` | Confirms project isolation must remain infrastructure-enforced. |
| `concepts/mailbox-list-destructive-read.md` | Confirms status reads must not use destructive mailbox list path. |

### 2.2 Repository sources inspected

| Source | Why it matters |
|---|---|
| `docs/codex-system-prompt.md` | Current repo review/verification discipline. |
| `local-claude-codex-mailbox-workflow.md` | Current mailbox contract and current automation stance. |
| `docs/codex-tasks/mailbox-auto-pickup-supervisor-tz.md` | Original 4-phase automation spec. |
| `docs/codex-tasks/mailbox-supervisor-phase-a.md` | Original concrete Phase A supervisor/runtime plan. |
| `docs/codex-tasks/mailbox-automation-compat.md` | Cross-OS compat rails and Phase A rewrite. |
| `docs/codex-tasks/mailbox-automation-phase-b.md` | Claude session registration plan. |
| `docs/codex-tasks/mailbox-automation-phase-c.md` | Historical Claude delivery signal plan; now a reverted/non-current baseline source. |
| `docs/codex-tasks/mailbox-codex-app-server-bridge.md` | Point-7 draft bridge plan. |
| `.claude/settings.local.json` | Confirms the current live hook baseline in the repo. |
| `dashboard/supervisor.mjs` | Confirms current runtime state surfaces already exist. |
| `dashboard/server.js` | Confirms existing runtime routes and agent delivery vocabulary. |
| `scripts/codex-app-server-smoke.mjs` | Confirms point-7 proof tool already exists. |

### 2.3 Official sources verified for roadmap construction

| ID | Official source | Key planning implication |
|---|---|---|
| D1 | OpenAI Codex App Server | `initialize -> thread/resume/start -> turn/start` is the correct app-server reminder path; `turn/steer` is separate and optional. |
| D2 | OpenAI Codex MCP | Codex MCP configuration is first-class and shared across CLI/IDE, so MCP-first planning is correct. |
| D3 | OpenAI Codex Skills | Skills are a real reusable workflow surface, so skill logging in the report is not optional process theater. |
| D4 | OpenAI Tool Search | Deferred tool/MCP discovery should be explicit and logged. |
| D5 | MCP Architecture | Host/client/server roles must stay explicit; do not invent hidden coordinators without naming their role. |
| D6 | MCP Transports | Local services should stay localhost-bound; loopback-only bridge scope is justified. |
| D7 | Claude Code Hooks | SessionStart/Stop remain the correct Claude-side lifecycle hooks; `UserPromptSubmit` remains rejected. |

## 3. What Was Kept, Collapsed, Or Deferred

### 3.1 Kept as distinct roadmap points

These survived as explicit points because they remain directly useful to the real app:

1. hidden launcher default + dashboard close;
2. dashboard-first operator shell;
3. supervisor runtime core;
4. global multi-project visibility;
5. project isolation and deliverable filtering;
6. Claude-side passive automation foundation;
7. Codex `app-server + --remote` reminder bridge;
8. dedup ledger and retry-safe delivery state;
9. dashboard Codex transport control + health;
10. late hardening for ambiguity and recovery;
11. diagnostics, rollback, runbooks, and closure tests.

### 3.2 Collapsed from older phase split

The older documentation split some work more finely than the current master roadmap needs:

- historical Phase B and historical/reverted Phase C were collapsed into **point 6** because, for the operator, they form one Claude-side history: delivered registration baseline plus a failed/reverted Stop-hook delivery attempt that must remain visible as a negative constraint.
- historical Phase D intent was narrowed into **point 10** and explicitly made conditional-late, because the user's normal workflow does not involve same-project concurrent Codex windows.

### 3.3 Explicitly deferred or rejected

These were intentionally not elevated into standalone roadmap points:

- `UserPromptSubmit` automation;
- plain standalone CLI prompt injection;
- non-loopback transport exposure;
- dashboard as a replacement for the visible Codex chat;
- speculative lease/claim complexity before a real ambiguity problem exists.

## 4. Mapping Historical Docs To The New 11 Points

| Historical source | New roadmap point(s) |
|---|---|
| `mailbox-auto-pickup-supervisor-tz.md` | 3, 4, 6, 10 |
| `mailbox-supervisor-phase-a.md` | 3, 4 |
| `mailbox-automation-compat.md` | 3, 4, 5, 6 |
| `mailbox-automation-phase-b.md` | 6 |
| `mailbox-automation-phase-c.md` | 6 (historical attempted delivery path; reverted, not current baseline) |
| `mailbox-codex-app-server-bridge.md` | 7, 8, 9, 10 |
| accepted launcher/dashboard UX changes from 2026-04-24 | 1, 2, 9 (code exists, but no dedicated live artifact package yet) |

## 4.1 Round-1 Review Remarks — Independent Verification

Claude's first-round review remarks were not accepted blindly. The following high-signal claims were independently checked against current repo state before revising the roadmap:

| Remark | Independent verification | Result |
|---|---|---|
| C1: Phase C delivery path is not current baseline | Verified by `git log --oneline --all -- scripts/mailbox-stop-delivery.mjs`, current absence of `scripts/mailbox-stop-delivery.mjs`, and current `.claude/settings.local.json` Stop block containing only `mailbox-session-register.mjs` | Confirmed |
| M2: Points 1-2 lack dedicated live artifact package | Verified by `rg --files docs/codex-tasks` against likely launcher/operator-shell artifact names and by current absence of a dedicated 4-doc task package for those UX changes | Confirmed |
| M3: `mailbox-supervisor-phase-a.md` missing from mapping | Verified by file presence and original mapping omission | Confirmed |
| M4: baseline-lock stages lacked concrete probes | Verified by reading the original v1 roadmap sections 7.3-7.6; they had high-level verification language but no explicit probe lists | Confirmed |
| R4: session freshness must be explicit if runtime session routing is used | Verified against `dashboard/supervisor.mjs` current `SESSION_STALE_MS = 60_000` and `activeSessions` derivation | Confirmed |

The v2 roadmap therefore applies these changes as evidence-backed corrections, not as deference-to-reviewer.

## 4.2 Round-2 Review Remarks — Independent Verification

Claude's second-round review approved v2 as a planning package and listed three non-blocking observations. These were also checked against the current repository state before applying v3 cleanup.

| Remark | Independent verification | Result |
|---|---|---|
| Optional #1: point 7 used inconsistent wording: `same rollout` vs `before operator-enabled` | Verified with `rg -n "same rollout|operator-enable" docs/codex-tasks/mailbox-automation-master-roadmap.md`; the tension was present in point 7 step 8 and exit gate wording | Confirmed; v3 removes `same rollout` as the gate and uses operator-enable status consistently |
| Optional #3: point 6 probes lacked an explicit negative check for `mailbox-stop-delivery` in `.claude/settings.local.json` | Verified with `rg -n "mailbox-stop-delivery|mailbox-status|mailbox-session-register|Stop" .claude/settings.local.json scripts docs/codex-tasks/mailbox-automation-master-roadmap.md`; current settings contain registration/status hooks and no `mailbox-stop-delivery` entry | Confirmed; v3 adds a negative hook-config probe |
| Optional #4: point 1 shutdown probe may fail if `/api/runtime/shutdown` is absent | Verified with `rg -n "/api/runtime/shutdown|shutdownWorkflow|shutdown" dashboard/server.js dashboard/src/api.js dashboard/src/App.jsx`; the route and client function exist in the current working tree | Not confirmed; no roadmap change needed |

## 5. Why Point 7 Stays Point 7

The user explicitly referred back to the earlier 11-point plan and said point 7 was the one experimentally confirmed. To preserve that traceability, the new master roadmap keeps the Codex bridge as **point 7**, not merely “some later stage.”

This matters because:

- it preserves continuity with the prior conversation;
- it keeps the experimentally confirmed result visible in the same numbered slot;
- it prevents later drift where a different stage is mislabeled as the proven Codex path.

## 6. Point 7 Status: Proven Path, Not Approved Execution

The roadmap records two facts at once:

1. **Technical proof exists.** On 2026-04-24 the live WSL path `codex app-server` + `codex --remote` + smoke client successfully started a new turn in an existing remote thread.
2. **Implementation approval does not exist yet.** The user explicitly said the automation plan was not yet approved.

Therefore point 7 is marked:

- `validated path`;
- `planning only`;
- `requires explicit approval before coding`.

This is deliberate and must not be weakened later by vague wording like “already basically approved.”

## 7. Why Baseline Points 1-6 Stay In The Roadmap

Points 1-6 are not future greenfield work. They stay in the roadmap because later work depends on them and the executor must verify them instead of re-inventing or silently assuming them.

The master roadmap therefore treats them as:

- **baseline-lock stages**;
- verify-first;
- reopen only on real regression or explicit scope change.

This avoids two bad outcomes:

- needless recoding of already accepted behavior;
- fragile future work that assumes an old baseline without re-checking it.

## 8. Why The Report Gate Was Hardened

The user requested a report that:

- must be filled by the executor;
- may not be skipped;
- may not be filled from memory;
- must block moving forward if incomplete;
- must force a return to unfinished work if evidence is missing.

The roadmap therefore adds a stronger execution contract than prior phase docs had:

- mandatory file inspection log;
- mandatory official-doc log;
- mandatory skill/MCP log;
- mandatory no-from-memory gate;
- hard stage-by-stage completion rule;
- no progression while required report fields remain unfilled.

## 9. Sequencing Decision

The roadmap sequencing is intentionally conservative:

- 1-2: verify current code truth first, but do not call them baseline-frozen until a retroactive artifact trail or explicit re-baselining exists;
- 3-6: verify and freeze baseline first;
- 7: first new functional automation stage, but approval-gated;
- 8 and 9: only after 7 is approved;
- 10: only when real runtime evidence justifies the complexity;
- 11: mandatory closure for any coded stage.

This keeps the roadmap aligned with both the user's operating mode and the scope-discipline rules from wiki.

## 10. Risks In The Roadmap Itself

| Risk | Why it matters | Mitigation in the roadmap |
|---|---|---|
| Future executor treats point 7 proof as implementation approval | Could restart unwanted automation coding | Point 7 status explicitly says validated path, not approved |
| Historical docs drift from current repo | Could cause stale assumptions | Baseline-lock stages require re-verification before edits |
| Skill/MCP requirements get papered over | Could recreate from-memory coding | Execution report requires exact tool/skill logs |
| Late hardening gets pulled too early | Could overcomplicate the happy path | Point 10 is explicitly conditional-late |
| Operator UX gets fragmented again | Could reintroduce terminal sprawl | Points 1, 2, and 9 keep dashboard-first control as a hard rule |

## 11. Audit Verdict

The new master roadmap is internally coherent with:

- the repo's current mailbox contract;
- the accepted launcher/dashboard UX direction;
- the proven Phase A/B baseline plus the explicit historical fact that Phase C user-facing Stop-hook delivery was reverted and is not the current baseline;
- the experimentally confirmed point-7 Codex path;
- the user's demand for hard evidence and non-skippable execution reporting.

This audit approves the **roadmap package as planning**.

It does **not** approve coding of point 7 or later stages.
