import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWindowDrag } from "@/hooks/use-window-drag";
import { commands } from "@/lib/bindings";
import { T } from "@/lib/text";

export const Route = createFileRoute("/")({
	component: Home,
});

function Home() {
	const [name, setName] = useState("Tauri");
	const { theme, setTheme } = useTheme();
	// The titlebar strip is the window drag / double-click-to-zoom surface.
	const windowDrag = useWindowDrag();

	// The canonical pattern: a generated, typed command wrapped in react-query.
	// `greet` lives in src-tauri/src/commands/mod.rs; it is infallible, so it
	// resolves to the value directly — fallible (`AppResult`) commands go
	// through `unwrap` from `@/lib/tauri`.
	const { data, isFetching, refetch } = useQuery({
		queryKey: ["greet", name],
		queryFn: () => commands.greet(name),
		enabled: false, // fire on demand via the button below
	});

	return (
		// Content panes paint solid — the body itself is transparent so the
		// native vibrancy can show through chrome panels (see index.css).
		<div className="flex h-screen flex-col bg-background">
			{/* biome-ignore lint/a11y/noStaticElementInteractions: window-chrome drag/zoom gestures, not content interaction */}
			<header
				className="h-10 shrink-0"
				onPointerDown={windowDrag.onPointerDown}
				onDoubleClick={windowDrag.onDoubleClick}
			/>
			<main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 p-8">
				<h1 className="font-semibold text-2xl">{T.home.title}</h1>

				<div className="flex w-full gap-2">
					<Input
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder={T.home.namePlaceholder}
					/>
					<Button onClick={() => refetch()} disabled={isFetching}>
						{isFetching ? T.common.loading : T.home.greet}
					</Button>
				</div>

				{data && <p className="text-muted-foreground">{data}</p>}

				<div className="flex gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
					>
						{T.home.toggleTheme(T.theme[theme])}
					</Button>
					<Button
						variant="secondary"
						size="sm"
						nativeButton={false}
						render={<Link to="/playground" />}
					>
						{T.home.playground}
					</Button>
					<Button
						variant="secondary"
						size="sm"
						nativeButton={false}
						render={<Link to="/changelog" />}
					>
						{T.changelog.title}
					</Button>
				</div>
			</main>
		</div>
	);
}
