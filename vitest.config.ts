import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(root, "src") },
  },
  test: {
    // Loads .env.local so the DB-backed integration tests can reach Supabase.
    // Pure tests (time/availability) don't need it.
    setupFiles: ["./src/lib/booking/__tests__/setup.ts"],
    include: ["src/**/*.test.ts"],
    testTimeout: 20_000,
  },
});
