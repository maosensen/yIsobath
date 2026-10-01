/**
 * Component playground — the seed of the in-house desktop UI kit.
 *
 * Anatomy mirrors the production shell: a translucent sidebar (window drag
 * surface, double-click header to zoom) beside a solid content pane. Each
 * section shows a live demo; grow this into usage + code examples per
 * component as the kit expands.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import {
	IconAll,
	IconCheck,
	IconError,
	IconFile,
	IconInfo,
	IconMonitor,
	IconMoon,
	IconPalette,
	IconSettings,
	IconSun,
	IconTag,
	IconWarning,
} from "@/components/icons";
import { useTheme } from "@/components/theme-provider";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useWindowDrag } from "@/hooks/use-window-drag";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/playground")({
	component: PlaygroundPage,
});

const SECTIONS = [
	{ id: "buttons", label: "Buttons", icon: IconAll },
	{ id: "inputs", label: "Inputs & Forms", icon: IconFile },
	{ id: "dialogs", label: "Dialogs", icon: IconPalette },
	{ id: "menus", label: "Menus", icon: IconSettings },
	{ id: "feedback", label: "Toasts & Feedback", icon: IconInfo },
	{ id: "theme", label: "Theme", icon: IconMoon },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

function PlaygroundPage() {
	const [section, setSection] = useState<SectionId>("buttons");
	// Chrome regions double as window drag surfaces (press-and-move on empty
	// space, long-press anywhere); double-click zooms — same as production.
	const windowDrag = useWindowDrag();

	return (
		<div className="flex h-screen">
			{/* Translucent over the native vibrancy — the frosted-glass chrome. */}
			<aside
				className="flex w-56 shrink-0 flex-col border-sidebar-border border-r bg-sidebar/50 text-sidebar-foreground windows:bg-sidebar"
				onPointerDown={windowDrag.onPointerDown}
			>
				{/* Overlay titlebar: top inset clears the macOS traffic lights. */}
				{/* biome-ignore lint/a11y/noStaticElementInteractions: window-chrome zoom gesture (double-click titlebar), not content interaction */}
				<header
					className="shrink-0 px-4 pt-10 pb-2"
					onDoubleClick={windowDrag.onDoubleClick}
				>
					<p className="font-semibold text-sm">UI Playground</p>
					<p className="text-muted-foreground text-xs">Desktop component kit</p>
				</header>
				<nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
					{SECTIONS.map(({ id, label, icon: Icon }) => (
						<button
							key={id}
							type="button"
							onClick={() => setSection(id)}
							className={cn(
								"flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
								section === id
									? "bg-sidebar-accent text-sidebar-accent-foreground"
									: "text-sidebar-foreground/80 hover:bg-sidebar-accent/60",
							)}
						>
							<Icon className="size-4 shrink-0" />
							{label}
						</button>
					))}
				</nav>
				<footer className="shrink-0 border-sidebar-border/60 border-t p-3">
					<ThemeSwitcher compact />
				</footer>
			</aside>

			{/* Content pane stays solid — demos need stable ground. */}
			<main className="flex min-w-0 flex-1 flex-col bg-background">
				{/* biome-ignore lint/a11y/noStaticElementInteractions: window-chrome drag/zoom gestures, not content interaction */}
				<header
					className="flex h-12 shrink-0 items-center border-b px-6"
					onPointerDown={windowDrag.onPointerDown}
					onDoubleClick={windowDrag.onDoubleClick}
				>
					<h1 className="font-semibold text-sm">
						{SECTIONS.find((s) => s.id === section)?.label}
					</h1>
				</header>
				<div className="min-h-0 flex-1 overflow-y-auto p-6">
					{section === "buttons" && <ButtonsSection />}
					{section === "inputs" && <InputsSection />}
					{section === "dialogs" && <DialogsSection />}
					{section === "menus" && <MenusSection />}
					{section === "feedback" && <FeedbackSection />}
					{section === "theme" && <ThemeSection />}
				</div>
			</main>
		</div>
	);
}

/** Shared demo frame: title + description + live area. */
function Demo({
	title,
	description,
	children,
}: {
	title: string;
	description?: string;
	children: React.ReactNode;
}) {
	return (
		<section className="mb-8">
			<h2 className="font-medium text-sm">{title}</h2>
			{description && (
				<p className="mt-0.5 text-muted-foreground text-xs">{description}</p>
			)}
			<div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border bg-card/50 p-4">
				{children}
			</div>
		</section>
	);
}

function ButtonsSection() {
	return (
		<>
			<Demo title="Variants">
				<Button>Default</Button>
				<Button variant="secondary">Secondary</Button>
				<Button variant="outline">Outline</Button>
				<Button variant="ghost">Ghost</Button>
				<Button variant="destructive">Destructive</Button>
				<Button variant="link">Link</Button>
			</Demo>
			<Demo title="Sizes">
				<Button size="sm">Small</Button>
				<Button>Default</Button>
				<Button size="lg">Large</Button>
				<Button size="icon" aria-label="Settings">
					<IconSettings />
				</Button>
			</Demo>
			<Demo title="With icons / states">
				<Button>
					<IconCheck /> Confirm
				</Button>
				<Button variant="outline" disabled>
					Disabled
				</Button>
				<Badge>Badge</Badge>
				<Badge variant="secondary">Secondary</Badge>
				<Badge variant="outline">Outline</Badge>
			</Demo>
		</>
	);
}

function InputsSection() {
	return (
		<>
			<Demo title="Text input">
				<Input className="max-w-64" placeholder="Type something…" />
				<Input className="max-w-64" disabled placeholder="Disabled" />
			</Demo>
			<Demo title="Textarea">
				<Textarea className="max-w-md" placeholder="Multi-line text…" />
			</Demo>
			<Demo title="Toggles">
				<div className="flex items-center gap-2">
					<Checkbox id="pg-check" />
					<Label htmlFor="pg-check">Checkbox</Label>
				</div>
				<div className="flex items-center gap-2">
					<Switch id="pg-switch" />
					<Label htmlFor="pg-switch">Switch</Label>
				</div>
			</Demo>
		</>
	);
}

function DialogsSection() {
	return (
		<>
			<Demo
				title="Dialog"
				description="Translucent popover surface (bg-popover/75 + backdrop-blur) over the window vibrancy."
			>
				<Dialog>
					<DialogTrigger render={<Button />}>Open Dialog</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Frosted dialog</DialogTitle>
							<DialogDescription>
								The panel is semi-transparent with a backdrop blur, so the
								content behind it glows through.
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button variant="outline">Cancel</Button>
							<Button>Continue</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</Demo>
			<Demo title="Alert dialog" description="For destructive confirmations.">
				<AlertDialog>
					<AlertDialogTrigger render={<Button variant="destructive" />}>
						Delete…
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Delete this item?</AlertDialogTitle>
							<AlertDialogDescription>
								This action cannot be undone.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction>Delete</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</Demo>
		</>
	);
}

function MenusSection() {
	return (
		<>
			<Demo
				title="Dropdown menu"
				description="Translucent + blurred, matching the native menu feel."
			>
				<DropdownMenu>
					<DropdownMenuTrigger render={<Button variant="outline" />}>
						Open Menu
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
						<DropdownMenuLabel>Actions</DropdownMenuLabel>
						<DropdownMenuItem>
							<IconTag /> Rename
						</DropdownMenuItem>
						<DropdownMenuItem>
							<IconFile /> Duplicate
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem variant="destructive">
							<IconError /> Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</Demo>
			<Demo title="Context menu" description="Right-click the surface below.">
				<ContextMenu>
					<ContextMenuTrigger className="flex h-28 w-full max-w-md items-center justify-center rounded-lg border border-dashed text-muted-foreground text-sm">
						Right-click here
					</ContextMenuTrigger>
					<ContextMenuContent>
						<ContextMenuItem>
							<IconCheck /> Select
						</ContextMenuItem>
						<ContextMenuItem>
							<IconTag /> Add tag…
						</ContextMenuItem>
						<ContextMenuSeparator />
						<ContextMenuItem variant="destructive">
							<IconError /> Remove
						</ContextMenuItem>
					</ContextMenuContent>
				</ContextMenu>
			</Demo>
		</>
	);
}

function FeedbackSection() {
	return (
		<>
			<Demo title="Toasts" description="sonner with themed Solar icons.">
				<Button variant="outline" onClick={() => toast("A plain message")}>
					Default
				</Button>
				<Button variant="outline" onClick={() => toast.success("Saved")}>
					<IconCheck /> Success
				</Button>
				<Button
					variant="outline"
					onClick={() => toast.warning("Disk almost full")}
				>
					<IconWarning /> Warning
				</Button>
				<Button
					variant="outline"
					onClick={() => toast.error("Something broke")}
				>
					<IconError /> Error
				</Button>
			</Demo>
			<Demo title="Empty state" description="The shared 'nothing here' block.">
				<div className="h-56 w-full">
					<EmptyState
						icon={IconFile}
						title="No items yet"
						hint="Drop files here or press Import to get started."
						variant="panel"
					/>
				</div>
			</Demo>
		</>
	);
}

function ThemeSection() {
	return (
		<Demo
			title="Theme"
			description="Persists to localStorage and syncs the NATIVE window materials (titlebar + vibrancy) via window.setTheme."
		>
			<ThemeSwitcher />
		</Demo>
	);
}

function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
	const { theme, setTheme } = useTheme();
	const options = [
		{ value: "light", label: "Light", icon: IconSun },
		{ value: "dark", label: "Dark", icon: IconMoon },
		{ value: "system", label: "System", icon: IconMonitor },
	] as const;

	return (
		<div className={cn("flex items-center gap-1", compact && "w-full")}>
			{options.map(({ value, label, icon: Icon }) => (
				<Button
					key={value}
					size="sm"
					variant={theme === value ? "secondary" : "ghost"}
					className={cn(compact && "flex-1")}
					onClick={() => setTheme(value)}
					aria-label={label}
				>
					<Icon className="size-4" />
					{!compact && label}
				</Button>
			))}
		</div>
	);
}
