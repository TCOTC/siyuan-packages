import { defineConfig } from "vitest/config";

// 只处理 Response 与 FormData，用例里用全局 fetch 替身，不需要 DOM。
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
  },
});
