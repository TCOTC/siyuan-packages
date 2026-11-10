import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 单元测试与源码同目录（src/**/*.test.ts），端到端测试放包根 e2e/。
//
// `siyuan` 只发布类型声明、没有运行期入口，单测经 alias 指向本包的替身；
// 替身统一放在 src/__mocks__/siyuan.ts，与源码同目录便于随接口一起改。
// alias 必须是绝对路径：browser-like 环境下 vitest 会把相对字符串别名按 URL 语义解析。
export default defineConfig({
  resolve: {
    alias: {
      siyuan: fileURLToPath(new URL("./src/__mocks__/siyuan.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "e2e/**/*.test.ts"],
  },
});
