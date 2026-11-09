import type { BuildOptions } from "@jeffrey-chen/siyuan-kit";

/**
 * 字体不经过 vite 的模块图：约 953 KiB 的 woff2 一旦被当成 url() 依赖，
 * 产物里会多出一份哈希命名的副本，而运行期本来就按绝对路径
 * `/plugins/<name>/OpenMoji/...` 加载。这里原样复制到产物根目录。
 *
 * 字体自带的 `OpenMoji/LICENSE.txt`（CC BY-SA 4.0）随字体一起复制；
 * 包自己的 MIT 只在仓库根声明，产物不带原文。
 */
const options: BuildOptions = {
  copy: ["OpenMoji/**/*"],
};

export default options;
