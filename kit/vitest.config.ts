import { defineConfig } from "vitest/config";

// kit 的单测直接在临时目录上造仓库跑真实 fs：契约门禁的全部意义就是「读文件 → 报问题」，
// mock 掉 fs 会把路径拼错、readdir 漏读这类问题一起藏起来。所以不需要 jsdom。
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "e2e/**/*.test.ts"],
  },
});
