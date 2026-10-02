//! Application-wide error type that crosses the IPC boundary.
//!
//! Serialized as `{ "code": <variant>, "detail": <payload> }` (see the
//! `serde(tag/content)` attributes) so the frontend can branch on a stable
//! `code` for UI/retry decisions while `detail` carries a human-readable
//! message for display and logging. Keep the mirror in `src/lib/errors.ts`
//! aligned with these variants.

use serde::Serialize;

// `Db`/`Internal` are part of the IPC error contract (mirrored in errors.ts)
// but not yet constructed by any command — keep them as the stable surface.
#[allow(dead_code)]
#[derive(Debug, thiserror::Error, Serialize, specta::Type)]
#[serde(tag = "code", content = "detail")]
pub enum AppError {
    /// The detail is the path (or the OS message) of what is missing.
    #[error("not found: {0}")]
    NotFound(String),
    #[error("io error: {0}")]
    Io(String),
    #[error("database error: {0}")]
    Db(String),
    /// The user stopped the survey and asked for nothing to be shown.
    #[error("cancelled")]
    Cancelled,
    /// Another survey is still walking.
    #[error("busy")]
    Busy,
    /// The app declined to do it; the detail says why, as a code the
    /// frontend words in the UI language.
    #[error("refused: {0}")]
    Refused(Refusal),
    /// User-visible catch-all. Internal details belong in the logs, not here.
    #[error("internal error")]
    Internal,
}

/// Why the app declined to act on a path. Crosses IPC as a stable kebab-case
/// code (`"in-trash"`); `src/lib/survey.ts` turns it into a sentence in the UI
/// language, so adding a variant is a compile error there until it is worded.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "kebab-case")]
pub enum Refusal {
    /// Nothing has been surveyed yet.
    NoSurvey,
    /// Not an absolute path, or one that climbs out with `..`.
    NotAbsolute,
    /// Outside the surveyed folder, or the surveyed folder itself.
    OutsideSurvey,
    /// A folder the system or the account depends on.
    Protected,
    /// Part of the sealed system.
    System,
    /// Already in the Trash.
    InTrash,
}

/// English, for the log.
impl std::fmt::Display for Refusal {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Refusal::NoSurvey => "nothing has been surveyed yet",
            Refusal::NotAbsolute => "not an absolute path",
            Refusal::OutsideSurvey => "outside the surveyed folder",
            Refusal::Protected => "a folder the system or your account depends on",
            Refusal::System => "part of the system",
            Refusal::InTrash => "already in the Trash",
        })
    }
}

/// Convenience alias for command return types.
pub type AppResult<T> = Result<T, AppError>;

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        match err.kind() {
            std::io::ErrorKind::NotFound => AppError::NotFound(err.to_string()),
            _ => AppError::Io(err.to_string()),
        }
    }
}
