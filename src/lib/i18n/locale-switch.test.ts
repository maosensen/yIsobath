import { afterEach, describe, expect, test } from "vitest";
import { ISO_RULES, ruleCopy } from "@/instrument/catalog";
import * as fmt from "@/instrument/format";
import { systemLocale } from "@/lib/stores/locale-store";
import { errorText } from "@/lib/survey";
import { en } from "./en";
import { getLocale, localeCodes, type Messages, setLocale, T } from "./index";
import { ja } from "./ja";
import { zh } from "./zh";

// Runtime tests for the T proxy resolving against the active locale.
// Structural completeness (every locale has every key) is already guaranteed
// at compile time by `Messages`; these check that a switch takes effect and
// that translations did not drop anything the code relies on.

afterEach(() => setLocale("en"));

const catalogs: Record<string, Messages> = { en, zh, ja };

test("ships English, Chinese and Japanese", () => {
	expect([...localeCodes].sort()).toEqual(["en", "ja", "zh"]);
});

test("T resolves against the active locale, live", () => {
	expect(T.survey.label).toBe("Survey");
	setLocale("zh");
	expect(getLocale()).toBe("zh");
	expect(T.survey.label).toBe("测量");
	setLocale("ja");
	expect(T.survey.label).toBe("測量");
	expect(T.trash.title("node_modules")).toBe(
		"「node_modules」をゴミ箱に入れますか？",
	);
});

test("the instrument's own copy follows the locale", () => {
	const rule = ISO_RULES.find((r) => r.id === "trash");
	if (!rule) throw new Error("no trash rule");
	expect(ruleCopy(rule).command).toBe("Finder › Empty Trash");
	expect(fmt.age(21)).toBe("3 wk");
	setLocale("zh");
	expect(ruleCopy(rule).command).toBe("访达 › 清倒废纸篓");
	expect(fmt.age(21)).toBe("3 周");
	setLocale("ja");
	expect(fmt.age(0.2)).toBe("今日");
	// A shell command is the same in every language
	const docker = ISO_RULES.find((r) => r.id === "docker");
	expect(docker && ruleCopy(docker).command).toBe("docker system prune -a");
});

test("refusals from Rust are worded in the UI language", () => {
	const err = { code: "Refused", detail: "in-trash" };
	expect(errorText(err)).toBe("Already in the Trash.");
	setLocale("zh");
	expect(errorText(err)).toBe("已经在废纸篓里了。");
	setLocale("ja");
	expect(errorText({ code: "NotFound", detail: "/x/y" })).toBe(
		"見つかりません：/x/y",
	);
});

describe.each(Object.entries(catalogs))("%s catalog", (_, m) => {
	test("keeps the {b} marker where a bold number goes", () => {
		for (const text of [
			m.iso.search.matches(1),
			m.iso.search.matches(5),
			m.iso.strata.inSelection("3%", "x"),
			m.iso.strata.untouched("3%", "x"),
		])
			expect(text.split("{b}")).toHaveLength(2);
	});

	test("has no empty strings", () => {
		const empty: string[] = [];
		const walk = (o: unknown, path: string) => {
			if (typeof o === "string") {
				if (!o.trim()) empty.push(path);
			} else if (typeof o === "function") {
				const out = (o as (...a: unknown[]) => unknown)("1", "2", "3");
				if (typeof out !== "string" || !out.trim()) empty.push(path);
			} else if (o && typeof o === "object")
				for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
		};
		walk(m, "");
		expect(empty).toEqual([]);
	});

	test("words every rule", () => {
		for (const rule of ISO_RULES) {
			const c = m.rules[rule.id];
			expect(c.title && c.blurb).toBeTruthy();
			// Where English says in which app the cleanup lives, so does every locale
			expect(!!c.how).toBe(!!en.rules[rule.id].how);
		}
	});
});

test("first launch follows the first system language we ship", () => {
	expect(systemLocale(["ja-JP", "zh-Hans-JP"])).toBe("ja");
	expect(systemLocale(["zh-Hans-CN"])).toBe("zh");
	expect(systemLocale(["fr-FR", "zh-TW"])).toBe("zh");
	expect(systemLocale(["de-DE"])).toBe("en");
	expect(systemLocale([])).toBe("en");
});
