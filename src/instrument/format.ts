/**
 * 读数的写法。字节一律按十进制(1 GB = 10⁹ B,和访达一致),三位有效数字;
 * 数量按千 / 百万缩写;时间按「多久以前」。所有输出都是定位数的字符串,
 * 服务端和浏览器拼出来一模一样。
 */

const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

/** 三位有效数字的字节数,数值与单位分开给(读数把单位排小)。 */
export function bytesParts(b: number): [string, string] {
	if (!Number.isFinite(b) || b <= 0) return ["0", "B"];
	let u = 0;
	let v = b;
	while (v >= 999.5 && u < UNITS.length - 1) {
		v /= 1000;
		u++;
	}
	if (u === 0) return [String(Math.round(v)), "B"];
	const digits = v >= 99.95 ? 0 : v >= 9.995 ? 1 : 2;
	return [v.toFixed(digits), UNITS[u]];
}

export function bytes(b: number) {
	const [v, u] = bytesParts(b);
	return `${v} ${u}`;
}

/** 1,284 / 12.8k / 1.28 M。 */
export function count(n: number) {
	if (n < 10_000) return Math.round(n).toLocaleString("en-US");
	if (n < 999_500) return `${(n / 1000).toFixed(n < 99_950 ? 1 : 0)}k`;
	return `${(n / 1e6).toFixed(n < 9.995e6 ? 2 : 1)} M`;
}

/** 完整的千分位整数,表格里用。 */
export function exact(n: number) {
	return Math.round(n).toLocaleString("en-US");
}

/** 占比:<1% 给一位小数,<0.1% 写成 <0.1%。 */
export function pct(x: number) {
	const p = x * 100;
	if (p <= 0) return "0%";
	if (p < 0.1) return "<0.1%";
	if (p < 10) return `${p.toFixed(1)}%`;
	return `${p.toFixed(p >= 99.95 ? 0 : 1)}%`;
}

/** 距测量多少天 → today / 3 d / 5 wk / 7 mo / 2.4 yr。 */
export function age(days: number) {
	if (days < 1) return "today";
	if (days < 14) return `${Math.round(days)} d`;
	if (days < 60) return `${Math.round(days / 7)} wk`;
	if (days < 365) return `${Math.round(days / 30.44)} mo`;
	return `${(days / 365.25).toFixed(1)} yr`;
}

/** 00:07.3 这种计时。 */
export function clock(s: number) {
	const m = Math.floor(s / 60);
	const r = s - m * 60;
	return `${String(m).padStart(2, "0")}:${r.toFixed(1).padStart(4, "0")}`;
}

/** 文件夹的根放在顶栏 / 一句话里时的写法:家目录下的照写,别处只留最后两段(…/scratchpad/trash-test)。 */
export function shortRoot(display: string) {
	if (display.startsWith("~") && display.length <= 40) return display;
	const parts = display.split(/[\\/]/).filter(Boolean);
	if (parts.length <= 2) return display;
	return `…/${parts.slice(-2).join("/")}`;
}
