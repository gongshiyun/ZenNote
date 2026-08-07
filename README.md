# ZenNote

> 极简、轻量、小而美的本地 Markdown 笔记软件，编辑体验对标 Typora。

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./src-tauri/Cargo.toml)
[![Tauri](https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![Platform](https://img.shields.io/badge/platform-Windows-0078D6?logo=windows)](https://github.com/gongshiyun/ZenNote/releases)

**中文** | [English](./README.en.md)

***

## 简介

ZenNote 是一款纯本地的 Markdown 书写工具：**打开就用，写完就走**。

* 不做云同步、不做插件市场、不做臃肿功能

* 笔记就是纯 `.md` 文件，数据完全由你掌控，绝不锁定

* 所见即所得（WYSIWYG）编辑，输入即渲染，体验对标 Typora

## 特性

### 编辑体验

* **所见即所得**：输入即渲染，非左右分栏预览

* **Typora 风格聚焦源码显示**：光标所在行显示 Markdown 标记（标题 `#`、列表 `-`、粗体 `**` 等），移开后自动渲染（基于 ProseMirror Decoration 实现）

* **源码模式**：一键切换纯文本源码编辑（CodeMirror 6 语法高亮）

* **行内格式**：粗体、斜体、删除线、行内代码、链接、图片

* **块级元素**：标题、引用、有序/无序列表、任务列表、分割线、代码块

### 进阶功能

* **Mermaid 图表**：` ```mermaid ` 代码块自动渲染为流程图、时序图、甘特图、类图等；语言选择器可选 mermaid，点击图表进入编辑、失焦自动渲染

* **数学公式**：KaTeX 渲染行内 `$...$` 与块级 `$$...$$` 公式

* **表格编辑**：WYSIWYG 表格，右键菜单插入/删除行列

* **查找替换**：编辑器内查找与替换（`Ctrl+F`）

* **图片**：剪贴板粘贴 / 拖入图片

### 工作区与导航

* **文件树侧边栏**：树形浏览工作区，新建/重命名/删除

* **全局搜索**：`Ctrl+Shift+F` 搜索工作区内所有笔记

* **大纲面板**：自动从标题生成，点击跳转、滚动联动

* **状态栏**：实时字数统计、光标行列位置

### 其他

* **暗色模式**：亮色 / 暗色 / 跟随系统

* **国际化**：中文 / English 界面切换

* **自动保存**：编辑停止后自动写盘

* **无边框窗口**：自定义标题栏，支持拖拽与窗口控制

## 技术栈

| 层面          | 技术                                        |
| ----------- | ----------------------------------------- |
| 桌面框架        | [Tauri 2](https://tauri.app/) (Rust)      |
| 前端          | React 19 + TypeScript                     |
| Markdown 引擎 | [Milkdown](https://milkdown.dev/) (Crepe) |
| 源码编辑器       | CodeMirror 6                              |
| 图表          | Mermaid 11                                |

KaTeX

Tailwind CSS 4

Zustand

Vite 8

| <br /> | <br /> |
| ------ | ------ |
| <br /> | <br /> |
| 数学公式   |        |
| 样式     |        |
| 状态管理   |        |
| 构建工具   |        |

## 下载安装

前往 [Releases 页面](https://github.com/gongshiyun/ZenNote/releases) 下载最新安装包：

* **Windows x64**：`ZenNote_x.x.x_x64-setup.exe`（NSIS 安装程序）

下载后运行即可安装。

## 从源码构建

### 环境要求

* [Node.js](https://nodejs.org/) ≥ 20

* [Rust](https://www.rust-lang.org/) ≥ 1.77.2（`src-tauri/Cargo.toml` 中 `rust-version = "1.77.2"`，推荐通过 [rustup](https://rustup.rs/) 安装）

* Tauri 2 的[系统依赖](https://tauri.app/start/prerequisites/)：

  * **Windows**：WebView2 Runtime（Windows 11 / 新版 Edge 通常已内置）、Visual Studio C++ 生成工具（含 MSVC 编译器与 Windows SDK）

> **纯前端开发（`npm run dev`）不需要 Rust 工具链**，只需安装 Node.js；只有开发或构建 Tauri 桌面应用时才需要 Rust 与上述系统依赖。

### 开发模式

```bash
# 安装依赖
npm install

# 纯前端开发：浏览器中运行 + 热更新，无需 Rust 工具链
npm run dev

# Tauri 桌面开发：前端热更新 + 原生窗口（需要 Rust 工具链）
npm run tauri dev
```

### 构建

```bash
# 纯前端构建：编译 TypeScript + Vite 产物到 dist/，无需 Rust 工具链
npm run build

# Tauri 全栈构建：构建前端 + Rust，并打包安装程序（需要 Rust 工具链）
npm run tauri build

# 仅编译 Rust 后端：在 src-tauri 目录下执行（需要 Rust 工具链）
cd src-tauri
cargo build             # Debug 构建，产物 src-tauri/target/debug/zennote.exe
cargo build --release   # Release 构建，产物 src-tauri/target/release/zennote.exe
```

> 在 `src-tauri` 目录执行 `cargo build` 前，需先运行 `npm run build` 生成 `dist/`（tauri-build 会校验 `frontendDist` 路径存在）。

Tauri 全栈构建产物位置：

* 安装程序：`src-tauri/target/release/bundle/nsis/ZenNote_x.x.x_x64-setup.exe`

* 可执行文件：`src-tauri/target/release/zennote.exe`

## 快捷键

| 快捷键                       | 功能           |
| ------------------------- | ------------ |
| `Ctrl+N`                  | 新建笔记         |
| `Ctrl+O` / `Ctrl+Shift+O` | 打开文件 / 打开文件夹 |
| `Ctrl+S`                  | 保存           |
| `Ctrl+`` `                | 切换源码模式       |
| `Ctrl+F`                  | 查找替换         |
| `Ctrl+Shift+F`            | 全局搜索         |
| `Ctrl+B` / `Ctrl+Shift+B` | 切换侧边栏 / 大纲   |
| `Ctrl+,`                  | 设置           |
| `Ctrl+Shift+E`            | 导出 HTML      |

## 项目结构

```
ZenNote/
├── src/                    # 前端源码 (React)
│   ├── components/         # 组件（编辑器、文件树、大纲、搜索、设置等）
│   ├── store/              # Zustand 状态管理
│   ├── i18n/               # 国际化（zh-CN / en-US）
│   ├── hooks/              # 自定义 Hooks
│   └── styles/             # 全局样式
├── src-tauri/              # Rust 后端 (Tauri)
│   ├── src/                # Rust 源码
│   └── tauri.conf.json     # Tauri 配置
├── docs/                   # 项目文档（PRD、技术设计等）
└── public/                 # 静态资源
```

## 许可证

[MIT](./src-tauri/Cargo.toml) © ZenNote
