// WebCrypto/btoa/atob/TextEncoder 都是 Node 全局，无需 jsdom。
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
  },
});
