# Changelog

All notable changes to yDesktopTemplate are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/); this project uses
[semantic versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-10-01

### Added

- **Frontend errors leave a trace.** Release builds have no devtools, so a
  failed IPC call, a failed update, or a crash that landed on the error page
  used to vanish with the WebView console. Inside the desktop app, the
  frontend logger now also writes info and above to the same log file as the
  Rust side (on macOS, `~/Library/Logs/<identifier>/`), with the structured
  context attached.

### Changed

- **The template has its own name.** It used to ship as "yAssets", with
  yAssets' bundle identifier, so the OS took it for an installed yAssets.
  Whichever started second was stopped from launching, and the two shared
  app data and logs. It is now yDesktopTemplate
  (`com.maosensen.ydesktoptemplate`), and installers are named
  `yDesktopTemplate_*`. As a new identity it installs alongside v0.1.x
  instead of replacing it, and does not inherit its window state.
- **Current toolchain.** The frontend now builds with Vite 8 (Rolldown),
  TypeScript 7 (the native compiler) and Vitest 5. It runs on React 19.3 and
  Tauri 2.12, and every other dependency is on its latest release. The Rust
  crate moved to edition 2024. Building needs Node.js 24.15+ (or 22.22+), so
  Node 20 is no longer supported. CI runs on Node 24 and now builds the
  frontend on every push.
- **A home screen worth copying.** The starter screen now calls its Rust
  command through the generated typed bindings and reads its text from the
  copy catalog, which is what the conventions ask of new code. Leftovers from
  the original scaffold are gone: the Vite favicon and title, unused SVGs,
  `next-themes`, and Next.js-only `"use client"` directives.

### Fixed

- **The System theme follows macOS appearance changes.** Switching between
  light and dark while the app was open left the interface in the old mode
  over the new window material.
- **The startup update check runs in development builds.** React's
  StrictMode double-mount cancelled it, so `pnpm tauri dev` never exercised
  the update flow.

## [0.1.2] - 2026-09-14

### Fixed

- **The app no longer scrolls sideways.** `SidebarInset` is a flex item, and a
  flex item's automatic minimum size is its content's min-content width. That
  one holds the entire page, so any region built to scroll inside itself — a
  wide table, a horizontally scrolling row — stopped being an internal scroll
  and became the page's own width instead, taking the sticky header with it.
  `min-w-0` lets the inset take the space it is given. Upstream shadcn does
  not carry this class, so it is commented as ours: a wholesale copy of the
  component would delete it and bring the bug back.

### Changed

- **The dev server moved to port 4383** (HMR on 4384), so it stops colliding
  with the other projects in the matrix.
- **Documentation.** The feature ledger is checked before it is pushed, a
  duplicate `note` key on `tagged-release` is merged, and `shippedIn` values
  are normalised to the `v` prefix.

## [0.1.1] - 2026-07-28

### Added

- **Feature ledger** — the template now keeps a machine-readable inventory of
  its own capabilities in `.roadmap/features.yaml` (feature-ledger schema v1):
  every shipped and planned feature in one auditable file, reconciled on each
  release and consumed by the yPulse dashboard.

## [0.1.0] - 2026-07-10

First release — a production-shaped Tauri 2 + React desktop template.

### Added

- **Frosted-glass shell** — a transparent window with native vibrancy, an
  overlay titlebar with drag / double-click-to-zoom gestures, theme-synced
  window materials, and per-platform scrollbar styling.
- **Self-update wiring** — a silent startup check raises an Install & Restart
  toast. Updater artifacts ship disabled (`bundle.createUpdaterArtifacts:
  false`); generate your keypair, fill `plugins.updater`, and flip it back on
  to go live.
- **UI playground** — a `/playground` route demoing the in-house desktop kit:
  buttons, inputs, translucent dialogs and menus, context menus, toasts, and
  the theme switcher.
- **What's New page** — a `/changelog` route rendering curated release notes
  on a timeline from a typed, per-locale changelog module.
- **Type-safe plumbing** — tauri-specta IPC bindings, TanStack Router / Query,
  an i18n copy layer, Biome + clippy gates behind one `pnpm check`, and a
  four-platform release workflow.

[Unreleased]: https://github.com/maosensen/yDesktopTemplate/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/maosensen/yDesktopTemplate/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/maosensen/yDesktopTemplate/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/maosensen/yDesktopTemplate/releases/tag/v0.1.1
[0.1.0]: https://github.com/maosensen/yDesktopTemplate/releases/tag/v0.1.0
