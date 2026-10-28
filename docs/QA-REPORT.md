# ZenNote 0.9.0 — QA Verification Report

> Scope: visual + frontend verification of the Claude Code desktop redesign, plus a functional smoke pass over the integrations that regressed during the redesign (find/search/locale/dark mode).
> Product code frozen before this run. Harness-only files changed during QA: `src/dev/**`, `scripts/verify-ui.mjs`, `src/main.tsx` (guarded DEV hook), `artifacts/**`.
> Generated: 2026-10-28 02:11 (+08:00) · Verdict: **PASS**

---

## 1. Environment

| Item | Value |
| --- | --- |
| OS | Windows (win32 x64) |
| Node.js | v24.22.1 (`D:\software\nodejs`); npm driven via `npm.cmd` (`npm.ps1` is blocked by policy) |
| Browser | Microsoft Edge `Edg/156.0.4314.50`, `--headless=new`, driven over Chrome DevTools Protocol via Node's built-in `WebSocket` (no Playwright/Puppeteer, no npm installs) |
| Dev server | Vite 8.1.5, `http://localhost:5173` (Vite binds `::1` on Windows — IPv4 `127.0.0.1` is unreachable for a plain `npm run dev`) |
| Viewport | 1440 × 900 @ DPR 1 (default); 1100 × 800 for the narrow-window shot |
| Screenshot method | `Page.captureScreenshot` (PNG) after `Emulation.setDeviceMetricsOverride`; assertions on decoded pixels (ink coverage / distinct colours) and DOM state |
| Demo data | `src/dev/demo.ts` seeds the Zustand store **before** React renders and installs a fake Tauri IPC bridge (`?demo=1`); only loaded behind `import.meta.env.DEV` |

QA-only dev-server config: `src/dev/vite.verify.config.mjs` — same root/plugins as `vite.config.ts`, plus watch-ignore globs for editor `*.tmpdir/` staging folders. Without it Vite's Windows watcher dies with `EBUSY` whenever a teammate's editor writes a file mid-run; normal `npm run dev` is unaffected.

---

## 2. Commands and results (frozen code)

| Command | Exit | Result |
| --- | --- | --- |
| `node scripts/verify-ui.mjs` | 0 | **28/28 screenshots**, **12/12 integration checks**, 0 console errors / 0 uncaught exceptions. 2 benign warnings: welcome shots are 17.8 / 17.9 KB (flat canvas) but pixel analysis finds 40+ colours — "small but not blank". Summary: `artifacts/verify-ui-summary.json`, log: `artifacts/verify-ui.log` |
| `npm run lint` (oxlint) | 0 | 128 files / 103 rules · **0 errors**, 3 pre-existing warnings (`public/theme-init.js` unused catch param; two `react/only-export-components` in `src/components/ui/Menu.tsx`) |
| `npm run build` (`tsc -b` + `vite build`) | 0 | TypeScript 0 errors; Vite build OK (~0.5 s). Only the pre-existing "chunks > 500 kB" advisory. Production `dist/` contains **no demo harness**: grep for `ZenNote Demo`, `__znDemo`, `seedDemo`, `Paper and ink study` → not found; no `demo`/`dev` chunk emitted |
| `npm run test` (Vitest) | 0 | **47 test files / 541 tests passed** (7.5 s) |

Runs are reproducible from the repo root; `--only='24,28'` re-captures a subset, `--no-server` reuses an already-running dev server.

---

## 3. Screenshot set (pipeline, frozen code)

All files in `artifacts/`. `ink` = share of sampled pixels differing from the canvas (blank ≈ 0 %, real screen ≥ 3 % except the intentionally airy welcome page).

| # | File | View | What it proves |
| --- | --- | --- | --- |
| 01 | `01-welcome-light.png` | light | Welcome screen: brand mark, serif wordmark, subtitle, two CTAs, titlebar; warm canvas `#FAF9F5` asserted |
| 02 | `02-welcome-dark.png` | dark | Same in warm charcoal `#262624`; `.dark` class + computed background asserted |
| 03 | `03-workspace-light.png` | light | Full shell: titlebar, 3 tabs (dirty clay dot), file tree with 9 files/4 folders, TOC block, serif H1/H2, list/inline-code/quote/rule rhythm, status bar |
| 04 | `04-workspace-dark.png` | dark | Full shell in dark tokens (18.9 % ink); no light surfaces; sidebar/editor/statusbar contrast |
| 05 | `05-settings.png` | light | Settings Modal: scrim, 760 px two-column layout, left nav + General pane, centred, content intact |
| 06 | `06-search.png` | light | Global search overlay: query "canvas", 4 results with clay highlights, Esc chip + ↑↓ keyboard footer, counts |
| 07 | `07-quickopen.png` | light | Quick-open palette: fuzzy filter "proj" → 3 results with folder path, ↑↓/Esc hints, no result overflow |
| 08 | `08-findbar.png` | light | Find bar: **exactly one** bar, query "clay" `1/3`, active input border, match options, replace toggle, Esc |
| 09 | `09-shortcuts.png` | light | Shortcuts panel: two-column 25-entry reference, `kbd` chips, centred, scroll body |
| 10 | `10-editor-table.png` | light | Scrolled editor: GFM table (tinted header, hairlines), fenced `ts` code card with language label + copy affordance |
| 11 | `11-editor-mermaid.png` | light | Mermaid diagram in the **warm token-derived theme** (bone nodes, clay accents) — no more default lilac |
| 12 | `12-workspace-en.png` | light | English locale: WORKSPACE label, EN titlebar chip, English status bar wording; no overflow with long English strings |
| 13 | `13-settings-dark.png` | dark | Settings Modal in dark mode; dialog surface luminance 38 (asserted ≤ 150) |
| 14 | `14-search-dark.png` | dark | Search overlay dark: panel luminance 43, highlighted matches, keyboard footer |
| 15 | `15-findbar-dark.png` | dark | Find bar dark: single bar, luminance 48, focus in input, active query |
| 16 | `16-shortcuts-dark.png` | dark | Shortcuts panel dark; all chips/rows readable |
| 17 | `17-workspace-narrow.png` | 1100 × 800 | Narrow window: sidebar + tabs + editor + status bar still fit; **no horizontal overflow** asserted |
| 18 | `18-settings-en.png` | light EN | Settings fully translated (General/Appearance/Editor/File Tree/Update/About, all rows) |
| 19 | `19-settings-appearance.png` | light | Settings → Appearance pane: theme segmented control, font stack select, font-size slider, preview card |
| 20 | `20-recent-workspaces.png` | light | Recent-workspaces dropdown: 3 entries (icon, name, monospace path, remove ×), anchored under workspace header |
| 21 | `21-editor-code.png` | light | Code blocks: language label + chevron + copy button, warm syntax palette, ts/js cards |
| 22 | `22-code-lang-menu.png` | light | Code-language menu: 10 entries with selected tick, scrollable, anchored under trigger |
| 23 | `23-editor-tasklist.png` | light | Task list checkboxes (2 done/struck-through, 2 open), inline Σ math, display fraction, footnote ref + definition rail |
| 24 | `24-table-menu.png` | light | Table frame menu (230 px): insert/delete row+column, alignment, move commands (disabled states), danger "删除表格" |
| 25 | `25-image-bar.png` | light | Image alignment bar: left/center/right + zoom, floating over the image block |
| 26 | `26-source-mode.png` | light | Source mode (Ctrl+`` ` ``): line-number gutter, monospace markdown, warm syntax colours, centred column, tabs/statusbar intact |
| 27 | `27-empty-state.png` | light | Empty editor after closing the last tab: centred brand mark + prompt + `Ctrl P` hint |
| 28 | `28-empty-state-cold.png` | light | Cold launch with workspace but no note: empty state + status bar **without** meaningless `Ln/Col` (fix verified) |

Supplementary shots in `artifacts/` were captured earlier in the same session (integration QA of hover/menu states) and are not regenerated by this final pass: `13-shell-outline`, `14-welcome-light`, `15-appearance-menu`, `16-export-menu`, `17-tab-context-menu`, `18-titlebar-en-update`, `19-window-close-hover`, `20-tab-hover`, `21-titlebar-update-pill`, `22-close-hover-fullheight`, `23-titlebar-update-pill`, `qa-01` … `qa-11` (editor top/mermaid/source-mode/empty-state/tasklists/code-dark/table-dark/table-menu/image-bar/code-lang-menu). Total PNGs in `artifacts/`: 50.

---

## 4. Integration checks (automated, real key chords via CDP)

Result: **12/12 passed**. Evidence values are recorded in `artifacts/verify-ui-summary.json → integration`.

| ID | Check | Evidence |
| --- | --- | --- |
| a1 | Ctrl+F opens exactly ONE find bar (live preview) | `barCount=1`, visible, focused input |
| a2 | Find works in live preview | query "canvas" → counter `1/1` |
| a3 | Ctrl+F after Ctrl+`` ` `` (source mode) still opens ONE bar | `barCount=1`, source mode on |
| a4 | Find works in source mode | query "ThemeMode" → counter `1/2` |
| b1 | Ctrl+H opens the bar with the replace row | one bar, 2 inputs, replace row present |
| c1 | Global search (Ctrl+Shift+F) → "canvas" → Enter pre-fills find bar | input value `canvas`, 4 results before Enter, bar `1/1` |
| c2 | Search jump puts the caret on the matching line | result line 11 → `cursorLine=11` |
| c3 | Match counter shown after jump, no duplicate bar | `1/1`, `barCount=1` |
| d1 | Sidebar visible on clean launch, no persisted session | `sidebarVisible=true`, `localStorage['zennote:session']=null` |
| d2 | Recent-workspaces dropdown lists entries | 3 entries: ZenNote Demo / ZenNote Archive / Journal |
| e1 | Dark chrome uses dark tokens, no white panel | canvas `rgb(38,38,36)`; 11 visible surfaces, luminance 38–48, 0 light surfaces |
| f1 | Runtime zh→en switch rebuilds editor widgets | TOC title `目录` → `Table of Contents` |

---

## 5. Defects found during QA and verified fixed

| # | Severity | Defect (as observed) | Status / evidence |
| --- | --- | --- | --- |
| 1 | P1 | **Duplicate find bar**: Ctrl+F/Ctrl+H rendered two stacked bars (AppShell had hoisted the bar while `LivePreviewEditor` still mounted its own). Observed in the first-pass `08-findbar.png` / `15-findbar-dark.png` | Fixed before freeze (editor now uses the single AppShell bar); a1/a3 assert `barCount=1`, 08/15 show one bar |
| 2 | harness | `04-workspace-dark.png` captured as a blank frame: after `Page.navigate`, `readyState` still described the outgoing page | Fixed in `scripts/verify-ui.mjs` (wait for `location.href === target`, 2×rAF + fonts, theme class + computed canvas assertion, ink-coverage floor). 04 now 90.8 KB / 18.9 % ink |
| 3 | P2 | Mermaid diagram used mermaid's default lilac palette in light mode, clashing with the clay/warm design language | Fixed via token-derived warm `base` theme; 11 / qa-02 show bone/clay diagram |
| 4 | P2 | TOC widget label stayed `目录` after a runtime zh→en switch | Fixed (widget eq includes locale + editor rebuild); f1 passes |
| 5 | P3 | Table frame menu's first item wrapped onto two lines (min-width too small) | Fixed (230 px); 24 shows single-line "在下方插入行 (Ctrl+Enter)" |
| 6 | P3 | Empty-editor cold start showed meaningless `Ln 1, Col 1` | Fixed for cold launch; 28 shows no `Ln/Col` (see residual P3-1 below for the close-last-tab path) |

Also verified during the pass: find bar keeps focus in its input while typing (08/15: `activeElement=INPUT`, value `clay`); search palette shows its keyboard footer; settings nav/panes correct in zh and en; no horizontal overflow on any shot at 1440 or 1100; zero uncaught console errors/exceptions across all 28 pages.

---

## 6. Remaining findings — by severity

**P0 / P1 / P2: none.** No layout breakage, clipping, missing border/shadow, contrast failure, dark-mode leak, uncentred dialog or console error was found on the frozen code.

P3 (cosmetic, non-blocking):

1. **FIXED post-QA** — Stale `Ln 9, Col 1` after closing the last tab (`27-empty-state.png`). `closeAllTabs` did not reset `cursorLine/Col`, so the status bar kept the last document's position although no document was open. `removeTabsImpl` now resets cursor/scroll with the document; a store regression test was added and shot 27 was regenerated (status bar shows only `预览`).
2. **Image click shows raw markdown while the align bar is open** (`25-image-bar.png`). Clicking a rendered image moves the caret into the image range, so Live Preview displays the source form `![alt](src)` — documented editing behaviour. With the demo's inline `data:` image this dumps a long base64 string; with normal relative paths the raw reference is short. Cosmetic only.
3. **TOC block has ~40 px unused space at the bottom** (`03`/`04`). The widget's `estimatedHeight` is slightly larger than the rendered content; no layout break, only asymmetry.
4. **Settings dialog keeps a tall fixed body** (`05`/`13`): short panes (General, Appearance) leave a large empty area. Intentional per design (760×620 stable dialog), noted for the next design pass.
5. **Welcome screenshots are < 20 KB** (17.8 / 17.9 KB). Flat canvas compresses well; pixel analysis confirms 40+ colours, so this is the harness' "small but not blank" warning, not a defect.
6. **FIXED post-QA** — Encoding nit: `src/styles/shell.css` contained mojibake `鈥?` where an em dash belonged (6 occurrences, comments only). Replaced with `—`.

---

## 7. Known limitations (out of browser QA scope)

Cross-reference `docs/RELEASE-NOTES-0.9.0.md` §4. The browser harness exercises the real React app but uses a fake Tauri IPC bridge, so native-only paths (OS file dialogs, real filesystem writes/watch, updater download/install, PDF export webview, window close-save flow) were not run end-to-end here; they are covered by the 541 unit tests and the release checklist. Screenshot counts in the release note (19) predate the expanded 28-shot pipeline used for this verification.

---

## 8. Verdict

**PASS.** On frozen code: 28/28 screenshots captured and visually inspected, 12/12 cross-surface integration checks green, 0 console errors/exceptions, `lint` 0 errors (3 pre-existing warnings), `tsc -b` 0 errors, `npm run build` OK with the demo harness absent from production, Vitest 47 files / 541 tests passing. No P0/P1/P2 defects remain; the P3 items are cosmetic and low risk for release.

---

## 9. Post-QA addendum (Lead, after the frozen-code run)

Two P3 items were fixed after the report above and re-verified:

1. **Stale Ln/Col after closing the last tab** — `removeTabsImpl` now resets `cursorLine`, `cursorCol` and `scrollPosition` when the current document is closed; new regression test in `storeSlices.test.ts`. `node scripts/verify-ui.mjs --only=27` re-captured `27-empty-state.png` (status bar shows only `预览`, no Ln/Col) and all 12 integration checks still pass.
2. **shell.css mojibake** — replaced with proper em dashes (comments only).
3. **Review P1 (not visible to visual QA): outline jumped to the wrong heading on long notes.** The panel used `querySelectorAll(...)[displayIdx]` while CodeMirror only renders the viewport. It now marks the row active and raises a one-shot `headingJumpRequest` (source line); the live editor maps that line to a real CodeMirror position, scrolls to it and drives the active row from the viewport while scrolling. `Outline.test.tsx` was updated to pin the new position-based contract (4 tests) and the full suite still passes.

Final verification after these fixes: `tsc -b` 0 errors, `lint` 0 errors (same 3 pre-existing warnings), `npm run build` OK, Vitest **47 files / 543 tests passed**. QA report §2–§8 documents the earlier frozen-code run (541 tests / 28 shots); the post-QA fixes do not change any screenshot other than 27, which was re-captured.

---

## 10. 0.9.1 hotfix verification — installer-only CSP regression

**User report (0.9.0 installer):** editor preview lost heading/table/code styling; source mode showed line numbers but no text.

**Root cause (verified through the release binary via WebView2 CDP):** Tauri's compile-time CSP modification injected a nonce into `style-src`:

```
style-src 'self' 'unsafe-inline' 'nonce-<random>'
```

Per CSP, a nonce/hash in the same directive makes `'unsafe-inline'` ignored, so CodeMirror's runtime-injected `<style>` (base theme + `EditorView.theme`) and React `style` attributes were blocked. The dev browser used for the 28-shot QA has no such CSP, which is why this was invisible there.

**Fix:** `src-tauri/tauri.conf.json` → `app.security.dangerousDisableAssetCspModification: ["style-src"]`, keeping `script-src` nonce/hash protection unchanged. Rebuilt the NSIS installer as 0.9.1.

**Verification against the release `zennote.exe` (CDP, remote debugging):**

| Check | 0.9.0 | 0.9.1 |
| --- | --- | --- |
| CM `<style>` sheet | `null` (blocked) | 95 rules active |
| `.cm-scroller` | `display:block; padding:0` | `display:flex; padding:40px 80px 0` |
| `.cm-content` | 12.5px / max-width none | 13.5px / 860px |
| Source mode text | invisible | visible |
| Preview H1 | unstyled | serif 30px/600 |
| Preview table | no borders | 1px hairline + 10px radius |
| React inline styles | blocked | applied |

Evidence: `artifacts/repro-fixed-source.png`, `artifacts/repro-fixed-preview.png`; root-cause evidence captured in `artifacts/` too (CSP header + blocked CM style before the fix). Test suite remains 47 files / 543 tests; `lint` 0 errors; `tsc -b` 0 errors.

---

## Appendix — artifacts directory listing (PNG)

Pipeline output (28): `01-welcome-light` 17.8 KB · `02-welcome-dark` 17.9 · `03-workspace-light` 88.0 · `04-workspace-dark` 90.8 · `05-settings` 105.0 · `06-search` 179.0 · `07-quickopen` 162.2 · `08-findbar` 98.5 · `09-shortcuts` 130.2 · `10-editor-table` 94.7 · `11-editor-mermaid` 68.8 · `12-workspace-en` 90.2 · `13-settings-dark` 90.1 · `14-search-dark` 157.6 · `15-findbar-dark` 100.0 · `16-shortcuts-dark` 116.8 · `17-workspace-narrow` 72.7 · `18-settings-en` 108.6 · `19-settings-appearance` 114.7 · `20-recent-workspaces` 92.5 · `21-editor-code` 103.2 · `22-code-lang-menu` 95.0 · `23-editor-tasklist` 73.1 · `24-table-menu` 96.1 · `25-image-bar` 198.0 · `26-source-mode` 110.4 · `27-empty-state` 37.9 · `28-empty-state-cold` 36.9.

Supplementary (22, earlier integration pass, not regenerated): `13-shell-outline` 97.3 · `14-welcome-light` 18.1 · `15-appearance-menu` 95.8 · `16-export-menu` 92.7 · `17-tab-context-menu` 100.2 · `18-titlebar-en-update` 89.3 · `19-window-close-hover` 89.4 · `20-tab-hover` 89.7 · `21-titlebar-update-pill` 88.0 · `22-close-hover-fullheight` 88.0 · `23-titlebar-update-pill` 90.0 · `qa-01-editor-top` 88.0 · `qa-02-mermaid` 104.2 · `qa-03-source-mode` 117.3 · `qa-04-empty-state` 37.8 · `qa-05-tasklist-light` 111.3 · `qa-06-code-dark` 107.1 · `qa-07-table-dark` 98.5 · `qa-08-tasklist-dark` 117.0 · `qa-09-table-menu` 108.8 · `qa-10-image-bar` 261.0 · `qa-11-code-lang-menu` 96.1.

Machine-readable run data: `artifacts/verify-ui-summary.json` (screenshots, pixels, theme facts, integration results, failures, warnings), `artifacts/verify-ui.log` (step-by-step log).
