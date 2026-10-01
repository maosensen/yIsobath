//! What a survey leaves for the next survey of the same place, and what
//! changed in between.
//!
//! A snapshot is every folder's on-disk size and file count as a tree of
//! names — nothing else: no files, ages or tags. One per place, written to
//! the app's data folder (`snapshots/<hash of the root>.json`) when a survey
//! finishes, replacing the one before. A survey stopped early is not
//! written: what it did not list would read as space given back.
//!
//! The next survey of that place compares its tree with the snapshot and
//! names where it grew: folders that did, each as deep as the growth stays
//! in one place, none inside another.

use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use super::classify::BIG;
use super::walk::Dir;

/// Bumped when the file format changes; older files are ignored.
const VERSION: u32 = 1;

/// How many places a change names at most.
pub const PLACES: usize = 8;

#[derive(Debug, Serialize, Deserialize)]
pub struct Snapshot {
    pub version: u32,
    /// The absolute path that was walked.
    pub root: String,
    /// When the survey finished, in milliseconds since the Unix epoch.
    pub taken: u64,
    pub tree: Folder,
}

/// One folder, with short keys: a volume has hundreds of thousands.
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Folder {
    #[serde(rename = "n")]
    pub name: String,
    #[serde(rename = "b")]
    pub bytes: u64,
    #[serde(rename = "f", default)]
    pub files: u64,
    #[serde(rename = "d", default, skip_serializing_if = "Vec::is_empty")]
    pub dirs: Vec<Folder>,
}

impl Folder {
    pub fn of(d: &Dir) -> Self {
        Folder {
            name: d.name.clone(),
            bytes: d.bytes,
            files: d.file_count,
            dirs: d.dirs.iter().map(Folder::of).collect(),
        }
    }
}

impl Snapshot {
    pub fn of(root: &Path, tree: &Dir) -> Self {
        Snapshot {
            version: VERSION,
            root: root.to_string_lossy().into_owned(),
            taken: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0),
            tree: Folder::of(tree),
        }
    }
}

/// FNV-1a: a file name per root that stays the same across Rust releases
/// (the standard hasher does not promise that).
fn fnv1a(bytes: &[u8]) -> u64 {
    let mut h = 0xcbf2_9ce4_8422_2325u64;
    for b in bytes {
        h ^= u64::from(*b);
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    h
}

fn file_for(dir: &Path, root: &Path) -> PathBuf {
    dir.join(format!(
        "{:016x}.json",
        fnv1a(root.to_string_lossy().as_bytes())
    ))
}

/// The last snapshot of `root`, if there is a readable one in this format.
pub fn load(dir: &Path, root: &Path) -> Option<Snapshot> {
    let bytes = fs::read(file_for(dir, root)).ok()?;
    match serde_json::from_slice::<Snapshot>(&bytes) {
        Ok(s) if s.version == VERSION && Path::new(&s.root) == root => Some(s),
        Ok(_) => None,
        Err(e) => {
            log::warn!("snapshot: unreadable file for {}: {e}", root.display());
            None
        }
    }
}

/// Write `s` as the last snapshot of its root. The file is written beside
/// the old one and renamed over it, so a crash never leaves half a file.
pub fn save(dir: &Path, s: &Snapshot) -> io::Result<()> {
    fs::create_dir_all(dir)?;
    let file = file_for(dir, Path::new(&s.root));
    let part = file.with_extension("json.part");
    fs::write(&part, serde_json::to_vec(s).map_err(io::Error::other)?)?;
    fs::rename(&part, &file)
}

/// What changed since the last survey of the same place.
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SurveyChange {
    /// When the previous survey finished, in milliseconds since the epoch.
    pub since: f64,
    /// What the place held then.
    pub was: f64,
    /// Where it grew most, largest growth first.
    pub places: Vec<ChangePlace>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ChangePlace {
    /// Folder names from the survey's root down.
    pub path: Vec<String>,
    pub was: f64,
    pub now: f64,
    /// It was not there last time.
    pub new: bool,
}

struct Grew {
    path: Vec<String>,
    was: u64,
    now: u64,
    new: bool,
}

/// Compare `now` with the snapshot `before` of the same place.
pub fn change(now: &Dir, before: &Snapshot) -> SurveyChange {
    // Growth smaller than this is noise next to the whole: 1 MB, or 0.05 %.
    let min = (now.bytes.max(before.tree.bytes) / 2_000).max(BIG);
    let mut found = Vec::new();
    visit(now, Some(&before.tree), min, &mut Vec::new(), &mut found);
    found.sort_by_key(|g| std::cmp::Reverse(g.now - g.was));
    let mut places: Vec<Grew> = Vec::new();
    for g in found {
        if places.iter().any(|p| nested(&p.path, &g.path)) {
            continue;
        }
        places.push(g);
        if places.len() == PLACES {
            break;
        }
    }
    SurveyChange {
        since: before.taken as f64,
        was: before.tree.bytes as f64,
        places: places
            .into_iter()
            .map(|g| ChangePlace {
                path: g.path,
                was: g.was as f64,
                now: g.now as f64,
                new: g.new,
            })
            .collect(),
    }
}

/// One path is the other or lies inside it.
fn nested(a: &[String], b: &[String]) -> bool {
    let n = a.len().min(b.len());
    a[..n] == b[..n]
}

/// Every folder that grew by `min` or more without most of it sitting in one
/// child. The whole tree is visited: a folder can grow inside one that shrank.
fn visit(d: &Dir, old: Option<&Folder>, min: u64, path: &mut Vec<String>, out: &mut Vec<Grew>) {
    let was = old.map_or(0, |o| o.bytes);
    let grew = d.bytes.saturating_sub(was);
    let olds: HashMap<&str, &Folder> = old
        .map(|o| o.dirs.iter().map(|c| (c.name.as_str(), c)).collect())
        .unwrap_or_default();
    let mut top = 0u64;
    for c in &d.dirs {
        let oc = olds.get(c.name.as_str()).copied();
        top = top.max(c.bytes.saturating_sub(oc.map_or(0, |o| o.bytes)));
        path.push(c.name.clone());
        visit(c, oc, min, path, out);
        path.pop();
    }
    // The root is the whole change, not a place in it.
    if !path.is_empty() && grew >= min && top * 10 < grew * 6 {
        out.push(Grew {
            path: path.clone(),
            was,
            now: d.bytes,
            new: old.is_none(),
        });
    }
}

#[cfg(test)]
mod tests {
    use super::super::walk::Loose;
    use super::*;

    fn dir(name: &str, bytes: u64, dirs: Vec<Dir>) -> Dir {
        let mut d = Dir::named(name.into());
        d.loose = Loose {
            files: 1,
            bytes,
            ..Default::default()
        };
        d.dirs = dirs;
        d
    }

    fn tree(mut root: Dir) -> Dir {
        root.total();
        root
    }

    fn snapshot(root: &Dir) -> Snapshot {
        Snapshot {
            version: VERSION,
            root: "/x".into(),
            taken: 1_000,
            tree: Folder::of(root),
        }
    }

    fn paths(c: &SurveyChange) -> Vec<String> {
        c.places.iter().map(|p| p.path.join("/")).collect()
    }

    const MB: u64 = 1_000_000;

    #[test]
    fn growth_is_named_where_it_happened() {
        let before = tree(dir(
            "root",
            0,
            vec![
                dir("a", MB, vec![dir("b", MB, vec![dir("c", MB, vec![])])]),
                dir("x", MB, vec![dir("1", MB, vec![]), dir("2", MB, vec![])]),
                dir("same", 50 * MB, vec![]),
            ],
        ));
        let after = tree(dir(
            "root",
            0,
            vec![
                // All of a's growth is in a/b/c: name that, not a or a/b.
                dir("a", MB, vec![dir("b", MB, vec![dir("c", 11 * MB, vec![])])]),
                // x grew in two children alike: name x.
                dir(
                    "x",
                    MB,
                    vec![dir("1", 4 * MB, vec![]), dir("2", 4 * MB, vec![])],
                ),
                dir("same", 50 * MB, vec![]),
                dir("fresh", 2 * MB, vec![]),
            ],
        ));
        let c = change(&after, &snapshot(&before));
        assert_eq!(paths(&c), ["a/b/c", "x", "fresh"]);
        assert!(c.places[2].new && !c.places[0].new);
        assert_eq!(c.places[0].now - c.places[0].was, 10e6);
        assert_eq!(c.was, before.bytes as f64);
        assert_eq!(c.since, 1_000.0);
    }

    #[test]
    fn growth_inside_a_folder_that_shrank_still_counts() {
        let before = tree(dir(
            "root",
            0,
            vec![dir(
                "p",
                MB,
                vec![dir("old", 30 * MB, vec![]), dir("new", MB, vec![])],
            )],
        ));
        let after = tree(dir(
            "root",
            0,
            vec![dir("p", MB, vec![dir("new", 4 * MB, vec![])])],
        ));
        let c = change(&after, &snapshot(&before));
        assert_eq!(paths(&c), ["p/new"]);
    }

    #[test]
    fn nothing_grew() {
        let before = tree(dir("root", 0, vec![dir("a", 9 * MB, vec![])]));
        let after = tree(dir("root", 0, vec![dir("a", 2 * MB, vec![])]));
        let c = change(&after, &snapshot(&before));
        assert!(c.places.is_empty());
        assert!((c.was as u64) > after.bytes);
    }

    #[test]
    fn a_snapshot_survives_the_round_trip_and_only_for_its_root() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tree(dir("root", MB, vec![dir("a", 2 * MB, vec![])]));
        let mut s = Snapshot::of(Path::new("/Users/ada/github"), &root);
        save(tmp.path(), &s).unwrap();
        let back = load(tmp.path(), Path::new("/Users/ada/github")).unwrap();
        assert_eq!(back.tree.bytes, root.bytes);
        assert_eq!(back.tree.dirs[0].name, "a");
        assert!(load(tmp.path(), Path::new("/Users/ada")).is_none());
        // Saving again replaces it; another format version is ignored.
        s.version = VERSION + 1;
        save(tmp.path(), &s).unwrap();
        assert!(load(tmp.path(), Path::new("/Users/ada/github")).is_none());
        assert_eq!(fs::read_dir(tmp.path()).unwrap().count(), 1);
    }
}
