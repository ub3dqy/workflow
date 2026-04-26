# Workflow Bootstrap Kit

Use this kit to prepare another local project for the Claude↔Codex mailbox workflow without copying hidden state or guessing project identity.

## Contract

- The workflow repository remains the control-plane repo: dashboard, mailbox CLI, runtime files, and transport bridge live here.
- The target project keeps only lightweight agent config that points back to this repo's scripts.
- Project identity is explicit through `--project <slug>`.
- Bootstrap is review-first: the check script reports what is missing and provides suggested file bodies.
- The bootstrap script is dry-run by default. It writes only with explicit `--write`, and it overwrites only with explicit `--force`.

## 1. Pick The Project Slug

Use one stable slug per target repo. Prefer the repo directory name unless there is already a project alias in the mailbox history.

Example:

```bash
project_slug=workflow
```

## 2. Run The Read-Only Check

From this workflow repo:

```bash
node scripts/workflow-bootstrap-check.mjs --target /path/to/target --project "$project_slug"
```

For machine-readable output, including suggested file bodies:

```bash
node scripts/workflow-bootstrap-check.mjs --target /path/to/target --project "$project_slug" --json
```

## 3. Review Required Target Files

The target project should have:

- `AGENTS.md` — repo instructions, including wiki-first and mailbox coordination rules if this target participates in the workflow.
- `CLAUDE.md` — Claude project conventions where applicable.
- `.codex/config.toml` — enables Codex hooks with `codex_hooks = true`.
- `.codex/hooks.json` — registers Codex sessions through `scripts/mailbox-session-register.mjs`.
- `.claude/settings.local.json` — registers Claude sessions and optionally shows mailbox status at session start.

Do not copy `agent-mailbox/`, `mailbox-runtime/`, `.codex/sessions/`, or dashboard build output into the target repo.

## 4. Optionally Write Minimal Agent Config

To preview exactly which files would be created:

```bash
node scripts/bootstrap-workflow.mjs --target /path/to/target --project "$project_slug"
```

To create only missing minimal config files:

```bash
node scripts/bootstrap-workflow.mjs --target /path/to/target --project "$project_slug" --write
```

The script only manages:

| File | Purpose |
|---|---|
| `.codex/config.toml` | Enables Codex hook support |
| `.codex/hooks.json` | Registers Codex sessions with the workflow mailbox runtime |
| `.claude/settings.local.json` | Registers Claude sessions and shows mailbox status at session start |

It does not copy task history, runtime files, mailbox data, dashboard build output, or session state.

This kit copies workflow primitives, not project history. Do not use it to restore corrupted state in an existing workflow repo; use git restore or the relevant runtime backup path for that.

## 5. Validate A Live Session

After adding reviewed config to the target project:

1. Start the workflow dashboard from this repo.
2. Start Claude and Codex from the target repo.
3. Run `node scripts/workflow-doctor.mjs` in this repo to confirm runtime JSON and transport health.
4. Use mailbox CLI with explicit `--project <slug>` only.

## Safety Rules

- Do not infer the project from CWD when sending mailbox messages.
- Do not use raw `codex --remote` as the supported mailbox entry point; use `codexr` from the target repo.
- Do not mutate another project's mailbox files manually.
- Do not treat a green bootstrap check as proof that agent sessions are currently registered; use runtime doctor for live state.
