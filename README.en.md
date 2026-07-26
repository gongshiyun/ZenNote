# ZenNote

> A minimalist, lightweight local Markdown note-taking app with a Typora-like editing experience.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./src-tauri/Cargo.toml)
[![Tauri](https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![Platform](https://img.shields.io/badge/platform-Windows-0078D6?logo=windows)](https://github.com/gongshiyun/ZenNote/releases)

[中文](./README.md) | **English**

![ZenNote screenshot](./screenshot.png)

---

## Introduction

ZenNote is a purely local Markdown writing tool: **open it, write, and go**.

- No cloud sync, no plugin marketplace, no bloat
- Notes are plain `.md` files — you own your data, no lock-in
- True WYSIWYG editing: what you type is rendered instantly, just like Typora

## Features

### Editing Experience
- **WYSIWYG**: type and see it rendered instantly — no side-by-side preview
- **Typora-style focus source reveal**: the line under the cursor shows its Markdown marks (heading `#`, list `-`, bold `**`, etc.) and renders automatically when you move away (powered by ProseMirror Decorations)
- **Source mode**: one-click switch to plain-text source editing (CodeMirror 6 syntax highlighting)
- **Inline formatting**: bold, italic, strikethrough, inline code, links, images
- **Block elements**: headings, blockquotes, ordered/unordered lists, task lists, dividers, code blocks

### Advanced
- **Mermaid diagrams**: ` ```mermaid ` code blocks render as flowcharts, sequence diagrams, Gantt charts, class diagrams, and more; pick `mermaid` from the language selector, click the diagram to edit, blur to re-render
- **Math**: KaTeX rendering for inline `$...$` and block `$$...$$` formulas
- **Tables**: WYSIWYG table editing with a context menu to insert/delete rows and columns
- **Find & replace**: in-editor search and replace (`Ctrl+F`)
- **Images**: paste from clipboard / drag and drop

### Workspace & Navigation
- **File tree sidebar**: browse your workspace as a tree; create / rename / delete
- **Global search**: `Ctrl+Shift+F` to search across all notes in the workspace
- **Outline panel**: auto-generated from headings; click to jump, scroll-synced
- **Status bar**: live word count and cursor line/column

### More
- **Dark mode**: light / dark / follow system
- **Internationalization**: Chinese / English UI
- **Auto-save**: saves automatically after you stop typing
- **Frameless window**: custom title bar with drag and window controls

## Tech Stack

| Layer | Technology |
| --- | --- |
| Desktop framework | [Tauri 2](https://tauri.app/) (Rust) |
| Frontend | React 19 + TypeScript |
| Markdown engine | [Milkdown](https://milkdown.dev/) (Crepe) |
| Source editor | CodeMirror 6 |
| Diagrams | Mermaid 11 |
| Math | KaTeX |
| Styling | Tailwind CSS 4 |
| State management | Zustand |
| Build tool | Vite 8 |

## Download & Install

Head to the [Releases page](https://github.com/gongshiyun/ZenNote/releases) to download the latest installer:

- **Windows x64**: `ZenNote_x.x.x_x64-setup.exe` (NSIS installer)

Run the installer to set up.

## Build from Source

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 20
- [Rust](https://www.rust-lang.org/) toolchain
- Tauri 2 [system dependencies](https://tauri.app/start/prerequisites/) (on Windows: WebView2 and Visual Studio C++ Build Tools)

### Development

```bash
# Install dependencies
npm install

# Start the dev server (frontend HMR + Tauri window)
npm run tauri dev
```

### Production Build

```bash
# Build frontend + Rust and bundle the installer
npm run tauri build
```

Output locations:

- Installer: `src-tauri/target/release/bundle/nsis/ZenNote_x.x.x_x64-setup.exe`
- Executable: `src-tauri/target/release/zennote.exe`

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+N` | New note |
| `Ctrl+O` / `Ctrl+Shift+O` | Open file / Open folder |
| `Ctrl+S` | Save |
| `Ctrl+`` ` | Toggle source mode |
| `Ctrl+F` | Find & replace |
| `Ctrl+Shift+F` | Global search |
| `Ctrl+B` / `Ctrl+Shift+B` | Toggle sidebar / outline |
| `Ctrl+,` | Settings |
| `Ctrl+Shift+E` | Export HTML |

## Project Structure

```
ZenNote/
├── src/                    # Frontend source (React)
│   ├── components/         # Components (editor, file tree, outline, search, settings, ...)
│   ├── store/              # Zustand state management
│   ├── i18n/               # Internationalization (zh-CN / en-US)
│   ├── hooks/              # Custom hooks
│   └── styles/             # Global styles
├── src-tauri/              # Rust backend (Tauri)
│   ├── src/                # Rust source
│   └── tauri.conf.json     # Tauri config
├── docs/                   # Project docs (PRD, tech design, ...)
└── public/                 # Static assets
```

## License

[MIT](./src-tauri/Cargo.toml) © ZenNote
