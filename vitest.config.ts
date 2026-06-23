import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Tests run against the store's in-memory backend (no KV env vars => the
// globalThis.__edgesMem fallback in lib/store.ts), so the suite needs no Redis.
// Default environment is `node`; component/DOM tests opt in per-file with a
//   // @vitest-environment jsdom
// docblock at the top of the file.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}", "lib/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**/*.{ts,tsx}"],
      exclude: ["lib/**/*.client.tsx", "lib/**/*.test.*", "**/*.d.ts"],
    },
  },
});
