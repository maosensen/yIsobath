/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Vitest config is kept separate from vite.config.ts so the TanStack Router
// plugin doesn't try to generate routes during test runs. Only the React
// plugin + the tsconfig `@/*` alias are needed here.
export default defineConfig({
	plugins: [react()],
	resolve: { tsconfigPaths: true },
	test: {
		environment: "jsdom",
		setupFiles: ["./src/test/setup.ts"],
		include: ["src/**/*.{test,spec}.{ts,tsx}"],
		css: false,
	},
});
