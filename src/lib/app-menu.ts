/**
 * The macOS app menu in the UI language. Rust lays the menu out
 * (`src-tauri/src/menu.rs`); the words come from `T.menu`, so they live with
 * every other string. Called by the root route at launch and on each switch.
 */

import { isTauri } from "@tauri-apps/api/core";
import { commands } from "@/lib/bindings";
import { logger } from "@/lib/logger";
import { unwrap } from "@/lib/tauri";
import { T } from "@/lib/text";

export async function syncAppMenu(): Promise<void> {
	// `pnpm dev` in a plain browser has no app menu to word
	if (!isTauri()) return;
	try {
		unwrap(await commands.setAppMenu({ ...T.menu }));
	} catch (error) {
		logger.warn({ error }, "could not word the app menu");
	}
}
