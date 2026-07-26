---
kind: error_handling
name: ZenNote 错误处理策略：Rust Result + 前端静默捕获
category: error_handling
scope:
    - '**'
source_files:
    - src-tauri/src/lib.rs
    - src/components/layout/AppShell.tsx
    - src/components/filetree/FileTree.tsx
    - src-tauri/src/main.rs
---

## 1. 使用的系统与模式
- Rust 后端（Tauri）：统一使用 `Result<T, String>` 作为命令返回值，通过 `map_err` / `?` 将底层 I/O 错误转换为中文描述性字符串，由 Tauri 框架自动序列化到前端。
- 前端（React + Tauri）：所有 `invoke` 调用均包裹在 `try/catch` 中，采用“静默失败”策略——catch 块为空或仅做降级处理，不向用户抛出弹窗或中断流程。
- 无全局错误边界、无自定义 Error 类型、无 panic/recover 机制；错误信息仅在 Rust 侧以字符串形式返回，前端不解析具体错误码。

## 2. 关键文件与位置
- `src-tauri/src/lib.rs`：定义全部 Tauri 命令（open_workspace/read_file/write_file/create_file/create_folder/rename_file/delete_file/move_file），每个命令返回 `Result<..., String>`，错误路径集中在 `map_err` 与早期 return Err(...)。
- `src/components/layout/AppShell.tsx`：集中了 auto-save、HTML 导出、窗口状态持久化、快捷键打开文件/文件夹等异步操作，全部使用 try/catch 包裹 invoke 调用，错误被忽略。
- `src/components/filetree/FileTree.tsx`：文件树的新建、重命名、删除、刷新等操作同样 try/catch 后静默失败，读取失败时回退为生成空 Markdown 内容。
- `src/store/index.ts`：Zustand store 本身不包含错误状态字段，仅通过 isLoading 布尔值表达加载态，无 error 字段。
- `src/main.ts` / `src-tauri/src/main.rs`：应用入口，未设置全局异常处理器，Tauri run().expect("error while running tauri application") 仅在进程启动阶段失败时 panic。

## 3. 架构与约定
- Rust 侧错误传播链：`fs::read_to_string` → `map_err(|e| format!("读取文件失败: {}", e))` → `Result<String, String>` → Tauri IPC → 前端 Promise reject。
- 前端错误消费模式：`try { await invoke(...) } catch { /* */ }`，对 I/O 失败采取“降级 + 继续运行”的策略，例如 read_file 失败时用标题行生成空内容，auto-save 失败则保持 isDirty 不变。
- 无统一的错误中间件或拦截器；每个 invoke 调用点独立处理异常。
- 日志：仅在 debug_assertions 下启用 `tauri_plugin_log`，release 构建不记录日志，因此运行时错误不可观测。

## 4. 约定与约束（基于代码观察）
- Rust 命令必须返回 `Result<T, String>`，错误信息使用中文格式化字符串，便于直接展示给用户（如“文件夹不存在”“文件已存在”“保存失败”等）。
- 前端所有 Tauri invoke 调用必须用 try/catch 包裹，且 catch 块不得中断 UI 流程；这是当前代码库的既定模式。
- 前端不维护全局错误状态，也不向用户展示错误对话框；错误被视为“可恢复的副作用失败”。
- 无 panic 使用场景（除 Tauri 启动时的 expect），也未见 recover 机制。
- 错误信息不具备结构化分类（无错误码枚举），前端无法区分“权限不足”“磁盘满”“路径非法”等具体原因，只能统一视为“操作失败”。