import { defineConfig } from "vitest/config";

// 单元测试与源码同目录（src/**/*.test.ts），端到端测试放包根 e2e/。
// 本包的用例直接操作 DOM，因此整包跑在 jsdom 下（其余包默认 node 环境）。
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "e2e/**/*.test.ts"],
  },
});
