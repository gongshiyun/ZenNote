# ZenNote

> 极简、轻量、小而美的本地 Markdown 笔记软件，编辑体验对标 Typora，界面语言对齐 Claude Code 桌面端。

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

## 设计语言

0.9.0 起，界面按 **Claude Code 桌面端**的设计语言整体重做：

* **暖纸画布**：浅色 `#FAF9F5` / 深色 `#262624`，不使用纯白或纯黑大面积底色
* **单一陶土强调色** `#D97757`：只用于焦点、链接、当前项指示、开关与品牌标记；大面积填充使用墨色
* **三种字体角色**：无衬线 UI、衬线结构标题、等宽元数据（路径 / 快捷键 / 代码）
* **克制的 chrome**：40px 标题栏、38px 胶囊标签页、26px 状态栏、1px 暖色发丝线
* 完整规范见 [docs/DESIGN-CLAUDE-CODE.md](./docs/DESIGN-CLAUDE-CODE.md)

## 特性

### 编辑体验

* **所见即所得**：输入即渲染，非左右分栏预览（CodeMirror 6 实时预览）
* **Typora 风格聚焦源码显示**：光标所在行显示 Markdown 标记（标题 `#`、列表 `-`、粗体 `**` 等），移开后自动渲染
* **源码模式**：一键切换纯文本源码编辑（``Ctrl+` ``），与实时预览共用同一个查找替换栏
* **行内格式**：粗体、斜体、删除线、高亮、行内代码、链接、图片
* **块级元素**：标题、引用、有序/无序列表、任务列表、分割线、代码块

### 进阶功能

* **Mermaid 图表**：` ```mermaid ` 代码块渲染为流程图、时序图、甘特图、类图等；点击图表进入编辑、失焦自动渲染
* **数学公式**：KaTeX 渲染行内 `$...$` 与块级 `$$...$$` 公式
* **表格编辑**：WYSIWYG 表格，右键菜单插入/删除行列、对齐与移动
* **查找替换**：`Ctrl+F` / `Ctrl+H`，支持区分大小写、全词、正则
* **图片**：剪贴板粘贴 / 拖入图片，支持缩放与对齐

### 工作区与导航

* **文件树侧边栏**：树形浏览工作区，新建/重命名/删除，键盘导航（↑↓←→ / Enter / F2 / Delete）
* **最近工作区**：记住最近打开的 5 个工作区
* **全局搜索**：`Ctrl+Shift+F` 搜索工作区内所有笔记，命中结果可跳转到对应行
* **大纲面板**：自动从标题生成，点击跳转、滚动联动（可置于右侧）
* **状态栏**：实时字数、行数、阅读时长、光标行列位置、保存状态

### 数据安全

* **自动保存**：停止输入后自动写盘，写失败自动重试
* **外部修改检测**：文件被其他程序修改时显示提示条，可重新加载或保留本地版本
* **关闭保护**：退出前刷新所有未保存文档；有未解决的外部冲突时不会静默覆盖磁盘版本

### 其他

* **亮 / 暗 / 跟随系统**：无白屏闪烁的主题切换
* **国际化**：中文 / English 界面切换
* **无边框窗口**：自定义标题栏，支持拖拽、双击最大化与窗口控制

## 技术栈

| 层面 | 技术 |
| --- | --- |
| 桌面框架 | [Tauri 2](https://tauri.app/)（Rust） |
| 前端 | React 19 + TypeScript |
| 编辑器 | CodeMirror 6（实时预览 + 源码模式） |
| 图表 / 公式 | Mermaid 11 / KaTeX |
| 样式 | 原生 CSS Design Tokens（Tailwind CSS 4 提供基础层） |
| 状态管理 | Zustand |
| 构建工具 | Vite 8 |
| 测试 | Vitest + Testing Library |

## 下载安装

前往 [Releases 页面](https://github.com/gongshiyun/ZenNote/releases) 下载最新安装包：

* **Windows x64**：`ZenNote_x.x.x_x64-setup.exe`（NSIS 安装程序）

本地构建的 0.9.0 安装包已发布在 [Releases](https://github.com/gongshiyun/ZenNote/releases)（`ZenNote_0.9.0_x64-setup.exe` + `latest.json` + SHA-256 校验和）；构建与打包方法见 [docs/BUILD-WINDOWS.md](./docs/BUILD-WINDOWS.md)。

下载后运行即可安装。

> 安装包未做 Authenticode 代码签名，Windows SmartScreen 可能提示“未知发布者”。

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

### 构建与验证

```bash
# 纯前端构建：编译 TypeScript + Vite 产物到 dist/，无需 Rust 工具链
npm run build

# 代码检查 / 单元测试
npm run lint
npm run test

# 视觉与冒烟验证：启动 dev server + Edge headless 截图到 artifacts/
node scripts/verify-ui.mjs

# 仅构建 NSIS 安装包（需 Rust 工具链与更新签名密钥，见 docs/BUILD-WINDOWS.md）
npm run tauri build -- --bundles nsis

# Tauri 全栈构建：构建前端 + Rust，并打包安装程序（需要 Rust 工具链）
npm run tauri build
```

> 在 `src-tauri` 目录执行 `cargo build` 前，需先运行 `npm run build` 生成 `dist/`（tauri-build 会校验 `frontendDist` 路径存在）。

Tauri 全栈构建产物位置：

* 安装程序：`src-tauri/target/release/bundle/nsis/ZenNote_x.x.x_x64-setup.exe`
* 可执行文件：`src-tauri/target/release/zennote.exe`

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl+N` | 新建笔记 |
| `Ctrl+O` / `Ctrl+Shift+O` | 打开文件 / 打开文件夹 |
| `Ctrl+S` | 保存 |
| `Ctrl+W` | 关闭当前标签页 |
| `Ctrl+Tab` | 切换标签页 |
| `Ctrl+P` | 快速打开 |
| ``Ctrl+` `` | 切换源码模式 |
| `Ctrl+F` / `Ctrl+H` | 查找 / 查找替换 |
| `Ctrl+Shift+F` | 全局搜索 |
| `Ctrl+B` / `Ctrl+Shift+B` | 切换文件树 / 大纲 |
| `Ctrl+Shift+D` | 切换亮色 / 暗色 |
| `Ctrl+,` | 设置 |
| `Ctrl+Shift+E` / `Ctrl+Shift+P` | 导出 HTML / PDF |
| `F1` | 快捷键面板 |

## 项目结构

```
ZenNote/
├── src/                    # 前端源码 (React)
│   ├── components/         # 组件（editor / layout / filetree / outline / search / dialogs / ui）
│   ├── store/              # Zustand 状态管理（slices + composition root）
│   ├── domain/             # 领域类型与纯逻辑
│   ├── services/           # Tauri 平台能力封装
│   ├── lib/                # 导出、保存协调、搜索等工具
│   ├── i18n/               # 国际化（zh-CN / en-US）
│   ├── hooks/              # 自定义 Hooks
│   └── styles/             # 设计令牌与分层样式
├── src-tauri/              # Rust 后端 (Tauri)
│   ├── src/                # Rust 源码
│   └── tauri.conf.json     # Tauri 配置
├── docs/                   # 设计规范、PRD、技术设计、评审报告
├── scripts/                # 验证脚本（verify-ui.mjs）
└── public/                 # 静态资源
```

## 文档

* [设计规范（Claude Code 桌面端设计语言）](./docs/DESIGN-CLAUDE-CODE.md)
* [0.9.2 发布说明（修复图片块间距）](./docs/RELEASE-NOTES-0.9.2.md)
* [0.9.1 发布说明（修复安装版编辑器样式问题）](./docs/RELEASE-NOTES-0.9.1.md)
* [0.9.0 发布说明](./docs/RELEASE-NOTES-0.9.0.md)
* [产品需求](./docs/PRD.md)
* [技术设计](./docs/TECH-DESIGN.md)
* [Markdown 渲染规范](./docs/MARKDOWN-RENDERING.md)
* [交互评审](./docs/UX-REVIEW.md) · [代码评审（核心）](./docs/REVIEW-CORE.md) · [代码评审（编辑器/交互）](./docs/REVIEW-EDITOR.md)

## 许可证

[MIT](./src-tauri/Cargo.toml) © ZenNote
