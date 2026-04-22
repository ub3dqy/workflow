# dashboard-perf-s4 — Planning Audit

**Stage**: 4 of 4 (final)
**Task origin**: user 2026-04-22 «дашборд тормозит» → roadmap Stage 4 = move markdown render off server hot path, add per-card body collapse. ~60 LOC estimate.
**Depends on**: Stages 1 (`8a553b2`) + 2 (`8c2a704`) + 3 (`20c0039`), all local-only.

---

## §0 Meta-procedure

Per CLAUDE.md Rule 8 (smallest atomic stages). Stage 4 is the largest of the four roadmap stages because it touches two files and coordinates a server-client contract change, but it still ships as a single logical feature (one commit). Alternative designs (keep server html + add collapse; virtualize instead of collapse; use different markdown lib) are explicitly in brief §3 or §4 out-of-scope.

## §2a Line-ending state

Inherits Stage 2 §2a / Stage 3 §2a contract unchanged. `core.autocrlf=true` on executor env; `git ls-files --eol dashboard/src/App.jsx scripts/mailbox-lib.mjs` → both `i/lf w/crlf`. Acceptance gate = `--ignore-cr-at-eol`; untracked doc scope via `git status --short --untracked-files=all`. Raw diff is advisory only.

## §1 MCP + Skill inventory

| Tool | Purpose | Priority | Readiness |
|---|---|---|---|
| `Read` / `Grep` | App.jsx + mailbox-lib.mjs region audit | Primary | always |
| `Bash` | `npx vite build`, PD regex, git diff gates, curl | Primary | ✅ (Stages 1-3 cache) |
| `webapp-testing` via `npx playwright` | AC-8 expand/collapse probe + AC-10 poll cadence | MANDATORY | ✅ installed via throwaway `npm install` pattern from Stage 3 |
| `context7` | Official marked v18 API + React 19 `useMemo` semantics | Optional | Used below in §5 for doc pinning |
| `plan-audit` skill | Post-draft adversarial pass | MANDATORY | ✅ available |

## §2 Tool readiness

```text
$ npx --no-install playwright --version
Version 1.59.1   (cached from Stages 1-3)

$ node --version
v24.13.0

$ grep "\"marked\"" dashboard/package.json
    "marked": "^18.0.1",
```

`marked` is already a runtime dependency (`dashboard/package.json:19`); `npm install` is unnecessary. The installed version is `18.0.1` per `dashboard/package-lock.json:1375`.

Post-Stage-3 tree baseline:

```text
$ git log --oneline -3
20c0039 perf(dashboard): archive column collapsed by default (summary toggle)
8c2a704 perf(dashboard): poll interval 3s → 10s, ~70 % fewer /api/messages hits
8a553b2 perf(dashboard): AbortController + stale-drop guard on mailbox + runtime polls

$ git diff --ignore-cr-at-eol --stat HEAD -- scripts/mailbox-lib.mjs dashboard/src/App.jsx
(empty)
```

Clean baseline for Stage 4 edits.

## §3 Files

| File | Role in Stage 4 |
|---|---|
| `scripts/mailbox-lib.mjs` | **Touched.** Remove marked import + config + `html:` field. |
| `dashboard/src/App.jsx` | **Touched.** Add marked import, `expandedIds` state + helper, `MessageCard` prop + body branch, new CSS. |
| `dashboard/package.json` | **Not touched.** marked v18.0.1 already present. |
| `dashboard/server.js`, `dashboard/supervisor.mjs`, `scripts/mailbox*.mjs` | **Not touched.** No consumer of `.html` field beyond App.jsx. |

## §4 Grep audit (executed 2026-04-22)

### `marked` usage

```text
$ grep -rn "marked" dashboard/ scripts/ --include='*.js' --include='*.mjs' --include='*.jsx' --exclude-dir=node_modules
scripts/mailbox-lib.mjs:10-13:  (dynamic import)
scripts/mailbox-lib.mjs:32:     marked.use({ breaks: true, gfm: true });
scripts/mailbox-lib.mjs:552:    html: body ? String(marked.parse(body)) : "",
```

Server-side `marked` lives only in `mailbox-lib.mjs`. No dashboard/ runtime code references it. Post-Stage-4: all three regions removed, marked gone from server entirely; client adds one import.

### `.html` field consumers

```text
$ grep -rn "\.html\b" dashboard/server.js dashboard/supervisor.mjs scripts/mailbox.mjs scripts/mailbox-session-register.mjs scripts/mailbox-migrate-project-prefix.mjs
(no hits)

$ grep -n "message\\.html" dashboard/src/App.jsx
1267:      {message.html ? (
1270:          dangerouslySetInnerHTML={{ __html: message.html }}
```

Only one consumer of `.html`: `App.jsx:1267-1272` (the `MessageCard` body block). Stage 4 replaces it with client-rendered HTML on expand.

### `dangerouslySetInnerHTML` usage (for blast-radius)

```text
$ grep -rn "dangerouslySetInnerHTML" dashboard/src/
dashboard/src/App.jsx:1270:          dangerouslySetInnerHTML={{ __html: message.html }}
```

Single site. Stage 4 keeps one `dangerouslySetInnerHTML` (same site, same CSS container `section.body`) but fed from client-side `marked.parse(message.body)` instead of server-prepared `message.html`.

### `expandedIds` / `toggleExpanded` (new identifiers — must not collide)

```text
$ grep -rn "expandedIds\|toggleExpanded" dashboard/ scripts/ --exclude-dir=node_modules
(no hits)
```

Names free.

### Stage 3 call-sites to re-verify (regression-guard)

```text
$ grep -n "archiveExpanded\|setArchiveExpanded\|archiveShow\|archiveHide\|archiveToggle" dashboard/src/App.jsx
(matches confirmed — Stage 3 logic intact, Stage 4 does not touch these)
```

## §5 Docs verification

| Topic | Primary source | Key facts | Applied in |
|---|---|---|---|
| `marked` v18 API + config | `dashboard/node_modules/marked/lib/marked.esm.js` (vendored) + upstream docs at `https://marked.js.org/using_advanced` | `marked.use({ breaks: true, gfm: true })` preserves GitHub-flavored parsing + treats `\n` inside paragraphs as `<br>`. `marked.parse(markdown: string): string` returns HTML string. | Brief §2 edit #4 (config parity). |
| `marked` v18 output sanitization | `dashboard/node_modules/marked/README.md:53-56` | **Marked does not sanitize output HTML** — raw `<script>` / `<img onerror=...>` in input passes through verbatim. Upstream explicitly recommends pairing with DOMPurify when input is untrusted. Stage 4 does NOT add DOMPurify and therefore preserves the pre-Stage-4 **unsanitized** `marked.parse` + `dangerouslySetInnerHTML` pipeline; the only change is client-side execution of the same operation. | Brief §3 «Security posture (not «default-safe»)» subsection; brief §4 out-of-scope; brief §9 bullet 1 (flagged for Codex). |
| React 19 `useState` with `Set` initializer | React docs — `useState(initializer)` — «If you pass a function, React calls it only on the initial render and stores the returned value as the initial state.» | `useState(() => new Set())` avoids allocating a new Set on every render. Same pattern as `useState(() => getStoredText(...))` at `App.jsx:1311`. | Brief §2 edit #5. |
| React 19 `useMemo` deps array | React docs — «`useMemo` recomputes when any dep changes»; Set identity doesn't matter for deps — we use `[expanded, message.body]` which are a boolean + string. | Cache key is exact — boolean change or body-string change triggers re-parse. | Brief §2 edit #8 (b). |

All claims doc-backed; no memory-only assertions.

## §6 Empirical probe plan

### EP1 — Expand / collapse toggle + multi-expand (AC-8)

Script `/tmp/pw-probe/probe-s4.mjs` (POSIX-clean path; works in git-bash on Windows and in WSL / native Linux). Headless Chromium, no throttle, local playwright install (same pattern as Stage 3).

Steps (mouse + keyboard + a11y):
1. Navigate `http://localhost:9119/`, wait for `/api/messages` response.
2. Query first `toClaude` or `toCodex` card (not archive) via `.column:nth-child(1) .card, .column:nth-child(2) .card`, take first: locator `card1`.
3. **Initial asserts** (collapsed): `card1.locator('.body').count() === 0`, `card1.locator('.bodyPreview').count() === 1`, `bodyPreview.textContent.length > 0`, AND `card1.locator('header.cardHeader').getAttribute('aria-expanded') === "false"`.
4. **Click expand** — click `card1.locator('header.cardHeader')`. Wait up to 1000 ms for `card1.locator('.body').count() === 1` AND `card1.locator('.bodyPreview').count() === 0`. Assert `aria-expanded === "true"`. Capture `body.innerHTML` (expect non-empty).
5. **Multi-expand** — take `card2` (different `relativePath`). Click its header. Assert `card2.body.count() === 1` AND `card1.body.count() === 1` still. Both headers report `aria-expanded === "true"`.
6. Take `card3`. Click header. Assert all three `.body` sections present AND all three `aria-expanded === "true"` simultaneously.
7. **Action-button guard** — click `card1.locator('.cardButton').first()`. Assert `card1.body.count() === 1` still AND `aria-expanded === "true"` (action click scoped outside header, does NOT collapse).
8. **Keyboard — Space on focused header**:
   - `page.evaluate` to record `window.scrollY` before the keystroke.
   - Focus a collapsed card header (e.g., `card1` after re-collapsing via click): `await card1.locator('header.cardHeader').focus()`.
   - `await page.keyboard.press('Space')`. Assert the card expands (`.body.count() === 1`, `aria-expanded === "true"`) AND `window.scrollY` is unchanged (Space `preventDefault` prevents page scroll).
9. **Keyboard — Enter on expanded card**: with the same card now expanded, `await page.keyboard.press('Enter')`. Assert it collapses (`.body.count() === 0`, `aria-expanded === "false"`).
10. **Click-collapse round trip** — click `card1` header again (remaining cards still expanded). Assert `card1.body.count() === 0` AND `.bodyPreview` back AND `aria-expanded === "false"`.
11. Click `card2` + `card3` headers to collapse. Final assert: 0 `.body` sections across all three cards AND all three `aria-expanded === "false"`.

### EP2 — Poll cadence regression (AC-10)

Same script, 30 s observation window, count `/api/messages` requests via `page.on('request')`. Expect 3 ± 1.

### EP3 — Wire size (AC-11)

```text
$ curl -s http://localhost:9119/api/messages | wc -c
# pre-Stage-4 baseline captured before edit
# post-Stage-4 captured after edit
```

Expect post < pre, roughly by `sum(messages[].html.length)`.

**Non-mutating baseline capture (no `git stash`)**: run the pre-Stage-4 `curl ... | wc -c` **before any Phase 2 edit is applied** — the live server is still running the pre-Stage-4 bundle at that point, so its `/api/messages` response still includes the `html` field. Save the byte count to `/tmp/pw-probe/pre-s4-api-messages.bytes`. Then apply Phase 2 edits + rebuild + **restart `node server.js`** (see runtime-architecture note below), then re-run the curl, save post-Stage-4 count, diff them. `git stash` is rejected because the repo's worktree carries pre-existing dirty files (`.claude/settings.local.json`, `AGENTS.md`, `CLAUDE.md`, `docs/codex-system-prompt.md`) and `dashboard/src/App.jsx` itself may show as modified under raw diff in the verifier env due to CRLF view asymmetry — a stash could interleave unrelated state. The pre-edit-snapshot approach is non-mutating and equally authoritative; report records both numbers and delta.

**Runtime architecture note**: `dashboard/package.json` scripts show `serve` = concurrent `node server.js` (API on :3003) + `vite preview` (frontend on :9119). `server.js:5-22` imports from `../scripts/mailbox-lib.mjs`; `vite.config.js:11-13` proxies `/api` → :3003. Node.js does **not** hot-reload ES modules, so once `node server.js` is running, it holds the pre-edit `mailbox-lib.mjs` in memory; editing the file on disk does NOT retroactively change what :3003 serves. `npx vite build` rebuilds the frontend bundle only. **Implication**: after editing `scripts/mailbox-lib.mjs`, the API process must be explicitly restarted before AC-8/9/10/11 are collected. The brief's Phase 2 step #4 enforces this with a `pkill` / fresh `node server.js` + health-check for «no `"html":` in response» — otherwise measurements and probes silently exercise old server code.

## §7 Assumptions + verification status

| Claim | Status | Evidence |
|---|---|---|
| `marked` used only by `scripts/mailbox-lib.mjs` server-side | ✅ verified | §4 grep |
| `.html` field consumed only by `App.jsx:1267` | ✅ verified | §4 grep |
| `dangerouslySetInnerHTML` single site | ✅ verified | §4 grep — replacing in place, no new sites |
| `marked` v18 API stable for `marked.parse` + `marked.use({breaks,gfm})` | ✅ verified | §5 — vendored source + upstream docs |
| Vite transpiles client-side `marked` import without config change | ⚠️ assumed | Vite auto-resolves `dependencies` entries; `marked` is in `dependencies` not `devDependencies`. AC-3 / AC-7 will empirically confirm. |
| `expandedIds: Set<string>` pattern performs within React 19 | ✅ reasoned | setState with `(prev) => new Set(prev)` is standard; bundle cost negligible |
| Clicking `<header>` does not collide with interactive descendants | ✅ verified | §4 — cardHeader contains only `<h3>` + chips; no buttons/inputs |
| `useMemo([expanded, message.body])` correctly re-renders on poll update | ✅ reasoned | React identity semantics — if body string changes, parse runs; if body unchanged, cached |
| Security posture: Stage 4 **does not change** sanitization — unsanitized `marked.parse` + `dangerouslySetInnerHTML`, same as pre-Stage-4 | ✅ verified | §5 — marked upstream (`README.md:53-56`) explicitly states it does NOT sanitize; pre-Stage-4 server path also did not sanitize; both rely on the trusted-local-writer assumption (Claude + Codex CLI). Adding DOMPurify is a legitimate separate hardening stage, explicitly out-of-scope for Stage 4 per brief §4 and §9 bullet 1. |
| No repo-wide reference to `.html` field outside documented set | ✅ verified | §4 — checked dashboard/, scripts/; excluded node_modules / docs |

## §8 Known gaps (honest flags)

- **G1 (carry-over)**: server-side abort handling in Stages 1/2 — unchanged, still assumed-not-probed.
- **G2 (Stage 4 security tradeoff — precise statement)**: per brief §3 «Security posture (not «default-safe»)» — Marked does NOT sanitize output HTML (upstream `README.md:53-56`). Stage 4 preserves the pre-existing **unsanitized** `marked.parse` + `dangerouslySetInnerHTML` pipeline; the only change is client-side execution of the same unsanitized operation. Trust model: mailbox body originates from two local writers (Claude + Codex CLI), not arbitrary web input. Adding DOMPurify between `marked.parse` and the `dangerouslySetInnerHTML` prop is a legitimate separate stage; explicitly out of Stage 4 scope (brief §4 + §9 bullet 1). If Codex argues sanitization must land in this stage, re-scope.
- **G3 (measurement method)**: AC-11 uses raw byte count (`wc -c`), not gzipped size. If gzipped delta is preferred, Codex will flag.
- **G4 (probe environment)**: AC-8 assumes at least 2-3 non-archive cards exist in the test env. Local env currently has `toClaude: 1` + `toCodex: 2` per Stage 3 probe data → sufficient for single-card + multi-expand assertion. Empty-both-live-columns path is unexercised; considered degenerate (dashboard useful only when there ARE messages).
- **G5 (partial rollback)**: Stage 4 couples server remove + client add; a half-revert would break rendering. Rollback is atomic on the Stage 4 commit.

## §9 Delta from roadmap

Roadmap Stage 4 scope: «Fix 2 — drop `html` from `readMessage` return (`mailbox-lib.mjs:552`); import `marked` client-side; memoized per-id renderer triggered on expand; plain-text preview when collapsed. Full UI contract: all cards collapsible (not archive-only), `expandedIds: Set<string>` state at App top-level, trigger = click on card header, default = collapsed. ~60 LOC.»

Stage 4 package matches every point:
- `mailbox-lib.mjs:552` → edit #3 (plus incidental cleanup #1, #2 for orphaned marked import/config).
- Client `marked` → edit #4.
- Memoized per-id renderer → edit #8 (b) via `useMemo([expanded, body])` inside `MessageCard`.
- Plain-text preview → edit #8 (b) `.bodyPreview`.
- All cards collapsible → edit #9 (prop passed to every `MessageCard`).
- `expandedIds: Set<string>` at App top-level → edit #5.
- Trigger = click on card header → edit #8 (a).
- Default collapsed → `useState(() => new Set())` initial empty Set.

No scope drift. Estimate ~60 LOC is close; actual will be measured under AC-13.

## §10 Discrepancy checkpoints

Mirror of brief §7.

## §11 Signature

Created: 2026-04-22
Author: Claude (workflow project)
Stage: 4 of 4
Status: ready for Codex review
