//! Long-lived application state.
//!
//! Registered once at startup with `app.manage(AppState::default())` and
//! injected into commands via `tauri::State<'_, AppState>`. The fields are
//! `Arc`s so a command can hand them to a blocking task that outlives the
//! borrow of the state.

use std::sync::atomic::{AtomicBool, AtomicU8};
use std::sync::{Arc, Mutex};

use crate::survey::Survey;

#[derive(Default)]
pub struct AppState {
    /// The last finished survey, kept so a move to the Trash can update the
    /// picture without walking the disk again.
    pub survey: Arc<Mutex<Option<Survey>>>,
    /// 0 while a walk runs; `STOP_SHOW` / `STOP_CANCEL` to end it early.
    pub stop: Arc<AtomicU8>,
    /// One walk at a time.
    pub walking: Arc<AtomicBool>,
}
