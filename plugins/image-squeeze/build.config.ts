import type { BuildOptions } from "@jeffrey-chen/siyuan-kit";

/**
 * 两个入口，两种格式：
 *   - 主线程 index：思源插件运行时，CommonJS
 *   - codecWorker：Web Worker，挂到全局名 `isqCodecWorker` 上
 *
 * Worker 里没有 `document`，无法用脚本注入的方式按需加载 chunk，
 * 因此把动态 import 内联进同一个文件——旧 webpack 用 `import-scripts`
 * 输出 `chunk/*.js` 绕开这个问题，这里不需要那份产物。
 */
const options: BuildOptions = {
  passes: [
    { format: "cjs", entry: "src/index.ts" },
    {
      format: "iife",
      entry: "src/codec/worker.ts",
      outName: "codecWorker",
      name: "isqCodecWorker",
      inlineDynamicImports: true,
    },
  ],
  // Vite 的 lib 模式会无条件把 `new URL(..., import.meta.url)` 引用的资源内联成 data URL，
  // 而 iife 输出没有 `import.meta`：rolldown 会把它替换成 `{}`，产物变成
  // `new URL(dataUrl, '' + ({}).url)`，即 base 为 "undefined"，运行时直接抛 Invalid URL。
  // Worker 里 `self.location.href` 是脚本自身的完整地址，作为 base 合法且正确。
  define: {
    "import.meta.url": "self.location.href",
  },
};

export default options;
