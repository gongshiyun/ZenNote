---
kind: dependency_management
name: 依赖管理（npm + Cargo 双包管理器）
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - package-lock.json
    - src-tauri/Cargo.toml
    - src-tauri/Cargo.lock
---

ZenNote 采用前后端分离的双包管理器策略：前端使用 npm（package.json + package-lock.json），后端 Rust/Tauri 使用 Cargo（Cargo.toml + Cargo.lock）。两个子系统各自独立声明依赖，通过 Tauri IPC 进行通信。

**前端依赖管理（npm）**
- 依赖声明位于根目录 `package.json`，分为 `dependencies`（运行时：React、Zustand、@tauri-apps/*、Mermaid、Milkdown）和 `devDependencies`（构建/开发：Vite、TypeScript、Oxlint、Tailwind、Tauri CLI）。
- 版本约束以 `^`（兼容次版本更新）和 `~`（仅兼容补丁更新）为主，例如 TypeScript 使用 `~6.0.2` 锁定补丁版本，其余依赖使用 `^` 允许小版本升级。
- 锁文件 `package-lock.json`（lockfileVersion: 3）由 npm 自动生成并纳入版本控制，确保跨环境一致安装。从 lock 文件中可见依赖源为 `https://registry.npmmirror.com`（淘宝镜像）。
- 无 `node_modules` 提交（`.gitignore` 生效），无 vendoring 或私有 registry 配置。

**Rust/Tauri 依赖管理（Cargo）**
- 依赖声明位于 `src-tauri/Cargo.toml`，包含运行时依赖（serde、log、walkdir）和 Tauri 插件（tauri-plugin-log、tauri-plugin-dialog、tauri-plugin-fs、tauri-plugin-shell）。
- 构建依赖 `tauri-build` 在 `[build-dependencies]` 中单独声明。
- 版本约束使用语义化版本（如 `"1.0"`、`"2"`），Rust 版本要求 `rust-version = "1.77.2"`。
- 锁文件 `src-tauri/Cargo.lock` 由 Cargo 自动生成并纳入版本控制，来源为 `registry+https://github.com/rust-lang/crates.io-index`。

**约定与约束**
- 前后端依赖严格分离，不存在共享的 monorepo 包管理器（如 pnpm workspace、cargo workspace）。
- 所有锁文件均提交至 Git，保证可重现构建。
- 未发现私有仓库、代理或镜像配置（除 npm 默认使用 npmmirror 外），未使用依赖审计或安全扫描工具。
- 脚本命令集中在 `package.json` 的 `scripts` 字段中，提供 `dev`、`build`、`lint`、`preview` 四个标准命令。