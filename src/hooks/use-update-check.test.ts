import { renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkForUpdate } from "@/lib/updater";
import { useUpdateCheck } from "./use-update-check";

vi.mock("@/lib/updater", () => ({
	checkForUpdate: vi.fn(async () => null),
	installAndRelaunch: vi.fn(),
}));

describe("useUpdateCheck", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("checks exactly once after the startup delay, even under StrictMode", () => {
		renderHook(() => useUpdateCheck(), { wrapper: StrictMode });
		expect(checkForUpdate).not.toHaveBeenCalled();

		vi.advanceTimersByTime(5_000);
		expect(checkForUpdate).toHaveBeenCalledTimes(1);
	});

	it("never checks if the app unmounts before the delay", () => {
		const { unmount } = renderHook(() => useUpdateCheck());
		unmount();
		vi.advanceTimersByTime(5_000);
		expect(checkForUpdate).not.toHaveBeenCalled();
	});
});
