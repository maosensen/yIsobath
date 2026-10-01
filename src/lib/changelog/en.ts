import type { ChangelogRelease } from "./index";

export const en: ChangelogRelease[] = [
	{
		version: "0.2.0",
		date: "2026-10-01",
		title: "A name of its own",
		summary:
			"The template steps out of yAssets' shadow, moves to the current toolchain, and keeps a record when something goes wrong.",
		changes: [
			{
				kind: "new",
				title: "Errors leave a trace",
				text: "Warnings and errors from the interface are written to the app's log file next to the native side's, so problems in release builds can be diagnosed.",
			},
			{
				kind: "improved",
				title: "Its own identity",
				text: "Now called yDesktopTemplate, with a bundle identifier of its own, so it no longer collides with an installed yAssets.",
			},
			{
				kind: "improved",
				title: "Current toolchain",
				text: "Built with Vite 8 and TypeScript 7, running on React 19.3 and Tauri 2.12.",
			},
			{
				kind: "fixed",
				title: "System theme",
				text: "Switching macOS between light and dark while the app is open now updates the whole interface, not just the window material.",
			},
		],
	},
	{
		version: "0.1.2",
		date: "2026-09-14",
		title: "Staying in frame",
		changes: [
			{
				kind: "fixed",
				title: "No sideways scrolling",
				text: "Wide content such as tables now scrolls inside its own panel instead of pushing the whole window sideways.",
			},
		],
	},
	{
		version: "0.1.1",
		date: "2026-07-28",
		title: "Keeping the books",
		summary:
			"A housekeeping release — the template now tracks its own feature inventory.",
		changes: [
			{
				kind: "new",
				title: "Feature ledger",
				text: "Every shipped and planned capability is recorded in a machine-readable ledger (.roadmap/features.yaml), reconciled on each release.",
			},
		],
	},
	{
		version: "0.1.0",
		date: "2026-07-10",
		title: "Hello, desktop",
		summary:
			"The first cut of the template — a production-shaped Tauri 2 + React shell, ready to build on.",
		changes: [
			{
				kind: "new",
				title: "Frosted-glass shell",
				text: "A transparent window with native vibrancy, an overlay titlebar with drag and double-click-to-zoom gestures, and window materials that follow the theme.",
			},
			{
				kind: "new",
				title: "Self-update wiring",
				text: "A silent startup check raises an Install & Restart toast. Fill in your updater key and endpoint to go live.",
			},
			{
				kind: "new",
				title: "UI playground",
				text: "The /playground route demos the in-house desktop kit — buttons, inputs, translucent dialogs and menus, context menus, toasts, and the theme switcher.",
			},
			{
				kind: "new",
				title: "Type-safe plumbing",
				text: "tauri-specta generated IPC bindings, TanStack Router and Query, an i18n copy layer, and Biome + clippy gates behind one pnpm check.",
			},
			{
				kind: "new",
				title: "This page",
				text: "Curated release notes on a timeline, rendered in the app's own UI from a typed changelog module.",
			},
		],
	},
];
