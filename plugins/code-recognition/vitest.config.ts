import { defineConfig } from "vitest/config";

// 单元测试与源码同目录（src/**/*.test.ts），端到端测试放包根 e2e/。
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "e2e/**/*.test.ts"],
  },
});
