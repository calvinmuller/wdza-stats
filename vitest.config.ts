import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**"],
    // Test files share one real Postgres database and blanket-delete their
    // tables in setup/teardown, so files must not run concurrently against it.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "apps/web/src"),
    },
  },
});
