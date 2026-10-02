# yIsobath

English · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

A disk survey instrument for the desktop. Survey the whole data volume, your
home folder or any folder, and see it as a stepped relief: one terrace per
folder level, an arc per byte, with lenses for file type, age and reclaimable
space. Then reveal what you find in Finder, or move it to the Trash.

Built on Tauri 2 from [yDesktopTemplate](https://github.com/maosensen/yDesktopTemplate)
v0.2.0. The instrument comes from the Isobath section of yLookbook, where it
surveyed a generated demo volume and, in the browser, one folder at a time.
Here a Rust walker surveys the real disk.

## What it reads, and what it never does

- It reads **names, on-disk sizes and modification times**, and never opens a
  file. Nothing leaves the computer.
- It keeps **one snapshot per surveyed place**, holding folder names and sizes
  only, in the app's data folder. The next survey of that place uses it to show
  what grew in between.
- Sizes are **allocated blocks**, as `du` counts them. A sparse disk image
  counts what it occupies, a file evicted to iCloud counts nothing, and a file
  with several hard links counts once.
- A whole-disk survey walks the **data volume** (`/System/Volumes/Data` on
  macOS) and stays on it. Other devices are skipped and counted.
- Folders macOS will not list are **counted as unreadable**, never silently
  dropped. Grant Full Disk Access in System Settings to survey everything.
- It **moves to the Trash, never deletes**. Every move asks first. The
  survey's root, system folders, account folders (`~/Library`,
  `~/Documents`…) and anything already in the Trash are refused.

## Download

Get it from [Releases](https://github.com/maosensen/yIsobath/releases/latest):
the `.dmg` for macOS (`aarch64` for Apple silicon, `x64` for Intel; signed with
a Developer ID and notarized), `.msi` or `-setup.exe` for Windows (not signed
yet, so SmartScreen warns on first install), `.deb`, `.rpm` or `.AppImage` for
Linux. Installed copies check for updates on launch.

The interface is in English, Simplified Chinese and Japanese. It follows the
system language on first launch; switch from the menu at the right end of the
top bar.

## Stack

| Layer | Tech |
|---|---|
| Shell | Tauri 2 (Rust backend + OS WebView) |
| Survey | Rust: `rayon` parallel walk, `trash`, `libc::statfs` |
| Instrument | WebGL2 relief + 2D canvas overlay, React panels (`src/instrument/`) |
| Frontend | Vite 8 · React 19 · TypeScript 7 · TanStack Router / Query |
| Styling | Tailwind CSS v4 + shadcn/ui (Base UI) for menus, dialogs, toasts; the instrument has its own scoped CSS |
| Type-safe IPC | tauri-specta → generated `src/lib/bindings.ts` |
| Lint / format | Biome (TS) · rustfmt + clippy (Rust) |
| Tests | Vitest · `cargo test` |

## Getting started

```bash
pnpm install
pnpm lefthook install     # once, to enable git hooks
pnpm tauri dev            # run the desktop app (Vite + Rust)
```

Development switches (debug builds only):

```bash
YISOBATH_SURVEY=~/github pnpm tauri dev    # survey on launch: volume | home | /abs/path
YISOBATH_PERF=1 pnpm tauri dev             # log frame timings every 5 s
cd src-tauri && cargo run --release --example survey -- ~/github   # time the walk, no UI
```

Logs go to `~/Library/Logs/com.maosensen.yisobath/yIsobath.log`.

Other commands:

```bash
pnpm check        # full gate: typecheck + lint + test + bindings drift + cargo fmt-check + clippy
pnpm tauri build  # production bundle
```

## Project layout

```
src/
  instrument/        # the Isobath instrument (engine, WebGL relief, overlay, panels, rules, demo volume)
  lib/survey.ts      # the instrument's IPC boundary
  lib/i18n/          # en / zh / ja copy, the instrument's included
  routes/index.tsx   # the window: the instrument, edge to edge
src-tauri/src/
  survey/            # walk · emit (folding) · classify (types and rule tags) · system (volume, FDA, Trash guard)
  commands/          # survey, stop, reveal, expand a folded folder, move to Trash, privacy settings, dev options
  examples/survey.rs # command-line survey for profiling
docs/DESIGN.md       # what was ported, what changed, what is invented, known limits
```

## Conventions

Read [AGENTS.md](AGENTS.md) before contributing, and [docs/DESIGN.md](docs/DESIGN.md)
before changing how the survey reads the disk or what the instrument shows.

## Releasing

See [.claude/release.md](.claude/release.md). The first release needs the
GitHub repository, the updater key and the Apple signing secrets. Full Disk
Access is tied to the signing identity, so signed builds keep it across
updates.
