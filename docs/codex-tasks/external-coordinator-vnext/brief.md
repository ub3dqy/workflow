# External Coordinator vNext — Brief

**Status**: design-only  
**Date**: 2026-04-27  
**Implementation approval**: not granted by this artifact  
**Current baseline**: mailbox dashboard + Stage 7A Codex remote bridge

## Goal

Define the next external coordinator shape without rebuilding the reverted paperclip stack.

The design keeps the current repo's useful primitives:

- project-scoped mailbox CLI and dashboard state;
- Codex remote app-server bridge with fail-closed routing;
- runtime health JSON files;
- operator-visible dashboard.

## Non-Goals

- No new runtime dependencies.
- No agent auto-launching in this stage.
- No mailbox body injection into agent prompts.
- No Stop-hook delivery resurrection.
- No replacement of the mailbox protocol.
- No implementation without explicit user approval after product review.

## Wiki Constraints

- `paperclip-style-agent-coordinator`: hooks cannot provide a continuous autonomous loop; a coordinator is the correct long-term control-plane primitive.
- The same wiki article records that the previous paperclip stack was reverted for scope creep. This design must stay small and fit-for-purpose.
- `mailbox-project-isolation`: project identity must be explicit and infrastructure-enforced, not inferred from CWD alone.

## Minimal Shape

```text
dashboard/server.js
  ├─ runtime state readers/writers
  ├─ coordinator heartbeat
  ├─ task queue
  ├─ Claude adapter
  └─ Codex adapter
```

The first production coordinator should only:

1. observe pending mailbox state and active agent sessions;
2. decide whether a delivery/reminder should be attempted;
3. call existing adapters instead of embedding agent-specific logic inline;
4. persist heartbeat, queue, attempts, blocked reasons, and recovery state;
5. surface current state in the dashboard.

## Proposed Stages

| Stage | Goal | Exit Gate |
|---|---|---|
| C1 | Coordinator state model only | JSON schema, migration-free startup, read-only dashboard view |
| C2 | Mock adapter heartbeat | deterministic tests prove queue/blocked-state transitions |
| C3 | Codex adapter wrapper | uses existing Stage 7A bridge APIs; no new transport semantics |
| C4 | Claude adapter wrapper | registers/observes sessions; no Stop-hook prompt injection |
| C5 | Operator controls | pause/resume queue, retry blocked item, inspect attempt history |
| C6 | Recovery policies | only after real stuck/ambiguous evidence exists |

## Current Recommendation

Do not implement C1 until the current doctor, CI, UI clarity, and bootstrap work has landed and stayed green. C1 should be a small state-model and visibility change, not a platform rewrite.
