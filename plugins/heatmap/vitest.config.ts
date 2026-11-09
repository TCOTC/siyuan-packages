import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // `siyuan` 只发布 .d.ts，没有可执行的 JS 入口。
    alias: {
      siyuan: fileURLToPath(new URL("./test/siyuan-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
