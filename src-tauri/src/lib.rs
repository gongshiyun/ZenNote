use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use walkdir::WalkDir;

// ---- Data structures ----

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
}

// ---- File system commands ----

#[tauri::command]
fn open_workspace(path: String) -> Result<Vec<FileNode>, String> {
    let root = Path::new(&path);
    if !root.exists() {
        return Err(format!("文件夹不存在: {}", path));
    }
    if !root.is_dir() {
        return Err("路径不是文件夹".into());
    }
    build_tree(root)
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("读取文件失败: {}", e))
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, &content).map_err(|e| format!("保存失败: {}", e))
}

#[tauri::command]
fn create_file(path: String) -> Result<(), String> {
    if Path::new(&path).exists() {
        return Err("文件已存在".into());
    }
    // Ensure parent directory exists
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    fs::write(&path, "").map_err(|e| format!("创建文件失败: {}", e))
}

#[tauri::command]
fn create_folder(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("创建文件夹失败: {}", e))
}

#[tauri::command]
fn rename_file(old_path: String, new_path: String) -> Result<(), String> {
    if Path::new(&new_path).exists() {
        return Err("目标文件已存在".into());
    }
    fs::rename(&old_path, &new_path).map_err(|e| format!("重命名失败: {}", e))
}

#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("文件不存在".into());
    }
    if p.is_dir() {
        fs::remove_dir_all(&path).map_err(|e| format!("删除文件夹失败: {}", e))
    } else {
        fs::remove_file(&path).map_err(|e| format!("删除文件失败: {}", e))
    }
}

#[tauri::command]
fn move_file(src: String, dest: String) -> Result<(), String> {
    if Path::new(&dest).exists() {
        return Err("目标位置已存在同名文件".into());
    }
    // Ensure parent directory exists
    if let Some(parent) = Path::new(&dest).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    fs::rename(&src, &dest).map_err(|e| format!("移动失败: {}", e))
}

// ---- Tree builder ----

fn build_tree(root: &Path) -> Result<Vec<FileNode>, String> {
    let mut nodes: Vec<FileNode> = Vec::new();

    for entry in WalkDir::new(root)
        .min_depth(1)
        .max_depth(1)
        .sort_by_file_name()
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        let name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        // Skip hidden files and non-markdown files (for now)
        if name.starts_with('.') {
            continue;
        }

        if path.is_dir() {
            let children = build_tree(path)?;
            nodes.push(FileNode {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir: true,
                children: Some(children),
            });
        } else if path.extension().map_or(false, |ext| ext == "md") {
            nodes.push(FileNode {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir: false,
                children: None,
            });
        }
    }

    Ok(nodes)
}

// ---- PDF export (Windows: WebView2 PrintToPdf, no print dialog) ----

#[cfg(windows)]
#[tauri::command]
fn export_pdf(app: tauri::AppHandle, label: String, path: String) -> Result<(), String> {
    use tauri::Manager;
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2, ICoreWebView2_7, ICoreWebView2Environment6,
    };
    use webview2_com::PrintToPdfCompletedHandler;
    use windows::core::{Interface, HSTRING};

    let webview_window = app
        .get_webview_window(&label)
        .ok_or_else(|| "export window not found".to_string())?;
    append_debug_log(&app, "rust", &format!("export_pdf: got window label={}", label));

    // The export HTML is loaded by the window itself (base64 data: URL set on
    // creation). In this environment WebView2's async completion callbacks
    // (ExecuteScript / NavigationCompleted / PrintToPdf) are never delivered to
    // registered handlers, so we cannot wait on them. Instead we:
    //   1. give the (static, self-contained) document a moment to finish rendering,
    //   2. fire PrintToPdf (fire-and-forget),
    //   3. poll the output FILE until WebView2 finishes writing it.
    // The PDF file appearing with a stable, non-zero size is the success signal.
    std::thread::sleep(std::time::Duration::from_millis(800));

    // ---- Kick off PrintToPdf ----
    let pdf_path = std::path::PathBuf::from(&path);
    let (print_setup_tx, print_setup_rx) = std::sync::mpsc::channel::<Result<(), String>>();
    let (print_done_tx, print_done_rx) = std::sync::mpsc::channel::<Result<(), String>>();
    let app_p = app.clone();
    webview_window
        .with_webview(move |webview| {
            let result = (|| -> Result<(), String> {
                let controller = webview.controller();
                let core: ICoreWebView2 =
                    unsafe { controller.CoreWebView2() }.map_err(|e| e.to_string())?;
                let core7: ICoreWebView2_7 = core.cast().map_err(|e| e.to_string())?;
                // Print settings: keep theme backgrounds/colors so the PDF matches
                // the editor (by default WebView2 strips backgrounds when printing).
                let env = webview.environment();
                let env6: ICoreWebView2Environment6 = env.cast().map_err(|e| e.to_string())?;
                let settings = unsafe { env6.CreatePrintSettings() }.map_err(|e| e.to_string())?;
                unsafe { settings.SetShouldPrintBackgrounds(true) }.map_err(|e| e.to_string())?;
                // Zero the page margins so the document's own themed background fills
                // the entire page (otherwise the default 0.5in margins show as a white
                // ring around the content). The document provides its own inner padding.
                unsafe { settings.SetMarginTop(0.0) }.map_err(|e| e.to_string())?;
                unsafe { settings.SetMarginBottom(0.0) }.map_err(|e| e.to_string())?;
                unsafe { settings.SetMarginLeft(0.0) }.map_err(|e| e.to_string())?;
                unsafe { settings.SetMarginRight(0.0) }.map_err(|e| e.to_string())?;
                let path_h = HSTRING::from(&path);
                append_debug_log(&app_p, "rust", &format!("export_pdf: PrintToPdf path={}", path));
                let handler = PrintToPdfCompletedHandler::create(Box::new(
                    move |print_result, _success| {
                        let r = print_result.map_err(|e| format!("{:?}", e));
                        let _ = print_done_tx.send(r);
                        Ok(())
                    },
                ));
                unsafe { core7.PrintToPdf(&path_h, Some(&settings), &handler) }
                    .map_err(|e| e.to_string())?;
                Ok(())
            })();
            let _ = print_setup_tx.send(result);
        })
        .map_err(|e| e.to_string())?;

    // Confirm the PrintToPdf call was actually issued (otherwise the closure
    // failed/blocked and no file will ever appear).
    print_setup_rx
        .recv_timeout(std::time::Duration::from_secs(10))
        .map_err(|e| e.to_string())??;

    // ---- Wait for the PDF file to be written (primary success signal) ----
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(40);
    let mut result: Result<(), String> =
        Err("timed out waiting for the PDF file to be written".to_string());
    loop {
        // Fast path: the completion handler did fire (some environments deliver it).
        if let Ok(r) = print_done_rx.try_recv() {
            append_debug_log(&app, "rust", &format!("export_pdf: PrintToPdf completion={:?}", r));
            if r.is_ok() {
                result = Ok(());
                break;
            }
        }
        // File-based check: non-zero size that stays stable across two samples.
        if pdf_path.exists() {
            let size1 = std::fs::metadata(&pdf_path).map(|m| m.len()).unwrap_or(0);
            if size1 > 0 {
                std::thread::sleep(std::time::Duration::from_millis(600));
                let size2 = std::fs::metadata(&pdf_path).map(|m| m.len()).unwrap_or(0);
                if size2 > 0 && size2 == size1 {
                    append_debug_log(&app, "rust", &format!("export_pdf: PDF file ready, size={}", size2));
                    result = Ok(());
                    break;
                }
            }
        }
        if std::time::Instant::now() > deadline {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(400));
    }
    append_debug_log(&app, "rust", &format!("export_pdf: result={:?}", result));

    // Clean up the render window regardless of outcome.
    let _ = webview_window.close();
    append_debug_log(&app, "rust", "export_pdf: window closed");
    result
}

#[cfg(not(windows))]
#[tauri::command]
fn export_pdf(_label: String, _path: String) -> Result<(), String> {
    Err("PDF export is only supported on Windows".into())
}

// ---- Debug logging (works in release builds; writes to a file the user can share) ----

fn append_debug_log(app: &tauri::AppHandle, tag: &str, msg: &str) -> std::path::PathBuf {
    use std::io::Write;
    use tauri::Manager;
    let dir = app
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    let log_path = dir.join("export-debug.log");
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0);
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
    {
        let _ = writeln!(f, "[{:.3}] [{}] {}", secs, tag, msg);
    }
    log_path
}

#[tauri::command]
fn export_debug_log(app: tauri::AppHandle, msg: String) -> String {
    append_debug_log(&app, "js", &msg)
        .to_string_lossy()
        .to_string()
}

// ---- App entry ----

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_workspace,
            read_file,
            write_file,
            create_file,
            create_folder,
            rename_file,
            delete_file,
            move_file,
            export_pdf,
            export_debug_log,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}