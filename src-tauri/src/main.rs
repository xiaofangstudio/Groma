#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectEntry {
    id: String,
    name: String,
    updated_at: u64,
    bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotEntry {
    timestamp: u64,
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

fn recent_hidden_path() -> Result<PathBuf, String> {
    Ok(projects_root()?.join("recent-hidden.json"))
}

fn read_hidden_projects() -> Vec<String> {
    let Ok(path) = recent_hidden_path() else {
        return Vec::new();
    };
    fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str::<Vec<String>>(&text).ok())
        .unwrap_or_default()
}

fn write_hidden_projects(ids: &[String]) -> Result<(), String> {
    let path = recent_hidden_path()?;
    let tmp = path.with_extension("json.tmp");
    let body = serde_json::to_vec_pretty(ids).map_err(|e| format!("整理最近工程记录失败：{e}"))?;
    fs::write(&tmp, body).map_err(|e| format!("写入最近工程记录失败：{e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("保存最近工程记录失败：{e}"))
}

fn hide_recent_project(id: &str) -> Result<(), String> {
    let mut ids = read_hidden_projects();
    if ids.iter().any(|x| x == id) {
        return Ok(());
    }
    ids.push(id.to_string());
    write_hidden_projects(&ids)
}

fn show_recent_project(id: &str) -> Result<(), String> {
    let ids = read_hidden_projects();
    if !ids.iter().any(|x| x == id) {
        return Ok(());
    }
    let next: Vec<String> = ids.into_iter().filter(|x| x != id).collect();
    write_hidden_projects(&next)
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

fn snapshot_at(dir: &Path, timestamp: u64) -> Result<(), String> {
    let scene = dir.join("scene.json");
    if !scene.exists() {
        return Ok(());
    }
    let snap_dir = dir.join("snapshots");
    fs::create_dir_all(&snap_dir).map_err(|e| format!("无法创建快照目录：{e}"))?;
    let name = format!("{}.json", timestamp);
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

fn snapshot(dir: &Path) -> Result<(), String> {
    snapshot_at(dir, now_ms())
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
fn groma_save_project(id: String, scene_json: String, snapshot_before: Option<bool>) -> Result<(), String> {
    let dir = project_dir(&id)?;
    if !dir.exists() {
        return Err("工程不存在".to_string());
    }
    let value: serde_json::Value =
        serde_json::from_str(&scene_json).map_err(|e| format!("场景 JSON 无效：{e}"))?;
    if !value.is_object() {
        return Err("场景 JSON 必须是对象".to_string());
    }

    // 内容没变就不再留新快照：恢复版本后紧接着的一次自动保存、以及重复保存，
    // 不应该把同一份场景再记一遍版本。
    let unchanged = fs::read_to_string(dir.join("scene.json"))
        .map(|current| current == scene_json)
        .unwrap_or(false);
    if snapshot_before.unwrap_or(true) && !unchanged {
        snapshot(&dir)?;
    }
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
    // 真正打开过就重新回到最近列表，避免「移除」变成找不到的永久隐藏。
    let _ = show_recent_project(&id);
    fs::read_to_string(scene).map_err(|e| format!("读取工程失败：{e}"))
}

fn snapshot_path(dir: &Path, timestamp: u64) -> Result<PathBuf, String> {
    let path = dir.join("snapshots").join(format!("{timestamp}.json"));
    if !path.is_file() {
        return Err("这个版本不存在或已被清理".to_string());
    }
    Ok(path)
}

fn read_snapshot(dir: &Path, timestamp: u64) -> Result<String, String> {
    let path = snapshot_path(dir, timestamp)?;
    let text = fs::read_to_string(path).map_err(|e| format!("读取版本失败：{e}"))?;
    let value: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("版本 JSON 损坏：{e}"))?;
    if !value.is_object() {
        return Err("版本内容不是场景对象".to_string());
    }
    Ok(text)
}

#[tauri::command]
fn groma_list_snapshots(id: String) -> Result<Vec<SnapshotEntry>, String> {
    let dir = project_dir(&id)?;
    let snap_dir = dir.join("snapshots");
    if !snap_dir.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in fs::read_dir(&snap_dir).map_err(|e| format!("读取版本目录失败：{e}"))? {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|x| x.to_str()) != Some("json") {
            continue;
        }
        let timestamp = match path.file_stem().and_then(|x| x.to_str()).and_then(|x| x.parse::<u64>().ok()) {
            Some(value) => value,
            None => continue,
        };
        let bytes = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        out.push(SnapshotEntry { timestamp, bytes });
    }
    out.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(out)
}

#[tauri::command]
fn groma_create_snapshot(id: String) -> Result<SnapshotEntry, String> {
    let dir = project_dir(&id)?;
    if !dir.join("scene.json").exists() {
        return Err("工程还没有可保存的内容".to_string());
    }
    let timestamp = now_ms();
    snapshot_at(&dir, timestamp)?;
    let bytes = fs::metadata(dir.join("snapshots").join(format!("{timestamp}.json")))
        .map(|m| m.len())
        .unwrap_or(0);
    Ok(SnapshotEntry { timestamp, bytes })
}

#[tauri::command]
fn groma_load_snapshot(id: String, timestamp: u64) -> Result<String, String> {
    let dir = project_dir(&id)?;
    read_snapshot(&dir, timestamp)
}

#[tauri::command]
fn groma_restore_snapshot(id: String, timestamp: u64) -> Result<String, String> {
    let dir = project_dir(&id)?;
    let text = read_snapshot(&dir, timestamp)?;
    // 恢复前把当前场景也留一份，回滚本身可以再回滚。
    snapshot(&dir)?;
    write_atomic(&dir.join("scene.json"), &text)?;
    let meta_path = dir.join("project.json");
    if let Ok(meta_text) = fs::read_to_string(&meta_path) {
        if let Ok(mut meta) = serde_json::from_str::<ProjectMeta>(&meta_text) {
            meta.updated_at = now_ms();
            if let Ok(meta_json) = serde_json::to_string_pretty(&meta) {
                let _ = write_atomic(&meta_path, &meta_json);
            }
        }
    }
    Ok(text)
}

#[tauri::command]
fn groma_list_projects() -> Result<Vec<ProjectEntry>, String> {
    let root = projects_root()?;
    let hidden = read_hidden_projects();
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
        if hidden.iter().any(|x| x == &id) {
            continue;
        }
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
fn groma_hide_recent_project(id: String) -> Result<(), String> {
    let dir = project_dir(&id)?;
    if !dir.is_dir() {
        return Err("工程不存在".to_string());
    }
    // 只从最近列表移除，工程目录、场景和快照都原地保留。
    hide_recent_project(&id)
}

#[tauri::command]
fn groma_restore_recent_project(id: String) -> Result<(), String> {
    let dir = project_dir(&id)?;
    if !dir.is_dir() {
        return Err("工程不存在".to_string());
    }
    show_recent_project(&id)
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

#[tauri::command]
fn groma_export_file(
    id: String,
    suggested_name: String,
    extension: String,
    payload: String,
) -> Result<String, String> {
    let dir = project_dir(&id)?;
    if !dir.exists() {
        return Err("工程不存在".to_string());
    }
    let ext = match extension.as_str() {
        "png" => "png",
        "jpg" | "jpeg" => "jpg",
        "svg" => "svg",
        "html" => "html",
        "css" => "css",
        "json" => "json",
        _ => return Err("不支持的导出格式".to_string()),
    };
    let bytes = if matches!(ext, "svg" | "html" | "css" | "json") {
        if payload.len() > 32_000_000 {
            return Err(format!("{ext} 内容过大"));
        }
        payload.into_bytes()
    } else {
        let prefix = if ext == "png" {
            "data:image/png;base64,"
        } else {
            "data:image/jpeg;base64,"
        };
        let encoded = payload
            .strip_prefix(prefix)
            .ok_or_else(|| format!("导出数据不是 {ext}"))?;
        if encoded.len() > 64_000_000 {
            return Err("导出图片过大".to_string());
        }
        STANDARD
            .decode(encoded)
            .map_err(|e| format!("{ext} 数据损坏：{e}"))?
    };
    if bytes.len() > 48_000_000 {
        return Err("导出文件超过 48MB".to_string());
    }

    let exports = dir.join("exports");
    fs::create_dir_all(&exports).map_err(|e| format!("无法创建导出目录：{e}"))?;
    let base = sanitize_name(&suggested_name);
    let mut file_name = format!("{base}.{ext}");
    let mut n = 2;
    while exports.join(&file_name).exists() {
        file_name = format!("{base}-{n}.{ext}");
        n += 1;
    }
    let path = exports.join(&file_name);
    fs::write(&path, &bytes).map_err(|e| format!("写入 {ext} 失败：{e}"))?;
    Ok(path.to_string_lossy().to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AssetFileInfo {
    file: String,
    mime: String,
    bytes: u64,
}

fn asset_extension(mime: &str) -> Result<&'static str, String> {
    match mime {
        "image/png" => Ok("png"),
        "image/jpeg" => Ok("jpg"),
        "image/webp" => Ok("webp"),
        _ => Err("只支持 PNG / JPG / WebP 图片".to_string()),
    }
}

fn asset_mime(ext: &str) -> Result<&'static str, String> {
    match ext {
        "png" => Ok("image/png"),
        "jpg" | "jpeg" => Ok("image/jpeg"),
        "webp" => Ok("image/webp"),
        _ => Err("不支持的图片扩展名".to_string()),
    }
}

fn asset_path(dir: &Path, file: &str) -> Result<PathBuf, String> {
    if file.contains("..") || file.contains('\\') || file.contains(':') {
        return Err("非法的资产路径".to_string());
    }
    let rel = Path::new(file);
    let mut parts = rel.components();
    let first = parts.next();
    let second = parts.next();
    let third = parts.next();
    if !matches!(first, Some(std::path::Component::Normal(value)) if value == std::ffi::OsStr::new("assets"))
        || !matches!(second, Some(std::path::Component::Normal(_)))
        || third.is_some()
    {
        return Err("资产路径必须是 assets/文件名".to_string());
    }
    Ok(dir.join(rel))
}

#[tauri::command]
fn groma_write_asset(
    id: String,
    file_name: String,
    mime: String,
    data_base64: String,
) -> Result<AssetFileInfo, String> {
    let dir = project_dir(&id)?;
    if !dir.exists() {
        return Err("工程不存在".to_string());
    }
    let ext = asset_extension(&mime)?;
    let encoded = data_base64
        .rsplit_once(',')
        .map(|(_, value)| value)
        .unwrap_or(&data_base64);
    if encoded.len() > 90_000_000 {
        return Err("图片超过 64MB".to_string());
    }
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|error| format!("图片数据损坏：{error}"))?;
    if bytes.len() > 64_000_000 {
        return Err("图片超过 64MB".to_string());
    }
    let magic_ok = match mime.as_str() {
        "image/png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        "image/jpeg" => bytes.starts_with(b"\xFF\xD8\xFF"),
        "image/webp" => bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP",
        _ => false,
    };
    if !magic_ok {
        return Err("图片内容与声明格式不一致".to_string());
    }

    let assets = dir.join("assets");
    fs::create_dir_all(&assets).map_err(|error| format!("无法创建图片目录：{error}"))?;
    let raw_name = Path::new(&file_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("图片");
    let base = sanitize_name(raw_name);
    let mut name = format!("{base}.{ext}");
    let mut index = 2;
    while assets.join(&name).exists() {
        name = format!("{base}-{index}.{ext}");
        index += 1;
    }
    let path = assets.join(&name);
    fs::write(&path, &bytes).map_err(|error| format!("写入图片失败：{error}"))?;
    Ok(AssetFileInfo {
        file: format!("assets/{name}"),
        mime,
        bytes: bytes.len() as u64,
    })
}

#[tauri::command]
fn groma_read_asset(id: String, file: String) -> Result<String, String> {
    let dir = project_dir(&id)?;
    if !dir.exists() {
        return Err("工程不存在".to_string());
    }
    let path = asset_path(&dir, &file)?;
    if !path.exists() {
        return Err(format!("图片资产不存在：{file}"));
    }
    let bytes = fs::read(&path).map_err(|error| format!("读取图片失败：{error}"))?;
    if bytes.len() > 64_000_000 {
        return Err("图片超过 64MB".to_string());
    }
    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let mime = asset_mime(&ext)?;
    Ok(format!(
        "data:{mime};base64,{}",
        STANDARD.encode(bytes)
    ))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HandoffInfo {
    target: String,
    exe: String,
    file: String,
}

struct HandoffSpec {
    label: &'static str,
    env_keys: &'static [&'static str],
    rel_paths: &'static [&'static str],
    bare_names: &'static [&'static str],
}

const STRATA_ENV: &[&str] = &["GROMA_STRATA_EXE", "STRATA_EXE"];
const VEXA_ENV: &[&str] = &["GROMA_VEXA_EXE", "VEXA_EXE"];
const STRATA_REL: &[&str] = &[
    "Strata/Strata.exe",
    "Strata/release/Strata.exe",
    "Strata/src-tauri/target/release/strata.exe",
    "Strata/src-tauri/target/release/Strata.exe",
];
const VEXA_REL: &[&str] = &[
    "Vexa/release/Vexa.exe",
    "Vexa/release/vexa.exe",
    "Vexa/src-tauri/target/release/vexa.exe",
    "Vexa/src-tauri/target/release/Vexa.exe",
];
const STRATA_NAMES: &[&str] = &["Strata.exe"];
const VEXA_NAMES: &[&str] = &["Vexa.exe", "vexa.exe"];

fn handoff_spec(target: &str) -> Result<HandoffSpec, String> {
    match target.trim().to_ascii_lowercase().as_str() {
        "strata" => Ok(HandoffSpec {
            label: "Strata",
            env_keys: STRATA_ENV,
            rel_paths: STRATA_REL,
            bare_names: STRATA_NAMES,
        }),
        "vexa" => Ok(HandoffSpec {
            label: "Vexa",
            env_keys: VEXA_ENV,
            rel_paths: VEXA_REL,
            bare_names: VEXA_NAMES,
        }),
        _ => Err("不支持的交接目标".to_string()),
    }
}

fn find_handoff_exe(spec: &HandoffSpec) -> Result<PathBuf, String> {
    for key in spec.env_keys {
        if let Ok(raw) = std::env::var(key) {
            let path = PathBuf::from(raw.trim().trim_matches('"'));
            if path.is_file() {
                return Ok(path);
            }
        }
    }

    let mut candidates = Vec::new();
    if let Ok(current) = std::env::current_exe() {
        let mut dir = current.parent();
        for _ in 0..8 {
            let Some(base) = dir else { break };
            for rel in spec.rel_paths {
                candidates.push(base.join(rel));
            }
            for name in spec.bare_names {
                candidates.push(base.join(name));
            }
            dir = base.parent();
        }
    }
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let programs = PathBuf::from(local).join("Programs");
        for name in spec.bare_names {
            candidates.push(programs.join(spec.label).join(name));
        }
    }
    if let Ok(program_files) = std::env::var("PROGRAMFILES") {
        let base = PathBuf::from(program_files);
        for name in spec.bare_names {
            candidates.push(base.join(spec.label).join(name));
        }
    }
    if let Ok(path) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path) {
            for name in spec.bare_names {
                candidates.push(dir.join(name));
            }
        }
    }

    for path in candidates {
        if path.is_file() {
            return Ok(path);
        }
    }
    Err(format!(
        "没找到 {}。请把 {} 指向发布版，或把 {} 放在 Groma 同级目录。",
        spec.label, spec.env_keys[0], spec.label
    ))
}

#[tauri::command]
fn groma_open_in_app(target: String, file: String) -> Result<HandoffInfo, String> {
    let spec = handoff_spec(&target)?;
    let target_key = target.trim().to_ascii_lowercase();
    let file_path = PathBuf::from(file.trim().trim_matches('"'));
    if !file_path.is_file() {
        return Err("导出文件不存在，无法交给外部应用".to_string());
    }
    let ext = file_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let allowed = match target_key.as_str() {
        "strata" => matches!(ext.as_str(), "png" | "jpg" | "jpeg"),
        "vexa" => ext == "svg",
        _ => false,
    };
    if !allowed {
        return Err(format!(
            "{} 不能接收 .{}；PNG/JPG 交给 Strata，SVG 交给 Vexa。",
            spec.label, ext
        ));
    }

    let exe = find_handoff_exe(&spec)?;
    let mut command = Command::new(&exe);
    command.arg(&file_path);
    if let Some(parent) = exe.parent() {
        command.current_dir(parent);
    }
    #[cfg(windows)]
    command.creation_flags(0x0800_0000);
    command
        .spawn()
        .map_err(|e| format!("启动 {} 失败：{e}", spec.label))?;
    Ok(HandoffInfo {
        target: target_key,
        exe: exe.to_string_lossy().to_string(),
        file: file_path.to_string_lossy().to_string(),
    })
}

/// 交接进来的图片：路径 -> 字节，前端据此构造 File 走既有 importImageAsset。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HandoffImage {
    name: String,
    mime: String,
    base64: String,
    bytes: u64,
}

/// 读取外部软件（Strata）处理好后送来的图片。
///
/// 只认位图扩展名 + 48MB 上限，和前端 importImageAsset 的口径一致；
/// 路径必须是真实文件，不能拿目录或工程包混进来。
#[tauri::command]
fn groma_read_handoff_image(path: String) -> Result<HandoffImage, String> {
    let file = PathBuf::from(path.trim().trim_matches('"'));
    if !file.is_file() {
        return Err("交接图片不存在".to_string());
    }
    let ext = file
        .extension()
        .and_then(|v| v.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        _ => return Err(format!("Groma 只接收 PNG / JPG / WebP，收到 .{ext}")),
    };
    let meta = fs::metadata(&file).map_err(|e| format!("读取图片属性失败：{e}"))?;
    if meta.len() > 48_000_000 {
        return Err("交接图片超过 48MB，请压缩后再送".to_string());
    }
    let bytes = fs::read(&file).map_err(|e| format!("读取交接图片失败：{e}"))?;
    let size = bytes.len() as u64;
    let name = file
        .file_name()
        .map(|v| v.to_string_lossy().into_owned())
        .unwrap_or_else(|| "交接图片.png".to_string());
    Ok(HandoffImage {
        name,
        mime: mime.to_string(),
        base64: STANDARD.encode(bytes),
        bytes: size,
    })
}

#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct LaunchInfo {
    mode: String,
    project_id: Option<String>,
    /** Strata 送来的图片路径，带 --import-image 时非空。 */
    files: Vec<String>,
}

/// 纯解析：把命令行参数变成启动意图，便于单测钉死优先级与多图参数。
fn parse_launch_args(args: &[String]) -> LaunchInfo {
    let mut project_id = None;
    let mut wants_new = false;
    let mut files: Vec<String> = Vec::new();
    let mut i = 0;
    while i < args.len() {
        if args[i] == "--new" || args[i] == "-n" {
            wants_new = true;
        } else if args[i] == "--open" {
            project_id = args.get(i + 1).cloned();
            i += 1;
        } else if args[i] == "--import-image" || args[i] == "--import" {
            // 支持重复参数送多张；空路径直接忽略，不让坏参数把启动流程带歪。
            if let Some(path) = args.get(i + 1) {
                if !path.trim().is_empty() {
                    files.push(path.trim().trim_matches('"').to_string());
                }
                i += 1;
            }
        }
        i += 1;
    }
    let mode = if !files.is_empty() {
        "importImage"
    } else if wants_new {
        "new"
    } else if project_id.is_some() {
        "open"
    } else {
        "welcome"
    };
    LaunchInfo {
        mode: mode.to_string(),
        project_id,
        files,
    }
}

#[tauri::command]
fn launch_mode() -> LaunchInfo {
    let args: Vec<String> = std::env::args().skip(1).collect();
    parse_launch_args(&args)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn a(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn import_image_wins_over_open_and_new() {
        let info = parse_launch_args(&a(&[
            "--new",
            "--open",
            "some-project",
            "--import-image",
            "C:\\tmp\\strata.png",
        ]));
        assert_eq!(info.mode, "importImage");
        assert_eq!(info.files, vec!["C:\\tmp\\strata.png"]);
    }

    #[test]
    fn repeated_import_flags_keep_order() {
        let info = parse_launch_args(&a(&[
            "--import",
            "a.png",
            "--import-image",
            "b.webp",
        ]));
        assert_eq!(info.files, vec!["a.png", "b.webp"]);
    }

    #[test]
    fn legacy_modes_still_work() {
        assert_eq!(parse_launch_args(&a(&["--new"])).mode, "new");
        let open = parse_launch_args(&a(&["--open", "abc"]));
        assert_eq!(open.mode, "open");
        assert_eq!(open.project_id.as_deref(), Some("abc"));
        assert_eq!(parse_launch_args(&[]).mode, "welcome");
        assert!(parse_launch_args(&[]).files.is_empty());
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
            groma_hide_recent_project,
            groma_restore_recent_project,
            groma_rename_project,
            groma_export_png,
            groma_export_file,
            groma_write_asset,
            groma_read_asset,
            groma_open_in_app,
            groma_read_handoff_image,
            groma_list_snapshots,
            groma_create_snapshot,
            groma_load_snapshot,
            groma_restore_snapshot
        ])
        .run(tauri::generate_context!())
        .expect("Groma 启动失败");
}
