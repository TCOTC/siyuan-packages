import { defineConfig } from "vitest/config";

// 定位函数是纯函数（窗口宽度、停靠栏宽度都由参数传入），只有取锚点与开菜单两个包装碰 DOM，不需要 jsdom。
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
  },
});
