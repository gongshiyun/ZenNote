# ZenNote 0.9.1 — 发布说明（修复安装版编辑器样式失效）

> ℹ️ 0.9.1 另有一个图片块间距问题，已在 **0.9.2** 修复：[RELEASE-NOTES-0.9.2.md](./RELEASE-NOTES-0.9.2.md)。

> 建议所有 0.9.0 用户升级到 0.9.1。0.9.1 包含 0.9.0 的全部改动，另修复一个只在正式安装包中出现的渲染回归。

## 1. 问题现象（0.9.0 安装版）

安装/运行 0.9.0 后，编辑器区域表现异常（浏览器 `npm run dev` 和 QA 截图均无法复现）：

* **实时预览**：标题没有 H1/H2 的字号与衬线字体、表格没有卡片边框与列样式、代码块没有卡片外观，正文行距/行内代码/引用等排版全部退化为浏览器默认样式；
* **源码模式**：行号、滚动、行高正常，但**正文文字不可见**（实际被布局挤到视口之外/样式错乱）；
* 其他 React 内联 `style` 布局也受影响，导致编辑区高度、居中列等与设计不符。

## 2. 根因

Tauri 在**编译期**会解析前端资源并向 CSP 注入 nonce/hash。本次检查实际响应头为：

```
style-src 'self' 'unsafe-inline' 'nonce-<random>';
script-src 'self' 'sha256-...' 'sha256-...';
```

按 CSP 规范，**只要同一指令里出现 nonce 或 hash，`'unsafe-inline'` 就会被忽略**。因此：

1. CodeMirror 的 `EditorView.theme` / base theme 是在**运行时**通过创建 `<style>` 元素注入的，没有 nonce → 被 CSP 拦截（`style.sheet === null`，所有编辑器主题失效）；
2. React 的 `style={{...}}` 内联样式属性同样被 `style-src` 拦截 → 编辑区布局进一步错乱；
3. 浏览器开发模式没有这层 CSP，所以此前 28 张 QA 截图全部正常，属于「只在 Tauri 发行包中出现」的回归。

## 3. 修复

在 `src-tauri/tauri.conf.json` 的 `app.security` 中，仅对 `style-src` 关闭 Tauri 的 CSP 自动修改：

```json
"dangerousDisableAssetCspModification": ["style-src"]
```

修复后的响应头保持为：

```
style-src 'self' 'unsafe-inline';
```

* 运行时注入的 CodeMirror 主题与 React 内联样式恢复；
* **`script-src` 的 nonce/hash 保护保持不变**，没有引入远程脚本执行面；仅样式注入策略放宽（原配置本就声明 `'unsafe-inline'`，此前被 Tauri 的 nonce 覆盖）。
* 已同步更新 `docs/BUILD-WINDOWS.md` 的说明，避免后续重新开启该回归。

## 4. 验证（针对 release 二进制 + WebView2 实测）

通过 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=...` 连接正式构建的 `zennote.exe`（CDP）核对：

| 检查项 | 修复前（0.9.0） | 修复后（0.9.1） |
| --- | --- | --- |
| CodeMirror `<style>` 的 `sheet` | `null`（被 CSP 拦截） | 95 条规则生效 |
| `.cm-scroller` 计算样式 | `display:block; padding:0` | `display:flex; padding:40px 80px 0` |
| `.cm-content` | `font-size:12.5px; max-width:none` | `13.5px; max-width:860px` |
| 源码模式正文 | 不可见/错位 | 文字、行号、当前行高亮正常 |
| 预览 H1 | 无样式 | 衬线 30px / 600 |
| 预览表格 | 无边框 | 1px 暖色描边 + 10px 圆角卡片 |
| React 内联样式 | 被拦截 | 正常生效 |

证据截图：`artifacts/repro-fixed-source.png`、`artifacts/repro-fixed-preview.png`（由正式 release exe 通过 CDP 截图）。

## 5. 升级方式

* GitHub Releases 下载 `ZenNote_0.9.1_x64-setup.exe` 覆盖安装（会保留工作区/设置/会话）；
* 或在 0.9.0 中通过顶部标题栏/设置里的更新提示升级（`latest.json` 已指向 0.9.1，签名匹配）。

## 6. 其他

* 0.9.0 的全部功能与设计改动见 [RELEASE-NOTES-0.9.0.md](./RELEASE-NOTES-0.9.0.md)；
* 测试基线不变：47 个测试文件 / 543 项测试通过，lint 0 error，`tsc -b` 0 error；
* 安装包仍未做 Authenticode 代码签名，SmartScreen 可能提示“未知发布者”。
