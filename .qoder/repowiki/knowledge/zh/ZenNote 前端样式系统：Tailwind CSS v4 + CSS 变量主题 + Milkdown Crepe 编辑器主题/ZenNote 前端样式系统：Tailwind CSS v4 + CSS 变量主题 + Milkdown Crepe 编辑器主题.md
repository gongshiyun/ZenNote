---
kind: frontend_style
name: ZenNote 前端样式系统：Tailwind CSS v4 + CSS 变量主题 + Milkdown Crepe 编辑器主题
category: frontend_style
scope:
    - '**'
source_files:
    - src/styles/globals.css
    - docs/UI-DESIGN.md
    - package.json
---

## 样式体系概览

ZenNote 采用 **Tailwind CSS v4（@import "tailwindcss"）+ CSS 自定义属性（CSS Variables）主题系统**，结合 **Milkdown Crepe 编辑器主题**，实现亮/暗双主题的 Markdown 桌面编辑器。样式以全局 CSS 变量为核心设计令牌，通过 `.dark` 类切换主题。

## 核心架构与文件

- **全局样式入口** `src/styles/globals.css`：集中定义 Tailwind 导入、主题变量、Milkdown Crepe 主题、ProseMirror 编辑器样式、滚动条、拖拽区域等
- **应用级样式** `src/App.css`：欢迎页/计数器组件的独立样式（模板遗留）
- **基础样式** `src/index.css`：Vite React 模板的基础样式（字体、颜色变量、响应式断点）
- **UI 设计规范文档** `docs/UI-DESIGN.md`：完整的色彩系统、字体系统、组件规格、交互细节文档

## 主题系统设计

### 1. CSS 变量设计令牌

使用语义化 CSS 变量组织颜色体系：
- 背景色：`--bg-editor`、`--bg-sidebar`、`--bg-statusbar`、`--bg-toolbar`、`--bg-hover`
- 文字色：`--text-primary`、`--text-secondary`、`--text-tertiary`、`--text-accent`、`--text-markdown-mark`
- 边框色：`--border`、`--border-light`
- 交互色：`--selection-bg`、`--scrollbar-thumb`、`--titlebar-btn-hover`、`--titlebar-close-hover`

### 2. 双主题实现

- **亮色主题**：`:root` 下定义，编辑器纯白背景 `#FFFFFF`，主文字 `#1A1A1A`
- **暗色主题**：`.dark` 类覆盖，编辑器深灰背景 `#1E1E1E`，主文字 `#E0E0E0`
- **切换动画**：`transition: background-color 200ms ease, color 200ms ease`

### 3. Milkdown Crepe 编辑器主题

为编辑器及其浮动 UI（工具栏、斜杠菜单、链接预览、表格手柄等）定义两套完整主题变量：
- 亮色：`--crepe-color-background: #FFFFFF`，`--crepe-color-primary: #3B82F6`
- 暗色：`--crepe-color-background: #1E1E1E`，`--crepe-color-primary: #60A5FA`
- 字体：标题 Georgia/Times New Roman，正文 Microsoft YaHei/Segoe UI，代码 Cascadia Code/Fira Code

### 4. ProseMirror 编辑器样式

针对 ProseMirror 渲染的 Markdown 内容定制样式：
- 标题层级 H1-H6 不同边框颜色
- 代码块/行内代码深色背景 `#2A2A2A`
- 引用块左侧边框 `#555555`
- 表格单元格边框 `#444444`
- 链接强调色 `#6DB3F8`

## 编辑器增强功能

### Typora 风格源码标记显示

当区块获得焦点（`.zn-block-focused`）时，通过 `::before`/`::after` 伪元素显示 Markdown 语法标记：
- 标题显示 `#`、`##` 等前缀
- 加粗显示 `**` 前后标记
- 斜体显示 `*` 前后标记
- 行内代码显示反引号
- 删除线显示 `~~` 标记
- 链接显示 `[url]` 格式
- 高亮显示 `==` 标记
- 引用块显示 `>` 前缀
- 列表项显示 `-` 或编号
- 代码块显示 ``` 围栏

表格单元格内的标记被排除（`content: none !important`），保持表格渲染正常。

## 响应式策略

- **移动端断点**：`@media (max-width: 1024px)` 调整字体大小和间距
- **编辑器宽度**：`max-width: 860px`，水平 padding 随窗口宽度变化（1400px→120px，1200px→80px，900px→40px，<900px→24px）
- **三栏布局**：文件树（240px）、编辑器（flex 居中）、大纲（200px），均可折叠

## 组件样式规范

### 滚动条
- 宽度 6px，轨道透明，滑块默认透明，hover 时显示 `--scrollbar-thumb`
- 过渡效果 `background-color 300ms`

### 拖拽区域
- `.titlebar-drag`：Tauri 无边框窗口拖拽区域
- `.titlebar-no-drag`：禁止拖拽区域

### 面板分隔条
- `.resize-handle`：4px 宽，hover 扩展至 6px 并高亮 `var(--text-accent)`
- 光标 `col-resize`，z-index 10

### 焦点可见性
- `*:focus-visible { outline: 2px solid var(--text-accent); outline-offset: -2px; }`

## 技术栈与依赖

- **样式框架**：Tailwind CSS v4（通过 `@import "tailwindcss"` 引入）
- **编辑器**：Milkdown Crepe（基于 ProseMirror）
- **图表**：Mermaid（暗色主题覆盖 SVG 样式）
- **构建工具**：Vite + TypeScript
- **状态管理**：Zustand（主题状态在 store 中管理）

## 设计原则

根据 `docs/UI-DESIGN.md` 的设计规范：
- **无界面感**：UI 存在是为了消失，注意力应在文字上
- **克制**：可要可不要的元素都不要
- **安静**：色彩、边框、阴影全部收敛
- **高效**：高频操作有快捷键或就近入口

所有样式遵循「低存在感」原则，通过 CSS 变量统一管理，确保亮/暗主题的一致性和可维护性。