import { describe, expect, it } from "vitest";
import type { SurveyResult } from "@/lib/bindings";
import { ISO_RULES } from "./catalog";
import { buildIsobathVolume, ISO_VOLUME } from "./demo";
import { volumeOf } from "./survey";
import { demoVolume, F_FOLDED, Volume, type VolumeDraft } from "./volume";

// 演示卷的那部分照 yLookbook 的 docs/sectionsdoc/isobath/verify.mjs;原生测量的部分是新的。

function demo() {
	return demoVolume(buildIsobathVolume().root, {
		name: ISO_VOLUME.name,
		capacity: ISO_VOLUME.capacity,
		fs: ISO_VOLUME.fs,
		role: ISO_VOLUME.role,
		device: ISO_VOLUME.device,
		home: ["Users", "ada"],
		when: ISO_VOLUME.surveyedAt,
	});
}

describe("the demo volume", () => {
	const v = demo();

	it("is deterministic", () => {
		expect(JSON.stringify(buildIsobathVolume())).toBe(
			JSON.stringify(buildIsobathVolume()),
		);
	});

	it("adds up: every folder is the sum of its children, largest first", () => {
		expect(v.bytes[0]).toBeLessThanOrEqual(v.meta.capacity);
		for (let i = 0; i < v.n; i++) {
			if (!v.isDir(i)) continue;
			const kids = v.children(i);
			const sum = kids.reduce((a, c) => a + v.bytes[c], 0);
			expect(Math.abs(sum - v.bytes[i])).toBeLessThan(0.5);
			for (let k = 1; k < kids.length; k++)
				expect(v.bytes[kids[k]]).toBeLessThanOrEqual(v.bytes[kids[k - 1]]);
		}
	});

	it("tiles each parent's angle with its children", () => {
		for (let i = 0; i < v.n; i++) {
			if (!v.isDir(i) || v.bytes[i] <= 0) continue;
			let cursor = v.a0[i];
			for (const c of v.children(i)) {
				expect(Math.abs(v.a0[c] - cursor)).toBeLessThan(1e-12);
				cursor = v.a1[c];
			}
			expect(Math.abs(cursor - v.a1[i])).toBeLessThan(1e-9);
		}
	});

	it("claims each node for at most one rule, without nesting", () => {
		let total = 0;
		for (const f of v.findings) {
			total += f.bytes;
			for (const p of f.places)
				for (const q of f.places)
					if (p !== q) expect(v.contains(p, q)).toBe(false);
		}
		expect(Math.abs(total - v.reclaimTotal)).toBeLessThan(1);
	});

	it("shows the home folder as ~", () => {
		const i = v.find("~/Library");
		expect(i).toBeGreaterThan(0);
		expect(v.path(i)).toBe("~/Library");
		expect(v.absPath(i)).toBeNull();
	});
});

/** A small tree in the shape src-tauri/src/survey/emit.rs sends. */
function nativeTree(): VolumeDraft {
	const leaf = (name: string, bytes: number, extra = {}): VolumeDraft => ({
		name,
		bytes,
		files: 1,
		dirs: 0,
		age: 10,
		type: "bin",
		...extra,
	});
	return {
		name: "github",
		bytes: 0,
		files: 0,
		dirs: 0,
		age: 0,
		type: "sys",
		children: [
			{
				name: "app",
				bytes: 0,
				files: 0,
				dirs: 0,
				age: 0,
				type: "sys",
				children: [
					leaf("node_modules", 300e6, {
						files: 40_000,
						dirs: 900,
						folded: true,
						expandable: true,
						tag: "node-modules",
						type: "src",
					}),
					leaf("bundle.bin", 20e6),
					leaf("1,204 files", 9e6, { files: 1204, agg: true, type: "src" }),
				],
			},
			leaf("notes.pdf", 4e6, { type: "doc" }),
		],
	};
}

function result(meta: Partial<SurveyResult["meta"]>): SurveyResult {
	return {
		root: nativeTree() as SurveyResult["root"],
		meta: {
			kind: "folder",
			name: "github",
			role: "Folder",
			fs: "APFS",
			device: "disk3s5",
			capacity: 2e12,
			free: 5e11,
			root: "/Users/ada/github",
			display: "~/github",
			...meta,
		},
		stats: {
			files: 41_206,
			dirs: 902,
			bytes: 333e6,
			denied: 0,
			mounts: 0,
			hardlinks: 0,
			tookMs: 1200,
			partial: false,
			nodes: 6,
			threshold: 1e6,
			fullDiskAccess: true,
		},
	};
}

describe("a native folder survey", () => {
	const v = volumeOf(result({}), "2026-10-01T10:00");

	it("reads paths from the display root and back", () => {
		const nm = v.find("~/github/app/node_modules");
		expect(nm).toBeGreaterThan(0);
		expect(v.path(nm)).toBe("~/github/app/node_modules");
		expect(v.absPath(nm)).toBe("/Users/ada/github/app/node_modules");
		expect(v.segments(nm)).toEqual(["app", "node_modules"]);
		expect(v.findSegments(["app", "node_modules"])).toBe(nm);
	});

	it("keeps folded folders real, entered only by expanding them", () => {
		const nm = v.find("~/github/app/node_modules");
		expect(v.flags[nm] & F_FOLDED).toBeTruthy();
		expect(v.isReal(nm)).toBe(true);
		expect(v.canEnter(nm)).toBe(false);
		expect(v.canExpand(nm)).toBe(true);
		expect(v.canExpand(v.find("~/github/app/bundle.bin"))).toBe(false);
		expect(ISO_RULES[v.claim[nm]].id).toBe("node-modules");
	});

	it("expands only what Rust marked, and never on the demo volume", () => {
		const tree = nativeTree();
		const app = tree.children?.[0].children ?? [];
		app[0] = { ...app[0], expandable: false };
		const plain = volumeOf(
			{ ...result({}), root: tree as SurveyResult["root"] },
			"now",
		);
		expect(plain.canExpand(plain.find("~/github/app/node_modules"))).toBe(
			false,
		);
		const demo = new Volume(nativeTree(), {
			...v.meta,
			source: "demo",
			root: undefined,
		});
		expect(demo.canExpand(demo.findSegments(["app", "node_modules"]))).toBe(
			false,
		);
	});

	it("walks a path as far as the tree goes", () => {
		const nm = v.find("~/github/app/node_modules");
		// 折叠的 node_modules 里面的路径走到它为止
		expect(v.nearest(["app", "node_modules", "react", "cjs"])).toEqual({
			i: nm,
			exact: false,
		});
		expect(v.nearest(["app", "node_modules"])).toEqual({ i: nm, exact: true });
		expect(v.nearest([])).toEqual({ i: 0, exact: true });
		expect(v.pathOf(["app", "node_modules", "react"])).toBe(
			"~/github/app/node_modules/react",
		);
		expect(v.pathOf(v.segments(nm))).toBe(v.path(nm));
	});

	it("carries what changed since the last survey", () => {
		expect(v.meta.change).toBeUndefined();
		const again = volumeOf(
			{
				...result({}),
				change: {
					since: 1_790_000_000_000,
					was: 300e6,
					places: [
						{
							path: ["app", "node_modules"],
							was: 280e6,
							now: 300e6,
							new: false,
						},
					],
				},
			},
			"now",
		);
		expect(again.meta.change?.was).toBe(300e6);
		expect(again.meta.change?.places[0].path).toEqual(["app", "node_modules"]);
	});

	it("points loose files at their folder", () => {
		const app = v.find("~/github/app");
		const loose = v.children(app).find((c) => v.isAgg(c)) ?? -1;
		expect(v.isReal(loose)).toBe(false);
		expect(v.absPath(loose)).toBe("/Users/ada/github/app");
	});

	it("uses the folder's own size as its scale", () => {
		expect(v.meta.capacity).toBe(333e6);
		expect(v.meta.source).toBe("folder");
	});
});

describe("a native volume survey", () => {
	const v = volumeOf(
		result({
			kind: "volume",
			name: "Macintosh HD",
			role: "Data",
			root: "/System/Volumes/Data",
			display: "Macintosh HD",
			home: ["app"],
		}),
		"2026-10-01T10:00",
	);

	it("measures against the volume and shows home as ~", () => {
		expect(v.meta.capacity).toBe(2e12);
		expect(v.meta.free).toBe(5e11);
		const nm = v.find("~/node_modules");
		expect(v.path(nm)).toBe("~/node_modules");
		expect(v.path(v.find("/notes.pdf"))).toBe("/notes.pdf");
		expect(v.absPath(nm)).toBe("/System/Volumes/Data/app/node_modules");
	});
});

describe("Volume itself", () => {
	it("survives an empty survey", () => {
		const v = new Volume(
			{
				name: "empty",
				bytes: 0,
				files: 0,
				dirs: 0,
				age: 0,
				type: "sys",
				children: [],
			},
			{
				name: "empty",
				capacity: 1,
				fs: "Folder",
				role: "Folder",
				device: "",
				source: "folder",
				when: "2026-10-01T10:00",
			},
		);
		expect(v.n).toBe(1);
		expect(v.findings).toEqual([]);
	});
});
