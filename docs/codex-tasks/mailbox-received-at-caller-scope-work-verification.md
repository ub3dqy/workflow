# mailbox-received-at-caller-scope — Work verification

**Verifier**: Codex.
**Mode**: combined executor + verifier by direct user override on 2026-04-23.
**Scope**: Stage 6 caller-scoped `received_at` marking and wrong-direction reply rejection.

---

## Findings

No code-review findings remain in the changed block.

## Verification

- `node --check` passed for `scripts/mailbox-lib.mjs`, `scripts/mailbox.mjs`, `dashboard/server.js`
- fixture helper probes passed for `resolveCallerAgent` / `resolveCallerProject`
- fixture CLI probes passed:
  - Claude-bound `list` marks `to-claude` only
  - Claude-bound `reply` archives same-direction target and emits reply
  - wrong-direction `reply` exits `64` and leaves mailbox state untouched
- fixture HTTP probes passed:
  - `/api/agent/messages` marks only caller-owned inbox for `claude`
  - `/api/agent/messages` marks only caller-owned inbox for `codex`
  - `/api/messages` does not mutate frontmatter
- `cd dashboard && npx vite build` passed
- CI-aligned PD scan passed
- safe real-root runtime smoke on port `3015` passed

## Security

- Wrong-direction reply mutation is blocked before `markMessageReceived`, outgoing message creation, or archive mutation.
- Caller-agent resolution is constrained to `claude|codex`; unknown values degrade to `""`.
- Env overrides are path-resolved before use, matching existing path-handling style.

## Residual risks

- The public supervisor API rejects unknown agents, so the defensive unknown-agent branch in `dashboard/server.js` is structurally present but not runtime-reachable via normal registration.
- I did not restart the active port `3003` dev server; I used a safe equivalent smoke on `3015` to avoid interrupting local work.
- Repo-level `scripts/quality.ps1` and `scripts/security.ps1` are absent in this checkout, so this block is not being declared deploy-ready.

## Verdict

ready for local commit
