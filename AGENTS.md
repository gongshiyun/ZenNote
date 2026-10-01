# AGENTS.md

## 项目概述

Zenmark（ZenNote）是一个本地优先的 Markdown 笔记桌面应用，技术栈：**React 19 + TypeScript + Vite + Tauri 2 + Zustand**。Markdown 编辑器基于 CodeMirror 6 实时预览（含 KaTeX、Mermaid 支持），另有独立源码模式；样式使用 Tailwind CSS 4，代码校验使用 oxlint，测试使用 Vitest。

## 模块边界

| 目录               | 职责                                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `src/components` | UI 组件：编辑器（`editor/`）、布局（`layout/`）、文件树（`filetree/`）、大纲（`outline/`）、搜索（`search/`）、对话框（`dialogs/`）                             |
| `src/store`      | Zustand 全局状态管理：`slices/` 下按领域拆分 slice（editor / fileTree / appearance / system），`index.ts` 为 composition root 聚合导出 `useStore` |
| `src/domain`     | 领域类型与纯逻辑（`types.ts`、`document.ts`、`filesystem.ts`），经 `index.ts` barrel 统一导出                                                  |
| `src/hooks`      | 自定义 hooks（`useMermaid`、`useUpdater`）                                                                                         |

补充目录：`src/services`（Tauri 文件/图片等平台能力封装）、`src/lib`（导出、字体栈、更新等工具）、`src/i18n`（zh-CN / en-US 文案）。

## 构建与验证命令

| 命令              | 说明                                |
| --------------- | --------------------------------- |
| `npm run dev`   | 启动 Vite 开发服务器                     |
| `npm run build` | `tsc -b` 类型检查 + `vite build` 产物构建 |
| `npm run lint`  | oxlint 代码检查                       |
| `npm run test`  | Vitest 单元测试（`test:watch` 为监听模式）   |

## 核心文件职责

| 文件                                   | 职责                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------- |
| `src/components/editor/livepreview/LivePreviewEditor.tsx` | 编辑器主逻辑：CodeMirror 实例生命周期、内容同步、主题切换时重渲染图表、查找替换入口 |
| `src/components/editor/livepreview/livePreview.ts` | 实时预览的核心：语法树 → 装饰、块级替换（表格/图表/公式/图片/HTML/目录/frontmatter）、异步渲染调度与全文预加载 |
| `src/components/editor/livepreview/widgets.ts` | 全部块级 widget 的 DOM（表格、图片、公式、Mermaid、目录、脚注、代码块工具、任务项）与其高度估算 |
| `src/components/editor/livepreview/renderedBlockActions.ts` | 渲染块上的交互：表格单元格编辑与行列菜单、图片对齐栏、表格右键菜单 |
| `src/components/editor/SourceEditor.tsx` | 源码模式（Ctrl+`）的 CodeMirror 表面；实时预览为默认编辑模式（设置中已无开关） |
| `src/components/layout/AppShell.tsx` | 应用布局与面板编排：标题栏 / 标签页 / 状态栏 / 文件树 / 大纲 / 编辑器组合、懒加载搜索与设置面板、自动保存逻辑            |
| `src/store/index.ts`                 | 全局状态 composition root：聚合全部 slice 创建单一 Zustand store，并回导出领域类型与 slice 接口    |

## 约束

* **TypeScript**：`moduleResolution: bundler`、`verbatimModuleSyntax`、`noUnusedLocals`、`noUnusedParameters`、`noFallthroughCasesInSwitch`、`erasableSyntaxOnly`、`noEmit`。注意：tsconfig 当前**未显式开启 `strict`**。

* **oxlint**：启用 `react` / `typescript` / `oxc` 插件；`react/rules-of-hooks` 为 error，`react/only-export-components` 为 warn。

* 修改代码时保持现有风格：相对路径导入、组件文件 PascalCase、与周围代码一致的注释密度与中文注释。

