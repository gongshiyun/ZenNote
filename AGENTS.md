# AGENTS.md

## 项目概述

Zenmark（ZenNote）是一个本地优先的 Markdown 笔记桌面应用，技术栈：**React 19 + TypeScript + Vite + Tauri 2 + Zustand**。Markdown 编辑器基于 Milkdown/Crepe（含 CodeMirror、KaTeX、Mermaid 支持），样式使用 Tailwind CSS 4，代码校验使用 oxlint，测试使用 Vitest。

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
| `src/components/editor/Editor.tsx`   | 编辑器主逻辑：Crepe 实例生命周期、HTML 清洗、块内 Markdown 渲染、查找替换、表格右键菜单、代码块语言注入（含 Mermaid） |
| `src/components/layout/AppShell.tsx` | 应用布局与面板编排：标题栏 / 标签页 / 状态栏 / 文件树 / 大纲 / 编辑器组合、懒加载搜索与设置面板、自动保存逻辑            |
| `src/store/index.ts`                 | 全局状态 composition root：聚合全部 slice 创建单一 Zustand store，并回导出领域类型与 slice 接口    |

## 约束

* **TypeScript**：`moduleResolution: bundler`、`verbatimModuleSyntax`、`noUnusedLocals`、`noUnusedParameters`、`noFallthroughCasesInSwitch`、`erasableSyntaxOnly`、`noEmit`。注意：tsconfig 当前**未显式开启 `strict`**。

* **oxlint**：启用 `react` / `typescript` / `oxc` 插件；`react/rules-of-hooks` 为 error，`react/only-export-components` 为 warn。

* 修改代码时保持现有风格：相对路径导入、组件文件 PascalCase、与周围代码一致的注释密度与中文注释。

