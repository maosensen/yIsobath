//! The macOS app menu, in the UI language.
//!
//! Tauri's default menu is English whatever the interface speaks. The words
//! live in the frontend's catalogs (`T.menu` in `src/lib/i18n/`), which send
//! them through `set_app_menu`; this lays the menu out the way Tauri's
//! default does, keeping the ids that make macOS treat the Window and Help
//! submenus as its own (the window list, the Help search field).
//!
//! Windows and Linux windows have no app menu, so there this does nothing.

use serde::Deserialize;

/// Every label of the app menu, in the UI language.
#[derive(Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub struct MenuWords {
    pub about: String,
    pub services: String,
    pub hide: String,
    pub hide_others: String,
    pub quit: String,
    pub file: String,
    pub close_window: String,
    pub edit: String,
    pub undo: String,
    pub redo: String,
    pub cut: String,
    pub copy: String,
    pub paste: String,
    pub select_all: String,
    pub view: String,
    pub fullscreen: String,
    pub window: String,
    pub minimize: String,
    pub zoom: String,
    pub help: String,
}

/// Tauri's default macOS menu (`Menu::default`), with `words` for its labels.
#[cfg(target_os = "macos")]
pub fn build<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    w: &MenuWords,
) -> tauri::Result<tauri::menu::Menu<R>> {
    use tauri::menu::{
        AboutMetadata, HELP_SUBMENU_ID, Menu, PredefinedMenuItem as Item, Submenu,
        WINDOW_SUBMENU_ID,
    };

    let pkg = app.package_info();
    let config = app.config();
    let about = AboutMetadata {
        name: Some(pkg.name.clone()),
        version: Some(pkg.version.to_string()),
        copyright: config.bundle.copyright.clone(),
        authors: config.bundle.publisher.clone().map(|p| vec![p]),
        ..Default::default()
    };
    let app_menu = Submenu::with_items(
        app,
        pkg.name.clone(),
        true,
        &[
            &Item::about(app, Some(&w.about), Some(about))?,
            &Item::separator(app)?,
            &Item::services(app, Some(&w.services))?,
            &Item::separator(app)?,
            &Item::hide(app, Some(&w.hide))?,
            &Item::hide_others(app, Some(&w.hide_others))?,
            &Item::separator(app)?,
            &Item::quit(app, Some(&w.quit))?,
        ],
    )?;
    let file = Submenu::with_items(
        app,
        &w.file,
        true,
        &[&Item::close_window(app, Some(&w.close_window))?],
    )?;
    let edit = Submenu::with_items(
        app,
        &w.edit,
        true,
        &[
            &Item::undo(app, Some(&w.undo))?,
            &Item::redo(app, Some(&w.redo))?,
            &Item::separator(app)?,
            &Item::cut(app, Some(&w.cut))?,
            &Item::copy(app, Some(&w.copy))?,
            &Item::paste(app, Some(&w.paste))?,
            &Item::select_all(app, Some(&w.select_all))?,
        ],
    )?;
    let view = Submenu::with_items(
        app,
        &w.view,
        true,
        &[&Item::fullscreen(app, Some(&w.fullscreen))?],
    )?;
    let window = Submenu::with_id_and_items(
        app,
        WINDOW_SUBMENU_ID,
        &w.window,
        true,
        &[
            &Item::minimize(app, Some(&w.minimize))?,
            &Item::maximize(app, Some(&w.zoom))?,
            &Item::separator(app)?,
            &Item::close_window(app, Some(&w.close_window))?,
        ],
    )?;
    let help = Submenu::with_id_and_items(app, HELP_SUBMENU_ID, &w.help, true, &[])?;
    Menu::with_items(app, &[&app_menu, &file, &edit, &view, &window, &help])
}
