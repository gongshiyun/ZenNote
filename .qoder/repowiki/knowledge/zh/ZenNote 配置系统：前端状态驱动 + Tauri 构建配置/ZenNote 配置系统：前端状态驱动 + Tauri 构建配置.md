---
kind: configuration_system
name: ZenNote 配置系统：前端状态驱动 + Tauri 构建配置
category: configuration_system
scope:
    - '**'
source_files:
    - src/store/index.ts
    - src/i18n/index.ts
    - src/components/dialogs/SettingsDialog.tsx
    - src-tauri/tauri.conf.json
    - src-tauri/Cargo.toml
    - package.json
---

本仓库未实现传统意义上的集中式配置文件加载系统（如 .env、.yaml、application.properties），而是采用**前端 Zustand store 驱动的配置模式**与 **Tauri/构建期 JSON 配置**相结合的双层架构。

### 1. 运行时用户配置（Zustand ConfigSlice）
- 所有用户可编辑的设置（字体大小、Tab 缩进、自动保存延迟、隐藏文件显示、文件扩展名显示、默认源码模式等）均定义在 `src/store/index.ts` 的 `ConfigSlice` 中，以内存状态形式存在。
- 设置界面由 `src/components/dialogs/SettingsDialog.tsx` 提供，通过 `useStore` hook 直接读写这些字段。
- **持久化策略缺失**：当前代码未将 ConfigSlice 的任何字段写入 localStorage / IndexedDB / 文件系统，重启后配置会丢失。唯一有持久化的运行时配置是国际化语言（见下文）。

### 2. 国际化配置（i18n）
- 语言包位于 `src/i18n/zh-CN.ts` 和 `src/i18n/en-US.ts`，通过 `src/i18n/index.ts` 管理。
- 语言选择使用 `localStorage` 键 `zennote-locale` 进行持久化，启动时从 storage 恢复。
- 切换语言同时更新 Zustand store 中的 `locale` 字段和 i18n 模块内部状态。

### 3. Tauri 应用配置（构建期）
- `src-tauri/tauri.conf.json` 是唯一的 Tauri 应用配置入口，声明了产品名称、版本、标识符、窗口尺寸、安全策略、打包图标等。
- Rust 后端 `src-tauri/src/lib.rs` 通过 `#[tauri::command]` 暴露文件系统命令，但**没有读取任何外部配置文件**；所有行为硬编码在 Rust 代码中。
- `Cargo.toml` 仅声明依赖，无运行时配置项。

### 4. 前端构建配置
- `package.json` 通过 scripts 定义 dev/build/lint/preview 流程，依赖版本集中在 dependencies/devDependencies 中。
- Vite 配置（`vite.config.ts`）未在工具输出中展示，但 tauri.conf.json 的 `build.devUrl` 指向 `http://localhost:5173`，表明开发服务器由 Vite 提供。
- TypeScript 编译配置分散在 `tsconfig.json`、`tsconfig.app.json`、`tsconfig.node.json` 三个文件中。

### 5. 设计决策与约束
- **无环境变量机制**：未发现 `.env`、`.env.*` 文件或 `process.env` / `import.meta.env` 的使用。
- **无配置验证**：ConfigSlice 字段无类型校验或默认值回退逻辑（除 i18n 的语言回退到 zh-CN）。
- **配置即状态**：用户偏好全部作为 React/Zustand 状态管理，而非独立配置文件，这简化了 UI 绑定但牺牲了跨进程/重启持久化能力。
- **Rust 后端零配置**：Tauri 命令的行为完全由 Rust 源码决定，不支持运行时热重载配置。