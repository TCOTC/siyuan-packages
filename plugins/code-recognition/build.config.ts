import type { BuildOptions } from "@jeffrey-chen/siyuan-kit";

/**
 * wasm 不是 vite 的模块依赖：运行期按绝对路径 `/plugins/<name>/wasm/betlang_wasm.js`
 * 动态 import，再由它去取同目录的 `.wasm`。旧 webpack 的 CopyPlugin 把整份
 * `src/wasm/` 平铺到产物根的 `wasm/`，这里用 `copy` 保持同一位置。
 *
 * 第三方许可文本同样由旧 CopyPlugin 复制到产物根，`collectStaticAssets` 只认
 * 清单 / README / 图标 / 预览图，所以要显式列出来。
 */
const options: BuildOptions = {
  copy: ["wasm/**/*", "THIRD_PARTY-*-LICENSE"],
};

export default options;
