import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import { useUpdateCheck } from "@/hooks/use-update-check";
import { useLocale } from "@/lib/stores/locale-store";

/** Injected by `createRouter` in main.tsx; consumed by route guards. */
export type RouterContext = {
	queryClient: QueryClient;
};

export const Route = createRootRouteWithContext<RouterContext>()({
	component: RootComponent,
});

function RootComponent() {
	// Silent startup update notification — root-level so every route gets it.
	useUpdateCheck();
	// A language switch re-renders from here down instead of remounting: the
	// instrument holds the current survey. Routes that read `T` also call
	// useLocale(), since the router's Outlet may skip an unchanged subtree.
	useLocale();
	return (
		<Providers>
			<Outlet />
			<Toaster position="bottom-right" />
		</Providers>
	);
}
