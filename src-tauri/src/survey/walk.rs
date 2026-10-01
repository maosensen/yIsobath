//! The walk: list every folder under a root, in parallel, and keep what the
//! instrument needs — names, on-disk sizes, modification ages, file types and
//! rule tags. File contents are never opened.
//!
//! - **Sizes are on disk** (allocated blocks), not logical lengths: a sparse
//!   `Docker.raw` counts what it occupies, a file evicted to iCloud counts
//!   nothing. A file with several hard links is counted once.
//! - **One volume only**: folders on another device (mount points, autofs
//!   triggers) are skipped and counted, so a survey of the data volume never
//!   wanders onto an external disk.
//! - **Unreadable folders** (permissions, privacy protection) are kept as empty
//!   folders and counted, so the gap is visible instead of silent.
//! - Files of 1 MB and more get a node of their own; smaller ones are gathered
//!   per folder into one "loose" piece with a count, a byte total, the bytes per
//!   type and a byte-weighted age.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicU8, AtomicU64, Ordering};
use std::time::SystemTime;

use rayon::prelude::*;

use super::classify::{self, BIG, FileKind, Place, Siblings, Tag};

/// Stop the walk where it is and keep what has been listed.
pub const STOP_SHOW: u8 = 1;
/// Stop and throw the result away.
pub const STOP_CANCEL: u8 = 2;

/// A folder in the survey's own (unpruned) tree.
#[derive(Debug, Default)]
pub struct Dir {
    pub name: String,
    pub tag: Option<Tag>,
    pub dirs: Vec<Dir>,
    /// Files of `BIG` bytes and more.
    pub files: Vec<File>,
    pub loose: Loose,
    /// The folder could not be listed.
    pub denied: bool,
    // Subtree totals, filled in by `Dir::total`.
    pub bytes: u64,
    pub file_count: u64,
    pub dir_count: u64,
    /// Σ bytes × age (days) over the subtree, for byte-weighted ages.
    pub age_weight: f64,
    /// Bytes of the subtree that sit under a rule tag (all of it when this
    /// folder is tagged itself).
    pub tagged: u64,
}

#[derive(Debug, Clone)]
pub struct File {
    pub name: String,
    pub bytes: u64,
    /// Days since it was last modified.
    pub age: f32,
    pub kind: FileKind,
    pub tag: Option<Tag>,
}

/// The small files of one folder, gathered.
#[derive(Debug, Default, Clone)]
pub struct Loose {
    pub files: u64,
    pub bytes: u64,
    pub by_kind: [u64; 10],
    pub age_weight: f64,
}

impl Dir {
    pub fn named(name: String) -> Self {
        Dir {
            name,
            ..Default::default()
        }
    }

    /// Recompute the subtree totals bottom-up (after the walk, and after an
    /// item is removed).
    pub fn total(&mut self) {
        let mut bytes = self.loose.bytes;
        let mut files = self.loose.files;
        let mut dirs = 0u64;
        let mut weight = self.loose.age_weight;
        let mut tagged = 0u64;
        for f in &self.files {
            bytes += f.bytes;
            files += 1;
            weight += f.bytes as f64 * f.age as f64;
            if f.tag.is_some() {
                tagged += f.bytes;
            }
        }
        for d in &mut self.dirs {
            d.total();
            bytes += d.bytes;
            files += d.file_count;
            dirs += d.dir_count + 1;
            weight += d.age_weight;
            tagged += d.tagged;
        }
        self.bytes = bytes;
        self.file_count = files;
        self.dir_count = dirs;
        self.age_weight = weight;
        self.tagged = if self.tag.is_some() { bytes } else { tagged };
    }

    /// Byte-weighted age of the whole subtree, in days.
    pub fn mean_age(&self) -> f32 {
        if self.bytes == 0 {
            0.0
        } else {
            (self.age_weight / self.bytes as f64) as f32
        }
    }

    /// Bytes per file type over the subtree.
    pub fn kind_bytes(&self, out: &mut [u64; 10]) {
        for (k, b) in self.loose.by_kind.iter().enumerate() {
            out[k] += b;
        }
        for f in &self.files {
            out[f.kind.index()] += f.bytes;
        }
        for d in &self.dirs {
            d.kind_bytes(out);
        }
    }
}

/// Counters the progress reporter reads while the walk runs.
#[derive(Debug, Default)]
pub struct Progress {
    pub files: AtomicU64,
    pub dirs: AtomicU64,
    pub bytes: AtomicU64,
    pub current: Mutex<String>,
}

#[derive(Debug, Default, Clone, Copy)]
pub struct WalkStats {
    /// Folders that could not be listed.
    pub denied: u64,
    /// Folders skipped because they live on another device.
    pub mounts: u64,
    /// Extra links to a file already counted.
    pub hardlinks: u64,
}

pub struct Walker<'a> {
    root_dev: Option<u64>,
    now: SystemTime,
    stop: &'a AtomicU8,
    progress: &'a Progress,
    links: Mutex<HashSet<(u64, u64)>>,
    denied: AtomicU64,
    mounts: AtomicU64,
    hardlinks: AtomicU64,
    tick: AtomicU64,
}

/// Where a folder sits, carried down the walk (owned, unlike `Place`).
#[derive(Clone, Default)]
struct Ctx {
    parent: String,
    in_node_modules: bool,
    in_downloads: bool,
}

impl<'a> Walker<'a> {
    pub fn new(root: &Path, stop: &'a AtomicU8, progress: &'a Progress) -> std::io::Result<Self> {
        let md = fs::metadata(root)?;
        if !md.is_dir() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::NotADirectory,
                format!("not a folder: {}", root.display()),
            ));
        }
        Ok(Walker {
            root_dev: device_of(&md),
            now: SystemTime::now(),
            stop,
            progress,
            links: Mutex::new(HashSet::new()),
            denied: AtomicU64::new(0),
            mounts: AtomicU64::new(0),
            hardlinks: AtomicU64::new(0),
            tick: AtomicU64::new(0),
        })
    }

    pub fn stats(&self) -> WalkStats {
        WalkStats {
            denied: self.denied.load(Ordering::Relaxed),
            mounts: self.mounts.load(Ordering::Relaxed),
            hardlinks: self.hardlinks.load(Ordering::Relaxed),
        }
    }

    fn stopping(&self) -> bool {
        self.stop.load(Ordering::Relaxed) != 0
    }

    /// Walk the whole tree under `root`. The root's own name is `name`.
    pub fn walk(&self, root: &Path, name: String) -> Dir {
        let mut dir = self.walk_dir(root.to_path_buf(), name, &Ctx::default());
        dir.total();
        dir
    }

    fn age_of(&self, md: &fs::Metadata) -> f32 {
        md.modified()
            .ok()
            .and_then(|t| self.now.duration_since(t).ok())
            .map(|d| d.as_secs_f32() / 86_400.0)
            .unwrap_or(0.0)
    }

    fn walk_dir(&self, path: PathBuf, name: String, ctx: &Ctx) -> Dir {
        let mut dir = Dir::named(name);
        if self.stopping() {
            return dir;
        }
        self.progress.dirs.fetch_add(1, Ordering::Relaxed);
        if self.tick.fetch_add(1, Ordering::Relaxed).is_multiple_of(64)
            && let Ok(mut cur) = self.progress.current.try_lock()
        {
            *cur = path.to_string_lossy().into_owned();
        }
        let entries = match fs::read_dir(&path) {
            Ok(rd) => rd,
            Err(_) => {
                dir.denied = true;
                self.denied.fetch_add(1, Ordering::Relaxed);
                return dir;
            }
        };

        // Files directly in Downloads count as being in Downloads.
        let in_dl = ctx.in_downloads || matches!(dir.name.as_str(), "Downloads" | "Desktop");
        let mut subdirs: Vec<(PathBuf, String, f32)> = Vec::new();
        let mut siblings = Siblings::default();
        let mut seen = 0u32;
        for entry in entries {
            seen = seen.wrapping_add(1);
            if seen.is_multiple_of(512) && self.stopping() {
                break;
            }
            let Ok(entry) = entry else { continue };
            // `DirEntry::metadata` does not follow symlinks.
            let Ok(md) = entry.metadata() else { continue };
            let fname = entry.file_name().to_string_lossy().into_owned();
            if md.is_dir() {
                if let (Some(root), Some(dev)) = (self.root_dev, device_of(&md))
                    && root != dev
                {
                    self.mounts.fetch_add(1, Ordering::Relaxed);
                    continue;
                }
                if fname == "src" {
                    siblings.has_src = true;
                }
                let age = self.age_of(&md);
                subdirs.push((entry.path(), fname, age));
                continue;
            }
            if fname == "Cargo.toml" {
                siblings.has_cargo_toml = true;
            }
            let bytes = if self.first_link(&md) {
                on_disk(&md)
            } else {
                self.hardlinks.fetch_add(1, Ordering::Relaxed);
                0
            };
            self.progress.files.fetch_add(1, Ordering::Relaxed);
            self.progress.bytes.fetch_add(bytes, Ordering::Relaxed);
            let age = self.age_of(&md);
            let kind = classify::kind_of(&fname);
            if bytes >= BIG {
                let tag = classify::tag_file(&fname, in_dl);
                dir.files.push(File {
                    name: fname,
                    bytes,
                    age,
                    kind,
                    tag,
                });
            } else {
                let l = &mut dir.loose;
                l.files += 1;
                l.bytes += bytes;
                l.by_kind[kind.index()] += bytes;
                l.age_weight += bytes as f64 * age as f64;
            }
        }

        let here = dir.name.as_str();
        let in_nm = ctx.in_node_modules || here == "node_modules";
        let parent = ctx.parent.as_str();
        dir.dirs = subdirs
            .into_par_iter()
            .map(|(p, n, age)| {
                let place = Place {
                    parent: here,
                    grandparent: parent,
                    in_node_modules: in_nm,
                };
                let tag = classify::tag_dir(&n, place, siblings, age);
                let child = Ctx {
                    parent: here.to_string(),
                    in_node_modules: in_nm,
                    in_downloads: in_dl,
                };
                let mut d = self.walk_dir(p, n, &child);
                d.tag = tag;
                d
            })
            .collect();
        dir
    }

    /// True the first time a multiply-linked file is seen (always true for a
    /// file with a single link).
    #[cfg(unix)]
    fn first_link(&self, md: &fs::Metadata) -> bool {
        use std::os::unix::fs::MetadataExt;
        if md.nlink() <= 1 {
            return true;
        }
        let key = (md.dev(), md.ino());
        self.links.lock().map(|mut s| s.insert(key)).unwrap_or(true)
    }

    #[cfg(not(unix))]
    fn first_link(&self, _md: &fs::Metadata) -> bool {
        true
    }
}

#[cfg(unix)]
fn device_of(md: &fs::Metadata) -> Option<u64> {
    use std::os::unix::fs::MetadataExt;
    Some(md.dev())
}

#[cfg(not(unix))]
fn device_of(_md: &fs::Metadata) -> Option<u64> {
    None
}

/// Bytes the file occupies on disk.
#[cfg(unix)]
fn on_disk(md: &fs::Metadata) -> u64 {
    use std::os::unix::fs::MetadataExt;
    md.blocks() * 512
}

#[cfg(not(unix))]
fn on_disk(md: &fs::Metadata) -> u64 {
    md.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(path: &Path, bytes: usize) {
        if let Some(p) = path.parent() {
            fs::create_dir_all(p).unwrap();
        }
        // Non-zero content so the blocks are really allocated.
        fs::write(path, vec![7u8; bytes]).unwrap();
    }

    fn survey(root: &Path) -> (Dir, WalkStats) {
        let stop = AtomicU8::new(0);
        let progress = Progress::default();
        let w = Walker::new(root, &stop, &progress).unwrap();
        let d = w.walk(root, "root".into());
        (d, w.stats())
    }

    fn child<'a>(d: &'a Dir, name: &str) -> &'a Dir {
        d.dirs.iter().find(|c| c.name == name).unwrap()
    }

    #[test]
    fn totals_tags_and_loose_files() {
        let tmp = tempfile::tempdir().unwrap();
        let r = tmp.path();
        write(&r.join("app/package.json"), 300);
        write(&r.join("app/src/main.ts"), 4_000);
        write(&r.join("app/dist/bundle.js"), 2_000_000);
        write(&r.join("app/node_modules/x/index.js"), 9_000);
        write(&r.join("app/node_modules/x/node_modules/y/a.js"), 9_000);
        write(&r.join("crate/Cargo.toml"), 200);
        write(&r.join("crate/target/debug/app"), 1_500_000);
        write(&r.join("Downloads/Tool.dmg"), 1_200_000);
        write(&r.join("Movies/clip.mov"), 3_000_000);

        let (d, stats) = survey(r);
        assert_eq!(stats.denied, 0);
        assert_eq!(d.file_count, 9);
        // Everything is accounted for: the root total is the sum of its parts.
        let sum: u64 = d.dirs.iter().map(|c| c.bytes).sum::<u64>() + d.loose.bytes;
        assert_eq!(d.bytes, sum);

        let app = child(&d, "app");
        assert_eq!(child(app, "dist").tag, Some(Tag::Build));
        assert_eq!(child(app, "src").tag, None);
        let nm = child(app, "node_modules");
        assert_eq!(nm.tag, Some(Tag::NodeModules));
        // Nested node_modules are not tagged again.
        let x = child(nm, "x");
        assert_eq!(child(x, "node_modules").tag, None);
        assert_eq!(app.loose.files, 1);

        let krate = child(&d, "crate");
        assert_eq!(child(krate, "target").tag, Some(Tag::Build));

        let dl = child(&d, "Downloads");
        assert_eq!(dl.files.len(), 1);
        assert_eq!(dl.files[0].tag, Some(Tag::Installer));
        assert_eq!(child(&d, "Movies").files[0].kind, FileKind::Vid);
    }

    #[cfg(unix)]
    #[test]
    fn hard_links_count_once() {
        let tmp = tempfile::tempdir().unwrap();
        let r = tmp.path();
        write(&r.join("a/weights.bin"), 2_000_000);
        fs::create_dir_all(r.join("b")).unwrap();
        fs::hard_link(r.join("a/weights.bin"), r.join("b/weights.bin")).unwrap();
        let (d, stats) = survey(r);
        assert_eq!(stats.hardlinks, 1);
        assert_eq!(d.file_count, 2);
        let a = child(&d, "a").bytes;
        let b = child(&d, "b").bytes;
        assert!(a >= 2_000_000 && b == 0 || b >= 2_000_000 && a == 0);
    }

    #[test]
    fn a_stop_keeps_what_was_listed() {
        let tmp = tempfile::tempdir().unwrap();
        write(&tmp.path().join("a/b.txt"), 10);
        let stop = AtomicU8::new(STOP_SHOW);
        let progress = Progress::default();
        let w = Walker::new(tmp.path(), &stop, &progress).unwrap();
        let d = w.walk(tmp.path(), "root".into());
        assert_eq!(d.file_count, 0);
    }
}
