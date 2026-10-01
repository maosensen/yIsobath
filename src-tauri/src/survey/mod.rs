//! The survey: walk a folder — or the whole data volume — and hand the
//! instrument a tree in the shape its `Volume` model reads.
//!
//! - [`walk`] lists everything in parallel and keeps the full tree in memory;
//! - [`emit`] folds it under a node budget into [`SurveyNode`]s;
//! - [`classify`] names file types and rule tags;
//! - [`system`] knows the data volume, its capacity, Full Disk Access, and
//!   which paths must never be moved to the Trash.
//!
//! The full tree stays in [`Survey`] after the walk so that moving an item to
//! the Trash can update the picture without walking the disk again, and a
//! folded folder can be expanded without walking it again.

pub mod classify;
pub mod emit;
pub mod system;
pub mod walk;

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use emit::{Emitter, Expanded, NODE_BUDGET, SurveyNode};
use walk::{Dir, Progress, STOP_CANCEL, WalkStats, Walker};

/// What to survey.
#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SurveyTarget {
    /// The whole data volume (on macOS `/System/Volumes/Data`).
    Volume,
    /// The user's home folder.
    Home,
    /// Any folder.
    Folder { path: String },
}

/// What the instrument shows about the surveyed place.
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SurveyMeta {
    /// "volume" for a whole disk, "folder" for anything else (home included).
    pub kind: String,
    /// The root's name: "Macintosh HD", or the folder's name.
    pub name: String,
    /// "Data", "Home folder" or "Folder".
    pub role: String,
    pub fs: String,
    pub device: String,
    /// Bytes the volume holds, and bytes still free.
    pub capacity: f64,
    pub free: f64,
    /// The absolute path that was walked.
    pub root: String,
    /// How the root reads at the start of a path: "~", "~/github", "/Volumes/X".
    pub display: String,
    /// Path from the root to the home folder, shown as "~" (volume surveys).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[specta(optional)]
    pub home: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SurveyStats {
    pub files: f64,
    pub dirs: f64,
    pub bytes: f64,
    /// Folders that could not be listed.
    pub denied: f64,
    /// Folders skipped because they are another device.
    pub mounts: f64,
    /// Extra hard links to a file counted once.
    pub hardlinks: f64,
    pub took_ms: f64,
    /// Stopped before the walk finished.
    pub partial: bool,
    /// Nodes handed to the instrument, and the fold threshold that got there.
    pub nodes: f64,
    pub threshold: f64,
    pub full_disk_access: bool,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SurveyResult {
    pub root: SurveyNode,
    pub meta: SurveyMeta,
    pub stats: SurveyStats,
}

/// Streamed while a walk runs.
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SurveyProgress {
    pub files: f64,
    pub dirs: f64,
    pub bytes: f64,
    pub current: String,
}

/// One finished survey, kept for updates.
pub struct Survey {
    pub tree: Dir,
    pub meta: SurveyMeta,
    pub root: PathBuf,
    pub walk: WalkStats,
    pub took: Duration,
    pub partial: bool,
    pub threshold: u64,
    /// Folded folders the user went into.
    pub expanded: Expanded,
}

#[derive(Debug, thiserror::Error)]
pub enum SurveyError {
    #[error("cancelled")]
    Cancelled,
    #[error("{0}")]
    Io(#[from] std::io::Error),
}

/// Resolve a target into (path to walk, meta without totals).
pub fn resolve(target: &SurveyTarget) -> std::io::Result<(PathBuf, SurveyMeta)> {
    let home = system::home_dir();
    let mut path = match target {
        SurveyTarget::Volume => system::volume_root(),
        SurveyTarget::Home => home
            .clone()
            .ok_or_else(|| std::io::Error::other("no home folder"))?,
        SurveyTarget::Folder { path } => PathBuf::from(path),
    };
    if !path.is_absolute() {
        return Err(std::io::Error::other("not an absolute path"));
    }
    // "/" on macOS means the data volume (see `system::MAC_DATA_VOLUME`).
    let volume_root = system::volume_root();
    if path == Path::new("/") {
        path = volume_root.clone();
    }
    let info = system::volume_info(&path).unwrap_or_default();
    let is_volume = path == volume_root;
    let is_home = home.as_deref() == Some(path.as_path());
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned());

    let (kind, name, role, display, home_parts) = if is_volume {
        let home_parts = home.as_ref().and_then(|h| {
            system::firmlinked(h)
                .strip_prefix(system::firmlinked(&path))
                .ok()
                .map(|rel| {
                    rel.components()
                        .map(|c| c.as_os_str().to_string_lossy().into_owned())
                        .collect::<Vec<_>>()
                })
        });
        let name = system::boot_volume_name();
        ("volume", name.clone(), "Data".to_string(), name, home_parts)
    } else if is_home {
        (
            "folder",
            file_name,
            "Home folder".to_string(),
            "~".to_string(),
            Some(Vec::new()),
        )
    } else {
        let display = match home.as_ref().and_then(|h| path.strip_prefix(h).ok()) {
            Some(rel) => format!("~/{}", rel.to_string_lossy()),
            None => path.to_string_lossy().into_owned(),
        };
        ("folder", file_name, "Folder".to_string(), display, None)
    };
    Ok((
        path.clone(),
        SurveyMeta {
            kind: kind.into(),
            name,
            role,
            fs: info.fs,
            device: info.device,
            capacity: info.capacity as f64,
            free: info.free as f64,
            root: path.to_string_lossy().into_owned(),
            display,
            home: home_parts,
        },
    ))
}

/// Walk `root`, reporting progress through `report` every 120 ms. Returns the
/// finished survey, or `Cancelled` when `stop` was set to cancel.
pub fn run(
    root: &Path,
    meta: SurveyMeta,
    stop: &AtomicU8,
    report: impl Fn(SurveyProgress) + Send,
) -> Result<Survey, SurveyError> {
    let started = Instant::now();
    let progress = Progress::default();
    let walker = Walker::new(root, stop, &progress)?;
    let threads = std::thread::available_parallelism()
        .map(|n| n.get() * 2)
        .unwrap_or(8)
        .clamp(8, 32);
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(threads)
        .thread_name(|i| format!("survey-{i}"))
        .build()
        .map_err(|e| std::io::Error::other(e.to_string()))?;
    let done = AtomicBool::new(false);
    let name = meta.name.clone();
    let (progress, done) = (&progress, &done);
    let tree = std::thread::scope(|s| {
        s.spawn(move || {
            let snapshot = || SurveyProgress {
                files: progress.files.load(Ordering::Relaxed) as f64,
                dirs: progress.dirs.load(Ordering::Relaxed) as f64,
                bytes: progress.bytes.load(Ordering::Relaxed) as f64,
                current: progress
                    .current
                    .lock()
                    .map(|c| c.clone())
                    .unwrap_or_default(),
            };
            while !done.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_millis(120));
                report(snapshot());
            }
        });
        let tree = pool.install(|| walker.walk(root, name));
        done.store(true, Ordering::Relaxed);
        tree
    });
    let mode = stop.load(Ordering::Relaxed);
    if mode == STOP_CANCEL {
        return Err(SurveyError::Cancelled);
    }
    let threshold = emit::threshold(&tree, NODE_BUDGET);
    Ok(Survey {
        tree,
        meta,
        root: root.to_path_buf(),
        walk: walker.stats(),
        took: started.elapsed(),
        partial: mode != 0,
        threshold,
        expanded: Expanded::default(),
    })
}

impl Survey {
    /// The folded tree, meta and stats, ready to send.
    pub fn result(&self) -> SurveyResult {
        let dups = emit::duplicate_keys(&self.tree);
        let root = Emitter {
            threshold: self.threshold,
            dups: &dups,
            expanded: Some(&self.expanded),
        }
        .open(&self.tree);
        SurveyResult {
            root,
            meta: self.meta.clone(),
            stats: SurveyStats {
                files: self.tree.file_count as f64,
                dirs: self.tree.dir_count as f64,
                bytes: self.tree.bytes as f64,
                denied: self.walk.denied as f64,
                mounts: self.walk.mounts as f64,
                hardlinks: self.walk.hardlinks as f64,
                took_ms: self.took.as_secs_f64() * 1000.0,
                partial: self.partial,
                nodes: emit::count(&self.tree, self.threshold, Some(&self.expanded)) as f64,
                threshold: self.threshold as f64,
                full_disk_access: system::full_disk_access(),
            },
        }
    }

    /// The names from the root down to `path`, if it is inside this survey.
    fn segments(&self, path: &Path) -> Option<Vec<String>> {
        let rel = path.strip_prefix(&self.root).ok()?;
        let parts: Vec<String> = rel
            .components()
            .map(|c| c.as_os_str().to_string_lossy().into_owned())
            .collect();
        (!parts.is_empty()).then_some(parts)
    }

    /// Expand the folder at `path`: from now on it opens at a threshold of its
    /// own, as if it had been surveyed alone (`emit::expand_threshold`).
    /// False when `path` is not a folder of this survey.
    pub fn expand(&mut self, path: &Path) -> bool {
        let Some(parts) = self.segments(path) else {
            return false;
        };
        let Some(dir) = dir_at(&self.tree, &parts) else {
            return false;
        };
        let t = emit::expand_threshold(dir);
        self.expanded.insert(&parts, t);
        true
    }

    /// Take the item at `path` out of the tree (after it went to the Trash) and,
    /// when the user's Trash is inside this survey, put it there — the space is
    /// only given back when the Trash is emptied.
    pub fn moved_to_trash(&mut self, path: &Path) -> bool {
        let Some(parts) = self.segments(path) else {
            return false;
        };
        let Some(item) = take(&mut self.tree, &parts) else {
            return false;
        };
        self.expanded.remove(&parts);
        let trash = system::home_dir().map(|h| h.join(".Trash"));
        let inside = trash.as_ref().and_then(|t| {
            system::firmlinked(t)
                .strip_prefix(system::firmlinked(&self.root))
                .ok()
                .map(|rel| {
                    rel.components()
                        .map(|c| c.as_os_str().to_string_lossy().into_owned())
                        .collect::<Vec<_>>()
                })
        });
        if let Some(rel) = inside {
            let bin = folder_at(&mut self.tree, &rel);
            if bin.tag.is_none() {
                bin.tag = Some(classify::Tag::Trash);
            }
            match item {
                Taken::Dir(d) => bin.dirs.push(d),
                Taken::File(f) => bin.files.push(f),
            }
        }
        self.tree.total();
        true
    }
}

enum Taken {
    Dir(Dir),
    File(walk::File),
}

fn take(root: &mut Dir, parts: &[String]) -> Option<Taken> {
    let (last, path) = parts.split_last()?;
    let mut d = root;
    for name in path {
        d = d.dirs.iter_mut().find(|c| &c.name == name)?;
    }
    if let Some(i) = d.dirs.iter().position(|c| &c.name == last) {
        return Some(Taken::Dir(d.dirs.swap_remove(i)));
    }
    let i = d.files.iter().position(|f| &f.name == last)?;
    Some(Taken::File(d.files.swap_remove(i)))
}

/// The folder at `parts`, if the walk listed one there.
fn dir_at<'a>(root: &'a Dir, parts: &[String]) -> Option<&'a Dir> {
    let mut d = root;
    for name in parts {
        d = d.dirs.iter().find(|c| &c.name == name)?;
    }
    Some(d)
}

/// The folder at `parts`, created (empty) where the walk did not list it.
fn folder_at<'a>(root: &'a mut Dir, parts: &[String]) -> &'a mut Dir {
    let mut d = root;
    for name in parts {
        let i = match d.dirs.iter().position(|c| &c.name == name) {
            Some(i) => i,
            None => {
                d.dirs.push(Dir::named(name.clone()));
                d.dirs.len() - 1
            }
        };
        d = &mut d.dirs[i];
    }
    d
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn a_folder_survey_end_to_end() {
        let tmp = tempfile::tempdir().unwrap();
        let r = tmp.path();
        fs::create_dir_all(r.join("app/node_modules/x")).unwrap();
        fs::write(r.join("app/node_modules/x/a.js"), vec![1u8; 300_000]).unwrap();
        fs::write(r.join("app/big.bin"), vec![2u8; 2_000_000]).unwrap();
        let (path, meta) = resolve(&SurveyTarget::Folder {
            path: r.to_string_lossy().into_owned(),
        })
        .unwrap();
        assert_eq!(meta.kind, "folder");
        let stop = AtomicU8::new(0);
        let mut survey = run(&path, meta, &stop, |_| {}).unwrap();
        let out = survey.result();
        assert_eq!(out.stats.files, 2.0);
        assert!(!out.stats.partial);
        let app = &out.root.children.as_ref().unwrap()[0];
        assert_eq!(app.name, "app");

        // Moving big.bin to the Trash takes it out of this folder's survey.
        let before = survey.tree.bytes;
        assert!(survey.moved_to_trash(&path.join("app/big.bin")));
        assert!(survey.tree.bytes < before);
        assert!(!survey.moved_to_trash(&path.join("app/big.bin")));
    }

    #[test]
    fn expanding_a_folded_folder_shows_what_is_inside() {
        let tmp = tempfile::tempdir().unwrap();
        let r = tmp.path();
        // One big file sets a threshold that folds `small`.
        fs::write(r.join("big.bin"), vec![1u8; 120_000_000]).unwrap();
        fs::create_dir_all(r.join("small/inner")).unwrap();
        fs::write(r.join("small/a.bin"), vec![2u8; 3_000_000]).unwrap();
        fs::write(r.join("small/b.bin"), vec![3u8; 2_000_000]).unwrap();
        fs::write(r.join("small/inner/c.bin"), vec![4u8; 2_000_000]).unwrap();
        let (path, meta) = resolve(&SurveyTarget::Folder {
            path: r.to_string_lossy().into_owned(),
        })
        .unwrap();
        let stop = AtomicU8::new(0);
        let mut survey = run(&path, meta, &stop, |_| {}).unwrap();
        // Fold it the way a big volume would.
        survey.threshold = 64_000_000;
        let find = |n: &SurveyNode, name: &str| {
            n.children
                .as_ref()
                .and_then(|c| c.iter().find(|c| c.name == name).cloned())
        };
        let before = survey.result();
        let folded = find(&before.root, "small").unwrap();
        assert!(folded.folded && folded.expandable);

        assert!(survey.expand(&path.join("small")));
        let after = survey.result();
        let small = find(&after.root, "small").unwrap();
        assert!(!small.folded);
        assert!(find(&small, "a.bin").is_some());
        assert!(find(&small, "inner").unwrap().children.is_some());
        assert!(after.stats.nodes > before.stats.nodes);
        assert_eq!(after.stats.bytes, before.stats.bytes);

        // Still open after something inside it goes to the Trash; forgotten
        // when the folder itself goes.
        assert!(survey.moved_to_trash(&path.join("small/b.bin")));
        assert!(!find(&survey.result().root, "small").unwrap().folded);
        assert!(survey.moved_to_trash(&path.join("small")));
        assert!(survey.expanded.kids.is_empty());

        assert!(!survey.expand(&path.join("small")));
        assert!(!survey.expand(&path.join("big.bin")));
        assert!(!survey.expand(Path::new("/elsewhere")));
    }

    #[test]
    fn cancelling_returns_nothing() {
        let tmp = tempfile::tempdir().unwrap();
        let (path, meta) = resolve(&SurveyTarget::Folder {
            path: tmp.path().to_string_lossy().into_owned(),
        })
        .unwrap();
        let stop = AtomicU8::new(STOP_CANCEL);
        assert!(matches!(
            run(&path, meta, &stop, |_| {}),
            Err(SurveyError::Cancelled)
        ));
    }
}
