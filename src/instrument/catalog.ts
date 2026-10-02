/**
 * The instrument's vocabulary: units, the ten file types, the tree shape a survey
 * hands to `Volume`, and the reclaimable-space rules with their risk levels.
 *
 * Ported from yLookbook's Isobath section (`src/lib/fixtures/isobath.ts`, the
 * types and rules half). The rules match on `tag`s that the native survey in
 * `src-tauri/src/survey/` puts on folders and files; the demo volume
 * (`demo.ts`) carries the same tags from its generators.
 *
 * 文字(类型名、风险等级、规则的标题与说明)不在这里:它们按语言放在
 * `src/lib/i18n/{en,zh,ja}.ts` 的 `types` / `risks` / `rules` 里,经下面的
 * `typeLabel` / `riskCopy` / `ruleCopy` 读。
 */

import type { RuleCopy } from "@/lib/i18n/en";
import { type Messages, T } from "@/lib/text";

// ---------- 单位 ----------

export const KB = 1e3;
export const MB = 1e6;
export const GB = 1e9;
export const TB = 1e12;

// ---------- 文件类型 ----------

export const ISO_TYPE_KEYS = [
	"vid",
	"img",
	"aud",
	"mdl",
	"src",
	"bin",
	"vmi",
	"arc",
	"doc",
	"sys",
] as const;
export type IsoType = (typeof ISO_TYPE_KEYS)[number];

/** 三个字母的代号各语言通用;名字见 `typeLabel`。 */
export const ISO_TYPES: Record<IsoType, { code: string }> = {
	vid: { code: "VID" },
	img: { code: "IMG" },
	aud: { code: "AUD" },
	mdl: { code: "MDL" },
	src: { code: "SRC" },
	bin: { code: "BIN" },
	vmi: { code: "VMI" },
	arc: { code: "ARC" },
	doc: { code: "DOC" },
	sys: { code: "SYS" },
};

/** 类型在当前语言里的名字。 */
export const typeLabel = (k: IsoType) => T.types[k];

// ---------- 树 ----------

export interface IsoDraft {
	name: string;
	/** 目录才有;叶子没有。 */
	children?: IsoDraft[];
	/** 叶子的字节数(目录由子项相加)。 */
	bytes: number;
	/** 叶子代表了多少个文件(单个文件为 1)。 */
	files: number;
	/** 聚合叶子里还藏着多少个子目录。 */
	dirs: number;
	/** 叶子距测量时多少天没动过。 */
	age: number;
	type: IsoType;
	/** 一堆小文件的聚合,不是一个真文件。 */
	agg?: boolean;
	/** 内容相同的文件共用一个键(重复下载的模型)。 */
	dup?: string;
	/** 生成器留给规则的记号。 */
	tag?: string;
	/** 只读的系统卷,不参与回收。 */
	sealed?: boolean;
}

// ---------- 可回收空间的规则 ----------

export type IsoRisk = "regenerates" | "review" | "final";

/** 风险等级在当前语言里的名字与一句说明。 */
export const riskCopy = (r: IsoRisk) => T.risks[r];

/** 规则看见的一个节点:名字、从卷根起的路径、生成器的记号。 */
export interface IsoRuleNode {
	name: string;
	path: readonly string[];
	tag?: string;
	dir: boolean;
	/** 一堆小文件的聚合。 */
	agg: boolean;
	bytes: number;
	age: number;
	type: IsoType;
}

/** 每条规则的 id 都要在各语言的 `rules` 里有文字(少了就编译不过)。 */
export type RuleId = keyof Messages["rules"];

export interface IsoRule {
	id: RuleId;
	risk: IsoRisk;
	/** 实际能拿回来的比例(Docker 的稀疏盘只能收回一部分)。 */
	recover?: number;
	/** 清理的命令(各语言通用);没有的话,文字里的 `how` 说明在哪里手动处理。 */
	command?: string;
	/** 命中即整棵子树归这条规则,不再往下看。 */
	match: (n: IsoRuleNode) => boolean;
}

const under = (n: IsoRuleNode, ...segments: string[]) => {
	for (let i = 0; i + segments.length <= n.path.length; i++) {
		let ok = true;
		for (let k = 0; k < segments.length && ok; k++)
			ok = n.path[i + k] === segments[k];
		if (ok) return true;
	}
	return false;
};

/**
 * 按优先级排:同一个文件只归第一条命中的规则(废纸篓里的 node_modules 算废纸篓,
 * 不算依赖目录)。「重复的模型」「两年没动的大文件」按文件判断,放在最后。
 */
export const ISO_RULES: IsoRule[] = [
	{
		id: "trash",
		risk: "final",
		match: (n) => n.tag === "trash",
	},
	{
		id: "xcode-build",
		risk: "regenerates",
		command: "rm -rf ~/Library/Developer/Xcode/DerivedData",
		match: (n) => n.tag === "derived-data" || n.tag === "xcode-previews",
	},
	{
		id: "simulators",
		risk: "review",
		command: "xcrun simctl delete unavailable",
		match: (n) =>
			!!n.tag &&
			(n.tag.startsWith("sim-retired") || n.tag.startsWith("sim-runtime-old")),
	},
	{
		id: "device-support",
		risk: "regenerates",
		command: "rm -rf ~/Library/Developer/Xcode/iOS\\ DeviceSupport/*",
		match: (n) => n.tag === "device-support-old",
	},
	{
		id: "node-modules",
		risk: "regenerates",
		command: "pnpm install",
		match: (n) => n.tag === "node-modules",
	},
	{
		id: "build-output",
		risk: "regenerates",
		command: "cargo clean · rm -rf .next .turbo dist",
		match: (n) => n.tag === "build",
	},
	{
		id: "pkg-caches",
		risk: "regenerates",
		command:
			"brew cleanup --prune=all · uv cache clean · npm cache clean --force · go clean -cache",
		match: (n) => n.tag === "pkg-cache",
	},
	{
		id: "app-caches",
		risk: "regenerates",
		match: (n) => n.tag === "app-cache",
	},
	{
		id: "render-media",
		risk: "regenerates",
		match: (n) =>
			n.dir &&
			(n.name === "Render Files" || n.name === "Transcoded Media") &&
			under(n, "Final Cut Libraries"),
	},
	{
		id: "docker",
		risk: "review",
		recover: 0.7,
		command: "docker system prune -a",
		match: (n) => n.tag === "docker-raw",
	},
	{
		id: "installers",
		risk: "review",
		match: (n) => n.tag === "installer",
	},
	{
		id: "logs",
		risk: "regenerates",
		match: (n) => n.tag === "logs",
	},
	{
		id: "duplicates",
		risk: "review",
		match: () => false,
	},
	{
		id: "stale",
		risk: "review",
		// 照片图库里的老视频是回忆,不是垃圾
		match: (n) =>
			!n.dir &&
			!n.agg &&
			n.bytes >= GB &&
			n.age >= 730 &&
			!under(n, "Photos Library.photoslibrary"),
	},
];

/** 一条规则在当前语言里的标题、说明,和面板上给复制的那一行(命令,或者手动处理的位置)。 */
export function ruleCopy(rule: IsoRule): {
	title: string;
	blurb: string;
	command?: string;
} {
	const c: RuleCopy = T.rules[rule.id];
	return { title: c.title, blurb: c.blurb, command: rule.command ?? c.how };
}

/** 年龄的刻度:按季度,六年;再往前的并进最后一格。 */
export const ISO_AGE_BUCKETS = 24;
export const ISO_AGE_BUCKET_DAYS = 365.25 / 4;
