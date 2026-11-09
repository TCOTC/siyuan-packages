import type { BuildOptions } from "@jeffrey-chen/siyuan-kit";

/**
 * 主进程侧的开发者工具挂钩脚本，由插件运行时用 `remote.require()` 按
 * `/plugins/<name>/devtools-hook.cjs` 加载，不在 vite 模块图里。
 */
const options: BuildOptions = {
  copy: ["devtools-hook.cjs"],
};

export default options;
