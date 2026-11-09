import { defineConfig } from "vitest/config";

// 用例都是纯数据拼装与 DOM 字符串比对，不需要浏览器环境；
// 需要 DOM 的用例（如 tokenField 的 supportsTextSecurity）自行打桩。
export default defineConfig({
  test: {
    include: ["tests/**/*.test.mjs"],
  },
});
