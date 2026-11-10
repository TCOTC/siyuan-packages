import type { BuildOptions } from "@jeffrey-chen/siyuan-kit";

/**
 * 主线程入口用 cjs，Worker 用 iife 并挂到全局名 `isqCodecWorker`。
 * Worker 里没有 document，无法按需加载 chunk；vite 的 lib 模式本身就关掉了代码分割
 * （`codeSplitting: false`），动态 import 会自动内联，不需要额外选项。
 */
const options: BuildOptions = {
  passes: [
    { format: "cjs", entry: "src/index.ts" },
    { format: "iife", entry: "src/codec/worker.ts", outName: "codecWorker", name: "isqCodecWorker" },
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
