/**
 * 一块卷在内存里的样子:整棵树摊平成先序(父先于子、子按大小从大到小)的一组定长数组。
 *
 * 先序的好处是**一棵子树就是一段连续的下标** `[i, end[i])`:求子树里的叶子、按年龄分桶、
 * 画某个节点的所有后代,都是一段循环,不用递归也不用指针。角度布局也跟着这个顺序:
 * 节点 i 占整卷的 `[a0[i], a1[i])`(单位是圈,0–1),孩子按大小从 a0 起顺时针排开。
 * 所以测量「按目录顺序扫一遍」时,扫到哪儿、角度就走到哪儿 —— 回放的扫描线就是这么来的。
 *
 * 在这里一次算好、之后只读的:每个节点的字节 / 文件 / 子目录总数、十类文件各占多少、
 * 按季度分桶的年龄直方图(估中位年龄、画年龄地层、按年龄筛选都靠它)、
 * 可回收空间规则归属(`claim`)和子树里能拿回多少(`reclaim`)。
 */

import {
	ISO_AGE_BUCKET_DAYS,
	ISO_AGE_BUCKETS,
	ISO_RULES,
	ISO_TYPE_KEYS,
	type IsoDraft,
	type IsoRule,
	type IsoRuleNode,
	type IsoType,
} from "./catalog";

export const TYPE_COUNT = ISO_TYPE_KEYS.length;
/** 24 个季度 + 「更早」一格。 */
export const AGE_BINS = ISO_AGE_BUCKETS + 1;

export const F_DIR = 1;
export const F_AGG = 2;
export const F_SEALED = 4;
/** 折叠成一块的目录(原生测量里太小、不值得展开的):是真路径,能显示、能移到废纸篓,但进不去。 */
export const F_FOLDED = 8;
/** 没能列出内容的目录(权限、隐私保护)。 */
export const F_DENIED = 16;

const TYPE_INDEX = new Map<IsoType, number>(
	ISO_TYPE_KEYS.map((k, i) => [k, i]),
);

export function ageBin(days: number) {
	return Math.min(
		AGE_BINS - 1,
		Math.max(0, Math.floor(days / ISO_AGE_BUCKET_DAYS)),
	);
}

export interface Finding {
	rule: IsoRule;
	/** 在 ISO_RULES 里的下标,也是 `claim` 里记的值。 */
	ruleIndex: number;
	/** 命中的最上层节点,按大小从大到小。 */
	places: number[];
	/** 这些地方一共占多少。 */
	gross: number;
	/** 实际能拿回来多少(乘过 recover;重复文件不算第一份)。 */
	bytes: number;
	files: number;
}

export interface VolumeMeta {
	/** 卷名,也是树根的名字。 */
	name: string;
	capacity: number;
	/** 测量时卷上还剩多少(原生测量才有)。 */
	free?: number;
	fs: string;
	role: string;
	device: string;
	/** demo = 演示卷;volume = 整块数据卷;folder = 一个文件夹(家目录也算)。 */
	source: "demo" | "volume" | "folder";
	/** 家目录在树里的路径(显示成 ~)。 */
	home?: string[];
	/** 文件夹测量时,根在路径开头怎么写:「~」「~/github」「/Volumes/X」。 */
	display?: string;
	/** 树根对应的绝对路径(原生测量才有),显示 / 移到废纸篓用。 */
	root?: string;
	/** 测量时刻的说明。 */
	when: string;
}

/** Volume 读的树:演示卷的生成器和原生测量(src-tauri/src/survey/emit.rs)交过来的都是这个形状。 */
export interface VolumeDraft {
	name: string;
	children?: Draftish[];
	bytes: number;
	files: number;
	dirs: number;
	age: number;
	type: IsoType;
	agg?: boolean;
	dup?: string;
	tag?: string;
	sealed?: boolean;
	folded?: boolean;
	denied?: boolean;
}

type Draftish = VolumeDraft;

export class Volume {
	readonly n: number;
	readonly meta: VolumeMeta;
	readonly name: string[];
	readonly tag: (string | undefined)[];
	readonly parent: Int32Array;
	readonly end: Int32Array;
	readonly depth: Uint8Array;
	readonly kids: Int32Array;
	readonly flags: Uint8Array;
	readonly bytes: Float64Array;
	readonly files: Float64Array;
	readonly dirs: Float64Array;
	readonly a0: Float64Array;
	readonly a1: Float64Array;
	readonly type: Uint8Array;
	readonly dominance: Float32Array;
	readonly typeBytes: Float32Array;
	readonly ageHist: Float32Array;
	readonly age: Float32Array;
	/** 子树里(有字节的)叶子最新 / 最老的年龄,给中位数插值收边用。 */
	private readonly ageLo: Float32Array;
	private readonly ageHi: Float32Array;
	/** 归哪条规则(ISO_RULES 的下标),-1 = 不归任何规则。子树继承。 */
	readonly claim: Int16Array;
	readonly reclaim: Float64Array;
	readonly findings: Finding[];
	readonly reclaimTotal: number;
	readonly maxDepth: number;

	constructor(root: Draftish, meta: VolumeMeta, rules: IsoRule[] = ISO_RULES) {
		this.meta = meta;
		// 1. 子树大小,用来给孩子排序
		const sums = new Map<Draftish, number>();
		let n = 0;
		const sum = (d: Draftish): number => {
			n++;
			if (!d.children) {
				sums.set(d, d.bytes);
				return d.bytes;
			}
			let s = 0;
			for (const c of d.children) s += sum(c);
			sums.set(d, s);
			return s;
		};
		sum(root);
		this.n = n;
		this.name = new Array(n);
		this.tag = new Array(n);
		this.parent = new Int32Array(n);
		this.end = new Int32Array(n);
		this.depth = new Uint8Array(n);
		this.kids = new Int32Array(n);
		this.flags = new Uint8Array(n);
		this.bytes = new Float64Array(n);
		this.files = new Float64Array(n);
		this.dirs = new Float64Array(n);
		this.a0 = new Float64Array(n);
		this.a1 = new Float64Array(n);
		this.type = new Uint8Array(n);
		this.dominance = new Float32Array(n);
		this.typeBytes = new Float32Array(n * TYPE_COUNT);
		this.ageHist = new Float32Array(n * AGE_BINS);
		this.age = new Float32Array(n);
		this.ageLo = new Float32Array(n).fill(Number.POSITIVE_INFINITY);
		this.ageHi = new Float32Array(n).fill(Number.NEGATIVE_INFINITY);
		this.claim = new Int16Array(n).fill(-1);
		this.reclaim = new Float64Array(n);
		const dup: (string | undefined)[] = new Array(n);
		const leafAge = new Float32Array(n);

		// 2. 先序,孩子从大到小(一样大按名字)
		let idx = 0;
		let maxDepth = 0;
		const visit = (d: Draftish, p: number, depth: number) => {
			const i = idx++;
			this.name[i] = d.name;
			this.tag[i] = d.tag;
			this.parent[i] = p;
			this.depth[i] = depth;
			this.bytes[i] = sums.get(d) ?? 0;
			maxDepth = Math.max(maxDepth, depth);
			if (d.sealed) this.flags[i] |= F_SEALED;
			if (d.folded) this.flags[i] |= F_FOLDED;
			if (d.denied) this.flags[i] |= F_DENIED;
			if (p >= 0 && this.flags[p] & F_SEALED) this.flags[i] |= F_SEALED;
			if (d.children) {
				this.flags[i] |= F_DIR;
				const sorted = [...d.children].sort(
					(a, b) =>
						(sums.get(b) ?? 0) - (sums.get(a) ?? 0) ||
						(a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
				);
				this.kids[i] = sorted.length;
				for (const c of sorted) visit(c, i, depth + 1);
			} else {
				if (d.agg) this.flags[i] |= F_AGG;
				this.files[i] = d.files;
				this.dirs[i] = d.dirs;
				leafAge[i] = d.age;
				if (d.bytes > 0) {
					this.ageLo[i] = d.age;
					this.ageHi[i] = d.age;
				}
				this.age[i] = d.age;
				dup[i] = d.dup;
				const t = TYPE_INDEX.get(d.type) ?? TYPE_COUNT - 1;
				this.type[i] = t;
				this.dominance[i] = 1;
				this.typeBytes[i * TYPE_COUNT + t] = d.bytes;
				this.ageHist[i * AGE_BINS + ageBin(d.age)] = d.bytes;
			}
			this.end[i] = idx;
		};
		visit(root, -1, 0);
		this.maxDepth = maxDepth;

		// 3. 自下而上:文件数、目录数、类型与年龄直方图
		for (let i = n - 1; i > 0; i--) {
			const p = this.parent[i];
			this.files[p] += this.files[i];
			this.dirs[p] += this.dirs[i] + (this.flags[i] & F_DIR ? 1 : 0);
			for (let t = 0; t < TYPE_COUNT; t++)
				this.typeBytes[p * TYPE_COUNT + t] +=
					this.typeBytes[i * TYPE_COUNT + t];
			for (let b = 0; b < AGE_BINS; b++)
				this.ageHist[p * AGE_BINS + b] += this.ageHist[i * AGE_BINS + b];
			this.ageLo[p] = Math.min(this.ageLo[p], this.ageLo[i]);
			this.ageHi[p] = Math.max(this.ageHi[p], this.ageHi[i]);
		}
		for (let i = 0; i < n; i++) {
			if (!(this.flags[i] & F_DIR)) continue;
			let best = TYPE_COUNT - 1;
			let bv = -1;
			for (let t = 0; t < TYPE_COUNT; t++) {
				const v = this.typeBytes[i * TYPE_COUNT + t];
				if (v > bv) {
					bv = v;
					best = t;
				}
			}
			this.type[i] = best;
			this.dominance[i] = this.bytes[i] > 0 ? bv / this.bytes[i] : 0;
			this.age[i] = this.medianAgeOf(i);
		}

		// 4. 角度:孩子按大小从父亲的起点顺时针排开
		this.a0[0] = 0;
		this.a1[0] = 1;
		for (let i = 0; i < n; i++) {
			if (!(this.flags[i] & F_DIR)) continue;
			const span = this.a1[i] - this.a0[i];
			let cursor = this.a0[i];
			for (let c = i + 1; c < this.end[i]; c = this.end[c]) {
				const w =
					this.bytes[i] > 0 ? (this.bytes[c] / this.bytes[i]) * span : 0;
				this.a0[c] = cursor;
				this.a1[c] = cursor + w;
				cursor += w;
			}
		}

		// 5. 规则:自上而下,命中的节点整棵子树归它;同一个节点按规则顺序取第一条
		const path: string[] = [];
		const ruleNode: IsoRuleNode = {
			name: "",
			path,
			dir: false,
			agg: false,
			bytes: 0,
			age: 0,
			type: "sys",
		};
		const matchable = rules.map((r) => r.id !== "duplicates");
		for (let i = 0; i < n; i++) {
			path.length = this.depth[i];
			if (i > 0) path[this.depth[i] - 1] = this.name[i];
			if (this.claim[i] >= 0 || this.flags[i] & F_SEALED) continue;
			ruleNode.name = this.name[i];
			ruleNode.tag = this.tag[i];
			ruleNode.dir = !!(this.flags[i] & (F_DIR | F_FOLDED));
			ruleNode.agg = !!(this.flags[i] & F_AGG);
			ruleNode.bytes = this.bytes[i];
			ruleNode.age = this.flags[i] & F_DIR ? this.age[i] : leafAge[i];
			ruleNode.type = ISO_TYPE_KEYS[this.type[i]];
			for (let r = 0; r < rules.length; r++) {
				if (!matchable[r] || !rules[r].match(ruleNode)) continue;
				this.claim.fill(r, i, this.end[i]);
				break;
			}
		}
		// 重复的文件:同一个内容键的第二份起算
		const dupRule = rules.findIndex((r) => r.id === "duplicates");
		if (dupRule >= 0) {
			const seen = new Set<string>();
			for (let i = 0; i < n; i++) {
				const key = dup[i];
				if (!key) continue;
				if (!seen.has(key)) {
					seen.add(key);
					continue;
				}
				if (this.claim[i] < 0) this.claim[i] = dupRule;
			}
		}

		// 6. 每条规则的地方、总量;每个节点子树里能拿回多少
		const byRule = new Map<number, Finding>();
		for (let i = 0; i < n; i++) {
			const r = this.claim[i];
			if (r < 0) continue;
			const p = this.parent[i];
			if (p >= 0 && this.claim[p] === r) continue;
			let f = byRule.get(r);
			if (!f) {
				f = {
					rule: rules[r],
					ruleIndex: r,
					places: [],
					gross: 0,
					bytes: 0,
					files: 0,
				};
				byRule.set(r, f);
			}
			f.places.push(i);
			f.gross += this.bytes[i];
			f.bytes += this.bytes[i] * (rules[r].recover ?? 1);
			f.files += this.files[i];
		}
		this.findings = [...byRule.values()].sort((a, b) => b.bytes - a.bytes);
		for (const f of this.findings)
			f.places.sort((a, b) => this.bytes[b] - this.bytes[a]);
		for (let i = n - 1; i >= 0; i--) {
			const r = this.claim[i];
			const own =
				r >= 0 ? this.bytes[i] * (rules[r].recover ?? 1) : this.reclaim[i];
			this.reclaim[i] = own;
			const p = this.parent[i];
			if (p >= 0 && this.claim[p] < 0) this.reclaim[p] += own;
		}
		this.reclaimTotal = this.reclaim[0];
	}

	isDir(i: number) {
		return (this.flags[i] & F_DIR) !== 0;
	}

	isAgg(i: number) {
		return (this.flags[i] & F_AGG) !== 0;
	}

	/** 能不能钻进去:有孩子的目录。 */
	canEnter(i: number) {
		return this.isDir(i) && this.kids[i] > 0 && this.bytes[i] > 0;
	}

	children(i: number) {
		const out: number[] = [];
		for (let c = i + 1; c < this.end[i]; c = this.end[c]) out.push(c);
		return out;
	}

	ancestors(i: number) {
		const out: number[] = [];
		for (let p = i; p >= 0; p = this.parent[p]) out.push(p);
		return out.reverse();
	}

	/** a 是不是 b 自己或 b 的祖先。 */
	contains(a: number, b: number) {
		return b >= a && b < this.end[a];
	}

	/**
	 * 按字节加权的年龄中位数(天),从直方图里插值。桶是一季度宽,插值的两头收到子树里
	 * 真实的最新 / 最老年龄:一个文件夹全是今天的文件,就是「今天」,不是半个季度。
	 */
	medianAgeOf(i: number) {
		const total = this.bytes[i];
		if (total <= 0) return 0;
		let acc = 0;
		const D = ISO_AGE_BUCKET_DAYS;
		for (let b = 0; b < AGE_BINS; b++) {
			const v = this.ageHist[i * AGE_BINS + b];
			if (acc + v >= total / 2) {
				const u = v > 0 ? (total / 2 - acc) / v : 0;
				const lo = Math.max(b * D, this.ageLo[i]);
				const hi =
					b === AGE_BINS - 1
						? Math.max(lo, this.ageHi[i])
						: Math.min((b + 1) * D, this.ageHi[i]);
				return hi >= lo ? lo + u * (hi - lo) : (b + u) * D;
			}
			acc += v;
		}
		return AGE_BINS * D;
	}

	/** 子树里修改时间落在 [lo, hi) 天之间的字节占比(按季度分桶,刷选贴着桶边)。 */
	ageShare(i: number, lo: number, hi: number) {
		const total = this.bytes[i];
		if (total <= 0) return 0;
		let s = 0;
		for (let b = lo; b < hi; b++) s += this.ageHist[i * AGE_BINS + b];
		return s / total;
	}

	/**
	 * 以 focus 为中心能看见的节点:它的后代里,深度不超过 rings 圈、在这个视图里
	 * 张角不小于 minSpan 圈的。先序输出。张角小于阈值的整棵子树一起跳过(孩子只会更小)。
	 */
	visible(focus: number, rings: number, minSpan: number) {
		const out: number[] = [];
		const span = this.a1[focus] - this.a0[focus];
		if (span <= 0) return out;
		const d0 = this.depth[focus];
		let i = focus + 1;
		const stop = this.end[focus];
		while (i < stop) {
			const s = (this.a1[i] - this.a0[i]) / span;
			if (s < minSpan || this.depth[i] - d0 > rings) {
				i = this.end[i];
				continue;
			}
			out.push(i);
			i++;
		}
		return out;
	}

	/** path() 的反函数:「~/Library/Developer」或「/Applications」→ 节点;找不到给 -1。 */
	find(path: string) {
		let parts = path.split("/").filter(Boolean);
		const display = this.meta.display?.split("/").filter(Boolean);
		if (
			this.meta.source === "folder" &&
			display &&
			display.every((d, k) => parts[k] === d)
		)
			parts = parts.slice(display.length);
		else if (parts[0] === "~")
			parts = [...(this.meta.home ?? []), ...parts.slice(1)];
		return this.findSegments(parts);
	}

	/** 从卷根往下的一串名字 → 节点;找不到给 -1。 */
	findSegments(parts: readonly string[]) {
		let i = 0;
		for (const name of parts) {
			const next = this.children(i).find((c) => this.name[c] === name);
			if (next === undefined) return -1;
			i = next;
		}
		return i;
	}

	/** 从卷根往下的名字(不含根)。 */
	segments(i: number) {
		return this.ancestors(i)
			.slice(1)
			.map((a) => this.name[a]);
	}

	/** 从卷根起的名字,家目录缩成 ~。 */
	path(i: number) {
		const parts = this.segments(i);
		const home = this.meta.home;
		if (home?.every((h, k) => parts[k] === h)) {
			const rest = parts.slice(home.length);
			return rest.length ? `~/${rest.join("/")}` : "~";
		}
		if (this.meta.source === "folder")
			return [this.meta.display ?? this.meta.name, ...parts].join("/");
		return parts.length ? `/${parts.join("/")}` : this.meta.name;
	}

	/** 节点的绝对路径(只有原生测量有);零散小文件的聚合块没有自己的路径,给它所在的目录。 */
	absPath(i: number) {
		const root = this.meta.root;
		if (!root) return null;
		const node = this.isReal(i) ? i : Math.max(0, this.parent[i]);
		const sep = root.includes("\\") && !root.includes("/") ? "\\" : "/";
		const parts = this.segments(node);
		if (!parts.length) return root;
		return `${root.endsWith(sep) ? root : root + sep}${parts.join(sep)}`;
	}

	/** 是一个真的文件或目录(不是「N files」那样的聚合块)。 */
	isReal(i: number) {
		return !(this.flags[i] & F_AGG);
	}

	isFolded(i: number) {
		return (this.flags[i] & F_FOLDED) !== 0;
	}
}

export function demoVolume(
	root: IsoDraft,
	meta: Omit<VolumeMeta, "source">,
): Volume {
	return new Volume(root, { ...meta, source: "demo" });
}
