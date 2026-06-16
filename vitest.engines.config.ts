import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["tests/engines/**/*.test.ts"],
    testTimeout: 90000,
    hookTimeout: 30000,
    reporters: ["verbose"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
