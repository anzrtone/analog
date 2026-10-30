// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
//! Analog desktop shell (Tauri 2, Windows).
//!
//! The app, its engine and its IndexedDB storage live in the WebView and are shared with Android. The shell adds
//! the native Save dialog, atomic file writes for exports and the automatic backups (files.rs), desktop
//! notifications for the end of rest, and a single running instance.

mod files;

use tauri::{AppHandle, Manager};

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        // Must be first: a second launch just focuses the running app (two windows would race on IndexedDB).
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)));
    }

    builder
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            files::write_text_file,
            files::write_base64_file,
            files::backup_dir,
            files::backup_write,
            files::backup_list,
            files::backup_read,
            files::sync_make_folder,
            files::sync_cloud_folders,
            files::sync_read_files,
            files::sync_write_file,
            files::sync_reveal_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Analog");
}
