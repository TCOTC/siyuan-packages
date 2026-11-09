import type { BuildOptions } from "@jeffrey-chen/siyuan-kit";

/**
 * 源码里的 `console.warn` / `console.error` 只用于定位问题，发出去的产物里
 * 一句都不打印。开发构建（`siyuan-kit dev`）不受影响。
 */
const options: BuildOptions = {
  dropConsole: true,
};

export default options;
