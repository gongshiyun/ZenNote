---
kind: logging_system
name: 日志系统：Tauri 插件日志与前端 console 调试输出
category: logging_system
scope:
    - '**'
source_files:
    - src-tauri/src/lib.rs
    - src-tauri/Cargo.toml
    - src/components/editor/Editor.tsx
    - src/components/editor/TableContextMenu.tsx
---

本仓库的日志系统非常轻量，未引入统一的日志框架或结构化日志方案，仅包含以下两个分散的输出点：

1. **Rust/Tauri 后端**：在 `src-tauri/src/lib.rs` 中通过 `tauri-plugin-log` 插件初始化了基于 `log` crate 的日志器，仅在 `cfg!(debug_assertions)`（debug 构建）条件下启用，级别设置为 `log::LevelFilter::Info`。该插件按 Tauri 默认行为将日志输出到控制台/终端，未配置文件 sink、格式化器或分级路由。
2. **前端 React 应用**：仅在 `src/components/editor/Editor.tsx` 和 `src/components/editor/TableContextMenu.tsx` 中使用 `console.error` 打印初始化失败等错误信息，属于开发期调试输出，无统一封装或日志级别管理。

**关键约束与约定**：
- Rust 端未在任何业务函数中调用 `log::info!` / `log::error!` 等宏，所有文件系统操作错误均通过 `Result<String>` 返回字符串化错误消息给前端，由前端 UI 展示，而非写入日志。
- 前端未集成任何第三方日志库（如 pino、winston、sentry），也未定义全局错误捕获或日志上报逻辑。
- 由于 `tauri-plugin-log` 仅在 debug 构建下启用，release 构建完全无日志输出。

**结论**：该项目尚未建立正式的日志系统，仅依赖 Tauri 插件提供的最小化日志能力和浏览器控制台输出，无法支持结构化日志、持久化存储、远程上报或生产环境监控。