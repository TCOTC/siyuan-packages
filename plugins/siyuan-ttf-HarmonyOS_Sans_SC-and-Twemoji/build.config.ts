import type { BuildOptions } from "@jeffrey-chen/siyuan-kit";

/**
 * 字体文件不经过 vite 的模块图：11 MB 的 woff 一旦被当成 url() 依赖，
 * 产物里会多出一份哈希命名的副本，而运行期本来就按绝对路径
 * `/plugins/<name>/HarmonyOS_Sans/...` 加载。这里原样复制到产物根目录，
 * 与旧 webpack 的 CopyPlugin 结果一致。
 */
const options: BuildOptions = {
  copy: ["HarmonyOS_Sans/**/*", "Twemoji/**/*"],
};

export default options;
