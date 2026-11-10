import { defineConfig } from "vitest/config";

// 两个函数都只处理字符串与 URL，不需要 DOM。
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
  },
});
