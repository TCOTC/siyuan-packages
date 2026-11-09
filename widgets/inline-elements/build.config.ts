import type { BuildOptions } from "@jeffrey-chen/siyuan-kit";

/** 源码里的 console 只用于定位问题，生产产物里去掉；dev 构建不受影响。 */
const options: BuildOptions = {
  dropConsole: true,
};

export default options;
