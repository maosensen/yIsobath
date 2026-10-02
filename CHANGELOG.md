# Changelog

All notable changes to yIsobath are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/); this project uses
[semantic versioning](https://semver.org/).

## [Unreleased]

### Added

- **Chinese and Japanese.** The whole interface, the instrument included, now
  also speaks Simplified Chinese and Japanese: panels, legends, the readouts
  and labels drawn on the relief, the reclaimable-space rules, the Trash
  dialog and the reasons a move is refused. The first launch follows the
  system language. Switch any time from the language menu at the right end of
  the top bar; the survey on screen stays where it is. Chinese and Japanese
  each get their own system font, so shared characters are drawn the way that
  language draws them.

## [0.1.0] - 2026-10-01

### Added

- **Survey your own disk.** Survey the whole data volume, your home folder or
  any folder. A parallel walk in Rust reads only names, sizes and dates, and
  never opens a file. Sizes are what files occupy on disk, so a sparse disk
  image counts its real footprint and a file evicted to iCloud counts nothing.
  A file with several hard links counts once. Other devices and folders macOS
  will not list are skipped and counted, never silently dropped. On this
  machine, a 1.7-million-file folder takes 13 seconds and matches `du` to the
  byte.
- **The Isobath instrument, on the desktop.** The stepped relief from the
  lookbook draws real surveys. It has one terrace per folder level, an arc per
  byte, and lenses for type, age and reclaimable space. Folders too small to
  open are folded into one piece, so a whole volume stays at 60 fps.
- **Go into folded folders.** Click a folded piece, or select it and press
  Enter, and it opens at its own scale, as if that folder had been surveyed
  alone. It comes from the tree the survey already holds, so nothing is walked
  again, and it stays open after a move to the Trash. Folders that would only
  show their loose files stay folded.
- **What grew since last time.** Each place you survey leaves a snapshot of
  its folder sizes, holding names and sizes only. The next survey of it shows
  the net change and the folders that grew most, each named at the depth where
  the growth actually is. New folders are marked. Click one to bring it into
  view.
- **Move to Trash.** Use the focus panel, a right-click on the relief, or
  ⌘⌫. Every move asks first, showing the path, the size and the rule that
  flagged it. The survey's root, folders the system or your account depends
  on, and anything already in the Trash are refused. The picture updates in
  place without walking the disk again.
- **Reveal in Finder and copy path** for any piece of the relief.
- **Full Disk Access, explained up front.** Before a whole-disk or home
  survey without access, the app says what macOS will ask for and what it
  will skip, and links to the right pane of System Settings.
- **A demo volume** to explore before surveying anything.
- **Updates itself.** The app checks for a new version once at launch and
  installs it on request. Every update is signed and verified before it is
  applied.

[Unreleased]: https://github.com/maosensen/yIsobath/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/maosensen/yIsobath/releases/tag/v0.1.0
