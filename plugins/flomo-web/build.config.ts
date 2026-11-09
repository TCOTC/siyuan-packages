import type { BuildOptions } from "@jeffrey-chen/siyuan-kit";

/**
 * 主进程侧的开发者工具挂钩脚本，由插件在运行时用 `remote.require()` 按
 * `/plugins/<name>/devtools-hook.cjs` 加载，不属于 vite 的模块图。
 * 旧 webpack 的 CopyPlugin 会把它复制进产物根目录，这里保持同样的位置。
 */
const options: BuildOptions = {
  copy: ["devtools-hook.cjs"],
};

export default options;
