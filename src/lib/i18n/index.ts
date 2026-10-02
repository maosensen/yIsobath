/**
 * i18n runtime. `T` resolves copy for the *active* locale; the message shape of
 * the English catalog (`./en`) is the `Messages` contract every locale must
 * satisfy, so a missing or misspelled key in `zh.ts` / `ja.ts` is a compile
 * error. Adding a locale is "clone en.ts, translate, register here".
 *
 * The active locale is chosen in `@/lib/stores/locale-store` (persisted, first
 * launch follows the system language); this module only holds it.
 */

import type { Locale } from "date-fns";
import { enUS, ja as jaDates, zhCN } from "date-fns/locale";
import { en } from "./en";
import { ja } from "./ja";
import { zh } from "./zh";

/** The structural contract for a locale catalog (derived from English). */
export type Messages = typeof en;

/** Registered locales. Add a translation by listing its `Messages`-typed
 *  catalog here. */
const locales = { en, zh, ja } satisfies Record<string, Messages>;

export type LocaleCode = keyof typeof locales;

/** All registered locale codes, in registration order. */
export const localeCodes = Object.keys(locales) as LocaleCode[];

/** Each language's name in its own script — the same whatever the UI language. */
export const LANGUAGE_NAMES: Record<LocaleCode, string> = {
	en: "English",
	zh: "中文",
	ja: "日本語",
};

/** BCP 47 tag for `<html lang>`. WebKit picks CJK glyphs by it (Han
 *  unification: the same code point is drawn differently in Chinese and
 *  Japanese), and the CSS switches font fallbacks on `:lang()`. */
export const LANG_TAGS: Record<LocaleCode, string> = {
	en: "en",
	zh: "zh-Hans",
	ja: "ja",
};

const DATE_LOCALES: Record<LocaleCode, Locale> = {
	en: enUS,
	zh: zhCN,
	ja: jaDates,
};

let active: LocaleCode = "en";

/** Switch the active locale. This does not re-render anything by itself:
 *  components re-read `T` when they render, and the locale store is what
 *  makes them render (see `useLocale`). */
export function setLocale(code: LocaleCode): void {
	active = code;
}

export function getLocale(): LocaleCode {
	return active;
}

/** date-fns locale for the active UI language. */
export function dateLocale(): Locale {
	return DATE_LOCALES[active];
}

/**
 * Copy accessor. A shallow proxy so each `T.<group>` read resolves against the
 * current locale at call time (not import time) — `setLocale()` therefore
 * affects all subsequent reads. The call shape (`T.group.key` /
 * `T.group.fn(...)`) is identical to a plain object, so consumers are unaware
 * of the indirection. Never hold on to `T.group` across renders.
 */
export const T: Messages = new Proxy({} as Messages, {
	get(_target, prop) {
		return (locales[active] as Record<PropertyKey, unknown>)[prop];
	},
});
