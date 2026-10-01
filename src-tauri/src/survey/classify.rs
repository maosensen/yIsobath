//! What a name says about a file or a folder: which of the ten file types it is,
//! and which reclaimable-space rule (if any) should claim it.
//!
//! The extension lists and the folder tags are a port of yLookbook's
//! `sections/isobath/_components/live.ts`. The tags are the strings the rules in
//! `src/instrument/catalog.ts` match on, so the two lists must stay in step.
//! Native-only additions (the browser could not see these) are marked below.

use serde::Serialize;

/// The ten file types, in the order of `ISO_TYPE_KEYS` in the catalog.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum FileKind {
    Vid,
    Img,
    Aud,
    Mdl,
    Src,
    Bin,
    Vmi,
    Arc,
    Doc,
    Sys,
}

impl FileKind {
    pub const ALL: [FileKind; 10] = [
        FileKind::Vid,
        FileKind::Img,
        FileKind::Aud,
        FileKind::Mdl,
        FileKind::Src,
        FileKind::Bin,
        FileKind::Vmi,
        FileKind::Arc,
        FileKind::Doc,
        FileKind::Sys,
    ];

    pub fn index(self) -> usize {
        self as usize
    }
}

const EXTENSIONS: &[(FileKind, &[&str])] = &[
    (
        FileKind::Vid,
        &[
            "mp4", "mov", "m4v", "mkv", "avi", "webm", "mxf", "braw", "r3d", "mts",
        ],
    ),
    (
        FileKind::Img,
        &[
            "jpg", "jpeg", "png", "heic", "heif", "gif", "webp", "tif", "tiff", "raw", "cr2",
            "cr3", "nef", "arw", "dng", "psd", "svg", "exr", "avif",
        ],
    ),
    (
        FileKind::Aud,
        &[
            "mp3", "wav", "aif", "aiff", "flac", "m4a", "aac", "ogg", "opus", "caf",
        ],
    ),
    (
        FileKind::Mdl,
        &[
            "safetensors",
            "gguf",
            "ckpt",
            "pt",
            "pth",
            "onnx",
            "h5",
            "tflite",
            "mlmodel",
            "mlpackage",
            "npz",
        ],
    ),
    (
        FileKind::Src,
        &[
            "js", "mjs", "cjs", "ts", "tsx", "jsx", "json", "py", "rs", "go", "swift", "c", "cc",
            "cpp", "h", "hpp", "m", "java", "kt", "rb", "php", "css", "scss", "html", "md", "mdx",
            "yml", "yaml", "toml", "lock", "sh", "sql", "vue", "svelte", "map",
        ],
    ),
    (
        FileKind::Bin,
        &[
            "dylib", "so", "a", "o", "exe", "dll", "wasm", "node", "class", "jar", "rlib", "pyc",
        ],
    ),
    (
        FileKind::Vmi,
        &[
            "qcow2",
            "vmdk",
            "vdi",
            "vhd",
            "vhdx",
            "img",
            "raw",
            "sparseimage",
            "sparsebundle",
        ],
    ),
    (
        FileKind::Arc,
        &[
            "zip", "tar", "gz", "tgz", "bz2", "xz", "zst", "7z", "rar", "dmg", "pkg", "iso", "xip",
            "parquet",
        ],
    ),
    (
        FileKind::Doc,
        &[
            "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "key", "pages", "numbers", "txt",
            "rtf", "csv", "epub", "odt", "sketch", "fig",
        ],
    ),
];

fn extension(name: &str) -> Option<&str> {
    let dot = name.rfind('.')?;
    if dot == 0 {
        return None;
    }
    Some(&name[dot + 1..])
}

/// The file type by extension; anything unrecognised is "system & support".
pub fn kind_of(name: &str) -> FileKind {
    let Some(ext) = extension(name) else {
        return FileKind::Sys;
    };
    // Extensions are short; lowercase into a stack buffer instead of allocating.
    let mut buf = [0u8; 16];
    if ext.len() > buf.len() {
        return FileKind::Sys;
    }
    for (i, b) in ext.bytes().enumerate() {
        buf[i] = b.to_ascii_lowercase();
    }
    let Ok(lower) = std::str::from_utf8(&buf[..ext.len()]) else {
        return FileKind::Sys;
    };
    for (kind, list) in EXTENSIONS {
        if list.contains(&lower) {
            return *kind;
        }
    }
    FileKind::Sys
}

/// A mark a rule recognises. `as_str` is what the frontend's rules match on.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Tag {
    NodeModules,
    DerivedData,
    XcodePreviews,
    DeviceSupportOld,
    Trash,
    Build,
    PkgCache,
    AppCache,
    Logs,
    Installer,
    DockerRaw,
}

impl Tag {
    pub fn as_str(self) -> &'static str {
        match self {
            Tag::NodeModules => "node-modules",
            Tag::DerivedData => "derived-data",
            Tag::XcodePreviews => "xcode-previews",
            Tag::DeviceSupportOld => "device-support-old",
            Tag::Trash => "trash",
            Tag::Build => "build",
            Tag::PkgCache => "pkg-cache",
            Tag::AppCache => "app-cache",
            Tag::Logs => "logs",
            Tag::Installer => "installer",
            Tag::DockerRaw => "docker-raw",
        }
    }
}

/// Always build output, wherever they sit.
const BUILD_DIRS: &[&str] = &[
    ".next",
    ".turbo",
    ".nuxt",
    ".svelte-kit",
    ".parcel-cache",
    ".angular",
];

/// Package-manager stores, recognised by name under a cache parent.
const PKG_CACHES: &[&str] = &[
    "_cacache",
    "pip",
    "uv",
    "go-build",
    "Homebrew",
    "Yarn",
    "ms-playwright",
    "puppeteer",
];

/// Where a folder sits, as far as tagging cares.
#[derive(Clone, Copy, Debug, Default)]
pub struct Place<'a> {
    /// The folder that contains the one being tagged.
    pub parent: &'a str,
    /// The folder above that.
    pub grandparent: &'a str,
    /// Somewhere inside a `node_modules`: nothing in there is tagged on its own.
    pub in_node_modules: bool,
}

/// What the folder's siblings say — `dist` / `out` / `build` only count as build
/// output next to a `src`, and `target` only next to a `Cargo.toml`.
#[derive(Clone, Copy, Debug, Default)]
pub struct Siblings {
    pub has_src: bool,
    pub has_cargo_toml: bool,
}

/// The tag for a folder named `name`. `age_days` is the folder's own
/// modification age (used for device-support folders).
pub fn tag_dir(name: &str, at: Place<'_>, siblings: Siblings, age_days: f32) -> Option<Tag> {
    if name == "node_modules" && !at.in_node_modules {
        return Some(Tag::NodeModules);
    }
    if name == "DerivedData" {
        return Some(Tag::DerivedData);
    }
    // Native: `.Trashes` is a volume's own trash.
    if name == ".Trash" || name == ".Trashes" {
        return Some(Tag::Trash);
    }
    if at.in_node_modules {
        return None;
    }
    if BUILD_DIRS.contains(&name) {
        return Some(Tag::Build);
    }
    match name {
        "target" if siblings.has_cargo_toml => return Some(Tag::Build),
        "dist" | "out" | "build" if siblings.has_src => return Some(Tag::Build),
        _ => {}
    }
    if PKG_CACHES.contains(&name) && matches!(at.parent, "Caches" | ".cache" | ".npm") {
        return Some(Tag::PkgCache);
    }
    // Native: stores the browser survey never reached.
    let native_store = matches!(
        (name, at.parent, at.grandparent),
        ("store", "pnpm", _)
            | ("registry", ".cargo", _)
            | ("caches", ".gradle", _)
            | ("cache", "install", ".bun")
    );
    if native_store {
        return Some(Tag::PkgCache);
    }
    // Native: Xcode's SwiftUI preview caches.
    if name == "Previews" && at.parent == "UserData" && at.grandparent == "Xcode" {
        return Some(Tag::XcodePreviews);
    }
    // Native: symbols copied from devices, per OS version; old ones are dead weight.
    if at.parent.ends_with(" DeviceSupport") && age_days > 365.0 {
        return Some(Tag::DeviceSupportOld);
    }
    if name == "Caches" && at.parent == "Library" {
        return None;
    }
    if matches!(name, "Cache" | "CacheStorage" | "Code Cache") {
        return Some(Tag::AppCache);
    }
    if matches!(name, "Logs" | "DiagnosticReports") {
        return Some(Tag::Logs);
    }
    None
}

/// The tag for a file. Installers only count inside Downloads or on the
/// Desktop — the same file inside an app bundle or a cache is not leftover.
pub fn tag_file(name: &str, in_downloads: bool) -> Option<Tag> {
    if name == "Docker.raw" {
        return Some(Tag::DockerRaw);
    }
    if in_downloads
        && let Some(ext) = extension(name)
        && ["dmg", "pkg", "iso", "xip", "msi"]
            .iter()
            .any(|e| ext.eq_ignore_ascii_case(e))
    {
        return Some(Tag::Installer);
    }
    None
}

/// Files at or above this size get a node of their own; smaller ones are
/// gathered per folder into one "N files" piece.
pub const BIG: u64 = 1_000_000;

/// Files at or above this size take part in duplicate detection (same name,
/// same size — contents are never read, so it is "probably the same").
pub const DUP_MIN: u64 = 50_000_000;

#[cfg(test)]
mod tests {
    use super::*;

    fn place<'a>(parent: &'a str, grandparent: &'a str) -> Place<'a> {
        Place {
            parent,
            grandparent,
            in_node_modules: false,
        }
    }

    #[test]
    fn kinds_by_extension() {
        assert_eq!(kind_of("clip.MOV"), FileKind::Vid);
        assert_eq!(kind_of("weights.safetensors"), FileKind::Mdl);
        assert_eq!(kind_of("Cargo.lock"), FileKind::Src);
        assert_eq!(kind_of(".DS_Store"), FileKind::Sys);
        assert_eq!(kind_of("Makefile"), FileKind::Sys);
        assert_eq!(kind_of("installer.dmg"), FileKind::Arc);
    }

    #[test]
    fn node_modules_only_at_the_top() {
        let top = place("app", "src");
        assert_eq!(
            tag_dir("node_modules", top, Siblings::default(), 0.0),
            Some(Tag::NodeModules)
        );
        let nested = Place {
            in_node_modules: true,
            ..top
        };
        assert_eq!(
            tag_dir("node_modules", nested, Siblings::default(), 0.0),
            None
        );
        assert_eq!(tag_dir(".next", nested, Siblings::default(), 0.0), None);
    }

    #[test]
    fn build_output_needs_its_sibling() {
        let at = place("app", "github");
        let bare = Siblings::default();
        assert_eq!(tag_dir("dist", at, bare, 0.0), None);
        assert_eq!(tag_dir("target", at, bare, 0.0), None);
        let with_src = Siblings {
            has_src: true,
            ..bare
        };
        assert_eq!(tag_dir("dist", at, with_src, 0.0), Some(Tag::Build));
        assert_eq!(tag_dir("target", at, with_src, 0.0), None);
        let with_cargo = Siblings {
            has_cargo_toml: true,
            ..bare
        };
        assert_eq!(tag_dir("target", at, with_cargo, 0.0), Some(Tag::Build));
        assert_eq!(tag_dir(".turbo", at, bare, 0.0), Some(Tag::Build));
    }

    #[test]
    fn caches_by_parent() {
        let s = Siblings::default();
        assert_eq!(
            tag_dir("Homebrew", place("Caches", "Library"), s, 0.0),
            Some(Tag::PkgCache)
        );
        assert_eq!(tag_dir("Homebrew", place("opt", ""), s, 0.0), None);
        assert_eq!(tag_dir("Caches", place("Library", "me"), s, 0.0), None);
        assert_eq!(
            tag_dir("Code Cache", place("Default", "Chrome"), s, 0.0),
            Some(Tag::AppCache)
        );
        assert_eq!(
            tag_dir("store", place("pnpm", "Library"), s, 0.0),
            Some(Tag::PkgCache)
        );
        assert_eq!(
            tag_dir("cache", place("install", ".bun"), s, 0.0),
            Some(Tag::PkgCache)
        );
    }

    #[test]
    fn device_support_by_age() {
        let at = place("iOS DeviceSupport", "Xcode");
        let s = Siblings::default();
        assert_eq!(tag_dir("16.4 (20E247)", at, s, 30.0), None);
        assert_eq!(
            tag_dir("15.1 (19B74)", at, s, 700.0),
            Some(Tag::DeviceSupportOld)
        );
    }

    #[test]
    fn installers_only_in_downloads() {
        assert_eq!(tag_file("Xcode_17.xip", true), Some(Tag::Installer));
        assert_eq!(tag_file("Xcode_17.xip", false), None);
        assert_eq!(tag_file("Docker.raw", false), Some(Tag::DockerRaw));
    }
}
