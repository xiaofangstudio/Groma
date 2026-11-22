#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectEntry {
    id: String,
    name: String,
    updated_at: u64,
    bytes: u64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProjectMeta {
    format: String,
    format_version: u32,
    name: String,
    created_at: u64,
    updated_at: u64,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn projects_root() -> Result<PathBuf, String> {
    let home = std::env::var("USERPROFILE").map_err(|_| "找不到 USERPROFILE".to_string())?;
    let dir = PathBuf::from(home).join("Documents").join("Groma");
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建工程目录：{e}"))?;
    Ok(dir)
}

fn project_dir(id: &str) -> Result<PathBuf, String> {
    if id.is_empty()
        || id.contains("..")
        || id.contains('/')
        || id.contains('\\')
        || id.contains(':')
        || id.contains('*')
        || id.contains('?')
        || id.contains('"')
        || id.contains('<')
        || id.contains('>')
        || id.contains('|')
    {
        return Err("非法的工程 id".to_string());
    }
    Ok(projects_root()?.join(format!("{id}.groma")))
}

fn sanitize_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .filter(|c| !matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        .take(40)
        .collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        "未命名设计".to_string()
    } else {
        trimmed.to_string()
    }
}

fn write_atomic(path: &Path, contents: &str) -> Result<(), String> {
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, contents).map_err(|e| format!("写入临时文件失败：{e}"))?;
    if path.exists() {
        fs::remove_file(path).map_err(|e| format!("替换旧文件失败：{e}"))?;
    }
    fs::rename(&tmp, path).map_err(|e| format!("落盘失败：{e}"))?;
    Ok(())
}

fn snapshot(dir: &Path) -> Result<(), String> {
    let scene = dir.join("scene.json");
    if !scene.exists() {
        return Ok(());
    }
    let snap_dir = dir.join("snapshots");
    fs::create_dir_all(&snap_dir).map_err(|e| format!("无法创建快照目录：{e}"))?;
    let name = format!("{}.json", now_ms());
    fs::copy(&scene, snap_dir.join(&name)).map_err(|e| format!("写快照失败：{e}"))?;
    let mut files: Vec<PathBuf> = fs::read_dir(&snap_dir)
        .map_err(|e| format!("读取快照目录失败：{e}"))?
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .filter(|p| p.extension().map(|x| x == "json").unwrap_or(false))
        .collect();
    files.sort();
    while files.len() > 20 {
        if let Some(old) = files.first().cloned() {
            let _ = fs::remove_file(old);
            files.remove(0);
        }
    }
    Ok(())
}

#[tauri::command]
fn groma_create_project(name: String) -> Result<String, String> {
    let root = projects_root()?;
    let base_name = sanitize_name(&name);
    let mut id = base_name.clone();
    let mut n = 2;
    while root.join(format!("{id}.groma")).exists() {
        id = format!("{base_name}-{n}");
        n += 1;
    }

    let dir = root.join(format!("{id}.groma"));
    fs::create_dir_all(dir.join("assets")).map_err(|e| format!("创建工程失败：{e}"))?;
    fs::create_dir_all(dir.join("snapshots")).map_err(|e| format!("创建快照目录失败：{e}"))?;

    let now = now_ms();
    let meta = ProjectMeta {
        format: "groma".to_string(),
        format_version: 1,
        name: base_name,
        created_at: now,
        updated_at: now,
    };
    let meta_json = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
    write_atomic(&dir.join("project.json"), &meta_json)?;
    Ok(id)
}

#[tauri::command]
fn groma_save_project(id: String, scene_json: String) -> Result<(), String> {
    let dir = project_dir(&id)?;
    if !dir.exists() {
        return Err("工程不存在".to_string());
    }
    let value: serde_json::Value =
        serde_json::from_str(&scene_json).map_err(|e| format!("场景 JSON 无效：{e}"))?;
    if !value.is_object() {
        return Err("场景 JSON 必须是对象".to_string());
    }

    snapshot(&dir)?;
    write_atomic(&dir.join("scene.json"), &scene_json)?;

    let meta_path = dir.join("project.json");
    let mut meta: ProjectMeta = match fs::read_to_string(&meta_path) {
        Ok(text) => serde_json::from_str(&text).map_err(|e| format!("工程元数据损坏：{e}"))?,
        Err(_) => ProjectMeta {
            format: "groma".to_string(),
            format_version: 1,
            name: id.clone(),
            created_at: now_ms(),
            updated_at: now_ms(),
        },
    };
    meta.updated_at = now_ms();
    let meta_json = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
    write_atomic(&meta_path, &meta_json)?;
    Ok(())
}

#[tauri::command]
fn groma_load_project(id: String) -> Result<String, String> {
    let dir = project_dir(&id)?;
    let scene = dir.join("scene.json");
    if !scene.exists() {
        return Err("工程还没有场景文件".to_string());
    }
    fs::read_to_string(scene).map_err(|e| format!("读取工程失败：{e}"))
}

#[tauri::command]
fn groma_list_projects() -> Result<Vec<ProjectEntry>, String> {
    let root = projects_root()?;
    let mut out = Vec::new();
    for entry in fs::read_dir(root).map_err(|e| format!("读取工程目录失败：{e}"))? {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        if path.extension().and_then(|x| x.to_str()) != Some("groma") {
            continue;
        }
        let id = match path.file_stem().and_then(|x| x.to_str()) {
            Some(s) => s.to_string(),
            None => continue,
        };
        let meta_path = path.join("project.json");
        let meta: Option<ProjectMeta> = fs::read_to_string(meta_path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok());
        let name = meta.as_ref().map(|m| m.name.clone()).unwrap_or(id.clone());
        let updated_at = meta
            .as_ref()
            .map(|m| m.updated_at)
            .unwrap_or_else(|| {
                fs::metadata(&path)
                    .and_then(|m| m.modified())
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0)
            });
        let bytes = fs::metadata(path.join("scene.json"))
            .map(|m| m.len())
            .unwrap_or(0);
        out.push(ProjectEntry {
            id,
            name,
            updated_at,
            bytes,
        });
    }
    out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(out)
}

#[tauri::command]
fn groma_rename_project(id: String, name: String) -> Result<(), String> {
    let dir = project_dir(&id)?;
    let meta_path = dir.join("project.json");
    if !meta_path.exists() {
        return Err("工程不存在".to_string());
    }
    let mut meta: ProjectMeta =
        serde_json::from_str(&fs::read_to_string(&meta_path).map_err(|e| format!("读取工程元数据失败：{e}"))?)
            .map_err(|e| format!("工程元数据损坏：{e}"))?;
    meta.name = sanitize_name(&name);
    meta.updated_at = now_ms();
    let meta_json = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
    write_atomic(&meta_path, &meta_json)
}

#[tauri::command]
fn groma_export_png(id: String, suggested_name: String, data_url: String) -> Result<String, String> {
    let dir = project_dir(&id)?;
    if !dir.exists() {
        return Err("工程不存在".to_string());
    }
    let payload = data_url
        .strip_prefix("data:image/png;base64,")
        .ok_or_else(|| "导出数据不是 PNG".to_string())?;
    if payload.len() > 64_000_000 {
        return Err("导出图片过大".to_string());
    }
    let bytes = STANDARD
        .decode(payload)
        .map_err(|e| format!("PNG 数据损坏：{e}"))?;
    if bytes.len() > 48_000_000 {
        return Err("导出图片超过 48MB".to_string());
    }

    let exports = dir.join("exports");
    fs::create_dir_all(&exports).map_err(|e| format!("无法创建导出目录：{e}"))?;
    let base = sanitize_name(&suggested_name);
    let mut file_name = format!("{base}.png");
    let mut n = 2;
    while exports.join(&file_name).exists() {
        file_name = format!("{base}-{n}.png");
        n += 1;
    }
    let path = exports.join(&file_name);
    fs::write(&path, &bytes).map_err(|e| format!("写入 PNG 失败：{e}"))?;
    Ok(path.to_string_lossy().to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LaunchInfo {
    mode: String,
    project_id: Option<String>,
}

#[tauri::command]
fn launch_mode() -> LaunchInfo {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut project_id = None;
    let mut wants_new = false;
    let mut i = 0;
    while i < args.len() {
        if args[i] == "--new" || args[i] == "-n" {
            wants_new = true;
        } else if args[i] == "--open" {
            project_id = args.get(i + 1).cloned();
            i += 1;
        }
        i += 1;
    }
    let mode = if wants_new {
        "new"
    } else if project_id.is_some() {
        "open"
    } else {
        "welcome"
    };
    LaunchInfo {
        mode: mode.to_string(),
        project_id,
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            launch_mode,
            groma_create_project,
            groma_save_project,
            groma_load_project,
            groma_list_projects,
            groma_rename_project,
            groma_export_png
        ])
        .run(tauri::generate_context!())
        .expect("Groma 启动失败");
}
