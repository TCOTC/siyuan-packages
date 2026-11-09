import type { BuildOptions } from "@jeffrey-chen/siyuan-kit";

/**
 * wasm 不是 vite 的模块依赖：运行期按绝对路径 `/plugins/<name>/wasm/betlang_wasm.js`
 * 动态 import，再由它去取同目录的 `.wasm`。旧 webpack 的 CopyPlugin 把整份
 * `src/wasm/` 平铺到产物根的 `wasm/`，这里用 `copy` 保持同一位置。
 *
 * 第三方许可是包根的 `THIRD_PARTY-NOTICES.md`，由 kit 的 `collectStaticAssets`
 * 自动带进产物，不用在这里重复声明。
 */
const options: BuildOptions = {
  copy: ["wasm/**/*"],
};

export default options;
