import { format, formatDistanceToNowStrict, subDays } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import { T } from "@/lib/text";
import {
	ISO_AGE_BUCKET_DAYS,
	ISO_RISKS,
	ISO_TYPE_KEYS,
	ISO_TYPES,
	type IsoRisk,
} from "./catalog";
import type { Engine, UiState } from "./engine";
import * as fmt from "./format";
import { AMBER, TYPE_COLOR } from "./palette";
import { AGE_BINS, TYPE_COUNT, type Volume } from "./volume";

export function Bytes({
	value,
	className,
}: {
	value: number;
	className?: string;
}) {
	const [v, u] = fmt.bytesParts(value);
	return (
		<span className={className}>
			{v}
			<span className="iso-unit">{u}</span>
		</span>
	);
}

function Head({
	index,
	children,
	aside,
}: {
	index: string;
	children: React.ReactNode;
	aside?: React.ReactNode;
}) {
	return (
		<div className="iso-head">
			<span className="iso-head-index">{index}</span>
			<span className="iso-head-title">{children}</span>
			{aside && <span className="iso-head-aside">{aside}</span>}
		</div>
	);
}

/** 路径太长就从左边截:…/DerivedData/Harbor-abc/Build。 */
function shortPath(p: string, max = 42) {
	return p.length <= max ? p : `…${p.slice(p.length - max + 1)}`;
}

// ---------- 焦点 ----------

/** 对一个地方能做的事(只有原生测量才有;演示卷没有真文件)。 */
export interface ItemActions {
	canTrash: (i: number) => boolean;
	reveal: (i: number) => void;
	copyPath: (i: number) => void;
	trash: (i: number) => void;
}

/** 操作条:作用于选中的那一块,没选中就是焦点自己。 */
function ActionRow({
	volume: v,
	subject,
	focus,
	actions,
}: {
	volume: Volume;
	subject: number;
	focus: number;
	actions: ItemActions;
}) {
	const own = subject !== focus;
	return (
		<div className="iso-actions">
			<p className="iso-actions-for" title={v.path(subject)}>
				{own ? (
					<>
						<span>↳</span> {v.name[subject]}
						<em>{fmt.bytes(v.bytes[subject])}</em>
					</>
				) : (
					<span>{subject === 0 ? "This survey" : "This folder"}</span>
				)}
			</p>
			<div className="iso-actions-row">
				<button
					type="button"
					className="iso-btn iso-btn-quiet"
					onClick={() => actions.reveal(subject)}
				>
					Finder
				</button>
				<button
					type="button"
					className="iso-btn iso-btn-quiet"
					onClick={() => actions.copyPath(subject)}
				>
					Copy path
				</button>
				<button
					type="button"
					className="iso-btn iso-btn-trash"
					disabled={!actions.canTrash(subject)}
					onClick={() => actions.trash(subject)}
					title="Move to Trash (⌘⌫)"
				>
					Trash…
				</button>
			</div>
		</div>
	);
}

export function FocusPanel({
	volume: v,
	state,
	engine,
	actions,
}: {
	volume: Volume;
	state: UiState;
	engine: Engine;
	actions?: ItemActions;
}) {
	const f = state.focus;
	const done = state.phase === "complete";
	const bytes = done ? v.bytes[f] : state.bytes;
	const kids = useMemo(
		() => v.children(f).filter((c) => v.bytes[c] > 0),
		[v, f],
	);
	const types = useMemo(() => {
		const out: { key: (typeof ISO_TYPE_KEYS)[number]; bytes: number }[] = [];
		for (let t = 0; t < TYPE_COUNT; t++)
			out.push({
				key: ISO_TYPE_KEYS[t],
				bytes: v.typeBytes[f * TYPE_COUNT + t],
			});
		return out.sort((a, b) => b.bytes - a.bytes);
	}, [v, f]);
	const total = Math.max(1, v.bytes[f]);
	const depth = v.depth[f];
	return (
		<section className="iso-panel iso-focus" aria-label="Focus">
			<Head index="01" aside={`L${depth}`}>
				Focus
			</Head>
			<p className="iso-path" title={v.path(f)}>
				{f === 0
					? `${v.meta.name} — ${v.meta.role}`
					: shortPath(v.path(v.parent[f]), 40)}
			</p>
			<p className="iso-name">{f === 0 ? v.meta.name : v.name[f]}</p>
			<p className="iso-big">
				<Bytes value={bytes} />
			</p>
			{actions && done && (
				<ActionRow
					volume={v}
					subject={
						state.select >= 0 && v.contains(f, state.select) ? state.select : f
					}
					focus={f}
					actions={actions}
				/>
			)}
			<dl className="iso-meta">
				<div>
					<dt>Share</dt>
					<dd>{fmt.pct(bytes / v.meta.capacity)}</dd>
				</div>
				<div>
					<dt>Files</dt>
					<dd>{fmt.count(done ? v.files[f] : state.files)}</dd>
				</div>
				<div>
					<dt>Folders</dt>
					<dd>{fmt.count(done ? v.dirs[f] : state.folders)}</dd>
				</div>
				<div>
					<dt>Age</dt>
					<dd>{done ? fmt.age(v.age[f]) : "—"}</dd>
				</div>
				<div className="iso-meta-amber">
					<dt>Reclaim</dt>
					<dd>{done ? fmt.bytes(v.reclaim[f]) : "—"}</dd>
				</div>
				<div>
					<dt>Mostly</dt>
					<dd>{done ? ISO_TYPES[ISO_TYPE_KEYS[v.type[f]]].code : "—"}</dd>
				</div>
			</dl>

			<Head index="02" aside={done ? undefined : "listing…"}>
				Composition
			</Head>
			<div
				className="iso-stack"
				aria-hidden="true"
				data-pending={done ? "false" : "true"}
			>
				{types.map((t) =>
					t.bytes > 0 ? (
						<span
							key={t.key}
							style={{
								width: `${((t.bytes / total) * 100).toFixed(3)}%`,
								background: TYPE_COLOR[t.key],
							}}
							data-lens={state.lens === "type" ? "on" : "off"}
						/>
					) : null,
				)}
			</div>
			<ul className="iso-types" data-pending={done ? "false" : "true"}>
				{types.slice(0, 5).map((t) => (
					<li key={t.key}>
						<i style={{ background: TYPE_COLOR[t.key] }} />
						<span className="iso-types-code">{ISO_TYPES[t.key].code}</span>
						<span className="iso-types-label">{ISO_TYPES[t.key].label}</span>
						<span className="iso-types-val">
							{done ? fmt.bytes(t.bytes) : "—"}
						</span>
						<span className="iso-types-pct">
							{done ? fmt.pct(t.bytes / total) : ""}
						</span>
					</li>
				))}
			</ul>

			<Head index="03" aside={done ? `${kids.length} items` : "listing…"}>
				Largest inside
			</Head>
			<ol className="iso-largest" data-pending={done ? "false" : "true"}>
				{kids.slice(0, 6).map((c, i) => {
					const share = v.bytes[c] / total;
					const active = state.hover === c || state.select === c;
					return (
						<li key={c}>
							<button
								type="button"
								data-active={active ? "true" : "false"}
								disabled={!done}
								onMouseEnter={() => engine.setHoverNode(c)}
								onMouseLeave={() => engine.setHoverNode(-1)}
								onFocus={() => engine.setSelect(c)}
								onClick={() =>
									engine.canOpen(c) ? engine.open(c) : engine.setSelect(c)
								}
							>
								<span className="iso-largest-rank">
									{String(i + 1).padStart(2, "0")}
								</span>
								<span className="iso-largest-name">{v.name[c]}</span>
								<span className="iso-largest-val">
									{done ? fmt.bytes(v.bytes[c]) : "—"}
								</span>
								<span className="iso-largest-bar" aria-hidden="true">
									<span
										style={{
											width: done
												? `${Math.max(0.5, share * 100).toFixed(2)}%`
												: "0%",
										}}
									/>
								</span>
							</button>
						</li>
					);
				})}
			</ol>
		</section>
	);
}

// ---------- 查找 ----------

export function SearchBox({
	volume: v,
	state,
	engine,
}: {
	volume: Volume;
	state: UiState;
	engine: Engine;
}) {
	const [q, setQ] = useState("");
	const [res, setRes] = useState<{
		count: number;
		bytes: number;
		top: number[];
	} | null>(null);
	const [open, setOpen] = useState(false);
	const input = useRef<HTMLInputElement>(null);
	const done = state.phase === "complete";
	// 换卷、重新回放时查找被引擎清掉了,这里也跟着清
	const version = `${state.version}-${done}`;
	const [seen, setSeen] = useState(version);
	if (seen !== version) {
		setSeen(version);
		setQ("");
		setRes(null);
	}
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "/" || e.metaKey || e.ctrlKey) return;
			// 只让着能打字的地方。读法 / 视角是单选框,点过之后焦点留在它上面,
			// 不区分的话「/」就一直失灵,直到点一下别处
			const t = e.target as HTMLElement | null;
			const typing =
				t instanceof HTMLTextAreaElement ||
				t?.isContentEditable ||
				(t instanceof HTMLInputElement &&
					!["radio", "checkbox", "button", "range"].includes(t.type));
			if (typing) return;
			e.preventDefault();
			input.current?.focus();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);
	const run = (next: string) => {
		setQ(next);
		setRes(engine.setSearch(next));
		setOpen(true);
	};
	return (
		<search className="iso-search" data-open={open && res ? "true" : "false"}>
			<label className="iso-search-field">
				<svg viewBox="0 0 16 16" aria-hidden="true">
					<circle cx="7" cy="7" r="4.5" />
					<path d="M10.4 10.4 14 14" />
				</svg>
				<span className="iso-sr">Find by name</span>
				<input
					ref={input}
					type="search"
					value={q}
					disabled={!done}
					placeholder={done ? "Find by name" : "Find — after the survey"}
					spellCheck={false}
					autoComplete="off"
					onChange={(e) => run(e.currentTarget.value)}
					onFocus={() => setOpen(true)}
					onBlur={() => setTimeout(() => setOpen(false), 150)}
					onKeyDown={(e) => {
						if (e.key === "Escape") {
							run("");
							e.currentTarget.blur();
						} else if (e.key === "Enter" && res?.top[0] !== undefined) {
							engine.reveal(res.top[0]);
						}
					}}
				/>
				<kbd>/</kbd>
			</label>
			{open && res && (
				<div className="iso-search-results">
					<p className="iso-search-sum">
						{res.count === 0 ? (
							"No names match"
						) : (
							<>
								<b>{fmt.exact(res.count)}</b>{" "}
								{res.count === 1 ? "match" : "matches"} · {fmt.bytes(res.bytes)}{" "}
								· {fmt.pct(res.bytes / Math.max(1, v.bytes[0]))}
							</>
						)}
					</p>
					<ul>
						{res.top.map((i) => (
							<li key={i}>
								<button
									type="button"
									onMouseDown={(e) => e.preventDefault()}
									onClick={() => engine.reveal(i)}
									title={v.path(i)}
								>
									<span>{v.name[i]}</span>
									<em>{shortPath(v.path(v.parent[i]), 34)}</em>
									<span>{fmt.bytes(v.bytes[i])}</span>
								</button>
							</li>
						))}
					</ul>
				</div>
			)}
		</search>
	);
}

// ---------- 测量中:速率表 + 日志 ----------

const RATE_MAX = 600_000;

function RateGauge({ rate, peak }: { rate: number; peak: number }) {
	const R = 64;
	const a = (x: number) => Math.PI * (1 - Math.min(1, x / RATE_MAX));
	const pt = (x: number, r: number) => [
		80 + r * Math.cos(a(x)),
		78 - r * Math.sin(a(x)),
	];
	const ticks = [];
	for (let i = 0; i <= 30; i++) {
		const x = (i / 30) * RATE_MAX;
		const major = i % 5 === 0;
		const [x0, y0] = pt(x, R - (major ? 9 : 5));
		const [x1, y1] = pt(x, R);
		ticks.push(
			<line
				key={i}
				x1={x0}
				y1={y0}
				x2={x1}
				y2={y1}
				data-major={major ? "true" : "false"}
			/>,
		);
	}
	const [nx, ny] = pt(rate, R - 14);
	const [px, py] = pt(peak, R + 4);
	const arc = (x: number) => {
		const [ex, ey] = pt(x, R + 1);
		return `M ${80 - R - 1} 78 A ${R + 1} ${R + 1} 0 0 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
	};
	return (
		<div className="iso-rate">
			<svg viewBox="0 0 160 92" aria-hidden="true">
				<path
					d={`M ${80 - R - 1} 78 A ${R + 1} ${R + 1} 0 0 1 ${80 + R + 1} 78`}
					className="iso-rate-track"
				/>
				{rate > 0 && <path d={arc(rate)} className="iso-rate-arc" />}
				<g className="iso-rate-ticks">{ticks}</g>
				<line x1={80} y1={78} x2={nx} y2={ny} className="iso-rate-needle" />
				<circle cx={px} cy={py} r={1.8} className="iso-rate-peak" />
				<circle cx={80} cy={78} r={2.5} className="iso-rate-hub" />
			</svg>
			<p className="iso-rate-read">
				<span>{fmt.count(rate)}</span>
				<em>entries / s</em>
			</p>
			<p className="iso-rate-peak-read">peak {fmt.count(peak)}</p>
		</div>
	);
}

export function SurveyPanel({
	volume: v,
	state,
}: {
	volume: Volume;
	state: UiState;
}) {
	return (
		<section className="iso-panel iso-survey" aria-label="Survey">
			<Head index="04" aside={fmt.clock(state.elapsed)}>
				{state.phase === "boot" ? "Calibrating" : "Survey"}
			</Head>
			<RateGauge rate={state.rate} peak={state.peak} />
			<dl className="iso-meta iso-meta-3">
				<div>
					<dt>Listed</dt>
					<dd>{fmt.bytes(state.bytes)}</dd>
				</div>
				<div>
					<dt>Files</dt>
					<dd>{fmt.count(state.files)}</dd>
				</div>
				<div>
					<dt>Folders</dt>
					<dd>{fmt.count(state.folders)}</dd>
				</div>
			</dl>
			<Head index="05">Survey log</Head>
			<ol className="iso-log" aria-live="off">
				{state.log.map((line, i) => (
					<li
						// biome-ignore lint/suspicious/noArrayIndexKey: 日志行可以重复,位置就是身份(新行从顶上进来)
						key={`${i}-${line}`}
						style={{ opacity: Math.max(0.12, 1 - i * 0.07).toFixed(2) }}
					>
						{shortPath(line, 46)}
					</li>
				))}
			</ol>
			<p className="iso-note">
				{v.meta.source === "demo"
					? `Replaying a survey of ${v.meta.name} recorded ${v.meta.when.replace("T", " ")}.`
					: `Surveyed ${fmt.shortRoot(v.meta.display ?? v.meta.name)} on ${v.meta.when.replace("T", " ")}; only names, sizes and dates were read.`}{" "}
				Folders rise as they are listed; the sweep follows directory order,
				largest first.
			</p>
		</section>
	);
}

// ---------- 可回收 ----------

const RISK_ORDER: IsoRisk[] = ["regenerates", "review", "final"];

export function FindingsPanel({
	volume: v,
	state,
	engine,
}: {
	volume: Volume;
	state: UiState;
	engine: Engine;
}) {
	const [open, setOpen] = useState<number>(-1);
	const [copied, setCopied] = useState<number>(-1);
	const byRisk = useMemo(() => {
		const m = new Map<IsoRisk, number>();
		for (const f of v.findings)
			m.set(f.rule.risk, (m.get(f.rule.risk) ?? 0) + f.bytes);
		return m;
	}, [v]);
	const total = Math.max(1, v.reclaimTotal);
	const hover = (r: number) => engine.setFinding(r >= 0 ? r : open);
	return (
		<section className="iso-panel iso-findings" aria-label="Reclaimable space">
			<Head index="04" aside={`${v.findings.length} findings`}>
				Reclaimable
			</Head>
			<p className="iso-big iso-big-amber">
				<Bytes value={v.reclaimTotal} />
			</p>
			<p className="iso-sub">
				{fmt.pct(v.reclaimTotal / Math.max(1, v.bytes[0]))} of the{" "}
				{fmt.bytes(v.bytes[0])}{" "}
				{v.meta.source === "demo"
					? `in use · free after: ${fmt.bytes(v.meta.capacity - v.bytes[0] + v.reclaimTotal)}`
					: v.meta.source === "volume" && v.meta.free !== undefined
						? `surveyed · free after: ${fmt.bytes(v.meta.free + v.reclaimTotal)}`
						: `in ${fmt.shortRoot(v.meta.display ?? v.meta.name)}`}
			</p>
			<div className="iso-risk" aria-hidden="true">
				{RISK_ORDER.map((r) => (
					<span
						key={r}
						data-risk={r}
						style={{
							width: `${(((byRisk.get(r) ?? 0) / total) * 100).toFixed(2)}%`,
						}}
					/>
				))}
			</div>
			<ul className="iso-risk-legend">
				{RISK_ORDER.map((r) => (
					<li key={r} data-risk={r} title={ISO_RISKS[r].hint}>
						<i />
						{ISO_RISKS[r].label}
						<span>{fmt.bytes(byRisk.get(r) ?? 0)}</span>
					</li>
				))}
			</ul>
			{v.findings.length === 0 && (
				<p className="iso-empty">
					Nothing here matches a rule: no dependency folders, build output,
					caches, installers, duplicates or large files left alone for two
					years.
				</p>
			)}
			<ol className="iso-find-list" onMouseLeave={() => hover(-1)}>
				{v.findings.map((f) => {
					const expanded = open === f.ruleIndex;
					const lit = state.finding === f.ruleIndex;
					return (
						<li
							key={f.rule.id}
							data-open={expanded ? "true" : "false"}
							data-lit={lit ? "true" : "false"}
						>
							<button
								type="button"
								className="iso-find-row"
								aria-expanded={expanded}
								onMouseEnter={() => hover(f.ruleIndex)}
								onFocus={() => hover(f.ruleIndex)}
								onClick={() => {
									const next = expanded ? -1 : f.ruleIndex;
									setOpen(next);
									engine.setFinding(next >= 0 ? next : f.ruleIndex);
								}}
							>
								<i data-risk={f.rule.risk} />
								<span className="iso-find-title">
									{f.rule.title}
									<em>
										{f.places.length}{" "}
										{f.places.length === 1 ? "place" : "places"}
									</em>
								</span>
								<span className="iso-find-val">{fmt.bytes(f.bytes)}</span>
							</button>
							{expanded && (
								<div className="iso-find-body">
									<p>{f.rule.blurb}</p>
									{f.rule.command && (
										<div className="iso-cmd">
											<code>{f.rule.command}</code>
											<button
												type="button"
												onClick={() => {
													navigator.clipboard
														?.writeText(f.rule.command ?? "")
														.then(
															() => setCopied(f.ruleIndex),
															() => {},
														);
												}}
											>
												{copied === f.ruleIndex ? "Copied" : "Copy"}
											</button>
										</div>
									)}
									<ul className="iso-places">
										{f.places.slice(0, 6).map((p) => (
											<li key={p}>
												<button
													type="button"
													onClick={() => engine.reveal(p)}
													title={v.path(p)}
												>
													<span>{shortPath(v.path(p))}</span>
													<span>{fmt.bytes(v.bytes[p])}</span>
												</button>
											</li>
										))}
									</ul>
									{f.places.length > 6 && (
										<p className="iso-more">and {f.places.length - 6} more</p>
									)}
									<p className="iso-risk-note" data-risk={f.rule.risk}>
										{ISO_RISKS[f.rule.risk].label} —{" "}
										{ISO_RISKS[f.rule.risk].hint}
										{f.rule.recover
											? ` Counted at ${Math.round(f.rule.recover * 100)}% of ${fmt.bytes(f.gross)}.`
											: ""}
									</p>
								</div>
							)}
						</li>
					);
				})}
			</ol>
			<ChangeSection volume={v} engine={engine} />
		</section>
	);
}

/** 正数带 +,负数带 −(和数字等宽的减号)。 */
function signed(b: number) {
	return `${b < 0 ? "−" : "+"}${fmt.bytes(Math.abs(b))}`;
}

/**
 * 和上次测同一个地方比:净变化,和长得最多的几处。点一处就把它放进视野;它在折叠的块里面时,
 * 选中的是那一块(点进去就按需展开)。
 */
function ChangeSection({
	volume: v,
	engine,
}: {
	volume: Volume;
	engine: Engine;
}) {
	if (v.meta.source === "demo") return null;
	const c = v.meta.change;
	if (!c)
		return (
			<>
				<Head index="05">{T.change.title}</Head>
				<p className="iso-change-note">
					{v.meta.partial ? T.change.partial : T.change.first}
				</p>
			</>
		);
	return (
		<>
			<Head index="05" aside={signed(v.bytes[0] - c.was)}>
				{T.change.since(format(c.since, "MMM d, HH:mm"))}
			</Head>
			<p className="iso-change-note">
				{T.change.net(
					fmt.bytes(c.was),
					fmt.bytes(v.bytes[0]),
					formatDistanceToNowStrict(c.since, { addSuffix: true }),
				)}
			</p>
			{c.places.length === 0 ? (
				<p className="iso-change-note">{T.change.none}</p>
			) : (
				<ul className="iso-places iso-change">
					{c.places.map((p) => {
						const path = v.pathOf(p.path);
						// 测的是一个文件夹时写它里面的相对路径:前面那截人人都一样,截短时反倒把名字截没了
						const shown = v.meta.source === "folder" ? p.path.join("/") : path;
						return (
							<li key={p.path.join("/")}>
								<button
									type="button"
									title={path}
									onClick={() => engine.reveal(v.nearest(p.path).i)}
								>
									<span>{shortPath(shown)}</span>
									<span>
										{p.new && <em>{T.change.new}</em>}
										{signed(p.now - p.was)}
									</span>
								</button>
							</li>
						);
					})}
				</ul>
			)}
		</>
	);
}

// ---------- 年龄地层 ----------

export function AgeStrata({
	volume: v,
	state,
	engine,
}: {
	volume: Volume;
	state: UiState;
	engine: Engine;
}) {
	const f = state.focus;
	const shown =
		state.hover >= 0 ? state.hover : state.select >= 0 ? state.select : -1;
	const ref = useRef<HTMLDivElement>(null);
	const [drag, setDrag] = useState<[number, number] | null>(null);
	const when = v.meta.when;
	// 左边最老,右边是测量那天
	const cols = useMemo(() => {
		const out: {
			bin: number;
			focus: number;
			shown: number;
			label: string | null;
			year: number;
		}[] = [];
		// 平方根刻度:最近一个季度往往一家独大,线性刻度会把其余的压成一条线
		let max = 1;
		for (let b = 0; b < AGE_BINS; b++)
			max = Math.max(max, Math.sqrt(v.ageHist[f * AGE_BINS + b]));
		let prevYear = -1;
		const at = new Date(when);
		for (let c = 0; c < AGE_BINS; c++) {
			const bin = AGE_BINS - 1 - c;
			const start = subDays(at, (bin + 1) * ISO_AGE_BUCKET_DAYS);
			const year = start.getFullYear();
			const label =
				bin === AGE_BINS - 1
					? "older"
					: year !== prevYear
						? String(year)
						: null;
			prevYear = year;
			out.push({
				bin,
				focus: Math.sqrt(v.ageHist[f * AGE_BINS + bin]) / max,
				shown:
					shown >= 0 ? Math.sqrt(v.ageHist[shown * AGE_BINS + bin]) / max : 0,
				label,
				year,
			});
		}
		return out;
	}, [v, f, shown, when]);
	const range = state.ageRange;
	const colOf = (e: React.PointerEvent) => {
		const r = ref.current?.getBoundingClientRect();
		if (!r) return 0;
		return Math.max(
			0,
			Math.min(
				AGE_BINS - 1,
				Math.floor(((e.clientX - r.left) / r.width) * AGE_BINS),
			),
		);
	};
	const toBins = (a: number, b: number): [number, number] => {
		const lo = Math.min(a, b);
		const hi = Math.max(a, b);
		return [AGE_BINS - 1 - hi, AGE_BINS - lo];
	};
	const sel = drag ? toBins(drag[0], drag[1]) : range;
	const inSel = (bin: number) => !!sel && bin >= sel[0] && bin < sel[1];
	const node = shown >= 0 ? shown : f;
	const year = Math.round(365.25 / ISO_AGE_BUCKET_DAYS);
	const old = v.ageShare(node, year, AGE_BINS);
	const selShare = sel ? v.ageShare(node, sel[0], sel[1]) : 0;
	const done = state.phase === "complete";
	return (
		<section className="iso-strata" aria-label="Age strata">
			<div className="iso-strata-head">
				<span className="iso-head-index">06</span>
				<span className="iso-head-title">Age strata</span>
				<span className="iso-strata-scale">last modified · √ bytes</span>
				<span className="iso-strata-read">
					{sel ? (
						<>
							<b>{fmt.bytes(v.bytes[node] * selShare)}</b> in selection ·{" "}
							{fmt.pct(selShare)} of{" "}
							{node === 0
								? v.meta.source === "folder"
									? "survey"
									: "volume"
								: v.name[node]}
							<button type="button" onClick={() => engine.setAgeRange(null)}>
								Clear
							</button>
						</>
					) : (
						<>
							<b>{fmt.bytes(v.bytes[node] * old)}</b> untouched for a year ·{" "}
							{fmt.pct(old)} of{" "}
							{node === 0
								? v.meta.source === "folder"
									? "survey"
									: "volume"
								: v.name[node]}
						</>
					)}
				</span>
			</div>
			<div
				ref={ref}
				className="iso-strata-plot"
				role="slider"
				tabIndex={done ? 0 : -1}
				aria-label="Filter by last-modified age. Drag to select a range."
				aria-valuemin={0}
				aria-valuemax={AGE_BINS}
				aria-valuenow={sel ? sel[0] : 0}
				aria-valuetext={
					sel ? `${sel[0]} to ${sel[1]} quarters ago` : "no filter"
				}
				data-disabled={done ? "false" : "true"}
				onPointerDown={(e) => {
					if (!done) return;
					e.currentTarget.setPointerCapture(e.pointerId);
					const c = colOf(e);
					setDrag([c, c]);
				}}
				onPointerMove={(e) => {
					if (drag) setDrag([drag[0], colOf(e)]);
				}}
				onPointerUp={() => {
					if (!drag) return;
					const bins = toBins(drag[0], drag[1]);
					const same = range && range[0] === bins[0] && range[1] === bins[1];
					engine.setAgeRange(same ? null : bins);
					setDrag(null);
				}}
				onKeyDown={(e) => {
					if (e.key === "Escape") engine.setAgeRange(null);
				}}
			>
				{cols.map((c) => (
					<span
						key={c.bin}
						className="iso-strata-col"
						data-sel={inSel(c.bin) ? "true" : sel ? "out" : "false"}
					>
						<span
							className="iso-strata-bar"
							style={{ height: `${(c.focus * 100).toFixed(2)}%` }}
						/>
						{shown >= 0 && (
							<span
								className="iso-strata-over"
								style={{ height: `${(c.shown * 100).toFixed(2)}%` }}
							/>
						)}
						{c.label && <span className="iso-strata-year">{c.label}</span>}
					</span>
				))}
			</div>
		</section>
	);
}

// ---------- 路径 ----------

export function Crumbs({
	volume: v,
	state,
	engine,
}: {
	volume: Volume;
	state: UiState;
	engine: Engine;
}) {
	const chain = v.ancestors(state.focus);
	return (
		<nav className="iso-crumbs" aria-label="Path">
			{chain.map((i, k) => (
				<span key={i}>
					{k > 0 && <span className="iso-crumb-sep">›</span>}
					<button
						type="button"
						onClick={() => engine.goTo(i)}
						aria-current={i === state.focus ? "location" : undefined}
					>
						{i === 0 ? v.meta.name : v.name[i]}
					</button>
				</span>
			))}
		</nav>
	);
}

export { AMBER };
