//! Facts about this machine the survey needs: where the data volume is, what it
//! is called, how big it is, and whether the app may read protected folders.

use std::path::{Path, PathBuf};

use crate::error::Refusal;

/// On macOS the user's files live on the data volume, firmlinked into `/`.
/// Walking `/` would either skip them (another device) or count them twice, so
/// a "whole disk" survey walks the data volume itself.
pub const MAC_DATA_VOLUME: &str = "/System/Volumes/Data";

pub fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .filter(|h| !h.is_empty())
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from))
}

/// The folder a "whole disk" survey starts from.
pub fn volume_root() -> PathBuf {
    let data = Path::new(MAC_DATA_VOLUME);
    if cfg!(target_os = "macos") && data.is_dir() {
        data.to_path_buf()
    } else if cfg!(windows) {
        PathBuf::from("C:\\")
    } else {
        PathBuf::from("/")
    }
}

/// The boot volume's name as Finder shows it ("Macintosh HD"): `/Volumes` holds
/// a symlink to `/` under that name.
pub fn boot_volume_name() -> String {
    if let Ok(rd) = std::fs::read_dir("/Volumes") {
        for entry in rd.flatten() {
            if let Ok(target) = std::fs::read_link(entry.path())
                && target == Path::new("/")
            {
                return entry.file_name().to_string_lossy().into_owned();
            }
        }
    }
    if cfg!(target_os = "macos") {
        "Macintosh HD".into()
    } else {
        "System disk".into()
    }
}

#[derive(Debug, Clone, Default)]
pub struct VolumeInfo {
    /// Bytes the volume (on APFS: its container) can hold.
    pub capacity: u64,
    /// Bytes still free for this user.
    pub free: u64,
    /// File system name ("apfs").
    pub fs: String,
    /// The device it is mounted from ("disk3s5").
    pub device: String,
}

#[cfg(target_os = "macos")]
pub fn volume_info(path: &Path) -> Option<VolumeInfo> {
    use std::ffi::{CStr, CString};
    use std::os::unix::ffi::OsStrExt;
    let c = CString::new(path.as_os_str().as_bytes()).ok()?;
    let mut st: libc::statfs = unsafe { std::mem::zeroed() };
    // SAFETY: `c` is a valid NUL-terminated path and `st` a writable statfs.
    if unsafe { libc::statfs(c.as_ptr(), &mut st) } != 0 {
        return None;
    }
    let bsize = st.f_bsize as u64;
    // SAFETY: statfs fills both name fields with NUL-terminated strings.
    let fs = unsafe { CStr::from_ptr(st.f_fstypename.as_ptr()) }
        .to_string_lossy()
        .into_owned();
    let from = unsafe { CStr::from_ptr(st.f_mntfromname.as_ptr()) }
        .to_string_lossy()
        .into_owned();
    Some(VolumeInfo {
        capacity: st.f_blocks * bsize,
        free: st.f_bavail * bsize,
        fs: fs.to_uppercase(),
        device: from.trim_start_matches("/dev/").to_string(),
    })
}

#[cfg(all(unix, not(target_os = "macos")))]
pub fn volume_info(path: &Path) -> Option<VolumeInfo> {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;
    let c = CString::new(path.as_os_str().as_bytes()).ok()?;
    let mut st: libc::statvfs = unsafe { std::mem::zeroed() };
    // SAFETY: `c` is a valid NUL-terminated path and `st` a writable statvfs.
    if unsafe { libc::statvfs(c.as_ptr(), &mut st) } != 0 {
        return None;
    }
    let frsize = st.f_frsize as u64;
    Some(VolumeInfo {
        capacity: st.f_blocks as u64 * frsize,
        free: st.f_bavail as u64 * frsize,
        fs: String::new(),
        device: String::new(),
    })
}

#[cfg(not(unix))]
pub fn volume_info(_path: &Path) -> Option<VolumeInfo> {
    None
}

/// Whether the app has Full Disk Access. The system TCC database can only be
/// opened with it — and trying does not raise a permission prompt.
#[cfg(target_os = "macos")]
pub fn full_disk_access() -> bool {
    std::fs::File::open("/Library/Application Support/com.apple.TCC/TCC.db").is_ok()
}

#[cfg(not(target_os = "macos"))]
pub fn full_disk_access() -> bool {
    true
}

/// Folders a survey is never allowed to put in the Trash, as absolute paths in
/// the firmlinked view (`/Users`, not `/System/Volumes/Data/Users`).
fn protected(home: Option<&Path>) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = [
        "/",
        "/Applications",
        "/Library",
        "/System",
        "/Users",
        "/Volumes",
        "/private",
        "/usr",
        "/opt",
        "/bin",
        "/sbin",
        "/cores",
        "/etc",
        "/var",
        "/tmp",
    ]
    .iter()
    .map(PathBuf::from)
    .collect();
    if let Some(h) = home {
        for sub in [
            "",
            "Library",
            ".Trash",
            "Desktop",
            "Documents",
            "Downloads",
            "Movies",
            "Music",
            "Pictures",
            "Applications",
        ] {
            out.push(if sub.is_empty() {
                h.to_path_buf()
            } else {
                h.join(sub)
            });
        }
    }
    out
}

/// `/System/Volumes/Data/Users/x` → `/Users/x`.
pub fn firmlinked(path: &Path) -> PathBuf {
    match path.strip_prefix(MAC_DATA_VOLUME) {
        Ok(rest) if cfg!(target_os = "macos") => Path::new("/").join(rest),
        _ => path.to_path_buf(),
    }
}

/// Why `path` may not go to the Trash, or `None` if it may. `root` is the
/// surveyed folder; nothing outside it, and not the root itself, is touched.
pub fn trash_refusal(path: &Path, root: &Path, home: Option<&Path>) -> Option<Refusal> {
    if !path.is_absolute() || path.components().any(|c| c.as_os_str() == "..") {
        return Some(Refusal::NotAbsolute);
    }
    if !path.starts_with(root) || path == root {
        return Some(Refusal::OutsideSurvey);
    }
    let shown = firmlinked(path);
    if protected(home).contains(&shown) {
        return Some(Refusal::Protected);
    }
    let sealed = [
        "/System",
        "/bin",
        "/sbin",
        "/usr/bin",
        "/usr/lib",
        "/usr/sbin",
    ];
    if sealed.iter().any(|s| shown.starts_with(s)) {
        return Some(Refusal::System);
    }
    if let Some(h) = home
        && shown.starts_with(h.join(".Trash"))
    {
        return Some(Refusal::InTrash);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_trash_guard() {
        let home = Path::new("/Users/ada");
        let root = Path::new("/Users/ada");
        let ok = |p: &str| trash_refusal(Path::new(p), root, Some(home));
        assert_eq!(ok("/Users/ada/github/app/node_modules"), None);
        assert_eq!(ok("/Users/ada"), Some(Refusal::OutsideSurvey), "the root");
        assert_eq!(ok("/Users/ada/Library"), Some(Refusal::Protected));
        assert_eq!(ok("/Users/ada/Documents"), Some(Refusal::Protected));
        assert_eq!(ok("/Users/ada/Library/Caches/Homebrew"), None);
        assert_eq!(ok("/Users/ada/.Trash/old.dmg"), Some(Refusal::InTrash));
        assert_eq!(ok("/Users/bob/thing"), Some(Refusal::OutsideSurvey));
        assert_eq!(
            ok("/Users/ada/github/../Library"),
            Some(Refusal::NotAbsolute)
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn the_data_volume_maps_to_firmlinks() {
        let home = Path::new("/Users/ada");
        let root = Path::new(MAC_DATA_VOLUME);
        let ok = |p: &str| trash_refusal(Path::new(p), root, Some(home));
        assert!(ok("/System/Volumes/Data/Users").is_some());
        assert!(ok("/System/Volumes/Data/Users/ada/Library").is_some());
        assert!(ok("/System/Volumes/Data/System/Library/Foo").is_some());
        assert_eq!(
            ok("/System/Volumes/Data/Users/ada/Library/Developer/Xcode/DerivedData"),
            None
        );
        assert_eq!(
            firmlinked(Path::new("/System/Volumes/Data/opt/homebrew")),
            Path::new("/opt/homebrew")
        );
    }
}
