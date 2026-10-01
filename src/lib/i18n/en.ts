/**
 * English catalog — the structural contract (`Messages`) for every locale.
 * Keep keys grouped by domain; components read them via `T` from
 * `@/lib/text`. Grow this file as the app grows.
 */

export const en = {
	common: {
		cancel: "Cancel",
		confirm: "Confirm",
		close: "Close",
		save: "Save",
		delete: "Delete",
		loading: "Loading…",
	},
	theme: {
		light: "Light",
		dark: "Dark",
		system: "System",
	},
	home: {
		title: "Tauri + React",
		namePlaceholder: "Your name",
		greet: "Greet",
		toggleTheme: (theme: string) => `Toggle theme (${theme})`,
		playground: "UI Playground",
	},
	updates: {
		available: (version: string) => `Version ${version} is available`,
		installAction: "Install & Restart",
		installing: "Downloading update…",
		failed: "Update failed — try again later",
		upToDate: "You're on the latest version",
	},
	errorPage: {
		title: "Something Went Wrong",
		hint: "The interface hit an unexpected error. Go back home to keep working — if it persists, reload the app.",
		goHome: "Back to Home",
		reload: "Reload App",
		detailsLabel: "Error details",
	},
	changelog: {
		title: "What's New",
		subtitle: "Highlights from each release",
		back: "Back",
		current: "Current",
		kindNew: "New",
		kindImproved: "Improved",
		kindFixed: "Fixed",
	},
};
