# AGENTS.md

Project conventions for AI coding agents (Claude Code, Cursor, etc.). Read this before making changes.

yIsobath is a **disk survey instrument**: a Rust walker surveys a volume or a folder, and the Isobath instrument (ported from yLookbook's `sections/isobath`) draws it as a stepped WebGL2 relief with reclaimable-space findings, Reveal in Finder and Move to Trash. It started from yDesktopTemplate v0.2.0: Tauri 2 (Rust backend) + a Vite/React/TS frontend in the WebView. Read [docs/DESIGN.md](docs/DESIGN.md) for what was ported, what changed and what is invented.

**This app moves the user's files.** The red lines for that are under "Survey & Trash red lines" below — read them before touching `src-tauri/src/survey/` or `commands/`.

## Stack

- **Shell:** Tauri 2 — Rust backend (`src-tauri/`) + WebView frontend
- **Frontend build:** Vite 8 (Rolldown) + React 19 + TypeScript 7 (strict) — **NOT Next.js.** No SSR, no server components, no server actions. This is a static SPA running in a desktop WebView.
- **Routing:** TanStack Router, file-based, under `src/routes/` — do not add react-router or hand-roll routing
- **Styling:** Tailwind CSS v4 (OKLCH tokens) + shadcn/ui (Base UI primitives; components live in-repo under `src/components/ui/`, edit them freely)
- **Lint & format:** Biome — single tool, do not add ESLint or Prettier
- **Package manager:** pnpm — do not generate `package-lock.json` or `yarn.lock`; delete them if they appear
- **Path alias:** `@/*` → `src/*`, declared once in `tsconfig.json` `paths`. Vite and Vitest read it through `resolve.tsconfigPaths`, so don't duplicate it as a `resolve.alias`.
- **TypeScript 7** is the native (Go) compiler: `baseUrl` is gone (paths resolve relative to the tsconfig), `types` defaults to `[]`, and there is no JS compiler API. A tool that needs `require("typescript")` gets `@typescript/typescript6` side by side — don't downgrade the project's `typescript`.
- **Node:** 24 LTS, 24.15 or newer (CI runs the latest 24.x). jsdom 30 needs `^22.22.2 || ^24.15` and Vitest 5 needs ≥ 22.12, so Node 20 is out.

## Standard libraries

Use these for their respective domains. Do not introduce alternatives without explicit approval.

| Domain | Library |
|---|---|
| Routing | `@tanstack/react-router` — routes under `src/routes/` |
| Async / IPC state | `@tanstack/react-query` — wrap `invoke()` calls |
| List virtualization | `@tanstack/react-virtual` — grids/lists only render the viewport |
| Native / IPC calls | generated `commands.*` from `@/lib/bindings` (+ `unwrap` from `@/lib/tauri`) |
| Logging | `pino` — import from `@/lib/logger` |
| Client state | `zustand` — stores under `src/lib/stores/` |
| IDs | `nanoid` |
| Animation | `motion` (formerly framer-motion) |
| Date / time | `date-fns` |
| Theme | custom `@/components/theme-provider` (localStorage-backed) |
| Forms | `react-hook-form` + `zod` + `@hookform/resolvers` |

**Explicitly out of scope:**
- ❌ `next` / TanStack Start — server frameworks don't belong in a Tauri WebView (that includes `next-themes`: shadcn's `sonner` template reaches for it, but ours reads `@/components/theme-provider` instead, so it is not installed)
- ❌ `axios` — use the `invoke` wrapper; react-query handles caching
- ❌ raw `fetch` to a local server for native work — write a Rust command instead
- ❌ ESLint / Prettier — Biome covers both
- ❌ `npm` / `yarn` commands — always `pnpm`
- ❌ `moment` / `dayjs` — `date-fns` only

## Architecture

### Frontend ↔ Rust boundary

- Native capability, filesystem, heavy compute → **Rust command** in `src-tauri/src/commands/`
- Frontend calls it through the generated `commands.*` from `@/lib/bindings` — fallible (`AppResult`) commands return `{ status, data | error }`, so pass them through `unwrap` from `@/lib/tauri`. The string-based `invoke<T>(cmd, args)` there is an escape hatch, not the default. Never `@tauri-apps/api` directly in components
- Wrap each call in react-query: `useQuery` for reads, `useMutation` for writes — get caching, retries, and loading state for free
- Define new Rust commands with `#[tauri::command]` + `#[specta::specta]` and add them to `collect_commands!` in `specta_builder()` (`src-tauri/src/lib.rs`) — that one list feeds both the runtime `invoke_handler` and `bindings.ts`
- App-defined commands are allowed by default; **plugin** and **core** commands must be enabled in `src-tauri/capabilities/*.json`

### Frontend layout

```
src/
├── routes/                 # TanStack Router file routes
│   ├── __root.tsx          # Root route — Providers + Toaster + update check
│   ├── index.tsx           # "/" route
│   ├── changelog.tsx       # "/changelog" — in-app What's New timeline
│   └── playground.tsx      # "/playground" — the in-house UI kit showcase
├── components/
│   ├── ui/                 # shadcn components — edit freely
│   ├── icons.ts            # THE icon registry (Solar via unplugin-icons)
│   ├── empty-state.tsx     # shared "nothing here" block
│   ├── app-error-fallback.tsx  # router defaultErrorComponent
│   ├── providers.tsx       # QueryClient + Theme
│   └── theme-provider.tsx  # localStorage + native window.setTheme sync
├── hooks/
│   ├── use-window-drag.ts  # chrome drag / long-press / dbl-click-zoom gestures
│   ├── use-update-check.ts # silent startup update toast
│   └── use-debounced-value.ts / use-element-width.ts / use-mobile.ts
├── lib/
│   ├── tauri.ts            # typed invoke wrapper + unwrap + setNativeWindowTheme
│   ├── updater.ts          # plugin-updater/process wrapper (the only import point)
│   ├── dialogs.ts          # plugin-dialog wrapper (pickDirectory / pickFiles)
│   ├── opener.ts           # plugin-opener wrapper (openExternalUrl)
│   ├── bindings.ts         # AUTO-GENERATED by tauri-specta — typed `commands.*`
│   ├── changelog/          # curated, per-locale release notes for /changelog
│   ├── i18n/               # en.ts catalog; read via `T` from @/lib/text (text.ts)
│   ├── errors.ts           # CommandError — mirrors Rust AppError
│   ├── logger.ts           # pino; forwards to the log file via log-file.ts
│   ├── query-client.ts
│   ├── stores/             # zustand stores, one file per store
│   └── utils.ts            # shadcn-generated cn()
├── test/setup.ts           # Vitest + jest-dom setup
├── main.tsx                # RouterProvider bootstrap + platform-windows class
├── index.css               # @import "tailwindcss" + shadcn tokens
└── routeTree.gen.ts        # AUTO-GENERATED by router plugin — don't edit (Biome ignores it)
```

### Window chrome

- Unlike the template, the window is **opaque** (`backgroundColor: #04070a`, no `windowEffects`, no `macOSPrivateApi`): the instrument paints edge to edge, so there is no glass to show through. The app theme defaults to dark.
- Titlebar is `Overlay` + `hiddenTitle`, with `trafficLightPosition` placing the traffic lights at the vertical middle of the instrument's 60 px top bar; `.platform-macos` (set in `main.tsx`) pads the bar for them. The top bar wires `useWindowDrag` — `onPointerDown` gives press-and-move / long-press window dragging (interactive children still work), `onDoubleClick` toggles maximize. Opt an element out with `data-no-window-drag`.
- Overlay dialogs/menus are translucent + `backdrop-blur` (see `ui/dialog.tsx`, `ui/dropdown-menu.tsx`, `ui/context-menu.tsx`, `ui/alert-dialog.tsx`).
- `ThemeProvider` persists to localStorage **and** calls `window.setTheme` so the native materials follow the app theme; `color-scheme` in `index.css` keeps native scrollbars/form controls in step. Scrollbar styling is Windows-only (`.platform-windows`) — never style WebKit scrollbars on macOS.

### Icons

Solar "Line Duotone" compiled at build time by unplugin-icons. Components import by semantic name from `@/components/icons` — never from `~icons/*` directly. Add new glyphs to that registry file.

### Copy / i18n

User-facing strings live in `src/lib/i18n/en.ts`, grouped by domain, and are read via `T` from `@/lib/text` (`T.updates.installAction`). No hardcoded user-facing copy in components (the `/playground` demos are exempt).

**Exception — the ported instrument.** `src/instrument/` keeps the copy it came with from yLookbook inline (labels, panel headings, readouts drawn on canvas): its type and spacing were tuned around those exact strings. Copy the desktop app adds (survey menu, Full Disk Access, item actions, Trash dialog, toasts) goes in `en.ts` under `survey` / `access` / `item` / `trash`.

### The instrument (`src/instrument/`)

Ported from yLookbook `src/app/sections/isobath/` (and the types / rules half of `src/lib/fixtures/isobath.ts` → `catalog.ts`, the demo generator half → `demo.ts`). Since the port, **this copy is the upstream**: nothing syncs back, and the lookbook keeps its own.

- Code style follows the port: 2-space-era files reformatted by Biome to tabs, **comments in Chinese** like the rest of those files. New code inside `src/instrument/` keeps writing comments in Chinese; code elsewhere (template files, Rust) stays English.
- `Volume` (`volume.ts`) is the model: a preorder flattening where a subtree is `[i, end[i])`. Native surveys come in through `survey.ts` (`volumeOf`) in the same `VolumeDraft` shape the demo generator emits. Flags: `F_DIR`, `F_AGG` (a folder's loose files), `F_FOLDED` (a folder shown as one piece — real path; entered by expanding it), `F_EXPANDABLE` (a folded folder that shows more than one piece when expanded — Rust decides), `F_DENIED`.
- Engine (`engine.ts`) owns the view, camera, picking and replay; React reads it through `useSyncExternalStore`. `setVolume` replays a survey; `replaceVolume` swaps in an updated survey of the same place without moving the camera (used after a move to Trash and after expanding a folded folder). The engine never calls IPC: entering a folded piece calls `engine.onExpand`, which `instrument.tsx` wires to `expand_folder`.
- The CSS is scoped under `.isobath` (`instrument.css`) and does not use Tailwind. Portals (context menu, alert dialog) render outside that scope, so they carry their own font classes (`.iso-menu`, `.iso-dialog`).
- **WKWebView, not Chrome.** The relief was tuned in Chrome; the app runs in WebKit on macOS. Already bitten: a floated `<legend>` does not sit inline in WebKit (the segmented controls use `role="radiogroup"` + a span instead). Check every layout change in the real app (see "Verifying in the real WebView").

### Self-update

`useUpdateCheck` (mounted in `__root.tsx`) checks once per launch, 5s after startup, and raises a persistent toast with an Install & Restart action. `src/lib/updater.ts` is the only place plugin-updater/plugin-process are imported. Release setup: generate a keypair with `pnpm tauri signer generate`, set `plugins.updater.pubkey` + `endpoints` in `tauri.conf.json`, and configure `TAURI_SIGNING_PRIVATE_KEY(_PASSWORD)` secrets for `release.yml`. In dev builds the check fails quietly — expected.

### UI playground (`/playground`)

The seed of the in-house desktop component kit: a translucent sidebar shell with live demos per section (buttons, inputs, dialogs, menus, toasts, theme). New shared components should land in `src/components/ui/` **and** gain a demo section here (usage + code examples welcome).

### Logging

- Import the shared logger: `import { logger } from "@/lib/logger"`
- No `console.log` in committed code — use `logger.debug` / `info` / `warn` / `error`
- Frontend logs land in the WebView console, and inside the desktop shell info-and-above is also forwarded to `tauri-plugin-log` (pino `browser.transmit` → `src/lib/log-file.ts`, the only plugin-log import point). They share the Rust side's targets — stdout plus the app log dir (`~/Library/Logs/<identifier>/` on macOS) — tagged `webview::…`. Release builds have no devtools, so this file is where a frontend failure leaves a trace

### State

- **Client-only ephemeral:** `useState` / `useReducer`
- **Cross-component client state:** zustand store under `src/lib/stores/`
- **IPC / async data:** react-query — never copy command results into zustand

## Rust backend conventions (`src-tauri/`)

### Module layout

```
src-tauri/src/
├── lib.rs            # Builder + plugin registration + setup
├── main.rs
├── commands/mod.rs   # all #[tauri::command]s
├── state/mod.rs      # managed state (AppState): the last survey, the stop flag
├── survey/
│   ├── mod.rs        # resolve a target, run a walk, keep the result (`Survey`)
│   ├── walk.rs       # parallel walk → the full in-memory tree (`Dir`)
│   ├── emit.rs       # fold the tree under the node budget → `SurveyNode`s
│   ├── classify.rs   # file types by extension, rule tags by name (mirrors the catalog's rules)
│   ├── snapshot.rs   # each place's folder sizes for the next survey, and where it grew since the last
│   └── system.rs     # data volume, boot volume name, statfs, Full Disk Access probe, Trash guard
└── error.rs          # AppError (typed, serializable, IPC-facing)
examples/survey.rs    # `cargo run --release --example survey -- <path>`: time a walk, no UI
```

- **Errors:** fallible commands return `AppResult<T>` (`Result<T, AppError>`). `AppError` is `#[serde(tag = "code", content = "detail")]` so the frontend branches on a stable `code`. Keep `src/lib/errors.ts` in sync with the variants. Internal detail goes to logs, not to the user — surface `Internal` for those.
- **Managed state:** long-lived resources (pools, caches) live in `AppState`, registered via `app.manage(...)` and injected with `tauri::State<'_, AppState>`. Never rebuild them per command.
- **Async/heavy work:** commands that walk the disk or move files are `async` and hand the work to `tauri::async_runtime::spawn_blocking`; the walk itself runs on its own `rayon` pool (IO-bound, so `2 × cores`, clamped to 8–32). Sync commands run on the main thread — keep them trivial.
- **Lint gate:** `cargo clippy -- -D warnings` must pass — warnings are errors. `cargo fmt` formatting is enforced.

### Plugins (baseline, already wired)

`single-instance` (registered **first**, desktop-only — focuses the existing window), `window-state` (desktop-only), `updater` + `process` (desktop-only, self-update), `store`, `log`, `fs`, `dialog`, `opener`. Add more with `pnpm tauri add <plugin>`, then tighten its capability.

### Security red lines (deny-by-default)

- ❌ Never `fs:default` — scope `fs` to explicit directories (`$APPDATA/**`, `$APPCACHE/**`). Widen per feature.
- ❌ Never put `shell:default` in baseline. To open URLs/files use `opener`; only reach for `shell` to execute processes, and scope it tightly.
- ✅ `opener` is limited to `allow-open-url`.
- ✅ Custom protocols (e.g. a future `thumb://`) must be scoped to the library directory.
- ✅ CSP is set in `tauri.conf.json` (no `unsafe-eval`). If `invoke`/plugin calls fail at runtime with a permission error, add the matching permission to the capability set — don't disable the security model.
- ✅ Split capabilities per window; don't let one `main` capability manage everything as the app grows.

### Data & config locations

| Data | Where |
|---|---|
| UI settings / preferences | `tauri-plugin-store` (JSON KV) → `app_config_dir()` |
| File caches (thumbnails) | disk under `app_cache_dir()` / `app_local_data_dir()` |
| User/business data | `app_data_dir()` |
| Structured data / queries | `tauri-plugin-sql` or Rust `sqlx`/`rusqlite` → `app_data_dir()` |
| Tokens / secrets | **never** `store` — use `stronghold` or the OS keychain |

Migrate `store` schemas and DB schemas with versioned migrations on startup; don't let an old config file fail to parse on upgrade.

### Type-safe IPC (tauri-specta)

`tauri-specta` generates `src/lib/bindings.ts` from the Rust commands — the IPC types cross the boundary, so a Rust signature change surfaces as a TS compile error.

- The command list lives once in `specta_builder()` in `lib.rs`; it feeds both the runtime `invoke_handler` and the bindings export.
- Annotate every command with `#[specta::specta]` (next to `#[tauri::command]`) and `#[derive(specta::Type)]` on any type in a command signature. Then add it to the `collect_commands!` in `specta_builder()`.
- `bindings.ts` regenerates on every debug run, and via the `export_bindings` test. `pnpm check:bindings` (also in CI) runs that test + `git diff --exit-code` so drift fails the pipeline, not the user's machine. **Don't hand-edit `bindings.ts`** (Biome ignores it).
- Use the generated `commands.*` for full type safety, or the logging `invoke<T>` wrapper in `@/lib/tauri`. `src/lib/errors.ts` re-exports the generated `AppError`.
- `tauri-specta`/`specta` v2 are RC and tightly coupled — versions are pinned with `=` in `Cargo.toml`; bump all three together. specta refuses to export 64-bit ints (precision) — use `f64`/`String`, or a 32-bit type.

### The survey (the app's reason to exist)

- **Read metadata only.** `read_dir` + `DirEntry::metadata` (lstat — symlinks are never followed). File contents are never opened; adding anything that reads them (content hashing for duplicates) is a design change — write it into docs/DESIGN.md first.
- **Sizes are allocated blocks** (`blocks × 512`), hard links count once (by `(dev, ino)` for `nlink > 1`), one device only (folders on another `st_dev` are skipped and counted). Keep `du` as the reference: a survey of a folder must match `du -sk` of it.
- **Nothing is silently dropped.** Unreadable folders, other devices and extra hard links are counted in `SurveyStats` and shown.
- **Fold, don't truncate.** The instrument gets at most `NODE_BUDGET` nodes; `emit::threshold` raises the fold threshold until the tree fits. `count()` and `Emitter::open()` must agree on every folder's fate (`fate()`) — the tests check node counts and byte conservation; keep them passing. Folders the user expanded (`Survey::expanded`, an `emit::Expanded` name tree) open at their own threshold, and both functions read that same tree.
- **Snapshots hold names and sizes only.** One per place in `app_data_dir()/snapshots/`, folder names, byte totals and file counts, nothing else; a partial survey is never written. Writing goes beside the old file and renames over it — no deletes. The comparison (`snapshot::change`) is computed once per survey and again after a move to the Trash, never per expansion.
- **Tags mirror the catalog.** `classify::Tag::as_str` values are what the rules in `src/instrument/catalog.ts` match. Adding a rule = a tag in Rust + a rule in the catalog, in the same commit.

### Survey & Trash red lines

- ❌ **Never delete.** No `remove_file`, `remove_dir_all`, `rm`, emptying the Trash, or any permanent deletion anywhere in the app. The only way a file leaves its place is `move_to_trash` → the `trash` crate (NSFileManager on macOS).
- ❌ Never move anything without the user's confirmation in the UI for that specific item. No batch "clean all" without a per-item review.
- ✅ Every path the frontend sends is re-checked in Rust: it must lie inside the current survey's root and pass `system::trash_refusal` (not the root, not a protected system or account folder, not already in the Trash). Widening that list of allowed paths needs a test in `system.rs`.
- ✅ After a move, update the in-memory tree (`Survey::moved_to_trash`) — do not re-walk silently, and do not pretend the space is free: in surveys that contain `~/.Trash`, the bytes move there.
- ✅ The Full Disk Access probe (`system::full_disk_access`) opens the TCC database and nothing else; it must never trigger a permission prompt.

## WebView portability

The frontend runs in different engines per OS: **WebKit** on macOS (WKWebView) and Linux (WebKitGTK), **Chromium** on Windows (WebView2). Don't assume Chrome-only CSS/JS. Test the macOS WebKit target before shipping.

### Verifying in the real WebView

`pnpm dev` in a browser shows the instrument with the demo volume but no native calls. To check the real thing:

1. `YISOBATH_SURVEY=<folder> YISOBATH_PERF=1 pnpm tauri dev` — surveys on launch and logs `{fps, frameMs, sectors, buffer, nodes}` every 5 s to `~/Library/Logs/com.maosensen.yisobath/yIsobath.log`. The first line after start is the WebGL2 report (renderer, float buffers, MSAA samples). Pick a folder outside Desktop / Documents / Downloads so macOS does not raise privacy prompts while you test.
2. Screenshot the window: find its id with `CGWindowListCopyWindowInfo` (filter by the app's pid) and `screencapture -x -o -l <id>`.
3. To click through it, cua-driver works on the WKWebView's accessibility tree (`element_index` for buttons). Pixel coordinates for `click` / `right_click` are in the window's **full-resolution** pixels (2880 wide on a 2× display), not the downscaled screenshot `get_window_state` returns.
4. Never test Move to Trash on real files — make a scratch folder with dummy files and survey that.

## Common commands

```bash
pnpm tauri dev        # Run the desktop app in dev (Vite + Rust)
pnpm dev              # Frontend only (browser, no native APIs)
pnpm tauri build      # Production bundle (.app/.dmg/.exe/.deb/...)
pnpm check            # typecheck + lint + test + rust fmt-check + clippy (the full gate)
pnpm biome check --write   # Apply lint/format fixes
```

## Before committing

`pnpm check` must pass. That runs, in order:

1. `pnpm typecheck` — `tsc --noEmit` for `src/`, then `tsc -p tsconfig.node.json` for the Vite/Vitest config files
2. `pnpm lint` — `biome check`
3. `pnpm test` — Vitest
4. `pnpm check:bindings` — regenerate `bindings.ts` and fail on drift
5. `pnpm rust:fmt:check` — `cargo fmt --check`
6. `pnpm rust:clippy` — `cargo clippy -- -D warnings`

Also: no `console.log` in committed code; new Rust commands are listed in `specta_builder()` and (if they're plugin/core calls) permissioned in `capabilities/`; no new top-level dependency without justification. The same gate runs in CI (`.github/workflows/ci.yml`), plus a `pnpm build` so bundler breakage shows up on push rather than at tag time. Lefthook runs Biome + rustfmt + clippy on staged files at commit time (`pnpm lefthook install` once).

## Feature ledger

`.roadmap/features.yaml` is this project's **feature ledger** — the single
source of truth for what exists, what's planned, and what blocks launch
(schema v1: yPulse repo `docs/feature-ledger.md`). yPulse collects it nightly.

**The one rule: completing a feature updates the ledger in the same commit.**
Set the entry's `status: done` and `completedAt: YYYY-MM-DD`; when starting
something new that has no entry, add one first. Granularity is announce-level —
one entry = one capability you could put in What's New; implementation details
go in the host entry's `note`, not into new entries. `id` values are permanent —
never rename or reuse them. Releases reconcile the ledger as a gate step
(`shippedIn` backfill happens there).

**Check it before pushing.** A ledger that fails to parse or validate takes
this whole repo out of the sync: yPulse skips the file, so these rows freeze at
their last good state while every other project keeps moving, and the CI signal
is a run that may already be red for someone else's reason. From the yPulse
checkout:

```sh
cd ../yIPulse && pnpm ledger:check   # this repo plus every sibling checkout
```

Two mistakes have each cost a repo weeks of frozen data, so they are worth
naming. Long notes must be block scalars (`note: |`) — a bare `key: value`
inside a single-line plain scalar makes YAML read it as a nested mapping, and
the whole file stops parsing. And a new `area` word has to join the file's
`areas:` list in the same edit, or every entry using it fails validation at once.
