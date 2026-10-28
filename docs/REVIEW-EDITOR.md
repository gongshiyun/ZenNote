# REVIEW-EDITOR.md — Editor & UI-Interaction Audit (ZenNote)

> Read-only audit of the editor and interaction layer: functionality / UX / a11y / i18n.
> Visual styling is out of scope (being redesigned separately).
>
> **Snapshot:** working tree at 2026-10-28 01:20 (Asia/Shanghai). Line numbers were verified
> against that snapshot and every finding includes the quoted source, so re-locating a line is
> cheap if a later commit shifts it.
>
> **⚠ Concurrent refactor in flight.** A UI redesign was landing *during* this audit. Files that
> changed between 00:58 and 01:20: `src/styles/*`, `src/components/ui/*` (new `Modal`/`Menu`/
> `Button`/`Controls` primitives), `i18n/{zh-CN,en-US}.ts`, and the following in-scope files:
> `layout/AppShell.tsx`, `layout/Titlebar.tsx`, `dialogs/SettingsDialog.tsx`,
> `outline/Outline.tsx`, `editor/FindReplaceBar.tsx`. Findings in those files were re-verified
> at 01:20 but **may move again**; they are tagged *(refactor in flight)* below.
> Already fixed by that refactor and verified at snapshot time (removed from the findings):
> welcome button i18n, Outline header i18n, SettingsDialog `Modal` a11y/focus trap,
> SettingsDialog “字体预览”, Titlebar icon-button aria labels, find-bar aria labels and its
> close-button tooltip, Titlebar menus → `ui/Menu`.
> **Stable (untouched, mtimes 2026-10-01..10-11):** everything under
> `editor/livepreview/**` except FindReplaceBar, `editor/SourceEditor.tsx`,
> `filetree/FileTree.tsx`, `search/SearchPanel.tsx`, `dialogs/QuickOpen.tsx`,
> `dialogs/ShortcutsPanel.tsx`, `layout/TabBar.tsx`, `layout/StatusBar.tsx`, `store/**`,
> `lib/**`, `domain/**`.
>
> **Method:** full source read of the scoped files, cross-checked against
> `docs/PRD.md`, `docs/MARKDOWN-RENDERING.md`, `docs/UX-REVIEW.md`, and the existing
> test suite; arithmetic verification for offset/index logic. No browser/network available,
> so findings are source-proven, not click-tested (a few are explicitly marked
> "verify in desktop build").

---

## 0. Severity rubric

| Sev | Meaning |
|-----|---------|
| P0 | Data loss, crash, or product unusable. **None found** in the audited paths (external-conflict, autosave, save-coordinator and sanitisation paths are sound — see §7). |
| P1 | A spec'd primary workflow is missing/broken, or a wrong action is executed for the user (incl. CJK input hazards). |
| P2 | Significant daily-use defect, requirement gap, i18n/a11y coverage hole, or performance risk. |
| P3 | Polish, dead code, documentation/consistency mismatch, edge cases. |

**Counts: P0 = 0, P1 = 7, P2 = 17, P3 = 9 (total 33).**
(ID `ED-32` was verified fixed by the in-flight refactor mid-audit — see §5 — and removed; IDs are otherwise stable.)

---

## 1. Summary table

| ID | Sev | Area | File:line | Problem | Effort |
|----|-----|------|-----------|---------|--------|
| ED-01 | P1 | Find/Replace | `components/editor/SourceEditor.tsx:1-13, 181-215`; `layout/AppShell.tsx:370-373` | Find & Replace bar exists only in Live Preview; Ctrl+F / Ctrl+H do nothing in source mode | M |
| ED-02 | P1 | Search | `search/SearchPanel.tsx:57-68`; `layout/AppShell.tsx:370-373`; `editor/livepreview/LivePreviewEditor.tsx:251-284` | `zn-find-open` event has **no listener**; clicking a search result opens the file but never scrolls to / highlights the match; the find-bar `preset` prop is unreachable | S |
| ED-03 | P1 | i18n/IME | `search/SearchPanel.tsx:71-89`; `dialogs/QuickOpen.tsx:60-78`; `editor/FindReplaceBar.tsx:141-158` | Window-level keydown handlers ignore `KeyboardEvent.isComposing`; IME confirm-Enter / candidate arrows are hijacked (opens files, jumps matches) for zh/ja/ko users | S |
| ED-04 | P1 | Find/Replace | `editor/FindReplaceBar.tsx:48-58, 141-158` | Enter/Next moves focus **out of the find input** into the editor; while the bar is open with a query, Enter from *anywhere* is `preventDefault`ed and triggers find-next | S |
| ED-05 | P1 | Outline | `outline/Outline.tsx:19-22, 44-77, 79-107` | Outline maps outline index → `querySelectorAll(...)[idx]`, but CodeMirror renders only the viewport ⇒ jumping/highlighting targets the wrong heading in any note taller than ~1 screen | M |
| ED-06 | P1 | Editor core | `editor/livepreview/LivePreviewEditor.tsx:119-193` (no input handler) | Markdown auto-behaviour from PRD §3.8 / MARKDOWN-RENDERING §5 is absent: no list continuation, no Tab/Shift+Tab list nesting, no bracket/mark pairing, no fence auto-close | M |
| ED-07 | P1 | File tree | `filetree/FileTree.tsx:151-212` | New/rename/folder use blocking native `prompt()`/`confirm()`/`alert()` (spec requires inline edit); no invalid-char or `.md`-suffix validation ⇒ a name typed without `.md` creates a file that immediately disappears from the filtered tree | L |
| ED-08 | P2 | Tables | `editor/livepreview/renderedBlockActions.ts:553-579, 924-965` | Cell right-click menu only opens when a cell range was drag-selected first; no insert-above/left, no column resize, typing `|` does not create a table (PRD §3.3.4) | M |
| ED-09 | P2 | Marks | `editor/livepreview/livePreviewInteractions.ts:46-93` | Ctrl+B/I/E/X are selection-only: with the caret *inside* `**bold**`, Ctrl+B inserts a literal `****` pair instead of toggling off (spec §2.1/2.2) | S |
| ED-10 | P2 | Mode | `store/slices/editorSlice.ts:181-185`; `filetree/FileTree.tsx:141`; `dialogs/QuickOpen.tsx:52-54` | Opening a file from tree/QuickOpen/search/OS passes `sourceMode: defaultSourceMode`, overriding the mode the user just toggled; "remember last used mode" (§3.3.2) is not implemented | S |
| ED-11 | P2 | Links | `editor/livepreview/livePreview.ts:1082-1094`; no `shell/openUrl` anywhere | Links are styled but never clickable; autolinks / bare URLs unstyled; no external-browser opening (§2.6, PRD §3.3.1) | M |
| ED-12 | P2 | Mermaid | `editor/livepreview/livePreview.ts:139-168, 767-790, 1172-1190` | Failed render is cached in `mermaidFailed` and never surfaced: the block shows the English placeholder `rendering diagram…` forever; no error message, no retry, no 3 s timeout (§4.1, PRD §3.10) | M |
| ED-13 | P2 | Drag&Drop | whole `src/` (no `drop`/`dragover`/`dataTransfer` handlers) | No drag-and-drop at all: images cannot be dragged in from Explorer, `.md` cannot be dragged into the window, tree nodes cannot be dragged to move (§6.3, PRD §3.2/§3.3.6). Tauri intercepts OS drops by default, so config changes are also required | M |
| ED-14 | P2 | Persistence | `layout/AppShell.tsx:143-173`; `store/slices/fileTreeSlice.ts:49-76`; `layout/AppShell.tsx:317-348` | Recent workspaces, expanded folders and panel widths are never persisted (PRD §3.1/§3.2/§3.2c); widths also reset when a panel is toggled | S |
| ED-15 | P2 | File tree a11y | `filetree/FileTree.tsx:271-317, 359, 397-398` | Arrow/F2/Delete nav only fires when focus is already inside the tree container (clicking a row doesn't focus it); focused row never scrolled into view; ←/→ don't implement parent/first-child semantics (PRD §3.14) | S |
| ED-16 | P2 | Performance | `editor/livepreview/livePreview.ts:660-827, 1104-1161, 761-774`; `LivePreviewEditor.tsx:99-103`; `SourceEditor.tsx:69-73` | 4–6 whole-document walks run on **every** keystroke/selection change, plus `doc.toString()` copied per caret move ⇒ large-file target (PRD §4: 10 k lines) is at risk | M |
| ED-17 | P2 | Images | `editor/livepreview/renderedBlockActions.ts:820-879`; `renderedBlockHelpers.ts:31-47` | Clicking an align button rewrites the image **alt text** to `"<ratio>|<align>"`, destroying any author-written alt text (accessibility/data loss in source) | S |
| ED-18 | P2 | i18n | see §4 inventory | 15+ user-visible strings bypass `t()` (welcome button, outline header, image-align labels, slash menu, settings labels, status bar "Ln/Col", file-delete confirm, Mermaid placeholder, …) | M |
| ED-19 | P2 | Shortcuts | `dialogs/ShortcutsPanel.tsx:21-72`; `editor/livepreview/livePreviewInteractions.ts:324-331` | Panel advertises shortcuts that don't exist (Ctrl+S, global Ctrl+N, Ctrl+Shift+C, Ctrl+1…6/Ctrl+0); inline code is actually Mod-E; Ctrl+1..6/0 required by PRD §3.8 | M |
| ED-20 | P2 | a11y | `search/SearchPanel.tsx:100-111`; `dialogs/QuickOpen.tsx:80-97`; `dialogs/ShortcutsPanel.tsx:12-18`; `editor/zoomOverlay.ts:80-234` | Overlays lack `role="dialog"`/`aria-modal`/focus trap/initial focus/focus restore; each registers its own window-Escape listener so one Esc can close several stacked layers (SettingsDialog was migrated to the new `ui/Modal` during this audit — it is fixed) | M |
| ED-21 | P2 | a11y | `editor/livepreview/widgets.ts:154-183, 802-832, 848-911`; `renderedBlockActions.ts:801-812` | Interactive widgets are mouse-only and semantically empty: task checkbox is a `<span>`, TOC rows and footnote chips are `div`/`sup` with mousedown, table cells are unreachable from the keyboard, image bar opens only on mousedown | M |
| ED-22 | P2 | Rendering | `editor/livepreview/livePreview.ts:399-448, 815-824, 1154-1161`; `lib/markdownToHtml.ts:140,164` | `findMath` is a raw line scan with no code-context skip ⇒ `$x$`/`$$…$$` inside fenced or inline code is rendered as KaTeX (in preview **and** HTML export) | S |
| ED-23 | P2 | Lists/tasks | `editor/livepreview/livePreview.ts:947-960`; `widgets.ts:110-135`; `livePreviewTheme.ts:449-457` | Ordered lists render the **source** ordinal (lazy all-`1.` lists show 1,1,1) instead of auto-numbering; completed tasks are not struck through/dimmed (§3.4/§3.5) | M |
| ED-24 | P2 | Outline | `outline/Outline.tsx:79-107`; `domain/document.ts:10-40` | Clicking the outline in source mode silently flips the editor back to preview; the retry `setInterval` is never cleared on unmount; the regex heading parser disagrees with the editor grammar (setext/indented/block-quote headings missing) | S |
| ED-25 | P3 | Footnotes | `editor/livepreview/footnotes.ts:94-112`; `widgets.ts:766-774` | Code exclusion is line-start-only, so `[^1]` inside inline code on a normal line becomes a footnote chip | S |
| ED-26 | P3 | Slash menu | `editor/livepreview/slashMenu.ts:100-112` | Multi-line inserts inside an indented list item place the caret on the closing fence line, not the empty middle line (verified by offset arithmetic) | S |
| ED-27 | P3 | Find/Replace | `editor/FindReplaceBar.tsx:71-80, 84-103`; `lib/findQuery.ts:40-47` | `wholeWord` is silently ignored in regex mode; jump-to-line-1 match never selects/scrolls; replace-all leaves a stale counter (the close-button “Previous” tooltip was fixed during the audit) | S |
| ED-28 | P3 | File tree | `filetree/FileTree.tsx:27-54, 319-322` | Context menu is `position:fixed` at the raw click point (can render off-screen); items are `div`s with no keyboard/Escape support (TabBar's menu, by contrast, clamps correctly) | S |
| ED-29 | P3 | Empty states | `editor/livepreview/LivePreviewEditor.tsx:275-291`; unused keys `editor.openNote/loading/initFailed` | With no document the editor area is blank — no "Open a note to start writing" state, no init-failure state | S |
| ED-30 | P3 | Dead code | see §8 | `pmSelection`/`editorRef` store leftovers, duplicated table helpers, dead `preset` state, dead `rel` variable, unused theme constants/`copyImageToClipboard`, empty `.cm-zn-li` hook, stale Crepe comments | S |
| ED-31 | P3 | Export/HTML | `lib/markdownToHtml.ts:541-555, 149-159`; `widgets.ts:322-329` | TOC HTML is unbalanced when heading levels are skipped; exported footnotes aren't code-skipped; table-cell `<a>` has no click interception (may navigate the Tauri webview — verify in desktop build) | M |
| ED-33 | P3 | Undo | `editor/livepreview/LivePreviewEditor.tsx:215`; `SourceEditor.tsx:179` | Changing tab size (or page padding in source mode) destroys the `EditorView` ⇒ undo history is lost mid-edit | S |
| ED-34 | P3 | Save state | `store/slices/editorSlice.ts:187`; `lib/saveCoordinator.ts:38-42` | `isDirty` never returns to clean when undo restores the saved text; a save failure keeps the status-bar error indefinitely (PRD §3.8 says ~3 s for autosave failures) | S |

---

## 2. Detailed findings

### P1

#### ED-01 — Find & Replace is unavailable in source mode (P1, M)
**Evidence**
- `components/editor/SourceEditor.tsx:33-215` — imports (`:1-13`) contain no `FindReplaceBar`; the component renders only the CodeMirror host (`:214`). Its doc comment (`:29`) still says “Exposes the live EditorView so FindReplaceBar can drive it” — but nothing mounts a bar around it.
- `components/editor/livepreview/LivePreviewEditor.tsx:26, 278-284` — the bar is mounted only here.
- `components/editor/livepreview/LivePreviewEditor.tsx:255-268` — Ctrl+F/H handling lives in this component and disappears with it.
- `layout/AppShell.tsx:370-373` — the only global Ctrl+H handler dispatches an event nobody listens to (see ED-02). *(refactor in flight: the file was restructured, the handler stayed.)*

**Impact / repro**
Press Ctrl+`` ` `` to switch to source mode; press Ctrl+F or Ctrl+H → nothing happens, and no bar exists. PRD §3.8 (查找替换 Ctrl+F/Ctrl+H) is a first-class requirement and source mode is a first-class surface. Ctrl+H also does nothing in Live Preview via AppShell (it works only because of the editor-local listener).

**Fix**
Hoist `FindReplaceBar` out of `LivePreviewEditor` into `AppShell` (one bar, `getCmView` picks `sourceMode ? srcViewRef : lpViewRef`), and add a single global Ctrl+F/H handler there (respecting IME, see ED-03). Delete the editor-local listener (ED-02 wiring then gives the search panel its jump target for free).

#### ED-02 — Global search cannot jump to the match (dead `zn-find-open` channel) (P1, S)
**Evidence**
```ts
// search/SearchPanel.tsx:65-67
// Hand the query and target line to the in-document find bar so the user
// lands on the result they selected instead of the first workspace match.
window.dispatchEvent(new CustomEvent("zn-find-open", { detail: { query, line: r.line } }));
```
```ts
// layout/AppShell.tsx:370-373  (re-verified 01:20, refactor in flight)
else if (key === "h" && !e.shiftKey) {
  e.preventDefault();
  window.dispatchEvent(new CustomEvent("zn-find-open", { detail: { query: "", showReplace: true } }));
}
```
```ts
// editor/livepreview/LivePreviewEditor.tsx:251-253
const [findVisible, setFindVisible] = useState(false);
const [findPreset, setFindPreset] = useState<{ query: string; ts: number } | null>(null);
void setFindPreset;               // <- never set to anything but null
```
`grep -rn zn-find-open src` (re-run at 01:20) → only the two dispatchers plus `SearchPanel.test.tsx:78`. **No `addEventListener` anywhere.** A redesign of `FindReplaceBar` landed during the audit (new markup/aria), but it still has no preset consumer outside its own prop.

**Impact / repro**
Global search (`Ctrl+Shift+F`) → click any result: the file opens, the query is never pre-filled in the find bar, and the view is not scrolled to the matching line (PRD §3.2b: “点击结果 → 打开文件并跳转到匹配行”). Because neither editor consumes the event, the `preset` prop and `targetLine` machinery in `FindReplaceBar.tsx:118-138, 94-101` are dead code in production.

**Fix**
Add one `window.addEventListener("zn-find-open", …)` in the surface that owns the find bar (after ED-01, `AppShell`), set `preset={query,line,ts}`, and when the view is ready dispatch `{selection:{anchor: offsetAtLineCol(...)}} + scrollIntoView`. Move the `targetLine → match index` logic onto a real `EditorView` (current code at `FindReplaceBar.tsx:94-101` also fails to scroll when the first match is already on the target line, because `targetIndex === 0` never calls `cmGoto`).

#### ED-03 — Window-level key handlers ignore IME composition (P1, S)
**Evidence**
```ts
// search/SearchPanel.tsx:71-89
const handler = (e: KeyboardEvent) => {
  if (e.key === "Escape") { ... }
  if (e.key === "ArrowDown") { e.preventDefault(); setFocusIdx(...); }
  ...
  if (e.key === "Enter" && results.length > 0) { e.preventDefault(); handleClick(results[focusIdx] || results[0]); }
};
window.addEventListener("keydown", handler);
```
Same shape in `dialogs/QuickOpen.tsx:60-78` and `editor/FindReplaceBar.tsx:141-158`. None checks `e.isComposing` (or `keyCode === 229`). CodeMirror's own keymap *does* ignore composing keydowns (`@codemirror/view` `InputState.ignoreDuringComposition`), so this is specific to the hand-written window listeners.

**Impact / repro (CJK-first app: zh-CN is the default locale)**
Global search for “技术” → press Enter to **confirm the IME candidate** → the first result is opened instead (the composing Enter bubbles to `window`). ArrowUp/ArrowDown during candidate selection are also `preventDefault`ed, so the IME candidate list cannot be navigated. Quick Open has the same defect when typing a Chinese filename. If the find bar is open with a query, IME Enter also triggers find-next (ED-04).

**Fix**
First line of every such handler: `if (e.isComposing || e.keyCode === 229) return;`. Also skip while `document.activeElement` is a text field for handlers that shouldn't apply there (see ED-04). Add the IME tests listed in §6.

#### ED-04 — Find bar steals focus and swallows Enter globally (P1, S)
**Evidence**
```ts
// editor/FindReplaceBar.tsx:48-58  (line numbers re-verified 01:20 after the bar's redesign)
const cmGoto = useCallback((index: number) => {
  ...
  view.dispatch({ selection: { anchor: m.from, head: m.to }, scrollIntoView: true });
  view.focus();                    // <- moves focus out of the search field
  setCurrentIdx(idx);
}, ...);
```
```ts
// editor/FindReplaceBar.tsx:141-158 (window listener, bubbles from ANY target)
const handler = (e: KeyboardEvent) => {
  if (!visible) return;
  if (e.key === "Escape") { e.preventDefault(); onClose(); }
  else if (e.key === "Enter" && !e.shiftKey && findText) { e.preventDefault(); findNext(); }
  else if (e.key === "Enter" && e.shiftKey && findText) { e.preventDefault(); findPrev(); }
  ...
};
window.addEventListener("keydown", handler);
```
The redesign that landed during this audit added `role="search"`, `aria-label`s and an `Esc` key cap, but the focus/Enter semantics above are unchanged.

**Impact / repro**
1. Type “foo”, press Enter → jumps to the first match **and focus jumps into the document**. The next keystrokes edit the note instead of the query; to refine the search you must click the input again (standard find UI keeps focus in the field). The existing test (`FindReplaceBar.test.tsx:99`) clicks the “next” button and only asserts the dispatch, so this is untested.
2. With the bar open and a query present, press Enter anywhere — including while typing a newline in the document or confirming the replace field — the event is `preventDefault`ed and a match jump happens. This makes the document uneditable while a find query is active.
3. `Escape` is caught globally too, so it closes the bar even when another overlay owns Escape (ED-20).

**Fix**
- Keep `view.focus()` only for mouse clicks on the editor / after the user explicitly leaves the bar; the standard is `view.dispatch(..., {scrollIntoView:true})` without focusing (CM scrolls on dispatch even when not focused). If focus is needed, restore it to `findRef` immediately.
- Scope the Enter/Shift-Enter handling to `event.target` inside the bar (`barRef.current?.contains(e.target)`), and add `isComposing` guard.
- Return focus to the editor only on close (`onClose` should `getCmView()?.focus()` then call the prop), so typing resumes where it stopped.

#### ED-05 — Outline jump/highlight uses DOM indices in a virtualized editor (P1, M)
**Evidence** *(refactor in flight — header markup/i18n changed, the DOM-index logic did not; lines re-verified 01:20)*
```ts
// outline/Outline.tsx:19-22
const HEADING_SELECTOR = ".zn-live-preview .cm-zn-h1, ... .cm-zn-h3";
```
```ts
// outline/Outline.tsx:53-68  (active-row highlight)
const headingEls = Array.from(document.querySelectorAll<HTMLElement>(HEADING_SELECTOR));
...
headingEls.forEach((el, i) => { ... if (elTop <= scrollTop) activeIdx = i; });
setActiveHeading(activeIdx >= 0 ? String(activeIdx) : null);
```
```ts
// outline/Outline.tsx:84-91  (click-to-jump)
const target = document.querySelectorAll<HTMLElement>(HEADING_SELECTOR)[idx];
```
The project already documents why this cannot work — `lib/markdownToHtml.ts:5-9`: *“CodeMirror … renders only its viewport — ViewState.getViewport covers the visible area plus a hard-coded 1000px … so the DOM holds about one screenful and nothing else.”*

**Impact / repro**
A note with 30 headings scrolled to the bottom: only ~headings 20–30 exist in the DOM. `displayHeadings[idx]` is an index over **all** h1–h3, but `querySelectorAll(...)[idx]` indexes the **rendered subset**. Result: clicking outline row 0 scrolls to heading ~20 (or to nothing when `idx` exceeds the rendered count), and the scroll-following highlight marks the wrong row by the same offset. The behaviour degrades silently — exactly the kind of bug an outline is supposed to prevent. `Outline.test.tsx:44-73` fabricates a two-heading DOM and only asserts `scrollIntoView` was called once, never *which* element, so it passes.

**Fix**
Navigate by document position, not DOM: `displayHeadings[i]` already carries `pos` (line index, `domain/document.ts:36`). Compute the offset (`offsetAtLineCol(content, pos+1, 1)`), dispatch a selection + `EditorView.scrollIntoView(pos, {y:"start"})` (the pattern already used by `TocWidget` in `widgets.ts:890-901`), and drive the active row from the editor's viewport scroll callback (`EditorView.updateListener` on `geometryChanged`/`scroll`) using heading positions. No DOM query at all. Propose test in §6.

#### ED-06 — Missing Markdown automation: list continuation, pairing, fence close, Tab nesting (P1, M)
**Evidence**
- `LivePreviewEditor.tsx:119-193` — extension list: syntax, decorations, theme, `markKeymap`, bubble, slash, renderedBlockActions, paste, `defaultKeymap/historyKeymap/indentWithTab`. There is no `markdownKeymap`/`insertNewlineContinueMarkup`/`deleteMarkupBackward`, and `grep -rn "insertNewlineContinueMarkup|deleteMarkupBackward|inputHandler|closeBrackets|autoClose" src` returns **nothing**.
- PRD §3.8: “Markdown 结构自动补全：围栏代码块自动闭合、表格行自动续写、链接快捷包装”; “符号自动配对 … 详细规则见 MARKDOWN-RENDERING.md §5”; “Tab 键：在列表中使用 Tab 增加缩进层级，Shift+Tab 减少缩进”.
- MARKDOWN-RENDERING §5.1 (all pairs), §5.2 (```` ``` ```` auto-close), §5.3 (list auto-continue/exit).

**Impact / repro**
Type `- item` then Enter → an empty new line, not `- `. Type `(` → no `()` pair. Type ` ```lang` + Enter → no closing fence. Tab inside a list inserts two spaces but does not nest the item. For a Typora-competitor this is the single largest daily-typing gap, and it is *not* covered by any test (all help text/press material assumes it).

**Fix**
Add to the Live Preview keymap: `insertNewlineContinueMarkup` + `deleteMarkupBackward` from `@codemirror/lang-markdown` (they implement §5.3 and “Backspace on empty item exits list”), `insertNewlineContinueMarkup` on Enter with `Prec.high` so it runs before `defaultKeymap`; a small `InputHandler` (or `closeBrackets()` from `@codemirror/autocomplete` is not a direct dep — prefer a local input handler) for §5.1 pairs including Markdown-aware skips (`*`, `~`, `` ` ``, `$`); a `Mod-Enter`-adjacent fence closer on Enter for §5.2. Tab-list nesting: a keymap that intercepts Tab at a list-marker line and calls `indentMore` (currently `indentWithTab` always inserts spaces). Reuse `MARK_TOGGLES` for pairing delimiters so the two lists cannot drift. Tests: §6.

#### ED-07 — File operations use native dialogs; no inline edit / validation / trash (P1, L)
**Evidence** (`filetree/FileTree.tsx`)
```ts
152: const name = prompt("", t().filetree.untitled + ".md");
165: const name = prompt("", t().filetree.folderName);
176: const newName = prompt("New name:", oldName);
197: alert(t().filetree.deleteCurrentBlocked);
202: alert(t().filetree.deleteDirtyBlocked);
205: if (!confirm("Delete \"" + name + "\"?")) return;
```
No `INVALID_NAME` filtering anywhere; `joinPath(base, name)` uses the typed string verbatim (`:155`), and `openFile(newPath)` then reads it back.

**Impact / repro**
- PRD §3.2a requires an inline input prefilled `未命名.md`, selection of the base name only, Enter/Esc, illegal-character blocking, and a 3 s “moved to trash + undo”. None of that exists.
- **Invisible-file bug:** the prompt's prefill is a single selectable string; the natural user action (clear + type `会议记录`) creates `会议记录` **without `.md`**. `openWorkspace` lists only markdown, so the file vanishes from the tree immediately while the editor shows it — and the next tree refresh “loses” it.
- Rename conflicts and IO errors are swallowed (`catch { /* */ }`, `:161,172,184,211`) — PRD requires a status-bar message.
- Delete is permanent (`services/fileService.ts:53` → `delete_file`); no recycle-bin/undo.
- `alert()`/`confirm()`/`prompt()` are blocking browser dialogs inside a Tauri webview — visually foreign and not keyboard-consistent.
- New note is always created at the workspace root, not in the selected folder (PRD §3.2a/§3.14) — the keyboard handler calls `handleNewFile()` with no argument (`:276`).
- After create, the tree is not expanded/scrolled to the new file (PRD §3.2a).

**Fix**
Implement an inline-edit row component (draft state keyed by path, Enter/Esc handlers, `aria-label`, auto-focus, selection range excluding the extension), validate `[\\/:*?"<>|]` (and empty/dot names) before calling the service, force `.md` for notes, surface errors via `setSaveError`, use `move_to_trash`-style command (if the Rust side has none, add it; otherwise show a persistent confirm + implement undo buffer). Delete `prompt/confirm/alert` from this file entirely.

---

### P2

#### ED-08 — Table interactions vs PRD §3.3.4 (P2, M)
**Evidence**
```ts
// renderedBlockActions.ts:568-575
const sel = this.cellSel;
const pos = cellPos(cell);
const inRange = !!sel && sel.wrap === wrap && sel.wrap.isConnected && rectContains(sel.rect, pos.row, pos.col);
if (!inRange) { this.closeTableMenu(); return; }   // plain right-click => browser menu, no app menu
```
```ts
// renderedBlockActions.ts:949-965 (single-cell menu): only insertRowBelow / insertColRight / move*
```
`t().table.insertRowAbove` and `t().table.insertColLeft` exist in both locales but are referenced nowhere; `t().table.selectRow/selectCol/selectTable` likewise unused. `widgets.ts` `TableWidget` has no column-resize handles; there is no “type `|` to start a table” path (`matchSlash` only offers a pre-baked table; no `|` trigger).

**Impact / repro**
Right-click a cell with no prior drag-selection → nothing (browser menu). PRD §3.3.4 explicitly lists 右键菜单、在上方/下方插入行、在左侧/右侧插入列、删除行/列、列宽拖拽. Only the frame's `⛶` button exposes a subset (below/right/move/align/delete). Column widths cannot be adjusted.

**Fix**
Open the menu on any cell right-click when there is no native text selection (keep the current “native selection wins” rule), add above/left items (helpers `insertRow`/`insertColumn` already accept the needed indices; add `insertRowAbove = insertRow(lines, row-1)` semantics carefully for header), add `<colgroup>`-style resize handles persisting `width` via a comment-free convention (or accept non-persistence and document it), and add a `|`-triggered table continuation to the input handler from ED-06.

#### ED-09 — Mark toggles are not cursor-aware (P2, S)
**Evidence**
```ts
// livePreviewInteractions.ts:52-54
const before = doc.sliceString(Math.max(0, from - d), from);
const after = doc.sliceString(to, Math.min(doc.length, to + d));
const wrappedOutside = before === delimiter && after === delimiter;
```
Only “selection exactly wrapped outside” or “delimiters inside selection” toggle off; there is no check for a mark containing the caret.

**Impact / repro**
`**bold**`, caret between `o` and `l` (no selection) → `before = "bo"`, `after = "ld"` → falls through to “insert pair” → document becomes `**bo****ld**` (verified against the same code path covered by `livePreviewInteractions.test.ts:48-53`, which asserts empty-pair insertion). User intent for Ctrl+B inside bold is *remove* formatting (spec §2.1: “光标在粗体文字内时移除 **（toggle）”). Same for `*`, `~~`, `==`, `` ` ``.

**Fix**
Before wrapping, resolve whether the caret lies inside a node of the matching kind (cheap: scan the line for balanced delimiters around the caret, or use `syntaxTree(state).resolveInner(from, -1)` and walk up to `StrongEmphasis/Emphasis/Strikethrough/Highlight/InlineCode`). If so, delete the two delimiter ranges. Tests: caret-in-bold, caret-in-italic, caret-in-inline-code, plus the existing selection cases.

#### ED-10 — Source mode is not remembered; every open forces the setting default (P2, S)
**Evidence**
```ts
// store/slices/editorSlice.ts:181-185
get().setCurrentFile(path, nextContent);
if (options?.sourceMode !== undefined && previousPath !== path) {
  set({ sourceMode: options.sourceMode });
}
```
Callers always pass `s.defaultSourceMode`: `FileTree.tsx:141`, `FileTree.tsx:237`, `QuickOpen.tsx:52-54`, `SearchPanel.tsx:59-61`, `AppShell.tsx:125, 403`. `useWindowPersistence` never stores `sourceMode` (`AppShell.tsx:147-170`).

**Impact / repro**
Toggle to source mode (Ctrl+`` ` ``), click another note in the tree → editor is back in preview (default `false`). Restart → mode comes from `defaultSourceMode` only. PRD §3.3.2: “应用记住用户最后使用的模式”.

**Fix**
Persist `sourceMode` in the session payload and restore it; stop passing `defaultSourceMode` for in-session opens (use it only for the first document after launch, or when the user has never toggled). Alternatively add a “remember last mode” flag in settings.

#### ED-11 — Links are never clickable; no external opening (P2, M)
**Evidence**
```ts
// livePreview.ts:1082-1094
if (name === "Link") {
  const marks = node.node.getChildren("LinkMark");
  if (marks.length >= 4) { styleRange(...); markRange(open.from, open.to); markRange(marks[1].from, marks[last].to); }
  return;
}
```
No click handler, no `openUrl`/`shell.open`/`plugin-opener` anywhere in `src/` (`grep -rn "shell|openUrl|opener" src` → only unrelated comments). `marks.length >= 4` also means autolinks (`<https://…>`, 2 marks) get no styling at all.

**Impact / repro**
Clicking a rendered link places the caret and reveals the raw markdown (the generic “touched” behaviour) — it never opens the browser. PRD §3.3.1 (“渲染为可点击链接”) and MARKDOWN-RENDERING §2.6 (“点击：在系统默认浏览器中打开 URL 通过 Tauri 的 shell.open”) are unmet; autolinks and bare-URL requirement rows are unmet too. Table-cell links are the only `<a>`s in the app (`widgets.ts:322-329`) and they are native anchors (see ED-31).

**Fix**
Add a click/dblclick handler (or a `cm-zn-link` mark with `mousedown` handling) that calls a new `services.openExternal(url)` wrapper (`@tauri-apps/plugin-opener` or a custom command), with `Ctrl+Click`/plain-click policy per UX-REVIEW §6.4. Style autolinks by handling `Autolink` nodes (or `marks.length === 2`), and make bare URLs (GFM autolink extension is already on) clickable. Add title tooltip.

#### ED-12 — Mermaid failure/timeout has no user-visible state (P2, M)
**Evidence**
```ts
// livePreview.ts:159-166
} catch (err) {
  // Cache the failure so a broken diagram is not retried on every keystroke.
  mermaidFailed.add(key);
  console.warn("live-preview-mermaid-failed", err);
}
```
```ts
// livePreview.ts:785-790 (block decoration)
ranges.push(Decoration.replace({ widget: cached ? new MermaidWidget(cached, key) : new MermaidPlaceholder(), block: true }).range(node.from, node.to));
```
```ts
// livePreview.ts:1182-1185
el.className = "cm-zn-mermaid cm-zn-mermaid-pending";
el.textContent = "rendering diagram…";
```
There is no timeout, no error widget, no retry action; `mermaidFailed` is never cleared for a fixed diagram’s old key (new key → new attempt, which is fine).

**Impact / repro**
Paste a diagram with a syntax error → the block shows “rendering diagram…” forever (English, in a zh-CN UI), and `console.warn` is the only feedback. PRD §3.10 (Mermaid 渲染失败 → 显示错误信息; 渲染超时 3 s → 重试) and MARKDOWN-RENDERING §4.1 (red error + diagnostics, timeout + retry button) are unmet.

**Fix**
Track failure state per key (`mermaidFailed` already exists — read it in `buildBlockDecorations`), render an `MermaidErrorWidget(source, message, retry)` (i18n’d via `t()`, retry deletes the key from `mermaidFailed` + `ensureMermaid`), and wrap `mermaid.render` in `Promise.race` with a 3 s timeout producing the same widget. Message text should come from i18n (`editor.mermaidError` / `editor.mermaidTimeout` — add keys).

#### ED-13 — No drag-and-drop support anywhere (P2, M)
**Evidence**
`grep -rn "onDrop|dragover|dragenter|dragstart|dataTransfer" src` → no matches. Paste handlers exist (`LivePreviewEditor.tsx:148-190`, `SourceEditor.tsx:105-125`) but nothing handles `drop`. `src-tauri/tauri.conf.json` sets no `dragDropEnabled`, so Tauri’s default OS drop interception is in force.

**Impact / repro**
Drag a PNG from Explorer onto the editor → nothing (and no drop highlight). Drag a `.md` onto the window → nothing. Drag a tree node onto a folder to move it → nothing. PRD §3.2 (拖拽移动文件/文件夹), §3.3.6 (从文件管理器拖入图片), MARKDOWN-RENDERING §6.3 and UX-REVIEW P2-9 all require this.

**Fix**
Two halves: (a) editors — `EditorView.domEventHandlers({ drop })` handling `dataTransfer.files` (images → `prepareImageUpload`, `.md` → insert link) with `dragover` preventDefault; (b) Tauri — either set `dragDropEnabled: false` so HTML5 drop works in the webview, or use the Tauri drag-drop event API; (c) tree — HTML5 DnD or pointer-based move invoking `rename_file` for a new parent, reusing `remapWorkspacePaths`.

#### ED-14 — Workspace/session persistence gaps (P2, S)
**Evidence** *(refactor in flight — lines re-verified 01:20)*
```ts
// AppShell.tsx:148-171 (session payload)
const data = { workspacePath, currentFilePath, openTabs, mode, fontFamily, editorPadding,
  autoCheckUpdate, updateCheckInterval, fontSize, tabSize, autoSaveDelay, showHiddenFiles,
  showFileExtensions, defaultSourceMode, sidebarVisible, outlineVisible, draft, backgroundDrafts };
```
No `recentWorkspaces`, no `expandedFolders`, no panel widths. `fileTreeSlice.ts:49-76` keeps both in memory only; `AppShell.tsx:320-350` mutates `.zn-sidebar-slot`/`.zn-outline-slot` inline width on drag (no React state), so toggling a panel remounts it at the CSS default and a restart forgets it entirely.

**Impact / repro**
PRD §3.1 “记住最近 5 个工作区，启动时在文件树顶部列出” — after restart the recent-workspaces dropdown is empty. PRD §3.2 “文件夹默认折叠，手动展开后状态持久化” — always re-collapsed. PRD §3.2c “面板宽度保存到应用配置” — never saved and reset on toggle.

**Fix**
Add the three fields to the session payload (and restore them: `setRecentWorkspaces`, `setExpandedFolders`, width state), and store the dragged width in store state rather than raw DOM so a re-render/remount keeps it.

#### ED-15 — File-tree keyboard navigation doesn't actually work after clicking (P2, S)
**Evidence**
```ts
// FileTree.tsx:272-274 (window handler)
const handler = (e: KeyboardEvent) => {
  if (!treeRef.current?.contains(document.activeElement)) return;
```
```ts
// FileTree.tsx:359
<div ref={treeRef} tabIndex={0} style={{ flex: 1, overflowY: "auto", ... }}>
```
Nodes are `<div onClick>` with no `tabIndex` (`:407-422`), so clicking a node does not focus `treeRef` (clicking a non-focusable child of a focusable container does not move focus; the contenteditable editor keeps/loses focus to `<body>`). The container is only focusable via Tab. There is also no `scrollIntoView` for the focused row (grep: FileTree has none), and ←/→ only collapse/expand — never “go to parent”/“go to first child” (PRD §3.14 explicitly requires those).

**Impact / repro**
Click a file, press ↓ → nothing (focus on body). Tab into the tree, hold ↓ across 60 entries → the focus highlight scrolls out of view. Press ← on a collapsed folder → nothing.

**Fix**
`onMouseDown` on a row → `treeRef.current?.focus()` + set `focusIndex`; on focusIndex change → `rowRef.scrollIntoView({block:"nearest"})` (store a ref per row or query `[data-index]`); implement ← (expanded→collapse, else→parent index) and → (collapsed→expand, else→first child index); set `aria-selected`/`role="treeitem"` with `role="tree"` on the container.

#### ED-16 — Large-file performance: whole-document passes per keystroke (P2, M)
**Evidence**
`buildBlockDecorations` (a `StateField`, re-runs on every `tr.docChanged || tr.selection`) does **four** full-document tree walks plus a scan:
- `livePreview.ts:685-698` headings, `:701-719` `[TOC]`, `:721-792` tables/fences, `:796-812` HTML blocks, `:815-824` `findMath(doc)`.
`buildDecorations` (a `ViewPlugin`, re-runs on every selection/viewport/geometry change) adds:
- `:1105-1133` `tree.iterate({from: 0, to: doc.length})` for inline HTML tags (whole doc, not viewport);
- `:1142` `footnoteScanOf(view)` → another full-document `tree.iterate` (`widgets.ts:766-774`) + line scan;
- `:1154-1161` `findMath(doc)` again (whole doc).
And both editors copy the whole document into the store on **every caret move**:
```ts
// LivePreviewEditor.tsx:99-103 (same at SourceEditor.tsx:69-73)
s.setCmSelection({ anchor: ..., head, content: update.state.doc.toString() });
```
`setCursorPosition` is cheap; this line is not.

**Impact / repro**
PRD §4 requires 1 万行 Markdown 无明显卡顿. With six full-document walks per keystroke (and per arrow key), plus a 10k-line string allocation per caret move, a 10k-line note with many inline constructs will stutter on every key. (No browser here to measure — the finding is structural; a `performance.mark` test is proposed in §6.)

**Fix**
- Scope the inline-HTML pass and the inline-math/footnote passes to `view.visibleRanges` (as the main decoration walk already does at `:919`) — block decorations are the only things that need the whole doc, and their scans are line/syntax-tree cheap if limited to the candidate node types (they already are; measure before optimising the field).
- Cache `frontmatterRange`, `findMath` and `footnoteScanOf` per document version (memoise on `state.doc` identity) instead of recomputing them twice.
- Stop storing `content` in `cmSelection`: store a doc-version/hash (`state.doc.length` + a monotonically bumped epoch) and validate lazily; or store the selection only on blur/unmount (it is used for restart/switch restore, not for live rendering).

#### ED-17 — Image alignment destroys alt text (P2, S)
**Evidence**
```ts
// renderedBlockHelpers.ts:31-47
export function parseImageAlt(alt: string): ImageAlt {
  const parts = String(alt ?? "").split("|");
  const ratio = ... ; const align = ...;
  return { ratio, align };
}
export function withImageAlign(alt: string, align: ImageAlign): string {
  const { ratio } = parseImageAlt(alt);
  return `${ratio}|${align}`;
}
```
```ts
// renderedBlockActions.ts:870-879
const m = /^!\[([^\]]*)\]/.exec(text);
const newAlt = withImageAlign(m[1], align);
this.view.dispatch({ changes: { from: altFrom, to: altFrom + m[1].length, insert: newAlt } });
```

**Impact / repro**
`![屏幕截图](img.png)` + click “居中” → `![1.00|center](img.png)`. The alt text is gone (accessibility + source data loss), and the rendered missing-image fallback now reads “1.00|center”. The convention is inherited from Crepe, but this editor’s only image UI is the align bar, so every alignment click is destructive.

**Fix**
Do not reuse alt for editor metadata. Either encode alignment in the URL fragment (`img.png#center`) / title, or keep a leading sentinel form only when the alt already matches the `ratio|align` grammar (i.e. `if (/^\d|\.\d+\|(left|center|right)$/.test(alt))`), otherwise append a title/`style`-free convention. At minimum: read/preserve the human part — parse `ratio` and `align` only when the alt matches the legacy pattern, and otherwise keep the alt and record alignment via the image title (`![alt](src "center")`), which `emitLinkOrImage` already supports.

#### ED-18 — i18n coverage: hardcoded user-visible strings (P2, M)
See §4 for the full (post-refactor, 01:20) inventory. Highlights that remain: image-align labels hardcoded **Chinese** in an English UI (keys exist), the entire slash menu Chinese-only, settings `"Off"`, status bar `Ln n, Col m`, `confirm("Delete …?")`, Mermaid `rendering diagram…`, bubble-toolbar tooltips English-only, and the new `ui/Modal` default `closeLabel = "关闭"` (Chinese for screen readers in the English UI). Content inserted into the document is also Chinese-only (`列 1`, `列 2`). Several items that were hardcoded at audit start were fixed by the concurrent refactor (welcome button, Outline header, settings font preview, Titlebar icon labels) — see §5.

#### ED-19 — Shortcut registry vs implementation mismatch (P2, M)
**Evidence**
`ShortcutsPanel.tsx:21-72` advertises: Ctrl+S (`:29`), Ctrl+N (`:25`), Ctrl+Shift+C inline code (`:61`), Ctrl+1…6 / Ctrl+0 headings (`:59`). Search of the tree:
- Ctrl+S: no handler (`grep "mod.*s"`; AppShell handles `w` but not `s`). Auto-save makes it non-critical but the panel lies.
- Ctrl+N: only inside the file tree (`FileTree.tsx:276`); no global handler, so it is dead while editing.
- Inline code: `markKeymap` binds **Mod-e** (`livePreviewInteractions.ts:327`) — an undiscoverable/undocumented key; the advertised Ctrl+Shift+C does nothing.
- Ctrl+1…6 / Ctrl+0: **not implemented** although PRD §3.8 requires them.
Also `Mod-Shift-h` (highlight) is bound but highlight is not in the PRD/shortcut panel.

**Fix**
Decide the canonical table and make both sides agree: add heading shortcuts (replace/prefix the leading `#` run — trivial text edit on the current line) plus Ctrl+0, bind inline code to Ctrl+Shift+C (keep Mod-E as an undocumented alias or drop it), add a global Ctrl+N and Ctrl+S (force `saveCurrentDocument()`), and generate the ShortcutsPanel rows from one exported constant so it cannot drift.

#### ED-20 — Modal/overlay accessibility and Escape layering (P2, M)
**Evidence** *(SettingsDialog was migrated to `ui/Modal` during this audit — that part is fixed; the rest is re-verified at 01:20)*
- `SearchPanel.tsx:100-111`: plain `div` scrim with `onClick`, panel `div`, no `role`, no `aria-modal`, no focus trap, no focus restore. Results are `div`s (keyboard nav is a global listener, not roving focus).
- `QuickOpen.tsx:80-97`: same.
- `ShortcutsPanel.tsx:12-18`: same, plus no `role="dialog"`/`aria-label`.
- `zoomOverlay.ts:80-234`: overlay `div`, close button, Escape handler, no focus move/trap/restore (focus stays in the editor); resize handles are mouse-only.
- Escape layering: `FindReplaceBar.tsx:145`, `ShortcutsPanel.tsx:14`, `SearchPanel.tsx:73`, `QuickOpen.tsx:62`, `TabBar.tsx:141-147`, `zoomOverlay.ts:231-234` each register independent `window` keydown listeners → a single Esc closes every open layer (e.g. find bar + tab context menu simultaneously). The new `ui/Modal` also adds its own window listener without stopping propagation.
- SettingsDialog now calls `ui/Modal` (`SettingsDialog.tsx:125`, imports `:5-25`) which supplies `role="dialog" aria-modal="true"`, a Tab trap and focus restore — the pattern to copy. `settings.general/about` were added to i18n during the refactor.
- The repo-level fix is therefore clear and cheap: migrate SearchPanel/QuickOpen/ShortcutsPanel to `ui/Modal`, and give zoomOverlay the same focus contract.

**Impact**
Screen-reader users cannot tell a dialog opened or where focus is; keyboard users tab straight into the editor behind the modal; after closing any dialog focus is lost to `<body>` (typing does not resume). This is explicitly in scope for this audit (a11y, not styling).

**Fix**
Migrate all four dialogs + zoom overlay to `ui/Modal` (or copy its pattern), add `aria-label` to icon buttons, and introduce a small overlay stack (one document-level Escape handler that pops the top layer) so Esc semantics match UX-REVIEW §6.1. Add focus-restore tests (§6).

#### ED-21 — Rendered-block controls are mouse-only and semantically inert (P2, M)
**Evidence**
```ts
// widgets.ts:154-183 — task checkbox
const wrap = document.createElement("span"); ... const box = document.createElement("span");
box.className = "cm-zn-task-box"; box.textContent = this.checked ? "✓" : "";
box.addEventListener("mousedown", ...); box.addEventListener("click", ...);
```
```ts
// widgets.ts:802-832 — footnote chip
const el = document.createElement("sup"); el.className = "cm-zn-footnote-ref";
el.addEventListener("mousedown", e => { ... });
```
```ts
// widgets.ts:886-901 — TOC rows
const row = document.createElement("div"); row.className = `cm-zn-toc-item ...`;
row.addEventListener("mousedown", ...);
```
Image align bar is opened from a mousedown handler (`renderedBlockActions.ts:801-812`); table cells are contenteditable but there is no keyboard route into them from the editor (Tab is `indentWithTab`).

**Impact**
- Task lists: no `role="checkbox"`, no `aria-checked`, not focusable → keyboard and screen-reader users cannot toggle `[ ]`; the visible state is a `✓` text glyph.
- TOC widget entries and footnote chips: not focusable, no role/label.
- Images: alignment unavailable without a mouse.
- Table cells: a keyboard-only user cannot enter a table at all (Tab is consumed by indentation).

**Fix**
Task: use a real `<input type="checkbox">` (or `role="checkbox" tabindex="0" aria-checked` + Space/Enter handler) and keep the mousedown preventDefault so the caret doesn't move. TOC/footnote: `<button>`/`<a href="#fn">` with `tabindex="0"` and Enter/Space. Image bar: also open via keyboard (e.g. when the caret touches the image range, show the bar, or add an “image actions” item to the context menu). Table: `Mod-Enter`/arrow-from-below to move into the table, Escape to return, and Tab navigation inside cells already exists (`wireCell`).

#### ED-22 — Math scanner is not code-aware (P2, S)
**Evidence**
```ts
// livePreview.ts:399-448 findMath(doc) — iterates every line, no fence/code skip
for (let n = 1; n <= doc.lines; n++) {
  const line = doc.line(n);
  ...
}
```
Call sites add no code filter: `:815-824` (display math block decorations), `:1154-1161` (inline math widgets), and `markdownToHtml.ts:140,164` (export). Compare `footnoteScanOf`, which *does* build a skip list (`widgets.ts:761-779`) — the pattern exists but was not applied to math.

**Impact / repro**
````markdown
```text
x = $a+b$
```
````
→ the `$a+b$` inside the code block renders as a KaTeX formula (in the preview and in the HTML export). A code sample that documents `$$` display math gets replaced by a rendered formula, i.e. the code the user is writing becomes unreadable.

**Fix**
Compute the code skip ranges once (`syntaxTree → FencedCode/InlineCode/CodeText`, plus frontmatter) and pass them into `findMath` (or filter the results at every call site, but a shared helper avoids the next omission). Add the test in §6.

#### ED-23 — Ordered-list auto-numbering and completed-task styling missing (P2, M)
**Evidence**
```ts
// livePreview.ts:954-958
const text = doc.sliceString(nFrom, nTo);
const indent = nFrom - doc.lineAt(nFrom).from;
const depth = Math.floor(indent / 2);
const ordered = /^\d/.test(text) ? text : null;
markRange(nFrom, pastSpace(nTo), new BulletWidget(ordered, depth));
```
`BulletWidget` (`widgets.ts:110-135`) prints `this.ordinal` = the **source** number. There is no counter over siblings. For task lines, `buildDecorations` applies no line class for completed state; `livePreviewTheme.ts:449-457` `.cm-zn-task-on` styles only the checkbox glyph.

**Impact / repro**
A lazy-numbered ordered list (`1.` on every line, which users type and Typora renumbers) renders as `1. 1. 1.` — MARKDOWN-RENDERING §3.4 says WYSIWYG numbering is computed and the source may repeat `1.`. Completed tasks `- [x] done` show a checked box but the text is neither struck nor dimmed (§3.5 “已完成：文字颜色变淡 + 删除线”).

**Fix**
Walk `BulletList` siblings when handling `ListMark`: for ordered lists compute the ordinal from the list start + item index and pass that to `BulletWidget`. For tasks, style the line (`Decoration.line({class:"cm-zn-task-done"})` on the parent `ListItem` line when the TaskMarker is `[x]`/`[X]`) and add the strike/dim rule to the theme.

#### ED-24 — Outline: silent mode switch, leaked interval, parser/grammar drift (P2, S)
*(refactor in flight: the header is now i18n'd and the rows restyled; the logic below is unchanged — lines re-verified 01:20)*
**Evidence**
```ts
// Outline.tsx:96-104
if (sourceMode) {
  setSourceMode(false);
  let tries = 0;
  const timer = window.setInterval(() => {
    tries++;
    if (scrollToHeading(displayIdx) || tries > 40) window.clearInterval(timer);
  }, 100);
  return;
}
```
The interval is a local const; the component's cleanup (`:73-76` cancels only `scrollTimer`) cannot clear it, so it keeps firing for up to 4 s after unmount/navigation. And `parseHeadings` (`domain/document.ts:10-40`) is a regex line parser that:
- ignores setext headings (`===` / `---` underlines) that the editor **renders** as `cm-zn-h1/h2` (`livePreview.ts:641-643`);
- requires `#` at column 0, so 1–3-space-indented ATX headings (valid, rendered by the editor) are missing;
- does not see headings inside blockquotes (rendered by the editor);
- treats any file starting with `---` as frontmatter until the next `---` (a genuine horizontal rule at the top can swallow the outline).

**Impact**
Clicking an outline row in source mode changes the editing mode without the user asking (PRD §3.3.2 says mode is a user choice); leaked timer; outline and editor disagree on what a heading is.

**Fix**
Keep the user in source mode and scroll the source view (dispatch `EditorView.scrollIntoView` on the source view), or ask before switching. Move the retry loop into a `useRef` cleaned up in `useEffect`. Derive the outline from the same parser the editor uses (re-use the lezer parse used by `livePreview`/`markdownToHtml`), or document the simplified parser as intentional and add setext/indent support.

---

### P3

#### ED-25 — Footnote code exclusion is line-start-only (P3, S)
```ts
// footnotes.ts:96  (scanFootnotes)
if (inAny(line.from, skip)) continue;
```
`footnoteScanOf` puts each `InlineCode` node in `skip` (`widgets.ts:770-772`), but `scanFootnotes` only tests the **line start**, so an inline-code range in the middle of a line never excludes that line. Repro: ``这里是 `[^1]` 代码`` → `[^1]` renders as a footnote chip inside the code span. Fix: test each candidate range against `skip` (the scanner already computes absolute `from/to` for refs), or pass per-line exclusion ranges.

#### ED-26 — Slash-menu indented multi-line insert misplaces the caret (P3, S)
```ts
// slashMenu.ts:102-110
const indent = /^(\s*)/.exec(view.state.doc.lineAt(match.from).text)?.[1] ?? "";
const body = item.insert.split("\n").join("\n" + indent);
const caret = match.from + body.length + (item.caretOffset ?? 0);
```
`caretOffset` is fixed relative to the **end**, but `body` grows by `indent.length` for every continuation line. For `  /code` (indent = 2, code-block `caretOffset = -4`) the caret lands 4 chars left of the intended empty middle line — inside the closing fence's indent (`body` length 12, caret at +8, empty line starts at +4). Verified by arithmetic; the existing test (`livePreviewInteractions.test.ts:228-246`) only covers the non-indented case. Fix: compute the caret from the insert's line structure (e.g. `body.indexOf("\n") + 1 + indent.length`) instead of a constant offset.

#### ED-27 — Find/Replace polish (P3, S) *(line numbers re-verified 01:20; the close-button tooltip was fixed in the refactor)*
- `lib/findQuery.ts:40-47`: when `opts.regex` is true the `wholeWord` toggle is ignored (silently); UI allows both to be on. Either wrap the regex with lookarounds or disable the button in regex mode.
- `FindReplaceBar.tsx:84-103`: when `jumpToLine` resolves to index 0 the code only sets `currentIdx` and never selects/scrolls the match (the dead preset path means this is latent until ED-02 is fixed).
- `FindReplaceBar.tsx:71-80`: after replace-all, `matchCount` is forced to 0 without re-running the search, so the counter lies if the replacement text still matches.
- Wrapping silently wraps from last→first with no notice (UX-REVIEW P2-3 asks for “已到达末尾，从开头继续”).

#### ED-28 — FileTree context menu can render off-screen; not keyboard accessible (P3, S)
```ts
// FileTree.tsx:46
<div ref={menuRef} style={{ position: "fixed", left: state.x, top: state.y, zIndex: 1000, ... }}>
```
No viewport clamp (contrast `TabBar.tsx:161-162`, which clamps correctly). Right-click near the bottom/right edge → the menu is partly/fully off-screen with no way to scroll to it. Items are `<div onClick>` (`:48`), no `role="menu"`, no Escape, no arrow-key navigation. Fix: reuse `ui/Menu.tsx`'s `ContextMenu` (viewport-clamped + `useDismiss`) or apply the TabBar clamp; render items as buttons and focus the first item on open.

#### ED-29 — No empty/loading/error editor state (P3, S)
`LivePreviewEditor.tsx:275-291` renders only `ConflictBanner + FindReplaceBar + empty host`; the host stays blank when `currentFilePath` is null (`:75` early-returns from the view-creation effect). i18n keys `editor.openNote`, `editor.loading`, `editor.initFailed` exist in both locales but are referenced nowhere (verified by key scan). PRD/UX expect “打开一篇笔记开始写作”. Fix: render the empty state when no file; render a loading/error state around the editor host.

#### ED-30 — Dead code / leftovers (P3, S)
Verified by grep:
- `store/slices/editorSlice.ts:65-70, 139, 146, 159, 222, 233, 280-283`: `pmSelection` / `setPmSelection` / `editorRef` / `setEditorRef` are ProseMirror/Сrepe leftovers; nothing sets them outside tests (`storeSlices.test.ts`).
- Duplicate helpers: `livePreview.splitTableRow` (`livePreview.ts:528-541`) is a verbatim clone of `renderedBlockHelpers.cellsOf` (`:54-67`); both are live (`parseTable` vs table editing) → one must be deleted or made an alias.
- `livePreviewInteractions.ts:102-118`: `const rel = ...; void rel;` dead statement in `insertLink`.
- `LivePreviewEditor.tsx:251-253`: dead `findPreset` state + `void setFindPreset`.
- `livePreviewTheme.ts:13-21`: exported `LIVE_PREVIEW_FONT/SERIF/MONO` are referenced nowhere; `:705` `.cm-zn-li {}` is an empty class never emitted by the decoration pass.
- `services/imageService.ts:74-94`: `copyImageToClipboard` (and its helper) has no caller — prepared for the missing image toolbar (ED-31/PRD §2.7).
- Stale comments: `AppShell.tsx:325-326` “Find & replace and the table/image menus are wired to the Crepe view today; they move onto this one in Phase 4” (Crepe is gone); `SourceEditor.tsx:29` comments referencing a find-bar integration that doesn't exist; `codeHighlight.ts:1-11` header still describes the Crepe editor.
- Confirmed **not** leftover: `src/App.css`, `src/assets/react.svg|vite.svg|hero.png` existed at audit start but were removed by the concurrent refactor (verified absent now). No action.

#### ED-31 — Export/HTML renderer defects (P3, M)
- `markdownToHtml.ts:541-555` (`emitToc`): on a level **decrease** the code emits `"</li>" + "</ul></li>".repeat(level - h.level)` and then the closing tail `"</li>" + "</ul></li>".repeat(Math.max(0, level - 1)) + "</ul></nav>"`; with a skipped level (h1 → h3) more `</ul>` are emitted than opened, so the exported TOC HTML is unbalanced. Fix: build a real tree (or a level stack) and serialize per-heading opens/closes.
- `markdownToHtml.ts:149-159` (`scanFootnotes(this.doc)`): export does not skip fenced code, so `[^1]` inside a code sample becomes a footnote/`<sup>` — inconsistent with the editor (`footnoteScanOf` skips fences).
- `widgets.ts:322-329`: table-cell links are real `<a href>` elements with only `stopPropagation`; there is no click interception or `target`/rel. Medium confidence: in the Tauri window this may navigate the whole webview away from the app instead of opening the system browser — verify in the desktop build and either route through `openExternal` (ED-11) or use a non-navigating element until then.

#### ED-33 — Undo history discarded on settings change (P3, S)
`LivePreviewEditor.tsx:215`: the view-creation effect depends on `[currentFilePath, tabSize]`; `SourceEditor.tsx:179`: `[currentFilePath, tabSize, editorPadding]`. Changing tab size (or dragging the page-margin slider in source mode) destroys and recreates the `EditorView` → undo history lost mid-edit, and the caret/scroll is only approximately restored via `cmSelection`/`scrollPosition`. Fix: use a `Compartment` for `tabSize`/`indentUnit` (and CSS var for padding, as Live Preview already does at `:64-66`).

#### ED-34 — Dirty/save-error state semantics (P3, S)
`editorSlice.ts:187`: `setContent` always sets `isDirty: true`, so undoing back to the saved text keeps the “未保存” dot and keeps autosaving identical content. `saveCoordinator.ts:38-42` sets `saveError` on failure and only clears it on the next success — PRD §3.8 specifies a ~3 s transient status-bar message for autosave failure (a persistent error is defensible, but it should be a deliberate decision). Fix: compare against the last saved snapshot (hash) to clear `isDirty`; if the persistent error is intended, say so in the PRD.

---

## 3. Requirement-gap matrix (editor/interaction spec)

Legend: ✅ implemented, ◐ partial, ❌ missing.

| Spec | Requirement | Status | Evidence |
|------|-------------|--------|----------|
| MARKDOWN §2.1/2.2 | Delimiters appear when the caret is **inside** a mark | ◐ | only boundary-touch reveals (`livePreview.ts:860, 868-880`); see ED-09 |
| §2.3 | Bold-italic `***x***` | ✅ | grammar + `StrongEmphasis/Emphasis` handling |
| §2.4 | Strikethrough | ✅ | `Strikethrough` + marks |
| §2.5 | Inline code (multi-backtick) | ✅ rendering; shortcut mismatch ❌ | ED-19 |
| §2.6 | Links clickable → system browser; autolinks; Ctrl+K | ◐ Ctrl+K ✅, click ❌, autolink ❌ | ED-11 |
| §2.7 | Image lightbox on click; toolbar (replace/copy/delete); failed-image alt | ◐ align bar + zoom; no toolbar/lightbox-on-click; alt fallback ✅ | ED-17 |
| §3.1 | Headings render; Ctrl+1..6/0 | ◐ rendering ✅, shortcuts ❌ | ED-19 |
| §3.2 | Blockquote (no lazy continuation first phase) | ✅ | |
| §3.3 | List markers render; Enter continues; Tab nests; Shift+Tab | ◐ rendering ✅, automation ❌ | ED-06 |
| §3.4 | Ordered auto-numbering | ❌ | ED-23 |
| §3.5 | Task checkbox toggles source; completed styling | ◐ toggle ✅ (mouse), styling ❌, a11y ❌ | ED-21/ED-23 |
| §3.6 | Horizontal rule | ✅ | |
| §3.7 | Code block: language chip + copy + highlight | ✅ (unknown language keeps name; copy feedback ✅) | |
| §4.1 | Mermaid: render, edit toggle, error, timeout/retry, theme re-render | ◐ render/theme re-render ✅, error/timeout ❌ | ED-12 |
| §4.3 | Frontmatter only at document start, rendered as a block | ✅ (panel instead of plain paragraph — acceptable) | `frontmatterRange` + `FrontmatterWidget` |
| §5.1 | Symbol auto-pairing + smart skip + wrap selection | ❌ | ED-06 |
| §5.2 | Fence auto-close; table-row continuation | ❌ | ED-06/ED-08 |
| §5.3 | List auto-continue / exit on empty item | ❌ | ED-06 |
| §5.4 | Ctrl+K link; paste URL over selection → link | ✅ | `insertLink`, paste handler |
| §6.1 | Paste text (rich text stripped) | ✅ | CodeMirror default |
| §6.2 | Paste image → assets; >10 MB confirm; unsupported format message | ✅ (`imageUpload.ts`) | |
| §6.3 | Drag & drop (images, `.md`, tree moves) | ❌ | ED-13 |
| §7 | Undo granularity (auto-pair/continuation atomic) | ◐ toggles are atomic; automation absent | ED-06 |
| PRD §3.2 | Tree: md-only filter, context menu, drag-move, dirty dot, collapse persistence, 200 ms animation | ◐ dirty dot ✅, filter ✅, context ✅ (partial), drag ❌, persistence ❌ | ED-13/14/28 |
| §3.2a | Inline new/rename; invalid chars; `.md` prefill; trash+undo; expand-to-new | ❌ (native dialogs) | ED-07 |
| §3.2b | Global search: debounce, previews, highlight, click→jump, red no-result state | ◐ jump ❌, red state ❌, rest ✅ | ED-02 |
| §3.2c | Panel drag + width persistence + min widths | ◐ drag ✅, persistence ❌ | ED-14 |
| §3.2d | External change banner / deleted-file statusbar / silent tree refresh | ✅ (banner + conflicts; no “save as” affordance for deleted file) | |
| §3.3.2 | Ctrl+` mode toggle; keep caret line; remember last mode | ◐ caret line ✅ (both editors restore Ln/Col), mode memory ❌ | ED-10 |
| §3.3.4 | Table: WYSIWYG, `|` create, toolbar insert N×M, right-click menu, column resize, bold header | ◐ create via slash only, menu partial, resize ❌ | ED-08 |
| §3.3.6 | Paste/drag images into `images/`; click-to-enlarge | ◐ paste ✅ (saves to `assets/`, not PRD's `images/`), drag ❌, click ❌ (align bar instead) | ED-13 |
| §3.4 | Outline: right side, h1–h3, indent, click jump, scroll sync 100 ms, empty text | ◐ right side ✅ (fixed by the in-flight refactor), jump/sync broken on long docs ❌, empty text ✅ | ED-05/ED-24 |
| §3.8 | Undo/redo, find/replace, autosave 500 ms, pairing, structure completion, Tab list indent, Ctrl+B/I/K/X/1-6/0 | ◐ many missing | ED-01/ED-06/ED-19 |
| §3.11 | Save before switch, cache scroll/cursor, fade transition | ◐ save/cache ✅, fade ❌ (visual), external scroll restore ✅ | |
| §3.14 | Tree keyboard nav (↑↓←→ Enter F2 Del Ctrl+N/Ctrl+Shift+N) | ◐ partial (see ED-15; Ctrl+N only when tree focused, F2/Del ✅) | ED-15 |
| §3.13 | F1 shortcuts panel, grouped, Esc | ✅ (content mismatch ED-19) | |
| PRD §4 | 10 k-line editing without noticeable lag | ◐ at risk (ED-16) | |
| UX §6 | Esc closes topmost layer; Ctrl+W closes note; Ctrl+Click link | ◐ Ctrl+W ✅ (discard confirm), Esc layering ❌, Ctrl+Click ❌ | ED-20/ED-11 |

---

## 4. Hardcoded-string inventory (bypassing `t()`)

Re-scanned against the working tree at 01:20 (after the concurrent refactor). Items that were
hardcoded before the refactor and are now fixed: welcome button (`Open Folder` → `t().welcome.openFolder`),
Outline header (`Outline` → `t().outline.title`), SettingsDialog `字体预览 Aa` (pane rewritten),
Titlebar icon-button labels, find-bar close tooltip. Remaining:

| # | File:line | Literal | Notes |
|---|-----------|---------|-------|
| 1 | `editor/livepreview/renderedBlockActions.ts:830-832` | `左对齐` / `居中` / `右对齐` | `t().editor.align_left/center/right` exist; **English UI shows Chinese** |
| 2 | `editor/livepreview/slashMenu.ts:37-57` | `标题 1/2/3`, `无序列表`, `有序列表`, `任务`, `引用`, `代码块`, `公式块`, `行内公式`, `表格`, `分隔线`, `图片`, `链接` | Entire slash menu is Chinese-only; English UI shows Chinese commands |
| 3 | `editor/livepreview/slashMenu.ts:50` | `| 列 1 | 列 2 |` | Table headers inserted into the document are Chinese-only |
| 4 | `editor/livepreview/renderedBlockHelpers.ts:185` | `` `列 ${i+1}` `` | Same (new-table default headers) |
| 5 | `editor/livepreview/livePreview.ts:1184` | `rendering diagram…` | Mermaid placeholder; English in zh UI (and the failure path has no text at all — ED-12) |
| 6 | `editor/livepreview/livePreviewInteractions.ts:31-35` | `Bold  Ctrl+B`, `Italic  Ctrl+I`, `Strikethrough  Ctrl+Shift+X`, `Inline code  Ctrl+E`, `Highlight  Ctrl+Shift+H` | Bubble-toolbar tooltips, English-only |
| 7 | `editor/livepreview/livePreviewInteractions.ts:187` | `Link  Ctrl+K` | Same |
| 8 | `layout/StatusBar.tsx:66` | `Ln {cursorLine}, Col {cursorCol}` | zh UI shows “Ln 3, Col 5”; PRD §3.5 asks for 行号/列号 |
| 9 | `dialogs/SettingsDialog.tsx:49` | `"Off"` | Auto-save-disabled label in an otherwise i18n'd pane |
| 10 | `filetree/FileTree.tsx:176` | `prompt("New name:", oldName)` | English prompt in zh UI (part of ED-07) |
| 11 | `filetree/FileTree.tsx:205` | `confirm("Delete \"" + name + "\"?")` | English confirm in zh UI (part of ED-07) |
| 12 | `components/ui/Modal.tsx:44` | `closeLabel = "关闭"` default | New shared primitive; an English UI gets a Chinese screen-reader label unless every caller passes `closeLabel` |
| 13 | `layout/Titlebar.tsx:192-196` | `Switch to English` / `切换为中文` / `中`/`EN` | Paired literal; acceptable-ish (language names) but not in i18n |
| 14 | `editor/livepreview/livePreviewInteractions.ts:99,120,124` | `"text"` placeholder label | Content inserted by Ctrl+K for an empty selection |
| 15 | `editor/livepreview/widgets.ts:973` | `YAML` | Format name; low priority |
| 16 | `lib/markdownToHtml.ts:537` | `"目录"` fallback for `tocTitle` | App always passes `t()`, so only direct callers/tests see it |
| 17 | `lib/exportNote.ts:308,323,341,346,394,401,409` | `正在导出 PDF…`, `PDF 导出失败: …`, `PDF 导出成功 ✓` | Out of this audit's scope (export), but the same class of defect |

Related non-string i18n gaps (keys defined in both locales but **unreferenced** — verified by key scan; the i18n shadow of missing UI/features):
`t().editor.align_*`, `t().table.insertRowAbove/insertColLeft/selectRow/selectCol/selectTable`,
`t().editor.bigFileHint/switchToSource/dismiss`,
`t().editor.copyPlainText/copyMarkdown/copyImage/deleteImage/copyingImage/imageCopyFailed`,
`t().editor.openNote/loading/initFailed`, `t().filetree.noteName`, `t().settings.installNow`.
(`t().outline.title` is now referenced; `t().titlebar.restore` is used by the refactored Titlebar.)

---

## 5. Verified false alarms / things checked and found sound

These were on the audit checklist and are **not** defects (don't “fix” them):

1. **Frontmatter detection** — `frontmatterRange` correctly refuses a leading `---` followed by a blank line; it is covered by `livePreview.test.ts:30-55`. The “3 lines minimum” is intentional.
2. **Sanitization** — `HtmlBlockWidget` content passes through `sanitizeHtmlFragment` (DOMPurify, script/iframe/style/form tags removed), Mermaid SVG through `sanitizeSvg` with CSS `url(#…)` preserved; no XSS path found in the editor rendering. `markdownToHtml` refuses `javascript:`/`data:` link targets (`:62-69`).
3. **Replace-all offsets** — `FindReplaceBar.cmReplaceAll` computes matches in original coordinates and sends one `changes` array; CodeMirror applies them correctly (no off-by-one). `findQuery` regex escaping/Unicode whole-word boundaries are correct.
4. **Table widget event suppression** — `TableWidget.ignoreEvent() === true` is deliberate and required so native text selection/copy inside cells works; the cell-edit commit via blur/Tab/Enter (`wireCell`) is well thought through (only the export/test gaps remain).
5. **Context-menu viewport clamping** — `TabBar`'s context menu (`TabBar.tsx:161-162`), the image align bar (`renderedBlockActions.ts:861-866`), table menu (`:990-994`), bubble toolbar (`livePreviewInteractions.ts:243-252`), slash menu (`slashMenu.ts:186-194`) and code-language menu (`widgets.ts:553-558`) all clamp correctly. Only the **FileTree** menu does not (ED-28).
6. **Mermaid theme re-render on light/dark switch** — implemented via `scheduleDocumentPreload` on `resolvedMode` (`LivePreviewEditor.tsx:53-60`) with a mode-keyed cache; not a bug.
7. **Image paste** — both surfaces upload through `prepareImageUpload` (size confirm >10 MB, unsupported-format message, statusbar “处理中”) and insert a relative reference; only drag-and-drop is missing (ED-13).
8. **Ctrl+B collision with “toggle sidebar”** — AppShell correctly checks `isEditableTarget` and returns, so the editor keymap wins while typing (`AppShell.tsx:363-367` in the current build).
9. **`sourceMode` switch keeps the cursor line** — both editors restore `cursorLine/cursorCol` from the store on mount; PRD §3.3.2's caret requirement is met.
10. **Code-block chrome** — language chip/copy button are correctly withheld only while the opening fence line is edited (`livePreview.ts:990`), so clicking into code does not duplicate the language label.
11. **Template leftovers** — `src/App.css`, `src/assets/react.svg|vite.svg|hero.png` were present at audit start but have been removed in the working tree (verified); no action.
12. **`htmlRender.renderInnerMarkdown`** — regex-based but always passed through DOMPurify; malformed input degrades to text, not XSS.
13. **Outline placement (was ED-32)** — flagged early as “outline on the left, PRD says right”. Verified fixed by the concurrent refactor: the current `AppShell.tsx:500-508` renders `<Outline />` after the editor and inverts the drag delta for the right-hand handle (`:339-344`). Finding removed; re-verify after the refactor settles.
14. **Several i18n/a11y items were fixed mid-audit** — welcome button, Outline header, SettingsDialog (`ui/Modal` focus trap + font preview pane), Titlebar icon labels, find-bar aria. They are listed in the §4 preamble, so don't chase the pre-refactor versions of those lines.
15. **The new `src/components/ui/*` kit is the intended fix vehicle** — `Modal.tsx` already implements `role="dialog" aria-modal="true"`, Tab trap and focus restore; `Menu.tsx` implements Escape/outside-dismiss and a viewport-clamped `ContextMenu`. Use it rather than writing another overlay implementation.

---

## 6. Test coverage gaps and proposed cases

The suite is strong for pure helpers (473 tests; `renderedBlockHelpers`, `findQuery`, `livePreview`, `footnotes`, `markdownToHtml`, stores). Structural gaps:

**Untested components (no test imports them):**
- `LivePreviewEditor.tsx` — the central editor shell: view lifecycle, content sync, find routing, paste URL/image.
- `AppShell.tsx` — global shortcuts, autosave timer, session persistence payload, panel resizing, welcome state.
- `Titlebar.tsx`, `ConflictBanner.tsx`, `renderedBlockActions.ts` (only its pure helpers are tested), `zoomOverlay.ts`.
- No test asserts the SourceEditor has (or will have) a find bar.

**Proposed test cases (highest value first):**

1. `LivePreviewEditor` — **external reload applies even when the view has focus** (mirror `SourceEditor.test.tsx:22-32` with `reloadTick`), and content sync is *not* applied from a bare `content` change while focused (documents the intentional guard).
2. `LivePreviewEditor` — **Ctrl+F/H opens the bar only in this mode; Source mode has its own bar** (after ED-01): render each surface, fire keydown, assert `screen.getByPlaceholderText('查找...')`.
3. `AppShell` — **Ctrl+H / search-result event reaches a mounted bar**: render AppShell with a stub editor, dispatch `zn-find-open`, assert the query input is filled (`after ED-02`).
4. `SearchPanel / QuickOpen / FindReplaceBar` — **IME guard**: `fireEvent.keyDown(window, { key: "Enter", isComposing: true })` must not open a file / call `findNext`; same for ArrowDown (`after ED-03`).
5. `FindReplaceBar` — **Enter inside the document does not hijack**: render bar visible with a query, fire `keyDown` on a `div` outside the bar → no `findNext`/no `preventDefault` (assert via `defaultPrevented`); and jumping must leave `document.activeElement` as the find input (after ED-04).
6. `Outline` — **jump targets the right heading when headings are virtualized**: seed 30 headings in the store, render only 5 fake `.cm-zn-h2` nodes, click row 20 → implementation must dispatch a selection at `heading.pos` (offset), not call `scrollIntoView` on an arbitrary DOM node. Also assert the active-row highlight maps correctly after simulated scroll.
7. `livePreview` — **math inside fenced code is not rendered**: decorate ` ```text\n$A$\n``` ` → expect no `MathWidget` (and `findMath` returns nothing when given code skip ranges). Same for `renderMarkdownToHtml` (`$` in a fence stays escaped source).
8. `renderedBlockActions` — **cell serialize round-trip** (export `serializeCell` for testability): plain, `<span class="cm-zn-inline-strong">`, link `<a href>`, escaped `\|`, empty strong run, `<br>` → expected markdown; and **image align preserves author alt** (ED-17).
9. `livePreviewInteractions` — **Ctrl+B with caret inside `**bold**` removes both delimiters** (ED-09), plus inside `*i*`, `` `c` ``, `~~s~~`.
10. `FindReplaceBar` — **whole-word + regex combination** (either applied or the toggle disabled), and replace-all counter recomputed.
11. `LivePreviewEditor`/`SourceEditor` — **task checkbox click toggles source** with a real `EditorView` (`posAtDOM` + dispatch) and undo restores `[ ]`.
12. `zoomOverlay` — Escape/backdrop close and focus restoration to the zoom button (ED-20).
13. `FileTree` — keyboard after click (focus container), focused-row `scrollIntoView`, inline new/rename Enter/Esc and invalid-character rejection (`after ED-07`).
14. **i18n guard test** — render each dialog/panel with `setLocale("en-US")` and assert `document.body.textContent` has no CJK characters; render with `zh-CN` and assert it has no known English chrome literals (`Open Folder`, `Ln `, `rendering diagram`, `New name:`). This is the cheapest way to keep ED-18 from regressing.
15. `AppShell` — session payload includes `recentWorkspaces` / `expandedFolders` / panel widths (ED-14); `sourceMode` survives a file switch (ED-10).
16. `livePreviewWidgetHeight` — add a test that a Mermaid failure produces an error widget with an i18n message + retry (ED-12), using an injected failing renderer.
17. Perf smoke test (jsdom): build a 5 000-line doc and assert `buildBlockDecorations`/`buildDecorations` invocation time under a budget with `performance.now()`; guards ED-16 against regression (jsdom timings are noisy — set a generous ceiling, assert call *count* of `tree.iterate`/`findMath` instead, which is deterministic).

---

## 7. Suggested fix order (top 10)

1. **ED-03 IME guards** (S) — one line per window handler; highest harm/effort ratio for a zh-first app.
2. **ED-02 + ED-01 find/replace wiring** (S+M) — add the `zn-find-open` listener, hoist the bar to AppShell so both modes have it; unblocks search→jump and Ctrl+H.
3. **ED-04 find-bar focus/Enter semantics** (S) — scope Enter to the bar, stop `view.focus()` stealing, restore focus on close.
4. **ED-05 outline navigation by document position** (M) — replaces the DOM-index hack; also fixes ED-24's mode switch if done with the source view.
5. **ED-06 markdown automation** (M) — `insertNewlineContinueMarkup`/`deleteMarkupBackward` + pairing input handler; biggest daily-typing win.
6. **ED-07 inline file operations** (L) — inline rename/new, validation, `.md` enforcement, error surfacing, trash/undo.
7. **ED-08 table interaction completion** (M) — right-click menu, insert above/left, `|`-create, column resize.
8. **ED-09 cursor-aware mark toggles + ED-17 alt preservation** (S) — small, prevents source corruption.
9. **ED-18/ED-19 i18n + shortcut truthing** (M) — use `t()` for the inventory, implement/add Ctrl+S, Ctrl+1..6/0 and fix the inline-code key; single source for the shortcut table.
10. **ED-11 link opening + ED-12 Mermaid error/timeout** (M) — round out the two most visible rendering expectations; then ED-16 performance (M) before any “large file” claim.

---

## 8. Appendix — files reviewed

Editor core: `livepreview/{LivePreviewEditor.tsx, livePreview.ts, livePreviewInteractions.ts, livePreviewTheme.ts, markdownExtensions.ts, widgets.ts, renderedBlockActions.ts, renderedBlockHelpers.ts, slashMenu.ts, footnotes.ts}`, `editor/{SourceEditor.tsx, FindReplaceBar.tsx, ConflictBanner.tsx, codeHighlight.ts, zoomOverlay.ts}`.
UI: `filetree/FileTree.tsx`, `outline/Outline.tsx`, `search/SearchPanel.tsx`, `dialogs/{QuickOpen, SettingsDialog, ShortcutsPanel}.tsx`, `layout/{AppShell, Titlebar, TabBar, StatusBar}.tsx`.
i18n: `i18n/{index.ts, zh-CN.ts, en-US.ts}` (+ key-usage scan of every `.ts/.tsx` outside `i18n/`).
Rendering libs: `lib/{markdownToHtml.ts, sanitize.ts, htmlRender.ts, highlight.ts, findQuery.ts, workspaceSearch.ts, openDocument.ts, saveCoordinator.ts, imageUpload.ts, keyboard.ts}`; services `fileService.ts`, `imageService.ts`; store slices `editorSlice.ts`, `fileTreeSlice.ts`, `systemSlice.ts`, `appearanceSlice.ts`, `store/index.ts`; `domain/document.ts`.
Tests reviewed: all 46 files under `src/__tests__/` (coverage mapping in §6).
Docs: `docs/PRD.md`, `docs/MARKDOWN-RENDERING.md`, `docs/UX-REVIEW.md`, `AGENTS.md`.

*(End of report.)*
