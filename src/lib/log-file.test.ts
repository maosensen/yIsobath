import * as plugin from "@tauri-apps/plugin-log";
import type { LogEvent } from "pino";
import { describe, expect, it, vi } from "vitest";
import { logFileTransmit } from "./log-file";

const shell = vi.hoisted(() => ({ isTauri: true }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => shell.isTauri }));
vi.mock("@tauri-apps/plugin-log", () => ({
	info: vi.fn(async () => {}),
	warn: vi.fn(async () => {}),
	error: vi.fn(async () => {}),
}));

function send(
	...args: Parameters<NonNullable<ReturnType<typeof logFileTransmit>>["send"]>
) {
	const transmit = logFileTransmit();
	if (!transmit) throw new Error("expected a transmit inside the shell");
	transmit.send(...args);
}

function event(messages: unknown[], bindings: object[] = []): LogEvent {
	return { ts: 0, messages, bindings, level: { label: "info", value: 30 } };
}

describe("logFileTransmit", () => {
	it("stays off outside the desktop shell", () => {
		shell.isTauri = false;
		expect(logFileTransmit()).toBeUndefined();
		shell.isTauri = true;
	});

	it("writes the message with its context as JSON, errors included", () => {
		send(
			"error",
			event([{ cmd: "greet", error: new TypeError("boom") }, "invoke failed"]),
		);
		expect(plugin.error).toHaveBeenCalledWith(
			'invoke failed {"cmd":"greet","error":{"name":"TypeError","message":"boom"}}',
		);
	});

	it("merges child-logger bindings and leaves bare messages bare", () => {
		send("warn", event(["drag failed"], [{ module: "chrome" }]));
		send("info", event(["ready"]));
		expect(plugin.warn).toHaveBeenCalledWith('drag failed {"module":"chrome"}');
		expect(plugin.info).toHaveBeenCalledWith("ready");
	});

	it("maps fatal to error and drops levels the Rust side filters out", () => {
		send("fatal", event(["down"]));
		send("debug", event(["noise"]));
		send("trace", event(["noise"]));
		expect(plugin.error).toHaveBeenCalledWith("down");
		expect(plugin.info).not.toHaveBeenCalled();
	});

	it("survives circular context", () => {
		const node: Record<string, unknown> = {};
		node.self = node;
		send("info", event([{ node }, "tree"]));
		expect(plugin.info).toHaveBeenCalledWith(
			'tree {"node":{"self":"[Circular]"}}',
		);
	});

	it("handles a failed write instead of leaving it unhandled", () => {
		// vi.fn observes every promise it returns, so a mocked rejection never
		// surfaces as unhandled — check for the handler directly instead.
		const failed = Promise.reject(new Error("ipc down"));
		const handled = vi.spyOn(failed, "catch");
		vi.mocked(plugin.error).mockReturnValueOnce(failed);
		send("error", event(["lost"]));
		expect(handled).toHaveBeenCalled();
	});
});
