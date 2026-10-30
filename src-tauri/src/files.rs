// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
//! File I/O for exports and the automatic backups.
//!
//! Export paths come from the native Save dialog the user just answered. Automatic backups live in
//! Documents/Analog Backups, one file per day, written atomically (temp file + rename) so a crash or power cut
//! mid-write never leaves a truncated backup; dated files beyond `keep` are pruned. Only Analog's own backup
//! file names are ever written, listed or read there.

use std::fs;
use std::path::{Path, PathBuf};

use base64::Engine as _;
use serde::Serialize;
use tauri::{AppHandle, Manager};

const PREFIX: &str = "analog-backup-";
const FOLDER: &str = "Analog Backups";

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes).map_err(err)?;
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        err(e)
    })
}

fn is_backup_name(name: &str) -> bool {
    name.starts_with(PREFIX) && name.ends_with(".json") && !name.contains(['/', '\\']) && !name.contains("..")
}

fn dir(app: &AppHandle) -> Result<PathBuf, String> {
    let docs = app.path().document_dir().or_else(|_| app.path().home_dir()).map_err(err)?;
    Ok(docs.join(FOLDER))
}

/// Our backups in the folder, newest first (the dated names sort by day).
fn ours(dir: &Path) -> Vec<PathBuf> {
    let mut found: Vec<PathBuf> = match fs::read_dir(dir) {
        Ok(entries) => entries
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| p.file_name().and_then(|n| n.to_str()).map(is_backup_name).unwrap_or(false))
            .collect(),
        Err(_) => Vec::new(),
    };
    found.sort();
    found.reverse();
    found
}

#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    write_atomic(Path::new(&path), contents.as_bytes())
}

#[tauri::command]
pub fn write_base64_file(path: String, base64: String) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD.decode(base64).map_err(err)?;
    write_atomic(Path::new(&path), &bytes)
}

#[tauri::command]
pub fn backup_dir(app: AppHandle) -> Result<String, String> {
    Ok(dir(&app)?.to_string_lossy().into_owned())
}

#[derive(Serialize)]
pub struct BackupWriteResult {
    path: String,
    pruned: usize,
}

#[tauri::command]
pub fn backup_write(app: AppHandle, file_name: String, contents: String, keep: usize) -> Result<BackupWriteResult, String> {
    if !is_backup_name(&file_name) {
        return Err("invalid backup file name".into());
    }
    let dir = dir(&app)?;
    fs::create_dir_all(&dir).map_err(err)?;
    let target = dir.join(&file_name);
    write_atomic(&target, contents.as_bytes())?;
    let mut pruned = 0;
    for old in ours(&dir).iter().skip(keep.max(1)) {
        if fs::remove_file(old).is_ok() {
            pruned += 1;
        }
    }
    Ok(BackupWriteResult { path: target.to_string_lossy().into_owned(), pruned })
}

/// File names of the automatic backups, newest first.
#[tauri::command]
pub fn backup_list(app: AppHandle) -> Result<Vec<String>, String> {
    Ok(ours(&dir(&app)?).iter().filter_map(|p| p.file_name().and_then(|n| n.to_str()).map(str::to_owned)).collect())
}

#[tauri::command]
pub fn backup_read(app: AppHandle, file_name: String) -> Result<String, String> {
    if !is_backup_name(&file_name) {
        return Err("invalid backup file name".into());
    }
    fs::read_to_string(dir(&app)?.join(file_name)).map_err(err)
}

// ---- Device sync through a folder ----
//
// The person's own cloud app (Dropbox, OneDrive, Google Drive, iCloud, Syncthing) carries the folder between
// devices; Analog only reads and writes `analog-sync-<device>.json` files in it. Each device writes only its own
// file and never anyone else's, so two devices cannot overwrite each other. Nothing else in the folder is touched.

const SYNC_PREFIX: &str = "analog-sync-";
const SYNC_FOLDER: &str = "Analog Sync";
/// A sync file bigger than this is refused rather than read into memory.
const SYNC_MAX_BYTES: u64 = 200 * 1024 * 1024;

fn is_sync_name(name: &str) -> bool {
    name.strip_prefix(SYNC_PREFIX)
        .and_then(|rest| rest.strip_suffix(".json"))
        .map(|id| !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'))
        .unwrap_or(false)
}

#[derive(Serialize)]
pub struct CloudFolder {
    label: String,
    path: String,
}

#[derive(Serialize)]
pub struct SyncFile {
    name: String,
    text: String,
}

/// Make (or reuse) the `Analog Sync` folder inside the one the person picked.
#[tauri::command]
pub fn sync_make_folder(parent: String) -> Result<String, String> {
    let parent = PathBuf::from(parent);
    let dir = if parent.file_name().and_then(|n| n.to_str()) == Some(SYNC_FOLDER) { parent } else { parent.join(SYNC_FOLDER) };
    fs::create_dir_all(&dir).map_err(err)?;
    Ok(dir.to_string_lossy().into_owned())
}

/// Cloud-storage folders that exist on this computer, found by their usual places.
#[tauri::command]
pub fn sync_cloud_folders(app: AppHandle) -> Vec<CloudFolder> {
    let mut found: Vec<CloudFolder> = Vec::new();
    let mut add = |label: &str, path: PathBuf| {
        if path.is_dir() && !found.iter().any(|f| f.path == path.to_string_lossy()) {
            found.push(CloudFolder { label: label.to_string(), path: path.to_string_lossy().into_owned() });
        }
    };
    for var in ["OneDrive", "OneDriveConsumer", "OneDriveCommercial"] {
        if let Some(p) = std::env::var_os(var) {
            add("OneDrive", PathBuf::from(p));
        }
    }
    if let Ok(home) = app.path().home_dir() {
        add("Dropbox", home.join("Dropbox"));
        add("Google Drive", home.join("Google Drive"));
        add("Google Drive", home.join("Google Drive").join("My Drive"));
        add("iCloud Drive", home.join("iCloudDrive"));
        add("OneDrive", home.join("OneDrive"));
    }
    found
}

/// The other devices' sync files in the folder. `skip_name` (this device's own file) is never read.
#[tauri::command]
pub fn sync_read_files(dir: String, skip_name: String) -> Result<Vec<SyncFile>, String> {
    let mut out = Vec::new();
    for entry in fs::read_dir(&dir).map_err(err)?.filter_map(|e| e.ok()) {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !is_sync_name(&name) || name == skip_name {
            continue;
        }
        let meta = match entry.metadata() {
            Ok(m) if m.is_file() && m.len() <= SYNC_MAX_BYTES => m,
            _ => continue,
        };
        let _ = meta;
        // A file the cloud app is still writing may not read cleanly yet; the sync counts it as "still arriving".
        if let Ok(text) = fs::read_to_string(entry.path()) {
            out.push(SyncFile { name, text });
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

#[tauri::command]
pub fn sync_write_file(dir: String, file_name: String, contents: String) -> Result<(), String> {
    if !is_sync_name(&file_name) {
        return Err("invalid sync file name".into());
    }
    let dir = PathBuf::from(dir);
    fs::create_dir_all(&dir).map_err(err)?;
    write_atomic(&dir.join(file_name), contents.as_bytes())
}

#[tauri::command]
pub fn sync_reveal_folder(app: AppHandle, dir: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_path(dir, None::<&str>).map_err(err)
}
