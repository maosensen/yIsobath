/**
 * Frontend → log file bridge (mirrors the lib/updater.ts wrapper convention)
 * — the only place the frontend touches plugin-log.
 *
 * Release builds ship without WebView devtools, so a log line that only
 * reaches the console is gone. Fed to pino's `browser.transmit`, this puts
 * info-and-above next to the Rust logs in tauri-plugin-log's targets
 * (stdout + the app log dir), where a bug report can pick it up.
 */

import { isTauri } from "@tauri-apps/api/core";
import { error, info, warn } from "@tauri-apps/plugin-log";
import type { Level, LogEvent } from "pino";

// trace/debug are left out on purpose: the Rust side filters below Info.
const writers: Partial<Record<Level, typeof info>> = {
	info,
	warn,
	error,
	fatal: error,
};

/** pino `browser.transmit` config — `undefined` outside the desktop shell,
 *  since `pnpm dev` in a plain browser has no IPC to send through. */
export function logFileTransmit() {
	if (!isTauri()) return undefined;
	return { level: "info", send: forwardToLogFile } as const;
}

// The plugin tags each line `webview::<caller location>`, and the caller is
// always this function — read the `webview` prefix as "came from the
// frontend", not as a pointer to where the log call was made.
function forwardToLogFile(level: Level, event: LogEvent): void {
	const write = writers[level];
	if (!write) return;
	// Swallow failures: reporting them through the logger would loop.
	write(formatLogEvent(event)).catch(() => {});
}

/**
 * `message {context}`. The plugin's line format prints only the message, so
 * pino's structured fields (bindings + object arguments) ride along as JSON.
 */
function formatLogEvent({ messages, bindings }: LogEvent): string {
	const text: string[] = [];
	const context: Record<string, unknown> = Object.assign({}, ...bindings);
	for (const part of messages) {
		if (part instanceof Error) context.err = part;
		else if (typeof part === "object" && part !== null)
			Object.assign(context, part);
		else text.push(String(part));
	}
	const message = text.join(" ");
	return Object.keys(context).length === 0
		? message
		: `${message} ${stringify(context)}`;
}

function stringify(value: unknown): string {
	const seen = new WeakSet<object>();
	try {
		return JSON.stringify(value, (_key, v: unknown) => {
			// An Error has no enumerable fields — JSON.stringify would emit `{}`.
			if (v instanceof Error) return { name: v.name, message: v.message };
			if (typeof v === "bigint") return v.toString();
			if (typeof v === "object" && v !== null) {
				if (seen.has(v)) return "[Circular]";
				seen.add(v);
			}
			return v;
		});
	} catch {
		return "[unserializable context]";
	}
}
