/**
 * kit 的公开契约。
 *
 * 包内可选地放一个 `build.config.ts`，默认导出 `defineBuild({...})`；
 * 没有配置文件时完全按目录约定推断，标准插件不需要任何构建配置。
 */

/** 集市包类型，决定清单文件名，与 bazaar 的 rules.ManifestFile() 一一对应。 */
export type PackageKind = "plugin" | "theme" | "widget";

/**
 * 一次构建 pass。绝大多数包只有一个；多 pass 用于主入口与 Worker 入口格式不同。
 */
export interface PassOptions {
  /** cjs = 思源插件运行时；iife = Web Worker；es = 内核侧脚本（Rollup 里叫 es）。 */
  format: "cjs" | "iife" | "es";
  entry: string;
  /** 产物文件名（不含扩展名）。默认 `index`。 */
  outName?: string;
  /** iife 格式必填：产物挂到哪个全局名上。 */
  name?: string;
  /**
   * 把动态 import 内联进同一个文件。Worker 里没有 `document`，
   * 无法用脚本注入方式按需加载 chunk。
   */
  inlineDynamicImports?: boolean;
}

export interface BuildOptions {
  /** 一般不必写，默认由目录推断：plugins/* → plugin。 */
  kind?: PackageKind;
  /** 单入口简写，等价于 `passes: [{ format: "cjs", entry }]`。 */
  entry?: string;
  /** 多 pass / 多格式。存在时忽略 `entry`。 */
  passes?: PassOptions[];
  /** 额外注入的常量，会与默认的 process.env.* 合并。 */
  define?: Record<string, string>;
  /** 额外复制的静态文件（相对包根，支持简单 glob）。 */
  copy?: string[];
  /**
   * 生产构建里丢掉所有 `console.*`。dev 不生效——本地调试正需要这些日志。
   */
  dropConsole?: boolean;
  /** 是否产出 zip，默认 true。 */
  zip?: boolean;
}

/** 仅用于给 `build.config.ts` 提供类型与补全，运行时是恒等函数。 */
export function defineBuild(options: BuildOptions): BuildOptions {
  return options;
}
