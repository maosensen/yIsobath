import type { ChangelogRelease } from "./index";

/** Curated release notes, newest first. */
export const en: ChangelogRelease[] = [
	{
		version: "0.1.0",
		date: "2026-10-01",
		title: "Survey your own disk",
		summary:
			"The Isobath instrument from the lookbook, now drawing your real disk, and helping you clear it.",
		changes: [
			{
				kind: "new",
				title: "A whole volume or any folder",
				text: "A parallel walk reads names, on-disk sizes and dates, never what is inside a file, and matches du to the byte. Folders macOS will not list are counted, not silently dropped.",
			},
			{
				kind: "new",
				title: "Go into folded folders",
				text: "Small folders fold into one piece so a whole volume stays smooth. Click one and it opens at its own scale, without walking the disk again.",
			},
			{
				kind: "new",
				title: "See what grew",
				text: "Each survey leaves a snapshot of folder sizes, so the next survey of the same place names where the space went in between.",
			},
			{
				kind: "new",
				title: "Trash, never delete",
				text: "Every move asks first and shows the rule that flagged it. The survey's root, system folders and your account's own folders are refused.",
			},
		],
	},
];
