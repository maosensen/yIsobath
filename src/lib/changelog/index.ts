/**
 * User-facing changelog — curated, categorized release highlights rendered by
 * the /changelog route, distinct from the developer CHANGELOG.md (which tracks
 * every change for the GitHub release notes).
 *
 * Keep this in sync on release: add one entry per shipped version in every
 * locale file. Every release needs a headline `title` (plus an optional
 * `summary`); changes usually carry a short row `title` too — and the `text`
 * should not start with that title, or the rendered row reads twice.
 */

import { getLocale } from "@/lib/text";
import { en } from "./en";

/** Change category — drives the colored tag on each row. `kind` is
 *  language-independent, so it stays identical across locale files. */
export type ChangeKind = "new" | "improved" | "fixed";

export type ChangelogChange = {
	kind: ChangeKind;
	/** One-sentence description of the change. */
	text: string;
	/** Short feature name shown as the row heading. */
	title?: string;
};

export type ChangelogRelease = {
	version: string;
	/** ISO date (YYYY-MM-DD). */
	date: string;
	/** Curated, user-facing changes for this release. */
	changes: ChangelogChange[];
	/** Release headline (e.g. "Hello, desktop"). */
	title: string;
	/** Optional one-paragraph framing shown under the headline. */
	summary?: string;
};

const byLocale = { en };

/** Changelog for the active UI locale (falls back to English). */
export function getChangelog(): ChangelogRelease[] {
	return byLocale[getLocale()] ?? en;
}
