# External Coordinator vNext — Planning Audit

**Status**: design audit, no code approval  
**Date**: 2026-04-27

## Scope Check

This package is intentionally documentation-only. It does not add:

- scripts;
- package dependencies;
- runtime files;
- dashboard routes;
- agent launcher behavior.

## Consistency Checks

| Check | Result |
|---|---|
| Aligns with `paperclip-style-agent-coordinator` wiki direction | Pass |
| Preserves the paperclip revert lesson about scope creep | Pass |
| Preserves Stage 7A Codex app-server bridge as current baseline | Pass |
| Preserves mailbox project isolation | Pass |
| Avoids CWD-only project inference | Pass |
| Avoids Stop-hook delivery | Pass |

## Required Before Implementation

Any future coded coordinator stage must provide:

- a fresh brief for the specific stage;
- deterministic state-transition tests;
- dashboard or API smoke from a fresh server startup;
- mailbox safety proof that bodies were not injected or mutated;
- cross-project isolation proof;
- rollback path scoped to that stage;
- Claude review through `agent-mailbox/` before commit.

## Risks

- Recreating the reverted paperclip stack by adding too much at once.
- Blurring visible project Codex sessions with the shared app-server support transport.
- Treating runtime JSON presence as proof of live agent readiness.
- Deriving project identity from CWD instead of session binding and explicit project flags.

## Open Questions

- Should coordinator state remain JSON or move to SQLite once task history grows?
- Should Codex adapter call the bridge directly or publish a delivery-intent record consumed by the bridge tick?
- What minimum dashboard UI is enough for operator value without a broad redesign?
