# ZenNote 技术方案

## 1. 技术栈总览

```
┌─────────────────────────────────────┐
│              Tauri v2                │
│  ┌───────────────────────────────┐  │
│  │        React 18 + TS          │  │
│  │  ┌─────────────────────────┐  │  │
│  │  │ Milkdown (WYSIWYG 模式) │  │  │
│  │  │ CodeMirror 6 (源码模式) │  │  │
│  │  │ mermaid.js (图表渲染)   │  │  │
│  │  └─────────────────────────┘  │  │
│  │  Zustand (state)              │  │
│  │  Tailwind CSS (styling)       │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │   Rust (Tauri backend)        │  │
│  │   - 文件系统操作              │  │
│  │   - 图片保存                  │  │
│  │   - PDF/HTML 导出             │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

| 层           | 技术                     | 版本     |
| ----------- | ---------------------- | ------ |
| 桌面壳         | Tauri                  | v2.x   |
| 前端框架        | React + TypeScript     | 18.x   |
| WYSIWYG 编辑器 | Milkdown (ProseMirror) | v7.x   |
| 源码编辑器       | CodeMirror 6           | v6.x   |
| 图表渲染        | mermaid.js             | v11.x  |
| 状态管理        | Zustand                | v4.x   |
| 样式          | Tailwind CSS           | v3.x   |
| 构建          | Vite                   | v5.x   |
| 后端          | Rust (Tauri 内置)        | stable |

***

> Markdown 渲染细节的完整规范见 [MARKDOWN-RENDERING.md](MARKDOWN-RENDERING.md)——涵盖 20+ 种语法的渲染行为、光标交互、边界情况和实现要点。

## 2. 项目结构

```
ZenNote/
├── src-tauri/                  # Rust 后端
│   ├── src/
│   │   ├── main.rs             # Tauri 入口
│   │   ├── lib.rs              # 命令注册
│   │   └── commands/
│   │       ├── mod.rs
│   │       ├── fs.rs           # 文件系统操作
│   │       ├── export.rs       # PDF / HTML 导出
│   │       └── image.rs        # 图片保存
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── icons/
├── src/                        # React 前端
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx    # 三栏布局容器
│   │   │   ├── Toolbar.tsx     # 顶部工具栏
│   │   │   └── StatusBar.tsx   # 底部状态栏
│   │   ├── filetree/
│   │   │   ├── FileTree.tsx
│   │   │   ├── FileTreeNode.tsx
│   │   │   └── FileContextMenu.tsx
│   │   ├── editor/
│   │   │   ├── MilkdownEditor.tsx    # Milkdown 包装
│   │   │   ├── SourceEditor.tsx      # CodeMirror 包装
│   │   │   ├── EditorContainer.tsx   # 双模式切换容器
│   │   │   ├── milkdown-setup.ts     # Milkdown 插件配置
│   │   │   └── mermaid-nodeview.ts   # Mermaid 自定义 nodeView
│   │   ├── outline/
│   │   │   └── Outline.tsx
│   │   └── dialogs/
│   │       ├── FindReplace.tsx
│   │       └── ExportDialog.tsx
│   ├── store/
│   │   ├── index.ts            # Zustand store
│   │   ├── editorSlice.ts
│   │   ├── fileTreeSlice.ts
│   │   ├── outlineSlice.ts
│   │   └── themeSlice.ts
│   ├── hooks/
│   │   ├── useAutosave.ts
│   │   ├── useFileTree.ts
│   │   ├── useKeyboard.ts
│   │   └── useTheme.ts
│   ├── lib/
│   │   ├── tauri.ts            # Tauri invoke 封装
│   │   ├── markdown.ts         # Markdown 工具
│   │   └── persistence.ts     # 本地配置读写
│   └── styles/
│       ├── globals.css
│       └── themes.css
├── index.html
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── vite.config.ts
```

***

## 3. 状态管理设计（Zustand）

```
Store
├── editorSlice
│   ├── currentFilePath: string | null
│   ├── content: string              # 当前 Markdown 原文
│   ├── isDirty: boolean
│   ├── sourceMode: boolean          # true=源码(CodeMirror), false=WYSIWYG(Milkdown)
│   └── cursorPosition: { line, col }
│
├── fileTreeSlice
│   ├── workspacePath: string | null
│   ├── recentWorkspaces: string[]   # 最近 5 个工作区路径（持久化）
│   ├── tree: FileNode[]
│   ├── expandedFolders: string[]    # 展开的文件夹路径列表（不可变更新！）
│   └── isLoading: boolean
│
├── outlineSlice
│   ├── headings: Heading[]          # [{ level, text, pos }]
│   └── activeHeadingId: string | null  # 当前滚动位置对应的标题
│
└── themeSlice
    ├── mode: 'light' | 'dark' | 'system'
    └── resolvedMode: 'light' | 'dark'   # 实际生效的主题
```

Zustand 注意事项

：

* `expandedFolders` 使用 `string[]` 而非 `Set<string>`——Zustand 的浅比较无法检测 Set 的变异。更新时必须创建新数组：`[...prev, newPath]` 或 `prev.filter(p => p !== removedPath)`

* `selectedWordCount` 不单独存储，在组件中通过 `useMemo` 从 `content` 和当前 selection 派生计算，避免与 store 不同步

* 字数统计、大纲标题等均为派生数据（selector），不存入 store

### 数据流

```
用户操作 → React 事件处理
              │
              ├─ 纯 UI 状态 → Zustand store → re-render
              │
              ├─ 文件 I/O → invoke Tauri command
              │                  │
              │                  └─ Rust 处理 → 返回结果 → 更新 store
              │
              └─ 编辑器变更 → Milkdown/CodeMirror onChange
                                │
                                ├─ 更新 store.content + isDirty
                                │
                                └─ useAutosave (debounce 500ms)
                                      │
                                      ├─ 成功 → isDirty = false
                                      └─ 失败 → 状态栏提示 3 秒
```

***

## 4. 源码模式切换方案

核心思路：：：两套编辑器实例共存但互斥显示：：，切换时同步内容。

```typescript
// EditorContainer.tsx
function EditorContainer() {
  const sourceMode = useStore(s => s.sourceMode);
  const content = useStore(s => s.content);

  return (
    <div className="editor-container">
      {/* 两套编辑器始终挂载（保持实例状态），通过 CSS display 切换 */}
      <div style={{ display: sourceMode ? 'none' : 'block' }}>
        <MilkdownEditor />
      </div>
      <div style={{ display: sourceMode ? 'block' : 'none' }}>
        <SourceEditor />  {/* CodeMirror 6 */}
      </div>
    </div>
  );
}
```

切换流程：

1. 用户按 `Ctrl+`` ` → `sourceMode` 翻转
2. 切换前将当前编辑器内容写入 `store.content`
3. 切换后目标编辑器从 `store.content` 读取并设置光标到同一行号
4. 两个编辑器都监听自身的 onChange，更新 `store.content`（确保自动保存始终拿到最新内容）

为什么不用单实例切换

：Milkdown 基于 ProseMirror，其 DOM 和编辑器状态深度绑定，不能简单地替换为纯文本。维护两个独立编辑器实例虽然内存多 \~20MB，但切换平滑且各自体验最优——WYSIWYG 模式有 Milkdown 的全部渲染能力，源码模式有 CodeMirror 的语法高亮和快捷操作。

***

## 5. Tauri 命令定义（Rust 侧）

### 文件系统（commands/fs.rs）

```rust
#[tauri::command]
fn open_workspace(path: String) -> Result<Vec<FileNode>, String>
// 递归遍历目录，返回文件树。默认仅返回 .md 文件和文件夹

#[tauri::command]
fn read_file(path: String) -> Result<String, String>
// UTF-8 读取 .md 文件

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String>
// 写入文件，返回标准 IO 错误信息供前端展示

#[tauri::command]
fn create_file(path: String) -> Result<(), String>

#[tauri::command]
fn create_folder(path: String) -> Result<(), String>

#[tauri::command]
fn rename_file(old_path: String, new_path: String) -> Result<(), String>

#[tauri::command]
fn delete_file(path: String) -> Result<(), String>
// 使用 trash crate 移入回收站

#[tauri::command]
fn move_file(src: String, dest: String) -> Result<(), String>
```

### 图片（commands/image.rs）

```rust
#[tauri::command]
fn save_image(
    data: Vec<u8>,
    filename: String,
    workspace_root: String
) -> Result<String, String>
// 保存到工作区根目录的 images/ 子文件夹
// 返回相对路径。文件名冲突时追加 "(1)", "(2)" 等
```

### 导出（commands/export.rs）

```rust
#[tauri::command]
fn export_html(
    markdown: String,
    output_path: String,
    theme: String
) -> Result<(), String>
// 将 Markdown 渲染为独立 HTML，内联所有样式和图片(Base64)

#[tauri::command]
fn export_pdf(
    markdown: String,
    output_path: String,
    options: PdfOptions
) -> Result<(), String>
```

### 配置持久化（commands/fs.rs）

```rust
#[tauri::command]
fn load_app_config() -> Result<AppConfig, String>
// 从 %APPDATA%/ZenNote/config.json 读取配置

#[tauri::command]
fn save_app_config(config: AppConfig) -> Result<(), String>
// 写入 %APPDATA%/ZenNote/config.json
// 存储：最近工作区列表、窗口大小位置、主题偏好、展开的文件夹等
```

***

## 6. Milkdown 编辑器配置

### 正确的插件组合

`@milkdown/crepe` 是官方开箱即用套装，内部已包含 commonmark + gfm + history + clipboard + cursor + indent 等常用插件。以此为基础，按需追加：

```typescript
// editor/milkdown-setup.ts
import { Crepe } from '@milkdown/crepe';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { prism } from '@milkdown/plugin-prism';

// ⚠️ 不要同时安装 @milkdown/preset-commonmark 和 @milkdown/preset-gfm
// Crepe 已内置两者，重复注册会导致插件冲突

export function createMilkdownEditor(root: HTMLElement, content: string) {
  const crepe = new Crepe({
    root,
    defaultValue: content,
    features: {
      [Crepe.Feature.CodeMirror]: false,  // 关闭 Crepe 自带的 CodeMirror
      [Crepe.Feature.BlockEdit]: true,    // 块级编辑增强
      [Crepe.Feature.Placeholder]: true,  // 空文档占位符
    },
  });

  crepe.use([
    prism,                                // 代码语法高亮
    listener.configure(listenerCtx, {     // 内容变更监听
      markdown: [getMarkdown],
      blur: [onBlur],
    }),
  ]);

  return crepe;
}

function getMarkdown(markdown: string) {
  // 更新 store.content → 触发 autosave
}
```

### Mermaid 集成方案

Milkdown 没有官方 mermaid 插件，通过自定义 nodeView 集成：

```typescript
// editor/mermaid-nodeview.ts
import mermaid from 'mermaid';
import { $view } from '@milkdown/utils';

// 初始化 mermaid.js（全局一次）
mermaid.initialize({ startOnLoad: false, theme: 'default' });

export const mermaidNodeView = $view(
  /* 匹配 lang === 'mermaid' 的围栏代码块 */,
  /* 渲染时调用 mermaid.render() 生成 SVG 替换代码块内容 */,
  /* 点击图表时切换回源码模式供编辑 */
);
```

核心行为：代码块语言为 `mermaid` 时，自动调用 `mermaid.render()` 生成 SVG 并替换节点内容。用户点击图表区域时节点切换回可编辑的代码视图。这样就实现了「编辑源码时实时预览图表」的效果。

***

## 7. 文件树与持久化

### 展开状态

```typescript
// 加载时：从 config 恢复展开状态
// 保存时：将 expandedFolders 写入 config
// 文件变更后刷新树：先刷新 tree，再从 config 恢复展开

const expandedFolders = config.expandedFolders ?? [];
// 刷新后的树节点如果路径在 expandedFolders 中，则默认展开
```

### 最近工作区

```typescript
// 打开工作区时：将路径推到列表最前，去重，保留最近 5 个
// 关闭应用时：保存到 %APPDATA%/ZenNote/config.json
```

### 拖拽

```
HTML5 Drag and Drop API:
  dragstart → 记录源路径
  dragover  → 检测目标是否为文件夹，高亮目标
  drop      → invoke('move_file', { src, dest }) → 刷新树
```

***

## 8. 主题切换与 Milkdown 暗色适配

全局 CSS 变量切换

（侧边栏、工具栏、状态栏）：

```css
/* themes.css */
:root { --bg-editor: #FFFFFF; --text-primary: #1A1A1A; /* ... */ }
.dark  { --bg-editor: #1E1E1E; --text-primary: #D4D4D4; /* ... */ }
```

Milkdown 内部主题适配

（代码块、引用、表格等编辑器内部元素）：

Milkdown 通过 `editorCtx` 的 `themeManager` 控制内部样式。切换暗色时需同步更新：

```typescript
// 切换暗色时调用
editor.action.setTheme('dark');  // 或自定义 theme 对象

// 在 Crepe 初始化时绑定主题
new Crepe({
  theme: resolvedMode === 'dark' ? darkTheme : lightTheme,
  // ...
});
```

如果不做这一步，编辑区内部的代码块背景、引用样式等在暗色下仍然是亮色。

Mermaid 图表

也需跟随主题切换：

```typescript
mermaid.initialize({ theme: resolvedMode === 'dark' ? 'dark' : 'default' });
```

***

## 9. 自动保存与错误处理

```
用户输入 → onChange 回调
              │
              ├─ store.content = newValue
              ├─ store.isDirty = true
              │
              └─ useAutosave hook:
                    debounce 500ms →
                    invoke('write_file', { path, content })
                      │
                      ├─ Ok(()) → store.isDirty = false
                      │
                      └─ Err(msg) →
                           保持 isDirty = true
                           状态栏显示 "保存失败：{msg}"（红色，3秒后消失）
                           连续失败 3 次后不再提示（避免闪烁干扰）
```

***

## 10. 快捷键映射

| 快捷键                 | 功能                   |
| ------------------- | -------------------- |
| `Ctrl+S`            | 手动保存                 |
| `Ctrl+`` `          | 切换源码/渲染模式（反引号，冲突面最小） |
| `Ctrl+B`            | 切换文件树侧边栏             |
| `Ctrl+Shift+B`      | 切换大纲面板               |
| `Ctrl+F`            | 查找                   |
| `Ctrl+H`            | 查找替换                 |
| `Ctrl+Z` / `Ctrl+Y` | 撤销 / 重做              |
| `Ctrl+Shift+D`      | 切换暗色模式               |
| `Ctrl+O`            | 打开工作区                |
| `Ctrl+N`            | 新建笔记                 |
| `Ctrl+Shift+E`      | 导出                   |

***

## 11. 依赖清单

### Rust (Cargo.toml)

```toml
[dependencies]
tauri = { version = "2" }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
walkdir = "2"          # 递归遍历目录
trash = "4"            # 移动文件到回收站
```

注意：已移除 `tray-icon` feature——需求明确关闭即退出，不做系统托盘。

### Node (package.json)

```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@milkdown/crepe": "^7.5.0",
    "@milkdown/plugin-prism": "^7.5.0",
    "@milkdown/plugin-listener": "^7.5.0",
    "@codemirror/state": "^6.4.0",
    "@codemirror/view": "^6.26.0",
    "@codemirror/lang-markdown": "^6.2.0",
    "@codemirror/theme-one-dark": "^6.1.0",
    "mermaid": "^11.0.0",
    "zustand": "^4.5.0",
    "@tauri-apps/api": "^2.0.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "@vitejs/plugin-react": "^4.3.0",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0"
  }
}
```

注意：

* 不再安装 `@milkdown/preset-commonmark` 和 `@milkdown/preset-gfm`——Crepe 已包含

* 不再安装 `@milkdown/plugin-mermaid`——此包不存在于 Milkdown 官方，改用自定义 nodeView + `mermaid`

* 新增 `@codemirror/*` 用于源码模式

* 新增 `mermaid` 用于图表渲染

***

## 12. 风险与对策

| 风险                                | 影响         | 对策                                           |
| --------------------------------- | ---------- | -------------------------------------------- |
| Milkdown v7 API 不稳定、迭代频繁          | 编辑器核心依赖破窗  | 锁定精确版本号（不用 `^`），项目初期完成全部插件兼容性验证              |
| 双编辑器实例内存占用偏高                      | 低配机器可能卡顿   | 实测内存增量，必要时改为「源码模式卸载 Milkdown 实例、切回时重建」       |
| Tauri webview 在不同 Windows 版本表现不一致 | 渲染差异       | 在 Windows 10 22H2 和 Windows 11 上分别测试         |
| Mermaid 渲染大图卡顿                    | 编辑体验下降     | 图表离开可视区域后销毁 SVG，重新进入时再渲染；大图表加 loading 态      |
| PDF 导出样式保真度不够                     | 输出质量差      | HTML 导出优先保证质量（可控），PDF 用系统打印兜底 + puppeteer 备选 |
| 大文件（>1万行）编辑卡顿                     | 编辑器不可用     | ProseMirror 对大文档有优化；实测后决定是否需要分段加载或虚拟滚动       |
| Milkdown 内部主题暗色适配遗漏               | 编辑器内部亮暗不统一 | 在 Milkdown 初始化时显式传入 theme 对象，CI 中加入暗色模式截图对比  |

***

## 13. 开发环境搭建步骤

```bash
# 1. 创建 Tauri + React 项目
npm create tauri-app@latest ZenNote -- --template react-ts

# 2. 安装前端核心依赖
cd ZenNote
npm install @milkdown/crepe @milkdown/plugin-prism @milkdown/plugin-listener
npm install @codemirror/state @codemirror/view @codemirror/lang-markdown @codemirror/theme-one-dark
npm install mermaid zustand @tauri-apps/api

# 3. 安装 Tailwind
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# 4. 在 tailwind.config.ts 中添加 content 路径和 darkMode
#    darkMode: 'class'  (配合 .dark 类切换)

# 5. 启动开发
npm run tauri dev
```

