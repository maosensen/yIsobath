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
	survey: {
		label: "Survey",
		wholeDisk: "whole disk",
		home: "Home folder",
		folder: "Choose a folder…",
		pickTitle: "Choose a folder to survey",
		again: "Survey again",
		demoVolume: "Back to the demo volume",
		surveying: "Surveying",
		stopShow: "Stop and show",
		privacyNote:
			"Only names, sizes and dates are read. Nothing leaves this computer.",
		stopped: "Survey stopped early",
		unreadable: (n: string) => `${n} unreadable`,
		unreadableHint:
			"Folders macOS would not let yIsobath list. They count as empty.",
		rightClick: "right-click for Finder and Trash",
	},
	access: {
		kicker: "Before surveying",
		missing: "yIsobath does not have Full Disk Access.",
		body: "macOS will ask before it reads Desktop, Documents and Downloads, and folders that belong to other apps are skipped and counted as unreadable.",
		open: "Open Privacy Settings",
		anyway: "Survey anyway",
		restart: "After switching it on, quit and reopen yIsobath.",
		grant: "Grant access…",
	},
	item: {
		reveal: "Reveal in Finder",
		copyPath: "Copy path",
		trash: "Move to Trash…",
		copied: "Path copied",
		loose: "Loose files: actions apply to their folder",
		demo: "The demo volume has no files of its own",
	},
	trash: {
		title: (name: string) => `Move “${name}” to the Trash?`,
		rule: (title: string, risk: string) => `${title} · ${risk}`,
		space: "The space comes back when you empty the Trash.",
		confirm: "Move to Trash",
		working: "Moving…",
		done: (name: string) => `Moved “${name}” to the Trash`,
		doneHint: "Empty the Trash in Finder to get the space back.",
		failed: "Could not move it to the Trash",
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
