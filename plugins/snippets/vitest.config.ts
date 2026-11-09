// Vitest 配置：单测默认 Node 环境，需要 DOM 的用例用文件头 `@vitest-environment jsdom` 单独声明。
// - siyuan 包仅为纯类型包（无运行时 JS 入口），源码在构建时由思源宿主提供；
//   测试环境经 alias 指向 mock（tests/mocks/siyuan.ts），使 import "siyuan" 的模块可被加载并注入可控桩。
// - alias 目标须为绝对路径：vitest 的 jsdom（browser-like）环境对相对字符串别名按
//   URL 语义解析会失效（裸导入 "siyuan" 解析失败），node 环境则正常。
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      siyuan: resolve(process.cwd(), "tests/mocks/siyuan.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
  },
});
