/**
 * 标注层:一张 2D 画布盖在 WebGL 上面,专画字 —— 轮毂里的读数、焦点最大几个孩子的
 * 引线标签、悬停 / 选中那一块的标注框、每一圈的深度号、刻度环的百分比、光柱顶上的名字。
 *
 * 字不进 WebGL 的后期(不吃辉光、不吃色差),所以放多小都锐。标签分左右两列,各自按
 * 纵坐标排开、间距不够就往下推 —— 不会叠在一起。
 */

export interface OverlayLabel {
	node: number;
	/** 引线起点(扇区上)。 */
	ax: number;
	ay: number;
	/** 引线拐点(浮雕外沿以外)。 */
	ex: number;
	ey: number;
	name: string;
	value: string;
	share: string;
	active: boolean;
}

export interface OverlayModel {
	w: number;
	h: number;
	dpr: number;
	fonts: { display: string; mono: string };
	hub: { x: number; y: number; rx: number; ry: number } | null;
	readout: {
		value: string;
		unit: string;
		name: string;
		sub: string;
		sub2: string;
		accent: boolean;
	} | null;
	labels: OverlayLabel[];
	callout: {
		ax: number;
		ay: number;
		title: string;
		kicker: string;
		path: string;
		lines: string[];
		flag: string | null;
	} | null;
	rings: { x: number; y: number; text: string }[];
	ticks: { x: number; y: number; text: string }[];
	beams: { x: number; y: number; text: string }[];
	beamColor: "amber" | "ice";
	alpha: number;
	insets: { left: number; right: number; top: number; bottom: number };
}

const INK = "rgba(232, 241, 250, 0.94)";
const DIM = "rgba(200, 216, 232, 0.56)";
const FAINT = "rgba(190, 210, 230, 0.32)";
const ICE = "rgba(168, 236, 255, 0.95)";
const AMBER = "rgba(255, 178, 63, 0.98)";

function font(ctx: CanvasRenderingContext2D, f: string, spacing = 0) {
	ctx.font = f;
	(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing =
		`${spacing}px`;
}

/** 太长就从中间截断:~/Library/…/DerivedData。 */
function fitText(ctx: CanvasRenderingContext2D, text: string, max: number) {
	if (ctx.measureText(text).width <= max) return text;
	let lo = 1;
	let hi = text.length;
	while (lo < hi) {
		const m = (lo + hi + 1) >> 1;
		const head = Math.ceil(m * 0.45);
		const t = `${text.slice(0, head)}…${text.slice(text.length - (m - head))}`;
		if (ctx.measureText(t).width <= max) lo = m;
		else hi = m - 1;
	}
	const head = Math.ceil(lo * 0.45);
	return `${text.slice(0, head)}…${text.slice(text.length - (lo - head))}`;
}

type Setter = (px: number, weight?: number, sp?: number) => void;

/** 标注框放在哪、多大:往浮雕外侧放,在轮毂左边的往左、右边的往右,下半圈的放在下面。 */
function calloutBox(
	ctx: CanvasRenderingContext2D,
	m: OverlayModel,
	ui: number,
	mono: Setter,
	disp: Setter,
) {
	const c = m.callout;
	if (!c) return null;
	const pad = 11 * ui;
	const lineH = 15 * ui;
	const maxW = 300 * ui;
	mono(9, 500, 1.4);
	const kw = ctx.measureText(c.kicker).width;
	disp(16, 500, 0.2);
	const title = fitText(ctx, c.title, maxW);
	const tw = ctx.measureText(title).width;
	mono(10, 400, 0);
	const path = fitText(ctx, c.path, maxW);
	const pw = ctx.measureText(path).width;
	mono(11, 400, 0);
	const lw = Math.max(...c.lines.map((l) => ctx.measureText(l).width));
	mono(9.5, 500, 1);
	const fw = c.flag ? ctx.measureText(fitText(ctx, c.flag, maxW)).width : 0;
	const bw = Math.min(maxW, Math.max(kw, tw, pw, lw, fw)) + pad * 2;
	const bh =
		pad * 2 +
		13 * ui +
		20 * ui +
		15 * ui +
		c.lines.length * lineH +
		(c.flag ? 18 * ui : 0);
	const hx = m.hub ? m.hub.x : m.w / 2;
	const hy = m.hub ? m.hub.y : m.h / 2;
	let flipX = c.ax < hx;
	let bx = flipX ? c.ax - 40 * ui - bw : c.ax + 40 * ui;
	let by = c.ay > hy + 20 ? c.ay + 22 * ui : c.ay - bh - 22 * ui;
	if (!flipX && bx + bw > m.w - m.insets.right - 8) {
		flipX = true;
		bx = c.ax - 40 * ui - bw;
	} else if (flipX && bx < m.insets.left + 8) {
		flipX = false;
		bx = c.ax + 40 * ui;
	}
	if (by + bh > m.h - m.insets.bottom - 8) by = c.ay - bh - 22 * ui;
	if (by < m.insets.top + 8) by = c.ay + 22 * ui;
	bx = Math.max(m.insets.left + 8, Math.min(bx, m.w - m.insets.right - bw - 8));
	by = Math.max(m.insets.top + 8, Math.min(by, m.h - m.insets.bottom - bh - 8));
	return { bx, by, bw, bh, pad, lineH, title, path, flipX };
}

export function drawOverlay(ctx: CanvasRenderingContext2D, m: OverlayModel) {
	const { dpr, fonts } = m;
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.textBaseline = "alphabetic";
	const ui = Math.max(0.82, Math.min(1.2, Math.min(m.w / 1440, m.h / 900)));
	const mono = (px: number, weight = 400, sp = 0) =>
		font(
			ctx,
			`${weight} ${Math.round(px * ui * 10) / 10}px ${fonts.mono}`,
			sp * ui,
		);
	const disp = (px: number, weight = 300, sp = 0) =>
		font(
			ctx,
			`${weight} ${Math.round(px * ui * 10) / 10}px ${fonts.display}`,
			sp * ui,
		);

	ctx.save();
	ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
	ctx.shadowBlur = 8;

	// ---------- 深度号、百分比 ----------
	ctx.globalAlpha = m.alpha * 0.9;
	mono(9, 400, 0.6);
	ctx.textAlign = "center";
	ctx.fillStyle = FAINT;
	for (const r of m.rings) ctx.fillText(r.text, r.x, r.y - 4 * ui);
	ctx.fillStyle = DIM;
	mono(9.5, 400, 0.8);
	for (const t of m.ticks) ctx.fillText(t.text, t.x, t.y + 3 * ui);
	ctx.globalAlpha = 1;

	// ---------- 轮毂读数 ----------
	if (m.hub && m.readout) {
		const { x, y, rx } = m.hub;
		const r = m.readout;
		const size = Math.max(22, Math.min(62, rx * 0.4));
		font(ctx, `200 ${size}px ${fonts.display}`, -0.02 * size);
		const vw = ctx.measureText(r.value).width;
		mono(10.5, 400, 0.6);
		const uw = ctx.measureText(r.unit).width;
		const total = vw + 5 + uw;
		const vx = x - total / 2;
		ctx.textAlign = "left";
		font(ctx, `200 ${size}px ${fonts.display}`, -0.02 * size);
		ctx.fillStyle = INK;
		ctx.fillText(r.value, vx, y + size * 0.32);
		mono(10.5, 500, 0.8);
		ctx.fillStyle = ICE;
		ctx.fillText(r.unit, vx + vw + 5, y + size * 0.32 - size * 0.42);
		ctx.textAlign = "center";
		mono(10, 500, 1.6);
		ctx.fillStyle = r.accent ? AMBER : ICE;
		ctx.fillText(fitText(ctx, r.name, rx * 1.75), x, y - size * 0.44);
		mono(10, 400, 0.4);
		ctx.fillStyle = INK;
		ctx.fillText(r.sub, x, y + size * 0.32 + 15 * ui);
		mono(9.5, 400, 0.3);
		ctx.fillStyle = DIM;
		// 放不下就只留第一段(文件数),比从中间截断好读
		const sub2 =
			ctx.measureText(r.sub2).width <= rx * 1.7
				? r.sub2
				: r.sub2.split(" · ")[0];
		ctx.fillText(fitText(ctx, sub2, rx * 1.7), x, y + size * 0.32 + 28 * ui);
	}

	// 标注框占的地方先算出来,和它撞上的静态标签这一帧不画
	const box = m.callout ? calloutBox(ctx, m, ui, mono, disp) : null;
	const hitsBox = (x: number, y: number, w: number, side: number) => {
		if (!box) return false;
		const x0 = side < 0 ? x - w : x;
		const x1 = side < 0 ? x : x + w;
		return (
			x1 > box.bx - 6 &&
			x0 < box.bx + box.bw + 6 &&
			y + 16 > box.by - 6 &&
			y - 14 < box.by + box.bh + 6
		);
	};

	// ---------- 引线标签 ----------
	if (m.labels.length && m.hub && m.alpha > 0.01) {
		ctx.globalAlpha = m.alpha;
		const cx = m.hub.x;
		const top = m.insets.top + 18;
		const bottom = m.h - m.insets.bottom - 18;
		const gap = 34 * ui;
		for (const side of [-1, 1]) {
			const list = m.labels
				.filter((l) => (side < 0 ? l.ex < cx : l.ex >= cx))
				.sort((a, b) => a.ey - b.ey);
			const ys = list.map((l) => l.ey);
			for (let i = 1; i < ys.length; i++)
				ys[i] = Math.max(ys[i], ys[i - 1] + gap);
			const over = ys.length ? ys[ys.length - 1] - bottom : 0;
			if (over > 0) for (let i = 0; i < ys.length; i++) ys[i] -= over;
			for (let i = ys.length - 2; i >= 0; i--)
				ys[i] = Math.min(ys[i], ys[i + 1] - gap);
			for (let i = 0; i < ys.length; i++)
				ys[i] = Math.max(ys[i], top + i * gap);
			list.forEach((l, i) => {
				const y = ys[i];
				const ex = side < 0 ? Math.min(l.ex, cx - 40) : Math.max(l.ex, cx + 40);
				// 标签整段都要落在两侧面板之间的空地里
				// 两行里宽的那行决定位置:名字短、数字长时,数字那行不能钻到左栏底下
				mono(10.5, 400, 0.3);
				const vw = ctx.measureText(`${l.value}  ${l.share}`).width;
				disp(12.5, 500, 1.1);
				const tw =
					Math.max(
						vw,
						Math.min(170 * ui, ctx.measureText(l.name.toUpperCase()).width),
					) + 4;
				const tx =
					side < 0
						? Math.max(ex - 14 * ui, m.insets.left + 8 + tw)
						: Math.min(ex + 14 * ui, m.w - m.insets.right - 8 - tw);
				if (!l.active && hitsBox(tx, y, 150 * ui, side)) return;
				ctx.strokeStyle = l.active ? ICE : "rgba(168, 236, 255, 0.28)";
				ctx.lineWidth = 1;
				ctx.shadowBlur = 0;
				ctx.beginPath();
				ctx.moveTo(l.ax, l.ay);
				ctx.lineTo(ex, y);
				ctx.lineTo(tx - side * 4, y);
				ctx.stroke();
				ctx.fillStyle = l.active ? ICE : "rgba(168, 236, 255, 0.7)";
				ctx.beginPath();
				ctx.arc(l.ax, l.ay, 1.8, 0, Math.PI * 2);
				ctx.fill();
				ctx.shadowBlur = 6;
				ctx.textAlign = side < 0 ? "right" : "left";
				disp(12.5, 500, 1.1);
				ctx.fillStyle = l.active ? "#ffffff" : INK;
				ctx.fillText(
					fitText(ctx, l.name.toUpperCase(), 170 * ui),
					tx,
					y - 2 * ui,
				);
				mono(10.5, 400, 0.3);
				ctx.fillStyle = DIM;
				ctx.fillText(`${l.value}  ${l.share}`, tx, y + 12 * ui);
			});
		}
		ctx.globalAlpha = 1;
	}

	// ---------- 光柱顶上的名字(按纵坐标错开,不叠) ----------
	if (m.beams.length) {
		mono(10, 500, 0.4);
		ctx.textAlign = "left";
		const list = [...m.beams].sort((a, b) => a.y - b.y);
		const ys = list.map((b) => b.y);
		for (let i = 1; i < ys.length; i++)
			ys[i] = Math.max(ys[i], ys[i - 1] + 15 * ui);
		const tint = m.beamColor === "amber" ? AMBER : ICE;
		list.forEach((b, i) => {
			ctx.fillStyle = tint;
			ctx.beginPath();
			ctx.arc(b.x, b.y, 2.2, 0, Math.PI * 2);
			ctx.fill();
			if (ys[i] !== b.y) {
				ctx.strokeStyle = tint;
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.moveTo(b.x, b.y);
				ctx.lineTo(b.x + 6, ys[i] - 3);
				ctx.stroke();
			}
			// 右边放不下(会伸进右栏)就把字放到光柱左边
			const text = fitText(ctx, b.text, 220 * ui);
			const tw = ctx.measureText(text).width;
			const left = b.x + 8 + tw > m.w - m.insets.right - 6;
			ctx.textAlign = left ? "right" : "left";
			ctx.fillText(text, left ? b.x - 8 : b.x + 8, ys[i] + 3.5);
		});
	}

	// ---------- 标注框 ----------
	const c = m.callout;
	if (c && box && m.alpha > 0.01) {
		ctx.globalAlpha = m.alpha;
		const { bx, by, bw, bh, pad, lineH, title, path, flipX } = box;
		// 引线
		ctx.shadowBlur = 0;
		ctx.strokeStyle = ICE;
		ctx.lineWidth = 1;
		const jx = flipX ? bx + bw : bx;
		const jy = by + bh / 2 < c.ay ? by + bh : by;
		ctx.beginPath();
		ctx.moveTo(c.ax, c.ay);
		ctx.lineTo(jx, jy);
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(c.ax, c.ay, 3, 0, Math.PI * 2);
		ctx.stroke();
		// 框
		ctx.fillStyle = "rgba(5, 9, 13, 0.82)";
		ctx.fillRect(bx, by, bw, bh);
		ctx.strokeStyle = "rgba(168, 236, 255, 0.22)";
		ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
		ctx.strokeStyle = ICE;
		const a = 7;
		ctx.beginPath();
		for (const [px, py, sx, sy] of [
			[bx, by, 1, 1],
			[bx + bw, by, -1, 1],
			[bx, by + bh, 1, -1],
			[bx + bw, by + bh, -1, -1],
		] as const) {
			ctx.moveTo(px + a * sx, py + 0.5 * sy);
			ctx.lineTo(px + 0.5 * sx, py + 0.5 * sy);
			ctx.lineTo(px + 0.5 * sx, py + a * sy);
		}
		ctx.stroke();
		ctx.textAlign = "left";
		let y = by + pad + 9 * ui;
		mono(9, 500, 1.4);
		ctx.fillStyle = ICE;
		ctx.fillText(c.kicker, bx + pad, y);
		y += 20 * ui;
		disp(16, 500, 0.2);
		ctx.fillStyle = "#ffffff";
		ctx.fillText(title, bx + pad, y);
		y += 15 * ui;
		mono(10, 400, 0);
		ctx.fillStyle = FAINT;
		ctx.fillText(path, bx + pad, y);
		mono(11, 400, 0);
		ctx.fillStyle = INK;
		for (const l of c.lines) {
			y += lineH;
			ctx.fillText(l, bx + pad, y);
		}
		if (c.flag) {
			y += 18 * ui;
			mono(9.5, 500, 1);
			ctx.fillStyle = AMBER;
			ctx.fillText(fitText(ctx, c.flag, bw - pad * 2), bx + pad, y);
		}
		ctx.globalAlpha = 1;
	}
	ctx.restore();
}
