/**
 * What's New — a full-page, timeline-style changelog. Each release opens with
 * a mono version chip, date, headline and summary, followed by a card of
 * titled, categorized changes. Data lives in src/lib/changelog (typed,
 * per-locale); the installed version gets a "Current" badge.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";
import { IconChevronLeft } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useWindowDrag } from "@/hooks/use-window-drag";
import { type ChangeKind, getChangelog } from "@/lib/changelog";
import { useLocale } from "@/lib/stores/locale-store";
import { LANG_TAGS, T } from "@/lib/text";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/changelog")({
	component: ChangelogPage,
});

function formatDate(iso: string, locale: string): string {
	// Parse as local midnight so the formatted day never shifts across time zones.
	const date = new Date(`${iso}T00:00:00`);
	if (Number.isNaN(date.getTime())) return iso;
	return new Intl.DateTimeFormat(locale, {
		year: "numeric",
		month: "short",
		day: "numeric",
	}).format(date);
}

function ChangelogPage() {
	// The titlebar strip doubles as the window drag / double-click-zoom surface.
	const windowDrag = useWindowDrag();
	const [version, setVersion] = useState("");

	useEffect(() => {
		let active = true;
		getVersion()
			.then((v) => {
				if (active) setVersion(v);
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	}, []);

	// Re-renders on a language switch; Intl takes the BCP 47 tag.
	const locale = LANG_TAGS[useLocale()];
	const releases = getChangelog();

	// Colored category tags — built in render so labels track the locale.
	// "New" borrows the accent so it matches the version chip; the other two
	// keep distinct hues for scanning.
	const kindMeta: Record<ChangeKind, { label: string; className: string }> = {
		new: {
			label: T.changelog.kindNew,
			className: "bg-primary/10 text-primary dark:bg-primary/15",
		},
		improved: {
			label: T.changelog.kindImproved,
			className:
				"bg-emerald-500/15 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-400",
		},
		fixed: {
			label: T.changelog.kindFixed,
			className:
				"bg-amber-500/15 text-amber-600 dark:bg-amber-400/15 dark:text-amber-400",
		},
	};

	return (
		<div className="flex h-screen flex-col bg-background">
			{/* biome-ignore lint/a11y/noStaticElementInteractions: window-chrome drag/zoom gestures, not content interaction */}
			<header
				className="h-10 shrink-0"
				onPointerDown={windowDrag.onPointerDown}
				onDoubleClick={windowDrag.onDoubleClick}
			/>

			<main className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto w-full max-w-2xl px-6 pb-10">
					<div className="mb-8 flex items-start justify-between gap-4">
						<div>
							<h1 className="font-semibold text-2xl tracking-tight">
								{T.changelog.title}
							</h1>
							<p className="mt-1 text-muted-foreground text-sm">
								{T.changelog.subtitle}
							</p>
						</div>
						<Button
							variant="ghost"
							size="sm"
							nativeButton={false}
							render={<Link to="/" />}
						>
							<IconChevronLeft className="size-4" />
							{T.changelog.back}
						</Button>
					</div>

					<ol>
						{releases.map((release, index) => (
							<li
								key={release.version}
								className="relative pb-10 pl-7 last:pb-2"
							>
								{/* Timeline rail: an accent dot per release, joined by a
								    hairline down to the next entry. */}
								<span
									aria-hidden
									className="absolute top-1 left-0 size-[11px] rounded-full bg-primary ring-4 ring-primary/15"
								/>
								{index < releases.length - 1 && (
									<span
										aria-hidden
										className="absolute top-5 bottom-0 left-[5px] w-px bg-border/70"
									/>
								)}

								<div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
									<span className="rounded-md bg-primary/10 px-2 py-0.5 font-medium font-mono text-primary text-xs dark:bg-primary/15">
										v{release.version}
									</span>
									<span className="font-mono text-muted-foreground text-xs">
										{formatDate(release.date, locale)}
									</span>
									{release.version === version && (
										<span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 font-medium text-[10px] text-primary dark:bg-primary/15">
											{T.changelog.current}
										</span>
									)}
								</div>

								<h2 className="mt-3 font-bold text-foreground text-xl tracking-tight">
									{release.title}
								</h2>
								{release.summary && (
									<p className="mt-1.5 max-w-prose text-muted-foreground text-sm leading-relaxed">
										{release.summary}
									</p>
								)}

								<ul className="mt-4 divide-y divide-border/60 rounded-xl border border-border/60 bg-card/40">
									{release.changes.map((change) => (
										<li key={change.text} className="flex gap-4 px-4 py-4">
											<span className="w-[4.75rem] shrink-0 pt-0.5">
												<span
													className={cn(
														"inline-flex rounded-full px-2.5 py-0.5 font-medium text-[10px] uppercase tracking-wider",
														kindMeta[change.kind].className,
													)}
												>
													{kindMeta[change.kind].label}
												</span>
											</span>
											<div className="min-w-0 flex-1">
												{change.title && (
													<div className="font-semibold text-foreground text-sm">
														{change.title}
													</div>
												)}
												<p
													className={cn(
														"text-muted-foreground text-sm leading-relaxed",
														change.title && "mt-1",
													)}
												>
													{change.text}
												</p>
											</div>
										</li>
									))}
								</ul>
							</li>
						))}
					</ol>
				</div>
			</main>
		</div>
	);
}
