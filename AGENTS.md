# AGENTS.md

## 项目概述

ZenNote 是一个本地优先的 Markdown 笔记桌面应用，技术栈：**React 19 + TypeScript + Vite + Tauri 2 + Zustand**。Markdown 编辑器基于 CodeMirror 6 实时预览（含 KaTeX、Mermaid 支持），另有独立源码模式；代码校验使用 oxlint，测试使用 Vitest。

自 0.9.0 起，全站视觉统一为 **Claude Code 桌面端设计语言**：暖纸画布、单一陶土强调色、衬线结构标题、等宽元数据、1px 暖色发丝线。规范见 `docs/DESIGN-CLAUDE-CODE.md`。

## 模块边界

| 目录               | 职责                                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `src/components` | UI 组件：编辑器（`editor/`）、布局（`layout/`）、文件树（`filetree/`）、大纲（`outline/`）、搜索（`search/`）、对话框（`dialogs/`）、通用组件（`ui/`：图标、按钮、菜单、对话框、控件） |
| `src/store`      | Zustand 全局状态管理：`slices/` 下按领域拆分 slice（editor / fileTree / appearance / system），`index.ts` 为 composition root 聚合导出 `useStore` |
| `src/domain`     | 领域类型与纯逻辑（`types.ts`、`document.ts`、`filesystem.ts`），经 `index.ts` barrel 统一导出                                                  |
| `src/hooks`      | 自定义 hooks（`useMermaid`、`useUpdater`、`useDebouncedValue`）                                                                         |

补充目录：`src/services`（Tauri 文件/图片等平台能力封装）、`src/lib`（导出、保存协调、搜索、更新等工具）、`src/i18n`（zh-CN / en-US 文案）、`src/styles`（设计令牌与分层样式）、`src/dev`（仅 DEV 用的演示数据 harness）。

## 构建与验证命令

| 命令              | 说明                                |
| --------------- | --------------------------------- |
| `npm run dev`   | 启动 Vite 开发服务器                     |
| `npm run build` | `tsc -b` 类型检查 + `vite build` 产物构建 |
| `npm run lint`  | oxlint 代码检查                       |
| `npm run test`  | Vitest 单元测试（`test:watch` 为监听模式）   |
| `node scripts/verify-ui.mjs` | 启动 dev server + Edge headless 截图，产物写入 `artifacts/` |

## 核心文件职责

| 文件                                   | 职责                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------- |
| `src/components/editor/livepreview/LivePreviewEditor.tsx` | 编辑器主逻辑：CodeMirror 实例生命周期、内容同步、主题切换时重渲染图表 |
| `src/components/editor/livepreview/livePreview.ts` | 实时预览的核心：语法树 → 装饰、块级替换（表格/图表/公式/图片/HTML/目录/frontmatter）、异步渲染调度与全文预加载 |
| `src/components/editor/livepreview/widgets.ts` | 全部块级 widget 的 DOM（表格、图片、公式、Mermaid、目录、脚注、代码块工具、任务项）与其高度估算 |
| `src/components/editor/livepreview/renderedBlockActions.ts` | 渲染块上的交互：表格单元格编辑与行列菜单、图片对齐栏、表格右键菜单 |
| `src/components/editor/livepreview/livePreviewTheme.ts` | 编辑器主题（全部颜色/字体来自 CSS token）与注入的浮层样式；`livePreviewThemeSpec` 的 key 被测试固定 |
| `src/components/editor/SourceEditor.tsx` | 源码模式（``Ctrl+` ``）的 CodeMirror 表面；实时预览为默认编辑模式 |
| `src/components/layout/AppShell.tsx` | 应用布局与面板编排：标题栏 / 标签页 / 状态栏 / 文件树 / 大纲 / 编辑器组合、懒加载搜索与设置面板、自动保存与会话持久化 |
| `src/components/ui/*` | 设计系统原语：`icons.tsx`、`Button.tsx`、`Menu.tsx`、`Modal.tsx`、`Controls.tsx` |
| `src/styles/tokens.css` | 设计令牌唯一来源（颜色/字号/圆角/阴影/动效/字体栈） |
| `src/styles/{base,ui,shell,panels,dialogs,editor}.css` | 分层样式；`globals.css` 仅做分层导入与滚动条规则 |
| `src/store/index.ts`                 | 全局状态 composition root：聚合全部 slice 创建单一 Zustand store，并回导出领域类型与 slice 接口    |

## 约束

* **TypeScript**：`moduleResolution: bundler`、`verbatimModuleSyntax`、`noUnusedLocals`、`noUnusedParameters`、`noFallthroughCasesInSwitch`、`erasableSyntaxOnly`、`noEmit`。注意：tsconfig 当前**未显式开启 `strict`**。

* **oxlint**：启用 `react` / `typescript` / `oxc` 插件；`react/rules-of-hooks` 为 error，`react/only-export-components` 为 warn。

* **样式**：不得写死颜色/字号/圆角/阴影，一律使用 `src/styles/tokens.css` 的 token 与 `src/components/ui` 的原语；图标只能来自 `src/components/ui/icons.tsx`；禁止 emoji 图标与渐变/发光。新增 UI 必须同时适配亮/暗与中/英。

* **测试契约**：`src/__tests__/scrollbarVisibility.test.ts` 直接读取 `src/styles/globals.css`，滚动条三条规则必须保留在该文件；`livePreviewThemeSpec` 的 key 名与「块级 widget 无垂直 margin」不变量被测试固定。

* 修改代码时保持现有风格：相对路径导入、组件文件 PascalCase、与周围代码一致的注释密度与中文注释。
