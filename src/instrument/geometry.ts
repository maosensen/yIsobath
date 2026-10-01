/**
 * 浮雕的几何、相机与拾取。CPU 和着色器用同一套公式(下面的 GLSL 片段由同一组常数拼出来),
 * 所以鼠标点到的地方就是画出来的地方。
 *
 * 世界坐标 z 朝上。视图的焦点节点坐在正中(轮毂,第 0 圈);它的孩子是第 1 圈,
 * 孙子第 2 圈…… 每往外一圈:更宽的半径、更窄的环、更低的台阶 —— 一座往外逐级下降的
 * 阶梯。角度从 12 点方向(+y,画面远端)顺时针走,一整圈 = 焦点节点的全部字节。
 *
 * 圈号是连续的:钻进一个目录时,它从第 1 圈滑进轮毂(k: 1 → 0)、它的孩子从第 2 圈滑到
 * 第 1 圈,同一组公式对小数圈号也成立,所以过渡里每一块都在连续地移动,没有跳变。
 */

export const RING = {
	/** 轮毂(焦点节点)的半径。 */
	hub: 0.25,
	/** 第一圈的环宽,往外每圈乘 decay。 */
	w1: 0.13,
	decay: 0.9,
	/** 圈与圈之间的缝。 */
	gap: 0.014,
	/** 每圈往下降多少。 */
	step: 0.055,
	/** 每块的侧壁有多高。 */
	wall: 0.07,
	/** 一个视图里画几圈(再往外一圈淡出)。 */
	rings: 6,
	/** 轮毂顶面的高度。 */
	hubZ: 0.035,
} as const;

export function ringInner(k: number) {
	const { hub, gap, w1, decay } = RING;
	return (
		hub + gap + (w1 * (1 - decay ** (k - 1))) / (1 - decay) + gap * (k - 1)
	);
}

export function ringWidth(k: number) {
	return RING.w1 * RING.decay ** (k - 1);
}

export function ringOuter(k: number) {
	return ringInner(k) + ringWidth(k);
}

export function ringTop(k: number) {
	return -RING.step * (k - 1);
}

/** 整座浮雕最外一圈的外沿(刻度环贴着它)。 */
export const RELIEF_RADIUS = ringOuter(RING.rings);
export const SCALE_RADIUS = RELIEF_RADIUS + 0.045;
export const BASE_Z = ringTop(RING.rings) - RING.wall;
export const FLOOR_Z = BASE_Z - 0.34;

const f = (x: number) => x.toFixed(6);

/** 与上面几个函数逐字相同的 GLSL。 */
export const GLSL_RING = `
float ringInner(float k) {
  return ${f(RING.hub + RING.gap)} + ${f(RING.w1 / (1 - RING.decay))} * (1.0 - pow(${f(RING.decay)}, k - 1.0)) + ${f(RING.gap)} * (k - 1.0);
}
float ringWidth(float k) { return ${f(RING.w1)} * pow(${f(RING.decay)}, k - 1.0); }
float ringTop(float k) { return ${f(-RING.step)} * (k - 1.0); }
const float WALL = ${f(RING.wall)};
const float TAU = 6.283185307179586;
`;

/** 视图角度(圈,0–1,从 12 点顺时针)→ 平面上的点。 */
export function polar(t: number, r: number, z: number): Vec3 {
	const a = t * Math.PI * 2;
	return [r * Math.sin(a), r * Math.cos(a), z];
}

// ---------- 向量与矩阵 ----------

export type Vec3 = [number, number, number];

export const sub = (a: Vec3, b: Vec3): Vec3 => [
	a[0] - b[0],
	a[1] - b[1],
	a[2] - b[2],
];
export const add = (a: Vec3, b: Vec3): Vec3 => [
	a[0] + b[0],
	a[1] + b[1],
	a[2] + b[2],
];
export const scale = (a: Vec3, s: number): Vec3 => [
	a[0] * s,
	a[1] * s,
	a[2] * s,
];
export const dot = (a: Vec3, b: Vec3) =>
	a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0],
];
export const norm = (a: Vec3): Vec3 =>
	scale(a, 1 / Math.hypot(a[0], a[1], a[2]));

export class Camera {
	/** 绕 z 轴转多少(弧度),0 = 从 -y 看向 +y。 */
	yaw = -0.32;
	/** 仰角(弧度),π/2 = 正上方俯视。 */
	pitch = 0.84;
	dist = 3.2;
	fov = (30 * Math.PI) / 180;
	target: Vec3 = [0, 0, -0.12];
	/** 画面主点的偏移(NDC),让浮雕落在两侧面板之间那块空地的正中。 */
	shift: [number, number] = [0, 0];
	aspect = 16 / 9;

	readonly view = new Float32Array(16);
	readonly proj = new Float32Array(16);
	eye: Vec3 = [0, 0, 0];
	private right: Vec3 = [1, 0, 0];
	private up: Vec3 = [0, 0, 1];
	private fwd: Vec3 = [0, 1, 0];

	update() {
		const cp = Math.cos(this.pitch);
		const dir: Vec3 = [
			cp * Math.sin(this.yaw),
			-cp * Math.cos(this.yaw),
			Math.sin(this.pitch),
		];
		this.eye = add(this.target, scale(dir, this.dist));
		const fwd = norm(sub(this.target, this.eye));
		// 俯视到接近正上方时,「上」换成 y 方向,免得 lookAt 退化
		const worldUp: Vec3 =
			this.pitch > 1.5
				? [-Math.sin(this.yaw), Math.cos(this.yaw), 0]
				: [0, 0, 1];
		const right = norm(cross(fwd, worldUp));
		const up = cross(right, fwd);
		this.fwd = fwd;
		this.right = right;
		this.up = up;
		const v = this.view;
		v[0] = right[0];
		v[4] = right[1];
		v[8] = right[2];
		v[12] = -dot(right, this.eye);
		v[1] = up[0];
		v[5] = up[1];
		v[9] = up[2];
		v[13] = -dot(up, this.eye);
		v[2] = -fwd[0];
		v[6] = -fwd[1];
		v[10] = -fwd[2];
		v[14] = dot(fwd, this.eye);
		v[3] = 0;
		v[7] = 0;
		v[11] = 0;
		v[15] = 1;
		const near = 0.05;
		const far = 40;
		const t = 1 / Math.tan(this.fov / 2);
		const p = this.proj;
		p.fill(0);
		p[0] = t / this.aspect;
		p[5] = t;
		// 主点偏移:NDC 整体加 shift(project / ray 两头用同一个矩阵,自然一致)
		p[8] = -this.shift[0];
		p[9] = -this.shift[1];
		p[10] = (far + near) / (near - far);
		p[11] = -1;
		p[14] = (2 * far * near) / (near - far);
	}

	/** 世界点 → 画布上的 CSS 像素(w、h 是画布大小);在相机背后返回 null。 */
	project(p: Vec3, w: number, h: number): [number, number, number] | null {
		const v = this.view;
		const x = v[0] * p[0] + v[4] * p[1] + v[8] * p[2] + v[12];
		const y = v[1] * p[0] + v[5] * p[1] + v[9] * p[2] + v[13];
		const z = v[2] * p[0] + v[6] * p[1] + v[10] * p[2] + v[14];
		if (z > -0.01) return null;
		const pr = this.proj;
		const cw = -z;
		const nx = (pr[0] * x + pr[8] * z) / cw;
		const ny = (pr[5] * y + pr[9] * z) / cw;
		return [(nx * 0.5 + 0.5) * w, (0.5 - ny * 0.5) * h, cw];
	}

	/** 画布上的 CSS 像素 → 世界里的一条射线。 */
	ray(px: number, py: number, w: number, h: number): { o: Vec3; d: Vec3 } {
		const nx = (px / w) * 2 - 1 - this.shift[0];
		const ny = 1 - (py / h) * 2 - this.shift[1];
		const t = Math.tan(this.fov / 2);
		const d = norm(
			add(
				this.fwd,
				add(scale(this.right, nx * t * this.aspect), scale(this.up, ny * t)),
			),
		);
		return { o: this.eye, d };
	}
}

// ---------- 拾取 ----------

export interface RingSector {
	node: number;
	t0: number;
	t1: number;
}

/**
 * 每一圈里按角度排好的扇区。只在视图停稳时建(过渡中不拾取)。
 */
export class PickIndex {
	readonly rings: RingSector[][] = [];

	constructor(sectors: { node: number; k: number; t0: number; t1: number }[]) {
		for (let k = 0; k <= RING.rings; k++) this.rings.push([]);
		for (const s of sectors) {
			const k = Math.round(s.k);
			if (k < 1 || k > RING.rings || s.t1 - s.t0 <= 0) continue;
			this.rings[k].push({ node: s.node, t0: s.t0, t1: s.t1 });
		}
		for (const r of this.rings) r.sort((a, b) => a.t0 - b.t0);
	}

	at(k: number, t: number) {
		const list = this.rings[k];
		let lo = 0;
		let hi = list.length - 1;
		while (lo <= hi) {
			const m = (lo + hi) >> 1;
			const s = list[m];
			if (t < s.t0) hi = m - 1;
			else if (t >= s.t1) lo = m + 1;
			else return s.node;
		}
		return -1;
	}
}

const angleOf = (x: number, y: number) => {
	let t = Math.atan2(x, y) / (Math.PI * 2);
	if (t < 0) t += 1;
	return t;
};

export type Hit =
	| { kind: "sector"; node: number; k: number; t: number }
	| { kind: "hub" }
	| null;

/**
 * 射线打到哪一块:每一圈的顶面、外壁、内壁都求交,按距离从近到远,第一处落在某个扇区上的就是。
 */
export function pick(ray: { o: Vec3; d: Vec3 }, index: PickIndex): Hit {
	const { o, d } = ray;
	const cands: { t: number; k: number; x: number; y: number }[] = [];
	for (let k = 1; k <= RING.rings; k++) {
		const z = ringTop(k);
		const r0 = ringInner(k);
		const r1 = ringOuter(k);
		if (Math.abs(d[2]) > 1e-6) {
			const t = (z - o[2]) / d[2];
			if (t > 0) {
				const x = o[0] + d[0] * t;
				const y = o[1] + d[1] * t;
				const r = Math.hypot(x, y);
				if (r >= r0 && r < r1) cands.push({ t, k, x, y });
			}
		}
		// 两道侧壁:圆柱 x² + y² = R²
		for (const R of [r1, r0]) {
			const a = d[0] * d[0] + d[1] * d[1];
			const b = 2 * (o[0] * d[0] + o[1] * d[1]);
			const c = o[0] * o[0] + o[1] * o[1] - R * R;
			const disc = b * b - 4 * a * c;
			if (a < 1e-9 || disc < 0) continue;
			const s = Math.sqrt(disc);
			for (const t of [(-b - s) / (2 * a), (-b + s) / (2 * a)]) {
				if (t <= 0) continue;
				const pz = o[2] + d[2] * t;
				if (pz <= z && pz >= z - RING.wall)
					cands.push({ t, k, x: o[0] + d[0] * t, y: o[1] + d[1] * t });
			}
		}
	}
	// 轮毂
	if (Math.abs(d[2]) > 1e-6) {
		const t = (RING.hubZ - o[2]) / d[2];
		if (t > 0) {
			const x = o[0] + d[0] * t;
			const y = o[1] + d[1] * t;
			if (Math.hypot(x, y) < RING.hub) cands.push({ t, k: 0, x, y });
		}
	}
	cands.sort((a, b) => a.t - b.t);
	for (const c of cands) {
		if (c.k === 0) return { kind: "hub" };
		const t = angleOf(c.x, c.y);
		const node = index.at(c.k, t);
		if (node >= 0) return { kind: "sector", node, k: c.k, t };
	}
	return null;
}
