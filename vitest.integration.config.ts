import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["src/**/*.integration.ts"],
    fileParallelism: false,
    testTimeout: 15_000,
    server: { deps: { inline: ["next-auth"] } },
  },
});
