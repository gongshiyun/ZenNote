# ZenNote 0.9.2 — 发布说明（图片块间距修复）

> 建议 0.9.1 用户升级。0.9.2 包含 0.9.1 的 CSP 修复与 0.9.0 的全部改动，另修复 README 类文档中图片上下间距过大的问题。

## 1. 问题现象

打开带图片的 Markdown（典型如项目 README 的 shields.io 徽章）时：

* 连续 4 个徽章之间出现约 100px 的垂直空隙（截图 `artifacts/repro-readme-spacing.png`）；
* 图片较少时表现为「每张图片占一整块很高的空白」，将正文推得很远；
* 图片本身只有 ~22px 高，但每条图片行被测量为 **103px**。

## 2. 根因

图片在 Live Preview 中是 **行内 widget**（Markdown 的 `Image` 节点属于 Paragraph），但主题把容器写成了：

```css
.cm-zn-image { display: block; padding: 0.6em 0; text-align: center; }
```

行内 widget 内部出现 block 子盒会打断 CodeMirror 的行盒（line box）：
一个 22px 的图片行实际由「widget 47px + 上下各一个 28px 行高」组成，最终 103px。
在所有图片行上叠加 0.6em 上下内边距，就形成了截图中的巨大间隔。

## 3. 修复

* `.cm-zn-image` 改为 `inline-block`，去掉 block 布局与块级内边距；
* 新增 `.cm-zn-image-line`：仅当图片（或 `[![alt](img)](link)` 徽章）**独占一行**时，由装饰层给该行加类，用于居中与 `0.15em` 的轻微呼吸间距（实测行高 103px → 35px）；
* 行内图片（夹在文字中）不再额外撑高所在段落；
* 图片超过列宽时仍由 `max-width:100%` 缩放。

## 4. 验证

* release 二进制 + WebView2 CDP 实测 README.md：4 个徽章行高 **31–35px**（修复前 103px），图片居中，截图 `artifacts/repro-readme-fixed.png`；
* 单张独立图片仍居中显示；段落内小图正常内联，不再产生块级空隙；
* 既有不变量保持：`livePreviewTheme` 的 90+ 选择器 key、块级 widget 无垂直 margin 测试全部通过；
* 全量测试 47 文件 / 543 项通过，`lint` 0 error，`tsc -b` 0 error。

## 5. 升级方式

下载 `ZenNote_0.9.2_x64-setup.exe` 覆盖安装，或在 0.9.1 中通过更新提示升级（`latest.json` 已指向 0.9.2，签名匹配）。

## 6. 说明

* 0.9.1 修复的「安装版编辑器样式失效（CSP style-src）」见 [RELEASE-NOTES-0.9.1.md](./RELEASE-NOTES-0.9.1.md)；
* 0.9.0 的全部改动见 [RELEASE-NOTES-0.9.0.md](./RELEASE-NOTES-0.9.0.md)；
* 安装包未做 Authenticode 签名，SmartScreen 可能提示“未知发布者”。
