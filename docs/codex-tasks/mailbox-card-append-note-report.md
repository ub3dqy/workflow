# Mailbox Card Append-Note — Execution Report

**Plan**: `docs/codex-tasks/mailbox-card-append-note.md`
**Planning-audit**: `docs/codex-tasks/mailbox-card-append-note-planning-audit.md`
**Executor**: Codex
**Date**: `2026-04-18`

> Anti-fabrication reminder: raw stdout verbatim. Sanitize hostnames only; do not paraphrase outputs.

---

## §0 Pre-flight

### §0.1 Env

```text
Linux <hostname> 6.6.87.2-microsoft-standard-WSL2 #1 SMP PREEMPT_DYNAMIC Thu Jun  5 18:30:46 UTC 2025 x86_64 x86_64 x86_64 GNU/Linux
```

### §0.2 HEAD

```text
bb0249e
chore(deps): bump marked 18.0.0 → 18.0.1 (patch)
```

Planning snapshot: `bb0249e`. Drift: `none`.

### §0.3 Baseline line counts (P2)

```text
  593 scripts/mailbox-lib.mjs
  167 dashboard/server.js
   64 dashboard/src/api.js
 1554 dashboard/src/App.jsx
  777 local-claude-codex-mailbox-workflow.md
 3155 total
```

Drift vs plan baseline: `scripts/mailbox-lib.mjs 593 Δ0 PASS; dashboard/server.js 167 Δ0 PASS; dashboard/src/api.js 64 Δ0 PASS; dashboard/src/App.jsx 1554 Δ0 PASS; local-claude-codex-mailbox-workflow.md 777 Δ0 PASS`.

### §0.4 Pre-edit tree

```text
 M scripts/mailbox.mjs
?? docs/codex-tasks/mailbox-card-append-note-planning-audit.md
?? docs/codex-tasks/mailbox-card-append-note-report.md
?? docs/codex-tasks/mailbox-card-append-note.md
```

### §0.5 P3 empirical reproducer

```text
data equal: true
body has ---: true
```

Verdict: `PASS`.

### §0.6 P4 baseline build

```text
computing gzip size...
dist/index.html                  0.39 kB │ gzip:  0.27 kB
dist/assets/index-CbJF3hqv.js  224.54 kB │ gzip: 69.04 kB

✓ built in 614ms
```

Verdict: `PASS`.

### §0.7 WORKFLOW_ROOT

```text
/mnt/e/Project/workflow
```

---

## §1 Changes applied

### Change 1 — `scripts/mailbox-lib.mjs`

Diff (git diff -w):

```diff
diff --git a/scripts/mailbox-lib.mjs b/scripts/mailbox-lib.mjs
index d4e0c00..56bbb4f 100644
--- a/scripts/mailbox-lib.mjs
+++ b/scripts/mailbox-lib.mjs
@@ -197,6 +197,42 @@ export function validateRelativeInboxPath(relativePath, mailboxRoot) {
   };
 }
 
+export function validateRelativeMessagePath(relativePath, mailboxRoot) {
+  const trimmed = sanitizeString(relativePath).replace(/\\/g, "/");
+
+  if (!trimmed) {
+    throw new ClientError(400, "relativePath is required");
+  }
+
+  if (path.isAbsolute(trimmed) || trimmed.includes("..")) {
+    throw new ClientError(400, "relativePath must stay inside mailbox buckets");
+  }
+
+  if (
+    !trimmed.startsWith("to-claude/") &&
+    !trimmed.startsWith("to-codex/") &&
+    !trimmed.startsWith("archive/")
+  ) {
+    throw new ClientError(
+      400,
+      'relativePath must start with "to-claude/", "to-codex/", or "archive/"'
+    );
+  }
+
+  const resolvedPath = path.resolve(mailboxRoot, trimmed);
+  const mailboxPrefix = `${mailboxRoot}${path.sep}`;
+
+  if (!resolvedPath.startsWith(mailboxPrefix)) {
+    throw new ClientError(400, "relativePath escapes mailbox root");
+  }
+
+  return {
+    bucketName: trimmed.split("/", 1)[0],
+    relativePath: normalizePath(trimmed),
+    absolutePath: resolvedPath
+  };
+}
+
 export function validateResolution(resolution) {
   const nextResolution = sanitizeString(resolution) || "answered";
 
@@ -210,6 +246,51 @@ export function validateResolution(resolution) {
   return nextResolution;
 }
 
+export async function appendNoteToMessageFile({
+  relativePath,
+  note,
+  mailboxRoot
+}) {
+  const { absolutePath, relativePath: normalizedPath } =
+    validateRelativeMessagePath(relativePath, mailboxRoot);
+  const trimmedNote = typeof note === "string" ? note.trim() : "";
+
+  if (!trimmedNote) {
+    throw new ClientError(400, "note is required");
+  }
+
+  if (trimmedNote.length > 4000) {
+    throw new ClientError(400, "note must be 4000 characters or fewer");
+  }
+
+  const raw = await fs.readFile(absolutePath, "utf8");
+  const parsed = matter(raw);
+  const existingContent = parsed.content.replace(/\s+$/, "");
+  const appendedAt = toUtcTimestamp();
+  const appendedBlock = [
+    "",
+    "",
+    "---",
+    "",
+    `**User note · ${appendedAt}**`,
+    "",
+    trimmedNote,
+    ""
+  ].join("\n");
+  const nextContent = existingContent + appendedBlock;
+
+  await fs.writeFile(
+    absolutePath,
+    matter.stringify(nextContent, parsed.data),
+    "utf8"
+  );
+
+  return {
+    relativePath: normalizePath(normalizedPath),
+    appendedAt
+  };
+}
+
 export async function collectMarkdownFiles(directory, recursive) {
   let entries;
 
```

Functions added: `validateRelativeMessagePath`, `appendNoteToMessageFile`.

### Change 2 — `dashboard/server.js`

```diff
diff --git a/dashboard/server.js b/dashboard/server.js
index 5420ce5..8e30e21 100644
--- a/dashboard/server.js
+++ b/dashboard/server.js
@@ -1,7 +1,8 @@
 import express from "express";
 import {
-  collectProjectValues,
   archiveMessageFile,
+  appendNoteToMessageFile,
+  collectProjectValues,
   ClientError,
   defaultMailboxRoot,
   filterMessagesByProject,
@@ -162,6 +163,39 @@ app.post("/api/archive", async (request, response) => {
   }
 });
 
+app.post("/api/notes", async (request, response) => {
+  try {
+    const note = sanitizeString(request.body?.note);
+    const appended = await appendNoteToMessageFile({
+      relativePath: request.body?.relativePath,
+      note,
+      mailboxRoot
+    });
+
+    response.status(201).json({
+      ok: true,
+      relativePath: appended.relativePath,
+      appendedAt: appended.appendedAt
+    });
+  } catch (error) {
+    if (sendClientError(response, error)) {
+      return;
+    }
+
+    if (error && error.code === "ENOENT") {
+      response.status(404).json({
+        error: "Message file not found"
+      });
+      return;
+    }
+
+    response.status(500).json({
+      error: "Failed to append note",
+      details: error instanceof Error ? error.message : String(error)
+    });
+  }
+});
+
 app.listen(port, host, () => {
   console.log(`Server listening on ${host}:${port}`);
 });
```

### Change 3 — `dashboard/src/api.js`

```diff
diff --git a/dashboard/src/api.js b/dashboard/src/api.js
index e4d96ca..c4049ac 100644
--- a/dashboard/src/api.js
+++ b/dashboard/src/api.js
@@ -62,3 +62,18 @@ export async function archiveMessage({ relativePath, resolution }) {
 
   return parseJsonResponse(response, `Archive API returned ${response.status}`);
 }
+
+export async function postNote({ relativePath, note }) {
+  const response = await fetch("/api/notes", {
+    method: "POST",
+    headers: {
+      "Content-Type": "application/json"
+    },
+    body: JSON.stringify({
+      relativePath,
+      note
+    })
+  });
+
+  return parseJsonResponse(response, `Notes API returned ${response.status}`);
+}
```

### Change 4 — `dashboard/src/App.jsx`

```diff
diff --git a/dashboard/src/App.jsx b/dashboard/src/App.jsx
index fd9bf39..7400297 100644
--- a/dashboard/src/App.jsx
+++ b/dashboard/src/App.jsx
@@ -1,5 +1,5 @@
 import { useEffect, useEffectEvent, useRef, useState } from "react";
-import { archiveMessage, fetchMessages, postReply } from "./api.js";
+import { archiveMessage, fetchMessages, postNote, postReply } from "./api.js";
 
 const pollIntervalMs = 3000;
 const emptyData = {
@@ -60,7 +60,16 @@ const translations = {
     themeDark: "Тёмная",
     themeAuto: "Авто",
     soundMute: "Выключить звук уведомлений",
-    soundUnmute: "Включить звук уведомлений"
+    soundUnmute: "Включить звук уведомлений",
+    addNote: "Добавить заметку",
+    addingNote: "Отправка...",
+    noteLabel: "Заметка от пользователя",
+    notePlaceholder: "Добавьте свой комментарий к карточке...",
+    noteHint:
+      "Заметка дописывается в конец сообщения как user-блок. Оригинальное сообщение агента не редактируется.",
+    sendNote: "Сохранить заметку",
+    noteBodyError: "Текст заметки обязателен.",
+    noteTooLong: "Заметка не может превышать 4000 символов."
   },
   en: {
     eyebrow: "Local mailbox dashboard",
@@ -113,7 +122,16 @@ const translations = {
     themeDark: "Dark",
     themeAuto: "Auto",
     soundMute: "Mute notification sound",
-    soundUnmute: "Unmute notification sound"
+    soundUnmute: "Unmute notification sound",
+    addNote: "Add note",
+    addingNote: "Saving...",
+    noteLabel: "User note",
+    notePlaceholder: "Add your comment to the card...",
+    noteHint:
+      "Notes are appended to the end of the message as a user block. The original agent message is not edited.",
+    sendNote: "Save note",
+    noteBodyError: "Note body is required.",
+    noteTooLong: "Note must be 4000 characters or fewer."
   }
 };
 
@@ -974,23 +992,31 @@ function getReplyTarget(message) {
 
 function MessageCard({
   activeAction,
+  isNoteOpen,
   isReplyOpen,
   lang,
   message,
   onArchive,
+  onCancelNote,
   onCancelReply,
+  onNoteBodyChange,
+  onOpenNote,
   onOpenReply,
   onReplyBodyChange,
+  onSendNote,
   onSendReply,
+  noteBody,
   replyBody,
   showActions,
   t
 }) {
   const replyTarget = getReplyTarget(message);
+  const isNoting = activeAction === `note:${message.relativePath}`;
   const isReplying = activeAction === `reply:${message.relativePath}`;
   const isArchiving = activeAction === `archive:${message.relativePath}`;
   const disableArchive = Boolean(activeAction);
   const disableReply = Boolean(activeAction) || !replyTarget;
+  const disableNote = Boolean(activeAction) || isNoteOpen;
 
   const isArchived = !showActions;
 
@@ -1051,9 +1077,9 @@ function MessageCard({
         />
       ) : null}
 
+      <div className="actionRow">
         {showActions ? (
           <>
-          <div className="actionRow">
             <button
               className="cardButton cardButton--primary"
               disabled={disableReply}
@@ -1074,9 +1100,22 @@ function MessageCard({
             >
               {isArchiving ? t.archiving : t.archiveButton}
             </button>
+          </>
+        ) : null}
+        <button
+          className="cardButton cardButton--secondary"
+          disabled={disableNote}
+          onClick={() => {
+            onOpenNote(message);
+          }}
+          type="button"
+        >
+          {isNoting ? t.addingNote : t.addNote}
+        </button>
       </div>
 
-          {isReplyOpen ? (
+      {showActions && isReplyOpen ? (
+        <>
           <form
             className="replyForm"
             onSubmit={(event) => {
@@ -1117,9 +1156,49 @@ function MessageCard({
               </button>
             </div>
           </form>
-          ) : null}
         </>
       ) : null}
+
+      {isNoteOpen ? (
+        <form
+          className="replyForm"
+          onSubmit={(event) => {
+            event.preventDefault();
+            onSendNote(message);
+          }}
+        >
+          <label className="replyLabel" htmlFor={`note-${message.relativePath}`}>
+            {t.noteLabel}
+          </label>
+          <textarea
+            className="replyTextarea"
+            id={`note-${message.relativePath}`}
+            onChange={(event) => {
+              onNoteBodyChange(event.target.value);
+            }}
+            placeholder={t.notePlaceholder}
+            value={noteBody}
+          />
+          <p className="replyHint">{t.noteHint}</p>
+          <div className="replyActions">
+            <button
+              className="cardButton cardButton--primary"
+              disabled={Boolean(activeAction)}
+              type="submit"
+            >
+              {isNoting ? t.addingNote : t.sendNote}
+            </button>
+            <button
+              className="cardButton cardButton--ghost"
+              disabled={Boolean(activeAction)}
+              onClick={onCancelNote}
+              type="button"
+            >
+              {t.cancel}
+            </button>
+          </div>
+        </form>
+      ) : null}
     </article>
   );
 }
@@ -1132,6 +1211,8 @@ export default function App() {
   const [lastUpdated, setLastUpdated] = useState("");
   const [replyTargetPath, setReplyTargetPath] = useState("");
   const [replyBody, setReplyBody] = useState("");
+  const [noteTargetPath, setNoteTargetPath] = useState("");
+  const [noteBody, setNoteBody] = useState("");
   const [activeAction, setActiveAction] = useState("");
   const [availableProjects, setAvailableProjects] = useState([]);
   const [lang, setLang] = useState(() =>
@@ -1301,6 +1382,8 @@ export default function App() {
 
   const openReply = useEffectEvent((message) => {
     setError("");
+    setNoteTargetPath("");
+    setNoteBody("");
     setReplyTargetPath(message.relativePath);
     setReplyBody("");
   });
@@ -1314,6 +1397,23 @@ export default function App() {
     setReplyBody("");
   });
 
+  const openNote = useEffectEvent((message) => {
+    setError("");
+    setReplyTargetPath("");
+    setReplyBody("");
+    setNoteTargetPath(message.relativePath);
+    setNoteBody("");
+  });
+
+  const cancelNote = useEffectEvent(() => {
+    if (activeAction) {
+      return;
+    }
+
+    setNoteTargetPath("");
+    setNoteBody("");
+  });
+
   const toggleLanguage = useEffectEvent(() => {
     setLang((currentLang) => (currentLang === "ru" ? "en" : "ru"));
   });
@@ -1373,6 +1473,44 @@ export default function App() {
         setReplyTargetPath("");
         setReplyBody("");
       }
+      if (noteTargetPath === message.relativePath) {
+        setNoteTargetPath("");
+        setNoteBody("");
+      }
+      setError("");
+      await refreshMessages();
+    } catch (actionError) {
+      setError(
+        actionError instanceof Error ? actionError.message : String(actionError)
+      );
+      await refreshMessages({ background: true });
+    } finally {
+      setActiveAction("");
+    }
+  });
+
+  const sendNote = useEffectEvent(async (message) => {
+    const trimmed = noteBody.trim();
+
+    if (!trimmed) {
+      setError(t.noteBodyError);
+      return;
+    }
+
+    if (trimmed.length > 4000) {
+      setError(t.noteTooLong);
+      return;
+    }
+
+    setActiveAction(`note:${message.relativePath}`);
+
+    try {
+      await postNote({
+        relativePath: message.relativePath,
+        note: trimmed
+      });
+      setNoteTargetPath("");
+      setNoteBody("");
       setError("");
       await refreshMessages();
     } catch (actionError) {
@@ -1526,15 +1664,23 @@ export default function App() {
                     messages[column.key].map((message) => (
                       <MessageCard
                         activeAction={activeAction}
+                        isNoteOpen={noteTargetPath === message.relativePath}
                         isReplyOpen={replyTargetPath === message.relativePath}
                         key={message.relativePath}
                         lang={lang}
                         message={message}
                         onArchive={archiveInboxMessage}
+                        onCancelNote={cancelNote}
                         onCancelReply={cancelReply}
+                        onNoteBodyChange={setNoteBody}
+                        onOpenNote={openNote}
                         onOpenReply={openReply}
                         onReplyBodyChange={setReplyBody}
+                        onSendNote={sendNote}
                         onSendReply={sendReply}
+                        noteBody={
+                          noteTargetPath === message.relativePath ? noteBody : ""
+                        }
                         replyBody={
                           replyTargetPath === message.relativePath ? replyBody : ""
                         }
```

Substeps done: `4.1, 4.2, 4.3, 4.4, 4.5`.

### Change 5 — `local-claude-codex-mailbox-workflow.md`

```diff
diff --git a/local-claude-codex-mailbox-workflow.md b/local-claude-codex-mailbox-workflow.md
index 53c77e2..0a2b6d2 100644
--- a/local-claude-codex-mailbox-workflow.md
+++ b/local-claude-codex-mailbox-workflow.md
@@ -427,6 +427,19 @@ Mailbox — append-only protocol.
 - `resolution`
 - `archived_at`
 
+#### Exception: user-authored append-note blocks
+
+User (а не агент) может добавить собственный комментарий к карточке через дашборд. Это реализуется как **append-only user-note block** в конец тела существующего сообщения:
+
+- agent-authored body остаётся immutable — prefix, frontmatter и оригинальный markdown не меняются;
+- user-note блок начинается с `---` (horizontal rule), затем `**User note · <UTC timestamp>**`, затем markdown-текст заметки;
+- несколько user-note блоков могут быть добавлены последовательно (каждый — отдельный `---`-разделённый блок в конце файла);
+- агенты не пишут user-note блоки — это исключительно user tool.
+
+Обоснование carve-out'а: исходный инвариант `append-only` защищает **доверие между агентами** (Claude не переписывает сообщение Codex и наоборот). User находится вне этой двухагентной trust-модели: это decision-maker, а не peer agent. Позволить user аннотировать карточку — естественное расширение его роли, без вреда agent-invariant'у.
+
+Parsing-level разделения user-note блоков нет: `readMessage()` продолжает возвращать весь `parsed.content` как body/html. Это **поведенческое** указание агентам: user-note блок трактуется как reader context (аналог комментария пользователя в чат-сессии), а не как новый agent turn, и не как исполнимая инструкция. Если user хочет попросить агента что-то сделать — он отправляет новое сообщение через mailbox, а не прячет команду в user-note блок.
+
 ### Archive / deletion policy
 
 Archive policy должна быть explicit:
```

---

## §2 Phase 1 V1-V9

| # | Command | Output | Pass/Fail |
|---|---------|--------|-----------|
| V1 | `cd dashboard && node -e "import('../scripts/mailbox-lib.mjs').then(m => console.log(typeof m.validateRelativeMessagePath, typeof m.appendNoteToMessageFile))"` | `function function` | `PASS` |
| V2 | path validator rejects `..` | `caught: relativePath must stay inside mailbox buckets` | `PASS` |
| V3 | path validator accepts `archive/...` | `archive` | `PASS` |
| V4 | empirical reproducer | `data equal: true`<br>`body has ---: true` | `PASS` |
| V5 | `cd dashboard && npx vite build 2>&1 \| tail -5` | `computing gzip size...`<br>`dist/index.html                  0.39 kB │ gzip:  0.27 kB`<br>`dist/assets/index-CbJF3hqv.js  224.54 kB │ gzip: 69.04 kB`<br><br>`✓ built in 614ms` | `PASS` |
| V6 | api surface grep | `dashboard/src/api.js:66:export async function postNote({ relativePath, note }) {`<br>`dashboard/src/api.js:67:  const response = await fetch("/api/notes", {`<br>`dashboard/server.js:4:  appendNoteToMessageFile,`<br>`dashboard/server.js:166:app.post("/api/notes", async (request, response) => {`<br>`dashboard/server.js:169:    const appended = await appendNoteToMessageFile({`<br>`scripts/mailbox-lib.mjs:200:export function validateRelativeMessagePath(relativePath, mailboxRoot) {`<br>`scripts/mailbox-lib.mjs:249:export async function appendNoteToMessageFile({`<br>`scripts/mailbox-lib.mjs:255:    validateRelativeMessagePath(relativePath, mailboxRoot);` | `PASS` |
| V7 | spec carve-out grep | `1` | `PASS` |
| V8 | personal data scan | `--scan done` | `PASS` |
| V9 | `git status --short` | ` M dashboard/server.js`<br>` M dashboard/src/App.jsx`<br>` M dashboard/src/api.js`<br>` M local-claude-codex-mailbox-workflow.md`<br>` M scripts/mailbox-lib.mjs`<br>` M scripts/mailbox.mjs`<br>`?? docs/codex-tasks/mailbox-card-append-note-planning-audit.md`<br>`?? docs/codex-tasks/mailbox-card-append-note-report.md`<br>`?? docs/codex-tasks/mailbox-card-append-note.md` | `PASS` |

---

## §3 Phase 2 `[awaits user]`

- P2.1 Dashboard loads, "Add note" button visible: `[awaits user]`
- P2.2 Note submit → 201 → body block rendered: `[awaits user]`
- P2.3 Archive card accepts note: `[awaits user]`
- P2.4 Frontmatter intact in file: `[awaits user]`

---

## §4 Phase 3

N/A.

---

## §5 Discrepancies

| # | Issue | Expected | Observed | Resolution |
|---|-------|----------|----------|------------|
| 1 | Baseline build initially failed before whitelist edits | Pre-flight P4 should pass or execution must STOP | Initial `cd dashboard && npx vite build` failed in WSL with missing Linux native binding `@rolldown/binding-linux-x64-gnu` from rolldown | User authorized one-time environment repair via mailbox. Ran `cd /mnt/e/Project/workflow/dashboard && npm install`, confirmed no tracked `dashboard/package-lock.json` drift remained, re-ran P4 successfully, then continued execution. |

---

## §6 Tools

| Tool | Times |
|------|-------|
| `exec_command` | `25` |
| `apply_patch` | `7` |

---

## §7 Out-of-scope temptations

`Testing /api/notes against live mailbox data was tempting, but plan scope kept runtime agent-mailbox data untouched and Phase 2 visual/runtime confirmation is explicitly [awaits user].`

---

## §8 Self-audit

- [x] 1: P1-P4 pre-flight OK
- [x] 2: Change 1 (lib) applied; grep confirms 2 new exports
- [x] 3: Change 2 (server) applied; grep confirms `/api/notes` route
- [x] 4: Change 3 (api.js) applied; `postNote` exported
- [x] 5: Change 4 (App.jsx) applied; 5 substeps done
- [x] 6: Change 5 (spec carve-out) applied
- [x] 7: V1-V9 recorded verbatim
- [x] 8: V9 whitelist drift clean
- [x] 9: No commit/push performed
- [x] 10: Discrepancies (if any) recorded
- [x] 11: Report §0-§11 filled
- [x] 12: Screenshot / visual confirmation deferred to user (Phase 2)

---

## §9 Final git status

```text
 M dashboard/server.js
 M dashboard/src/App.jsx
 M dashboard/src/api.js
 M local-claude-codex-mailbox-workflow.md
 M scripts/mailbox-lib.mjs
 M scripts/mailbox.mjs
?? docs/codex-tasks/mailbox-card-append-note-planning-audit.md
?? docs/codex-tasks/mailbox-card-append-note-report.md
?? docs/codex-tasks/mailbox-card-append-note.md
```

Expected (execution artifacts):
- `M scripts/mailbox-lib.mjs`
- `M dashboard/server.js`
- `M dashboard/src/api.js`
- `M dashboard/src/App.jsx`
- `M local-claude-codex-mailbox-workflow.md`
- `?? docs/codex-tasks/mailbox-card-append-note{,-planning-audit,-report}.md` (handoff artefacts, not staged)

**Plus** preserved baseline drift recorded in §0.4 (напр. `M scripts/mailbox.mjs` или другие pre-existing M from dirty worktree at handoff start) — остаётся unchanged после execution; plan не трогает.

Any unexpected `M` outside whitelist **и не зафиксированный в §0.4 baseline** → §5 Discrepancies + STOP.

---

## §10 Delivery signal

- [x] All sections filled
- [x] ≥10/12 ✅ in §8
- [x] No commit/push performed

Signature: `Codex`

---

## §11 Notes back

`WSL environment needed one-time repair before execution because rolldown Linux binding was missing. After authorized npm install, build and V1-V9 passed cleanly. Remaining user validation is only Phase 2 visual/runtime confirmation in the dashboard.`
