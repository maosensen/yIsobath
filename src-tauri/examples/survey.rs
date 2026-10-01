//! Survey a folder from the command line and print what the app would get:
//! totals, the fold threshold, node count, payload size and timings, and what
//! expanding the largest expandable folder costs.
//!
//!     cargo run --release --example survey -- ~/github
//!     cargo run --release --example survey -- volume
//!
//! Handy for profiling the walk without the WebView. Prints nothing private
//! beyond counts and the root path.

use std::sync::atomic::AtomicU8;
use std::time::Instant;

use yisobath_lib::survey::{self, SurveyTarget};

fn main() {
    let arg = std::env::args().nth(1).unwrap_or_else(|| ".".into());
    let target = match arg.as_str() {
        "volume" => SurveyTarget::Volume,
        "home" => SurveyTarget::Home,
        path => SurveyTarget::Folder {
            path: std::fs::canonicalize(path)
                .expect("no such folder")
                .to_string_lossy()
                .into_owned(),
        },
    };
    let (path, meta) = survey::resolve(&target).expect("cannot survey that");
    let stop = AtomicU8::new(0);
    let started = Instant::now();
    let mut s = survey::run(&path, meta, &stop, |_| {}).expect("survey failed");
    let walked = started.elapsed();
    let emit_start = Instant::now();
    let result = s.result();
    let emitted = emit_start.elapsed();
    let json = serde_json::to_string(&result).expect("serialize");
    let st = &result.stats;
    println!("root        {}", path.display());
    println!(
        "walk        {:.2} s · {} files · {} folders · {:.2} GB",
        walked.as_secs_f64(),
        st.files,
        st.dirs,
        st.bytes / 1e9
    );
    println!(
        "skipped     {} unreadable · {} other devices · {} extra hard links",
        st.denied, st.mounts, st.hardlinks
    );
    println!(
        "fold        threshold {:.1} MB → {} nodes · emit {:.0} ms",
        st.threshold / 1e6,
        st.nodes,
        emitted.as_secs_f64() * 1000.0
    );
    println!("payload     {:.1} MB of JSON", json.len() as f64 / 1e6);
    let r = &result.root;
    if let Some(kids) = &r.children {
        let mut kids: Vec<_> = kids.iter().collect();
        kids.sort_by(|a, b| size(b).total_cmp(&size(a)));
        for k in kids.iter().take(8) {
            println!("  {:>9.2} GB  {}", size(k) / 1e9, k.name);
        }
    }

    // What going into the largest expandable folder costs: the whole survey is
    // folded and sent again.
    let mut largest: Option<(f64, Vec<String>)> = None;
    biggest_expandable(r, &mut Vec::new(), &mut largest);
    if let Some((bytes, parts)) = largest {
        let started = Instant::now();
        assert!(s.expand(&path.join(parts.join("/"))));
        let after = s.result();
        let emitted = started.elapsed();
        let json = serde_json::to_string(&after).expect("serialize");
        println!(
            "expand      {} ({:.1} MB) → {} nodes · emit {:.0} ms · {:.1} MB of JSON",
            parts.join("/"),
            bytes / 1e6,
            after.stats.nodes,
            emitted.as_secs_f64() * 1000.0,
            json.len() as f64 / 1e6
        );
    }
}

fn biggest_expandable(
    n: &survey::emit::SurveyNode,
    at: &mut Vec<String>,
    best: &mut Option<(f64, Vec<String>)>,
) {
    for c in n.children.iter().flatten() {
        at.push(c.name.clone());
        if c.expandable && best.as_ref().is_none_or(|(b, _)| c.bytes > *b) {
            *best = Some((c.bytes, at.clone()));
        }
        biggest_expandable(c, at, best);
        at.pop();
    }
}

fn size(n: &survey::emit::SurveyNode) -> f64 {
    match &n.children {
        Some(c) => c.iter().map(size).sum(),
        None => n.bytes,
    }
}
