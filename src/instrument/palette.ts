/**
 * 颜色的唯一出处:着色器、面板上的色条、图例都从这里取。
 *
 * 十类文件 = 八个色相 + 两个中性色,八个色相在明度上拉平(亮底上看都是同一档亮度),
 * 所以在浮雕里谁更醒目只由它占多大决定,不由它是什么颜色决定。
 * 琥珀色只留给「可回收」,冰蓝只留给交互(悬停、选中、焦点)。
 */

import type { IsoType } from "./catalog";

export const TYPE_COLOR: Record<IsoType, string> = {
	vid: "#ff8a70",
	img: "#f0c56c",
	aud: "#b5e36a",
	mdl: "#b99cff",
	src: "#3fd8c6",
	bin: "#6f86ff",
	vmi: "#ff79c3",
	arc: "#7fd0ff",
	doc: "#e4eaf2",
	sys: "#7b8695",
};

/** 年龄的色阶:刚动过 → 很久没动(像沉积层,越老越深)。 */
export const AGE_RAMP = ["#ffffff", "#9ff0ff", "#4f9dff", "#7c55f0", "#4a2f8a"];

export const AMBER = "#ffb23f";
/** 单色读法的底色:偏冷的白。 */
export const MONO = "#d6ecff";
export const ICE = "#a8ecff";
export const NEUTRAL = "#3b4553";

export function rgb(hex: string): [number, number, number] {
	const n = Number.parseInt(hex.slice(1), 16);
	// sRGB → 线性,着色器在线性空间里相加
	const lin = (c: number) => {
		const x = c / 255;
		return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
	};
	return [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
}
