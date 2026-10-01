import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "./theme-provider";

// The native window call needs a Tauri host; the DOM class is what's under test.
vi.mock("@/lib/tauri", () => ({ setNativeWindowTheme: vi.fn() }));

/** jsdom has no matchMedia — a controllable stand-in for the OS appearance. */
function mockSystemAppearance(initialDark: boolean) {
	const listeners = new Set<() => void>();
	const media = {
		matches: initialDark,
		addEventListener: (_: string, fn: () => void) => listeners.add(fn),
		removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
	};
	vi.stubGlobal(
		"matchMedia",
		vi.fn(() => media),
	);
	return {
		listeners,
		setDark(dark: boolean) {
			media.matches = dark;
			for (const fn of listeners) fn();
		},
	};
}

const html = () => document.documentElement.classList;

describe("ThemeProvider", () => {
	beforeEach(() => {
		localStorage.clear();
		html().remove("light", "dark");
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("follows an OS appearance switch while on the system theme", () => {
		const system = mockSystemAppearance(false);
		const { unmount } = render(
			<ThemeProvider defaultTheme="system">app</ThemeProvider>,
		);
		expect(html().contains("light")).toBe(true);

		act(() => system.setDark(true));
		expect(html().contains("dark")).toBe(true);
		expect(html().contains("light")).toBe(false);

		unmount();
		expect(system.listeners.size).toBe(0);
	});

	it("ignores the OS appearance once a theme is chosen explicitly", () => {
		const system = mockSystemAppearance(false);
		localStorage.setItem("app-theme", "dark");
		render(<ThemeProvider>app</ThemeProvider>);

		expect(html().contains("dark")).toBe(true);
		expect(system.listeners.size).toBe(0);
	});
});
