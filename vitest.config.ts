import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@seiton/shared": path.resolve(__dirname, "packages/shared/src/index.ts"),
      "@seiton/worker": path.resolve(__dirname, "apps/worker/src/index.ts"),
    },
  },
  test: {
    testTimeout: 90000,
    hookTimeout: 30000,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
