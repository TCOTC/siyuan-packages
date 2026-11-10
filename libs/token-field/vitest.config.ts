import { defineConfig } from "vitest/config";

// 探测函数接受传入的 CSS 对象，切换函数只碰 HTMLElement 的 class/type，用 node 环境配替身即可。
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
  },
});
