/**
 * 仪器的引擎:持有卷、相机、视图、悬停与选中、三种读法、年龄筛选、回放的时钟,
 * 每一帧把它们交给 WebGL(relief.ts)和标注层(overlay.ts);React 只订阅一份很小的快照。
 *
 * 视图 = 焦点节点在整卷里的起点与跨度(圈)+ 焦点的深度。钻进 / 退出是在两个视图之间
 * **绕一个不动点做几何缩放**:跨度按对数匀速变化、不动点两头的映射相同,于是画面像
 * 放大镜一样连续推进,既不会一开始冲得太快,也不会在最后慢吞吞地爬。两个互不包含的
 * 节点之间先退到它们最近的公共祖先,再钻下去。
 */

import * as fmt from "./format";
import {
	BASE_Z,
	Camera,
	type Hit,
	PickIndex,
	pick,
	polar,
	RING,
	ringInner,
	ringTop,
	ringWidth,
	SCALE_RADIUS,
	type Vec3,
} from "./geometry";
import { drawOverlay, type OverlayLabel, type OverlayModel } from "./overlay";
import { AMBER, ICE, rgb } from "./palette";
import {
	type LineSeg,
	Relief,
	type ReliefFrame,
	SECTOR_STRIDE,
} from "./relief";
import { Replay } from "./replay";
import {
	AGE_BINS,
	F_AGG,
	F_DIR,
	F_FOLDED,
	F_SEALED,
	type Volume,
} from "./volume";

export type Lens = "survey" | "type" | "age" | "reclaim";
export type ViewMode = "orbit" | "plan";
export type Phase = "boot" | "survey" | "complete";

export interface UiState {
	phase: Phase;
	/** 0–1。 */
	progress: number;
	elapsed: number;
	bytes: number;
	files: number;
	folders: number;
	/** 每秒多少条目,和到目前为止的峰值。 */
	rate: number;
	peak: number;
	log: string[];
	focus: number;
	hover: number;
	select: number;
	lens: Lens;
	view: ViewMode;
	finding: number;
	/** 年龄刷选的桶区间 [lo, hi),没有就 null。 */
	ageRange: [number, number] | null;
	moving: boolean;
	fps: number;
	frameMs: number;
	sectors: number;
	resolution: string;
	version: number;
	ready: boolean;
	failed: boolean;
}

interface View {
	focus: number;
	f0: number;
	span: number;
	fd: number;
}

const MIN_SPAN = 0.00035;
const BIG_SPAN = 0.006;
const BOOT = 1.1;
const LIFT = 0.04;

const ease = (x: number) =>
	x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const damp = (a: number, b: number, rate: number, dt: number) =>
	b + (a - b) * Math.exp(-rate * dt);
/** 年龄 → 色阶位置:四年走完,前段拉开(大多数目录都在一年以内)。 */
const agePos = (days: number) => Math.min(1, Math.max(0, days / 1461) ** 0.55);

export class Engine {
	volume: Volume;
	private relief: Relief | null = null;
	private gl: WebGL2RenderingContext | null = null;
	private canvas: HTMLCanvasElement | null = null;
	private layer: HTMLCanvasElement | null = null;
	private lctx: CanvasRenderingContext2D | null = null;
	private fonts = { display: "sans-serif", mono: "monospace" };
	readonly camera = new Camera();

	// 视图
	private view: View;
	private from: View;
	private to: View;
	private hopStart = 0;
	private hopDur = 0;
	private hops: number[] = [];
	private moving = false;
	private set: number[] = [];
	private inSet = new Int32Array(0);
	private instData = new Float32Array(SECTOR_STRIDE * 1024);
	private rangeData = new Float32Array(1024);
	private pickIndex: PickIndex | null = null;

	// 交互
	private pointer: { x: number; y: number; inside: boolean } = {
		x: 0,
		y: 0,
		inside: false,
	};
	private drag: { x: number; y: number; moved: boolean; id: number } | null =
		null;
	private vel = { yaw: 0, pitch: 0 };
	private lastInteract = -1e9;
	private hover = -1;
	private hubHover = false;
	private select = -1;
	private liftFor = -1;
	private lift = 0;
	private lens: Lens = "survey";
	private lensW: [number, number, number, number] = [1, 0, 0, 0];
	private finding = -1;
	/** 查找:每个节点子树里有多少字节的名字命中(只算最上层的命中),没在查就是 null。 */
	private searchSum: Float64Array | null = null;
	private searchTops: number[] = [];
	private lastViews: View[] = [];
	private ageRange: [number, number] | null = null;
	private labelAlpha = 1;

	// 相机
	private mode: ViewMode = "orbit";
	private yawBase = -0.32;
	private pitchTarget = 0.84;
	private yawTarget = -0.32;
	private zoom = 1;
	private fitDist = { orbit: 3.2, plan: 3.2 };
	private insets = { left: 0, right: 0, top: 0, bottom: 0 };
	private cssW = 1;
	private cssH = 1;
	private dpr = 1;
	private sceneScale = 1;
	private parallax = { x: 0, y: 0 };

	// 时钟与回放
	private replay: Replay | null = null;
	private phase: Phase = "boot";
	private now = 0;
	private started = -1;
	private raf = 0;
	private visible = true;
	private observer: IntersectionObserver | null = null;
	private reduced = false;
	private log: string[] = [];
	private lastLogAt = -1;
	private lastLogNode = -1;
	private rateSamples: { t: number; files: number }[] = [];
	private peak = 0;

	// 性能
	private frames: number[] = [];
	private lastFrame = 0;
	private slow = 0;
	private fast = 0;

	// React
	private listeners = new Set<() => void>();
	private snap: UiState;
	private lastEmit = 0;
	private dirty = true;
	private version = 0;

	constructor(volume: Volume) {
		this.volume = volume;
		this.view = this.viewOf(0);
		this.from = this.view;
		this.to = this.view;
		this.snap = this.makeSnapshot();
	}

	// ---------- React 接口 ----------

	subscribe = (fn: () => void) => {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	};

	getSnapshot = () => this.snap;

	private makeSnapshot(): UiState {
		const v = this.volume;
		const c = this.countersNow();
		const fps =
			this.frames.length > 1
				? 1000 / (this.frames.reduce((a, b) => a + b, 0) / this.frames.length)
				: 0;
		const [sw, sh] = this.relief?.sceneSize ?? [0, 0];
		return {
			phase: this.phase,
			progress: c.progress,
			elapsed: c.elapsed,
			bytes: c.bytes,
			files: c.files,
			folders: c.folders,
			rate: c.rate,
			peak: this.peak,
			log: this.log.slice(),
			focus: this.to.focus,
			hover: this.hover,
			select: this.select,
			lens: this.lens,
			view: this.mode,
			finding: this.finding,
			ageRange: this.ageRange,
			moving: this.moving,
			fps,
			frameMs: this.frames.length ? this.frames[this.frames.length - 1] : 0,
			sectors: this.set.length,
			resolution: `${sw}×${sh}`,
			version: this.version,
			ready: !!this.relief && v.n > 0,
			failed: this.failed,
		};
	}

	private failed = false;

	/** 拿到的 WebGL2:渲染器、浮点缓冲、MSAA 采样数(写进日志,排查用户机器上的画面问题)。 */
	gpu: { renderer: string; floatBuffers: boolean; samples: number } | null =
		null;

	private emit(force = false) {
		const t = performance.now();
		if (!force && t - this.lastEmit < 80) {
			this.dirty = true;
			return;
		}
		this.lastEmit = t;
		this.dirty = false;
		this.snap = this.makeSnapshot();
		for (const l of this.listeners) l();
	}

	// ---------- 挂载 ----------

	attach(
		host: HTMLElement,
		canvas: HTMLCanvasElement,
		layer: HTMLCanvasElement,
	) {
		this.canvas = canvas;
		this.layer = layer;
		this.lctx = layer.getContext("2d");
		const style = getComputedStyle(host);
		this.fonts = {
			display:
				style.getPropertyValue("--font-iso-display").trim() || "sans-serif",
			mono: style.getPropertyValue("--font-iso-mono").trim() || "monospace",
		};
		const gl = canvas.getContext("webgl2", {
			alpha: false,
			antialias: false,
			depth: false,
			premultipliedAlpha: false,
			powerPreference: "high-performance",
		});
		if (!gl) {
			this.failed = true;
			this.emit(true);
			return;
		}
		this.gl = gl;
		try {
			this.relief = new Relief(gl);
			const dbg = gl.getExtension("WEBGL_debug_renderer_info");
			this.gpu = {
				renderer: String(
					gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
				),
				floatBuffers: this.relief.linear,
				samples: Math.min(4, gl.getParameter(gl.MAX_SAMPLES) as number),
			};
		} catch {
			this.failed = true;
			this.emit(true);
			return;
		}
		canvas.addEventListener("webglcontextlost", this.onLost);
		canvas.addEventListener("pointerdown", this.onDown);
		canvas.addEventListener("pointermove", this.onMove);
		canvas.addEventListener("pointerup", this.onUp);
		canvas.addEventListener("pointercancel", this.onCancel);
		canvas.addEventListener("pointerleave", this.onLeave);
		canvas.addEventListener("wheel", this.onWheel, { passive: false });
		this.observer = new IntersectionObserver((e) => {
			this.visible = e[0]?.isIntersecting ?? true;
			if (this.visible) this.loop();
		});
		this.observer.observe(canvas);
		document.addEventListener("visibilitychange", this.onVisibility);
		this.rebuild();
		this.loop();
	}

	detach() {
		cancelAnimationFrame(this.raf);
		this.raf = 0;
		this.observer?.disconnect();
		document.removeEventListener("visibilitychange", this.onVisibility);
		const c = this.canvas;
		if (c) {
			c.removeEventListener("webglcontextlost", this.onLost);
			c.removeEventListener("pointerdown", this.onDown);
			c.removeEventListener("pointermove", this.onMove);
			c.removeEventListener("pointerup", this.onUp);
			c.removeEventListener("pointercancel", this.onCancel);
			c.removeEventListener("pointerleave", this.onLeave);
			c.removeEventListener("wheel", this.onWheel);
		}
		this.relief?.dispose();
		this.relief = null;
		this.gl = null;
	}

	private onLost = (e: Event) => {
		e.preventDefault();
		cancelAnimationFrame(this.raf);
		this.raf = 0;
		this.failed = true;
		this.emit(true);
	};

	private onVisibility = () => {
		if (!document.hidden) this.loop();
	};

	setReduced(r: boolean) {
		if (this.reduced === r) return;
		this.reduced = r;
		if (r && this.phase !== "complete") this.skip();
		this.loop();
	}

	/** 面板占掉的边距(CSS 像素),浮雕放在剩下那块的正中。 */
	setInsets(insets: {
		left: number;
		right: number;
		top: number;
		bottom: number;
	}) {
		this.insets = insets;
		this.fit();
	}

	resize(cssW: number, cssH: number, dpr: number) {
		this.cssW = Math.max(1, cssW);
		this.cssH = Math.max(1, cssH);
		this.dpr = Math.min(2, dpr);
		const c = this.canvas;
		const l = this.layer;
		if (c) {
			c.width = Math.round(this.cssW * this.dpr);
			c.height = Math.round(this.cssH * this.dpr);
		}
		if (l) {
			l.width = Math.round(this.cssW * this.dpr);
			l.height = Math.round(this.cssH * this.dpr);
		}
		this.fit();
		this.loop();
	}

	// ---------- 视图 ----------

	private viewOf(i: number): View {
		const v = this.volume;
		return {
			focus: i,
			f0: v.a0[i],
			span: Math.max(v.a1[i] - v.a0[i], 1e-12),
			fd: v.depth[i],
		};
	}

	private interp(a: View, b: View, e: number): View {
		const sa = a.span;
		const sb = b.span;
		let f0: number;
		let span: number;
		if (Math.abs(sa - sb) < 1e-12 * Math.max(sa, sb)) {
			f0 = a.f0 + (b.f0 - a.f0) * e;
			span = sa;
		} else {
			span = sa ** (1 - e) * sb ** e;
			const x = (b.f0 * sa - a.f0 * sb) / (sa - sb);
			f0 = x - ((x - a.f0) * span) / sa;
		}
		return {
			focus: e < 1 ? a.focus : b.focus,
			f0,
			span,
			fd: a.fd + (b.fd - a.fd) * e,
		};
	}

	/** 钻到节点 i(退出也是它)。互不包含时经过最近的公共祖先。 */
	goTo(i: number) {
		const v = this.volume;
		if (i < 0 || i >= v.n || this.phase !== "complete") return;
		if (!v.canEnter(i)) return;
		const cur = this.hops.length
			? this.hops[this.hops.length - 1]
			: this.to.focus;
		if (cur === i) return;
		let route: number[];
		if (v.contains(cur, i) || v.contains(i, cur)) route = [i];
		else {
			let a = v.parent[i];
			while (a > 0 && !v.contains(a, cur)) a = v.parent[a];
			route = [Math.max(0, a), i];
		}
		this.hops.push(...route);
		if (!this.moving) this.nextHop();
		this.lastInteract = this.now;
		this.emit(true);
	}

	goUp() {
		const f = this.hops.length
			? this.hops[this.hops.length - 1]
			: this.to.focus;
		if (f === 0) {
			this.select = -1;
			this.emit(true);
			return;
		}
		const p = this.volume.parent[f];
		this.goTo(p);
		this.select = f;
	}

	private nextHop() {
		const target = this.hops.shift();
		if (target === undefined) return;
		this.from = this.view;
		this.to = this.viewOf(target);
		const ratio = Math.abs(Math.log(this.from.span / this.to.span)) / Math.LN10;
		this.hopDur = this.reduced
			? 0
			: clamp(0.62 + 0.14 * ratio, 0.62, 1.25) / (this.hops.length ? 1.6 : 1);
		this.hopStart = this.now;
		this.moving = true;
		this.hover = -1;
		this.pickIndex = null;
		const a = this.volume.visible(this.from.focus, RING.rings + 1, MIN_SPAN);
		const b = this.volume.visible(target, RING.rings + 1, MIN_SPAN);
		// 两头的并集,外加两头的焦点自己(一个从轮毂里退出来,一个滑进轮毂)
		const seen = new Set<number>();
		const merged: number[] = [];
		for (const i of [this.from.focus, target, ...a, ...b]) {
			if (i === 0 || seen.has(i)) continue;
			seen.add(i);
			merged.push(i);
		}
		this.upload(merged, [this.from, this.to]);
		if (this.hopDur === 0) this.step(this.now);
	}

	private settle() {
		this.moving = false;
		this.view = this.to;
		const nodes = this.volume.visible(
			this.view.focus,
			RING.rings + 1,
			MIN_SPAN,
		);
		this.upload(nodes, [this.view]);
		const v = this.volume;
		const sectors: { node: number; k: number; t0: number; t1: number }[] = [];
		for (const i of nodes) {
			const k = v.depth[i] - this.view.fd;
			if (k > RING.rings) continue;
			sectors.push({
				node: i,
				k,
				t0: (v.a0[i] - this.view.f0) / this.view.span,
				t1: (v.a1[i] - this.view.f0) / this.view.span,
			});
		}
		this.pickIndex = new PickIndex(sectors);
		if (this.select >= 0 && !v.contains(this.view.focus, this.select))
			this.select = -1;
		this.emit(true);
	}

	private rebuild() {
		this.view = this.viewOf(this.to.focus);
		this.from = this.view;
		this.to = this.view;
		this.settle();
	}

	/** 把一组节点写进实例缓冲。views 用来判断谁是大块(细分多)。 */
	private upload(nodes: number[], views: View[]) {
		this.lastViews = views;
		const v = this.volume;
		const n = nodes.length;
		if (this.instData.length < n * SECTOR_STRIDE)
			this.instData = new Float32Array(Math.ceil(n * 1.5) * SECTOR_STRIDE);
		if (this.inSet.length !== v.n) this.inSet = new Int32Array(v.n);
		else this.inSet.fill(0);
		const spanOf = (i: number) =>
			Math.max(...views.map((w) => (v.a1[i] - v.a0[i]) / w.span));
		const big: number[] = [];
		const small: number[] = [];
		for (const i of nodes) (spanOf(i) >= BIG_SPAN ? big : small).push(i);
		const order = [...big, ...small];
		const d = this.instData;
		const replay = this.replay;
		order.forEach((i, k) => {
			const o = k * SECTOR_STRIDE;
			const a0 = v.a0[i];
			const a1 = v.a1[i];
			const h0 = Math.fround(a0);
			const h1 = Math.fround(a1);
			d[o] = h0;
			d[o + 1] = a0 - h0;
			d[o + 2] = h1;
			d[o + 3] = a1 - h1;
			d[o + 4] = v.depth[i];
			d[o + 5] = i;
			d[o + 6] = Math.min(900, v.files[i] / 2000);
			d[o + 7] =
				// 折叠的目录也是目录:暗玻璃加文件数的细线,只是进不去
				(v.flags[i] & (F_DIR | F_FOLDED) ? 1 : 0) +
				(v.flags[i] & F_AGG ? 2 : 0) +
				(v.flags[i] & F_SEALED ? 4 : 0);
			d[o + 8] = v.type[i];
			d[o + 9] = v.dominance[i];
			d[o + 10] = agePos(v.age[i]);
			d[o + 11] = v.bytes[i] > 0 ? v.reclaim[i] / v.bytes[i] : 0;
			d[o + 12] = replay ? replay.revealAt[i] : -1;
			d[o + 13] = v.claim[i];
			d[o + 14] =
				this.searchSum && v.bytes[i] > 0 ? this.searchSum[i] / v.bytes[i] : 0;
			d[o + 15] = 0;
			this.inSet[i] = k + 1;
		});
		this.set = order;
		this.relief?.setSectors(d, n, big.length);
		this.uploadRange();
	}

	private uploadRange() {
		const n = this.set.length;
		if (this.rangeData.length < n)
			this.rangeData = new Float32Array(Math.ceil(n * 1.5));
		const r = this.ageRange;
		for (let k = 0; k < n; k++)
			this.rangeData[k] = r ? this.volume.ageShare(this.set[k], r[0], r[1]) : 1;
		this.relief?.setRange(this.rangeData.subarray(0, Math.max(1, n)));
	}

	// ---------- 外部的操作 ----------

	setLens(l: Lens) {
		this.lens = l;
		this.emit(true);
		this.loop();
	}

	setMode(m: ViewMode) {
		this.mode = m;
		this.pitchTarget = m === "plan" ? 1.5 : 0.84;
		if (m === "plan") this.yawTarget = 0;
		else this.yawTarget = this.yawBase;
		this.emit(true);
		this.loop();
	}

	zoomBy(f: number) {
		this.zoom = clamp(this.zoom * f, 0.55, 2.2);
		this.lastInteract = this.now;
		this.loop();
	}

	resetCamera() {
		this.zoom = 1;
		this.yawBase = -0.32;
		this.setMode(this.mode);
	}

	setFinding(ruleIndex: number) {
		if (this.finding === ruleIndex) return;
		this.finding = ruleIndex;
		this.emit(true);
		this.loop();
	}

	/** 按名字查整个卷(不分大小写的子串)。返回命中数、总字节和最大的几处。 */
	setSearch(
		query: string,
	): { count: number; bytes: number; top: number[] } | null {
		const v = this.volume;
		const q = query.trim().toLowerCase();
		if (q.length < 2) {
			this.searchSum = null;
			this.searchTops = [];
		} else {
			const tops: number[] = [];
			let i = 1;
			while (i < v.n) {
				if (v.name[i].toLowerCase().includes(q)) {
					tops.push(i);
					i = v.end[i];
				} else i++;
			}
			const sum = new Float64Array(v.n);
			for (const t of tops) sum[t] = v.bytes[t];
			for (let k = v.n - 1; k > 0; k--) sum[v.parent[k]] += sum[k];
			tops.sort((a, b) => v.bytes[b] - v.bytes[a]);
			this.searchSum = sum;
			this.searchTops = tops;
		}
		if (this.set.length)
			this.upload(
				this.set,
				this.lastViews.length ? this.lastViews : [this.view],
			);
		this.emit(true);
		this.loop();
		if (!this.searchSum) return null;
		return {
			count: this.searchTops.length,
			bytes: this.searchSum[0],
			top: this.searchTops.slice(0, 8),
		};
	}

	setAgeRange(r: [number, number] | null) {
		this.ageRange =
			r && r[1] > r[0]
				? [clamp(r[0], 0, AGE_BINS), clamp(r[1], 0, AGE_BINS)]
				: null;
		this.uploadRange();
		this.emit(true);
		this.loop();
	}

	setSelect(i: number) {
		this.select = i;
		this.emit(true);
		this.loop();
	}

	setHoverNode(i: number) {
		if (this.moving) return;
		this.hover = i;
		this.emit(true);
		this.loop();
	}

	/** 把一个地方放进视野:钻到它的父目录(或它自己,如果它能钻),并选中它。 */
	reveal(i: number) {
		const v = this.volume;
		const target = v.parent[i] >= 0 ? v.parent[i] : 0;
		this.goTo(target);
		this.select = i;
		this.emit(true);
	}

	/** 键盘:在同一层里左右走、上下换层、回车钻进去。 */
	key(k: "left" | "right" | "up" | "down" | "enter" | "back") {
		const v = this.volume;
		if (this.phase !== "complete") return false;
		const focus = this.hops.length
			? this.hops[this.hops.length - 1]
			: this.to.focus;
		let s =
			this.select >= 0 &&
			v.contains(focus, this.select) &&
			this.select !== focus
				? this.select
				: -1;
		if (k === "back") {
			this.goUp();
			return true;
		}
		if (k === "enter") {
			if (s >= 0 && v.canEnter(s)) {
				this.goTo(s);
				this.select = -1;
			}
			return true;
		}
		if (s < 0) {
			const kids = v.children(focus).filter((c) => v.bytes[c] > 0);
			if (kids.length) s = kids[0];
		} else if (k === "left" || k === "right") {
			const sib = v.children(v.parent[s]).filter((c) => v.bytes[c] > 0);
			const at = sib.indexOf(s);
			s = sib[(at + (k === "right" ? 1 : sib.length - 1)) % sib.length];
		} else if (k === "down") {
			const kids = v.children(s).filter((c) => v.bytes[c] > 0);
			if (kids.length && v.depth[kids[0]] - v.depth[focus] <= RING.rings)
				s = kids[0];
		} else if (k === "up") {
			if (v.parent[s] !== focus) s = v.parent[s];
		}
		this.select = s;
		this.lastInteract = this.now;
		this.emit(true);
		this.loop();
		return true;
	}

	// ---------- 回放 ----------

	startReplay(duration: number) {
		this.lastDuration = duration;
		this.replay = new Replay(this.volume, duration);
		this.phase = this.reduced ? "complete" : "boot";
		this.started = -1;
		this.log = [];
		this.lastLogAt = -1;
		this.lastLogNode = -1;
		this.peak = 0;
		this.rateSamples = [];
		this.hops = [];
		this.to = this.viewOf(0);
		this.select = -1;
		this.hover = -1;
		this.finding = -1;
		if (this.reduced) this.replay = null;
		this.rebuild();
		this.emit(true);
		this.loop();
	}

	/** 直接落到测完的状态。took 是这次测量「花了多久」(演示卷是记录里的时长)。 */
	skip(took?: number) {
		if (took !== undefined) this.lastDuration = took;
		this.phase = "complete";
		this.replay = null;
		this.rebuild();
		this.emit(true);
		this.loop();
	}

	/** 换一块卷(测完一个真文件夹之后)。took 是真正花了多久,duration 是回放多久。 */
	setVolume(v: Volume, duration: number | null, took: number) {
		this.volume = v;
		this.pickIndex = null;
		this.version++;
		this.hops = [];
		this.to = this.viewOf(0);
		this.select = -1;
		this.hover = -1;
		this.finding = -1;
		this.ageRange = null;
		this.searchSum = null;
		this.searchTops = [];
		if (duration && !this.reduced) this.startReplay(duration);
		else this.skip();
		this.lastDuration = took;
		this.emit(true);
	}

	/**
	 * 同一个地方的新测量(移到废纸篓之后):不回放、视角不动,焦点和选中按名字链找回来;
	 * 找不到(焦点本身被移走了)就退到还在的那一层祖先。
	 */
	replaceVolume(
		v: Volume,
		focus: readonly string[],
		select: readonly string[],
	) {
		const locate = (names: readonly string[]) => {
			for (let k = names.length; k >= 0; k--) {
				const i = v.findSegments(names.slice(0, k));
				if (i >= 0) return { i, exact: k === names.length };
			}
			return { i: 0, exact: false };
		};
		const f = locate(focus);
		const s = select.length ? locate(select) : { i: -1, exact: false };
		this.volume = v;
		this.pickIndex = null;
		this.version++;
		this.hops = [];
		this.hover = -1;
		this.finding = -1;
		this.searchSum = null;
		this.searchTops = [];
		this.replay = null;
		this.phase = "complete";
		this.to = this.viewOf(v.canEnter(f.i) ? f.i : Math.max(0, v.parent[f.i]));
		this.select = s.exact ? s.i : -1;
		this.rebuild();
		this.emit(true);
		this.loop();
	}

	/** 最近一次测量花了多久(回放的时长;跳过也算测完)。 */
	private lastDuration = 0;

	private replayTime() {
		if (this.started < 0) return 0;
		return this.now - this.started - BOOT;
	}

	private countersNow() {
		const v = this.volume;
		const r = this.replay;
		if (this.phase !== "complete" && r) {
			const t = this.replayTime();
			const c = r.counters(Math.max(0, t));
			const progress = clamp(t / r.duration, 0, 1);
			return { ...c, progress, elapsed: Math.max(0, t), rate: this.rateNow() };
		}
		return {
			bytes: v.bytes[0],
			files: v.files[0],
			folders: v.dirs[0],
			progress: 1,
			elapsed: this.lastDuration,
			rate: 0,
		};
	}

	private rateNow() {
		const s = this.rateSamples;
		if (s.length < 2) return 0;
		const a = s[0];
		const b = s[s.length - 1];
		return b.t > a.t ? (b.files - a.files) / (b.t - a.t) : 0;
	}

	// ---------- 指针 ----------

	private local(e: PointerEvent | WheelEvent) {
		const rect = (this.canvas as HTMLCanvasElement).getBoundingClientRect();
		return { x: e.clientX - rect.left, y: e.clientY - rect.top };
	}

	private onDown = (e: PointerEvent) => {
		const p = this.local(e);
		this.drag = { x: p.x, y: p.y, moved: false, id: e.pointerId };
		this.vel = { yaw: 0, pitch: 0 };
	};

	private onMove = (e: PointerEvent) => {
		const p = this.local(e);
		this.pointer = { x: p.x, y: p.y, inside: true };
		const d = this.drag;
		if (d && e.pointerId === d.id) {
			const dx = p.x - d.x;
			const dy = p.y - d.y;
			if (!d.moved && Math.hypot(dx, dy) > 5) {
				d.moved = true;
				this.canvas?.setPointerCapture(e.pointerId);
			}
			if (d.moved) {
				const k = 0.0055;
				this.yawBase -= dx * k;
				this.yawTarget = this.yawBase;
				if (this.mode === "orbit")
					this.pitchTarget = clamp(this.pitchTarget + dy * k * 0.8, 0.32, 1.5);
				this.vel = {
					yaw: -dx * k * 60,
					pitch: this.mode === "orbit" ? dy * k * 0.8 * 60 : 0,
				};
				d.x = p.x;
				d.y = p.y;
				this.lastInteract = this.now;
			}
		}
		this.loop();
	};

	private onUp = (e: PointerEvent) => {
		const d = this.drag;
		this.drag = null;
		if (!d || d.id !== e.pointerId) return;
		if (d.moved) {
			this.canvas?.releasePointerCapture(e.pointerId);
			return;
		}
		const p = this.local(e);
		const hit = this.hitAt(p.x, p.y);
		this.lastInteract = this.now;
		if (!hit) {
			this.select = -1;
		} else if (hit.kind === "hub") {
			this.goUp();
		} else if (this.volume.canEnter(hit.node)) {
			this.goTo(hit.node);
			this.select = -1;
		} else {
			this.select = this.select === hit.node ? -1 : hit.node;
		}
		this.emit(true);
		this.loop();
	};

	private onCancel = () => {
		this.drag = null;
	};

	private onLeave = () => {
		this.pointer.inside = false;
		if (this.hover !== -1 || this.hubHover) {
			this.hover = -1;
			this.hubHover = false;
			this.emit(true);
		}
		this.loop();
	};

	/** 只有整台仪器占满一屏(桌面布局)时才用滚轮缩放;堆叠布局里滚轮留给页面。 */
	wheelZoom = true;

	private onWheel = (e: WheelEvent) => {
		if (!this.wheelZoom && !e.ctrlKey) return;
		e.preventDefault();
		this.zoomBy(Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0012)));
	};

	private hitAt(x: number, y: number): Hit {
		if (this.moving || !this.pickIndex || this.phase === "boot") return null;
		const ray = this.camera.ray(x, y, this.cssW, this.cssH);
		return pick(ray, this.pickIndex);
	}

	// ---------- 相机取景 ----------

	private fit() {
		const cam = new Camera();
		const w = this.cssW;
		const h = this.cssH;
		const fw = Math.max(80, w - this.insets.left - this.insets.right);
		const fh = Math.max(80, h - this.insets.top - this.insets.bottom);
		cam.aspect = w / h;
		const pts: Vec3[] = [];
		for (let i = 0; i < 48; i++) {
			const t = i / 48;
			pts.push(polar(t, SCALE_RADIUS + 0.02, BASE_Z));
			pts.push(polar(t, ringInner(2), RING.hubZ));
		}
		const measure = (pitch: number, yaw: number) => {
			cam.pitch = pitch;
			cam.yaw = yaw;
			let dist = 3.2;
			let box = { x0: 0, x1: 0, y0: 0, y1: 0 };
			for (let it = 0; it < 3; it++) {
				cam.dist = dist;
				cam.shift = [0, 0];
				cam.update();
				box = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
				for (const p of pts) {
					const s = cam.project(p, w, h);
					if (!s) continue;
					box.x0 = Math.min(box.x0, s[0]);
					box.x1 = Math.max(box.x1, s[0]);
					box.y0 = Math.min(box.y0, s[1]);
					box.y1 = Math.max(box.y1, s[1]);
				}
				const need = Math.max(
					(box.x1 - box.x0) / (fw * 0.97),
					(box.y1 - box.y0) / (fh * 0.95),
				);
				dist *= need;
			}
			// 包围盒中心相对画面中心的偏移(NDC),以最终距离为准
			cam.dist = dist;
			cam.update();
			box = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
			for (const p of pts) {
				const s = cam.project(p, w, h);
				if (!s) continue;
				box.x0 = Math.min(box.x0, s[0]);
				box.x1 = Math.max(box.x1, s[0]);
				box.y0 = Math.min(box.y0, s[1]);
				box.y1 = Math.max(box.y1, s[1]);
			}
			const bx = ((box.x0 + box.x1) / 2 / w) * 2 - 1;
			const by = 1 - ((box.y0 + box.y1) / 2 / h) * 2;
			return { dist, bx, by };
		};
		const orbit = measure(0.84, -0.32);
		const plan = measure(1.5, 0);
		this.fitDist = { orbit: orbit.dist, plan: plan.dist };
		const cx = this.insets.left + fw / 2;
		const cy = this.insets.top + fh / 2;
		this.freeCenter = [(cx / w) * 2 - 1, 1 - (cy / h) * 2];
		this.boxOffset = { orbit: [orbit.bx, orbit.by], plan: [plan.bx, plan.by] };
	}

	private freeCenter: [number, number] = [0, 0];
	private boxOffset = { orbit: [0, 0], plan: [0, 0] };

	private updateCamera(dt: number) {
		const cam = this.camera;
		const reduced = this.reduced;
		const idle =
			this.now - this.lastInteract > 5 &&
			!this.drag &&
			this.hover < 0 &&
			this.phase === "complete";
		if (!this.drag) {
			// 惯性
			this.yawBase += this.vel.yaw * dt;
			this.pitchTarget = clamp(
				this.pitchTarget + this.vel.pitch * dt,
				0.32,
				1.5,
			);
			this.vel.yaw = damp(this.vel.yaw, 0, 4, dt);
			this.vel.pitch = damp(this.vel.pitch, 0, 4, dt);
			if (this.mode === "orbit") this.yawTarget = this.yawBase;
			if (idle && !reduced && this.mode === "orbit") {
				this.yawBase += 0.012 * dt;
				this.yawTarget = this.yawBase;
			}
		}
		// 视差:跟着指针偏一点点
		const px =
			this.pointer.inside && !reduced
				? (this.pointer.x / this.cssW - 0.5) * 2
				: 0;
		const py =
			this.pointer.inside && !reduced
				? (this.pointer.y / this.cssH - 0.5) * 2
				: 0;
		this.parallax.x = damp(this.parallax.x, px, 3, dt);
		this.parallax.y = damp(this.parallax.y, py, 3, dt);
		const rate = reduced ? 60 : 5;
		cam.yaw = damp(cam.yaw, this.yawTarget, rate, dt);
		cam.pitch = damp(cam.pitch, this.pitchTarget, rate, dt);
		const planMix = clamp((cam.pitch - 0.84) / (1.5 - 0.84), 0, 1);
		const fitD =
			this.fitDist.orbit + (this.fitDist.plan - this.fitDist.orbit) * planMix;
		cam.dist = damp(cam.dist, fitD / this.zoom, rate, dt);
		const yawP = cam.yaw - this.parallax.x * 0.035;
		const pitchP = clamp(cam.pitch + this.parallax.y * 0.02, 0.3, 1.52);
		const saveYaw = cam.yaw;
		const savePitch = cam.pitch;
		cam.yaw = yawP;
		cam.pitch = pitchP;
		cam.aspect = this.cssW / this.cssH;
		const bo = this.boxOffset.orbit;
		const bp = this.boxOffset.plan;
		const bx = (bo[0] + (bp[0] - bo[0]) * planMix) * this.zoom;
		const by = (bo[1] + (bp[1] - bo[1]) * planMix) * this.zoom;
		cam.shift = [this.freeCenter[0] - bx, this.freeCenter[1] - by];
		cam.update();
		cam.yaw = saveYaw;
		cam.pitch = savePitch;
	}

	// ---------- 每一帧 ----------

	private loop = () => {
		if (this.raf || !this.relief) return;
		this.raf = requestAnimationFrame(this.frame);
	};

	private frame = (ts: number) => {
		this.raf = 0;
		if (!this.relief || !this.gl) return;
		const now = ts / 1000;
		const dt = this.lastFrame ? clamp(now - this.lastFrame, 0, 0.1) : 1 / 60;
		if (this.lastFrame) {
			this.frames.push((now - this.lastFrame) * 1000);
			if (this.frames.length > 30) this.frames.shift();
		}
		this.lastFrame = now;
		this.now = now;
		if (this.started < 0 && this.replay) this.started = now;
		this.step(now);
		this.updateCamera(dt);
		this.updateHover();
		this.lift =
			this.liftFor === this.hover
				? damp(
						this.lift,
						this.hover >= 0 ? LIFT : 0,
						this.reduced ? 60 : 14,
						dt,
					)
				: 0;
		this.liftFor = this.hover;
		const target = (["survey", "type", "age", "reclaim"] as const).map((l) =>
			this.lens === l ? 1 : 0,
		);
		for (let i = 0; i < 4; i++)
			this.lensW[i] = damp(this.lensW[i], target[i], this.reduced ? 60 : 9, dt);
		this.labelAlpha = damp(
			this.labelAlpha,
			this.moving || this.phase !== "complete" ? 0 : 1,
			this.moving ? 18 : 6,
			dt,
		);
		this.tickReplay();
		this.adaptResolution();
		this.draw();
		if (this.dirty) this.emit();
		else if (this.phase !== "complete") this.emit();
		else if (performance.now() - this.lastEmit > 500) this.emit(true);
		// 静止、减弱动态效果时不必每帧重画
		const animating =
			!this.reduced ||
			this.moving ||
			this.phase !== "complete" ||
			!!this.drag ||
			Math.abs(this.vel.yaw) > 1e-3;
		if (this.visible && !document.hidden && animating) this.loop();
		else this.emit(true);
	};

	private step(now: number) {
		if (!this.moving) return;
		const e =
			this.hopDur > 0 ? clamp((now - this.hopStart) / this.hopDur, 0, 1) : 1;
		this.view = this.interp(this.from, this.to, ease(e));
		if (e >= 1) {
			if (this.hops.length) this.nextHop();
			else this.settle();
		}
	}

	private tickReplay() {
		const r = this.replay;
		if (!r || this.phase === "complete") return;
		const t = this.replayTime();
		if (t < 0) {
			if (this.phase !== "boot") this.phase = "boot";
			return;
		}
		if (this.phase === "boot") this.phase = "survey";
		const c = r.counters(t);
		this.rateSamples.push({ t, files: c.files });
		while (this.rateSamples.length > 2 && this.rateSamples[0].t < t - 0.35)
			this.rateSamples.shift();
		this.peak = Math.max(this.peak, this.rateNow());
		// 日志:每 60 ms 记一次正在扫的目录
		if (t - this.lastLogAt > 0.06) {
			const cur = r.current(t);
			if (cur !== this.lastLogNode && cur > 0) {
				this.log.unshift(this.volume.path(cur));
				if (this.log.length > 16) this.log.length = 16;
				this.lastLogNode = cur;
			}
			this.lastLogAt = t;
		}
		if (t >= r.duration) {
			this.phase = "complete";
			this.emit(true);
		}
	}

	private adaptResolution() {
		const f = this.frames;
		if (f.length < 20) return;
		const avg = f.reduce((a, b) => a + b, 0) / f.length;
		if (avg > 22) this.slow++;
		else this.slow = 0;
		// 稳稳贴着垂直同步(60 Hz 下 16.7 ms)就说明还有余量
		if (avg < 18) this.fast++;
		else this.fast = 0;
		if (this.slow > 20 && this.sceneScale > 0.55) {
			this.sceneScale = Math.max(0.55, this.sceneScale * 0.88);
			this.slow = 0;
			this.frames.length = 0;
		} else if (this.fast > 90 && this.sceneScale < 1) {
			this.sceneScale = Math.min(1, this.sceneScale * 1.08);
			this.fast = 0;
		}
	}

	private updateHover() {
		if (!this.pointer.inside || this.drag?.moved || this.moving) return;
		const hit = this.hitAt(this.pointer.x, this.pointer.y);
		const node = hit?.kind === "sector" ? hit.node : -1;
		const hub = hit?.kind === "hub";
		if (this.canvas)
			this.canvas.style.cursor =
				node >= 0
					? this.volume.canEnter(node)
						? "zoom-in"
						: "pointer"
					: hub && this.to.focus !== 0
						? "zoom-out"
						: "grab";
		if (node !== this.hover || hub !== this.hubHover) {
			this.hover = node;
			this.hubHover = hub;
			this.emit(true);
		}
	}

	/** 这一块此刻画在视野里(在实例里、圈号不超出最外一圈)。光柱落在它最近的这样一个祖先上。 */
	private shown(i: number) {
		return (
			this.inSet[i] > 0 && this.volume.depth[i] - this.view.fd <= RING.rings
		);
	}

	/** 节点顶面中心(视图里),给标注与方位臂用。 */
	private centroid(i: number): { p: Vec3; k: number; t: number } | null {
		const v = this.volume;
		const w = this.view;
		const t0 = clamp((v.a0[i] - w.f0) / w.span, 0, 1);
		const t1 = clamp((v.a1[i] - w.f0) / w.span, 0, 1);
		const k = v.depth[i] - w.fd;
		if (k < 0.5 || k > RING.rings + 0.5 || t1 <= t0) return null;
		const r = ringInner(k) + ringWidth(k) / 2;
		const lift = i === this.hover ? this.lift : 0;
		return {
			p: polar((t0 + t1) / 2, r, ringTop(k) + lift),
			k,
			t: (t0 + t1) / 2,
		};
	}

	private draw() {
		const relief = this.relief;
		const canvas = this.canvas;
		if (!relief || !canvas) return;
		relief.resize(canvas.width, canvas.height, this.sceneScale);
		const v = this.volume;
		const cam = this.camera;
		const w = this.view;
		const surveying = this.phase !== "complete" && !!this.replay;
		const rt = this.replayTime();
		const reveal = surveying ? rt : 1e6;
		const read = this.hover >= 0 ? this.hover : this.select;
		const readC = read >= 0 ? this.centroid(read) : null;

		// 3D 的线:方位臂
		const lines: LineSeg[] = [];
		const ice = rgb(ICE);
		const amber = rgb(AMBER);
		if (readC && this.labelAlpha > 0.01) {
			lines.push({
				a: [0, 0, RING.hubZ + 0.004],
				b: readC.p,
				color: [ice[0], ice[1], ice[2], 1.1 * this.labelAlpha],
				width: 1.1,
			});
		}
		// 可回收位置的光柱
		const beams: LineSeg[] = [];
		const beamSpots: { p: Vec3; node: number; bytes: number }[] = [];
		if (this.finding >= 0 && !this.moving) {
			const f = v.findings.find((x) => x.ruleIndex === this.finding);
			if (f) {
				const reps = new Map<number, number>();
				for (const place of f.places.slice(0, 200)) {
					let a = place;
					while (a > 0 && a !== w.focus && !this.shown(a)) a = v.parent[a];
					if (a <= 0 || a === w.focus || !v.contains(w.focus, place)) continue;
					reps.set(a, (reps.get(a) ?? 0) + v.bytes[place]);
				}
				const max = Math.max(1, ...reps.values());
				for (const [node, bytes] of reps) {
					const c = this.centroid(node);
					if (!c) continue;
					const hgt = 0.12 + 0.5 * Math.sqrt(bytes / max);
					const top: Vec3 = [c.p[0], c.p[1], c.p[2] + hgt];
					beams.push({
						a: c.p,
						b: top,
						color: [amber[0], amber[1], amber[2], 0.35],
						width: 9,
					});
					beams.push({
						a: c.p,
						b: top,
						color: [amber[0], amber[1], amber[2], 2.4],
						width: 1.6,
					});
					beamSpots.push({ p: top, node, bytes });
				}
			}
		}

		// 查找命中的地方:冰蓝的光柱
		if (this.searchSum && this.finding < 0 && !this.moving) {
			const reps = new Map<number, number>();
			for (const place of this.searchTops.slice(0, 240)) {
				if (!v.contains(w.focus, place) || place === w.focus) continue;
				let a = place;
				while (a > 0 && a !== w.focus && !this.shown(a)) a = v.parent[a];
				if (a <= 0 || a === w.focus) continue;
				reps.set(a, (reps.get(a) ?? 0) + v.bytes[place]);
			}
			const max = Math.max(1, ...reps.values());
			for (const [node, bytes] of reps) {
				const c = this.centroid(node);
				if (!c) continue;
				const hgt = 0.1 + 0.45 * Math.sqrt(bytes / max);
				const top: Vec3 = [c.p[0], c.p[1], c.p[2] + hgt];
				beams.push({
					a: c.p,
					b: top,
					color: [ice[0], ice[1], ice[2], 0.3],
					width: 8,
				});
				beams.push({
					a: c.p,
					b: top,
					color: [ice[0], ice[1], ice[2], 2.2],
					width: 1.5,
				});
				beamSpots.push({ p: top, node, bytes });
			}
		}

		const hp = this.hover >= 0 ? this.hover : -1;
		const path: [number, number, number] =
			hp >= 0
				? [(v.a0[hp] - w.f0) / w.span, (v.a1[hp] - w.f0) / w.span, v.depth[hp]]
				: [0, 0, -1];
		const focus = w.focus;
		const denom = read >= 0 ? v.bytes[focus] : v.meta.capacity;
		const shown = read >= 0 ? read : focus;
		const boot = this.reduced
			? 1
			: clamp(
					(this.now - (this.started < 0 ? this.now : this.started)) / BOOT,
					0,
					1,
				);
		const sweep = surveying && rt >= 0 ? (this.replay as Replay).sweep(rt) : -1;
		const dialVal = surveying
			? clamp(this.countersNow().bytes / v.meta.capacity, 0, 1)
			: clamp(v.bytes[shown] / Math.max(1, denom), 0, 1);
		const frame: ReliefFrame = {
			view: cam.view,
			proj: cam.proj,
			time: this.now,
			f0: w.f0,
			span: w.span,
			fd: w.fd,
			reveal,
			hover: this.hover,
			select: this.select,
			lift: this.lift,
			path,
			lensW: this.lensW,
			filter: !!this.ageRange,
			finding: this.finding,
			search: !!this.searchSum,
			sheen: this.reduced || surveying ? -1 : (this.now / 14) % 1,
			dial: {
				value: dialVal,
				reclaim: surveying
					? 0
					: clamp(v.reclaim[shown] / Math.max(1, denom), 0, 1),
				boot: this.phase === "boot" ? boot : 1,
			},
			sweep: sweep >= 0 && focus === 0 ? sweep : -1,
			cursor: readC ? readC.t : -1,
			lines,
			beamLines: beams,
			dust: !this.reduced,
			exposure: 1,
		};
		// 背景光晕跟着浮雕的中心
		const hub = cam.project([0, 0, 0], this.cssW, this.cssH);
		if (hub) relief.center = [hub[0] / this.cssW, 1 - hub[1] / this.cssH];
		relief.render(frame);
		this.drawLayer(readC, beamSpots, surveying);
	}

	private drawLayer(
		readC: { p: Vec3; k: number; t: number } | null,
		beamSpots: { p: Vec3; node: number; bytes: number }[],
		surveying: boolean,
	) {
		const ctx = this.lctx;
		if (!ctx) return;
		const v = this.volume;
		const w = this.view;
		const cam = this.camera;
		const W = this.cssW;
		const H = this.cssH;
		const proj = (p: Vec3) => cam.project(p, W, H);
		const hubC = proj([0, 0, RING.hubZ]);
		const hubE = proj([RING.hub, 0, RING.hubZ]);
		const hubN = proj([0, RING.hub, RING.hubZ]);
		const read = this.hover >= 0 ? this.hover : this.select;
		const focus = w.focus;

		// 轮毂读数
		let readout: OverlayModel["readout"] = null;
		if (hubC) {
			if (surveying || this.phase === "boot") {
				const c = this.countersNow();
				const [val, unit] = fmt.bytesParts(c.bytes);
				readout = {
					value: val,
					unit,
					name: this.phase === "boot" ? "CALIBRATING" : "SURVEYING",
					sub: `${fmt.count(c.files)} files`,
					sub2: `${fmt.pct(c.progress)} of the ${v.meta.source === "folder" ? "survey" : "volume"}`,
					accent: false,
				};
			} else {
				const shown = read >= 0 ? read : focus;
				const [val, unit] = fmt.bytesParts(v.bytes[shown]);
				readout = {
					value: val,
					unit,
					name:
						shown === 0
							? v.meta.name.toUpperCase()
							: v.name[shown].toUpperCase(),
					sub:
						read >= 0
							? `${fmt.pct(v.bytes[read] / Math.max(1, v.bytes[focus]))} of view`
							: `${fmt.pct(v.bytes[focus] / v.meta.capacity)} of ${v.meta.source === "folder" ? "survey" : "volume"}`,
					sub2: `${fmt.count(v.files[shown])} files · ${fmt.count(v.dirs[shown])} folders`,
					accent: false,
				};
			}
		}

		// 焦点最大的几个孩子,标在浮雕外面
		const labels: OverlayLabel[] = [];
		// 光柱亮着(可回收 / 查找)的时候,静态标签让位给光柱上的名字
		if (this.labelAlpha > 0.02 && hubC && !beamSpots.length && W >= 640) {
			const kids = v
				.children(focus)
				.filter((c) => v.bytes[c] > 0 && (v.a1[c] - v.a0[c]) / w.span >= 0.035);
			for (const c of kids.slice(0, 7)) {
				const t = ((v.a0[c] + v.a1[c]) / 2 - w.f0) / w.span;
				const a = proj(polar(t, ringInner(1) + ringWidth(1) * 0.5, ringTop(1)));
				const edge = proj(polar(t, SCALE_RADIUS + 0.06, BASE_Z));
				if (!a || !edge) continue;
				labels.push({
					node: c,
					ax: a[0],
					ay: a[1],
					ex: edge[0],
					ey: edge[1],
					name: v.name[c],
					value: fmt.bytes(v.bytes[c]),
					share: fmt.pct(v.bytes[c] / v.bytes[focus]),
					active: c === read,
				});
			}
		}

		// 悬停 / 选中的标注
		let callout: OverlayModel["callout"] = null;
		if (read >= 0 && readC && this.labelAlpha > 0.02) {
			const a = proj(readC.p);
			if (a) {
				const lines: string[] = [];
				lines.push(
					`${fmt.bytes(v.bytes[read])}  ·  ${fmt.pct(v.bytes[read] / Math.max(1, v.bytes[focus]))} of view`,
				);
				if (v.isDir(read) || v.isAgg(read) || v.isFolded(read))
					lines.push(
						`${fmt.count(v.files[read])} files${v.dirs[read] >= 1 ? ` · ${fmt.count(v.dirs[read])} folders` : ""}`,
					);
				lines.push(
					`modified ${fmt.age(v.age[read])} ago`.replace("today ago", "today"),
				);
				const r = v.claim[read];
				const rule =
					r >= 0 ? v.findings.find((f) => f.ruleIndex === r)?.rule : undefined;
				callout = {
					ax: a[0],
					ay: a[1],
					title: v.isAgg(read) ? `${v.name[read]}` : v.name[read],
					kicker: v.isAgg(read)
						? "LOOSE FILES"
						: v.isDir(read)
							? v.canEnter(read)
								? "FOLDER · CLICK TO ENTER"
								: "FOLDER"
							: "FILE",
					path: v.path(v.parent[read]),
					lines,
					flag: rule ? `RECLAIMABLE · ${rule.title.toUpperCase()}` : null,
				};
			}
		}

		// 深度刻度(接缝处)与百分比刻度
		const rings: { x: number; y: number; text: string }[] = [];
		const ticks: { x: number; y: number; text: string }[] = [];
		if (this.labelAlpha > 0.02) {
			for (let k = 1; k <= RING.rings; k++) {
				const p = proj(
					polar(0.012, ringInner(k) + ringWidth(k) * 0.5, ringTop(k) + 0.004),
				);
				if (p) rings.push({ x: p[0], y: p[1], text: `−${w.fd + k}` });
			}
			for (let i = 0; i < 10; i++) {
				const p = proj(polar(i / 10, SCALE_RADIUS + 0.075, BASE_Z));
				if (p)
					ticks.push({ x: p[0], y: p[1], text: i === 0 ? "0" : `${i * 10}` });
			}
		}

		const beams = beamSpots
			.sort((a, b) => b.bytes - a.bytes)
			.slice(0, 5)
			.map((b) => {
				const p = proj(b.p);
				return p
					? {
							x: p[0],
							y: p[1],
							text: `${v.name[b.node]}  ${fmt.bytes(b.bytes)}`,
						}
					: null;
			})
			.filter((b): b is { x: number; y: number; text: string } => !!b);

		const model: OverlayModel = {
			w: W,
			h: H,
			dpr: this.dpr,
			fonts: this.fonts,
			hub:
				hubC && hubE && hubN
					? {
							x: hubC[0],
							y: hubC[1],
							rx: Math.hypot(hubE[0] - hubC[0], hubE[1] - hubC[1]),
							ry: Math.hypot(hubN[0] - hubC[0], hubN[1] - hubC[1]),
						}
					: null,
			readout,
			labels,
			callout,
			rings,
			ticks,
			beams,
			beamColor: this.finding >= 0 ? "amber" : "ice",
			alpha: this.labelAlpha,
			insets: this.insets,
		};
		drawOverlay(ctx, model);
	}
}
