/**
 * 一次原生测量 → 一块卷。
 *
 * 走盘、按扩展名分类、打规则记号、按节点预算折叠,都在 Rust 那边做完了
 * (`src-tauri/src/survey/`,源头是 yLookbook 里浏览器版的 live.ts)。这里只把它交过来的
 * 树和元信息换成 `Volume`。
 */

import { format } from "date-fns";
import type { SurveyResult } from "@/lib/bindings";
import { Volume, type VolumeDraft } from "./volume";

/** 测量时刻,和演示卷的 surveyedAt 同一种写法(本地时间,到分钟)。 */
export function surveyStamp(at = new Date()) {
	return format(at, "yyyy-MM-dd'T'HH:mm");
}

export function volumeOf(result: SurveyResult, when: string) {
	const m = result.meta;
	const isVolume = m.kind === "volume";
	// Rust 只发有限的数,f64 不会序列化成 null;可选字段没有时整个省掉 —— 形状就是 VolumeDraft
	const root = result.root as unknown as VolumeDraft;
	return new Volume(root, {
		name: m.name,
		capacity: Math.max(
			1,
			(isVolume ? m.capacity : 0) || result.stats.bytes || 1,
		),
		free: isVolume ? (m.free ?? undefined) : undefined,
		fs: isVolume ? m.fs || "Volume" : "Folder",
		role: m.role,
		device: m.device,
		source: isVolume ? "volume" : "folder",
		home: m.home ?? undefined,
		display: isVolume ? undefined : m.display,
		root: m.root,
		when,
	});
}

/** 测完之后回放扫描多久:按节点数,3–9 秒。 */
export function replaySeconds(v: Volume) {
	return Math.min(9, 3 + v.n / 4000);
}
