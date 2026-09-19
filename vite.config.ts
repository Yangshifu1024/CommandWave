/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Vite options tailored for Tauri development
  clearScreen: false,
  server: {
    port: 8000,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  define: {
    // Build timestamp shown in the About dialog; baked into the bundle.
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    target:
      process.env.TAURI_ENV_PLATFORM == "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_ENV_DEBUG ? "oxc" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },

  // The test runner reads this same file. Scratch copies of the repository
  // under `.codewave/` (the agent workspace, git-ignored) carry their own
  // `*.test.ts` files; collecting those would run stale tests against stale
  // code and inflate the reported counts, so they are excluded.
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/src-tauri/**",
      "**/.codewave/**",
    ],
  },
});
