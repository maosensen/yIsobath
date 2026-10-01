//! Tauri commands — the typed IPC surface the frontend calls via `invoke`.
//!
//! Conventions:
//! - Fallible commands return [`AppResult<T>`](crate::error::AppResult) so the
//!   frontend receives a structured, code-tagged error.
//! - Long-lived resources are injected via `tauri::State`, never rebuilt here.
//! - Blocking work (walking a disk, folding it, moving to the Trash) runs on
//!   a blocking task; async commands keep it off the main thread.
//! - Register every command in `specta_builder()` in `lib.rs`.

use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri_plugin_opener::OpenerExt;

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::survey::walk::{STOP_CANCEL, STOP_SHOW};
use crate::survey::{self, SurveyError, SurveyProgress, SurveyResult, SurveyTarget, system};

/// What the start panel needs before anything is walked.
#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SurveyPlaces {
    /// The boot volume's name ("Macintosh HD").
    pub volume_name: String,
    /// The home folder, absolute.
    pub home: String,
    pub full_disk_access: bool,
    /// Capacity and free space of the data volume.
    pub capacity: f64,
    pub free: f64,
}

#[tauri::command]
#[specta::specta]
pub fn survey_places() -> SurveyPlaces {
    let info = system::volume_info(&system::volume_root()).unwrap_or_default();
    SurveyPlaces {
        volume_name: system::boot_volume_name(),
        home: system::home_dir()
            .map(|h| h.to_string_lossy().into_owned())
            .unwrap_or_default(),
        full_disk_access: system::full_disk_access(),
        capacity: info.capacity as f64,
        free: info.free as f64,
    }
}

/// Walk a volume or a folder. Progress streams through `on_progress`; the
/// folded tree comes back when the walk ends (or is stopped with "show").
#[tauri::command]
#[specta::specta]
pub async fn survey(
    target: SurveyTarget,
    on_progress: Channel<SurveyProgress>,
    state: tauri::State<'_, AppState>,
) -> AppResult<SurveyResult> {
    if state.walking.swap(true, Ordering::SeqCst) {
        return Err(AppError::Busy);
    }
    state.stop.store(0, Ordering::SeqCst);
    let stop = state.stop.clone();
    let slot = state.survey.clone();
    let walking = state.walking.clone();
    let outcome = tauri::async_runtime::spawn_blocking(move || {
        let (path, meta) = survey::resolve(&target)?;
        log::info!("survey: walking {}", path.display());
        let s = survey::run(&path, meta, &stop, |p| {
            let _ = on_progress.send(p);
        })?;
        let result = s.result();
        log::info!(
            "survey: {} files, {} folders, {} nodes (fold at {} B), {} denied, {:.1} s",
            result.stats.files,
            result.stats.dirs,
            result.stats.nodes,
            result.stats.threshold,
            result.stats.denied,
            result.stats.took_ms / 1000.0
        );
        if let Ok(mut slot) = slot.lock() {
            *slot = Some(s);
        }
        Ok::<_, SurveyError>(result)
    })
    .await;
    walking.store(false, Ordering::SeqCst);
    match outcome {
        Ok(Ok(result)) => Ok(result),
        Ok(Err(SurveyError::Cancelled)) => Err(AppError::Cancelled),
        Ok(Err(SurveyError::Io(e))) => Err(e.into()),
        Err(e) => {
            log::error!("survey task failed: {e}");
            Err(AppError::Internal)
        }
    }
}

/// End the running walk early: `cancel` throws the result away, otherwise
/// what has been listed so far is shown.
#[tauri::command]
#[specta::specta]
pub fn survey_stop(cancel: bool, state: tauri::State<'_, AppState>) {
    let mode = if cancel { STOP_CANCEL } else { STOP_SHOW };
    state.stop.store(mode, Ordering::SeqCst);
}

/// The surveyed root, if `path` lies inside it.
fn within_survey(state: &AppState, path: &Path) -> AppResult<PathBuf> {
    let slot = state.survey.lock().map_err(|_| AppError::Internal)?;
    let Some(s) = slot.as_ref() else {
        return Err(AppError::Refused("nothing has been surveyed yet".into()));
    };
    if !path.starts_with(&s.root) {
        return Err(AppError::Refused("outside the surveyed folder".into()));
    }
    Ok(s.root.clone())
}

/// Show an item of the current survey in Finder (Explorer, Files).
#[tauri::command]
#[specta::specta]
pub fn reveal(
    path: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> AppResult<()> {
    let path = PathBuf::from(path);
    within_survey(&state, &path)?;
    // Through the firmlink, so Finder shows /Users/… rather than the data volume.
    let shown = system::firmlinked(&path);
    let target = if shown.exists() { shown } else { path };
    app.opener().reveal_item_in_dir(&target).map_err(|e| {
        log::warn!("reveal failed: {e}");
        AppError::Io(e.to_string())
    })
}

/// Expand a folded folder of the current survey — show what is inside it,
/// from the tree the walk already holds — and return the survey as it now
/// stands.
#[tauri::command]
#[specta::specta]
pub async fn expand_folder(
    path: String,
    state: tauri::State<'_, AppState>,
) -> AppResult<SurveyResult> {
    let path = PathBuf::from(path);
    within_survey(&state, &path)?;
    let slot = state.survey.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut slot = slot.lock().map_err(|_| AppError::Internal)?;
        let Some(s) = slot.as_mut() else {
            return Err(AppError::Internal);
        };
        if !s.expand(&path) {
            return Err(AppError::NotFound(format!(
                "{} is not a folder of this survey",
                path.display()
            )));
        }
        Ok(s.result())
    })
    .await
    .map_err(|e| {
        log::error!("expand task failed: {e}");
        AppError::Internal
    })?
}

/// Move an item of the current survey to the Trash, then return the survey as
/// it now stands. Refuses the surveyed root, folders the system or the account
/// depends on, and anything already in the Trash.
#[tauri::command]
#[specta::specta]
pub async fn move_to_trash(
    path: String,
    state: tauri::State<'_, AppState>,
) -> AppResult<SurveyResult> {
    let path = PathBuf::from(path);
    let root = within_survey(&state, &path)?;
    let home = system::home_dir();
    if let Some(why) = system::trash_refusal(&path, &root, home.as_deref()) {
        return Err(AppError::Refused(why.into()));
    }
    let slot = state.survey.clone();
    tauri::async_runtime::spawn_blocking(move || {
        trash_item(&path)?;
        log::info!("moved to Trash: {}", path.display());
        let mut slot = slot.lock().map_err(|_| AppError::Internal)?;
        let Some(s) = slot.as_mut() else {
            return Err(AppError::Internal);
        };
        s.moved_to_trash(&path);
        Ok(s.result())
    })
    .await
    .map_err(|e| {
        log::error!("trash task failed: {e}");
        AppError::Internal
    })?
}

fn trash_item(path: &Path) -> AppResult<()> {
    if std::fs::symlink_metadata(path).is_err() {
        return Err(AppError::NotFound(format!(
            "{} is no longer there",
            path.display()
        )));
    }
    let ctx = trash_context();
    ctx.delete(path).map_err(|e| {
        log::warn!("trash failed for {}: {e}", path.display());
        AppError::Io(e.to_string())
    })
}

#[cfg(target_os = "macos")]
fn trash_context() -> trash::TrashContext {
    use trash::macos::{DeleteMethod, TrashContextExtMacos};
    let mut ctx = trash::TrashContext::default();
    // NSFileManager: no Automation prompt for Finder, works without Finder running.
    ctx.set_delete_method(DeleteMethod::NsFileManager);
    ctx
}

#[cfg(not(target_os = "macos"))]
fn trash_context() -> trash::TrashContext {
    trash::TrashContext::default()
}

/// Open the Full Disk Access pane of System Settings.
#[tauri::command]
#[specta::specta]
pub fn open_privacy_settings(app: tauri::AppHandle) -> AppResult<()> {
    let url = if cfg!(target_os = "macos") {
        "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
    } else {
        return Ok(());
    };
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| AppError::Io(e.to_string()))
}

/// Development switches, read from the environment in debug builds only.
#[derive(Debug, Default, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DevOptions {
    /// `YISOBATH_SURVEY`: "volume", "home" or an absolute folder to survey on launch.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[specta(optional)]
    pub survey: Option<String>,
    /// `YISOBATH_PERF=1`: log frame timings to the app log every few seconds.
    pub perf: bool,
}

#[tauri::command]
#[specta::specta]
pub fn dev_options() -> DevOptions {
    if !cfg!(debug_assertions) {
        return DevOptions::default();
    }
    DevOptions {
        survey: std::env::var("YISOBATH_SURVEY")
            .ok()
            .filter(|s| !s.is_empty()),
        perf: std::env::var("YISOBATH_PERF").is_ok_and(|v| v == "1"),
    }
}
