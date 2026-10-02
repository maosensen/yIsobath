/**
 * The survey's IPC boundary — the only place the instrument reaches the Rust
 * side (`src-tauri/src/commands/mod.rs`). Everything goes through the
 * generated `commands.*`; this file adds the progress `Channel` and unwraps
 * fallible results into thrown `AppError`s.
 */

import { Channel } from "@tauri-apps/api/core";
import {
	commands,
	type DevOptions,
	type SurveyPlaces,
	type SurveyProgress,
	type SurveyResult,
	type SurveyTarget,
} from "@/lib/bindings";
import { isCommandError } from "@/lib/errors";
import { unwrap } from "@/lib/tauri";
import { T } from "@/lib/text";

export type { SurveyPlaces, SurveyResult, SurveyTarget };

/**
 * Progress with plain numbers. specta types every `f64` as `number | null`
 * (serde writes NaN as null); the survey only ever sends finite counts.
 */
export type Progress = {
	files: number;
	dirs: number;
	bytes: number;
	current: string;
};

function progressOf(p: SurveyProgress): Progress {
	return {
		files: p.files ?? 0,
		dirs: p.dirs ?? 0,
		bytes: p.bytes ?? 0,
		current: p.current,
	};
}

export function surveyPlaces(): Promise<SurveyPlaces> {
	return commands.surveyPlaces();
}

/** Walk a target; `onProgress` fires every ~120 ms while it runs. */
export async function runSurvey(
	target: SurveyTarget,
	onProgress: (p: Progress) => void,
): Promise<SurveyResult> {
	const channel = new Channel<SurveyProgress>();
	channel.onmessage = (p) => onProgress(progressOf(p));
	return unwrap(await commands.survey(target, channel));
}

/** End the running walk: `cancel` discards it, otherwise it is shown as is. */
export function stopSurvey(cancel: boolean): Promise<void> {
	return commands.surveyStop(cancel);
}

export async function revealInFinder(path: string): Promise<void> {
	unwrap(await commands.reveal(path));
}

/** Expand a folded folder; resolves with the survey as it now stands. */
export async function expandFolder(path: string): Promise<SurveyResult> {
	return unwrap(await commands.expandFolder(path));
}

/** Move to the Trash; resolves with the survey as it now stands. */
export async function moveToTrash(path: string): Promise<SurveyResult> {
	return unwrap(await commands.moveToTrash(path));
}

export async function openPrivacySettings(): Promise<void> {
	unwrap(await commands.openPrivacySettings());
}

export function devOptions(): Promise<DevOptions> {
	return commands.devOptions();
}

/** True when a thrown survey error is the user's own cancel. */
export function isCancel(error: unknown): boolean {
	return isCommandError(error) && error.code === "Cancelled";
}

/** A sentence for an error from any of the calls above. */
export function errorText(error: unknown): string {
	if (isCommandError(error)) {
		switch (error.code) {
			case "Busy":
				return T.errors.busy;
			case "Internal":
				return T.errors.internal;
			case "Refused":
				return T.errors.refused[error.detail];
			case "NotFound":
				return T.errors.notFound(error.detail);
			case "Cancelled":
				return T.common.cancel;
			default:
				return error.detail;
		}
	}
	return error instanceof Error ? error.message : String(error);
}
