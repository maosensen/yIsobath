/**
 * The instrument's vocabulary: units, the ten file types, the tree shape a survey
 * hands to `Volume`, and the reclaimable-space rules with their risk levels.
 *
 * Ported from yLookbook's Isobath section (`src/lib/fixtures/isobath.ts`, the
 * types and rules half). The rules match on `tag`s that the native survey in
 * `src-tauri/src/survey/` puts on folders and files; the demo volume
 * (`demo.ts`) carries the same tags from its generators.
 */

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

export const ISO_TYPES: Record<IsoType, { code: string; label: string }> = {
	vid: { code: "VID", label: "Video" },
	img: { code: "IMG", label: "Images" },
	aud: { code: "AUD", label: "Audio" },
	mdl: { code: "MDL", label: "Model weights" },
	src: { code: "SRC", label: "Code & dependencies" },
	bin: { code: "BIN", label: "Apps & build products" },
	vmi: { code: "VMI", label: "Disk images & VMs" },
	arc: { code: "ARC", label: "Archives & installers" },
	doc: { code: "DOC", label: "Documents" },
	sys: { code: "SYS", label: "System & support" },
};

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

export const ISO_RISKS: Record<IsoRisk, { label: string; hint: string }> = {
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
};

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

export interface IsoRule {
	id: string;
	title: string;
	blurb: string;
	risk: IsoRisk;
	/** 实际能拿回来的比例(Docker 的稀疏盘只能收回一部分)。 */
	recover?: number;
	/** 清理的命令;没有就说明怎么手动处理。 */
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
		title: "Trash",
		blurb:
			"Everything already thrown away, still holding its space until the Trash is emptied.",
		risk: "final",
		command: "Finder › Empty Trash",
		match: (n) => n.tag === "trash",
	},
	{
		id: "xcode-build",
		title: "Xcode build products",
		blurb:
			"DerivedData and preview caches: indexes, intermediates and products that Xcode rebuilds on the next build.",
		risk: "regenerates",
		command: "rm -rf ~/Library/Developer/Xcode/DerivedData",
		match: (n) => n.tag === "derived-data" || n.tag === "xcode-previews",
	},
	{
		id: "simulators",
		title: "Simulators on retired runtimes",
		blurb:
			"Simulator devices and runtime images for OS versions no scheme targets any more.",
		risk: "review",
		command: "xcrun simctl delete unavailable",
		match: (n) =>
			!!n.tag &&
			(n.tag.startsWith("sim-retired") || n.tag.startsWith("sim-runtime-old")),
	},
	{
		id: "device-support",
		title: "Symbols for old iOS versions",
		blurb:
			"Debug symbols copied from devices running iOS versions from more than a year ago. Xcode copies them again if one of those devices is plugged in.",
		risk: "regenerates",
		command: "rm -rf ~/Library/Developer/Xcode/iOS\\ DeviceSupport/*",
		match: (n) => n.tag === "device-support-old",
	},
	{
		id: "node-modules",
		title: "Dependency folders",
		blurb:
			"Every project's node_modules. One install puts them back from the package store in seconds.",
		risk: "regenerates",
		command: "pnpm install",
		match: (n) => n.tag === "node-modules",
	},
	{
		id: "build-output",
		title: "Build output",
		blurb:
			"target, .next, .turbo, dist and release folders — everything a build step writes and can write again.",
		risk: "regenerates",
		command: "cargo clean · rm -rf .next .turbo dist",
		match: (n) => n.tag === "build",
	},
	{
		id: "pkg-caches",
		title: "Package manager caches",
		blurb:
			"Homebrew, pip, uv, npm, Yarn, Bun, Cargo and Go keep every version they ever downloaded.",
		risk: "regenerates",
		command:
			"brew cleanup --prune=all · uv cache clean · npm cache clean --force · go clean -cache",
		match: (n) => n.tag === "pkg-cache",
	},
	{
		id: "app-caches",
		title: "Browser and app caches",
		blurb:
			"Media caches, service workers and render caches from Resolve, Adobe, Lightroom, Spotify, Chrome and friends.",
		risk: "regenerates",
		command: "Each app’s own ‘Clear cache’ setting",
		match: (n) => n.tag === "app-cache",
	},
	{
		id: "render-media",
		title: "Final Cut render and proxy media",
		blurb:
			"Render files and proxy media inside Final Cut libraries. Final Cut renders them again when needed.",
		risk: "regenerates",
		command: "Final Cut Pro › File › Delete Generated Library Files",
		match: (n) =>
			n.dir &&
			(n.name === "Render Files" || n.name === "Transcoded Media") &&
			under(n, "Final Cut Libraries"),
	},
	{
		id: "docker",
		title: "Docker’s virtual disk",
		blurb:
			"A sparse disk image that grows as images are pulled and never shrinks on its own. Roughly 70% of it is unused layers.",
		risk: "review",
		recover: 0.7,
		command: "docker system prune -a",
		match: (n) => n.tag === "docker-raw",
	},
	{
		id: "installers",
		title: "Installers left in Downloads",
		blurb: "Disk images, packages and ISOs that already did their job.",
		risk: "review",
		match: (n) => n.tag === "installer",
	},
	{
		id: "logs",
		title: "Logs and crash reports",
		blurb: "Diagnostic reports and rotated logs.",
		risk: "regenerates",
		match: (n) => n.tag === "logs",
	},
	{
		id: "duplicates",
		title: "Same weights, downloaded twice",
		blurb:
			"Byte-identical model files in more than one place — a Hugging Face cache, a local copy, another runtime’s store. Keep one.",
		risk: "review",
		match: () => false,
	},
	{
		id: "stale",
		title: "Large files untouched for two years",
		blurb:
			"Files over 1 GB nobody has opened or written since at least two years before the survey.",
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

/** 年龄的刻度:按季度,六年;再往前的并进最后一格。 */
export const ISO_AGE_BUCKETS = 24;
export const ISO_AGE_BUCKET_DAYS = 365.25 / 4;
