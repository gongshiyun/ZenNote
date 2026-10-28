# ZenNote Core-Logic Review (read-only audit)

> **Snapshot:** 2026-10-28 ~01:15 (Asia/Shanghai), while a UI-redesign team was concurrently editing
> `src/components/layout/AppShell.tsx`, `Titlebar.tsx`, `FileTree.tsx`, `SearchPanel.tsx`, `StatusBar.tsx`,
> `src/main.tsx`, `src/lib/exportNote.ts`, `src/i18n/*` and the store's appearance slice. Files changed
> repeatedly under the audit at 01:03–01:14, and versions were bumped to 0.9.0 across
> `package.json` / `tauri.conf.json` / `Cargo.toml` at 01:08:38. Line numbers below are the 01:15 snapshot;
> **re-check them before patching** (the UI team is actively editing these files). Findings that live in
> stable modules (`src/lib/*`, `src/services/*`, `src/store/slices/editorSlice.ts`, `src-tauri/src/lib.rs`)
> are unaffected by that churn.
>
> **Scope:** non-UI core — `src/store`, `src/domain`, `src/services`, `src/lib`, `src/hooks`, `src-tauri/src`,
> `tauri.conf.json`, capabilities, `main.tsx` / `App.tsx` / `AppShell.tsx` wiring, and the tests under
> `src/__tests__`. Pure visual/CSS work (owned by the UI team) is excluded.
>
> **Baseline run at audit time (all green):**
> `npm.cmd run lint` → 0 errors, 3 warnings; `npm.cmd run test` → 45 files / **473 tests pass**;
> `npm.cmd run build` (`tsc -b && vite build`) → exit 0 (only chunk-size warnings).
> Rust was **not** compiled here (no rustc/cargo on this machine); Rust findings are from source reading.
> No files under `src/` or `src-tauri/` were modified by this audit.

## Summary

| Count | Severity |
|---|---|
| 1 | P0 |
| 4 | P1 |
| 12 | P2 |
| 9 | P3 |

| ID | Sev | Area | File:line | Problem | Effort |
|---|---|---|---|---|---|
| CORE-01 | **P0** | save/close | `src/lib/saveCoordinator.ts:57-71`, `src/lib/windowClose.ts:18-19` | Exit silently drops unsaved local edits when an external conflict is pending, and can overwrite the external disk version from a stale background cache | M |
| CORE-02 | **P1** | file open | `src/components/filetree/FileTree.tsx:102-113` | Failed/stale open falls back to fabricated `"# <filename>"` content; a later keystroke overwrites the real file | S |
| CORE-03 | **P1** | file ops | `src-tauri/src/lib.rs:123-133`, `FileTree.tsx:161-186` | "Delete" is permanent (`remove_file`/`remove_dir_all`), no trash/undo as PRD/UX require; errors swallowed | M |
| CORE-04 | **P1** | save/close | `src/lib/windowClose.ts:18-35` | A second close request while the first flush is in flight is not `preventDefault()`ed → Tauri destroys the window mid-save | S |
| CORE-05 | **P1** | window | `Titlebar.tsx:123`, `styles/base.css:124-126`, `tauri.conf.json:21` | Frameless window only has CSS `-webkit-app-region: drag`; no `data-tauri-drag-region`/`startDragging()` anywhere → window likely cannot be dragged (**needs confirmation on a real build**) | S |
| CORE-06 | P2 | session restore | `AppShell.tsx:217-222, 234-237, 33-48` | Crash-recovery drafts are restored dirty and auto-saved over newer disk content with no conflict check | M |
| CORE-07 | P2 | external changes | `src/lib/workspaceWatcher.ts:71-90` | External changes to *dirty background* tabs are ignored; deleted background tabs become permanently unopenable with no feedback | M |
| CORE-08 | P2 | shortcuts | `ShortcutsPanel.tsx:29` | `Ctrl+S` is advertised ("save") but no handler exists anywhere | S |
| CORE-09 | P2 | search | `SearchPanel.tsx:78`, `AppShell.tsx:370-373`, `LivePreviewEditor.tsx:252-265` | Search-result "jump to line" and global `Ctrl+H` dispatch `zn-find-open`, which has no listener (dead event; `findPreset` never set) | S |
| CORE-10 | P2 | persistence | `AppShell.tsx:148-171, 329-350`, `tauri.conf.json` | `expandedFolders`, `recentWorkspaces`, panel widths and window bounds/size are never persisted (PRD §3.1/3.2/3.2c/3.9) | M |
| CORE-11 | P2 | export | `exportNote.ts:112-116`, `markdownToHtml.ts:463-466` | HTML export claims to be standalone but images stay `http://asset.localhost/…` URLs — broken outside the app / on another machine (no Base64) | M |
| CORE-12 | P2 | export | `lib.rs:637-687` (`643` early `?`, `685` close), `exportNote.ts:316-407` | Any print error/timeout returns before `webview_window.close()` → leaked invisible window holding a WebView2; temp `.pdf-render.html` can also leak; no paper-size/margin options (PRD §3.6) | M |
| CORE-13 | P2 | file ops / security | `FileTree.tsx:115-186` | New folder/note still use `window.prompt` with no illegal-character, extension or workspace-boundary validation → `..\..\x.md` escapes the workspace; every FS error is swallowed with `catch {}` | M |
| CORE-14 | P2 | app lifecycle | `src-tauri/Cargo.toml` (no single-instance), `lib.rs:915-917`, `AppShell.tsx:87-127` | Second launch / "Open with" starts a second process sharing one WebView2 profile + `localStorage` session and the same notes (last-writer-wins, watcher cross-talk) | M |
| CORE-15 | P2 | updater | `src/lib/updater.ts:96-104` | Install/relaunch path does not flush dirty documents (only the window-close event does) — edits in flight are lost on update restart | S |
| CORE-16 | P2 | search backend | `lib.rs:307-308, 393-415, 437-440` | Rust search silently skips hidden/.gitignore'd files, files > 5 MB, and truncates to 500 hits while the UI presents the list as complete | M |
| CORE-17 | P2 | error recovery | `AppShell.tsx:225-254` | "Workspace folder missing / unreadable" recovery matrix is not implemented on restore: no prompt, recent list not cleaned, no guidance (PRD §3.10) | S |
| CORE-18 | P3 | autosave/errors | `AppShell.tsx:33-48`, `saveCoordinator.ts:28-42`, `StatusBar.tsx:75-79` | No retry after a failed autosave until the next keystroke; `saveError` never auto-clears; image errors are rendered as "保存失败" | S |
| CORE-19 | P3 | shortcuts | `ShortcutsPanel.tsx:56-62`, `livePreviewInteractions.ts:324-330` | Reference panel lists `Ctrl+1…6 / Ctrl+0` headings and `Ctrl+Shift+C` inline code; implementation has neither (`Mod-e` is inline code; source mode has no formatting keymap) | S |
| CORE-20 | P3 | export TOC | `markdownToHtml.ts:203-215, 533-555`, `domain/document.ts:10-43` | TOC ids come from an AST walk (includes Setext headings) but TOC entries come from `parseHeadings()` (ATX only) → anchors shift/mismatch in notes with `===`/`---` headings | S |
| CORE-21 | P3 | dead code | several (see §Dead code) | `useMermaid` (+2 tests), `copyImageToClipboard`/`readImageBytes`/`resolveImagePath`, `clearWorkspaceSearchCache`, `estimateReadingTime`, `AppConfig`, `isExportWindow`, Rust `move_file`, unused `serde_json` / shell / fs plugin | S |
| CORE-22 | P3 | security hardening | `capabilities/default.json:21-25`, `tauri.conf.json:29-34`, `lib.rs` commands | Unused `shell:`/`fs:` plugins+permissions, `assetProtocol.scope: ["**"]`, and every FS command accepts any absolute path — unnecessary attack surface if markup sanitisation ever fails | M |
| CORE-23 | P3 | Windows paths | `domain/filesystem.ts:23-26`, `lib/filePaths.ts:20-32` | All path comparisons are case/separator naive; drive-letter/case differences misclassify "inside workspace" and skip rename/delete remaps | S |
| CORE-24 | P3 | memory/storage | `services/fileService.ts:25-40`, `AppShell.tsx:148-171` | `lastWritten` map grows unbounded; every 5 s the whole session (incl. full draft text) is JSON-stringified to `localStorage` (quota loss > ~5 MB, main-thread jank on big notes) | S |
| CORE-25 | P3 | export UX | `exportNote.ts:201-214` | HTML export wraps everything in `catch { /* */ }`: failures are completely silent, contradicting the error matrix | S |
| CORE-26 | P3 | images | `services/imageService.ts:4, 14-23` | Images are stored in `assets/` next to the note, but PRD §3.3.6 requires `images/` at the workspace root; no migration path | S |

---

## P0 — detailed findings

### CORE-01 (P0) — Exit can silently discard conflict edits and overwrite the external version

**Problem.** Two conflict-related defects combine in the close/flush path:

1. `collectDirtySnapshots()` **excludes** the current document entirely while `externalConflict` points at it.
   Since autosave also refuses to save in that state (`saveCurrentDocument` returns `false`), the local
   edits exist only in memory. `hasDirtyDocuments()` is then `false`, so the close handler does not even
   `preventDefault()` — the window closes and the local edits are gone with no prompt.
2. The same function **does not** apply that conflict filter to the cached background documents loop. If the
   user hit a conflict on A, then switched to B (A's dirty state is cached), closing the app flushes A's
   cached text over the *external* version — without ever asking the user, i.e. it destroys the external
   edits the conflict banner existed to protect.

**Evidence.**

```ts
// src/lib/saveCoordinator.ts:57-71
function collectDirtySnapshots(): DirtySnapshot[] {
  const s = useStore.getState();
  const docs = new Map<string, string>();
  if (
    s.currentFilePath &&
    s.isDirty &&
    s.externalConflict?.path !== s.currentFilePath   // (1) current conflicted doc omitted
  ) {
    docs.set(s.currentFilePath, s.content);
  }
  for (const [path, state] of s.fileStates) {
    if (state.dirty) docs.set(path, state.content);  // (2) conflicted background doc NOT filtered
  }
  ...
```

```ts
// src/lib/windowClose.ts:18-19
if (allowClose || closing) return;
if (!deps.hasDirtyDocuments()) return;   // true for case (1) -> window closes normally
```

**Impact / repro.**
1. Open `a.md`, type; in another editor change `a.md` on disk → yellow banner appears (conflict).
2. Close the window with the titlebar ✕. → App exits, local edits lost, no prompt (only whatever the ≤5 s
   session-draft interval happened to capture survives; if the same file had been cached by an earlier tab
   switch, the flush instead writes the stale cache over the external version).
3. Variant: with the banner visible, click another tab (`b.md`), then close the app → `a.md` on disk is
   overwritten with the local text; the external version is destroyed without confirmation.

**Fix.**
- Treat *any* unresolved conflict as dirty for close purposes (current **and** cached docs): in
  `collectDirtySnapshots` also include the conflicted current doc (or expose `hasUnresolvedConflict()`
  and have `hasDirtyDocuments()` return true).
- Make `flushDirtyDocuments()` either skip conflicted *cached* docs or prompt/abort per conflicted path
  instead of writing them. Keep a stable `conflicts: Map<path, diskContent>` rather than a single
  `externalConflict` field, so background conflicts survive tab switches.
- On close with unresolved conflicts, offer "reload external / keep local / cancel" instead of a binary
  confirm.

**Tests to add** (extend `saveCoordinator.test.ts`, `windowClose.test.ts`):
- dirty current file + `externalConflict` → `hasDirtyDocuments() === true`; close handler calls `preventDefault()`.
- dirty cached background doc with conflict → `flushDirtyDocuments()` does **not** call `writeFile` for it.
- conflict resolved with "keep local" → autosave writes once and clears `isDirty`.

---

## P1 — detailed findings

### CORE-02 (P1) — "Open failed" fallback fabricates content and can overwrite the real file

**Problem.** `FileTree.openFile` treats *any* `false` return from `openDocumentWithSave` as "file is empty /
missing" and opens a synthetic `# <filename>` document. `openDocument()` returns `false` not only when
`readFile` throws (permission, locked, non-UTF-8, deleted) but also when a newer open superseded it
(`documentRequestId` race). The synthetic document is inserted with `isDirty === false`; the first keystroke
marks it dirty and the autosave then writes the fabricated text over the real file.

**Evidence.**

```ts
// src/components/filetree/FileTree.tsx:102-113
const openFile = useCallback(async (filePath: string) => {
  setSelectedFile(filePath);
  const s = useStore.getState();
  const opened = await openDocumentWithSave(filePath, undefined, { sourceMode: s.defaultSourceMode });
  if (!opened) {
    await openDocumentWithSave(
      filePath,
      "# " + (filePath.split(/[\\/]/).pop() || "") + "\n\n",  // fabricated content
      { sourceMode: s.defaultSourceMode },
    );
  }
}, [setSelectedFile]);
```

`openDocument` returns `false` in three cases (`src/store/slices/editorSlice.ts:166-186`): read error,
stale request (`documentRequestId` mismatch), and it never distinguishes them.

**Impact / repro.**
- Open a non-UTF-8/locked `.md` (PRD §3.10 explicitly lists this case) → editor shows `# filename` as if
  that were the note; typing once overwrites the original bytes on the next autosave.
- Double-click two files quickly (or click A then B): A's read may be superseded → fallback re-opens A with
  synthetic content, stealing focus from B; typing overwrites A.

**Fix.** Return a discriminated result (`{ok:true} | {ok:false, reason:"not-found"|"unreadable"|"stale"}`)
from `openDocument`; only show a **read-only** "file unreadable / deleted" state (reuse `externalConflict`
reason `deleted`) and never attach `<p>`-free synthetic content. For stale requests, do nothing. If a new
note is desired, create it through `createFile` first.

**Tests to add** (`FileTree.test.tsx`): `readFile` rejects → no `setCurrentFile` with `"# name"`, no
autosave write; superseded open → current file stays B.

### CORE-03 (P1) — Delete is permanent; no trash, no undo, and failures are silent

**Problem.** PRD §3.2a / UX-REVIEW P0-4 require moving to the recycle bin with a 3 s "撤销" action. The
Rust command uses `fs::remove_file` / `fs::remove_dir_all` (irreversible for folders), the `trash` crate
mentioned in `TECH-DESIGN.md` is not a dependency, and the frontend catches every error and does nothing.

**Evidence.**

```rust
// src-tauri/src/lib.rs:123-133
#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() { return Err("文件不存在".into()); }
    if p.is_dir() {
        fs::remove_dir_all(&path).map_err(|e| format!("删除文件夹失败: {}", e))
    } else {
        fs::remove_file(&path).map_err(|e| format!("删除文件失败: {}", e))
    }
}
```

```ts
// src/components/filetree/FileTree.tsx:179-185
if (!confirm("Delete \"" + name + "\"?")) return;
try {
  await fs.deleteFile(path);
  invalidateWorkspaceSearchCache(path);
  removeWorkspacePaths(path);
  await refreshTree();
} catch { /* */ }                       // permission/locked errors vanish
```

**Impact.** A single confirmed click permanently destroys notes/folders (recursively); a failed delete
looks like a no-op; no undo despite i18n strings already existing (`filetree.delete...`). Requirement gap
and elevated data-loss risk.

**Fix.** Add `trash = "5"` (or `trash = "4"`) to `Cargo.toml`, implement `delete_file` via
`trash::delete(path)`; return the trashed path so the frontend can offer a 3 s undo. Wire remove errors to
`setSaveError`/status bar. Also drop `confirm()` in favour of the planned inline/dialog UI.

**Tests to add:** Rust unit test using a temp dir (trash on CI is unreliable → inject a `trash_fn`
abstraction and assert it is used for files and folders); FileTree test that a rejected delete shows an
error and keeps the tab.

### CORE-04 (P1) — Second close request closes the window while the first flush is still running

**Problem.** During the flush the guard sets `closing = true`; if the user clicks ✕ again (or presses
Alt+F4 twice), the handler returns **without** `event.preventDefault()`. Tauri's `onCloseRequested`
wrapper destroys the window whenever `preventDefault()` was not called, so the second click terminates the
app in the middle of `flushDirtyDocuments()`.

**Evidence.**

```ts
// src/lib/windowClose.ts:14-33
let allowClose = false;
let closing = false;
return async (event: CloseEventLike): Promise<void> => {
  if (allowClose || closing) return;      // <-- no preventDefault while closing
  if (!deps.hasDirtyDocuments()) return;
  event.preventDefault();
  closing = true;
  try {
    const result = await deps.flushDirtyDocuments();
    ...
```

```js
// node_modules/@tauri-apps/api/window.js:1632-1639 (behavior of onCloseRequested)
return this.listen(TauriEvent.WINDOW_CLOSE_REQUESTED, async (event) => {
  const evt = new CloseRequestedEvent(event);
  await handler(evt);
  if (!evt.isPreventDefault()) {
    await this.destroy();
  }
});
```

**Impact / repro.** Dirty note + a slow/failing write (the coordinator retries after 500 ms, so a locked
file takes ≥ 500 ms) → double-click ✕ → app exits before the save completes; `lastSavedAt`/draft may be
stale for up to 5 s. Data loss risk under exactly the conditions the guard is meant to handle.

**Fix.** `if (closing) { event.preventDefault(); return; }` (ignore repeats), and only allow natural close
after the handler itself decided. Add a "saving…" state to the titlebar close button if desired.

**Tests to add:** call the handler twice concurrently; assert second call `preventDefault` was called and
`destroy` only after the first flush resolves.

### CORE-05 (P1, needs confirmation) — Custom titlebar has no Tauri drag region

**Problem.** `decorations: false` means the OS titlebar is gone; dragging must be provided by Tauri. The
code only applies CSS `-webkit-app-region: drag`, and there is **no** `data-tauri-drag-region` attribute
and **no** `getCurrentWindow().startDragging()` call anywhere in `src/` (verified by grep). Chromium's CSS
app-region is not wired to the native window by WebView2; Tauri's own drag helper uses the data attribute
(which is why the capability already grants `core:window:allow-start-dragging` and
`core:window:allow-internal-toggle-maximize`).

**Evidence.**

```tsx
// src/components/layout/Titlebar.tsx:123
<div className="zn-titlebar titlebar-drag" onDoubleClick={handleDoubleClick}>
```

```css
/* src/styles/base.css:124-130 */
.titlebar-drag { -webkit-app-region: drag; app-region: drag; }
.titlebar-no-drag { -webkit-app-region: no-drag; app-region: no-drag; }
```

`src-tauri/tauri.conf.json:21` → `"decorations": false`.
`grep -r "data-tauri-drag-region|startDragging" src/` → **no matches** (only the Tauri api package has
`startDragging`).

**Impact if confirmed.** On Windows the window cannot be moved at all (only minimize/maximize/close and
Win+Arrow work). This is a P0-level usability defect for a desktop app; severity P1 here only because it
could not be executed in this environment.

**How to confirm.** Build/run the Tauri app and drag the titlebar. **Fix.** Add
`data-tauri-drag-region` to the titlebar root (and keep `titlebar-no-drag` on interactive children), or add
an `onMouseDown` → `getCurrentWindow().startDragging()` fallback. Verify double-click still maximizes
(`onDoubleClick` may then double-toggle — remove the JS double-click when the attribute is added).

**Tests to add:** component test asserting the root has `data-tauri-drag-region` (cheap regression pin);
manual smoke step in the release checklist.

---

## P2 — findings (evidence and fix)

### CORE-06 (P2) — Restored crash drafts auto-save over newer disk content

`AppShell.tsx:217-222` restores every `backgroundDrafts`/`draft` entry into `fileStates` with `dirty: true`;
`:234-237` sets the current file's content from the draft and calls `setDirty(true)`. The autosave effect
(`AppShell.tsx:33-48`) then fires 500 ms later and writes the draft — **without reading/checking the current
disk content**. If the file changed while the app was closed (or after a crash), the stale draft silently
wins. Fix: on restore, read disk content first and surface the `externalConflict` banner ("local draft vs
disk") whenever they differ, instead of marking dirty blindly. Tests: restore with draft ≠ disk → no write
until the user resolves.

### CORE-07 (P2) — Dirty background tabs ignore external changes; deleted background tabs can't open

`workspaceWatcher.ts:79-90`:

```ts
if (p === s.currentFilePath) { ...setExternalConflict... }
else {
  const st = s.fileStates.get(p);
  if (!st || st.dirty || st.content === disk) continue;   // dirty tab: change discarded
  ...
}
```

External modifications to a dirty background tab are silently dropped; when that tab is next activated the
autosave writes the old local content over them. In the deleted branch (`:65-73`) only the current file gets
a conflict; a deleted background tab stays in `openTabs`, and clicking it (`TabBar` → `openDocumentWithSave`)
just fails silently because `readFile` throws and the result is ignored. Fix: store per-path conflicts for
background tabs too (see CORE-01) and prune deleted tabs with a status-bar message.

### CORE-08 (P2) — `Ctrl+S` advertised but not implemented

`ShortcutsPanel.tsx:29` shows `{ label: sc.save, keys: "Ctrl+S" }`, but no `key === "s"` / `Mod-s` binding
exists in `AppShell` or either editor keymap (verified by grep). With autosave the practical impact is
small, but users pressing it get nothing (or WebView2 default behavior). Fix: add a global `Ctrl+S` handler
that awaits `saveCurrentDocument()` and surfaces the result; bind it in CodeMirror as `Mod-s` and
`preventDefault`.

### CORE-09 (P2) — Search result line jump is dead code (`zn-find-open` has no listener)

`SearchPanel.tsx:78` dispatches `new CustomEvent("zn-find-open", { detail: { query, line: r.line } })` after
opening the file; `AppShell.tsx:370-373` does the same for global `Ctrl+H`. Grep finds **no
`addEventListener("zn-find-open", …)` anywhere** in `src/` (only dispatchers and the demo harness in
`src/dev/demo.ts:663`). In `LivePreviewEditor.tsx:252-265`, `findPreset` is
declared, `void setFindPreset` silences the linter, and `setFindPreset(null)` is the only assignment — the
`preset` prop is therefore always `null`. Consequence: PRD §3.2b "click result → jump to matching line" does
not work, and `Ctrl+H` from a non-editor focus does nothing. Fix: add one window listener in
`LivePreviewEditor`/`SourceEditor` (or a shared hook) that opens the find bar and seeks to `detail.line`.

### CORE-10 (P2) — Session/UI state persistence incomplete

`AppShell.tsx:148-171` persists workspace, tabs, drafts, appearance and editor prefs — but **not**
`expandedFolders`, `recentWorkspaces`, panel widths, or window bounds. Panel resize still only mutates DOM
styles (`AppShell.tsx:329-350`) with no stored width, so widths reset on reload/restart;
`tauri.conf.json` window is fixed 1200×800/center with no `outer_position`/maximized persistence or
off-screen fallback (PRD §3.2/3.2c/3.9, UX P0-2/P1-8). Fix: persist these in the session (expanded folders,
recents, widths) and add a small Rust command (or `tauri-plugin-window-state`) for window geometry with a
monitor-intersection fallback.

### CORE-11 (P2) — HTML export is not self-contained (images are not embedded)

PRD §3.6 requires "独立 HTML 文件，内嵌样式和图片（Base64）". `exportNote.ts:114-116` resolves images to
Tauri asset URLs:

```ts
resolveImage: src => { try { return resolveImageUrl(src, currentFilePath); } catch { return src; } },
```

which produces `http://asset.localhost/C:/…` (see `services/imageService.ts:34-47`). The saved `.html`
therefore renders images only while opened inside the app's WebView; in a browser/another machine they are
broken. Fix: in the export path, read image bytes (`read_file_binary`) and inline `data:<mime>;base64,…`
(also for bytes referenced by raw HTML `<img>`); add a size cap/fallback to the original reference.

### CORE-12 (P2) — PDF export error path leaks an invisible WebView2 window; no page options

`lib.rs:637-687`: on success the window is closed at `:685`, but `fire_print_to_pdf(...)?` at `:643`
(and the `get_webview_window(...)?` / `make_window_transparent` error paths) returns **before** the close.
The leaked window was made layered/alpha=1 and shown, so it stays in the process (and in the taskbar-less
window list) until the app exits. The frontend also removes the temp file but cannot close the window
(`exportNote.ts:336-407` only reports errors). Fix: wrap the body so `webview_window.close()` always runs
(e.g. drop guard), and close the window from the frontend on `export_pdf` rejection by label
(`getCurrentWindow`/`WebviewWindow.getByLabel(...).close()`), plus a timeout. Separately, PRD §3.6 asks for
A4/Letter + margins: `EXPORT_STYLES` hard-codes `@page{margin:14mm}` and `SetMargin*` is 0, so the option
does not exist.

### CORE-13 (P2) — Inline file operations: new/new-folder still `prompt()`s, no validation, errors hidden

`FileTree.tsx:115-137` still uses `prompt("", untitled+".md")` / `prompt("", folderName)` for new note/folder;
rename was just converted to an inline editor by the concurrent UI work (`:139-159`), but neither path
validates `\ / : * ? " < > |`, enforces a `.md` extension, or checks the workspace boundary: typing
`..\..\evil.md` in a prompt or rename draft makes `joinPath`/`replaceFileName` operate outside the workspace
(Rust `create_file`/`rename_file` will happily create/rename at any absolute path). Delete is still a
`confirm()` (`:179`). Every operation is wrapped in `catch { /* */ }` (`:125, :136, :158, :185`), so
EEXIST/EACCES/EIO are invisible. Fix: inline inputs for new note/folder too, validation + a
`isWithinWorkspace()` guard (normalised/case-insensitive, see CORE-23), and surface errors via
`setSaveError`.

### CORE-14 (P2) — No single-instance guard

`Cargo.toml` has no `tauri-plugin-single-instance`, yet "Open with" handling (`lib.rs:914-917`,
`AppShell.tsx:87-127`) assumes a fresh process per file. Launching a `.md` while ZenNote is running creates a
second process with the same WebView2 user-data profile/`localStorage`: two session writers, two watchers
on the same workspace, last-writer-wins saves. Fix: add `tauri-plugin-single-instance`, forward the file
argument to the running instance (emit to main window), and focus it.

### CORE-15 (P2) — Update install/relaunch does not flush dirty documents

`updater.ts:96-104` calls `update.install()` then `relaunch()`. The close-save guard
(`AppShell.tsx:261-286`) only listens to `tauri://close-requested`; `install()` terminates the process on
Windows without that event, so `<500 ms` edits and any unresolved-conflict content are lost. Fix: make
`installUpdate` call `flushDirtyDocuments()` first and abort on failure, then show the same
save-failed confirm.

### CORE-16 (P2) — Workspace search silently returns incomplete results

`search_workspace` uses `WalkBuilder::new(root)` defaults (`lib.rs:393`): hidden entries and
`.gitignore`/`.ignore` matches are skipped, even when `showHiddenFiles` is on in the tree; files
`> MAX_SEARCHED_FILE_SIZE` (5 MB, `:308`) are skipped; results are capped at 500 (`:307`). The UI
(`SearchPanel.tsx` footer) prints `{results.length} 搜索结果` as if complete. Fix: pass `hidden(false)` /
`git_ignore(false)` from an option (or mirror the file-tree visibility setting), report truncation/oversize
skips, and raise/parametrise the cap.

### CORE-17 (P2) — Restore-time error matrix not implemented

`AppShell.tsx:225-254`: when `openWorkspace(savedPath)` rejects (folder deleted/moved/no permission) the
`.catch` only clears the loading flag → the user sees an empty tree and no explanation; the recent list is
never cleaned and no folder picker is offered (PRD §3.10, UX P0-6). Fix: on restore failure, detect
`ENOENT` vs permission, show a modal with "文件夹不存在/无权限" + "选择新工作区", and `removeRecentWorkspace`.

---

## P3 — findings

| ID | Evidence | Notes / fix |
|---|---|---|
| CORE-18 | `AppShell.tsx:33-48`; `saveCoordinator.ts:28-42`; `StatusBar.tsx:75-79`; `imageUpload.ts:24,38` | A failed save is retried once after 500 ms inside `saveDocumentSnapshot`; if that also fails, `useAutoSave` never retries until the next edit (deps unchanged). `saveError` is cleared only by a later successful save, and image errors go through the same field → "保存失败: 不支持的图片格式". Add a bounded retry timer (e.g. 3 s, PRD §3.10) and a separate transient-notice channel. |
| CORE-19 | `ShortcutsPanel.tsx:56-62`; `livePreviewInteractions.ts:324-330`; `SourceEditor.tsx` keymap | Panel advertises `Ctrl+1…6 / Ctrl+0` and `Ctrl+Shift+C`, but only `Mod-b/i/e/Shift-x/Shift-h/k` are bound (in Live Preview only; source mode has none). Reconcile panel with reality or implement the missing keymap. |
| CORE-20 | `markdownToHtml.ts:203-215` (`assignHeadingIds` walks AST incl. `SetextHeading1/2`); `:533-555` (`emitToc` uses `parseHeadings`, ATX-only); `domain/document.ts:10-43` | In a note mixing `Title\n====` with `# Title2`, TOC `href`s point at the wrong headings (order/ids shift). Build the TOC from the same pre-assigned id list (or from the AST walk) and add a mixed-setext TOC test. |
| CORE-21 | see §Dead code | Remove dead symbols/files; keep `useMermaid` only if re-wired (it also uses `securityLevel: "loose"`, which must not be used if it ever becomes live). |
| CORE-22 | `capabilities/default.json:21-25`; `tauri.conf.json:29-34` (scope `**`); `lib.rs` (all commands take raw paths) | Frontend never imports `@tauri-apps/plugin-shell`/`plugin-fs`, yet both plugins are initialised and `shell:default`/`shell:allow-open`/`fs:allow-read/write` are granted. `assetProtocol` is scoped to the whole filesystem. With any future sanitizer regression, `shell.open` + `asset://` become dangerous primitives. Remove unused plugins/permissions; narrow asset scope to workspace root + `$APPLOCALDATA`; optionally validate command paths against an allow-list of workspace roots held in Rust state. |
| CORE-23 | `domain/filesystem.ts:23-26`; `lib/filePaths.ts:20-32` | `isWithinWorkspace`/`remapPathPrefix`/`affectedOpenPaths` use raw `startsWith`: `c:\notes\x.md` vs `C:\Notes` (or `/` vs `\`) are misclassified; rename remaps can be missed. Normalise (lowercase on Windows, unify separators) before comparing; add tests for case/separator variants. |
| CORE-24 | `services/fileService.ts:25-40`; `AppShell.tsx:148-171` | `lastWritten` never evicts (one entry per file ever saved); session JSON includes all dirty drafts and is written every 5 s synchronously → main-thread stalls on 500 KB+ notes and `QuotaExceededError` is swallowed. Evict by LRU/size; debounce the session write to change-only + `requestIdleCallback`, and cap drafts (or move to IndexedDB). |
| CORE-25 | `exportNote.ts:201-214` | `exportToHtml` swallows every failure, unlike `exportToPdf` (toast). Add the same toast/error reporting and a success confirmation. |
| CORE-26 | `services/imageService.ts:4,14-23` | Saves to `<noteDir>/assets/`, PRD §3.3.6 says `<workspaceRoot>/images/`. Confirm the new intended convention and update PRD or implementation; if changing, add a migration for existing references and tests for relative-path resolution. |

---

## Requirement gaps (vs PRD / UX-REVIEW)

| # | Requirement (source) | Current state |
|---|---|---|
| G-1 | Remember last 5 workspaces + show them at startup (PRD §3.1) | In-memory only; `recentWorkspaces` is never persisted and `setRecentWorkspaces` is unused (`fileTreeSlice.ts:62`). Startup restores only the last workspace. |
| G-2 | Expanded folders persisted (PRD §3.2) | Not in the session payload (`AppShell.tsx:147-171`); always collapsed on restart. |
| G-3 | Panel widths 160–480 / 140–360 persisted (PRD §3.2c, UX P0-2) | Hard-coded 240/180 `useState`; drag applies inline styles only. |
| G-4 | Restore window size/position/maximized, off-screen fallback (PRD §3.9) | Always 1200×800 centered from `tauri.conf.json`; no geometry persistence. |
| G-5 | Delete → trash + 3 s undo (PRD §3.2a, UX P0-4) | Permanent recursive delete, no undo (CORE-03). |
| G-6 | Inline new/rename with illegal-char validation, Esc/Enter semantics (PRD §3.2a, UX P0-4) | Rename was converted to an inline editor during this audit (`FileTree.tsx:139-159`), but without char/path validation; new note/folder still use `window.prompt` (CORE-13). |
| G-7 | File tree drag-drop move (PRD §3.2) | Not implemented; Rust `move_file` command exists but no frontend caller. |
| G-8 | Editor context menu: copy/cut/paste/find (UX P1-2); file tree context menu: copy/copy path/open in Explorer (UX P1-2) | Context menus have only new/new-folder/rename/delete. |
| G-9 | First-run welcome: drag folder onto window; "second launch → no welcome" (UX P1-11) | Welcome screen has a button only (no drag-drop); restore path works. |
| G-10 | Error matrix: workspace missing/no permission, disk full, locked file 3 s retry, non-UTF-8 hint, export failure modal, Mermaid timeout (PRD §3.10) | Only generic `saveError` text exists; retry is 500 ms once; read/encoding/export errors are unclassified (see CORE-02/17/25, CORE-18). |
| G-11 | PDF export: A4/US-Letter + margins, Mermaid SVG included (PRD §3.6) | Page size/margins not selectable (`@page 14mm`, zero WebView2 margins). |
| G-12 | Image assets under `<workspace>/images/` (PRD §3.3.6) | `<noteDir>/assets/` (CORE-26). |
| G-13 | `Ctrl+N` creates a note from anywhere (PRD §3.14/3.2a) | Only when focus is inside the file tree (`FileTree.tsx:272-317`), and it uses `prompt`. |
| G-14 | Window title shows current note name (PRD §3.9) | Custom titlebar shows it; the native window title stays `ZenNote` (taskbar). |
| G-15 | "Settings → auto-save delay" 3 s-notification / 3 s retry semantics | See CORE-18. |
| G-16 | UX P1-5 panel focus handling; P1-6 loading skeletons; P2-9 drag-drop file/folder with overlay; P2-3 find "3/15" counter | Not verified in this audit (UI-owned) but the focus/skeleton/drag-overlay behaviour is absent from the core wiring. |

Note: the old Vite-template leftovers (`src/App.css`, `src/index.css`, `src/assets/react.svg|vite.svg|hero.png`)
were removed by the concurrent UI work during this audit; `src/plugins/` still exists as an empty directory
(harmless, remove it).

## Dead code / cleanup

| Item | Location | Status |
|---|---|---|
| `useMermaid` hook (+ its two tests) | `src/hooks/useMermaid.ts`, `src/__tests__/hooks.test.ts:23-50` | **Not imported by the app** (only an explanatory comment in `AppShell.tsx:16`). It initialises mermaid with `securityLevel: "loose"`; delete it (or replace the comment) so the insecure config cannot come back. |
| Image→clipboard feature | `src/services/imageService.ts:52-107` (`copyImageToClipboard`, `readImageBytes`, `resolveImagePath`) | No caller anywhere; the `copy_image_rgba` Rust command is therefore dead too. Delete both sides, or wire a "copy image" menu item. |
| `clearWorkspaceSearchCache` | `src/lib/workspaceSearch.ts:42-45` | Only referenced by tests; `invalidateWorkspaceSearchCache` clears everything. |
| `estimateReadingTime` + `WORDS_PER_MINUTE` duplication | `src/domain/document.ts:96-113`; inline duplicate in `StatusBar.tsx:25-33` | Exported/barrel only, used by tests; StatusBar re-implements it. Call the domain function from StatusBar and drop the duplicate, or remove the export. |
| `AppConfig` interface | `src/domain/types.ts:65-73` | Unused (TECH-DESIGN's config commands were never implemented; persistence is `localStorage`). Delete or implement. |
| `move_file` Rust command | `src-tauri/src/lib.rs:136-145, 953` | Registered but never invoked from the frontend (no drag-drop). Remove or implement G-7. |
| `isExportWindow()` guard | `src/main.tsx:16-20, 56` | The PDF window now loads `file://…pdf-render.html`, never `index.html`, so the guard is unreachable; harmless but misleading — either remove or document why it is kept. |
| Unused crates/plugins | `Cargo.toml:18` (`serde_json` unused in `lib.rs`), `:24-25` (`tauri-plugin-fs`, `tauri-plugin-shell` unused by src), `package.json` (`@tauri-apps/plugin-fs`, `@tauri-apps/plugin-shell` unused) | Remove to shrink the binary and the ACL surface (also CORE-22). |
| `switchTab` public store action | `src/store/slices/editorSlice.ts:51, 249-259` | Only used internally by `removeTabsImpl` and tests; components use `openDocumentWithSave`. Fine to keep internal, but note `switchTab` bypasses the save-on-switch policy if ever used by UI. |

## Verified false alarms / correct behaviour

1. **Updater signing configuration is consistent.** The `plugins.updater.pubkey` in `tauri.conf.json:39`
   is byte-identical to `src-tauri/keys/zennote.key.pub` (152 chars; decoded comment
   `untrusted comment: minisign public key: 4954183BEADE3A3F`), the private key/password are correctly
   gitignored (`.gitignore`: `src-tauri/keys/*`, `!*.key.pub`), and `package.json` / `tauri.conf.json` /
   `Cargo.toml` / `Cargo.lock` were all `0.9.0` at snapshot (they were `0.8.38` when the audit started and
   were bumped consistently at 01:08:38). The `nsis/installer.nsi` header states it is the CLI 2.11.4
   template with a documented upgrade patch, and `tasks/todo.md` records a successful signed v0.8.38
   build (`setup.exe`/`msi`/`exe` + `.sig` + `latest.json`), so the production bundling path is proven.
   `bundle.targets: "all"` + `createUpdaterArtifacts: true` are fine given `TAURI_SIGNING_PRIVATE_KEY` is
   provided at build time.
2. **Every frontend `invoke()` name/argument matches a registered Rust command.** Verified all 20 call
   sites against `generate_handler!` (`lib.rs:941-962`): `read_file`, `read_file_binary`, `path_exists`,
   `write_file`, `create_file`, `create_folder`, `rename_file`, `delete_file`, `open_workspace`, `read_dir`,
   `list_markdown_files`, `watch_workspace`, `unwatch_workspace`, `write_file_binary`, `copy_image_rgba`,
   `search_workspace`, `get_launch_args`, `export_pdf`, `export_debug_log`. camelCase args correctly map to
   snake_case params (`oldPath`→`old_path`, `includeHidden`→`include_hidden`, `caseSensitive`→`case_sensitive`).
3. **Tauri ACL covers what the frontend calls.** `core:window:default` already contains
   `allow-is-maximized` (used by `Titlebar.tsx:81`); explicit `minimize` / `toggle-maximize` / `close` /
   `destroy` / `start-dragging` / `internal-toggle-maximize` are present; `core:webview:allow-create-webview-window`
   + `core:window:allow-create` cover the PDF render window; `process:allow-restart` covers `relaunch()`.
4. **CSP/protocol wiring is coherent.** `asset:` and `http://asset.localhost` are allowed for the
   `img-src`/`default-src`; `protocol-asset` + `webview-data-url` features are enabled; KaTeX webfonts are
   covered by `font-src 'self' data:`; `connect-src` includes `ipc: http://ipc.localhost`; the only inline
   script alternative is the external `public/theme-init.js`, which is allowed by `script-src 'self'`.
5. **Save coordination basics are correct** (and pinned by tests): per-path serialised write queue prevents
   out-of-order writes (`saveCoordinator.test.ts:76-102`); `markSavedSnapshot` refuses to clear `isDirty`
   when newer text arrived during the write (`:36-54`); watcher "own write" echo detection via
   `getLastWritten` prevents autosave↔watcher loops; `atomic_write` uses temp file + fsync + rename and
   cleans up on failure (`lib.rs:62-95`).
6. **Sanitisation of rendered HTML/SVG looks sound in reviewed paths**: raw HTML → `sanitizeHtmlFragment`
   (DOMPurify, `script/iframe/object/…` forbidden, `srcdoc` forbidden); Mermaid render for preview and export
   uses `securityLevel: "antiscript"` plus `sanitizeSvg` (DOMPurify + CSS hardening + foreignObject re-pass);
   exported links block `javascript:`/`data:` (`markdownToHtml.ts:64-69, 470-477`). No XSS vector was
   confirmed in the reviewed core. The `securityLevel: "loose"` setting exists only in the dead
   `useMermaid` hook (CORE-21).
7. **`openDocument` stale-request protection itself works** (`documentRequestId` guard,
   `documentNavigation.test.ts:37-52`); the bug is the FileTree fallback that reacts to it (CORE-02), not the
   guard.
8. **`dist/` layout is valid for `frontendDist: "../dist"`** (`index.html` + `assets/` at root; absolute
   `/assets/...` URLs are correct behind the Tauri asset protocol). `npm run build` passed during this audit.

## Test coverage gaps (critical paths with no coverage)

- `windowClose`: second close request during flush (CORE-04); conflicted current/background docs (CORE-01).
- `saveCoordinator`: `flushDirtyDocuments` behaviour for conflicted cached docs; close-time flush composition.
- `FileTree`: open failure/superseded-open fallback (CORE-02); rejected create/rename/delete error UX;
  prompt validation / workspace-boundary guard (CORE-13).
- Session restore: draft-vs-disk conflict (CORE-06), missing workspace (CORE-17), expanded folders/recents
  persistence (CORE-10/G-1..G-4).
- Search: result → line jump (CORE-09); Rust search hidden/.gitignore/>5MB/cap semantics (CORE-16).
- Export: self-contained images (CORE-11), TOC anchoring with Setext headings (CORE-20), silent HTML export
  failure (CORE-25).
- Updater: install path flushes dirty docs (CORE-15).
- Windows path helpers: case/separator variants (CORE-23).

## Suggested fix order (top 10)

1. **CORE-01** — conflict-aware dirty/close handling (P0, data loss). Includes CORE-07's conflict storage.
2. **CORE-02** — make `openDocument` failure states explicit; remove synthetic-content fallback (overwrite risk).
3. **CORE-04** — prevent repeats while closing (2-line fix, protects every slow save).
4. **CORE-03** — move delete to the OS trash and wire undo + error reporting (requirement + safety).
5. **CORE-05** — confirm/fix titlebar drag region before the UI redesign is finalised.
6. **CORE-09** — implement the `zn-find-open` listener (search → line jump / global Ctrl+H; small, user-visible).
7. **CORE-08** — add `Ctrl+S` (also gives conflict-state users a manual retry).
8. **CORE-10** — persist expanded folders/recents/panel widths/window geometry (large requirement block).
9. **CORE-11 / CORE-12** — export correctness: inline images (HTML) and leak-proof window cleanup/options (PDF).
10. **CORE-06 + CORE-17** — restore-time conflict check and missing-workspace recovery matrix.

Deferred but worth a backlog item: CORE-14 (single instance, prevents a class of multi-writer races) and
CORE-22 (permission/plugin cleanup, cheap security hardening).
