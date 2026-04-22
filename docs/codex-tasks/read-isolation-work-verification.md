# read-isolation — Work Verification Report (Codex)

**Verification date**: 2026-04-22
**Verifier**: Codex
**Plan under verification**: `docs/codex-tasks/read-isolation.md` v4
**Implementation state under verification**: commit `ed99c7e` + uncommitted Change 12 in working tree
**Verdict**: Full agreement

## Scope

Verified Claude's follow-up fix for the WSL path-case mismatch, re-checked the previously failing repros in the current WSL environment, and confirmed the same-project/session-bind behavior still preserves project isolation.

## Reviewed Artifacts

- `docs/codex-tasks/read-isolation.md`
- `docs/codex-tasks/read-isolation-report.md`
- `docs/codex-tasks/read-isolation-planning-audit.md`
- `scripts/mailbox-lib.mjs`
- `scripts/mailbox.mjs`
- `mailbox-runtime/sessions.json`

## Independent Verification

### Code inspection

- `scripts/mailbox-lib.mjs:96-102` now case-folds both compared paths unconditionally via `value.toLowerCase()`.
- The change is limited to `resolveCallerProject`; no new read paths or scope expansions were introduced.
- The planning-audit and implementation report were updated to record the NTFS/WSL root cause and the residual assumption about genuinely case-sensitive POSIX filesystems.

### Runtime probes

```text
$ node --input-type=module -e "import { resolveCallerProject } from './scripts/mailbox-lib.mjs'; console.log(await resolveCallerProject({ cwd: '/mnt/e/project/workflow', runtimeRoot: './mailbox-runtime' })); console.log(await resolveCallerProject({ cwd: '/mnt/e/Project/workflow', runtimeRoot: './mailbox-runtime' })); console.log(await resolveCallerProject({ cwd: '/mnt/c/unrelated', runtimeRoot: './mailbox-runtime' }));"
workflow
workflow

$ node scripts/mailbox.mjs list --bucket to-codex --project workflow --json | python3 -c "import json,sys; data=json.load(sys.stdin); print(len(data), sorted(set(m['project'] for m in data)))"
1 ['workflow']

$ node scripts/mailbox.mjs list --bucket to-codex --project workflow --json | python3 -c "import json,sys; data=json.load(sys.stdin); print(len(data), sorted(set(m['project'] for m in data)))"
1 ['workflow']

$ node scripts/mailbox.mjs list --project messenger_test
session bound to "workflow", refusing list for project "messenger_test"

$ node scripts/mailbox.mjs archive --path to-codex/messenger_test__fake.md --project workflow
relativePath basename does not belong to bound project "workflow"
```

Interpretation:

- Same-project lookup now succeeds from both `/mnt/e/project/workflow` and `/mnt/e/Project/workflow`.
- Cross-project CLI access is still rejected.
- Foreign-project basename guard still rejects before archive path processing.

## Findings

No Critical or Mandatory findings remain.

## Residual Risk

- The new unconditional case-fold assumes NTFS-style case-insensitive backing storage. That matches this project's actual deployment model (`E:` + `/mnt/e/...`). Claude documented the residual caveat for genuinely case-sensitive POSIX filesystems in the planning audit; that is acceptable for the agreed scope.

## Final Status

Full agreement for the current implementation state. The original blocking WSL case-mismatch issue is resolved, and the scoped CLI guards still behave correctly after the fix.

Note: Change 12 is currently uncommitted in Claude's working tree and still requires an explicit user commit command per repo policy. That is a workflow/publishing state, not a verification defect.
