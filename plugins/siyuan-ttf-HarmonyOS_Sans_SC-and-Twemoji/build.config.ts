import type { BuildOptions } from "@jeffrey-chen/siyuan-kit";

/**
 * 字体不走 vite 模块图：产物按绝对路径 `/plugins/<name>/HarmonyOS_Sans/...` 加载，
 * 这里直接复制到产物根目录。
 *
 * Twemoji 的字形文件与它的 CC-BY 图形许可放在 libs/emoji-font/fonts，两个字体插件
 * 分发的是同一份二进制；用 `@repo/` 前缀从仓库根取，避免在各包目录里各存一份、
 * 日后再漂成不同版本。许可随字体一起进产物（同 OpenMoji 的 `OpenMoji/LICENSE.txt`）。
 */
const options: BuildOptions = {
  copy: ["HarmonyOS_Sans/**/*", { from: "@repo/libs/emoji-font/fonts/*", to: "Twemoji" }],
};

export default options;
