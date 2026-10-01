import pino from "pino";
import { logFileTransmit } from "@/lib/log-file";

const isDev = import.meta.env.DEV;

/**
 * Shared frontend logger.
 *
 * Runs in the WebView, so output goes to the browser console as
 * structured objects. Inside the desktop shell, info-and-above is also
 * forwarded to tauri-plugin-log (see `@/lib/log-file`), so it lands in the
 * same log file as the Rust side.
 *
 * Override the level with the `VITE_LOG_LEVEL` env var.
 */
export const logger = pino({
	level: import.meta.env.VITE_LOG_LEVEL ?? (isDev ? "debug" : "info"),
	browser: {
		asObject: true,
		transmit: logFileTransmit(),
	},
});
