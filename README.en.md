# ZenNote

> A minimalist, lightweight local Markdown note app with a Typora-like editing experience and a Claude Code desktop design language.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./src-tauri/Cargo.toml)
[![Tauri](https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![Platform](https://img.shields.io/badge/platform-Windows-0078D6?logo=windows)](https://github.com/gongshiyun/ZenNote/releases)

[中文](./README.md) | **English**

---

## Introduction

ZenNote is a purely local Markdown writing tool: **open it, write, and go**.

- No cloud sync, no plugin marketplace, no bloat
- Notes are plain `.md` files — you own your data, no lock-in
- True WYSIWYG editing: what you type is rendered instantly, just like Typora

## Design Language

Since 0.9.0 the entire interface follows the **Claude Code desktop** design language:

- **Warm paper canvas**: `#FAF9F5` in light, `#262624` in dark — never large pure-white/pure-black surfaces
- **A single clay accent** `#D97757`, reserved for focus, links, active indicators, switches and the brand mark; large fills stay ink-coloured
- **Three type roles**: sans-serif UI, serif structural headings, monospace metadata (paths / shortcuts / code)
- **Quiet chrome**: 40px titlebar, 38px pill tabs, 26px statusbar, warm 1px hairlines
- Full spec: [docs/DESIGN-CLAUDE-CODE.md](./docs/DESIGN-CLAUDE-CODE.md)

## Features

### Editing

- **WYSIWYG**: type and see it rendered instantly — no side-by-side preview (CodeMirror 6 live preview)
- **Typora-style focus source reveal**: the line under the cursor shows its Markdown marks (heading `#`, list `-`, bold `**`, etc.) and renders automatically when you move away
- **Source mode**: one-click switch to plain-text source editing (``Ctrl+` ``), sharing the same find & replace bar
- **Inline formatting**: bold, italic, strikethrough, highlight, inline code, links, images
- **Block elements**: headings, blockquotes, ordered/unordered lists, task lists, dividers, code blocks

### Advanced

- **Mermaid diagrams**: ` ```mermaid ` code blocks render as flowcharts, sequence diagrams, Gantt charts, class diagrams, and more; click a diagram to edit, blur to re-render
- **Math**: KaTeX rendering for inline `$...$` and block `$$...$$` formulas
- **Tables**: WYSIWYG table editing with context menu, alignment and row/column moves
- **Find & replace**: `Ctrl+F` / `Ctrl+H` with case-sensitive, whole-word and regex modes
- **Images**: clipboard paste / drag-in, with resize and alignment

### Workspace & navigation

- **File tree sidebar**: browse your workspace as a tree; create / rename / delete; keyboard navigation (↑↓←→ / Enter / F2 / Delete)
- **Recent workspaces**: remembers the last five workspaces
- **Global search**: `Ctrl+Shift+F` across every note in the workspace; results jump to the matching line
- **Outline panel**: generated from headings; click to jump, scroll-synced; can sit on the right
- **Status bar**: live word/line count, reading time, cursor position and save state

### Data safety

- **Auto-save**: writes after you stop typing, with an automatic retry
- **External change detection**: a banner appears when a file changes on disk; reload or keep your version
- **Close protection**: flushes every unsaved document before exit; never silently overwrites an external version while a conflict is unresolved

### More

- **Light / dark / follow system**, with no white flash when switching
- **Internationalization**: Chinese / English UI
- **Frameless window**: custom titlebar with drag, double-click-to-maximise and window controls

## Tech Stack

| Layer | Technology |
| --- | --- |
| Desktop framework | [Tauri 2](https://tauri.app/) (Rust) |
| Frontend | React 19 + TypeScript |
| Editor | CodeMirror 6 (live preview + source mode) |
| Diagrams / math | Mermaid 11 / KaTeX |
| Styling | Native CSS design tokens (Tailwind CSS 4 provides the base layer) |
| State management | Zustand |
| Build tool | Vite 8 |
| Testing | Vitest + Testing Library |

## Download & Install

Head to the [Releases page](https://github.com/gongshiyun/ZenNote/releases) to download the latest installer:

- **Windows x64**: `ZenNote_x.x.x_x64-setup.exe` (NSIS installer)

The locally built 0.9.0 installer is published under [Releases](https://github.com/gongshiyun/ZenNote/releases) (`ZenNote_0.9.0_x64-setup.exe` + `latest.json` + SHA-256 checksums); see [docs/BUILD-WINDOWS.md](./docs/BUILD-WINDOWS.md) for the reproducible build.

Run the installer to set up.

> The installer is not Authenticode-signed, so Windows SmartScreen may show an "unknown publisher" warning.

## Build from Source

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 20
- [Rust](https://www.rust-lang.org/) ≥ 1.77.2 (`rust-version = "1.77.2"` in `src-tauri/Cargo.toml`; install via [rustup](https://rustup.rs/))
- Tauri 2 [system dependencies](https://tauri.app/start/prerequisites/):
  - **Windows**: WebView2 Runtime (usually built into Windows 11 / new Edge), Visual Studio C++ Build Tools (MSVC compiler + Windows SDK)

> **Frontend-only development (`npm run dev`) does not require the Rust toolchain** — Node.js alone is enough. Rust and the system dependencies above are only needed for developing or building the Tauri desktop app.

### Development

```bash
# Install dependencies
npm install

# Frontend-only development: runs in the browser with HMR, no Rust toolchain needed
npm run dev

# Tauri desktop development: frontend HMR + native window (requires Rust toolchain)
npm run tauri dev
```

### Build & verification

```bash
# Frontend-only build: compile TypeScript + Vite output to dist/, no Rust toolchain needed
npm run build

# Lint / unit tests
npm run lint
npm run test

# Visual smoke verification: dev server + headless Edge screenshots in artifacts/
node scripts/verify-ui.mjs

# NSIS installer only (requires the Rust toolchain and the updater signing key; see docs/BUILD-WINDOWS.md)
npm run tauri build -- --bundles nsis

# Full Tauri build: frontend + Rust, and bundle the installer (requires Rust toolchain)
npm run tauri build
```

> Run `npm run build` first to generate `dist/` before `cargo build` inside `src-tauri/` (tauri-build validates the `frontendDist` path).

Full Tauri build outputs:

- Installer: `src-tauri/target/release/bundle/nsis/ZenNote_x.x.x_x64-setup.exe`
- Executable: `src-tauri/target/release/zennote.exe`

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+N` | New note |
| `Ctrl+O` / `Ctrl+Shift+O` | Open file / Open folder |
| `Ctrl+S` | Save |
| `Ctrl+W` | Close current tab |
| `Ctrl+Tab` | Switch tab |
| `Ctrl+P` | Quick open |
| ``Ctrl+` `` | Toggle source mode |
| `Ctrl+F` / `Ctrl+H` | Find / Find & replace |
| `Ctrl+Shift+F` | Global search |
| `Ctrl+B` / `Ctrl+Shift+B` | Toggle file tree / outline |
| `Ctrl+Shift+D` | Toggle light / dark |
| `Ctrl+,` | Settings |
| `Ctrl+Shift+E` / `Ctrl+Shift+P` | Export HTML / PDF |
| `F1` | Keyboard shortcuts panel |

## Project Structure

```
ZenNote/
├── src/                    # Frontend source (React)
│   ├── components/         # UI (editor / layout / filetree / outline / search / dialogs / ui)
│   ├── store/              # Zustand slices + composition root
│   ├── domain/             # Domain types and pure logic
│   ├── services/           # Tauri platform wrappers
│   ├── lib/                # Export, save coordination, search helpers
│   ├── i18n/               # Internationalization (zh-CN / en-US)
│   ├── hooks/              # Custom hooks
│   └── styles/             # Design tokens + layered stylesheets
├── src-tauri/              # Rust backend (Tauri)
│   ├── src/                # Rust source
│   └── tauri.conf.json     # Tauri config
├── docs/                   # Design spec, PRD, tech design, review reports
├── scripts/                # Verification scripts (verify-ui.mjs)
└── public/                 # Static assets
```

## Documentation

- [Design spec (Claude Code desktop design language)](./docs/DESIGN-CLAUDE-CODE.md)
- [0.9.1 release notes (installer editor-style fix)](./docs/RELEASE-NOTES-0.9.1.md)
- [0.9.0 release notes](./docs/RELEASE-NOTES-0.9.0.md)
- [Product requirements](./docs/PRD.md)
- [Technical design](./docs/TECH-DESIGN.md)
- [Markdown rendering spec](./docs/MARKDOWN-RENDERING.md)
- [UX review](./docs/UX-REVIEW.md) · [Core code review](./docs/REVIEW-CORE.md) · [Editor/interaction review](./docs/REVIEW-EDITOR.md)

## License

[MIT](./src-tauri/Cargo.toml) © ZenNote
