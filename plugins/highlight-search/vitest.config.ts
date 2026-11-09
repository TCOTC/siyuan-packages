import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 测试直接操作 DOM（document.createElement / innerHTML），需要浏览器环境
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
});
