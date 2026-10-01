# yDesktopTemplate

A production-shaped **Tauri 2 desktop app template** — the shell of the yAssets media / asset manager — with a Vite + React + TypeScript frontend.

## Stack

| Layer | Tech |
|---|---|
| Shell | Tauri 2 (Rust backend + OS WebView) |
| Frontend | Vite 8 (Rolldown) · React 19 · TypeScript 7 (strict, native compiler) |
| Routing | TanStack Router (file-based, `src/routes/`) |
| Async / IPC state | TanStack Query |
| Virtualization | TanStack Virtual |
| Client state | Zustand |
| Styling | Tailwind CSS v4 (OKLCH) + shadcn/ui (Base UI) |
| Forms | react-hook-form + zod |
| Type-safe IPC | tauri-specta → generated `src/lib/bindings.ts` |
| Lint / format | Biome (TS) · rustfmt + clippy (Rust) |
| Tests | Vitest + Testing Library · `cargo test` |
| Hooks | lefthook (biome + rustfmt + clippy on commit) |

Baseline Tauri plugins wired: `single-instance`, `window-state`, `store`, `log`, `fs` (scoped), `dialog`, `opener`, `updater` + `process` (self-update).

## Desktop shell baseline (ported from yAssets)

- **Frosted-glass chrome** — transparent window + native vibrancy (`macOSPrivateApi`, `windowEffects`); chrome panels paint translucent tints (`bg-sidebar/50`), content panes stay solid (`bg-background`). Windows opts back into opaque chrome via the `windows:` Tailwind variant.
- **Overlay titlebar** — `titleBarStyle: Overlay` + `hiddenTitle`; chrome regions use the `useWindowDrag` hook: press-and-move / long-press to drag the window, double-click to toggle maximize.
- **Theme system** — `ThemeProvider` (localStorage) also syncs the NATIVE window materials via `window.setTheme`; `color-scheme` keeps native scrollbars/form controls in step.
- **Scrollbars** — macOS keeps its overlay bar; Windows (WebView2) gets a thin, rounded, theme-colored thumb (`.platform-windows` styles in `index.css`).
- **Self-update** — silent startup check (`useUpdateCheck`) raises a toast with an Install & Restart action; `src/lib/updater.ts` wraps plugin-updater/process. Fill in `plugins.updater.pubkey`/`endpoints` in `tauri.conf.json`, then set `bundle.createUpdaterArtifacts` back to `true` (it ships `false` so releases build without signing keys).
- **Icons** — Solar Line Duotone via unplugin-icons, compiled at build time; import by semantic name from `src/components/icons.ts` only.
- **Copy / i18n** — user-facing strings live in `src/lib/i18n/en.ts`, read through `T` from `@/lib/text`.
- **UI playground** — the `/playground` route hosts the in-house desktop component kit: live demos of buttons, inputs, translucent dialogs/menus, context menus, toasts, and the theme switcher.

## Prerequisites

- Rust toolchain (`rustup`)
- Node.js 24.15+ (24 LTS; 22.22.2+ also works — jsdom 30 and Vitest 5 rule out Node 20)
- pnpm (`npm i -g pnpm`)
- Platform WebView deps (macOS/Linux WebKit; Windows ships WebView2)

## Getting started

```bash
pnpm install
pnpm lefthook install     # once, to enable git hooks
pnpm tauri dev            # run the desktop app (Vite + Rust)
```

Other commands:

```bash
pnpm dev          # frontend only (browser, no native APIs)
pnpm tauri build  # production bundle (.app/.dmg/.exe/.deb/...)
pnpm check        # full gate: typecheck + lint + test + bindings drift + cargo fmt-check + clippy
pnpm test         # Vitest
```

## Project layout

```
src/                 # frontend (Vite + React)
  routes/            # TanStack Router file routes
  components/ui/     # shadcn components (edit freely)
  lib/               # invoke wrapper, logger, query client, errors, stores
src-tauri/           # Rust backend
  src/commands/      # #[tauri::command]s (the IPC surface)
  src/state/         # managed AppState
  src/error.rs       # typed AppError (mirrored in src/lib/errors.ts)
  capabilities/      # per-window permission sets (deny-by-default)
.github/workflows/   # ci.yml (gate + build) · release.yml (signed cross-platform bundles)
```

## Conventions

Read [AGENTS.md](AGENTS.md) before contributing — it documents the architecture, the
frontend↔Rust boundary, the security red lines (deny-by-default capabilities), data-directory
conventions, the error model, and the media/asset pipeline plan.

## Releasing

Tag a version to trigger the signed, cross-platform build matrix:

```bash
git tag v0.1.0 && git push --tags
```

Releases build without updater artifacts out of the box. To enable self-update before
distributing: `pnpm tauri signer generate` a keypair, fill `plugins.updater` in
`tauri.conf.json`, set `bundle.createUpdaterArtifacts` to `true`, and add the
`TAURI_SIGNING_PRIVATE_KEY(_PASSWORD)` secrets referenced in `.github/workflows/release.yml`.
