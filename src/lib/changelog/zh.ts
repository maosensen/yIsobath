import type { ChangelogRelease } from "./index";

/** 精选的更新说明,新的在前。与 `en.ts` 一一对应。 */
export const zh: ChangelogRelease[] = [
	{
		version: "0.1.1",
		date: "2026-10-02",
		title: "用你的语言",
		summary: "yIsobath 现在也说简体中文和日语，仪器本身也一样。",
		changes: [
			{
				kind: "new",
				title: "中文与日本語",
				text: "面板、图例、浮雕上的读数、清理规则和移到废纸篓的确认框都已翻译。第一次启动时跟随系统语言。",
			},
			{
				kind: "new",
				title: "切换语言不丢画面",
				text: "在顶栏最右端的菜单里切换语言，眼前的测量原样不动，顶部菜单栏也一起换。",
			},
		],
	},
	{
		version: "0.1.0",
		date: "2026-10-01",
		title: "测量你自己的磁盘",
		summary:
			"来自 lookbook 的 Isobath 仪器，现在画的是你真实的磁盘，也帮你把它清出来。",
		changes: [
			{
				kind: "new",
				title: "整块卷或任意文件夹",
				text: "并行走盘，只读名称、实际占用和日期，从不打开文件内容，总量与 du 一致到字节。macOS 不让列出的文件夹会被计数，不会悄悄漏掉。",
			},
			{
				kind: "new",
				title: "钻进折叠的文件夹",
				text: "小文件夹折成一块，整块卷也画得流畅。点一下，它就按自己的尺度展开，不用重新走盘。",
			},
			{
				kind: "new",
				title: "看哪里变大了",
				text: "每次测量都会留下各文件夹大小的快照，下次测同一个地方时，告诉你这段时间空间去了哪里。",
			},
			{
				kind: "new",
				title: "只进废纸篓，从不删除",
				text: "每次移动前都先确认，并显示命中的规则。测量的根、系统文件夹和账户自己的文件夹一律拒绝。",
			},
		],
	},
];
