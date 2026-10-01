import { useQuery } from "@tanstack/react-query";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useReducedMotionSafe } from "@/hooks/use-reduced-motion";
import { useWindowDrag } from "@/hooks/use-window-drag";
import { pickDirectory } from "@/lib/dialogs";
import { logger } from "@/lib/logger";
import {
	devOptions,
	errorText,
	isCancel,
	moveToTrash,
	openPrivacySettings,
	type Progress,
	revealInFinder,
	runSurvey,
	type SurveyResult,
	type SurveyTarget,
	stopSurvey,
	surveyPlaces,
} from "@/lib/survey";
import { T } from "@/lib/text";
import { ISO_RISKS, ISO_RULES, ISO_TYPE_KEYS, ISO_TYPES } from "./catalog";
import { buildIsobathVolume, ISO_VOLUME } from "./demo";
import { Engine, type Lens, type UiState, type ViewMode } from "./engine";
import * as fmt from "./format";
import { AGE_RAMP, TYPE_COLOR } from "./palette";
import {
	AgeStrata,
	Crumbs,
	FindingsPanel,
	FocusPanel,
	type ItemActions,
	SearchBox,
	SurveyPanel,
} from "./panels";
import { replaySeconds, surveyStamp, volumeOf } from "./survey";
import { demoVolume } from "./volume";

function demo() {
	const tree = buildIsobathVolume();
	return demoVolume(tree.root, {
		name: ISO_VOLUME.name,
		capacity: ISO_VOLUME.capacity,
		fs: ISO_VOLUME.fs,
		role: ISO_VOLUME.role,
		device: ISO_VOLUME.device,
		home: ["Users", "ada"],
		when: ISO_VOLUME.surveyedAt,
	});
}

/** 数据卷的路径经过 firmlink 读起来是 /Users/…;复制出去的路径用这一种。 */
const DATA_VOLUME = "/System/Volumes/Data";
function shown(path: string) {
	return path.startsWith(`${DATA_VOLUME}/`)
		? path.slice(DATA_VOLUME.length)
		: path;
}

type Scan = {
	label: string;
	progress: Progress;
	started: number;
} | null;

type Pending = { target: SurveyTarget; label: string };

type Last = Pending & { stats: SurveyResult["stats"] };

const ZERO: Progress = { files: 0, dirs: 0, bytes: 0, current: "" };

const noop = () => () => {};

function basename(path: string) {
	const parts = path.split(/[\\/]/).filter(Boolean);
	return parts[parts.length - 1] ?? path;
}

const LENSES: { key: Lens; label: string }[] = [
	{ key: "survey", label: "Survey" },
	{ key: "type", label: "Type" },
	{ key: "age", label: "Age" },
	{ key: "reclaim", label: "Reclaim" },
];

const VIEWS: { key: ViewMode; label: string }[] = [
	{ key: "orbit", label: "Orbit" },
	{ key: "plan", label: "Plan" },
];

function Segmented<T extends string>({
	label,
	options,
	value,
	onChange,
	disabled,
}: {
	label: string;
	options: { key: T; label: string }[];
	value: T;
	onChange: (v: T) => void;
	disabled?: boolean;
}) {
	const id = `iso-seg-${label.toLowerCase()}`;
	// 不用 fieldset + legend:WebKit 不让浮动的 legend 排进同一行(桌面版跑在 WKWebView 里)
	return (
		<div
			className="iso-seg"
			role="radiogroup"
			aria-labelledby={id}
			data-disabled={disabled ? "true" : "false"}
		>
			<span className="iso-seg-label" id={id}>
				{label}
			</span>
			{options.map((o) => (
				<label key={o.key} data-checked={value === o.key ? "true" : "false"}>
					<input
						type="radio"
						name={id}
						value={o.key}
						checked={value === o.key}
						disabled={disabled}
						onChange={() => onChange(o.key)}
					/>
					<span>{o.label}</span>
				</label>
			))}
		</div>
	);
}

function Legend({ lens }: { lens: Lens }) {
	if (lens === "type")
		return (
			<ul className="iso-legend">
				{ISO_TYPE_KEYS.map((k) => (
					<li key={k} title={ISO_TYPES[k].label}>
						<i style={{ background: TYPE_COLOR[k] }} />
						{ISO_TYPES[k].code}
					</li>
				))}
			</ul>
		);
	if (lens === "age")
		return (
			<div className="iso-legend iso-legend-ramp">
				<span>today</span>
				<i
					style={{
						background: `linear-gradient(90deg, ${AGE_RAMP.join(", ")})`,
					}}
				/>
				<span>6 yr +</span>
				<em>median age of each folder, by bytes</em>
			</div>
		);
	if (lens === "reclaim")
		return (
			<div className="iso-legend iso-legend-ramp">
				<span>none</span>
				<i className="iso-legend-amber" />
				<span>all of it</span>
				<em>share of each folder that can be reclaimed</em>
			</div>
		);
	return (
		<ul className="iso-legend iso-legend-kinds">
			<li>
				<i data-kind="dir" />
				folder
			</li>
			<li>
				<i data-kind="file" />
				file
			</li>
			<li>
				<i data-kind="loose" />
				loose files
			</li>
			<li>
				<i data-kind="lines" />1 line = 2,000 files
			</li>
		</ul>
	);
}

function Mark() {
	return (
		<svg className="iso-mark" viewBox="0 0 28 28" aria-hidden="true">
			<circle cx="14" cy="14" r="3" />
			<path d="M14 6.5a7.5 7.5 0 0 1 7.5 7.5" />
			<path d="M14 3a11 11 0 0 1 11 11" />
			<path d="M3 14A11 11 0 0 1 9.2 4.1" />
			<path d="M6.5 14A7.5 7.5 0 0 1 10.3 7.5" />
		</svg>
	);
}

const PHASE_LABEL: Record<UiState["phase"], string> = {
	boot: "Calibrating",
	survey: "Surveying",
	complete: "Survey complete",
};

export function Instrument() {
	const stage = useRef<HTMLElement>(null);
	const viewport = useRef<HTMLDivElement>(null);
	const gl = useRef<HTMLCanvasElement>(null);
	const layer = useRef<HTMLCanvasElement>(null);
	const top = useRef<HTMLElement>(null);
	const tools = useRef<HTMLDivElement>(null);
	const left = useRef<HTMLElement>(null);
	const right = useRef<HTMLElement>(null);
	const bottom = useRef<HTMLElement>(null);
	const [engine, setEngine] = useState<Engine | null>(null);
	const reduced = useReducedMotionSafe();
	const drag = useWindowDrag();

	const measure = useCallback((e: Engine) => {
		const vp = viewport.current;
		if (!vp) return;
		const r = vp.getBoundingClientRect();
		e.resize(r.width, r.height, window.devicePixelRatio || 1);
		const wide = window.matchMedia("(min-width: 1080px)").matches;
		e.wheelZoom = wide;
		if (!wide) {
			e.setInsets({ left: 0, right: 0, top: 0, bottom: 0 });
			return;
		}
		const lr = left.current?.getBoundingClientRect();
		const rr = right.current?.getBoundingClientRect();
		const tr =
			tools.current?.getBoundingClientRect() ??
			top.current?.getBoundingClientRect();
		const br = bottom.current?.getBoundingClientRect();
		e.setInsets({
			left: lr ? lr.right - r.left + 12 : 0,
			right: rr ? r.right - rr.left + 12 : 0,
			top: tr ? tr.bottom - r.top + 6 : 0,
			bottom: br ? r.bottom - br.top + 6 : 0,
		});
	}, []);

	useEffect(() => {
		const vp = viewport.current;
		const c = gl.current;
		const l = layer.current;
		if (!vp || !c || !l) return;
		const e = new Engine(demo());
		e.attach(vp, c, l);
		if (e.gpu) logger.info(e.gpu, "webgl2");
		const ro = new ResizeObserver(() => measure(e));
		ro.observe(vp);
		if (stage.current) ro.observe(stage.current);
		measure(e);
		e.startReplay(ISO_VOLUME.replaySeconds);
		if (import.meta.env.DEV) (window as unknown as { __iso: Engine }).__iso = e;
		setEngine(e);
		return () => {
			ro.disconnect();
			e.detach();
		};
	}, [measure]);

	useEffect(() => {
		engine?.setReduced(reduced);
	}, [engine, reduced]);

	const state = useSyncExternalStore(
		engine?.subscribe ?? noop,
		() => engine?.getSnapshot() ?? null,
		() => null,
	);
	const v = engine?.volume ?? null;
	const done = state?.phase === "complete";
	const native = !!v && v.meta.source !== "demo";

	// ---------- 测量 ----------
	const places = useQuery({
		queryKey: ["survey-places"],
		queryFn: surveyPlaces,
	});
	const volumeLabel = places.data?.volumeName ?? "Macintosh HD";
	const [scan, setScan] = useState<Scan>(null);
	const [scanError, setScanError] = useState<string | null>(null);
	const [preflight, setPreflight] = useState<Pending | null>(null);
	const [acknowledged, setAcknowledged] = useState(false);
	const [last, setLast] = useState<Last | null>(null);

	const run = useCallback(
		async ({ target, label }: Pending) => {
			if (!engine) return;
			setScanError(null);
			setScan({ label, progress: ZERO, started: performance.now() });
			try {
				const result = await runSurvey(target, (progress) =>
					setScan((cur) => (cur ? { ...cur, progress } : cur)),
				);
				const vol = volumeOf(result, surveyStamp());
				engine.setVolume(
					vol,
					replaySeconds(vol),
					(result.stats.tookMs ?? 0) / 1000,
				);
				setLast({ target, label, stats: result.stats });
			} catch (err) {
				if (!isCancel(err)) setScanError(errorText(err));
			} finally {
				setScan(null);
			}
		},
		[engine],
	);

	/** 整块盘与家目录:没有完全磁盘访问权限时先说清楚会发生什么。 */
	const begin = (p: Pending) => {
		if (scan) return;
		const guarded = p.target.kind !== "folder";
		if (
			guarded &&
			places.data &&
			!places.data.fullDiskAccess &&
			!acknowledged
		) {
			setPreflight(p);
			return;
		}
		void run(p);
	};

	// 离开这一页(或者开发时热重载)就别让上一次走盘在后台接着跑
	useEffect(
		() => () => {
			void stopSurvey(true);
		},
		[],
	);

	const pickFolder = async () => {
		const path = await pickDirectory(T.survey.pickTitle);
		if (path)
			begin({ target: { kind: "folder", path }, label: basename(path) });
	};

	const backToDemo = () => {
		engine?.setVolume(
			demo(),
			ISO_VOLUME.replaySeconds,
			ISO_VOLUME.replaySeconds,
		);
		setLast(null);
	};

	// 开发用:YISOBATH_SURVEY=volume|home|/abs/path 启动即测;YISOBATH_PERF=1 每 5 秒记一次帧时间
	useEffect(() => {
		if (!engine || !import.meta.env.DEV) return;
		let timer = 0;
		let cancelled = false;
		void devOptions().then((o) => {
			if (cancelled) return;
			if (o.survey) {
				const target: SurveyTarget =
					o.survey === "volume"
						? { kind: "volume" }
						: o.survey === "home"
							? { kind: "home" }
							: { kind: "folder", path: o.survey };
				void run({ target, label: basename(o.survey) });
			}
			if (o.perf)
				timer = window.setInterval(() => {
					const s = engine.getSnapshot();
					logger.info(
						{
							phase: s.phase,
							fps: Math.round(s.fps),
							frameMs: Number(s.frameMs.toFixed(1)),
							sectors: s.sectors,
							buffer: s.resolution,
							nodes: engine.volume.n,
						},
						"frame",
					);
				}, 5000);
		});
		return () => {
			cancelled = true;
			window.clearInterval(timer);
		};
	}, [engine, run]);

	// 面板的高度会随阶段变(日志 → 可回收),重新量一次取景
	const phase = state?.phase;
	useEffect(() => {
		if (engine && phase) measure(engine);
	}, [engine, phase, measure]);

	// ---------- 对一个地方的操作:访达、复制路径、移到废纸篓 ----------
	const [menuNode, setMenuNode] = useState(-1);
	const [trashing, setTrashing] = useState<{ i: number; busy: boolean } | null>(
		null,
	);

	const actions: ItemActions | undefined = useMemo(() => {
		if (!v || !native) return undefined;
		return {
			canTrash: (i) => i > 0 && v.isReal(i) && !!v.absPath(i),
			reveal: (i) => {
				const path = v.absPath(i);
				if (path)
					revealInFinder(path).catch((err) =>
						toast.error(T.item.reveal, { description: errorText(err) }),
					);
			},
			copyPath: (i) => {
				const path = v.absPath(i);
				if (!path) return;
				navigator.clipboard.writeText(shown(path)).then(
					() => toast(T.item.copied, { description: shown(path) }),
					() => {},
				);
			},
			trash: (i) => {
				if (i > 0 && v.isReal(i)) setTrashing({ i, busy: false });
			},
		};
	}, [v, native]);

	const confirmTrash = async () => {
		if (!engine || !v || !state || !trashing) return;
		const i = trashing.i;
		const path = v.absPath(i);
		if (!path) return;
		const name = v.name[i];
		setTrashing({ i, busy: true });
		const focus = v.segments(state.focus);
		const select = state.select >= 0 ? v.segments(state.select) : [];
		try {
			const result = await moveToTrash(path);
			engine.replaceVolume(volumeOf(result, v.meta.when), focus, select);
			setLast((cur) => (cur ? { ...cur, stats: result.stats } : cur));
			toast.success(T.trash.done(name), { description: T.trash.doneHint });
		} catch (err) {
			toast.error(T.trash.failed, { description: errorText(err) });
		}
		setTrashing(null);
	};

	const subject = state ? (state.select >= 0 ? state.select : state.focus) : -1;

	const announce = useMemo(() => {
		if (!v || !state) return "";
		const i = state.select >= 0 ? state.select : -1;
		if (i < 0) return "";
		return `${v.name[i]}, ${fmt.bytes(v.bytes[i])}, ${fmt.pct(v.bytes[i] / Math.max(1, v.bytes[state.focus]))} of ${
			state.focus === 0 ? v.meta.name : v.name[state.focus]
		}${v.canEnter(i) ? ". Press Enter to open." : "."}`;
	}, [v, state]);

	const onKey = (e: React.KeyboardEvent) => {
		if (!engine) return;
		// ⌘⌫ 和访达一样:移到废纸篓(先确认)
		if ((e.metaKey || e.ctrlKey) && e.key === "Backspace") {
			if (actions && subject >= 0 && actions.canTrash(subject))
				actions.trash(subject);
			e.preventDefault();
			return;
		}
		const map: Record<string, Parameters<Engine["key"]>[0]> = {
			ArrowLeft: "left",
			ArrowRight: "right",
			ArrowUp: "up",
			ArrowDown: "down",
			Enter: "enter",
			" ": "enter",
			Escape: "back",
			Backspace: "back",
		};
		const k = map[e.key];
		if (k && engine.key(k)) e.preventDefault();
		else if (e.key === "+" || e.key === "=") engine.zoomBy(1.15);
		else if (e.key === "-") engine.zoomBy(1 / 1.15);
	};

	const trashNode = trashing && v && trashing.i < v.n ? trashing.i : -1;
	const trashRule =
		trashNode >= 0 && v && v.claim[trashNode] >= 0
			? ISO_RULES[v.claim[trashNode]]
			: null;
	const denied = last?.stats.denied ?? 0;
	const fullAccess = places.data?.fullDiskAccess ?? true;

	const volumeChip = () => {
		if (!v || v.meta.source === "demo")
			return {
				title: `Demo volume, recorded on ${ISO_VOLUME.host} at ${ISO_VOLUME.surveyedAt.replace("T", " ")}`,
				name: `${ISO_VOLUME.name} — ${ISO_VOLUME.role} · demo`,
				meta: `${ISO_VOLUME.fs} · ${fmt.bytes(ISO_VOLUME.capacity)} · ${ISO_VOLUME.device}`,
			};
		if (v.meta.source === "volume")
			return {
				title: `${v.meta.root ?? ""} · ${v.meta.device}`,
				name: `${v.meta.name} — ${v.meta.role}`,
				meta: `${v.meta.fs} · ${fmt.bytes(v.meta.capacity)} · ${fmt.bytes(v.meta.free ?? 0)} free`,
			};
		return {
			title: v.meta.root ?? v.meta.name,
			name: fmt.shortRoot(v.meta.display ?? v.meta.name),
			meta: `${fmt.bytes(v.bytes[0])} · ${v.meta.role.toLowerCase()}`,
		};
	};
	const chip = volumeChip();
	const menuTarget = menuNode >= 0 && v && menuNode < v.n ? menuNode : -1;

	return (
		<main className="iso-stage" ref={stage} data-phase={state?.phase ?? "boot"}>
			<ContextMenu>
				<ContextMenuTrigger
					render={
						<div
							className="iso-viewport"
							ref={viewport}
							// biome-ignore lint/a11y/noNoninteractiveTabindex: 浮雕本身接受键盘操作
							tabIndex={0}
							role="application"
							aria-label="Volume relief. Arrow keys move between folders, Enter opens a folder, Escape goes up a level. Drag to orbit."
							onKeyDown={onKey}
							onContextMenu={() => {
								const s = engine?.getSnapshot();
								setMenuNode(s ? (s.hover >= 0 ? s.hover : s.focus) : -1);
							}}
						/>
					}
				>
					<canvas ref={gl} className="iso-gl" />
					<canvas ref={layer} className="iso-layer" />
					{state?.failed && (
						<p className="iso-fail">
							This instrument draws with WebGL2, which this computer&rsquo;s
							WebView did not provide.
						</p>
					)}
					{scan && (
						<output className="iso-scan">
							<p className="iso-scan-kicker">{T.survey.surveying}</p>
							<p className="iso-scan-name">{scan.label}</p>
							<span className="iso-scan-bar" aria-hidden="true" />
							<p className="iso-scan-read">
								{fmt.exact(scan.progress.files)} files ·{" "}
								{fmt.exact(scan.progress.dirs)} folders ·{" "}
								{fmt.bytes(scan.progress.bytes)}
							</p>
							<p className="iso-scan-path">
								{shown(scan.progress.current) || "…"}
							</p>
							<div className="iso-scan-actions">
								<button
									type="button"
									className="iso-btn"
									onClick={() => void stopSurvey(false)}
								>
									{T.survey.stopShow}
								</button>
								<button
									type="button"
									className="iso-btn iso-btn-quiet"
									onClick={() => void stopSurvey(true)}
								>
									{T.common.cancel}
								</button>
							</div>
							<p className="iso-scan-note">{T.survey.privacyNote}</p>
						</output>
					)}
					{preflight && !scan && (
						<div
							className="iso-scan"
							role="dialog"
							aria-labelledby="iso-access-title"
						>
							<p className="iso-scan-kicker">{T.access.kicker}</p>
							<p className="iso-scan-name" id="iso-access-title">
								{preflight.label}
							</p>
							<p className="iso-scan-text">
								{T.access.missing} {T.access.body}
							</p>
							<div className="iso-scan-actions">
								<button
									type="button"
									className="iso-btn"
									onClick={() =>
										openPrivacySettings().catch((err) =>
											toast.error(T.access.open, {
												description: errorText(err),
											}),
										)
									}
								>
									{T.access.open}
								</button>
								<button
									type="button"
									className="iso-btn iso-btn-quiet"
									onClick={() => {
										setAcknowledged(true);
										setPreflight(null);
										void run(preflight);
									}}
								>
									{T.access.anyway}
								</button>
								<button
									type="button"
									className="iso-btn iso-btn-quiet"
									onClick={() => setPreflight(null)}
								>
									{T.common.cancel}
								</button>
							</div>
							<p className="iso-scan-note">{T.access.restart}</p>
						</div>
					)}
					{scanError && !scan && (
						<p className="iso-fail" role="alert">
							{scanError}
						</p>
					)}
				</ContextMenuTrigger>
				<ContextMenuContent className="iso-menu">
					<ContextMenuGroup>
						{v && menuTarget >= 0 && (
							<ContextMenuLabel>
								{menuTarget === 0 ? v.meta.name : v.name[menuTarget]} ·{" "}
								{fmt.bytes(v.bytes[menuTarget])}
							</ContextMenuLabel>
						)}
						{!actions && <ContextMenuLabel>{T.item.demo}</ContextMenuLabel>}
						{actions && v && menuTarget >= 0 && !v.isReal(menuTarget) && (
							<ContextMenuLabel>{T.item.loose}</ContextMenuLabel>
						)}
						<ContextMenuItem
							disabled={!actions || menuTarget < 0}
							onClick={() => actions?.reveal(menuTarget)}
						>
							{T.item.reveal}
						</ContextMenuItem>
						<ContextMenuItem
							disabled={!actions || menuTarget < 0}
							onClick={() => actions?.copyPath(menuTarget)}
						>
							{T.item.copyPath}
						</ContextMenuItem>
						<ContextMenuSeparator />
						<ContextMenuItem
							variant="destructive"
							disabled={
								!actions || menuTarget < 0 || !actions.canTrash(menuTarget)
							}
							onClick={() => actions?.trash(menuTarget)}
						>
							{T.item.trash}
							<ContextMenuShortcut>⌘⌫</ContextMenuShortcut>
						</ContextMenuItem>
					</ContextMenuGroup>
				</ContextMenuContent>
			</ContextMenu>

			{/* biome-ignore lint/a11y/noStaticElementInteractions: 顶栏是窗口的拖动 / 双击缩放区 */}
			<header
				className="iso-top"
				ref={top}
				onPointerDown={drag.onPointerDown}
				onDoubleClick={drag.onDoubleClick}
			>
				<div className="iso-brand">
					<Mark />
					<span className="iso-word">Isobath</span>
					<span className="iso-tag">Volume survey</span>
				</div>
				<div className="iso-volume" title={chip.title}>
					<svg viewBox="0 0 16 16" aria-hidden="true">
						{v?.meta.source === "folder" ? (
							<path d="M1.5 4.5h4.5l1.5 1.5h7v6.5h-13z" />
						) : (
							<>
								<rect x="1.5" y="4" width="13" height="8" rx="1.5" />
								<circle cx="11.5" cy="8" r="0.9" />
								<path d="M4 8h4" />
							</>
						)}
					</svg>
					<span className="iso-volume-name">{chip.name}</span>
					<span className="iso-volume-meta">{chip.meta}</span>
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger
						disabled={!engine || !!scan}
						render={
							<button
								type="button"
								className="iso-btn iso-source"
								data-demo={native ? "false" : "true"}
							/>
						}
					>
						{T.survey.label}…
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="iso-menu">
						<DropdownMenuGroup>
							<DropdownMenuLabel>{T.survey.label}</DropdownMenuLabel>
							<DropdownMenuItem
								onClick={() =>
									begin({ target: { kind: "volume" }, label: volumeLabel })
								}
							>
								{volumeLabel}
								<span className="iso-menu-hint">{T.survey.wholeDisk}</span>
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => begin({ target: { kind: "home" }, label: "~" })}
							>
								{T.survey.home}
								<span className="iso-menu-hint">~</span>
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => void pickFolder()}>
								{T.survey.folder}
							</DropdownMenuItem>
						</DropdownMenuGroup>
						{native && (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuItem onClick={backToDemo}>
									{T.survey.demoVolume}
								</DropdownMenuItem>
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
				<div className="iso-status" data-phase={state?.phase ?? "boot"}>
					<i className="iso-dot" />
					<span className="iso-status-label">
						{done && native && last?.stats.partial
							? T.survey.stopped
							: PHASE_LABEL[state?.phase ?? "boot"]}
					</span>
					<span className="iso-progress" aria-hidden="true">
						<span
							style={{ width: `${((state?.progress ?? 0) * 100).toFixed(2)}%` }}
						/>
					</span>
					<span className="iso-status-read">
						{fmt.clock(state?.elapsed ?? 0)} · {fmt.count(state?.files ?? 0)}{" "}
						files
					</span>
					{done && native && denied > 0 && (
						<button
							type="button"
							className="iso-chip"
							title={T.survey.unreadableHint}
							onClick={() =>
								fullAccess ? undefined : void openPrivacySettings()
							}
						>
							{T.survey.unreadable(fmt.count(denied))}
							{!fullAccess && <em>{T.access.grant}</em>}
						</button>
					)}
					{state && !done ? (
						<button
							type="button"
							className="iso-btn"
							onClick={() => engine?.skip()}
						>
							Skip
						</button>
					) : native && last ? (
						<button
							type="button"
							className="iso-btn"
							disabled={!!scan}
							onClick={() => void run(last)}
						>
							{T.survey.again}
						</button>
					) : (
						<button
							type="button"
							className="iso-btn"
							disabled={!engine}
							onClick={() => engine?.startReplay(ISO_VOLUME.replaySeconds)}
						>
							Replay
						</button>
					)}
				</div>
			</header>

			<div className="iso-tools" ref={tools}>
				<div className="iso-tools-row">
					<Segmented
						label="Lens"
						options={LENSES}
						value={state?.lens ?? "survey"}
						onChange={(l) => engine?.setLens(l)}
						disabled={!engine}
					/>
					<Segmented
						label="View"
						options={VIEWS}
						value={state?.view ?? "orbit"}
						onChange={(m) => engine?.setMode(m)}
						disabled={!engine}
					/>
					<div className="iso-zoom">
						<button
							type="button"
							aria-label="Zoom out"
							onClick={() => engine?.zoomBy(1 / 1.2)}
						>
							−
						</button>
						<button
							type="button"
							aria-label="Zoom in"
							onClick={() => engine?.zoomBy(1.2)}
						>
							+
						</button>
						<button
							type="button"
							aria-label="Reset camera"
							onClick={() => engine?.resetCamera()}
						>
							⟲
						</button>
					</div>
				</div>
				<Legend lens={state?.lens ?? "survey"} />
			</div>

			<aside className="iso-left" ref={left}>
				{v && state && (
					<SearchBox
						key={state.version}
						volume={v}
						state={state}
						engine={engine as Engine}
					/>
				)}
				{v && state ? (
					<FocusPanel
						volume={v}
						state={state}
						engine={engine as Engine}
						actions={actions}
					/>
				) : (
					<div className="iso-panel iso-shell" />
				)}
			</aside>

			<aside className="iso-right" ref={right}>
				{v && state ? (
					done ? (
						<FindingsPanel
							key={state.version}
							volume={v}
							state={state}
							engine={engine as Engine}
						/>
					) : (
						<SurveyPanel volume={v} state={state} />
					)
				) : (
					<div className="iso-panel iso-shell" />
				)}
			</aside>

			<footer className="iso-bottom" ref={bottom}>
				<div className="iso-bottom-left">
					{v && state && (
						<Crumbs volume={v} state={state} engine={engine as Engine} />
					)}
					<p className="iso-hint">
						Click a terrace to enter · click the hub to go up · drag to orbit
						{native ? ` · ${T.survey.rightClick}` : ""}
					</p>
				</div>
				{v && state ? (
					<AgeStrata volume={v} state={state} engine={engine as Engine} />
				) : (
					<div className="iso-strata" />
				)}
				<dl className="iso-telemetry">
					<div>
						<dt>Frame</dt>
						<dd>
							{(state?.fps ?? 0).toFixed(0)} fps ·{" "}
							{(state?.frameMs ?? 0).toFixed(1)} ms
						</dd>
					</div>
					<div>
						<dt>Sectors</dt>
						<dd>{fmt.exact(state?.sectors ?? 0)}</dd>
					</div>
					<div>
						<dt>Buffer</dt>
						<dd>{state?.resolution ?? "—"}</dd>
					</div>
				</dl>
			</footer>

			<AlertDialog
				open={trashNode >= 0}
				onOpenChange={(open) => {
					if (!open && !trashing?.busy) setTrashing(null);
				}}
			>
				<AlertDialogContent className="iso-dialog">
					{v && trashNode >= 0 && (
						<>
							<AlertDialogHeader>
								<AlertDialogTitle>
									{T.trash.title(v.name[trashNode])}
								</AlertDialogTitle>
								<AlertDialogDescription>
									<span className="iso-dialog-path">{v.path(trashNode)}</span>
									<span className="iso-dialog-size">
										{fmt.bytes(v.bytes[trashNode])} ·{" "}
										{fmt.count(v.files[trashNode])}{" "}
										{v.files[trashNode] === 1 ? "file" : "files"}
									</span>
									{trashRule && (
										<span
											className="iso-dialog-rule"
											data-risk={trashRule.risk}
											title={ISO_RISKS[trashRule.risk].hint}
										>
											{T.trash.rule(
												trashRule.title,
												ISO_RISKS[trashRule.risk].label,
											)}
										</span>
									)}
									<span>{T.trash.space}</span>
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel disabled={trashing?.busy}>
									{T.common.cancel}
								</AlertDialogCancel>
								<AlertDialogAction
									variant="destructive"
									disabled={trashing?.busy}
									onClick={() => void confirmTrash()}
								>
									{trashing?.busy ? T.trash.working : T.trash.confirm}
								</AlertDialogAction>
							</AlertDialogFooter>
						</>
					)}
				</AlertDialogContent>
			</AlertDialog>

			<p className="iso-sr" aria-live="polite">
				{announce}
			</p>
		</main>
	);
}
