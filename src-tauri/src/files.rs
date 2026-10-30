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
