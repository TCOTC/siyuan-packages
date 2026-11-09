import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // `siyuan` 包只发布 .d.ts（exports 里没有 JS 入口），只能在思源内核里被注入。
    // 单测换成最小替身，行为与原仓库的 test/preload-siyuan.cjs 一致。
    alias: {
      siyuan: fileURLToPath(new URL("./test/siyuan-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
