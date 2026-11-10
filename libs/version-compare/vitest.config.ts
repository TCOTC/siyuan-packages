import { defineConfig } from "vitest/config";

// 纯字符串处理，不需要 DOM。
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
  },
});
