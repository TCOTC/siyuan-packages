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
    // 每条用例前清掉 vi.fn 的调用记录，避免替身状态在用例之间泄漏
    restoreMocks: true,
    // vitest 的 jsdom 默认 runScripts: "dangerously"，插进 document.head 的 JS 片段会被
    // 真的执行 —— 夹具里的 console.log(1) 于是直接打到 CI 日志里。单测断言的是元素本身
    // （存在、tagName、textContent、被移除），不需要它跑起来；改成 "outside-only" 只允许
    // 从外部 eval，静音的同时保留 console 输出用于排查失败用例。
    environmentOptions: { jsdom: { runScripts: "outside-only" } },
  },
});
