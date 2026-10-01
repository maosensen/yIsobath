//! From the survey's full tree to the tree the instrument draws.
//!
//! A whole data volume has hundreds of thousands of folders; the relief only
//! needs the ones big enough to see. Everything under a byte threshold `T` is
//! folded:
//!
//! - a folder of `T` or more is **open** (its own node, with children), and so
//!   is a smaller one holding `T / 16` (at least 100 kB) under rule tags, so a
//!   small project's `node_modules` still reaches the rules;
//! - a smaller folder is **folded** into one piece with its name, its totals and
//!   its rule tag — still a real path, so it can be revealed or trashed, but not
//!   entered — when it holds at least `T / 16`, or 100 kB and a rule tag;
//!   anything smaller joins the folder's loose files;
//! - files of `max(BIG, T)` and more keep a node of their own; smaller ones join
//!   the "N files" piece.
//!
//! `T` starts at `max(BIG, total / 1,000,000)` and grows until the tree fits the
//! node budget, so a small folder is shown file by file and a 2 TB volume stays
//! drawable. Bytes are conserved: the leaves always add up to the root.

use std::collections::HashMap;

use serde::Serialize;

use super::classify::{BIG, DUP_MIN, FileKind};
use super::walk::Dir;

/// How many nodes the instrument is handed at most.
pub const NODE_BUDGET: usize = 60_000;

/// A node in the shape `Volume` reads (`src/instrument/volume.ts`).
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct SurveyNode {
    pub name: String,
    /// Open folders only.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[specta(optional)]
    pub children: Option<Vec<SurveyNode>>,
    /// Leaves only; an open folder is the sum of its children.
    pub bytes: f64,
    /// How many files a leaf stands for.
    pub files: f64,
    /// How many folders a leaf stands for (a folded folder counts itself).
    pub dirs: f64,
    /// Days since last modified (byte-weighted for folded pieces).
    pub age: f64,
    #[serde(rename = "type")]
    pub kind: FileKind,
    /// The loose files of a folder, gathered.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    #[specta(optional)]
    pub agg: bool,
    /// A folder shown as one piece.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    #[specta(optional)]
    pub folded: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[specta(optional)]
    pub dup: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[specta(optional)]
    pub tag: Option<String>,
    /// The folder could not be listed.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    #[specta(optional)]
    pub denied: bool,
}

fn dominant(bytes: &[u64; 10]) -> FileKind {
    let mut best = FileKind::Sys;
    let mut bv = 0u64;
    for (k, b) in bytes.iter().enumerate() {
        if *b > bv {
            bv = *b;
            best = FileKind::ALL[k];
        }
    }
    best
}

/// Tagged folders smaller than this join the loose files: there are thousands
/// of empty `Cache` and `Logs` folders on a volume, and none of them matter.
const TAG_MIN: u64 = 100_000;

enum Fate {
    Open,
    Fold,
    Loose,
}

fn fate(c: &Dir, t: u64) -> Fate {
    // A small untagged folder still opens when a real share of it sits under
    // a rule tag (a project's node_modules) — folding it would hide that from
    // the rules.
    let reclaimable = c.tag.is_none() && c.tagged >= (t / 16).max(TAG_MIN);
    if c.bytes >= t || reclaimable {
        Fate::Open
    } else if c.bytes >= (t / 16).max(64_000) || c.tag.is_some() && c.bytes >= TAG_MIN {
        Fate::Fold
    } else {
        Fate::Loose
    }
}

/// How many nodes `emit` would produce at threshold `t`.
pub fn count(d: &Dir, t: u64) -> usize {
    let mut n = 1;
    let mut loose = d.loose.files > 0;
    for c in &d.dirs {
        match fate(c, t) {
            Fate::Open => n += count(c, t),
            Fate::Fold => n += 1,
            Fate::Loose => loose = true,
        }
    }
    let big = t.max(BIG);
    for f in &d.files {
        if f.bytes >= big {
            n += 1;
        } else {
            loose = true;
        }
    }
    n + usize::from(loose)
}

/// The smallest threshold (doubling from the start value) that fits the budget.
pub fn threshold(root: &Dir, budget: usize) -> u64 {
    let mut t = BIG.max(root.bytes / 1_000_000);
    while count(root, t) > budget && t < u64::MAX / 2 {
        t = t.saturating_mul(2);
    }
    t
}

/// Names + sizes seen at least twice among files of `DUP_MIN` and more.
pub fn duplicate_keys(root: &Dir) -> HashMap<(String, u64), u32> {
    fn visit(d: &Dir, seen: &mut HashMap<(String, u64), u32>) {
        for f in &d.files {
            if f.bytes >= DUP_MIN {
                *seen.entry((f.name.clone(), f.bytes)).or_default() += 1;
            }
        }
        for c in &d.dirs {
            visit(c, seen);
        }
    }
    let mut seen = HashMap::new();
    visit(root, &mut seen);
    seen.retain(|_, n| *n >= 2);
    seen
}

pub struct Emitter<'a> {
    pub threshold: u64,
    pub dups: &'a HashMap<(String, u64), u32>,
}

impl Emitter<'_> {
    pub fn open(&self, d: &Dir) -> SurveyNode {
        let t = self.threshold;
        let big = t.max(BIG);
        let mut children = Vec::new();
        // The loose piece: small files plus folders too small to fold.
        let mut loose_files = d.loose.files;
        let mut loose_dirs = 0u64;
        let mut loose_bytes = d.loose.bytes;
        let mut loose_kinds = d.loose.by_kind;
        let mut loose_weight = d.loose.age_weight;

        for c in &d.dirs {
            match fate(c, t) {
                Fate::Open => children.push(self.open(c)),
                Fate::Fold => children.push(self.fold(c)),
                Fate::Loose => {
                    loose_files += c.file_count;
                    loose_dirs += c.dir_count + 1;
                    loose_bytes += c.bytes;
                    loose_weight += c.age_weight;
                    c.kind_bytes(&mut loose_kinds);
                }
            }
        }
        for f in &d.files {
            if f.bytes >= big {
                let key = (f.name.clone(), f.bytes);
                let dup = self
                    .dups
                    .contains_key(&key)
                    .then(|| format!("{}:{}", f.name, f.bytes));
                children.push(SurveyNode {
                    name: f.name.clone(),
                    children: None,
                    bytes: f.bytes as f64,
                    files: 1.0,
                    dirs: 0.0,
                    age: f.age as f64,
                    kind: f.kind,
                    agg: false,
                    folded: false,
                    dup,
                    tag: f.tag.map(|t| t.as_str().to_string()),
                    denied: false,
                });
            } else {
                loose_files += 1;
                loose_bytes += f.bytes;
                loose_kinds[f.kind.index()] += f.bytes;
                loose_weight += f.bytes as f64 * f.age as f64;
            }
        }
        if loose_files > 0 || loose_dirs > 0 {
            let name = if loose_files > 0 {
                format!(
                    "{} {}",
                    group(loose_files),
                    if loose_files == 1 { "file" } else { "files" }
                )
            } else {
                format!(
                    "{} {}",
                    group(loose_dirs),
                    if loose_dirs == 1 { "folder" } else { "folders" }
                )
            };
            children.push(SurveyNode {
                name,
                children: None,
                bytes: loose_bytes as f64,
                files: loose_files as f64,
                dirs: loose_dirs as f64,
                age: if loose_bytes > 0 {
                    loose_weight / loose_bytes as f64
                } else {
                    0.0
                },
                kind: dominant(&loose_kinds),
                agg: true,
                folded: false,
                dup: None,
                tag: None,
                denied: false,
            });
        }
        SurveyNode {
            name: d.name.clone(),
            children: Some(children),
            bytes: 0.0,
            files: 0.0,
            dirs: 0.0,
            age: 0.0,
            kind: FileKind::Sys,
            agg: false,
            folded: false,
            dup: None,
            tag: d.tag.map(|t| t.as_str().to_string()),
            denied: d.denied,
        }
    }

    fn fold(&self, d: &Dir) -> SurveyNode {
        let mut kinds = [0u64; 10];
        d.kind_bytes(&mut kinds);
        SurveyNode {
            name: d.name.clone(),
            children: None,
            bytes: d.bytes as f64,
            files: d.file_count as f64,
            dirs: (d.dir_count + 1) as f64,
            age: d.mean_age() as f64,
            kind: dominant(&kinds),
            agg: false,
            folded: true,
            dup: None,
            tag: d.tag.map(|t| t.as_str().to_string()),
            denied: d.denied,
        }
    }
}

/// 1234567 → "1,234,567" (the instrument's own number style).
fn group(n: u64) -> String {
    let s = n.to_string();
    let mut out = String::with_capacity(s.len() + s.len() / 3);
    for (i, ch) in s.chars().enumerate() {
        if i > 0 && (s.len() - i).is_multiple_of(3) {
            out.push(',');
        }
        out.push(ch);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::super::classify::Tag;
    use super::super::walk::{File, Loose};
    use super::*;

    fn file(name: &str, bytes: u64) -> File {
        File {
            name: name.into(),
            bytes,
            age: 10.0,
            kind: FileKind::Bin,
            tag: None,
        }
    }

    fn loose(files: u64, bytes: u64) -> Loose {
        let mut by_kind = [0; 10];
        by_kind[FileKind::Src.index()] = bytes;
        Loose {
            files,
            bytes,
            by_kind,
            age_weight: bytes as f64 * 30.0,
        }
    }

    /// A wide tree: `n` project folders of varying size, each with a tagged
    /// node_modules and some loose files.
    fn wide(n: u64) -> Dir {
        let mut root = Dir::named("root".into());
        for i in 0..n {
            let mut p = Dir::named(format!("p{i}"));
            let mut nm = Dir::named("node_modules".into());
            nm.tag = Some(Tag::NodeModules);
            nm.loose = loose(40, 200_000 + i * 10);
            p.dirs.push(nm);
            p.files.push(file("build.bin", BIG + i * 1_000));
            p.loose = loose(5, 500 + i);
            root.dirs.push(p);
        }
        root.total();
        root
    }

    fn sum_leaves(n: &SurveyNode) -> f64 {
        match &n.children {
            Some(c) => c.iter().map(sum_leaves).sum(),
            None => n.bytes,
        }
    }

    fn count_nodes(n: &SurveyNode) -> usize {
        1 + n
            .children
            .as_ref()
            .map(|c| c.iter().map(count_nodes).sum())
            .unwrap_or(0)
    }

    #[test]
    fn bytes_are_conserved_and_the_count_is_exact() {
        let root = wide(500);
        let dups = HashMap::new();
        for t in [BIG, BIG * 4, BIG * 64] {
            let e = Emitter {
                threshold: t,
                dups: &dups,
            };
            let out = e.open(&root);
            assert_eq!(sum_leaves(&out) as u64, root.bytes, "threshold {t}");
            assert_eq!(count_nodes(&out), count(&root, t), "threshold {t}");
        }
    }

    #[test]
    fn the_budget_raises_the_threshold() {
        let root = wide(2_000);
        let t = threshold(&root, 1_000);
        assert!(count(&root, t) <= 1_000);
        assert!(t > BIG);
    }

    #[test]
    fn tagged_folders_survive_folding() {
        let root = wide(3);
        let dups = HashMap::new();
        let out = Emitter {
            threshold: BIG * 1_000,
            dups: &dups,
        }
        .open(&root);
        // Everything is far below T: the projects are loose, but a project's
        // node_modules would only survive as its own piece if the project were
        // open. At a threshold that opens the projects, each one keeps its tag.
        assert!(out.children.as_ref().unwrap().iter().all(|c| c.agg));
        assert_eq!(sum_leaves(&out) as u64, root.bytes);
        let open = Emitter {
            threshold: BIG,
            dups: &dups,
        }
        .open(&root);
        for p in open.children.as_ref().unwrap() {
            let kids = p.children.as_ref().expect("projects are open");
            let nm = kids.iter().find(|c| c.name == "node_modules").unwrap();
            assert!(nm.folded);
            assert_eq!(nm.tag.as_deref(), Some("node-modules"));
        }
    }

    #[test]
    fn a_small_project_opens_for_its_node_modules() {
        let mut root = Dir::named("root".into());
        let mut project = Dir::named("project".into());
        let mut nm = Dir::named("node_modules".into());
        nm.tag = Some(Tag::NodeModules);
        nm.loose = loose(900, 300_000);
        project.dirs.push(nm);
        project.loose = loose(3, 2_000);
        root.dirs.push(project);
        root.files.push(file("big.bin", 50 * BIG));
        root.total();
        assert_eq!(root.dirs[0].tagged, 300_000);
        let t = BIG * 4;
        let dups = HashMap::new();
        let out = Emitter {
            threshold: t,
            dups: &dups,
        }
        .open(&root);
        let p = out
            .children
            .as_ref()
            .unwrap()
            .iter()
            .find(|c| c.name == "project")
            .unwrap();
        let kids = p.children.as_ref().expect("opened for its node_modules");
        assert!(
            kids.iter()
                .any(|c| c.tag.as_deref() == Some("node-modules"))
        );
        assert_eq!(count_nodes(&out), count(&root, t));
        assert_eq!(sum_leaves(&out) as u64, root.bytes);
    }

    #[test]
    fn duplicates_need_two_copies() {
        let mut root = Dir::named("root".into());
        let mut a = Dir::named("a".into());
        a.files.push(file("model.gguf", DUP_MIN * 2));
        let mut b = Dir::named("b".into());
        b.files.push(file("model.gguf", DUP_MIN * 2));
        b.files.push(file("other.gguf", DUP_MIN * 3));
        root.dirs.push(a);
        root.dirs.push(b);
        root.total();
        let dups = duplicate_keys(&root);
        assert_eq!(dups.len(), 1);
        assert!(dups.contains_key(&("model.gguf".to_string(), DUP_MIN * 2)));
    }

    #[test]
    fn grouping() {
        assert_eq!(group(7), "7");
        assert_eq!(group(1_234), "1,234");
        assert_eq!(group(1_234_567), "1,234,567");
    }
}
