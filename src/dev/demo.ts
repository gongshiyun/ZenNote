/**
 * Dev-only demo harness (never bundled into production).
 *
 * The real app needs Tauri for the workspace/filesystem, so a plain browser
 * would only ever show the welcome screen. This module seeds a realistic
 * workspace straight into the Zustand store BEFORE React mounts, and installs a
 * tiny fake Tauri IPC bridge so the panels that read the workspace (file tree,
 * quick open, global search) have real content in the screenshots.
 *
 * Loaded from src/main.tsx only behind:
 *   if (import.meta.env.DEV && new URLSearchParams(location.search).has("demo"))
 *
 * Used by scripts/verify-ui.mjs through `window.__znDemo`.
 */
import type { FileEditorState, FileNode, ThemeMode } from "../domain";
import { setLocale as setI18nLocale } from "../i18n";
import { useStore, type AppStore } from "../store";

export const DEMO_WORKSPACE = String.raw`D:\ZenNote Demo`;
export type DemoPanelName =
  | "settings"
  | "search"
  | "shortcuts"
  | "find"
  | "quickopen"
  | "outline"
  | "sidebar";

export interface DemoSeedOptions {
  mode?: ThemeMode;
  locale?: string;
  /** Cold-start shape with an open workspace but no note selected. */
  emptyDocument?: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Demo content
// ────────────────────────────────────────────────────────────────────────────

/** Inline warm-paper study, encoded so the markdown image URL stays one token. */
const DEMO_IMAGE_SRC =
  "data:image/svg+xml;base64," +
  btoa(
    `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="260"><rect width="720" height="260" rx="18" fill="#f3f1e9"/><rect x="56" y="52" width="228" height="156" rx="10" fill="#fffdf8" stroke="#d9d3c4"/><rect x="84" y="84" width="140" height="12" rx="6" fill="#d97757"/><rect x="84" y="112" width="170" height="8" rx="4" fill="#cdc7b8"/><rect x="84" y="132" width="146" height="8" rx="4" fill="#cdc7b8"/><rect x="84" y="152" width="158" height="8" rx="4" fill="#cdc7b8"/><rect x="320" y="52" width="344" height="156" rx="10" fill="#fffdf8" stroke="#d9d3c4"/><text x="344" y="100" font-family="Georgia,serif" font-size="21" fill="#1f1e1d">quiet surface</text><line x1="344" y1="122" x2="640" y2="122" stroke="#e3ddd0"/><rect x="344" y="140" width="208" height="8" rx="4" fill="#cdc7b8"/><rect x="344" y="160" width="180" height="8" rx="4" fill="#cdc7b8"/><circle cx="612" cy="111" r="18" fill="#f0eee6" stroke="#d97757" stroke-width="2"/><circle cx="612" cy="111" r="6" fill="#d97757"/></svg>`,
  );

/** The rich demo note: every block/inline feature the live preview supports. */
function buildRichNote(): string {
  return [
    "[TOC]",
    "",
    "# ZenNote Redesign",
    "",
    "A calm surface for thinking: warm paper, one clay accent, and typography that gets out of the way.",
    "",
    "## Design intent",
    "",
    "The old shell tried to look like an IDE. The new one should feel like a quiet desk.",
    "",
    "- **Warm canvas** — `#FAF9F5` instead of pure white",
    "- **Clay accent** — used only for attention: focus rings, links, active rows",
    "- **Serif structure** — headings in a literary serif, body in a humanist sans",
    "- ~~Cold grey borders~~ replaced with translucent ink hairlines",
    "",
    "### Three rules",
    "",
    "1. One accent, one job: the clay tone never becomes decoration.",
    "2. Structure is rhythm: spacing and hairlines carry hierarchy, not colour.",
    "3. Motion is quiet: 140ms ease-out, no bounce, no parallax.",
    "",
    '> "Perfection is achieved, not when there is nothing more to add, but when there is nothing left to take away."',
    "> — Antoine de Saint-Exupéry",
    "",
    "Inline math like $E = mc^2$ and a highlighted phrase ==worth remembering== keep the prose alive.",
    "",
    "---",
    "",
    "## Delivery timeline",
    "",
    "| Week | Focus | Owner | Status |",
    "| --- | --- | --- | --- |",
    "| 1 | Tokens + shell chrome | ui-shell | Done |",
    "| 2 | Panels + search | ui-panels | In progress |",
    "| 2 | Dialogs + find bar | ui-dialogs | In progress |",
    "| 3 | Editor surface | ui-editor | In progress |",
    "| 4 | Visual QA | qa-visual | Verifying |",
    "",
    "## Boot sequence",
    "",
    "The store is seeded before React mounts, so the first paint already shows a real workspace.",
    "",
    "```ts",
    'type ThemeMode = "light" | "dark" | "system";',
    "",
    "interface DemoSeed {",
    "  workspace: string;",
    "  openTabs: string[];",
    "  theme: ThemeMode;",
    "}",
    "",
    "export function bootDemo(seed: DemoSeed): void {",
    "  const store = useStore.getState();",
    "  store.setWorkspace(seed.workspace);",
    "  store.setOpenTabs(seed.openTabs);",
    "  store.setMode(seed.theme);",
    "}",
    "```",
    "",
    "The renderer falls back gracefully when the Tauri IPC bridge is missing:",
    "",
    "```js",
    'const hasIpc = typeof window.__TAURI_INTERNALS__ !== "undefined";',
    'const mode = localStorage.getItem("zennote:mode") ?? "light";',
    'export const ready = hasIpc || mode !== "";',
    "```",
    "",
    "## Render pipeline",
    "",
    "```mermaid",
    "flowchart LR",
    "  A[Markdown] --> B{Parse}",
    "  B -->|fence| C[Code block]",
    "  B -->|math| D[KaTeX]",
    "  B -->|mermaid| E[SVG diagram]",
    "  C --> F[Paint]",
    "  D --> F",
    "  E --> F",
    "```",
    "",
    "## Surface samples",
    "",
    "![Paper and ink study](" + DEMO_IMAGE_SRC + ")",
    "",
    "- [x] Seed a realistic workspace",
    "- [x] Exercise every block type",
    "- [ ] Verify dark mode contrast",
    "- [ ] Confirm dialogs are centred",
    "",
    "The estimate is $\\sum_{i=1}^{n} w_i x_i$ for a weighted score.",
    "",
    "$$",
    "\\mathrm{contrast} = \\frac{L_1 + 0.05}{L_2 + 0.05}",
    "$$",
    "",
    "Press <kbd>Ctrl</kbd> + <kbd>P</kbd> to jump between notes.",
    "",
    "Footnotes keep side comments out of the flow.[^1]",
    "",
    "[^1]: Rendered by scanning text ranges, since CommonMark has no footnote grammar.",
    "",
  ].join("\n");
}

interface DemoFile {
  path: string;
  name: string;
  content: string;
}

const p = (relative: string): string => DEMO_WORKSPACE + "\\" + relative;

function buildFiles(): DemoFile[] {
  return [
    {
      path: p("README.md"),
      name: "README.md",
      content: [
        "# ZenNote Demo Workspace",
        "",
        "A throwaway workspace for **visual QA** of the Claude Code redesign. Nothing here touches the real disk: the demo harness serves this content through a fake Tauri bridge.",
        "",
        "- `Projects/` — working specs",
        "- `Daily/` — short journal entries",
        "- `Knowledge/` — cheatsheets",
        "",
      ].join("\n"),
    },
    {
      path: p("Projects\\ZenNote Redesign.md"),
      name: "ZenNote Redesign.md",
      content: buildRichNote(),
    },
    {
      path: p("Projects\\QA Pipeline.md"),
      name: "QA Pipeline.md",
      content: [
        "# QA Pipeline",
        "",
        "Run `node scripts/verify-ui.mjs` to capture every surface of the app.",
        "",
        "## Shots",
        "",
        "1. Welcome, light",
        "2. Welcome, dark",
        "3. Workspace, light",
        "4. Workspace, dark",
        "",
        "> Screenshots land in `artifacts/`.",
        "",
      ].join("\n"),
    },
    {
      path: p("Projects\\Visual Language.md"),
      name: "Visual Language.md",
      content: [
        "# Visual Language",
        "",
        "Tokens are the contract between the design intent and the surface.",
        "",
        "## Palette",
        "",
        "| Token | Light | Dark |",
        "| --- | --- | --- |",
        "| Canvas | `#FAF9F5` | `#262624` |",
        "| Ink | `#1F1E1D` | `#F5F4ED` |",
        "| Clay | `#C2603F` | `#D97757` |",
        "",
        "The clay accent is the only chromatic voice. It marks focus, links and the active row — never decoration.",
        "",
      ].join("\n"),
    },
    {
      path: p("Daily\\2026-10-27.md"),
      name: "2026-10-27.md",
      content: [
        "# 2026-10-27",
        "",
        "Focused on the shell: the titlebar finally reads as chrome rather than a toolbar. The warm canvas makes the editor page feel like paper instead of a panel.",
        "",
        "- [x] Restyle titlebar",
        "- [x] Quiet tab bar",
        "- [ ] Status bar rhythm",
        "",
      ].join("\n"),
    },
    {
      path: p("Daily\\2026-10-26.md"),
      name: "2026-10-26.md",
      content: [
        "# 2026-10-26",
        "",
        "Started from the tokens: canvas, ink, clay. Everything else follows.",
        "",
        "> Fewer colours, more hierarchy.",
        "",
      ].join("\n"),
    },
    {
      path: p("Knowledge\\Markdown Cheatsheet.md"),
      name: "Markdown Cheatsheet.md",
      content: [
        "# Markdown Cheatsheet",
        "",
        "## Inline",
        "",
        "`**bold**`, `*italic*`, `~~strike~~`, `` `code` ``, `[link](https://example.com)`.",
        "",
        "## Blocks",
        "",
        "- bullets",
        "- nested items",
        "1. ordered",
        "2. lists",
        "",
        "> quotes",
        "",
      ].join("\n"),
    },
    {
      path: p("Knowledge\\Mermaid Playbook.md"),
      name: "Mermaid Playbook.md",
      content: [
        "# Mermaid Playbook",
        "",
        "```mermaid",
        "flowchart TD",
        "  Idea --> Draft",
        "  Draft --> Review",
        "  Review --> Publish",
        "```",
        "",
        "Keep diagrams small and directional; the reader should get it in one glance.",
        "",
      ].join("\n"),
    },
    {
      path: p("Archive\\Old Notes.md"),
      name: "Old Notes.md",
      content: [
        "# Old Notes",
        "",
        "Pre-redesign sketches live here for reference. The glass-and-gradient era is over.",
        "",
      ].join("\n"),
    },
  ];
}

const DEMO_FILES: DemoFile[] = buildFiles();
const DEMO_CONTENT = new Map(DEMO_FILES.map(file => [file.path, file.content]));
const DEMO_CURRENT = p("Projects\\ZenNote Redesign.md");
const DEMO_OPEN_TABS = [
  DEMO_CURRENT,
  p("Projects\\Visual Language.md"),
  p("Knowledge\\Markdown Cheatsheet.md"),
];
/** A background tab with unsaved edits, so the dirty dot is visible. */
const DEMO_DIRTY_TAB = p("Projects\\Visual Language.md");
const DEMO_EXPANDED = [
  p("Projects"),
  p("Daily"),
  p("Knowledge"),
];

function buildTree(files: DemoFile[]): FileNode[] {
  const root: FileNode[] = [];
  for (const file of files) {
    const relative = file.path.slice(DEMO_WORKSPACE.length + 1);
    const segments = relative.split(/[\\/]/);
    let list = root;
    let folderPath = DEMO_WORKSPACE;
    for (let i = 0; i < segments.length - 1; i++) {
      folderPath = folderPath + "\\" + segments[i];
      let folder = list.find(node => node.isDir && node.path === folderPath);
      if (!folder) {
        folder = { name: segments[i], path: folderPath, isDir: true, children: [] };
        list.push(folder);
      }
      list = folder.children ?? [];
      folder.children = list;
    }
    list.push({ name: file.name, path: file.path, isDir: false });
  }
  return root;
}

const DEMO_TREE = buildTree(DEMO_FILES);

function findNode(nodes: FileNode[], path: string): FileNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.isDir && node.children) {
      const hit = findNode(node.children, path);
      if (hit) return hit;
    }
  }
  return null;
}

function flattenFiles(nodes: FileNode[], out: FileNode[] = []): FileNode[] {
  for (const node of nodes) {
    if (node.isDir) flattenFiles(node.children ?? [], out);
    else out.push(node);
  }
  return out;
}

interface DemoSearchHit {
  filePath: string;
  fileName: string;
  line: number;
  content: string;
}

function searchDemoWorkspace(query: string, caseSensitive: boolean): DemoSearchHit[] {
  const needle = caseSensitive ? query : query.toLowerCase();
  if (!needle) return [];
  const hits: DemoSearchHit[] = [];
  for (const file of DEMO_FILES) {
    const name = caseSensitive ? file.name : file.name.toLowerCase();
    if (name.includes(needle)) {
      hits.push({ filePath: file.path, fileName: file.name, line: 0, content: "" });
    }
    const lines = file.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = caseSensitive ? lines[i] : lines[i].toLowerCase();
      if (!line.includes(needle)) continue;
      hits.push({
        filePath: file.path,
        fileName: file.name,
        line: i + 1,
        content: lines[i].trim().slice(0, 120),
      });
      if (hits.length >= 500) return hits;
    }
  }
  return hits;
}

// ────────────────────────────────────────────────────────────────────────────
// Fake Tauri IPC bridge
// ────────────────────────────────────────────────────────────────────────────

/** Commands the demo answers; everything else resolves to null (a no-op). */
function invokeDemoCommand(command: string, args: Record<string, unknown> | undefined): unknown {
  const path = typeof args?.path === "string" ? args.path : "";
  switch (command) {
    case "open_workspace":
      return DEMO_TREE;
    case "read_dir":
      return findNode(DEMO_TREE, path)?.children ?? [];
    case "list_markdown_files":
      return flattenFiles(DEMO_TREE);
    case "read_file":
      return DEMO_CONTENT.get(path) ?? "";
    case "path_exists":
      return DEMO_CONTENT.has(path) || !!findNode(DEMO_TREE, path);
    case "read_file_binary":
      return [];
    case "search_workspace": {
      const query = typeof args?.query === "string" ? args.query : "";
      return searchDemoWorkspace(query, args?.caseSensitive === true);
    }
    case "get_launch_args":
      return [];
    case "write_file":
    case "create_file":
    case "create_folder":
    case "rename_file":
    case "delete_file":
    case "watch_workspace":
    case "unwatch_workspace":
    case "plugin:event|listen":
      return 1;
    case "plugin:event|unlisten":
    case "plugin:updater|check":
    case "plugin:dialog|open":
    case "plugin:dialog|save":
    case "plugin:dialog|message":
      return null;
    case "plugin:window|is_maximized":
      return false;
    case "plugin:window|is_focused":
      return true;
    case "plugin:window|scale_factor":
      return 1;
    case "plugin:window|theme":
      return "light";
    case "plugin:window|inner_position":
    case "plugin:window|outer_position":
      return { x: 0, y: 0 };
    case "plugin:window|inner_size":
    case "plugin:window|outer_size":
      return { width: 1440, height: 900 };
    default:
      return null;
  }
}

let callbackSeq = 1;
const demoCallbacks = new Map<number, (raw: unknown) => void>();

function installTauriBridge(): void {
  const w = window as unknown as Record<string, unknown>;
  if (w.__TAURI_INTERNALS__) return; // a real Tauri webview: leave it alone
  w.__TAURI_INTERNALS__ = {
    invoke: (command: string, args?: Record<string, unknown>) =>
      Promise.resolve(invokeDemoCommand(command, args)),
    transformCallback: (callback: (raw: unknown) => void) => {
      const id = callbackSeq++;
      demoCallbacks.set(id, callback);
      return id;
    },
    unregisterCallback: (id: number) => {
      demoCallbacks.delete(id);
    },
    convertFileSrc: (filePath: string, protocol = "asset") =>
      protocol + "://localhost/" + encodeURIComponent(filePath),
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { windowLabel: "main", label: "main" },
    },
  };
  w.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener: () => {
      /* no live listeners in the demo */
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Seeding
// ────────────────────────────────────────────────────────────────────────────

function resolveMode(mode: ThemeMode): "light" | "dark" {
  if (mode !== "system") return mode;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyDocumentTheme(resolved: "light" | "dark", fontFamily: string): void {
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.setAttribute("data-font", fontFamily);
}

let seeded = false;

/**
 * Seed the demo workspace + appearance. Called once, before ReactDOM renders,
 * so the very first paint is the real workspace instead of the welcome screen.
 */
export function seedDemo(options: DemoSeedOptions = {}): void {
  installTauriBridge();
  // The session restore effect reads this key; clearing it keeps the seeded
  // state authoritative on every reload.
  try {
    localStorage.removeItem("zennote:session");
  } catch {
    /* storage unavailable */
  }

  const mode: ThemeMode = options.mode ?? "light";
  const locale = options.locale ?? "zh-CN";
  setI18nLocale(locale);
  const empty = options.emptyDocument === true;

  const currentContent = DEMO_CONTENT.get(DEMO_CURRENT) ?? "";
  const lines = currentContent.split("\n");
  const cursorIdx = lines.findIndex(line => line.startsWith("The old shell tried"));
  const cursorLine = empty ? 1 : cursorIdx >= 0 ? cursorIdx + 1 : 1;

  const fileStates = new Map<string, FileEditorState>();
  for (const path of empty ? [] : DEMO_OPEN_TABS) {
    fileStates.set(path, {
      content: DEMO_CONTENT.get(path) ?? "",
      scrollPos: 0,
      cursorLine: 1,
      cursorCol: 1,
      dirty: path === DEMO_DIRTY_TAB,
    });
  }

  useStore.setState({
    workspacePath: DEMO_WORKSPACE,
    recentWorkspaces: [
      DEMO_WORKSPACE,
      String.raw`D:\ZenNote Archive`,
      String.raw`C:\Users\you\Documents\Journal`,
    ],
    tree: DEMO_TREE,
    expandedFolders: DEMO_EXPANDED,
    isLoading: false,
    selectedFilePath: empty ? null : DEMO_CURRENT,
    currentFilePath: empty ? null : DEMO_CURRENT,
    content: empty ? "" : currentContent,
    isDirty: false,
    sourceMode: false,
    cursorLine,
    cursorCol: 1,
    scrollPosition: 0,
    lastSavedAt: empty ? null : Date.now() - 3 * 60 * 1000,
    fileStates,
    openTabs: empty ? [] : DEMO_OPEN_TABS,
    mode,
    resolvedMode: resolveMode(mode),
    locale,
    searchVisible: false,
    settingsVisible: false,
    saveError: null,
  });

  seeded = true;
  applyDocumentTheme(resolveMode(mode), useStore.getState().fontFamily);
  document.documentElement.dataset.znDemo = "true";
}

// ────────────────────────────────────────────────────────────────────────────
// CDP-facing controls (window.__znDemo)
// ────────────────────────────────────────────────────────────────────────────

function setFlagIfPresent(flag: string, value: unknown): void {
  const state = useStore.getState() as unknown as Record<string, unknown>;
  if (!(flag in state)) return;
  useStore.setState({ [flag]: value } as unknown as Partial<AppStore>);
}

function dispatchWindowKey(init: KeyboardEventInit): void {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
  );
}

export function setDemoMode(mode: ThemeMode): void {
  const resolved = resolveMode(mode);
  useStore.getState().setMode(mode);
  useStore.getState().setResolvedMode(resolved);
  applyDocumentTheme(resolved, useStore.getState().fontFamily);
}

export function setDemoLocale(locale: string): void {
  setI18nLocale(locale);
  useStore.getState().setLocale(locale);
}

export function setDemoSidebar(visible: boolean): void {
  if (useStore.getState().sidebarVisible !== visible) useStore.getState().toggleSidebar();
}

export function setDemoOutline(visible: boolean): void {
  if (useStore.getState().outlineVisible !== visible) useStore.getState().toggleOutline();
}

/** Switch the editing surface without touching the file (Ctrl+` equivalent). */
export function setDemoSourceMode(on: boolean): void {
  useStore.getState().setSourceMode(on);
}

/** Close every tab so the editor's empty state renders (QA coverage hook). */
export function clearDemoDocument(): void {
  useStore.getState().closeAllTabs();
}

/**
 * Open an app surface the way a user would. Store-backed panels are set
 * directly; the ones that live in component-local state (shortcuts, quick
 * open) are triggered with the same keyboard events the app listens for, so
 * this keeps working when the components are restyled.
 */
export function openDemoPanel(name: DemoPanelName): boolean {
  const store = useStore.getState();
  switch (name) {
    case "settings":
      store.setSettingsVisible(true);
      return true;
    case "search":
      store.setSearchVisible(true);
      return true;
    case "shortcuts":
      setFlagIfPresent("shortcutsVisible", true);
      dispatchWindowKey({ key: "F1" });
      return true;
    case "quickopen":
      setFlagIfPresent("quickOpenVisible", true);
      dispatchWindowKey({ key: "p", ctrlKey: true });
      return true;
    case "find": {
      // Ctrl+F only opens the bar when the editor (or nothing) owns focus.
      const surface = document.querySelector<HTMLElement>(
        ".zn-live-preview .cm-content, .cm-content, .cm-editor",
      );
      surface?.focus();
      const target: EventTarget = surface ?? window;
      target.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "f",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
      // Custom-event contract used by the global search panel as well.
      window.dispatchEvent(
        new CustomEvent("zn-find-open", {
          detail: { query: "", showReplace: false, ts: Date.now() },
        }),
      );
      return true;
    }
    case "outline":
      setDemoOutline(true);
      return true;
    case "sidebar":
      setDemoSidebar(true);
      return true;
    default:
      return false;
  }
}

/** Close every overlay / dialog, wherever its visibility state lives. */
export function closeDemoPanels(): void {
  useStore.setState({ settingsVisible: false, searchVisible: false });
  setFlagIfPresent("shortcutsVisible", false);
  setFlagIfPresent("quickOpenVisible", false);
  setFlagIfPresent("findVisible", false);
  dispatchWindowKey({ key: "Escape" });
}

/**
 * Scroll the live-preview document so `needle` is at the top of the viewport.
 * CodeMirror virtualises long documents, so this nudges the scroller and
 * re-scans the rendered lines instead of assuming the line is already in DOM.
 */
export async function scrollDemoToText(needle: string): Promise<boolean> {
  const scroller = document.querySelector<HTMLElement>(
    ".zn-live-preview .cm-scroller, .cm-scroller",
  );
  if (!scroller) return false;
  const content = useStore.getState().content;
  const lines = content.split("\n");
  const index = lines.findIndex(line => line.includes(needle));
  if (index < 0) return false;

  scroller.scrollTop = Math.max(
    0,
    (index / Math.max(1, lines.length)) * scroller.scrollHeight - 160,
  );
  for (let attempt = 0; attempt < 24; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 70));
    const rendered = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".zn-live-preview .cm-line, .cm-line",
      ),
    );
    const hit = rendered.find(
      element =>
        element.textContent?.includes(needle) &&
        element.getBoundingClientRect().height > 0,
    );
    if (hit) {
      hit.scrollIntoView({ block: "start" });
      await new Promise(resolve => setTimeout(resolve, 160));
      return true;
    }
    scroller.scrollTop = Math.min(
      scroller.scrollHeight,
      scroller.scrollTop + scroller.clientHeight * 0.8,
    );
  }
  return false;
}

export interface DemoSnapshot {
  seeded: boolean;
  workspacePath: string | null;
  mode: string;
  resolvedMode: string;
  locale: string;
  settingsVisible: boolean;
  searchVisible: boolean;
  sidebarVisible: boolean;
  outlineVisible: boolean;
  openTabs: string[];
  currentFilePath: string | null;
  tabCount: number;
  dirtyTabs: string[];
  contentLength: number;
  cursorLine: number;
  cursorCol: number;
  sourceMode: boolean;
  emptyState: boolean;
  rootChildren: number;
  dialogCount: number;
  editorCount: number;
  darkClass: boolean;
  overlayCount: number;
}

export function getDemoState(): DemoSnapshot {
  const store = useStore.getState();
  return {
    seeded,
    workspacePath: store.workspacePath,
    mode: store.mode,
    resolvedMode: store.resolvedMode,
    locale: store.locale,
    settingsVisible: store.settingsVisible,
    searchVisible: store.searchVisible,
    sidebarVisible: store.sidebarVisible,
    outlineVisible: store.outlineVisible,
    openTabs: store.openTabs,
    currentFilePath: store.currentFilePath,
    tabCount: store.openTabs.length,
    dirtyTabs: Array.from(store.fileStates)
      .filter(([, state]) => state.dirty)
      .map(([path]) => path),
    contentLength: store.content.length,
    cursorLine: store.cursorLine,
    cursorCol: store.cursorCol,
    sourceMode: store.sourceMode,
    emptyState: !!document.querySelector(".zn-editor-empty"),
    rootChildren: document.getElementById("root")?.children.length ?? 0,
    dialogCount: document.querySelectorAll('[role="dialog"]').length,
    editorCount: document.querySelectorAll(".cm-editor").length,
    darkClass: document.documentElement.classList.contains("dark"),
    overlayCount: document.querySelectorAll(".zn-overlay").length,
  };
}

export interface DemoApi {
  seeded: boolean;
  seedDemo: typeof seedDemo;
  setMode: typeof setDemoMode;
  setLocale: typeof setDemoLocale;
  setSidebar: typeof setDemoSidebar;
  setOutline: typeof setDemoOutline;
  setSourceMode: typeof setDemoSourceMode;
  clearDocument: typeof clearDemoDocument;
  openPanel: typeof openDemoPanel;
  closePanels: typeof closeDemoPanels;
  scrollToText: typeof scrollDemoToText;
  getState: typeof getDemoState;
}

declare global {
  interface Window {
    __znDemo?: DemoApi;
  }
}

window.__znDemo = {
  get seeded() {
    return seeded;
  },
  seedDemo,
  setMode: setDemoMode,
  setLocale: setDemoLocale,
  setSidebar: setDemoSidebar,
  setOutline: setDemoOutline,
  setSourceMode: setDemoSourceMode,
  clearDocument: clearDemoDocument,
  openPanel: openDemoPanel,
  closePanels: closeDemoPanels,
  scrollToText: scrollDemoToText,
  getState: getDemoState,
};
