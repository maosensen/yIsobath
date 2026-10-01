/**
 * 测量的回放。演示卷是一份测好的记录,这里把它按目录顺序(先序、孩子从大到小)重新
 * 「扫」一遍:每个节点在它被扫到的那一刻升起来。
 *
 * 扫一个节点花的时间按它的条目数算(一个文件一份、一个目录三份,再加一点按字节算的读取),
 * 所以 node_modules 这种一堆小文件的地方扫得慢、几个 GB 的视频一闪而过 —— 和真的测量一样。
 * 又因为先序里的起始角度是单调不减的,扫描线在表盘上也是一圈顺时针走下来的:
 * 为了不让它在文件密的地方停太久,时间里掺了四成按角度匀速的部分。
 */

import { F_DIR, type Volume } from "./volume";

export class Replay {
	readonly duration: number;
	/** 每个节点(先序下标)被扫到的时刻,秒。 */
	readonly revealAt: Float32Array;
	private cumBytes: Float64Array;
	private cumFiles: Float64Array;
	private cumDirs: Float64Array;
	private v: Volume;

	constructor(v: Volume, duration: number) {
		this.v = v;
		this.duration = duration;
		const n = v.n;
		const w = new Float64Array(n);
		let total = 0;
		for (let i = 0; i < n; i++) {
			const dir = v.flags[i] & F_DIR;
			w[i] = dir ? 3 : v.files[i] + v.dirs[i] * 2 + v.bytes[i] / 150e6;
			total += w[i];
		}
		this.revealAt = new Float32Array(n);
		this.cumBytes = new Float64Array(n);
		this.cumFiles = new Float64Array(n);
		this.cumDirs = new Float64Array(n);
		let acc = 0;
		let b = 0;
		let f = 0;
		let d = 0;
		for (let i = 0; i < n; i++) {
			const u = 0.6 * (acc / total) + 0.4 * v.a0[i];
			this.revealAt[i] = u * duration;
			acc += w[i];
			if (v.flags[i] & F_DIR) d += 1;
			else {
				b += v.bytes[i];
				f += v.files[i];
				d += v.dirs[i];
			}
			this.cumBytes[i] = b;
			this.cumFiles[i] = f;
			this.cumDirs[i] = d;
		}
	}

	/** 最后一个在 t 之前被扫到的节点。 */
	indexAt(t: number) {
		const r = this.revealAt;
		let lo = 0;
		let hi = r.length - 1;
		if (t < r[0]) return 0;
		while (lo < hi) {
			const m = (lo + hi + 1) >> 1;
			if (r[m] <= t) lo = m;
			else hi = m - 1;
		}
		return lo;
	}

	/** 扫描线的角度(整卷的圈)。 */
	sweep(t: number) {
		const i = this.indexAt(t);
		const v = this.v;
		if (i >= v.n - 1) return 1;
		const t0 = this.revealAt[i];
		const t1 = this.revealAt[i + 1];
		const u = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
		return v.a0[i] + (v.a0[i + 1] - v.a0[i]) * Math.min(1, Math.max(0, u));
	}

	counters(t: number) {
		const i = this.indexAt(t);
		return {
			bytes: this.cumBytes[i],
			files: this.cumFiles[i],
			folders: this.cumDirs[i],
		};
	}

	/** 这一刻正在扫的目录(最深的那个)。 */
	current(t: number) {
		let i = this.indexAt(t);
		const v = this.v;
		while (i > 0 && !(v.flags[i] & F_DIR)) i = v.parent[i];
		return i;
	}
}
