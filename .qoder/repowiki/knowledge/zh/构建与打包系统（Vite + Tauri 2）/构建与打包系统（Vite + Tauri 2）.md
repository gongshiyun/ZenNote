---
kind: build_system
name: 构建与打包系统（Vite + Tauri 2）
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - vite.config.ts
    - src-tauri/Cargo.toml
    - src-tauri/tauri.conf.json
    - src-tauri/build.rs
---

本项目的构建与打包系统由前端 Vite 和后端 Tauri 2 共同组成，采用前后端分离、Tauri 统一打包的架构。

**构建流程**
- 前端使用 Vite 8 + React 插件 + TailwindCSS 4 进行开发与构建，开发服务器运行在 5173 端口（strictPort: true），构建产物输出到 `dist/` 目录。
- Rust 后端通过 Cargo 管理，`src-tauri/Cargo.toml` 声明了 tauri 2.11.3 及文件系统、对话框、日志等插件依赖，crate-type 同时包含 staticlib、cdylib、rlib 以支持多平台打包。
- Tauri 配置 (`src-tauri/tauri.conf.json`) 将前端的 `dist` 作为静态资源嵌入，dev 模式通过 `beforeDevCommand: npm run dev` 启动 Vite 开发服务器，build 模式通过 `beforeBuildCommand: npm run build` 先构建前端再打包应用。
- `src-tauri/build.rs` 调用 `tauri_build::build()` 完成 Tauri 构建钩子。

**脚本与命令**
- `npm run dev`：启动 Vite 开发服务器。
- `npm run build`：先执行 `tsc -b` 进行 TypeScript 类型检查与编译，再执行 `vite build` 生成生产构建产物。
- `npm run lint`：使用 oxlint 进行代码检查。
- `npm run preview`：预览构建产物。
- Tauri CLI (`@tauri-apps/cli`) 负责最终桌面应用的打包，`bundle.targets: "all"` 表示默认打包所有平台（Windows、macOS、Linux）。

**版本管理**
- 前端版本号定义在 `package.json` 中（当前为 0.0.0），Rust/Tauri 版本号定义在 `src-tauri/Cargo.toml` 和 `src-tauri/tauri.conf.json` 中（均为 0.1.0），两者独立维护。

**打包产物**
- 前端构建产物位于根目录 `dist/`。
- Tauri 打包产物根据目标平台生成对应的安装包或可执行文件，图标文件位于 `src-tauri/icons/`，包含 .png、.icns、.ico 等多种格式。

**约束与约定**
- 开发时前端必须先在 5173 端口运行，Tauri 通过 `devUrl` 代理到该端口。
- 构建前必须先执行 TypeScript 类型检查（`tsc -b`），确保类型安全后再进行 Vite 构建。
- Rust 后端要求 rust-version >= 1.77.2。
- 未发现有 CI/CD 配置文件（如 `.github/workflows`、`Makefile`、`Dockerfile` 等），本地构建完全依赖 npm scripts 和 Tauri CLI。