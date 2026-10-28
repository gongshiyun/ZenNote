# ZenNote — Windows 安装包构建指南（0.9.0 起）

本文件记录 2026-10-28 实际构建出 `ZenNote_0.9.0_x64-setup.exe` 的完整流程与环境，便于复现与后续发版。

## 1. 环境（本次实测）

| 组件 | 版本 / 位置 |
| --- | --- |
| Windows | Windows 11 专业版 (10.0.26300)，x64 |
| Node.js | v24.22.1（`D:\software\nodejs`；PowerShell 禁用 `npm.ps1`，需用 `npm.cmd`） |
| MSVC | Visual Studio Build Tools 2026（`C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools`，含 cl/link） |
| Windows SDK | 10.0.26100（`C:\Program Files (x86)\Windows Kits\10`） |
| Rust | rustup 1.29.2，stable 1.99.1，`x86_64-pc-windows-msvc`（per-user 安装，`%USERPROFILE%\.cargo\bin`） |
| Tauri CLI | 项目内 `@tauri-apps/cli` 2.11.4 |
| NSIS | 3.11（Tauri 缓存 `%LOCALAPPDATA%\tauri\NSIS`） |

> Rust/Cargo 不在系统 PATH 时，构建前手动加入：`$env:Path = "$env:USERPROFILE\.cargo\bin;D:\software\nodejs;" + $env:Path`。

## 2. 一次性准备

### 2.1 安装 Rust（无需管理员）

```powershell
# 官方源（本次可用）；国内可换 https://rsproxy.cn/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe
Invoke-WebRequest https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe -OutFile rustup-init.exe
.\rustup-init.exe -y --profile minimal --default-host x86_64-pc-windows-msvc --default-toolchain stable
```

### 2.2 Cargo 镜像（可选，国内加速）

`%USERPROFILE%\.cargo\config.toml`：

```toml
[source.crates-io]
replace-with = "rsproxy-sparse"

[source.rsproxy-sparse]
registry = "sparse+https://rsproxy.cn/index/"
```

### 2.3 NSIS 工具链（GitHub 下载失败时手动预热）

Tauri 在打包阶段会下载 NSIS 3.11；若 `github.com` 超时（本次首次构建即失败于此），可手动放入缓存：

* 缓存目录：`%LOCALAPPDATA%\tauri\NSIS`
* 需要文件：
  * NSIS 3.11（SHA1 `EF7FF767E5CBD9EDD22ADD3A32C9B8F4500BB10D`，来自 `tauri-apps/binary-releases` 的 `nsis-3.11.zip`；GitHub 不可达时可用 `https://gh-proxy.com/https://github.com/...` 镜像）
  * `Plugins\x86-unicode\additional\nsis_tauri_utils.dll`（SHA1 `75197FEE3C6A814FE035788D1C34EAD39349B860`，来自 `tauri-apps/nsis-tauri-utils` v0.5.3）
* 布局：把 zip 内 `nsis-3.11/` 的内容直接放到 `%LOCALAPPDATA%\tauri\NSIS`（即 `NSIS\makensis.exe` 存在），再把 DLL 放入上述插件路径。

验证：`& "$env:LOCALAPPDATA\tauri\NSIS\makensis.exe" /VERSION` 输出 `v3.11`。

### 2.4 更新签名密钥

Tauri 配置开启了 `createUpdaterArtifacts`，构建必须提供签名私钥：

* 私钥：`src-tauri/keys/zennote.key`（Tauri/minisign 加密私钥）
* 密码：`src-tauri/keys/password.txt`

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content 'src-tauri/keys/zennote.key' -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = (Get-Content 'src-tauri/keys/password.txt' -Raw).Trim()
```

## 3. 构建

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;D:\software\nodejs;" + $env:Path
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content 'src-tauri/keys/zennote.key' -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = (Get-Content 'src-tauri/keys/password.txt' -Raw).Trim()

cd D:\ai-code\ZenNote
npm run tauri build -- --bundles nsis
```

说明：

* `--bundles nsis` 只构建 NSIS（避免再拉取 WiX 生成 MSI）。
* `beforeBuildCommand` 会自动执行 `npm run build`（tsc + vite），无需先手工构建前端。
* 首次 `cargo` 编译约 3 分钟（本机），后续增量约 1 分钟；产物 20.5MB `zennote.exe`。

产物：

```
src-tauri/target/release/zennote.exe
src-tauri/target/release/bundle/nsis/ZenNote_0.9.0_x64-setup.exe      (~6.7MB)
src-tauri/target/release/bundle/nsis/ZenNote_0.9.0_x64-setup.exe.sig
```

## 4. 发布目录与更新清单

`release/0.9.0/` 是本地发布暂存目录（不随仓库提交），包含 4 个可直接上传到 GitHub Release 的文件：

| 文件 | 说明 |
| --- | --- |
| `ZenNote_0.9.0_x64-setup.exe` | NSIS 安装程序（64 位） |
| `ZenNote_0.9.0_x64-setup.exe.sig` | Tauri 更新签名（minisign 格式） |
| `latest.json` | `tauri-plugin-updater` 清单（version / pub_date / platforms.windows-x86_64.signature+url） |
| `SHA256SUMS.txt` | 三个文件的 SHA-256 |

发布到 GitHub Release `v0.9.0` 时，至少上传 `setup.exe`、`.sig`、`latest.json`（`tauri.conf.json` 的 updater endpoint 指向 `releases/latest/download/latest.json`）；0.9.0 已按此上传并核对。

## 5. 安装包验收（本次已执行）

```powershell
# 静默安装到临时目录
.\ZenNote_0.9.0_x64-setup.exe /S /D=D:\ai-code\ZenNote\.installer-test
# 启动已安装程序（窗口标题 ZenNote，进程稳定存活）
Start-Process D:\ai-code\ZenNote\.installer-test\zennote.exe
# 静默卸载并确认注册表/目录/快捷方式清理
D:\ai-code\ZenNote\.installer-test\uninstall.exe /S
```

结果：安装 exit 0，安装目录含 `zennote.exe` + `uninstall.exe`，注册表 `HKCU\...\Uninstall\ZenNote` 正确；安装版启动后窗口标题为 `ZenNote`、8 秒后仍存活（WebView2 正常）；卸载 exit 0，目录与注册表条目均被清理，无残留快捷方式。

## 6. 注意

* 安装包**未做 Authenticode 代码签名**（仅 Tauri 更新签名）。Windows SmartScreen 可能提示“未知发布者”，正式分发建议购买代码签名证书后用 `signtool` 签名。
* 私钥 `src-tauri/keys/zennote.key` 随仓库保存属于历史配置；正式项目应移入 CI Secret，避免私钥入库。
* 本次构建在项目外留下了用户级 Rust 工具链与 `%LOCALAPPDATA%\tauri` NSIS 缓存；不参与版本控制。
