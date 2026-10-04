use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[derive(serde::Deserialize)]
struct OutFile {
    name: String,
    data: Vec<u8>,
}

#[derive(serde::Serialize)]
struct OpenedFile {
    name: String,
    text: String,
}

/// Only keeps characters that are safe in a file name, so exported names can't escape the folder.
fn clean_name(name: &str) -> String {
    let s: String = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.' { c } else { '_' })
        .collect();
    let s = s.trim_start_matches('.').to_string();
    if s.is_empty() { "file".into() } else { s }
}

fn ext_of(name: &str) -> String {
    name.rsplit('.').next().unwrap_or("").to_string()
}

#[tauri::command]
async fn save_file(app: AppHandle, name: String, data: Vec<u8>) -> Result<Option<String>, String> {
    let ext = ext_of(&name);
    let picked = app
        .dialog()
        .file()
        .set_file_name(clean_name(&name))
        .add_filter(ext.to_uppercase(), &[ext.as_str()])
        .blocking_save_file();
    let Some(path) = picked else { return Ok(None) };
    let path: PathBuf = path.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(Some(path.display().to_string()))
}

#[tauri::command]
async fn save_files(app: AppHandle, folder_name: String, files: Vec<OutFile>) -> Result<Option<String>, String> {
    let picked = app.dialog().file().set_title("Choose where to export").blocking_pick_folder();
    let Some(dir) = picked else { return Ok(None) };
    let dir: PathBuf = dir.into_path().map_err(|e| e.to_string())?.join(clean_name(&folder_name));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    for f in files {
        std::fs::write(dir.join(clean_name(&f.name)), f.data).map_err(|e| e.to_string())?;
    }
    Ok(Some(dir.display().to_string()))
}

#[tauri::command]
async fn open_project(app: AppHandle) -> Result<Option<OpenedFile>, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("Car", &["lpcar", "json"])
        .blocking_pick_file();
    let Some(path) = picked else { return Ok(None) };
    let path: PathBuf = path.into_path().map_err(|e| e.to_string())?;
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    Ok(Some(OpenedFile { name, text }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![save_file, save_files, open_project])
        .run(tauri::generate_context!())
        .expect("error while running the car builder");
}
