# ZenNote 设计规范 — Claude Code 桌面端设计语言

> 本文件是 0.9.0 重构（全站视觉重做）的唯一设计基准。
> 所有 UI 代码必须使用本文件定义的 token / 组件类 / 图标，不再写死颜色、字号、圆角与阴影。
> 实现基线：`src/styles/tokens.css`、`base.css`、`ui.css`，以及 `src/components/ui/`。

## 1. 设计原则

1. **纸感画布（Canvas-first）**
   界面是一张暖色纸，不是一块屏幕。浅色用暖骨白 `#FAF9F5`，深色用暖炭 `#262624`；
   永远不用纯白 `#fff` / 纯黑 `#000` 做大面积底色。侧栏比画布深一档，浮层比画布亮一档。
2. **只用一种彩色：陶土 clay**
   品牌色 `#D97757`。它只承担「注意力」：焦点环、链接、当前项指示条、开关/滑块、
   品牌标记、未保存圆点、搜索命中高亮。**大面积填充一律用墨色**（浅色主题 `#1F1E1D`，
   深色主题 `#F5F4ED`）。不要用 clay 做整块按钮底色。
3. **用留白和表面色分隔，不用线**
   分割线是 1px 的半透明暖色 hairline；能靠间距/底色区分的地方就不画线。
4. **三种字体角色**
   - UI：无衬线 12.5px（正文 13px），字重 400/500/600。
   - 结构标题：衬线（欢迎页标题、空状态标题、对话框标题）。
   - 元数据：等宽（路径、快捷键、行列、字数、代码、语言标签）。
5. **紧凑的 chrome，宽松的正文**
   标题栏 40px、标签栏 38px、状态栏 26px、树行 28px；编辑页左右留白 ≥ 80px、正文 1.75 行高。
6. **克制的动效**
   hover/active 140ms，浮层进出 200ms，缓动 `cubic-bezier(.2,0,0,1)`。
   `prefers-reduced-motion: reduce` 时全部关闭。

## 2. 颜色 token

全部定义在 `src/styles/tokens.css`。深色通过 `<html class="dark">` 覆盖。

| Token | 浅色 | 深色 | 用途 |
| --- | --- | --- | --- |
| `--zn-canvas` | `#FAF9F5` | `#262624` | 应用底、编辑器底、状态栏 |
| `--zn-canvas-raised` | `#FFFFFF` | `#2B2B29` | 标签页选中、菜单、浮层 |
| `--zn-sidebar` | `#F0EEE6` | `#1F1E1D` | 左侧栏、大纲栏 |
| `--zn-surface` | `#F3F1E9` | `#30302E` | 代码块底、输入框底、分段控件槽 |
| `--zn-surface-strong` | `#EBE8DD` | `#383835` | 强调表面、kbd |
| `--zn-hover` | `rgba(31,30,29,.045)` | `rgba(250,249,245,.055)` | hover 底 |
| `--zn-active` | `rgba(31,30,29,.085)` | `rgba(250,249,245,.10)` | 选中行底 |
| `--zn-selected` | `rgba(217,119,87,.10)` | `rgba(217,119,87,.16)` | clay 选中底 |
| `--zn-border` | `rgba(31,30,29,.10)` | `rgba(250,249,245,.10)` | hairline |
| `--zn-border-soft` | `rgba(31,30,29,.06)` | `rgba(250,249,245,.06)` | 更弱的线 |
| `--zn-border-strong` | `rgba(31,30,29,.20)` | `rgba(250,249,245,.18)` | 输入框/开关槽 |
| `--zn-text` | `#1F1E1D` | `#F5F4ED` | 主文字 |
| `--zn-text-secondary` | `#6B6862` | `#B8B5AC` | 次文字、图标 |
| `--zn-text-tertiary` | `#9A968C` | `#8A887F` | 元数据、占位 |
| `--zn-text-disabled` | `#B8B4A9` | `#66645D` | 禁用 |
| `--zn-accent` | `#C2603F` | `#D97757` | 链接、焦点、指示 |
| `--zn-accent-strong` | `#A94B2C` | `#EF9A7B` | accent hover |
| `--zn-accent-soft` | `rgba(217,119,87,.10)` | `rgba(217,119,87,.16)` | clay 底 |
| `--zn-accent-ring` | `rgba(217,119,87,.30)` | `rgba(217,119,87,.40)` | 焦点外圈 |
| `--zn-btn-primary-bg` | `#1F1E1D` | `#F5F4ED` | 主按钮（墨色） |
| `--zn-btn-primary-fg` | `#FAF9F5` | `#1F1E1D` | 主按钮文字 |
| `--zn-success` | `#3E7A4E` | `#7FB08A` | 已保存等 |
| `--zn-warning` | `#8A6318` | `#D9A25F` | 未保存、冲突 |
| `--zn-danger` | `#A8402A` | `#E08069` | 错误、删除 |
| `--zn-selection` | `#DFE4E8` | `#3B4249` | 文本选区 |
| `--zn-code-inline-bg` | `#F0EDE3` | `#33322E` | 行内代码底 |
| `--zn-code-inline-fg` | `#A64A2E` | `#E3A57F` | 行内代码文字 |
| `--zn-code-block-bg` | `#F3F1E8` | `#2B2B29` | 围栏代码块底 |
| `--zn-scrim` | `rgba(31,30,29,.32)` | `rgba(10,10,9,.60)` | 遮罩 |
| `--zn-shadow-popover` | 暖色 0 10px 30px | 黑 0 10px 32px | 菜单/浮层 |
| `--zn-shadow-modal` | 暖色 0 24px 64px | 黑 0 28px 80px | 对话框 |

硬性规则：
- 不新增十六进制颜色；新颜色必须先加 token。
- 深色模式下不要用纯黑阴影，统一用 `--zn-shadow-*`。
- 语义色（success/warning/danger）只用于状态，不用于装饰。

## 3. 字体与字号

| Token | 值 |
| --- | --- |
| `--zn-font-ui` | `"Inter","Segoe UI Variable Text","Segoe UI",-apple-system,...,"Microsoft YaHei",sans-serif` |
| `--zn-font-serif` | `"Tiempos Text","Anthropic Serif","Source Serif 4",Georgia,"Noto Serif SC","Songti SC","SimSun",serif` |
| `--zn-font-mono` | `"Berkeley Mono","JetBrains Mono","Cascadia Code",Consolas,"Microsoft YaHei",monospace` |
| `--zn-fs-2xs` | 10px（大写标签、kbd） |
| `--zn-fs-xs` | 10.5px（section label） |
| `--zn-fs-sm` | 11.5px（状态栏、路径） |
| `--zn-fs-ui` | 12.5px（chrome 默认） |
| `--zn-fs-md` | 13px（列表、输入框） |
| `--zn-fs-lg` | 15px（搜索输入） |
| `--zn-fs-xl` | 18px（对话框标题） |
| `--zn-fs-display` | 32px（欢迎页标题） |

规则：
- UI 字号禁止 < 10.5px；正文禁止 < 13px。
- 大写 section label：`font-size:10.5px; letter-spacing:.08em; text-transform:uppercase; font-weight:600; color:var(--zn-text-tertiary)`。
- 衬线只用于「结构标题」：欢迎页标题、空状态标题、对话框标题、编辑器 H1/H2。
- 中文界面下 `--zn-font-ui` 必须回退到 `Microsoft YaHei`；不要把英文无衬线放在中文字体之后导致字形跳动。

## 4. 尺寸 / 圆角 / 阴影 / 动效

| Token | 值 | 用途 |
| --- | --- | --- |
| `--zn-titlebar-h` | 40px | 标题栏 |
| `--zn-tabbar-h` | 38px | 标签栏 |
| `--zn-statusbar-h` | 26px | 状态栏 |
| `--zn-sidebar-w` | 260px | 文件树默认宽 |
| `--zn-outline-w` | 200px | 大纲默认宽 |
| `--zn-radius-xs` | 4px | kbd、行内代码 |
| `--zn-radius-sm` | 6px | 菜单项、树行 |
| `--zn-radius-md` | 8px | 按钮、输入框、标签页 |
| `--zn-radius-lg` | 10px | 卡片、代码块 |
| `--zn-radius-xl` | 14px | 对话框、搜索浮层 |
| `--zn-radius-pill` | 999px | 圆点、开关 |
| `--zn-dur` | 140ms | 标准过渡 |
| `--zn-dur-slow` | 200ms | 浮层 |
| `--zn-ease` | `cubic-bezier(.2,0,0,1)` | 标准缓动 |

图标：线性、`stroke-width:1.5`、`currentColor`、默认 18px（chrome）/ 15-16px（行内）。
所有图标从 `src/components/ui/icons.tsx` 引用，**禁止**再手写一次性 SVG 或使用 emoji。

## 5. 组件规范与类名

CSS 分文件（按 owner 划分，禁止跨文件写别人负责的类）：

| 文件 | Owner | 内容 |
| --- | --- | --- |
| `tokens.css` / `base.css` / `ui.css` | Lead | token、reset、通用控件 |
| `shell.css` | ui-shell | 标题栏、标签栏、状态栏、欢迎页、应用骨架 |
| `panels.css` | ui-panels | 文件树/工作区、大纲、搜索、快速打开 |
| `dialogs.css` | ui-dialogs | 设置、快捷键、查找替换、冲突条、菜单/对话框的特化 |
| `editor.css` | ui-editor | 编辑页、源码模式、Mermaid 浮层、widget 特化 |

### 5.1 按钮（`ui.css` + `components/ui/Button.tsx`）

```tsx
<Button variant="primary">打开文件夹</Button>
<Button variant="secondary" iconLeft={<FolderIcon />}>打开文件</Button>
<IconButton label="设置" active={false}><SettingsIcon /></IconButton>
```

| 类 | 规则 |
| --- | --- |
| `.zn-btn` | 高 30px、padding 0 12px、radius 8、font 12.5/500、gap 6、过渡 140ms |
| `.zn-btn--primary` | 墨色底 + 反白字（深色模式反转） |
| `.zn-btn--secondary` | 透明底 + hairline 边 + 主文字色 |
| `.zn-btn--ghost` | 透明无边框，secondary 文字；hover 给 `--zn-hover` |
| `.zn-btn--danger` | danger 文字；hover danger-soft |
| `.zn-icon-btn` | 30×28、radius 6、secondary 图标；hover `--zn-hover` + 主文字色；`[data-active]` 时 accent + accent-soft |
| `.zn-btn--sm` | 高 26px、font 11.5px |

禁用：`opacity:.45; pointer-events:none`。

### 5.2 标题栏（`shell.css`）

高度 `--zn-titlebar-h`，背景 `--zn-canvas`，下边线 `--zn-border-soft`。
- 左：brand（`ZenMark` 16px clay + 「ZenNote」13px/600），随后是面板开关/导出/设置图标按钮（30×28）。
- 中：当前文档名（12px secondary，省略号，最大 36% 宽，`pointer-events:none`）。
- 右：主题（亮/暗/系统）图标按钮、语言按钮（`中`/`EN`，11px/700）、竖分隔线、窗口按钮（46×40，hover 用 `--zn-hover`，关闭 hover `#C0392B` 底 + 白字）。
- `-webkit-app-region: drag`；所有按钮 `no-drag`；双击空白最大化。

### 5.3 标签栏（`shell.css`）

高度 `--zn-tabbar-h`，背景 `--zn-canvas`，`padding:0 8px; gap:4px`。
- 标签是「胶囊」：高 30px、radius 8、padding 0 10px、max-width 220px、12.5px。
- 非激活：透明底、secondary 文字；hover `--zn-hover`。
- 激活：`--zn-canvas-raised` 底 + `--zn-border` 边 + `--zn-shadow-card`，主文字色。
- 未保存：6px clay 圆点；hover 时圆点切换为 ×。
- 右键菜单：`.zn-menu`。

### 5.4 侧栏 / 文件树（`panels.css`）

- 容器：宽可拖拽（默认 260）、背景 `--zn-sidebar`、右边线 `--zn-border`、上留 6px。
- 顶部工作区行（36px）：文件夹图标 + 工作区名（12.5/600，省略号）+ 右侧操作图标（打开文件/打开文件夹/新建笔记/刷新，24×24）。
- section label：`工作区` / `最近` 使用大写 label 规则，行高 28px，左右 padding 12px。
- 树行：28px 高、radius 6、margin 0 6px、padding-left = 6 + depth*14、图标 15px secondary、文字 12.5px。
  hover `--zn-hover`；当前/选中 `--zn-active` + 主文字色；键盘焦点 `box-shadow: inset 0 0 0 1px var(--zn-accent)`。
- 目录展开箭头 14px；文件夹图标用 `FolderIcon`/`FolderOpenIcon`。
- 空状态：`.zn-empty`，12px tertiary，padding 28px 12px。
- 最近工作区下拉：`.zn-menu`（贴顶、全宽、max-height 320）。

### 5.5 大纲（`panels.css`）

- 容器背景 `--zn-sidebar`、左边线 `--zn-border`（与编辑区分隔）。
- 标题行 36px：`大纲` 大写字距标签（用 `t().outline.title`）。
- 行：26px、radius 6、12px，按层级缩进（12 + (level-1)*14）；激活行 `--zn-active` + 左侧 2px clay 指示条 + 主文字色。

### 5.6 状态栏（`shell.css`）

高度 26px，背景 `--zn-canvas`，上边线 `--zn-border-soft`，11.5px tertiary，间距 14px。
- 左侧源码/预览切换：ghost 小按钮（图标 + 文案），激活时 accent + accent-soft。
- 中段统计文字；右侧/中段布局沿用现有信息（Ln/Col、保存状态、错误、选区、图片处理、字数/行数/阅读时长）。
- 所有文本必须保持现有 DOM 文本（测试依赖 `Ln 12, Col 7`、`已保存`、`未保存`、`保存失败`、`选中 4 字符 / 2 字`）。

### 5.7 菜单 / 右键菜单（`ui.css`）

`.zn-menu`：`--zn-canvas-raised` 底、hairline 边、radius 10、padding 5、`--zn-shadow-popover`、最小宽 180、z-index popover。
`.zn-menu__label`：大写 label，padding 6px 10px。
`.zn-menu__item`：高 30px、radius 6、padding 0 10px、12.5px；hover `--zn-hover`；`[data-danger]` danger 色；`[data-disabled]` 45% 且不响应。
`.zn-menu__hint`：右侧 mono 10.5px tertiary。
`.zn-menu__sep`：1px `--zn-border-soft`，margin 5px 6px。

### 5.8 对话框（`ui.css` + `components/ui/Modal.tsx`）

- 遮罩 `.zn-overlay`：`fixed inset 0`、`background:var(--zn-scrim)`、`backdrop-filter:blur(2px)`、z-modal、居中、padding 24。
- 面板 `.zn-modal`：`--zn-canvas` 底（设置类）或 `--zn-canvas-raised`、hairline 边、radius 14、`--zn-shadow-modal`、max-height 84vh、列布局、进出动画 200ms（淡入 + 上移 4px）。
- 头部 52px：标题（衬线 18/600）+ 可选副标题 + 右上关闭 IconButton。
- 主体 padding 20，可滚动；底部 footer 52px 上边线 + 右对齐按钮。
- 设置面板：宽 760、高 min(620px, 84vh)，左侧 190px 导航（`--zn-surface` 底、右边线），导航项 32px radius 6，激活 `--zn-active`；右侧内容区 padding 20 24。分组标题用大写 label。
- 表单行：最小高 34px，label 12.5 secondary，控件右对齐；滑块 `accent-color: var(--zn-accent)`。

### 5.9 输入 / 分段 / 开关（`ui.css`）

- `.zn-input`：高 30、radius 8、`--zn-canvas` 底、`--zn-border` 边、padding 0 10、12.5px；focus：边框 accent + `box-shadow:0 0 0 3px var(--zn-accent-ring)`。
- `.zn-segmented`：`--zn-surface` 底、radius 8、padding 2、gap 2；item 高 24、radius 6、12px secondary；激活项 `--zn-canvas-raised` 底 + hairline 边 + 主文字色。
- `.zn-switch`：32×18 胶囊；关 `--zn-border-strong`，开 `--zn-accent-fill`；滑块 14px 白色；过渡 140ms。
- `.zn-kbd`：mono 10.5、`--zn-surface-strong` 底、hairline 边、radius 4、padding 1px 5px、颜色 secondary。

### 5.10 搜索 / 快速打开（`panels.css`）

- 顶部居中浮层，宽 620，`margin-top:8vh`，`--zn-canvas-raised`、radius 14、`--zn-shadow-modal`。
- 输入行 52px：搜索图标 + 15px 输入 + 右侧 `Esc` kbd；下边线 hairline。
- 结果行：min-height 44px、padding 8 14；标题 13/500 主文字；路径 mono 11 tertiary，省略号；命中片段用 `<mark>`（accent-soft 底、accent-strong 文字、radius 3）。
- 选中行 `--zn-active` + 左侧 2px clay 指示条。
- 底部 32px 提示条：kbd 提示（↑↓ 选择、↵ 打开、Esc 关闭），11px tertiary。
- **必须保留**：`placeholder` 文案（`在工作区中搜索...` / `按文件名快速打开...`）。

### 5.11 查找替换（`dialogs.css`）

- 顶部内联条：高 44px、背景 `--zn-surface`、下边线 `--zn-border`；左右 padding 12。
- 输入框高 26、radius 6、无边框仅 hairline；命中计数 mono 11.5 tertiary；无效正则 danger。
- 图标切换按钮 24×24；激活 accent + accent-soft。
- **必须保留**：placeholder `查找...` / `替换为...`，以及 title `区分大小写`/`全词匹配`/`正则表达式`/`下一个 (Enter)`/`上一个 (Shift+Enter)`。

### 5.12 冲突条（`dialogs.css`）

- 高 34px，背景 `--zn-warning-soft`，文字 `--zn-warning`，左侧 AlertTriangle 图标 15px；右侧文字按钮（重载/保留本地）。删除场景用普通 toolbar 底色 + secondary 文字。

### 5.13 编辑页与正文（`editor.css` + `livePreviewTheme.ts`）

- 编辑器底 = `--zn-canvas`；内容列 `max-width: var(--zn-editor-content-width, 860px)`，左右 padding `var(--zn-lp-margin)`，顶部 padding 40px、底部 30vh。
- 正文：16px / 1.75、`--zn-editor-text`；H1 30px 衬线 600 / H2 22px 衬线 600 / H3 17.5px 无衬线 600 / H4-H6 14.5 无衬线 600；标题上间距 ≥ 1.4em。
- 段落间距 0.9em；列表缩进 1.4em；任务项 checkbox 用 `accent-color: var(--zn-accent)`。
- 引用：左侧 2px clay 竖线 + 衬线斜体 + secondary 文字；内边距 0.2em 1em。
- 链接：accent 色，下划线 `color-mix(accent 40%)`，hover 全下划线。
- 行内代码：mono .88em、`--zn-code-inline-bg` 底、`--zn-code-inline-fg` 文字、radius 4、padding 1px 5px。
- 围栏代码块：`--zn-code-block-bg` 底、hairline 边、radius 10；题头 32px 行（mono 10.5 tertiary 语言名 + 复制/语言切换图标按钮）；正文 mono 13/1.65、padding 12 16。
- 表格：外框 hairline + radius 10 + 裁剪；表头底 `--zn-surface`、12/600 secondary；单元格 14px、padding 7px 12px；行间 hairline；hover 行 `--zn-hover`；选中单元格 accent-soft 外框。
- 图片：radius 10 + hairline；对齐工具条为浮动 `.zn-menu` 风格。
- Mermaid / KaTeX：容器 `--zn-surface` 底 + hairline + radius 10；图表按钮为 icon-btn；全屏缩放浮层用 `--zn-canvas` 底 + `--zn-shadow-modal`。
- 源码模式：CodeMirror 同样居中列；`.cm-gutters` 无背景、`--zn-text-tertiary` 行号；`.cm-activeLine` 用 hover 色；选区 `--zn-selection`。
- **Test contract**：`livePreviewThemeSpec` 的 key 名与「块级 widget 无垂直 margin」不变量不能破坏（见 `src/__tests__/livePreviewTheme.test.ts`）。

### 5.14 欢迎页 / 空状态（`shell.css`）

- 居中，最大宽 420；`ZenMark` 44px clay；标题 `ZenNote` 32px 衬线 600；副标题 13px secondary；
  按钮：主按钮「打开文件夹」+ 次按钮「打开文件」；下方最近工作区列表（可选，行高 30、hover、点击恢复）。
- 空编辑器状态（有工作区无文件）：`ZenMark` 24px + 衬线标题 `打开一篇笔记开始写作` + 一行 kbd 提示（Ctrl+P 快速打开）。
- 所有文案必须走 `t()`，中英双语都要有 key。

## 6. 可访问性与交互硬性要求

1. 所有图标按钮必须有 `title` + `aria-label`；可点击的菜单项用 `<button role="menuitem">`。
2. 模态/浮层：`role="dialog" aria-modal="true"`，打开时焦点进入，Escape 关闭，关闭后焦点回到触发元素。
3. 键盘可达：文件树、大纲、搜索结果支持 ↑↓/Enter/Esc。
4. 焦点环统一 `outline:2px solid var(--zn-accent); outline-offset:1px`，不要用浏览器默认蓝色。
5. 颜色对比：正文 ≥ 7:1，次要文字 ≥ 4.5:1；accent 只用于大号/非文本元素时也要 ≥ 3:1。
6. 所有动画尊重 `prefers-reduced-motion`。
7. 文案：中文默认，英文同步；禁止硬编码可见字符串（包括 `Open Folder` 这类遗留）。

## 7. 测试契约（重构时不得破坏）

- `TabBar`：无标签时返回 `null`；标签文字为去扩展名文件名；右键菜单六项文案来自 `t().tabs`。
- `FileTree`：加载时显示 `加载工作区...`；空工作区显示 `暂无笔记`；懒加载子目录时显示 `搜索中...`。
- `Outline`：标题行有 `title={heading.text}`；空状态 `暂无标题`；点击滚动到 `.zn-live-preview .cm-zn-h*`。
- `SearchPanel`/`QuickOpen`：placeholder 文案不变。
- `FindReplaceBar`：placeholder 与 title 不变。
- `ShortcutsPanel`：根节点必须是遮罩层（`container.firstChild`），遮罩点击关闭、面板点击不关闭、Escape 关闭。
- `SettingsDialog`：标题 `设置`/`Settings`，语言切换按钮 `English`。
- `StatusBar`：文本片段 `Ln 12, Col 7`、`已保存`、`未保存`、`保存失败`、`选中 N 字符 / M 字`。
- `scrollbarVisibility`：`src/styles/globals.css` 中必须保留 `::-webkit-scrollbar`、`::-webkit-scrollbar-thumb`、`*:hover::-webkit-scrollbar-thumb` 规则与 `var(--scrollbar-thumb` / `var(--text-secondary` 引用。
