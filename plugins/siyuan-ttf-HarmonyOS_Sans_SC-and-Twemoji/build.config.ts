import type { BuildOptions } from "@jeffrey-chen/siyuan-kit";

/**
 * 字体不走 vite 模块图：产物按绝对路径 `/plugins/<name>/HarmonyOS_Sans/...` 加载，
 * 这里直接复制到产物根目录。
 */
const options: BuildOptions = {
  copy: ["HarmonyOS_Sans/**/*", "Twemoji/**/*"],
};

export default options;
