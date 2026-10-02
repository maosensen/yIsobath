/**
 * English catalog — the structural contract (`Messages`) for every locale.
 * Keep keys grouped by domain; components read them via `T` from
 * `@/lib/text`. `zh.ts` and `ja.ts` mirror this shape exactly.
 *
 * Functions take numbers already formatted (`fmt.bytes`, `fmt.count`) as
 * strings, plus the raw count where English needs it for a plural.
 *
 * The instrument's own copy (`iso`, `types`, `risks`, `rules`, `age`) came
 * from yLookbook with its type and spacing tuned around these English
 * strings; translations should stay about as short.
 */

import type { Refusal } from "@/lib/bindings";

/** A reclaimable-space rule's words. `how` is for rules with no command to
 *  copy: where in an app the cleanup lives. */
export type RuleCopy = { title: string; blurb: string; how?: string };

const rules = {
	trash: {
		title: "Trash",
		blurb:
			"Everything already thrown away, still holding its space until the Trash is emptied.",
		how: "Finder › Empty Trash",
	},
	"xcode-build": {
		title: "Xcode build products",
		blurb:
			"DerivedData and preview caches: indexes, intermediates and products that Xcode rebuilds on the next build.",
	},
	simulators: {
		title: "Simulators on retired runtimes",
		blurb:
			"Simulator devices and runtime images for OS versions no scheme targets any more.",
	},
	"device-support": {
		title: "Symbols for old iOS versions",
		blurb:
			"Debug symbols copied from devices running iOS versions from more than a year ago. Xcode copies them again if one of those devices is plugged in.",
	},
	"node-modules": {
		title: "Dependency folders",
		blurb:
			"Every project's node_modules. One install puts them back from the package store in seconds.",
	},
	"build-output": {
		title: "Build output",
		blurb:
			"target, .next, .turbo, dist and release folders — everything a build step writes and can write again.",
	},
	"pkg-caches": {
		title: "Package manager caches",
		blurb:
			"Homebrew, pip, uv, npm, Yarn, Bun, Cargo and Go keep every version they ever downloaded.",
	},
	"app-caches": {
		title: "Browser and app caches",
		blurb:
			"Media caches, service workers and render caches from Resolve, Adobe, Lightroom, Spotify, Chrome and friends.",
		how: "Each app’s own ‘Clear cache’ setting",
	},
	"render-media": {
		title: "Final Cut render and proxy media",
		blurb:
			"Render files and proxy media inside Final Cut libraries. Final Cut renders them again when needed.",
		how: "Final Cut Pro › File › Delete Generated Library Files",
	},
	docker: {
		title: "Docker’s virtual disk",
		blurb:
			"A sparse disk image that grows as images are pulled and never shrinks on its own. Roughly 70% of it is unused layers.",
	},
	installers: {
		title: "Installers left in Downloads",
		blurb: "Disk images, packages and ISOs that already did their job.",
	},
	logs: {
		title: "Logs and crash reports",
		blurb: "Diagnostic reports and rotated logs.",
	},
	duplicates: {
		title: "Same weights, downloaded twice",
		blurb:
			"Byte-identical model files in more than one place — a Hugging Face cache, a local copy, another runtime’s store. Keep one.",
	},
	stale: {
		title: "Large files untouched for two years",
		blurb:
			"Files over 1 GB nobody has opened or written since at least two years before the survey.",
	},
} satisfies Record<string, RuleCopy>;

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
	language: {
		label: "Language",
	},
	/** The macOS app menu (`src-tauri/src/menu.rs` lays it out). macOS's own
	 *  wording, so it reads like every other app's menu. */
	menu: {
		about: "About yIsobath",
		services: "Services",
		hide: "Hide yIsobath",
		hideOthers: "Hide Others",
		quit: "Quit yIsobath",
		file: "File",
		closeWindow: "Close Window",
		edit: "Edit",
		undo: "Undo",
		redo: "Redo",
		cut: "Cut",
		copy: "Copy",
		paste: "Paste",
		selectAll: "Select All",
		view: "View",
		fullscreen: "Enter Full Screen",
		window: "Window",
		minimize: "Minimize",
		zoom: "Zoom",
		help: "Help",
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
		expandFailed: "Could not open this folder",
		demo: "The demo volume has no files of its own",
	},
	change: {
		title: "Since the last survey",
		since: (when: string) => `Since ${when}`,
		/** date-fns pattern for `since`. */
		dateFormat: "MMM d, HH:mm",
		first: "First survey of this place. The next one will show what grew.",
		partial:
			"This survey stopped early, so it is not compared with the last one.",
		net: (was: string, now: string, ago: string) =>
			`${was} → ${now} since the last survey, ${ago}.`,
		none: "No folder grew enough to stand out.",
		new: "new",
	},
	trash: {
		title: (name: string) => `Move “${name}” to the Trash?`,
		size: (bytes: string, files: string, count: number) =>
			`${bytes} · ${files} ${count === 1 ? "file" : "files"}`,
		rule: (title: string, risk: string) => `${title} · ${risk}`,
		space: "The space comes back when you empty the Trash.",
		confirm: "Move to Trash",
		working: "Moving…",
		done: (name: string) => `Moved “${name}” to the Trash`,
		doneHint: "Empty the Trash in Finder to get the space back.",
		failed: "Could not move it to the Trash",
	},
	errors: {
		busy: "A survey is already running.",
		internal: "Something went wrong.",
		notFound: (what: string) => `Not found: ${what}`,
		refused: {
			"no-survey": "Nothing has been surveyed yet.",
			"not-absolute": "Not a full path.",
			"outside-survey": "Not inside the surveyed folder.",
			protected: "A folder the system or your account depends on.",
			system: "Part of the system.",
			"in-trash": "Already in the Trash.",
		} satisfies Record<Refusal, string>,
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

	// ---------- The instrument ----------
	iso: {
		tag: "Volume survey",
		/** Shown after a place name: "Macintosh HD — Data". */
		role: { data: "Data", home: "Home folder", folder: "Folder" },
		phase: {
			boot: "Calibrating",
			survey: "Surveying",
			complete: "Survey complete",
		},
		lens: {
			label: "Lens",
			survey: "Survey",
			type: "Type",
			age: "Age",
			reclaim: "Reclaim",
		},
		view: { label: "View", orbit: "Orbit", plan: "Plan" },
		legend: {
			today: "today",
			sixYears: "6 yr +",
			ageNote: "median age of each folder, by bytes",
			none: "none",
			all: "all of it",
			reclaimNote: "share of each folder that can be reclaimed",
			folder: "folder",
			file: "file",
			loose: "loose files",
			lines: "1 line = 2,000 files",
		},
		chip: {
			demoTitle: (host: string, when: string) =>
				`Demo volume, recorded on ${host} at ${when}`,
			demo: "demo",
			free: (bytes: string) => `${bytes} free`,
			/** A folder survey's chip: its size and what it is. */
			folder: (bytes: string, role: string) =>
				`${bytes} · ${role.toLowerCase()}`,
		},
		scanRead: (files: string, folders: string, bytes: string) =>
			`${files} files · ${folders} folders · ${bytes}`,
		statusRead: (clock: string, files: string) => `${clock} · ${files} files`,
		skip: "Skip",
		replay: "Replay",
		zoomOut: "Zoom out",
		zoomIn: "Zoom in",
		resetCamera: "Reset camera",
		hint: "Click a terrace to enter · click the hub to go up · drag to orbit",
		telemetry: { frame: "Frame", sectors: "Sectors", buffer: "Buffer" },
		noWebgl:
			"This instrument draws with WebGL2, which this computer’s WebView did not provide.",
		relief:
			"Volume relief. Arrow keys move between folders, Enter opens a folder, Escape goes up a level. Drag to orbit.",
		announce: (name: string, bytes: string, share: string, of: string) =>
			`${name}, ${bytes}, ${share} of ${of}`,
		announceOpen: "Press Enter to open.",

		actions: {
			survey: "This survey",
			folder: "This folder",
			finder: "Finder",
			copyPath: "Copy path",
			trash: "Trash…",
			trashTitle: "Move to Trash (⌘⌫)",
		},
		focus: {
			title: "Focus",
			share: "Share",
			files: "Files",
			folders: "Folders",
			age: "Age",
			reclaim: "Reclaim",
			mostly: "Mostly",
			composition: "Composition",
			listing: "listing…",
			largest: "Largest inside",
			items: (n: number) => `${n} items`,
		},
		search: {
			label: "Find by name",
			waiting: "Find — after the survey",
			none: "No names match",
			/** `{b}` is where the (bold) number goes. */
			matches: (count: number) => `{b} ${count === 1 ? "match" : "matches"}`,
		},
		rate: {
			unit: "entries / s",
			peak: (n: string) => `peak ${n}`,
		},
		log: {
			title: "Survey",
			calibrating: "Calibrating",
			listed: "Listed",
			files: "Files",
			folders: "Folders",
			log: "Survey log",
			replaying: (name: string, when: string) =>
				`Replaying a survey of ${name} recorded ${when}.`,
			surveyed: (root: string, when: string) =>
				`Surveyed ${root} on ${when}; only names, sizes and dates were read.`,
			sweep:
				"Folders rise as they are listed; the sweep follows directory order, largest first.",
		},
		findings: {
			label: "Reclaimable space",
			title: "Reclaimable",
			count: (n: number) => `${n} findings`,
			inUse: (share: string, used: string, freeAfter: string) =>
				`${share} of the ${used} in use · free after: ${freeAfter}`,
			ofVolume: (share: string, used: string, freeAfter: string) =>
				`${share} of the ${used} surveyed · free after: ${freeAfter}`,
			ofFolder: (share: string, used: string, root: string) =>
				`${share} of the ${used} in ${root}`,
			none: "Nothing here matches a rule: no dependency folders, build output, caches, installers, duplicates or large files left alone for two years.",
			places: (n: number) => `${n} ${n === 1 ? "place" : "places"}`,
			copy: "Copy",
			copied: "Copied",
			more: (n: number) => `and ${n} more`,
			counted: (pct: number, gross: string) =>
				`Counted at ${pct}% of ${gross}.`,
		},
		strata: {
			title: "Age strata",
			scale: "last modified · √ bytes",
			/** `{b}` is where the (bold) bytes go. */
			inSelection: (share: string, of: string) =>
				`{b} in selection · ${share} of ${of}`,
			untouched: (share: string, of: string) =>
				`{b} untouched for a year · ${share} of ${of}`,
			survey: "survey",
			volume: "volume",
			clear: "Clear",
			slider: "Filter by last-modified age. Drag to select a range.",
			range: (from: number, to: number) => `${from} to ${to} quarters ago`,
			noFilter: "no filter",
			older: "older",
		},
		crumbs: "Path",
		/** The piece that stands for a folder's loose files, named by count. */
		loose: {
			files: (n: string, count: number) =>
				`${n} ${count === 1 ? "file" : "files"}`,
			folders: (n: string, count: number) =>
				`${n} ${count === 1 ? "folder" : "folders"}`,
		},

		/** Drawn on the canvas: the hub readout and the hover callout. Kickers
		 *  and names are set in capitals there. */
		hub: {
			calibrating: "CALIBRATING",
			surveying: "SURVEYING",
			files: (n: string) => `${n} files`,
			ofThe: (share: string, folder: boolean) =>
				`${share} of the ${folder ? "survey" : "volume"}`,
			of: (share: string, folder: boolean) =>
				`${share} of ${folder ? "survey" : "volume"}`,
			ofView: (share: string) => `${share} of view`,
			filesFolders: (files: string, folders: string) =>
				`${files} files · ${folders} folders`,
		},
		callout: {
			loose: "LOOSE FILES",
			folder: "FOLDER",
			folderEnter: "FOLDER · CLICK TO ENTER",
			file: "FILE",
			reclaimable: (rule: string) => `RECLAIMABLE · ${rule.toUpperCase()}`,
			modified: (age: string) => `modified ${age} ago`,
			modifiedToday: "modified today",
		},
	},
	/** The ten file types; their three-letter codes stay as they are. The
	 *  focus panel gives a name about 100 px: keep CJK names to 6–7 characters. */
	types: {
		vid: "Video",
		img: "Images",
		aud: "Audio",
		mdl: "Model weights",
		src: "Code & dependencies",
		bin: "Apps & build products",
		vmi: "Disk images & VMs",
		arc: "Archives & installers",
		doc: "Documents",
		sys: "System & support",
	},
	risks: {
		regenerates: {
			label: "Regenerates",
			hint: "The tool that made it puts it back on demand.",
		},
		review: {
			label: "Review",
			hint: "Yours to decide; nothing rebuilds it for you.",
		},
		final: {
			label: "Final",
			hint: "Already thrown away once. Emptying it is permanent.",
		},
	},
	rules: rules as Record<keyof typeof rules, RuleCopy>,
	/** How long ago a file was last modified, short: "3 d", "5 wk". */
	age: {
		today: "today",
		days: (n: number) => `${n} d`,
		weeks: (n: number) => `${n} wk`,
		months: (n: number) => `${n} mo`,
		years: (n: string) => `${n} yr`,
	},
};
