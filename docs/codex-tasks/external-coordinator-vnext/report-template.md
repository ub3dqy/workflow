# External Coordinator vNext — Report Template

Use this template only after a future implementation stage is explicitly approved.

## 0. Status

- Stage:
- Base HEAD:
- Commit:
- Executor:
- Date:
- Verdict:

## 1. Scope

- Files changed:
- Explicitly out of scope:
- Deviations from brief:

## 2. Implementation Summary

- What changed:
- What did not change:
- Runtime state files touched:
- Dashboard/API surfaces touched:

## 3. Safety Evidence

- Project isolation evidence:
- Mailbox body non-injection evidence:
- Stop-hook non-resurrection evidence:
- CWD/identity verification evidence:

## 4. Verification

Record exact commands and outputs:

```text
<command>
<output>
```

Required categories:

- unit tests;
- fresh server startup if server code changed;
- dashboard/API smoke if UI or API changed;
- `git diff --check`;
- personal-data scan if docs or output paths changed.

## 5. Rollback

- Pre-commit rollback:
- Post-commit rollback:
- Runtime cleanup if needed:

## 6. Residual Risks

- Risk:
- Owner:
- Follow-up condition:
