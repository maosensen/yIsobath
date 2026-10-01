/**
 * The "Reduce motion" system setting, live.
 *
 * motion's `useReducedMotion()` reads the media query once on mount and never
 * re-renders when the setting changes, so the instrument (which pauses its
 * replay, camera drift and dust when motion is reduced) subscribes to
 * `matchMedia` directly. Ported from yLookbook's `use-reduced-motion.ts`.
 */

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

let media: MediaQueryList | null | undefined;
function query() {
	if (media === undefined) {
		media =
			typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : null;
	}
	return media;
}

function subscribe(onChange: () => void) {
	const mql = query();
	mql?.addEventListener("change", onChange);
	return () => mql?.removeEventListener("change", onChange);
}

function getSnapshot() {
	return query()?.matches ?? false;
}

export function useReducedMotionSafe(): boolean {
	return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
