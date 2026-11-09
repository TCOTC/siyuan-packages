import type { BuildOptions } from "@jeffrey-chen/siyuan-kit";

/**
 * 旧仓库生产构建把 `dropConsole` 打开了：源码里的 `console.warn` / `console.error`
 * 只用于定位问题，发出去的产物里一句都不打印。迁移后保持同一行为，
 * 开发构建（`siyuan-kit dev`）不受影响。
 */
const options: BuildOptions = {
  dropConsole: true,
};

export default options;
