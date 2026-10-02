/**
 * UI language — the active locale for the `T` copy accessor.
 *
 * Persisted to localStorage (synchronous hydration, so the first paint is
 * already in the right language). Changing it updates the i18n runtime and
 * `<html lang>` first, then the store, so every component that re-renders on
 * the change reads the new strings.
 *
 * Unlike the template this came from, a switch does not remount the tree: the
 * instrument holds the current survey, and a remount would drop it for the
 * demo volume. Components that read `T` re-render through `useLocale()`
 * instead; the engine is told separately, to redraw its canvas.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
	setLocale as applyLocale,
	LANG_TAGS,
	type LocaleCode,
	localeCodes,
} from "@/lib/i18n";

/** First launch (nothing persisted): the first of the system's preferred
 *  languages that we ship, else English. Entries look like "ja-JP",
 *  "zh-Hans-JP", "en-US"; our codes are the bare language subtags. */
export function systemLocale(
	preferred: readonly string[] = navigator.languages ?? [navigator.language],
): LocaleCode {
	for (const tag of preferred) {
		const prefix = tag.toLowerCase().split("-")[0];
		const code = localeCodes.find((c) => c === prefix);
		if (code) return code;
	}
	return "en";
}

function apply(code: LocaleCode) {
	applyLocale(code);
	if (typeof document !== "undefined")
		document.documentElement.lang = LANG_TAGS[code];
}

type LocaleState = {
	locale: LocaleCode;
	setLocale: (code: LocaleCode) => void;
};

export const useLocaleStore = create<LocaleState>()(
	persist(
		(set) => ({
			locale: systemLocale(),
			setLocale: (code) => {
				apply(code); // the runtime first, so the re-render reads the new copy
				set({ locale: code });
			},
		}),
		{
			name: "yisobath-locale",
			// Keep the runtime in step with a persisted value right after
			// hydration, before React first renders.
			onRehydrateStorage: () => (state) => {
				if (!state) return;
				// A language this build no longer ships falls back like a first launch
				if (localeCodes.includes(state.locale)) apply(state.locale);
				else state.setLocale(systemLocale());
			},
		},
	),
);

// The first launch persists nothing, so onRehydrateStorage has no value to
// apply: sync the runtime to the store's initial locale here.
apply(useLocaleStore.getState().locale);

/** The active locale. Calling it makes a component re-render on a switch. */
export function useLocale(): LocaleCode {
	return useLocaleStore((s) => s.locale);
}
