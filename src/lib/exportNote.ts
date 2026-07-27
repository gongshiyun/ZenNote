// Shared note-export helpers (HTML / PDF), used by both the titlebar menu and shortcuts.

function buildExportHtml(bodyHtml: string, title: string) {
  return "<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<title>" + title + "</title>\n<style>\nbody{max-width:860px;margin:40px auto;padding:0 20px;font-family:\"Microsoft YaHei\",-apple-system,sans-serif;font-size:16px;line-height:1.8;color:#1a1a1a;background:#fff}\nh1{font-size:2em;border-bottom:2px solid #eee;padding-bottom:.3em}\nh2{font-size:1.5em;border-bottom:1px solid #eee;padding-bottom:.2em}\nh3{font-size:1.25em}\ncode{background:#f4f4f4;padding:2px 6px;border-radius:3px;font-size:.9em}\npre{background:#f4f4f4;padding:16px;border-radius:6px;overflow-x:auto}\npre code{background:none;padding:0}\nblockquote{border-left:4px solid #ddd;margin:0;padding:0 16px;color:#666}\ntable{border-collapse:collapse;width:100%}\nth,td{border:1px solid #ddd;padding:8px 12px;text-align:left}\nth{background:#f9f9f9;font-weight:600}\nimg{max-width:100%;height:auto}\n@media print{body{margin:0;padding:20px}}\n</style>\n</head>\n<body>\n" + bodyHtml + "\n</body>\n</html>";
}

function currentBodyHtml(fallbackContent: string): { bodyHtml: string; name: string } {
  const editorEl = document.querySelector(".ProseMirror") as HTMLElement | null;
  const bodyHtml = editorEl ? editorEl.innerHTML : fallbackContent.replace(/</g, "<").replace(/>/g, ">").replace(/\n/g, "<br>");
  return { bodyHtml, name: "" };
}

export async function exportToHtml(content: string, filePath: string) {
  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    const { bodyHtml } = currentBodyHtml(content);
    const name = filePath.split(/[\\/]/).pop()?.replace(/\.md$/, "") || "Note";
    const html = buildExportHtml(bodyHtml, name);
    const defaultPath = filePath.replace(/\.md$/, ".html");
    const savePath = await save({ defaultPath, filters: [{ name: "HTML", extensions: ["html"] }] });
    if (savePath && typeof savePath === "string") {
      await invoke("write_file", { path: savePath, content: html });
    }
  } catch { /* */ }
}

// PDF export: open a hidden window with rendered content, trigger print
// (Windows: user selects "Microsoft Print to PDF" in the print dialog)
export async function exportToPdf(content: string, filePath: string) {
  try {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const { invoke } = await import("@tauri-apps/api/core");
    const { bodyHtml } = currentBodyHtml(content);
    const name = filePath.split(/[\\/]/).pop()?.replace(/\.md$/, "") || "Note";
    const html = buildExportHtml(bodyHtml, name);
    const label = "pdf-export-" + Date.now();
    const win = new WebviewWindow(label, {
      title: "Export PDF - " + name,
      width: 900,
      height: 700,
      visible: false,
      url: "data:text/html;charset=utf-8," + encodeURIComponent(html),
    });
    win.once("tauri://created", () => {
      // Wait for content to load, then trigger print dialog via core command
      setTimeout(() => {
        invoke("plugin:webview|print", { label }).catch(() => {});
        setTimeout(() => { win.close().catch(() => {}); }, 2000);
      }, 1500);
    });
    win.once("tauri://error", () => { /* window creation failed */ });
  } catch { /* */ }
}
