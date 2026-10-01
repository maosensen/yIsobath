/**
 * The demo volume: a deterministic, generated survey record of a creator +
 * developer workstation's "Macintosh HD — Data" (2 TB, APFS). Shown on first
 * launch and on demand, always labelled as a demo — never mixed with a real
 * survey.
 *
 * Ported unchanged from yLookbook's Isobath section (`src/lib/fixtures/isobath.ts`,
 * the tree half): the first two or three levels are written by hand, deeper
 * ones grow from generators shaped like the real folders they stand for.
 */

import { GB, type IsoDraft, type IsoType, KB, MB } from "./catalog";

// ---------- 卷 ----------

export const ISO_VOLUME = {
	name: "Macintosh HD",
	role: "Data",
	fs: "APFS",
	device: "disk3s5",
	host: "ada-studio",
	/** 2 TB 的 SSD 实际报告的字节数。 */
	capacity: 2_000_398_934_016,
	/** 这份记录测于何时;所有「多久没动」都相对它算。 */
	surveyedAt: "2026-09-27T09:41",
	/** 回放一次测量要多少秒(按目录顺序扫一圈)。 */
	replaySeconds: 11.5,
} as const;

// ---------- 随机 ----------

class Rng {
	private a: number;
	constructor(seed: number) {
		this.a = seed >>> 0;
	}
	next() {
		this.a = (this.a + 0x6d2b79f5) | 0;
		let t = Math.imul(this.a ^ (this.a >>> 15), 1 | this.a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}
	range(a: number, b: number) {
		return a + (b - a) * this.next();
	}
	int(a: number, b: number) {
		return Math.floor(this.range(a, b + 1));
	}
	pick<T>(list: readonly T[]): T {
		return list[Math.floor(this.next() * list.length)];
	}
	chance(p: number) {
		return this.next() < p;
	}
	hex(n: number) {
		let s = "";
		for (let i = 0; i < n; i++) s += "0123456789abcdef"[this.int(0, 15)];
		return s;
	}
	alnum(n: number) {
		const set = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
		let s = "";
		for (let i = 0; i < n; i++) s += set[this.int(0, set.length - 1)];
		return s;
	}
	lower(n: number) {
		let s = "";
		for (let i = 0; i < n; i++)
			s += "abcdefghijklmnopqrstuvwxyz"[this.int(0, 25)];
		return s;
	}
	uuid() {
		return `${this.hex(8)}-${this.hex(4)}-${this.hex(4)}-${this.hex(4)}-${this.hex(12)}`.toUpperCase();
	}
	/** 重尾的权重(Pareto),n 个,和为 1。 */
	weights(n: number, alpha = 1.2) {
		const w: number[] = [];
		let sum = 0;
		for (let i = 0; i < n; i++) {
			const x = (1 - this.next()) ** (-1 / alpha);
			w.push(x);
			sum += x;
		}
		return w.map((x) => x / sum);
	}
	/** 对数均匀:几 MB 到几 GB 这种跨度用它。 */
	log(a: number, b: number) {
		return Math.exp(this.range(Math.log(a), Math.log(b)));
	}
}

// ---------- 构件 ----------

const round = (x: number) => Math.max(0, Math.round(x));

function dir(
	name: string,
	children: IsoDraft[],
	extra: Partial<IsoDraft> = {},
): IsoDraft {
	return {
		name,
		children,
		bytes: 0,
		files: 0,
		dirs: 0,
		age: 0,
		type: "sys",
		...extra,
	};
}

function file(
	name: string,
	bytes: number,
	type: IsoType,
	age: number,
	extra: Partial<IsoDraft> = {},
): IsoDraft {
	return {
		name,
		bytes: round(bytes),
		files: 1,
		dirs: 0,
		age: round(age),
		type,
		...extra,
	};
}

function agg(
	files: number,
	bytes: number,
	type: IsoType,
	age: number,
	dirs = 0,
	label?: string,
): IsoDraft {
	const n = Math.max(1, round(files));
	return {
		name: label ?? `${n.toLocaleString("en-US")} ${n === 1 ? "file" : "files"}`,
		bytes: round(bytes),
		files: n,
		dirs: round(dirs),
		age: round(age),
		type,
		agg: true,
	};
}

/** 把 total 按重尾权重分成 n 份。 */
function split(r: Rng, total: number, n: number, alpha = 1.2) {
	return r.weights(n, alpha).map((w) => w * total);
}

/** 从词表里取 n 个不重复的名字(不够就加序号)。 */
function names(r: Rng, pool: readonly string[], n: number) {
	const list = [...pool];
	for (let i = list.length - 1; i > 0; i--) {
		const j = Math.floor(r.next() * (i + 1));
		[list[i], list[j]] = [list[j], list[i]];
	}
	const out = list.slice(0, n);
	for (let i = out.length; i < n; i++)
		out.push(`${pool[i % pool.length]} ${Math.floor(i / pool.length) + 2}`);
	return out;
}

/**
 * 通用的填充:把 bytes / files 摊进一棵几层深的子树 —— 几个子目录、几个大文件、
 * 一份剩下的零碎。目录名从词表里取,大文件名由 fileName 造。
 */
function fill(
	r: Rng,
	bytes: number,
	files: number,
	o: {
		type: IsoType;
		age: () => number;
		dirNames: readonly string[];
		fileName: () => string;
		depth: number;
		bigFile?: number;
		minDir?: number;
		types?: () => IsoType;
	},
): IsoDraft[] {
	const minDir = o.minDir ?? 150 * MB;
	const bigFile = o.bigFile ?? 400 * MB;
	const type = () => (o.types ? o.types() : o.type);
	if (o.depth <= 0 || bytes < minDir || files < 12) {
		return [agg(files, bytes, type(), o.age(), files / 40)];
	}
	const nDirs = r.int(2, 6);
	const nBig = r.int(0, 3);
	const parts = split(r, bytes, nDirs + nBig + 1, 1.05);
	const out: IsoDraft[] = [];
	const dirNames = names(r, o.dirNames, nDirs);
	let restBytes = parts[parts.length - 1];
	let restFiles = files;
	for (let i = 0; i < nBig; i++) {
		const b = parts[nDirs + i];
		if (b >= bigFile) {
			out.push(file(o.fileName(), b, type(), o.age()));
			restFiles -= 1;
		} else restBytes += b;
	}
	for (let i = 0; i < nDirs; i++) {
		const share = (parts[i] / bytes) ** 0.8;
		const f = Math.max(3, round(files * share * 0.9));
		restFiles -= f;
		out.push(
			dir(dirNames[i], fill(r, parts[i], f, { ...o, depth: o.depth - 1 })),
		);
	}
	out.push(
		agg(Math.max(1, restFiles), restBytes, type(), o.age(), restFiles / 50),
	);
	return out;
}

// ---------- 词表 ----------

const PROJECT_WORDS = [
	"Clients",
	"Archive",
	"Research",
	"Talks",
	"Scans",
	"Contracts",
	"Invoices",
	"Taxes",
	"Moodboards",
	"References",
	"Notes",
	"Drafts",
	"Press",
	"Brand",
	"Pitch",
	"Travel",
	"Receipts",
	"Proposals",
	"Workshops",
	"Letters",
	"Portfolio",
	"Specs",
	"Manuals",
	"Screens",
];

const NPM: [string, number][] = [
	["@next/swc-darwin-arm64", 118],
	["next", 124],
	["typescript", 23],
	["@esbuild/darwin-arm64", 10],
	["@img/sharp-libvips-darwin-arm64", 17],
	["lightningcss-darwin-arm64", 8.4],
	["@tailwindcss/oxide-darwin-arm64", 6.1],
	["react-dom", 7.1],
	["three", 31],
	["@swc/core-darwin-arm64", 46],
	["@biomejs/cli-darwin-arm64", 42],
	["turbo-darwin-arm64", 27],
	["playwright-core", 8.3],
	["@prisma/engines", 48],
	["prisma", 12],
	["@aws-sdk/client-s3", 9.2],
	["date-fns", 38],
	["lodash", 5.1],
	["rxjs", 11],
	["caniuse-lite", 2.3],
	["core-js", 1.3],
	["@types/node", 2.2],
	["zod", 3.1],
	["motion", 4.4],
	["framer-motion", 6.2],
	["lucide-react", 36],
	["@mui/icons-material", 45],
	["monaco-editor", 91],
	["pdfjs-dist", 34],
	["ffmpeg-static", 76],
	["electron", 252],
	["app-builder-bin", 61],
	["sass-embedded-darwin-arm64", 21],
	["@sentry/cli-darwin", 31],
	["@cloudflare/workerd-darwin-arm64", 86],
	["wrangler", 12],
	["@rollup/rollup-darwin-arm64", 2.4],
	["vite", 3.2],
	["@babel/core", 2.1],
	["@tensorflow/tfjs-node", 184],
	["onnxruntime-node", 132],
	["@huggingface/transformers", 64],
	["@radix-ui/react-dialog", 0.6],
	["@tanstack/react-query", 3.1],
	["shiki", 9.8],
	["mermaid", 28],
	["@mapbox/node-pre-gyp", 1.1],
	["canvas", 29],
	["puppeteer", 4.6],
	["storybook", 18],
];

const BREW = [
	"llvm",
	"gcc",
	"qt",
	"opencv",
	"ffmpeg",
	"python@3.13",
	"python@3.12",
	"node",
	"openssl@3",
	"imagemagick",
	"rust",
	"go",
	"postgresql@17",
	"redis",
	"git",
	"gh",
	"sqlite",
	"x265",
	"x264",
	"libvpx",
	"aom",
	"dav1d",
	"cmake",
	"ninja",
	"protobuf",
	"grpc",
	"boost",
	"icu4c@77",
	"harfbuzz",
	"cairo",
	"glib",
	"gettext",
	"libheif",
	"librsvg",
	"tesseract",
	"poppler",
	"ghostscript",
	"pandoc",
	"yt-dlp",
	"uv",
	"pnpm",
	"deno",
	"bun",
	"zig",
	"swiftlint",
	"xcodegen",
	"cocoapods",
	"ruby",
	"openjdk",
	"gradle",
	"kotlin",
	"terraform",
	"awscli",
	"kubernetes-cli",
	"helm",
	"k9s",
	"colima",
	"lima",
	"qemu",
	"ripgrep",
	"fd",
	"bat",
	"fzf",
	"jq",
	"htop",
	"wget",
	"tmux",
	"neovim",
	"lua",
	"luajit",
	"sdl2",
	"vulkan-headers",
	"molten-vk",
	"glslang",
	"spirv-tools",
	"shaderc",
	"assimp",
	"openexr",
	"openimageio",
	"blender-deps",
];

const APPS: [string, number, number][] = [
	// 名字、GB、多久没更新(天)
	["Xcode.app", 11.9, 12],
	["Final Cut Pro.app", 6.1, 34],
	["Adobe Photoshop 2026", 5.8, 21],
	["DaVinci Resolve", 4.7, 58],
	["Adobe Premiere Pro 2026", 4.4, 21],
	["Logic Pro.app", 2.9, 34],
	["Blender.app", 1.9, 44],
	["Docker.app", 2.1, 9],
	["Microsoft Word.app", 2.3, 16],
	["Microsoft Excel.app", 2.1, 16],
	["Microsoft PowerPoint.app", 1.9, 16],
	["Google Chrome.app", 1.4, 3],
	["Motion.app", 3.2, 34],
	["Compressor.app", 0.9, 34],
	["Unity Hub.app", 0.5, 120],
	["Figma.app", 0.42, 6],
	["Visual Studio Code.app", 0.61, 5],
	["Slack.app", 0.52, 8],
	["LM Studio.app", 0.83, 11],
	["Ollama.app", 0.41, 15],
	["Arc.app", 0.72, 4],
	["Zed.app", 0.33, 2],
	["Obsidian.app", 0.35, 23],
	["Raycast.app", 0.28, 7],
	["Claude.app", 0.46, 5],
	["Discord.app", 0.49, 12],
	["Spotify.app", 0.36, 19],
	["Keynote.app", 0.71, 60],
	["Pages.app", 0.58, 60],
	["Numbers.app", 0.52, 60],
	["Pixelmator Pro.app", 0.61, 90],
	["UTM.app", 0.47, 140],
	["Steam.app", 0.12, 200],
	["TablePlus.app", 0.16, 70],
	["Transmit 5.app", 0.07, 300],
];

const SWIFT_PKGS = [
	"swift-collections",
	"swift-argument-parser",
	"swift-algorithms",
	"swift-syntax",
	"swift-nio",
	"swift-log",
	"swift-crypto",
	"Alamofire",
	"Kingfisher",
	"SnapKit",
	"swift-composable-architecture",
	"swift-dependencies",
	"GRDB.swift",
	"Sparkle",
];

const DEVICES = [
	"iPhone 17 Pro",
	"iPhone 17 Pro Max",
	"iPhone 17",
	"iPhone Air",
	"iPhone 16",
	"iPhone 16e",
	"iPhone 15 Pro",
	"iPhone SE (3rd generation)",
	"iPad Pro 13-inch (M5)",
	"iPad Air 11-inch (M3)",
	"iPad mini (A17 Pro)",
	"Apple Watch Series 11 (46mm)",
	"Apple Watch Ultra 3 (49mm)",
	"Apple Vision Pro",
	"Apple TV 4K (3rd generation)",
];

// ---------- 生成器 ----------

function fcpLibrary(
	r: Rng,
	name: string,
	total: number,
	age: number,
	events: string[],
): IsoDraft {
	const shares = split(r, total, events.length, 1.6);
	const ev = events.map((event, i) => {
		const b = shares[i];
		const original = b * r.range(0.62, 0.72);
		const render = b * r.range(0.08, 0.13);
		const proxy = b * r.range(0.12, 0.18);
		const analysis = b * 0.01;
		const clips: IsoDraft[] = [];
		let left = original;
		const reel = r.int(1, 9);
		const mmdd = `${String(r.int(1, 12)).padStart(2, "0")}${String(r.int(1, 28)).padStart(2, "0")}`;
		let c = r.int(1, 30);
		while (left > 1.2 * GB) {
			const s = Math.min(left, r.log(0.9 * GB, 5.8 * GB));
			clips.push(
				file(
					`A${String(reel).padStart(3, "0")}_C${String(c).padStart(3, "0")}_${mmdd}${r.alnum(2)}.mov`,
					s,
					"vid",
					age + r.range(0, 30),
				),
			);
			left -= s;
			c += r.int(1, 3);
		}
		clips.push(agg(r.int(12, 60), left, "vid", age + 10));
		const renders: IsoDraft[] = [];
		let rl = render;
		while (rl > 0.7 * GB) {
			const s = Math.min(rl, r.log(0.4 * GB, 2.2 * GB));
			renders.push(
				file(
					`${r.hex(8).toUpperCase()}-${r.hex(4).toUpperCase()}.mov`,
					s,
					"vid",
					age,
				),
			);
			rl -= s;
		}
		renders.push(agg(r.int(40, 400), rl, "vid", age));
		return dir(event, [
			dir("Original Media", clips),
			dir("Render Files", [dir("High Quality Media", renders)]),
			dir("Transcoded Media", [
				dir("Proxy Media", [agg(clips.length, proxy, "vid", age, 0)]),
			]),
			dir("Analysis Files", [agg(r.int(40, 200), analysis, "sys", age, 3)]),
			file("CurrentVersion.fcpevent", r.log(8 * MB, 90 * MB), "doc", age),
		]);
	});
	return dir(name, [
		...ev,
		dir("Motion Templates", [
			agg(r.int(20, 90), r.log(40 * MB, 400 * MB), "vid", age + 90, 12),
		]),
		file("CurrentVersion.flexolibrary", r.log(2 * MB, 30 * MB), "doc", age),
		dir("__Temp", [agg(r.int(4, 30), r.log(10 * MB, 200 * MB), "sys", age)]),
	]);
}

function photosLibrary(r: Rng, total: number): IsoDraft {
	const originals = total * 0.9;
	const buckets = "0123456789ABCDEF".split("").map((h) => {
		const b = (originals / 16) * r.range(0.86, 1.14);
		const kids: IsoDraft[] = [];
		// 每个桶里:按年份的照片 + 几段大视频
		let videos = b * r.range(0.14, 0.26);
		while (videos > 0.9 * GB) {
			const s = Math.min(videos, r.log(0.8 * GB, 3.4 * GB));
			const age = r.range(60, 3900);
			kids.push(file(`IMG_${r.int(1000, 9999)}.MOV`, s, "vid", age));
			videos -= s;
		}
		const photo = b - kids.reduce((a, k) => a + k.bytes, 0);
		const years = [
			2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025,
			2026,
		];
		const yw = years.map(
			(y) => (y < 2018 ? 0.4 : y < 2022 ? 1 : 1.5) * r.range(0.7, 1.3),
		);
		const ys = yw.reduce((a, x) => a + x, 0);
		years.forEach((y, i) => {
			const bytes = (photo * yw[i]) / ys;
			const count = round(bytes / r.range(3.1 * MB, 4.6 * MB));
			const age = (2026 - y) * 365 + r.range(-120, 120) - 60;
			kids.push(
				agg(
					count,
					bytes,
					"img",
					Math.max(8, age),
					0,
					`${count.toLocaleString("en-US")} files from ${y}`,
				),
			);
		});
		return dir(h, kids);
	});
	const derivatives = total * 0.07;
	return dir("Photos Library.photoslibrary", [
		dir("originals", buckets),
		dir("resources", [
			dir(
				"derivatives",
				"0123456789ABCDEF"
					.split("")
					.map((h) =>
						dir(h, [
							agg(
								r.int(3000, 6000),
								(derivatives / 16) * r.range(0.8, 1.2),
								"img",
								r.range(2, 40),
							),
						]),
					),
			),
			dir("renders", [agg(r.int(200, 900), total * 0.012, "img", 30)]),
			dir("cpl", [agg(r.int(400, 2000), total * 0.004, "sys", 3)]),
		]),
		dir("database", [
			file("Photos.sqlite", 1.24 * GB, "sys", 1),
			file("Photos.sqlite-wal", 0.21 * GB, "sys", 0),
			agg(r.int(30, 80), 0.18 * GB, "sys", 1, 4),
		]),
		dir("scopes", [agg(r.int(200, 800), 0.4 * GB, "img", 12, 20)]),
		dir("private", [agg(r.int(300, 1000), 0.3 * GB, "sys", 2, 30)]),
	]);
}

function derivedData(r: Rng, projects: [string, number, number][]): IsoDraft {
	return dir(
		"DerivedData",
		[
			...projects.map(([name, gb, age]) => {
				const b = gb * GB;
				const pkgs = names(r, SWIFT_PKGS, r.int(3, 8));
				return dir(`${name}-${r.lower(28)}`, [
					dir("Build", [
						dir("Intermediates.noindex", [
							dir(`${name}.build`, [
								agg(r.int(4000, 30000), b * 0.44, "bin", age, 600),
							]),
							dir("SwiftExplicitPrecompiledModules", [
								agg(r.int(200, 900), b * 0.12, "bin", age, 2),
							]),
							dir("XCBuildData", [
								agg(r.int(40, 300), b * 0.03, "sys", age, 20),
							]),
						]),
						dir("Products", [
							dir("Debug-iphonesimulator", [
								agg(r.int(200, 3000), b * 0.13, "bin", age, 80),
							]),
							dir("Debug-iphoneos", [
								agg(r.int(100, 1500), b * 0.06, "bin", age + 20, 40),
							]),
						]),
					]),
					dir("Index.noindex", [
						dir("DataStore", [
							agg(r.int(2000, 12000), b * 0.1, "sys", age, 40),
						]),
						dir("PrecompiledHeaders", [
							agg(r.int(40, 200), b * 0.03, "bin", age, 2),
						]),
					]),
					dir("SourcePackages", [
						dir(
							"checkouts",
							pkgs.map((p) =>
								dir(p, [
									agg(
										r.int(200, 3000),
										((b * 0.07) / pkgs.length) * r.range(0.4, 1.6),
										"src",
										age + 30,
										60,
									),
								]),
							),
						),
						dir("repositories", [
							agg(r.int(40, 200), b * 0.02, "src", age + 30, 30),
						]),
					]),
					dir("Logs", [agg(r.int(30, 400), b * 0.01, "sys", age, 6)]),
				]);
			}),
			dir("ModuleCache.noindex", [agg(18_400, 3.4 * GB, "bin", 2, 310)]),
		],
		{ tag: "derived-data" },
	);
}

function simulators(r: Rng): IsoDraft[] {
	const devices: IsoDraft[] = [];
	for (let i = 0; i < 26; i++) {
		const retired = i >= 17;
		const name = DEVICES[i % DEVICES.length];
		const gb = retired ? r.log(0.6, 3.8) : r.log(0.4, 4.6);
		const age = retired ? r.range(420, 900) : r.range(1, 140);
		const b = gb * GB;
		devices.push(
			dir(
				r.uuid(),
				[
					dir("data", [
						dir("Containers", [
							dir("Bundle", [
								dir("Application", [
									agg(r.int(100, 1000), b * 0.31, "bin", age, 40),
								]),
							]),
							dir("Data", [
								dir("Application", [
									agg(r.int(1000, 6000), b * 0.24, "sys", age, 300),
								]),
							]),
							dir("Shared", [agg(r.int(100, 900), b * 0.04, "sys", age, 30)]),
						]),
						dir("Library", [
							dir("Caches", [agg(r.int(500, 4000), b * 0.18, "sys", age, 200)]),
							dir("Photos", [agg(r.int(40, 400), b * 0.06, "img", age, 10)]),
							dir("Logs", [agg(r.int(40, 300), b * 0.03, "sys", age, 12)]),
						]),
						dir("Media", [agg(r.int(40, 400), b * 0.08, "img", age, 12)]),
						agg(r.int(400, 3000), b * 0.06, "sys", age, 80),
					]),
					file("device.plist", 2 * KB, "sys", age),
				],
				{ tag: retired ? "sim-retired" : "sim-device", age: round(age) },
			),
		);
		// 名字不进路径(真实的也是 UUID),留给规则说明
		devices[i].tag = `${devices[i].tag}:${name}`;
	}
	return devices;
}

function nodeModules(
	r: Rng,
	total: number,
	age: number,
	nested: boolean,
): IsoDraft {
	const pick = names(
		r,
		NPM.map((p) => p[0]),
		r.int(18, 34),
	);
	const sizes = new Map(NPM);
	const kids: IsoDraft[] = [];
	let used = 0;
	for (const p of pick) {
		const mb = (sizes.get(p) ?? 4) * r.range(0.8, 1.2);
		const b = mb * MB;
		if (used + b > total * 0.8) continue;
		used += b;
		const files = round(b / r.range(22 * KB, 60 * KB));
		const inner: IsoDraft[] = [agg(files, b * 0.9, "src", age, files / 12)];
		if (nested && r.chance(0.18)) {
			inner.unshift(
				dir("node_modules", [
					agg(round(files * 0.2), b * 0.1, "src", age, files / 40),
				]),
			);
		} else inner.push(file("package.json", 3 * KB, "src", age));
		kids.push(dir(p, inner));
	}
	const rest = total - used;
	const files = round(rest / r.range(18 * KB, 34 * KB));
	kids.push(
		agg(
			files,
			rest,
			"src",
			age,
			files / 9,
			`${r.int(380, 1400).toLocaleString("en-US")} more packages`,
		),
	);
	kids.push(dir(".cache", [agg(r.int(40, 600), total * 0.02, "sys", age, 8)]));
	return dir("node_modules", kids, { tag: "node-modules" });
}

function gitDir(r: Rng, total: number, age: number): IsoDraft {
	return dir(".git", [
		dir("objects", [
			dir("pack", [
				file(`pack-${r.hex(40)}.pack`, total * 0.86, "src", age + 20),
				file(`pack-${r.hex(40)}.idx`, total * 0.02, "src", age + 20),
			]),
			agg(r.int(40, 3000), total * 0.08, "src", age, 256),
		]),
		dir(
			"lfs",
			total > 800 * MB
				? [agg(r.int(30, 400), total * 0.03, "arc", age, 12)]
				: [],
		),
		file("index", total * 0.01 + 200 * KB, "src", age),
		agg(r.int(20, 80), 1.5 * MB, "src", age, 9),
	]);
}

type Stack =
	| "next"
	| "monorepo"
	| "rust"
	| "swift"
	| "ml"
	| "electron"
	| "go"
	| "site";

function project(
	r: Rng,
	name: string,
	stack: Stack,
	gb: number,
	age: number,
): IsoDraft {
	const b = gb * GB;
	const kids: IsoDraft[] = [];
	const src = (share: number) =>
		dir(
			"src",
			fill(r, b * share, round((b * share) / (24 * KB)), {
				type: "src",
				age: () => age + r.range(0, 40),
				dirNames: [
					"components",
					"lib",
					"app",
					"routes",
					"shaders",
					"workers",
					"styles",
					"tests",
					"fixtures",
					"hooks",
					"utils",
					"server",
				],
				fileName: () =>
					`${r.pick(["bundle", "atlas", "index", "data"])}.${r.pick(["bin", "json", "wasm"])}`,
				depth: 2,
				minDir: 8 * MB,
			}),
		);
	switch (stack) {
		case "next":
		case "site":
			kids.push(nodeModules(r, b * 0.52, age, true));
			kids.push(
				dir(
					".next",
					[
						dir("cache", [agg(r.int(3000, 20000), b * 0.28, "bin", age, 400)]),
						dir("server", [agg(r.int(200, 2000), b * 0.04, "bin", age, 60)]),
						dir("static", [agg(r.int(200, 2000), b * 0.02, "bin", age, 30)]),
					],
					{ tag: "build" },
				),
			);
			kids.push(gitDir(r, b * 0.06, age));
			kids.push(
				dir("public", [agg(r.int(40, 600), b * 0.07, "img", age + 40, 12)]),
			);
			kids.push(src(0.03));
			break;
		case "monorepo":
			kids.push(nodeModules(r, b * 0.36, age, true));
			kids.push(
				dir(
					"apps",
					["web", "admin", "docs", "mobile"].map((a, i) =>
						dir(a, [
							nodeModules(
								r,
								b * [0.06, 0.04, 0.03, 0.08][i],
								age + i * 3,
								false,
							),
							dir(
								a === "docs" ? "out" : ".next",
								[
									agg(
										r.int(400, 6000),
										b * [0.07, 0.04, 0.02, 0.01][i],
										"bin",
										age,
										80,
									),
								],
								{ tag: "build" },
							),
							src(0.01),
						]),
					),
				),
			);
			kids.push(
				dir(
					"packages",
					["ui", "config", "db", "sdk", "icons"].map((p) =>
						dir(p, [
							dir("dist", [agg(r.int(40, 900), b * 0.006, "bin", age, 10)], {
								tag: "build",
							}),
							src(0.004),
						]),
					),
				),
			);
			kids.push(
				dir(
					".turbo",
					[dir("cache", [agg(r.int(2000, 9000), b * 0.1, "bin", age, 40)])],
					{ tag: "build" },
				),
			);
			kids.push(gitDir(r, b * 0.07, age));
			break;
		case "rust":
			kids.push(
				dir(
					"target",
					[
						dir("debug", [
							dir("deps", [agg(r.int(4000, 16000), b * 0.52, "bin", age, 20)]),
							dir("build", [agg(r.int(600, 4000), b * 0.1, "bin", age, 300)]),
							dir("incremental", [
								agg(r.int(2000, 9000), b * 0.14, "bin", age, 500),
							]),
						]),
						dir("release", [
							dir("deps", [
								agg(r.int(800, 3000), b * 0.12, "bin", age + 12, 10),
							]),
						]),
					],
					{ tag: "build" },
				),
			);
			kids.push(gitDir(r, b * 0.05, age));
			kids.push(src(0.02));
			kids.push(
				dir("assets", [agg(r.int(40, 400), b * 0.03, "img", age + 60, 8)]),
			);
			break;
		case "swift":
			kids.push(
				dir("Pods", [agg(r.int(3000, 12000), b * 0.28, "src", age, 400)], {
					tag: "pods",
				}),
			);
			kids.push(
				dir("build", [agg(r.int(400, 4000), b * 0.3, "bin", age, 60)], {
					tag: "build",
				}),
			);
			kids.push(gitDir(r, b * 0.2, age));
			kids.push(
				dir("Resources", [
					agg(r.int(200, 1400), b * 0.12, "img", age + 30, 40),
				]),
			);
			kids.push(src(0.05));
			break;
		case "ml": {
			kids.push(
				dir(
					".venv",
					[
						dir("lib", [
							dir("python3.12", [
								dir("site-packages", [
									dir("torch", [agg(14_200, 2.9 * GB, "src", age, 1100)]),
									dir("nvidia", [agg(2_100, 0.4 * GB, "bin", age, 90)]),
									dir("transformers", [agg(4_900, 0.13 * GB, "src", age, 600)]),
									dir("triton", [agg(1_600, 0.36 * GB, "bin", age, 120)]),
									agg(38_000, 1.9 * GB, "src", age, 4200, "212 more packages"),
								]),
							]),
						]),
					],
					{ tag: "venv" },
				),
			);
			const data = b * 0.46;
			kids.push(
				dir("data", [
					dir("raw", [
						...Array.from({ length: 6 }, (_, i) =>
							file(
								`shard-${String(i).padStart(5, "0")}-of-00006.parquet`,
								((data * 0.6) / 6) * r.range(0.9, 1.1),
								"arc",
								age + 90,
							),
						),
					]),
					dir("processed", [
						agg(r.int(40, 400), data * 0.3, "arc", age + 30, 4),
					]),
					dir("eval", [agg(r.int(40, 400), data * 0.1, "doc", age + 10, 4)]),
				]),
			);
			kids.push(
				dir("checkpoints", [
					dir("base-llama-3.1-8b", [
						file(
							"model-00001-of-00004.safetensors",
							4.98 * GB,
							"mdl",
							age + 40,
							{ dup: "llama-3.1-8b-1" },
						),
						file(
							"model-00002-of-00004.safetensors",
							5.0 * GB,
							"mdl",
							age + 40,
							{ dup: "llama-3.1-8b-2" },
						),
						file(
							"model-00003-of-00004.safetensors",
							4.92 * GB,
							"mdl",
							age + 40,
							{ dup: "llama-3.1-8b-3" },
						),
						file(
							"model-00004-of-00004.safetensors",
							1.17 * GB,
							"mdl",
							age + 40,
							{ dup: "llama-3.1-8b-4" },
						),
						agg(6, 18 * MB, "doc", age + 40),
					]),
					...[
						"run-0412-lora",
						"run-0419-lora",
						"run-0503-lora",
						"run-0517-lora",
						"run-0602-lora",
					].map((run, i) =>
						dir(run, [
							file(
								"adapter_model.safetensors",
								r.log(0.2, 1.4) * GB,
								"mdl",
								age + 120 - i * 20,
							),
							file(
								"optimizer.pt",
								r.log(0.4, 2.8) * GB,
								"mdl",
								age + 120 - i * 20,
							),
							agg(r.int(4, 12), 12 * MB, "doc", age + 120 - i * 20),
						]),
					),
				]),
			);
			kids.push(
				dir("wandb", [agg(r.int(2000, 9000), b * 0.02, "doc", age + 20, 400)]),
			);
			kids.push(gitDir(r, b * 0.02, age));
			kids.push(src(0.005));
			break;
		}
		case "electron":
			kids.push(nodeModules(r, b * 0.58, age, true));
			kids.push(
				dir(
					"release",
					[
						file(`${name}-2.4.1-arm64.dmg`, b * 0.12, "arc", age + 30),
						file(`${name}-2.4.1-arm64-mac.zip`, b * 0.11, "arc", age + 30),
						dir("mac-arm64", [
							agg(r.int(300, 2000), b * 0.1, "bin", age + 30, 40),
						]),
					],
					{ tag: "build" },
				),
			);
			kids.push(gitDir(r, b * 0.04, age));
			kids.push(src(0.02));
			break;
		case "go":
			kids.push(
				dir("bin", [agg(r.int(4, 20), b * 0.3, "bin", age, 0)], {
					tag: "build",
				}),
			);
			kids.push(
				dir("vendor", [agg(r.int(2000, 8000), b * 0.3, "src", age, 400)]),
			);
			kids.push(gitDir(r, b * 0.2, age));
			kids.push(src(0.1));
			break;
	}
	kids.push(agg(r.int(6, 24), r.log(40 * KB, 2 * MB), "src", age, 0));
	return dir(name, kids);
}

function hfModel(
	r: Rng,
	repo: string,
	shards: number[],
	age: number,
	dup?: string,
): IsoDraft {
	return dir(`models--${repo.replace("/", "--")}`, [
		dir(
			"blobs",
			shards.map((gb, i) =>
				file(
					r.hex(64),
					gb * GB,
					"mdl",
					age,
					dup ? { dup: `${dup}-${i + 1}` } : {},
				),
			),
		),
		dir("snapshots", [
			dir(r.hex(40), [
				agg(shards.length + r.int(4, 9), 64 * KB, "sys", age, 1),
			]),
		]),
		dir("refs", [file("main", 40, "sys", age)]),
	]);
}

function appBundle(r: Rng, name: string, gb: number, age: number): IsoDraft {
	const b = gb * GB;
	const [fw, res, mac, plug] = split(r, b * 0.97, 4, 2);
	return dir(name, [
		dir("Contents", [
			dir(
				"Frameworks",
				fill(r, fw, round(fw / (260 * KB)), {
					type: "bin",
					age: () => age,
					dirNames: [
						"Electron Framework.framework",
						"Chromium Embedded Framework.framework",
						"Squirrel.framework",
						"Sparkle.framework",
						"Metal Kernels.framework",
						"Codecs.framework",
						"PythonKit.framework",
						"libavcodec.framework",
						"Qt.framework",
						"Mono.framework",
					],
					fileName: () =>
						`lib${r.pick(["render", "codec", "ml", "core", "ui"])}.dylib`,
					depth: 1,
					minDir: 80 * MB,
					bigFile: 180 * MB,
				}),
			),
			dir("Resources", [
				agg(round(res / (160 * KB)), res, "bin", age, round(res / (6 * MB))),
			]),
			dir("MacOS", [file(name.replace(/\.app$/, ""), mac, "bin", age)]),
			dir("PlugIns", [agg(r.int(4, 80), plug, "bin", age, 20)]),
			dir("_CodeSignature", [file("CodeResources", b * 0.002, "sys", age)]),
			file("Info.plist", 6 * KB, "sys", age),
		]),
	]);
}

const CONTAINER_IDS = [
	"com.apple.mail",
	"com.apple.Safari",
	"com.apple.Notes",
	"com.apple.news",
	"com.apple.stocks",
	"com.apple.weather",
	"com.apple.Maps",
	"com.apple.podcasts",
	"com.apple.iBooksX",
	"com.apple.FaceTime",
	"com.apple.Passwords",
	"com.apple.freeform",
	"com.apple.Music",
	"com.apple.TV",
	"com.apple.Photos",
	"com.apple.Preview",
	"com.apple.Home",
	"com.apple.shortcuts",
	"com.apple.findmy",
	"com.apple.reminders",
	"com.apple.iWork.Keynote",
	"com.apple.iWork.Pages",
	"com.apple.iWork.Numbers",
	"com.apple.garageband10",
	"com.apple.Translate",
	"com.apple.journal",
	"com.apple.Image-Playground",
	"com.apple.PhotoBooth",
	"com.apple.VoiceMemos",
	"com.apple.archiveutility",
	"com.apple.siri.media-indexer",
	"com.apple.mediaanalysisd",
	"com.apple.photoanalysisd",
	"com.apple.CloudPhotosConfiguration",
	"com.apple.AppStore",
	"com.apple.Maps.mapssync",
	"com.pixelmatorteam.pixelmator.x",
	"com.agilebits.onepassword7",
	"net.whatsapp.WhatsApp",
	"com.tinyspeck.slackmacgap",
	"com.utmapp.QEMUHelper",
	"com.culturedcode.ThingsMac",
	"com.flexibits.fantastical2.mac",
	"com.readdle.smartemail-Mac",
	"com.panic.Nova",
	"com.bohemiancoding.sketch3",
	"com.iconfactory.Tot",
	"com.rogueamoeba.Loopback",
	"com.noodlesoft.Hazel",
	"com.sindresorhus.Dato",
	"com.omnigroup.OmniFocus4",
	"com.microsoft.Word",
	"com.microsoft.Excel",
	"com.microsoft.Powerpoint",
	"com.microsoft.onenote.mac",
	"com.microsoft.teams2",
	"com.google.drivefs",
	"com.dropbox.DropboxMacUpdate",
	"com.bitwarden.desktop",
	"com.telegram.desktop",
	"org.whispersystems.signal-desktop",
	"com.hnc.Discord",
	"us.zoom.xos",
	"com.linear",
	"md.obsidian",
	"com.figma.agent",
	"com.lukilabs.lukiapp",
	"com.mimestream.Mimestream",
	"com.nordvpn.macos",
	"com.cleanshot.CleanShotX",
	"com.lemonmojo.RoyalTSX.App",
	"com.charliemonroe.Downie-4",
	"com.charliemonroe.Permute-3",
	"com.coppola.Unfolder",
	"com.hegenberg.BetterTouchTool",
	"com.surteesstudios.Bartender",
	"com.pilotmoon.popclip",
	"com.brettterpstra.marked2",
	"com.kapeli.dashdoc",
	"com.apple.dt.Xcode.DeveloperDocumentation",
];

function smallContainers(r: Rng, total: number): IsoDraft[] {
	const sizes = split(r, total, CONTAINER_IDS.length, 1.1);
	return sizes.map((b, i) => {
		const age = r.log(1, 900);
		return dir(CONTAINER_IDS[i], [
			dir("Data", [
				dir("Library", [agg(r.int(20, 3000), b, "sys", age, r.int(4, 120))]),
			]),
		]);
	});
}

function cellar(r: Rng, total: number): IsoDraft {
	const heavy = new Set([
		"llvm",
		"gcc",
		"qt",
		"opencv",
		"rust",
		"go",
		"openjdk",
		"postgresql@17",
		"boost",
		"python@3.13",
		"python@3.12",
		"ruby",
		"zig",
		"tesseract",
	]);
	const w = BREW.map((f) => (heavy.has(f) ? r.range(6, 14) : r.log(0.05, 2.5)));
	const ws = w.reduce((a, x) => a + x, 0);
	return dir(
		"Cellar",
		BREW.map((f, i) => {
			const b = (total * w[i]) / ws;
			const version = `${r.int(1, 19)}.${r.int(0, 12)}.${r.int(0, 9)}`;
			return dir(f, [
				dir(version, [
					agg(
						round(b / (80 * KB)),
						b,
						"bin",
						r.log(3, 400),
						round(b / (3 * MB)),
					),
				]),
			]);
		}),
	);
}

// ---------- 整卷 ----------

export interface IsobathTree {
	root: IsoDraft;
}

/**
 * 按固定种子生成整棵树。纯函数:同一次运行里调两次、服务端和浏览器各调一次,
 * 得到的是同一棵树。
 */
export function buildIsobathVolume(): IsobathTree {
	const r = new Rng(0x150ba7);
	const d = (days: number) => days;

	// ~/Movies
	const movies = dir("Movies", [
		dir("Final Cut Libraries", [
			fcpLibrary(r, "Tidewater Launch.fcpbundle", 176 * GB, d(24), [
				"Day 1 — Coast",
				"Day 2 — Harbour",
				"Interviews",
				"Drone",
				"Pickups",
			]),
			fcpLibrary(r, "Nordkapp Road Trip.fcpbundle", 92 * GB, d(812), [
				"Lofoten",
				"Senja",
				"Tromsø",
				"Nordkapp",
			]),
			fcpLibrary(r, "Studio Sessions 2024.fcpbundle", 57 * GB, d(588), [
				"Session A",
				"Session B",
				"Session C",
			]),
		]),
		dir("Exports", [
			file("Tidewater — Launch Film (ProRes 4444).mov", 18.6 * GB, "vid", 19),
			file("Tidewater — Launch Film (H.265 4K).mp4", 2.4 * GB, "vid", 19),
			file("Nordkapp — Director's Cut.mov", 9.1 * GB, "vid", 790),
			file("Studio Sessions — Reel.mov", 3.8 * GB, "vid", 560),
			agg(46, 3.2 * GB, "vid", 120),
		]),
		dir("DaVinci Resolve", [
			dir("CacheClip", [agg(8_412, 21.8 * GB, "vid", 40, 210)], {
				tag: "app-cache",
			}),
			dir("Gallery", [agg(310, 0.6 * GB, "img", 80, 12)]),
		]),
		dir(
			"Screen Recordings",
			fill(r, 17.4 * GB, 120, {
				type: "vid",
				age: () => r.log(4, 700),
				dirNames: ["Demos", "Bug reports", "Talks", "Tutorials"],
				fileName: () =>
					`Screen Recording 2026-0${r.int(1, 8)}-${String(r.int(10, 28))} at ${r.int(9, 18)}.${String(r.int(10, 59))}.${String(r.int(10, 59))}.mov`,
				depth: 1,
				bigFile: 0.7 * GB,
				minDir: 1.5 * GB,
			}),
		),
		dir("Motion Templates.localized", [agg(640, 3.9 * GB, "vid", 400, 90)]),
	]);

	// ~/Library
	const library = dir("Library", [
		dir("Developer", [
			dir("Xcode", [
				derivedData(r, [
					["Harbor", 14.2, 1],
					["HarborWidgets", 4.1, 1],
					["Lantern", 11.6, 6],
					["Meridian", 9.8, 22],
					["Slate", 6.2, 48],
					["TernBot", 3.9, 95],
					["Pier", 2.7, 160],
					["Fathom", 5.3, 210],
					["OldPlayground", 1.8, 430],
				]),
				dir(
					"iOS DeviceSupport",
					[
						["iPhone18,1 26.0 (23A341)", 6.1, 4],
						["iPhone17,1 18.6.2 (22G100)", 5.4, 70],
						["iPhone17,1 18.3 (22D63)", 5.2, 240],
						["iPhone16,1 17.5.1 (21F90)", 4.9, 470],
						["iPhone15,2 16.4 (20E247)", 4.4, 890],
					].map(([n, gb, age]) =>
						dir(
							n as string,
							[
								dir("Symbols", [
									agg(
										r.int(2000, 4000),
										(gb as number) * GB,
										"bin",
										age as number,
										300,
									),
								]),
							],
							{
								tag:
									(age as number) > 365
										? "device-support-old"
										: "device-support",
							},
						),
					),
				),
				dir(
					"Archives",
					[
						"2025-11-04",
						"2026-02-17",
						"2026-05-30",
						"2026-08-12",
						"2026-09-19",
					].map((date, i) =>
						dir(date, [
							dir(
								`Harbor ${date.slice(5, 7)}-${date.slice(8, 10)}-${date.slice(2, 4)}, ${r.int(9, 18)}.${r.int(10, 59)}.xcarchive`,
								[
									agg(
										r.int(300, 1400),
										r.log(1.1, 3.6) * GB,
										"bin",
										330 - i * 70,
										60,
									),
								],
							),
						]),
					),
				),
				dir("UserData", [
					dir("Previews", [agg(2_800, 5.2 * GB, "bin", 9, 300)], {
						tag: "xcode-previews",
					}),
				]),
			]),
			dir("CoreSimulator", [
				dir("Devices", simulators(r)),
				dir("Caches", [dir("dyld", [agg(1_200, 9.6 * GB, "sys", 14, 40)])], {
					tag: "sim-caches",
				}),
			]),
		]),
		dir("Containers", [
			dir("com.docker.docker", [
				dir("Data", [
					dir("vms", [
						dir("0", [
							dir("data", [
								file("Docker.raw", 58.2 * GB, "vmi", 1, { tag: "docker-raw" }),
							]),
						]),
					]),
					dir("log", [agg(40, 0.3 * GB, "sys", 1, 2)]),
				]),
			]),
			dir("com.utmapp.UTM", [
				dir("Data", [
					dir("Documents", [
						dir("Ubuntu 24.04.utm", [
							dir("Data", [
								file(`${r.uuid()}.qcow2`, 31.4 * GB, "vmi", 96),
								file("efi_vars.fd", 64 * MB, "vmi", 96),
							]),
							file("config.plist", 4 * KB, "sys", 96),
						]),
						dir("Windows 11 ARM.utm", [
							dir("Data", [file(`${r.uuid()}.qcow2`, 22.4 * GB, "vmi", 604)]),
							file("config.plist", 4 * KB, "sys", 604),
						]),
					]),
				]),
			]),
			...smallContainers(r, 9.4 * GB),
		]),
		dir("Application Support", [
			dir("Steam", [
				dir("steamapps", [
					dir("common", [
						dir("Hades II", [agg(2_900, 9.8 * GB, "bin", 120, 200)]),
						dir("Stray", [agg(1_900, 3.6 * GB, "bin", 520, 120)]),
						dir("Factorio", [agg(3_100, 3.1 * GB, "bin", 44, 180)]),
						dir("Balatro", [agg(90, 0.2 * GB, "bin", 70, 4)]),
					]),
				]),
			]),
			dir("Adobe", [
				dir("Common", [
					dir("Media Cache Files", [agg(3_600, 6.4 * GB, "vid", 22, 30)], {
						tag: "app-cache",
					}),
				]),
				dir("CoreSync", [agg(900, 0.7 * GB, "sys", 4, 60)]),
			]),
			dir("MacWhisper", [
				dir("models", [
					file("whisper-large-v3.safetensors", 3.09 * GB, "mdl", 210, {
						dup: "whisper-large-v3-1",
					}),
					file("ggml-small.en.bin", 0.47 * GB, "mdl", 210),
				]),
			]),
			dir("Code", [
				dir("User", [
					dir("workspaceStorage", [agg(4_100, 2.1 * GB, "sys", 2, 600)]),
				]),
				dir("CachedExtensionVSIXs", [agg(120, 0.8 * GB, "arc", 30, 0)], {
					tag: "app-cache",
				}),
			]),
			dir("Slack", [
				dir("Service Worker", [
					dir("CacheStorage", [agg(2_300, 1.9 * GB, "sys", 1, 40)], {
						tag: "app-cache",
					}),
				]),
			]),
			dir("Google", [
				dir("Chrome", [
					dir("Default", [
						dir("Service Worker", [agg(3_900, 2.2 * GB, "sys", 1, 80)], {
							tag: "app-cache",
						}),
						dir("IndexedDB", [agg(1_200, 1.4 * GB, "sys", 1, 60)]),
						agg(2_800, 0.9 * GB, "sys", 1, 90),
					]),
				]),
			]),
			dir("Figma", [agg(1_400, 1.2 * GB, "sys", 6, 40)]),
			dir("Blackmagic Design", [agg(2_100, 2.6 * GB, "sys", 40, 90)]),
			dir("Claude", [agg(900, 0.8 * GB, "sys", 1, 40)]),
			...fill(r, 6.8 * GB, 42_000, {
				type: "sys",
				age: () => r.log(1, 700),
				dirNames: [
					"com.raycast.macos",
					"obsidian",
					"discord",
					"Spotify",
					"zoom.us",
					"CloudDocs",
					"Knowledge",
					"FileProvider",
					"Arc",
					"AddressBook",
					"CallHistoryDB",
					"Dock",
					"Zed",
					"Mozilla",
					"TablePlus",
					"com.apple.sharedfilelist",
				],
				fileName: () => `${r.lower(8)}.db`,
				depth: 1,
				minDir: 120 * MB,
			}),
		]),
		dir("Caches", [
			dir(
				"Homebrew",
				[
					dir("downloads", [agg(412, 7.4 * GB, "arc", 18, 0)]),
					dir("Cask", [agg(26, 2.1 * GB, "arc", 60, 0)]),
				],
				{ tag: "pkg-cache" },
			),
			dir("pip", [agg(8_900, 2.3 * GB, "arc", 30, 1200)], { tag: "pkg-cache" }),
			dir("go-build", [agg(31_000, 3.1 * GB, "bin", 5, 256)], {
				tag: "pkg-cache",
			}),
			dir("Yarn", [agg(64_000, 1.6 * GB, "src", 400, 9000)], {
				tag: "pkg-cache",
			}),
			dir(
				"ms-playwright",
				[
					dir("chromium-1148", [agg(410, 0.62 * GB, "bin", 90, 30)]),
					dir("chromium_headless_shell-1148", [
						agg(40, 0.28 * GB, "bin", 90, 6),
					]),
					dir("firefox-1466", [agg(390, 0.41 * GB, "bin", 90, 30)]),
					dir("webkit-2104", [agg(520, 0.39 * GB, "bin", 90, 30)]),
					dir("chromium-1134", [agg(410, 0.6 * GB, "bin", 380, 30)]),
				],
				{ tag: "pkg-cache" },
			),
			dir("com.spotify.client", [agg(1_800, 5.2 * GB, "aud", 1, 30)], {
				tag: "app-cache",
			}),
			dir("Google", [
				dir("Chrome", [
					dir("Default", [
						dir("Cache", [agg(21_000, 2.6 * GB, "sys", 0, 4)], {
							tag: "app-cache",
						}),
					]),
				]),
			]),
			dir("company.thebrowser.Browser", [agg(9_400, 1.2 * GB, "sys", 0, 30)], {
				tag: "app-cache",
			}),
			dir("com.apple.dt.Xcode", [agg(3_300, 1.8 * GB, "sys", 2, 40)], {
				tag: "app-cache",
			}),
			dir("JetBrains", [agg(18_000, 2.1 * GB, "sys", 300, 900)], {
				tag: "app-cache",
			}),
			...fill(r, 3.9 * GB, 68_000, {
				type: "sys",
				age: () => r.log(0.5, 300),
				dirNames: [
					"com.apple.Safari",
					"CloudKit",
					"com.apple.nsurlsessiond",
					"SiriTTS",
					"com.apple.python",
					"node-gyp",
					"typescript",
					"com.openai.chat",
					"com.figma.Desktop",
					"GeoServices",
					"com.apple.akd",
					"com.apple.bird",
				],
				fileName: () => `${r.hex(16)}.cache`,
				depth: 1,
				minDir: 100 * MB,
			}),
		]),
		dir(
			"pnpm",
			[
				dir("store", [
					dir("v10", [
						dir(
							"files",
							Array.from({ length: 256 }, (_, i) =>
								dir(i.toString(16).padStart(2, "0"), [
									agg(
										r.int(560, 860),
										r.range(40, 52) * MB,
										"src",
										r.log(1, 500),
										0,
									),
								]),
							),
						),
						dir("index", [agg(52_000, 0.4 * GB, "src", 1, 256)]),
					]),
				]),
			],
			{ tag: "pnpm-store" },
		),
		dir("Android", [
			dir("sdk", [
				dir("system-images", [
					dir("android-35", [
						dir("google_apis_playstore", [
							dir("arm64-v8a", [
								file("system.img", 6.1 * GB, "vmi", 410),
								file("vendor.img", 0.8 * GB, "vmi", 410),
								agg(40, 1.7 * GB, "vmi", 410, 3),
							]),
						]),
					]),
				]),
				dir("ndk", [
					dir("27.2.12479018", [agg(21_000, 3.1 * GB, "bin", 410, 2400)]),
				]),
				dir("emulator", [agg(1_100, 0.9 * GB, "bin", 410, 90)]),
				dir("platforms", [agg(3_400, 0.8 * GB, "bin", 410, 120)]),
				dir("build-tools", [agg(900, 0.6 * GB, "bin", 410, 40)]),
			]),
		]),
		dir("Messages", [
			dir(
				"Attachments",
				fill(r, 12.4 * GB, 18_000, {
					type: "img",
					types: () => (r.chance(0.3) ? "vid" : "img"),
					age: () => r.log(2, 2600),
					dirNames: Array.from({ length: 64 }, (_, i) =>
						i.toString(16).padStart(2, "0"),
					),
					fileName: () => `IMG_${r.int(1000, 9999)}.MOV`,
					depth: 2,
					bigFile: 0.5 * GB,
					minDir: 0.3 * GB,
				}),
			),
		]),
		dir("Mobile Documents", [
			dir(
				"com~apple~CloudDocs",
				fill(r, 14.1 * GB, 9_000, {
					type: "doc",
					types: () => r.pick(["doc", "doc", "img", "arc"] as const),
					age: () => r.log(3, 1900),
					dirNames: PROJECT_WORDS,
					fileName: () =>
						`${r.pick(["Portfolio", "Deck", "Scans", "Backup"])} ${r.int(2019, 2026)}.${r.pick(["key", "pdf", "zip"])}`,
					depth: 2,
					bigFile: 0.3 * GB,
					minDir: 0.4 * GB,
				}),
			),
		]),
		dir("Mail", [dir("V10", [agg(118_000, 6.3 * GB, "doc", 1, 3400)])]),
		dir("Group Containers", [agg(24_000, 9.1 * GB, "sys", 2, 1100)]),
		dir(
			"Logs",
			[
				dir("DiagnosticReports", [agg(1_900, 0.9 * GB, "sys", 3, 0)]),
				agg(6_400, 1.2 * GB, "sys", 1, 110),
			],
			{ tag: "logs" },
		),
	]);

	// ~/Pictures
	const pictures = dir("Pictures", [
		photosLibrary(r, 186 * GB),
		dir("Lightroom", [
			dir(
				"Lightroom Catalog Previews.lrdata",
				[agg(48_000, 9.3 * GB, "img", 60, 4096)],
				{ tag: "app-cache" },
			),
			file("Lightroom Catalog.lrcat", 1.8 * GB, "doc", 60),
			dir("Backups", [agg(14, 4.6 * GB, "arc", 300, 14)]),
		]),
		dir("Screenshots", [agg(3_400, 2.8 * GB, "img", 2, 0)]),
		dir("Capture One", [agg(9_200, 3.9 * GB, "img", 700, 60)]),
	]);

	// ~/Projects
	const projects = dir("Projects", [
		project(r, "tidewater-site", "next", 4.1, 1),
		project(r, "atlas-monorepo", "monorepo", 13.2, 2),
		project(r, "orbit-engine", "rust", 21.4, 3),
		project(r, "harbor-ios", "swift", 6.8, 1),
		project(r, "lumen-ml", "ml", 48.6, 5),
		project(r, "signal-desk", "electron", 3.6, 11),
		project(r, "kiln-cli", "go", 0.9, 30),
		project(r, "pier-api", "next", 2.2, 44),
		project(r, "glasshouse", "site", 1.6, 62),
		project(r, "fathom-docs", "site", 1.3, 90),
		project(r, "lantern-app", "swift", 3.9, 6),
		project(r, "meridian-maps", "next", 2.9, 22),
		project(r, "coral-shaders", "rust", 5.1, 130),
		project(r, "slate-editor", "electron", 2.8, 48),
		dir("_archive", [
			project(r, "tern-bot", "next", 1.9, 520),
			project(r, "wharf-infra", "go", 0.7, 610),
			project(r, "quarry-data", "site", 1.4, 700),
			project(r, "ferry-sync", "electron", 2.4, 760),
			project(r, "bramble-2023", "next", 1.7, 980),
		]),
	]);

	// ~/.cache
	const cache = dir(".cache", [
		dir("huggingface", [
			dir("hub", [
				hfModel(
					r,
					"meta-llama/Llama-3.1-8B-Instruct",
					[4.98, 5.0, 4.92, 1.17],
					190,
					"llama-3.1-8b",
				),
				hfModel(
					r,
					"Qwen/Qwen2.5-Coder-14B-Instruct",
					[3.95, 3.86, 3.86, 3.86, 3.86, 3.86, 3.86, 2.43],
					60,
				),
				hfModel(r, "black-forest-labs/FLUX.1-schnell", [23.8, 9.52, 0.34], 140),
				hfModel(r, "openai/whisper-large-v3", [3.09], 210, "whisper-large-v3"),
				hfModel(
					r,
					"stabilityai/stable-diffusion-xl-base-1.0",
					[5.14, 1.39, 0.33],
					520,
				),
				hfModel(r, "sentence-transformers/all-MiniLM-L6-v2", [0.09], 300),
			]),
			dir("datasets", [agg(1_400, 11.8 * GB, "arc", 120, 30)]),
		]),
		dir("uv", [agg(86_000, 6.1 * GB, "src", 3, 9100)], { tag: "pkg-cache" }),
		dir("torch", [dir("kernels", [agg(900, 0.8 * GB, "bin", 30, 20)])]),
		dir("puppeteer", [agg(420, 0.6 * GB, "bin", 200, 40)], {
			tag: "pkg-cache",
		}),
		dir("pre-commit", [agg(12_000, 0.4 * GB, "src", 40, 1100)]),
	]);

	const lmstudio = dir(".lmstudio", [
		dir("models", [
			dir("lmstudio-community", [
				dir("Meta-Llama-3.1-8B-Instruct-GGUF", [
					file("Meta-Llama-3.1-8B-Instruct-Q8_0.gguf", 8.54 * GB, "mdl", 200),
				]),
				dir("Qwen2.5-Coder-14B-Instruct-GGUF", [
					file("Qwen2.5-Coder-14B-Instruct-Q8_0.gguf", 15.7 * GB, "mdl", 75, {
						dup: "qwen-coder-q8-1",
					}),
				]),
				dir("gemma-3-27b-it-GGUF", [
					file("gemma-3-27b-it-Q4_K_M.gguf", 16.5 * GB, "mdl", 40),
				]),
				dir("Mistral-Small-3.1-24B-Instruct-2503-GGUF", [
					file(
						"Mistral-Small-3.1-24B-Instruct-2503-Q4_K_M.gguf",
						14.3 * GB,
						"mdl",
						150,
					),
				]),
			]),
		]),
		dir("conversations", [agg(420, 0.2 * GB, "doc", 2, 4)]),
	]);

	const ollama = dir(".ollama", [
		dir("models", [
			dir("blobs", [
				file(`sha256-${r.hex(64)}`, 15.7 * GB, "mdl", 73, {
					dup: "qwen-coder-q8-1",
				}),
				file(`sha256-${r.hex(64)}`, 9.0 * GB, "mdl", 120),
				file(`sha256-${r.hex(64)}`, 2.02 * GB, "mdl", 260),
				file(`sha256-${r.hex(64)}`, 0.27 * GB, "mdl", 260),
				agg(22, 0.4 * MB, "sys", 73),
			]),
			dir("manifests", [agg(8, 24 * KB, "sys", 73, 12)]),
		]),
	]);

	const music = dir("Music", [
		dir(
			"Logic",
			[
				"Tidewater Score",
				"Harbour Theme",
				"Nordkapp Ambience",
				"Sketch 0419",
				"Sketch 0611",
				"Studio Session A",
				"Studio Session B",
			].map((song, i) =>
				dir(`${song}.logicx`, [
					dir("Media", [
						dir("Audio Files", [
							agg(
								r.int(60, 400),
								r.log(0.9, 6.4) * GB,
								"aud",
								[30, 30, 800, 160, 110, 600, 600][i],
								0,
							),
						]),
					]),
					dir("Alternatives", [
						agg(
							r.int(4, 20),
							r.log(20, 200) * MB,
							"aud",
							[30, 30, 800, 160, 110, 600, 600][i],
							4,
						),
					]),
				]),
			),
		),
		dir("Music", [
			dir("Media.localized", [
				dir(
					"Music",
					fill(r, 30.8 * GB, 9_800, {
						type: "aud",
						age: () => r.log(200, 3600),
						dirNames: [
							"Bonobo",
							"Floating Points",
							"Jon Hopkins",
							"Nils Frahm",
							"Ólafur Arnalds",
							"Four Tet",
							"Burial",
							"Rival Consoles",
							"Kiasmos",
							"Moderat",
							"Tycho",
							"Boards of Canada",
							"Aphex Twin",
							"Max Richter",
							"Hania Rani",
							"Caribou",
						],
						fileName: () =>
							`${r.int(1, 12).toString().padStart(2, "0")} ${r.pick(["Kerala", "Silhouettes", "Open Eye Signal", "Says", "re:member", "Baby", "Archangel", "Odyssey", "Blurred", "Bad Kingdom"])}.m4a`,
						depth: 2,
						bigFile: 0.2 * GB,
						minDir: 0.8 * GB,
					}),
				),
			]),
		]),
		dir("Samples", [
			dir(
				"Splice",
				fill(r, 10.9 * GB, 62_000, {
					type: "aud",
					age: () => r.log(30, 1400),
					dirNames: [
						"Cinematic Textures",
						"Modular Pulses",
						"Tape Loops",
						"Field Recordings",
						"Analog Drums",
						"Granular Pads",
						"Organic Percussion",
						"Deep Bass",
						"Vocal Chops",
						"Foley Kit",
					],
					fileName: () => `${r.lower(6)}_loop_${r.int(80, 140)}bpm.wav`,
					depth: 1,
					minDir: 0.3 * GB,
				}),
			),
		]),
	]);

	const downloads = dir("Downloads", [
		file("Xcode_26.xip", 3.1 * GB, "arc", 94, { tag: "installer" }),
		file("DaVinci_Resolve_Studio_20.1_Mac.dmg", 3.4 * GB, "arc", 150, {
			tag: "installer",
		}),
		file("ubuntu-24.04.2-desktop-arm64.iso", 3.2 * GB, "arc", 360, {
			tag: "installer",
		}),
		file(
			"Windows11_InsiderPreview_Client_ARM64_en-us_26100.iso",
			5.9 * GB,
			"arc",
			610,
			{ tag: "installer" },
		),
		file("Blender-4.5.2-macos-arm64.dmg", 0.38 * GB, "arc", 70, {
			tag: "installer",
		}),
		file("Docker-4.44.dmg", 0.61 * GB, "arc", 200, { tag: "installer" }),
		file("LM-Studio-0.3.25-arm64.dmg", 0.52 * GB, "arc", 120, {
			tag: "installer",
		}),
		file("Unity-6000.0.40f1.pkg", 2.7 * GB, "arc", 400, { tag: "installer" }),
		file("footage-selects.zip", 11.2 * GB, "arc", 34),
		file("RAW_backup_2019.zip", 8.4 * GB, "arc", 1180),
		file("client-review-v7.mov", 2.9 * GB, "vid", 26),
		dir("fonts", [agg(460, 0.7 * GB, "doc", 260, 30)]),
		dir("papers", [agg(1_200, 1.9 * GB, "doc", 90, 12)]),
		agg(1_840, 4.3 * GB, "doc", 60, 90),
	]);

	const documents = dir(
		"Documents",
		fill(r, 23.6 * GB, 41_000, {
			type: "doc",
			types: () => r.pick(["doc", "doc", "doc", "img", "arc", "vid"] as const),
			age: () => r.log(2, 2400),
			dirNames: PROJECT_WORDS,
			fileName: () =>
				`${r.pick(["Talk", "Keynote", "Brand Book", "Recording", "Archive"])} ${r.int(2019, 2026)}.${r.pick(["key", "pdf", "zip", "mov"])}`,
			depth: 3,
			bigFile: 0.35 * GB,
			minDir: 0.25 * GB,
		}),
	);

	const trash = dir(
		".Trash",
		[
			file("footage-selects-old.zip", 3.1 * GB, "arc", 12),
			file("Screen Recording 2026-08-11 at 10.02.14.mov", 1.4 * GB, "vid", 47),
			dir("harbor-ios copy", [agg(9_400, 1.1 * GB, "src", 30, 800)]),
			agg(412, 1.6 * GB, "doc", 20, 30),
		],
		{ tag: "trash" },
	);

	const dotfiles = [
		dir(".npm", [dir("_cacache", [agg(41_000, 3.4 * GB, "src", 8, 4200)])], {
			tag: "pkg-cache",
		}),
		dir(".cargo", [
			dir("registry", [
				dir("cache", [agg(1_900, 1.6 * GB, "arc", 20, 2)], {
					tag: "pkg-cache",
				}),
				dir("src", [agg(96_000, 2.6 * GB, "src", 20, 11_000)], {
					tag: "pkg-cache",
				}),
				dir("index", [agg(18_000, 0.3 * GB, "src", 3, 900)]),
			]),
			dir("git", [agg(12_000, 1.1 * GB, "src", 60, 1400)]),
			dir("bin", [agg(24, 0.4 * GB, "bin", 60, 0)]),
		]),
		dir(".rustup", [
			dir("toolchains", [
				dir("stable-aarch64-apple-darwin", [
					agg(24_000, 1.4 * GB, "bin", 25, 1900),
				]),
				dir("nightly-aarch64-apple-darwin", [
					agg(24_000, 1.5 * GB, "bin", 9, 1900),
				]),
				dir("1.82.0-aarch64-apple-darwin", [
					agg(23_000, 1.4 * GB, "bin", 380, 1900),
				]),
				dir("1.79.0-aarch64-apple-darwin", [
					agg(22_000, 1.3 * GB, "bin", 520, 1900),
				]),
			]),
		]),
		dir(".android", [
			dir("avd", [
				dir("Pixel_9_API_35.avd", [
					file("userdata-qemu.img", 6.4 * GB, "vmi", 410),
					file("cache.img", 0.9 * GB, "vmi", 410),
					agg(30, 0.8 * GB, "vmi", 410, 4),
				]),
			]),
		]),
		dir(".vscode", [
			dir("extensions", [agg(38_000, 1.1 * GB, "src", 5, 5200)]),
		]),
		dir(
			".bun",
			[
				dir("install", [
					dir("cache", [agg(21_000, 1.2 * GB, "src", 14, 3100)]),
				]),
			],
			{ tag: "pkg-cache" },
		),
		dir(".docker", [agg(40, 0.2 * GB, "sys", 9, 12)]),
		dir(".local", [agg(3_100, 0.6 * GB, "bin", 30, 300)]),
		agg(96, 4.1 * MB, "doc", 1, 0, "dotfiles"),
	];

	const ada = dir("ada", [
		movies,
		library,
		pictures,
		projects,
		cache,
		lmstudio,
		ollama,
		music,
		downloads,
		documents,
		dir("Desktop", [agg(620, 3.6 * GB, "doc", 3, 30)]),
		trash,
		...dotfiles,
	]);

	const users = dir("Users", [
		ada,
		dir("Shared", [
			dir("Adobe", [agg(1_300, 2.3 * GB, "bin", 30, 90)]),
			agg(900, 1.5 * GB, "doc", 200, 40),
		]),
	]);

	const applications = dir("Applications", [
		...APPS.map(([name, gb, age]) =>
			name.endsWith(".app")
				? appBundle(r, name, gb, age)
				: dir(name, [
						appBundle(r, `${name}.app`, gb * 0.9, age),
						dir("Presets", [
							agg(r.int(200, 900), gb * 0.1 * GB, "bin", age, 40),
						]),
					]),
		),
		dir("Utilities", [agg(120, 0.1 * GB, "bin", 60, 40)]),
	]);

	const rootLibrary = dir("Library", [
		dir("Application Support", [
			dir("Logic", [
				dir("Sampler Instruments", [agg(9_400, 12.2 * GB, "aud", 400, 300)]),
				dir("Alchemy Samples", [agg(4_100, 5.9 * GB, "aud", 400, 120)]),
				dir("Ultrabeat Samples", [agg(1_800, 1.4 * GB, "aud", 400, 40)]),
				agg(2_300, 2.6 * GB, "aud", 400, 90),
			]),
			dir("Apple", [agg(12_000, 1.9 * GB, "sys", 30, 900)]),
			dir("Blackmagic Design", [agg(4_100, 1.7 * GB, "bin", 58, 200)]),
		]),
		dir("Audio", [
			dir("Apple Loops", [
				dir("Apple", [agg(38_000, 13.8 * GB, "aud", 400, 2100)]),
			]),
		]),
		dir("Developer", [
			dir("CommandLineTools", [agg(41_000, 4.1 * GB, "bin", 50, 5200)]),
			dir("CoreSimulator", [
				dir("Images", [
					file(`${r.uuid()}.dmg`, 8.9 * GB, "vmi", 6, {
						tag: "sim-runtime:iOS 26.0",
					}),
					file(`${r.uuid()}.dmg`, 8.4 * GB, "vmi", 150, {
						tag: "sim-runtime:iOS 18.6",
					}),
					file(`${r.uuid()}.dmg`, 7.9 * GB, "vmi", 420, {
						tag: "sim-runtime-old:iOS 17.5",
					}),
					file(`${r.uuid()}.dmg`, 3.6 * GB, "vmi", 420, {
						tag: "sim-runtime-old:watchOS 10.5",
					}),
					file(`${r.uuid()}.dmg`, 7.1 * GB, "vmi", 610, {
						tag: "sim-runtime-old:visionOS 1.2",
					}),
				]),
			]),
		]),
		dir("Fonts", [agg(1_100, 0.8 * GB, "doc", 200, 10)]),
		agg(21_000, 3.2 * GB, "sys", 20, 2400, "System support"),
	]);

	const system = dir(
		"System",
		[
			dir("Library", [
				dir("PrivateFrameworks", [agg(142_000, 4.4 * GB, "sys", 11, 21_000)]),
				dir("Frameworks", [agg(98_000, 2.9 * GB, "sys", 11, 14_000)]),
				dir("Assets", [agg(8_400, 1.6 * GB, "sys", 11, 900)]),
				agg(64_000, 1.3 * GB, "sys", 11, 8_800),
			]),
			dir("Applications", [agg(21_000, 0.9 * GB, "bin", 11, 3_000)]),
			dir("iOSSupport", [agg(33_000, 0.8 * GB, "sys", 11, 4_100)]),
			dir("Cryptexes", [agg(900, 0.6 * GB, "sys", 11, 60)]),
		],
		{ sealed: true },
	);

	const privateVar = dir("private", [
		dir("var", [
			dir("vm", [
				file("swapfile0", 2.1 * GB, "sys", 0),
				file("swapfile1", 2.1 * GB, "sys", 0),
				file("swapfile2", 2.1 * GB, "sys", 0),
				file("sleepimage", 1.1 * GB, "sys", 0),
			]),
			dir(
				"folders",
				fill(r, 11.2 * GB, 62_000, {
					type: "sys",
					age: () => r.log(0.2, 90),
					dirNames: Array.from({ length: 24 }, () => `${r.lower(2)}`),
					fileName: () => `${r.hex(12)}.tmp`,
					depth: 2,
					minDir: 0.3 * GB,
				}),
			),
			dir("db", [agg(24_000, 2.4 * GB, "sys", 1, 1200)]),
			dir("log", [agg(1_100, 0.7 * GB, "sys", 0, 60)], { tag: "logs" }),
		]),
		dir("tmp", [agg(310, 0.3 * GB, "sys", 0, 40)]),
	]);

	const opt = dir("opt", [
		dir("homebrew", [
			cellar(r, 12.4 * GB),
			dir("Caskroom", [agg(1_900, 5.6 * GB, "bin", 60, 120)]),
			dir("Library", [dir("Taps", [agg(31_000, 0.6 * GB, "src", 2, 1400)])]),
			dir("share", [agg(18_000, 1.1 * GB, "doc", 20, 1900)]),
			agg(900, 0.3 * GB, "bin", 5, 40),
		]),
	]);

	const usr = dir("usr", [
		dir("local", [agg(9_100, 1.9 * GB, "bin", 90, 700)]),
	]);

	return {
		root: dir(ISO_VOLUME.name, [
			users,
			applications,
			rootLibrary,
			system,
			privateVar,
			opt,
			usr,
		]),
	};
}
