import type { BuildOptions } from "@jeffrey-chen/siyuan-kit";

/**
 * 字体不经过 vite 的模块图：约 953 KiB 的 woff2 一旦被当成 url() 依赖，
 * 产物里会多出一份哈希命名的副本，而运行期本来就按绝对路径
 * `/plugins/<name>/OpenMoji/...` 加载。这里原样复制到产物根目录，
 * 与旧 webpack 的 CopyPlugin 结果一致。
 *
 * `LICENSE` 也要显式列上：kit 的 `collectStaticAssets` 只管清单 / README /
 * 图标 / 预览图 / i18n，而旧 webpack 配置把根 `LICENSE` 也打进了 package.zip。
 * 产物清单不能变，所以在这里补上（其他包不做这一步，是因为它们的旧产物本来就没有）。
 */
const options: BuildOptions = {
  copy: ["OpenMoji/**/*", "LICENSE"],
};

export default options;
