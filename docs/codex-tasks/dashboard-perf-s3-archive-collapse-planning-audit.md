# dashboard-perf-s3 — Planning Audit

**Stage**: 3 of 4
**Task origin**: user 2026-04-22 «дашборд тормозит» → roadmap Stage 3 = archive render deferral, ~25-30 LOC UI change.
**Depends on**: Stages 1 (`8a553b2`) + 2 (`8c2a704`), both local-only (unpushed).

---

## §0 Meta-procedure

Per CLAUDE.md Rule 8 (smallest atomic stages, commit-per-stage). Stage 3 ships one logical UX change as one commit; alternative designs (virtualize, persist in localStorage, card-body collapse) are explicitly deferred to later stages per brief §4 out-of-scope.

Per CLAUDE.md Rule 12 (specialized tools over generic) + `feedback_plan_creation_procedure_pointer.md` memory — this file is filled **in parallel with the brief**, not post-hoc. Each planning claim cites either the grep/read evidence below or an explicit assumption flag.

## §1 MCP + Skill inventory

| Tool | Purpose | Priority | Readiness |
|---|---|---|---|
| `Read` / `Grep` | App.jsx call-site audit (archive render, useState cluster, i18n dict, CSS block) | Primary | always |
| `Bash` | `npx vite build`, PD regex scan, `git diff --ignore-cr-at-eol` gates | Primary | ✅ (Stage 1/2 cache) |
| `webapp-testing` via `npx playwright` | AC-4 collapse/expand toggle probe + AC-5 smoke | MANDATORY | ✅ inherits Stage 1/2 cache (Version 1.59.1 cached, confirmed 2026-04-22) |
| `context7` | React 19 `useState` semantics review | Optional | not needed — `useState` is stable pre-React-19 API, no new behavior at 19 |
| `plan-audit` skill | Post-draft plan audit, adversarial findings | MANDATORY | ✅ available |

## §2 Tool readiness

Inherits from Stages 1/2 (same environment, no restart):

```text
$ npx --no-install playwright --version
Version 1.59.1   (cached)

$ node --version
v24.13.0

$ ls dashboard/node_modules/.bin/vite
(exists — verified at Stage 1/2)
```

Post-Stage 2 tree state (baseline for Stage 3):

```text
$ git log --oneline -3
8c2a704 perf(dashboard): poll interval 3s → 10s, ~70 % fewer /api/messages hits
8a553b2 perf(dashboard): AbortController + stale-drop guard on mailbox + runtime polls
0ef6b11 fix(mailbox): unconditional case-fold in resolveCallerProject for WSL/Windows NTFS parity

$ git diff --ignore-cr-at-eol --stat HEAD -- dashboard/src/App.jsx
(empty)
```

Clean baseline. Stage 3 edit will stack on top of `8c2a704`.

## §2a Line-ending state

Inherits Stage 2 §2a contract. `core.autocrlf=true` on executor env; `git ls-files --eol dashboard/src/App.jsx` → `i/lf w/crlf` (normal resting state). Acceptance gate = `--ignore-cr-at-eol` on both `--stat` and full diff; package-doc scope verified via `git status --short --untracked-files=all` (untracked files invisible to `git diff`). Raw diff is executor-local advisory, not an acceptance gate.

No new line-ending concerns specific to Stage 3.

## §3 Files

| File | Role |
|---|---|
| `dashboard/src/App.jsx` | **Only file modified.** 5 logical edits: `useState` cluster (:1294-1318) — add slot; ru i18n (:18-83) + en i18n (:84-150) — add 2 keys each; JSX columnBody (:1842-1879) — conditional render; CSS block after `.columnHint` (:682-686) — `.archiveToggle` rule; independent `[project]` effect after the localStorage-write effect at `:1348-1353` — reset `archiveExpanded` on project change. |
| `dashboard/src/api.js` | Out of scope — Stage 1's `signal` threading is sufficient; no new API touch. |
| `dashboard/server.js` / `dashboard/supervisor.mjs` | Out of scope — server-side payload shape unchanged. |

## §4 Grep audit (executed 2026-04-22)

### Archive rendering call-sites

```text
$ Grep -in "archive" dashboard/src/App.jsx
3:  archiveMessage,
13:  archive: []
36:  archive: "Архив",
48:  archiveButton: "Архивировать",
103:  archive: "Archive",
115:  archiveButton: "Archive",
906:  .archiveButton { ... }
1076:  { key: "archive", title: t.archive }
1113:  const isArchiving = activeAction === `archive:${message.relativePath}`;
1533:  archive: Array.isArray(nextMessages.archive) ? nextMessages.archive : []
1607:  const archiveInboxMessage = useEffectEvent(async (message) => {
1666:  messages.toClaude.length + messages.toCodex.length + messages.archive.length;
1863:  onArchive={archiveInboxMessage}
1871:  showActions={column.key !== "archive"}
```

### useState cluster

```text
$ grep -n "useState" dashboard/src/App.jsx
1:   import { ..., useState } from "react";
1294:  const [runtimeState, setRuntimeState] = useState({...});
1299:  const [messages, setMessages] = useState(emptyData);
1300:  const [error, setError] = useState("");
1301:  const [isLoading, setIsLoading] = useState(true);
1302:  const [isRefreshing, setIsRefreshing] = useState(false);
1303:  const [lastUpdated, setLastUpdated] = useState("");
1304:  const [noteTargetPath, setNoteTargetPath] = useState("");
1305:  const [noteBody, setNoteBody] = useState("");
1306:  const [activeAction, setActiveAction] = useState("");
1307:  const [availableProjects, setAvailableProjects] = useState([]);
1308:  const [lang, setLang] = useState(() => ...);
1311:  const [project, setProject] = useState(() => getStoredText("mailbox-project", ""));
1312:  const [theme, setTheme] = useState(() => ...);
1315:  const [systemPrefersDark, setSystemPrefersDark] = useState(() => ...);
1318:  const [soundEnabled, setSoundEnabled] = useState(...);
```

New `archiveExpanded` state slots in alongside these hooks — simple `useState(false)`, no init callback.

### Column rendering block

```text
$ Read App.jsx:1842-1879
<section className="grid">
  {columns.map((column) => (
    <section className="column" key={column.key}>
      <header className="columnHeader">
        <h2>{column.title}</h2>
        <span className="countPill">{messages[column.key].length}</span>
      </header>
      <div className="columnBody">
        {messages[column.key].length === 0 ? (
          <p className="columnHint">{isLoading ? t.loading : t.noMessages}</p>
        ) : (
          messages[column.key].map((message) => (<MessageCard ... />))
        )}
      </div>
    </section>
  ))}
</section>
```

Stage 3 change: inject `column.key === "archive"` conditional before the existing `.length === 0` check, with `archiveExpanded` controlling whether to render toggle-only or cards.

### Dependent call-sites of `messages.archive`

```text
$ grep -n "messages.archive" dashboard/src/App.jsx
1666:  messages.toClaude.length + messages.toCodex.length + messages.archive.length;
```

Only one consumer outside the rendering block — `totalMessages` in the stats pill. Unaffected by collapse (counts are state, not DOM).

### Potential name collision: `.archiveToggle` CSS class

```text
$ grep -n "archiveToggle" dashboard/src/App.jsx
(no hits)
```

Name available.

### i18n dict shape (checked via Read App.jsx:18-83, 84-150)

Two flat object literals `translations.ru` + `translations.en`, keys sorted by topical cluster. New keys (`archiveShow`, `archiveHide`) fit cleanly alongside existing `archive`, `archiveButton`, `archiving`.

## §5 No new doc verification required

Stage 3 uses:
- `useState` — stable React API, no version-specific behavior. Same pattern as the 14 existing `useState` hooks in this file.
- Standard JSX conditional rendering — no new React 19 idiom.
- CSS custom properties + `button` element — stable browser platform.

No `context7` fetch needed. Stages 1-2 already verified React 19 behavior for the idioms reused here.

## §6 Empirical probe plan

### EP1 — Toggle behavior (AC-4) + smoke (AC-5)

Script: `E:/tmp/pw-probe/probe-s3.mjs` (throwaway; same executor-local path as Stages 1/2 per codex-004 agreement).

Steps:
1. Headless Chromium, no throttle, 10 s steady-state page (so Stage 2 guard doesn't pile ticks).
2. Navigate `http://localhost:9119/`.
3. Wait for at least one `/api/messages` response (signals initial render finished).
4. Locate archive column via `page.locator('.column').filter({ hasText: /Archive|Архив/i })` (language-agnostic — app defaults to `ru` per `App.jsx:1308-1310`). Equivalent fallback `.column:nth-child(3)` since `getColumns(t)` always makes `key: "archive"` the third column.
5. Read the archive column's `.countPill` text as an integer → `archiveCount`. Branch the acceptance path on its value (both branches are explicit PASS paths):
   - **Branch A — non-empty (`archiveCount > 0`)**: assert `.columnBody` contains exactly 1 `.archiveToggle` button AND 0 `.card` elements. Click toggle → `waitForFunction` for `.card` count === `archiveCount` within 1000 ms. Click toggle again → `waitForFunction` for `.card` count back to 0 and toggle count back to 1 within 1000 ms.
   - **Branch B — empty (`archiveCount === 0`)**: assert `.columnBody` contains 0 `.archiveToggle` buttons AND 0 `.card` elements (toggle intentionally skipped per §4 «Empty archive» edge case). The existing `.columnHint` placeholder (`"Нет сообщений."` / `"No messages in this bucket yet."`) should be the only content. **No click step** (nothing to click; no meaningful expand semantics for 0 cards).
6. Both branches: collect console errors, pageerror events, heading text, and card counts in `toClaude` / `toCodex` columns (should match Stage 2 baseline).

Expected output shape (branch-aware):
```
{
  archiveCount: <int from .countPill>,
  branch: "non-empty" | "empty",
  // branch=non-empty:
  initialArchiveBodyButtons: 1,
  initialArchiveBodyCards: 0,
  postExpandArchiveCards: <archiveCount>,
  postCollapseArchiveBodyButtons: 1,
  postCollapseArchiveBodyCards: 0,
  // branch=empty:
  initialArchiveBodyButtons: 0,
  initialArchiveBodyCards: 0,
  hintPresent: true,
  // always:
  toClaudeCards: <baseline>,
  toCodexCards: <baseline>,
  consoleErrorCount: 0,
  pageErrors: []
}
```

Pre-Stage-3 baseline (Stage 2 state, under identical data on both branches): archive column renders `messages.archive.length` cards on load; there is no toggle. In the production dataset this means ~260+ cards rendered immediately.

Post-Stage-3 targets (branch-specific):
- **Branch A** (`archiveCount > 0`): **0 cards** on load, **1** `.archiveToggle` button present; full list renders only after click; back to `0 cards + 1 toggle` after a second click.
- **Branch B** (`archiveCount === 0`): **0 cards** on load, **0** `.archiveToggle` buttons; existing `.columnHint` placeholder is the only content. No click path.

Script deleted post-capture.

## §7 Assumptions + verification status

| Claim | Status | Evidence |
|---|---|---|
| Only one file (`App.jsx`) is modified | ✅ verified | §3 — no other file has archive-rendering logic; `messages.archive` usage is only in App.jsx |
| `messages.archive` shape (array of message objects) is stable across the change | ✅ verified | §4 — only `.length` consumer outside rendering; array semantics unchanged |
| `archiveExpanded` state survives React re-renders from poll ticks | ✅ reasoned | State lives in `App`; poll updates `messages` via `setMessages`, which does not reset other `useState` slots |
| Toggle button inside `.columnBody` doesn't break grid auto-layout | ⚠️ assumed | `.columnBody` is `display: grid; gap: 14px;` (§4 + CSS read) → a single `button` child is trivially grid-valid. Low-risk, verified empirically via AC-4 |
| `.archiveToggle` CSS name is unique | ✅ verified | §4 grep — 0 hits currently |
| i18n key additions don't collide with existing `archive*` keys | ✅ verified | §4 — existing keys: `archive`, `archiveButton`, `archiving`; new keys `archiveShow`, `archiveHide` distinct |
| Default-collapsed UX is correct (not default-expanded) | ⚠️ design choice | Brief §3 rationale; reversible via 1-LOC hotfix if user signals wrong |
| Symmetric show/hide vs one-way expand | ⚠️ design choice | Brief §3 rationale; ~4 LOC difference; reversible |
| `archiveExpanded` resets to `false` on `[project]` change | ✅ design decision (codex-001) | Brief §2 edit #5 + §3 rationale. `messages` state is not cleared on project switch (`App.jsx:1569-1586` starts fresh fetch but leaves old `setMessages` result mounted until new response); persisting `archiveExpanded` would let the incoming project's archive auto-mount expanded, re-incurring heavy mount cost. Independent `useEffect(() => { setArchiveExpanded(false); }, [project])` preserves the «smooth by default» contract on every project switch, not just first load. |
| Commit diff-stat is within `~35+/-3` envelope | ⚠️ estimated | Actual value measured post-edit (AC-7) |
| Preview server picks up new bundle without restart | ✅ verified | Stage 2 demonstrated this pattern works (curl + probe) |

## §8 Known gaps (honest flags)

- **G1 (carry-over from Stages 1-2)**: server-side abort handling still assumed-not-probed. Not actionable in Stage 3.
- **G2 (carry-over from Stage 2)**: poll latency ≤ 10 s — unchanged by this stage.
- **G3 (Stage 3-specific)**: «default-collapsed» is a UX judgement call. A user who prefers always-expanded archive will have to click once per session. Documented tradeoff, not a bug. Reversible.
- **G4 (resolved in V2 via codex-001)**: state-reset semantics on `[project]` change are now explicitly defined — `archiveExpanded` resets to `false` via an independent effect. The prior «persist-across-projects» default was factually incorrect because `messages` isn't cleared on project change; the independent effect closes that gap.

## §9 Delta from roadmap

Roadmap §Stage order lists Stage 3 as «Fix 1 — `useState archiveExpanded=false` + summary strip «Archive (267) [expand]» wrapping archive `.map()` at `App.jsx:~1801`». Stage 3 package matches and refines:
- Actual line number is `:~1842-1879` (grid block starts at :1842, not :1801; difference is 41 lines of prior code — roadmap approximation was close).
- Adds symmetric collapse (not just expand) per UX rationale in brief §3. ~4 LOC extra.
- Adds 2 i18n keys × 2 languages. Not mentioned in roadmap but mandatory for bilingual UI (project has ru + en).
- Adds one CSS rule `.archiveToggle`. Not mentioned in roadmap but needed to avoid an unstyled `<button>` element.

Net scope ~30-35 LOC vs roadmap estimate of ~25 LOC. Delta explained, no scope drift.

## §10 Discrepancy checkpoints

Mirror of brief §7.

## §11 Signature

Created: 2026-04-22
Author: Claude (workflow project)
Stage: 3 of 4
Status: ready for Codex review
