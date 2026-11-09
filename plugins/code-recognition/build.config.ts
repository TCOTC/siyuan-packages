import type { BuildOptions } from "@jeffrey-chen/siyuan-kit";

// wasm 由运行期按绝对路径动态 import，不在 vite 模块图里，按包内相对路径复制到 wasm/。
const options: BuildOptions = {
  copy: ["wasm/**/*"],
};

export default options;
