import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // CI runner has limited memory; unbounded jsdom workers intermittently
    // starve Vitest's RPC (onTaskUpdate) even when every assertion passes.
    // One worker gives deterministic isolation and prevents phantom CI failures.
    maxWorkers: 1,
    fileParallelism: false,
    include: ["src/**/*.{test,spec}.{ts,tsx}", "supabase/functions/_shared/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
