#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{fs, path::PathBuf, sync::Mutex};
use tauri::{menu::{Menu, MenuItem}, tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent}, Emitter, Manager, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_opener::OpenerExt;

const DEFAULT_SHORTCUT: &str = "Ctrl+Alt+Shift+Space";
#[derive(Clone, serde::Serialize)]
struct Settings { shortcut: String, error: Option<String> }
struct CaptureState { settings: Mutex<Settings>, website: Mutex<String>, shortcut_file: PathBuf }

fn show_capture(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("capture") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit("capture-focus", ());
    }
}
fn shortcut_value(value: &str) -> Result<Shortcut, String> {
    let key = value.strip_prefix("Ctrl+Alt+Shift+").ok_or("Use Ctrl+Alt+Shift plus Space or an uppercase letter (A–Z).")?;
    if key != "Space" && !(key.len() == 1 && key.as_bytes()[0].is_ascii_uppercase()) {
        return Err("Use Ctrl+Alt+Shift plus Space or an uppercase letter (A–Z).".into());
    }
    value.parse().map_err(|_| "Invalid shortcut.".into())
}
fn safe_website(value: &str) -> Result<String, String> {
    let mut url = url::Url::parse(value).map_err(|_| "Invalid website URL.")?;
    if !url.username().is_empty() || url.password().is_some() || !(url.scheme() == "https" || (url.scheme() == "http" && matches!(url.host_str(), Some("localhost" | "127.0.0.1")))) {
        return Err("Website must use HTTPS, or HTTP on localhost.".into());
    }
    url.set_path("/board"); url.set_query(None); url.set_fragment(None);
    Ok(url.to_string())
}
#[tauri::command]
fn hide_capture(app: tauri::AppHandle) -> Result<(), String> {
    app.get_webview_window("capture").ok_or("Capture window is unavailable.")?.hide().map_err(|_| "Could not hide capture.".into())
}
#[tauri::command]
fn get_settings(state: State<'_, CaptureState>, website_url: String) -> Result<Settings, String> {
    *state.website.lock().map_err(|_| "Settings unavailable.")? = safe_website(&website_url)?;
    let settings = state.settings.lock().map_err(|_| "Settings unavailable.")?.clone();
    Ok(settings)
}
#[tauri::command]
fn set_shortcut(app: tauri::AppHandle, state: State<'_, CaptureState>, shortcut: String) -> Result<Settings, String> {
    let value = shortcut_value(&shortcut)?;
    let mut settings = state.settings.lock().map_err(|_| "Settings unavailable.")?;
    if settings.shortcut == shortcut && settings.error.is_none() { return Ok(settings.clone()); }
    app.global_shortcut().register(value).map_err(|_| "This shortcut is already in use. Choose another letter.")?;
    let parent = state.shortcut_file.parent().ok_or("Settings folder unavailable.")?;
    if fs::create_dir_all(parent).and_then(|_| fs::write(&state.shortcut_file, &shortcut)).is_err() {
        let _ = app.global_shortcut().unregister(value);
        return Err("Could not save settings. Your previous shortcut is unchanged.".into());
    }
    if settings.shortcut != shortcut {
        if let Ok(old) = shortcut_value(&settings.shortcut) { let _ = app.global_shortcut().unregister(old); }
    }
    *settings = Settings { shortcut, error: None };
    Ok(settings.clone())
}
#[tauri::command]
fn open_website(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let url = safe_website(&url)?;
    app.opener().open_url(url, None::<&str>).map_err(|_| "Could not open your browser.".into())
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| show_capture(app)))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app, _, event| {
            if event.state() == ShortcutState::Pressed { show_capture(app); }
        }).build())
        .invoke_handler(tauri::generate_handler![hide_capture, get_settings, set_shortcut, open_website])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event { api.prevent_close(); let _ = window.hide(); }
        })
        .setup(|app| {
            let shortcut_file = app.path().app_config_dir()?.join("shortcut.txt");
            let saved = fs::read_to_string(&shortcut_file).unwrap_or_else(|_| DEFAULT_SHORTCUT.into());
            let shortcut = if shortcut_value(saved.trim()).is_ok() { saved.trim().to_owned() } else { DEFAULT_SHORTCUT.into() };
            let error = app.global_shortcut().register(shortcut_value(&shortcut)?).err().map(|_| "Global shortcut unavailable.".to_owned());
            app.manage(CaptureState { settings: Mutex::new(Settings { shortcut, error }), website: Mutex::new("http://localhost:3000/board".into()), shortcut_file });
            let new_card = MenuItem::with_id(app, "new", "New card", true, None::<&str>)?;
            let website = MenuItem::with_id(app, "website", "Open website", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&new_card, &website, &quit])?;
            let icon = app.default_window_icon().ok_or("Application icon missing.")?.clone();
            TrayIconBuilder::with_id("capture-tray").icon(icon).tooltip("JobApply Capture")
                .menu(&menu).show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "new" => show_capture(app),
                    "website" => {
                        let state = app.state::<CaptureState>();
                        if let Ok(url) = state.website.lock() {
                            if open_website(app.clone(), url.clone()).is_err() {
                                show_capture(app); let _ = app.emit("capture-error", "Could not open the website. Check Settings.");
                            }
                        };
                    },
                    "quit" => app.exit(0), _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event { show_capture(tray.app_handle()); }
                }).build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Unable to start JobApply Capture");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shortcuts_are_deliberate_combinations() {
        assert!(shortcut_value(DEFAULT_SHORTCUT).is_ok());
        assert!(shortcut_value("Ctrl+Alt+Shift+J").is_ok());
        for invalid in ["Alt+F4", "Ctrl+C", "Win+L", "Ctrl+Alt+Shift+", "Ctrl+Alt+Shift+F4"] { assert!(shortcut_value(invalid).is_err()); }
    }
    #[test]
    fn website_opener_cannot_launch_arbitrary_protocols() {
        assert_eq!(safe_website("https://example.com/path?token=abc").unwrap(), "https://example.com/board");
        assert!(safe_website("http://localhost:3000").is_ok());
        for invalid in ["file:///C:/secret", "javascript:alert(1)", "http://example.com", "https://user:secret@example.com"] { assert!(safe_website(invalid).is_err()); }
    }
}
