import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Research harness. Runs the shipped engine on data outside the repo (set
 * REALDATA to a folder of EODHD JSON responses). Not part of `npm test`:
 * real market data is licensed and is never committed.
 */
export default defineConfig({
  test: {
    include: ["research/**/*.research.ts"],
    environment: "node",
    testTimeout: 1_800_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "../src"),
      "server-only": path.resolve(import.meta.dirname, "server-only-stub.ts"),
    },
  },
});
