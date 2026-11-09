import { join, resolve } from "node:path";
import type { BuildOptions } from "../define.ts";
import type { BuildStep } from "../plan.ts";
import type { ResolvedPackage } from "../resolve.ts";

/**
 * 主题 preset。
 *
 * 主题的产物就是一份 CSS（theme.css），没有模块系统、没有 chunk、不需要打包器。
 * 所以这里不套 vite，直接把 scss 交给 sass 编译。
 *
 * 之所以不让「引擎统一」变成「一律用 vite」：为了一份 CSS 去启动 rollup、
 * 再产出一个没人用的 ESM 桩文件，只是为了让工具看起来一致，代价是配置更复杂、
 * 产物里多出无意义文件。统一的是契约和产物，不是打包器。
 */
export function themeSteps(pkg: ResolvedPackage, options: BuildOptions, dev: boolean, outDir: string): BuildStep[] {
  // Whisper 现在的源码入口在 styles/ 下（builder/compile.mjs 负责编译）。
  // TODO(P3)：确认实际入口文件名与是否需要多个 scss 入口，再固化约定。
  const input = resolve(pkg.root, options.entry ?? "styles/index.scss");

  return [
    {
      runner: "sass",
      label: "theme:css",
      input,
      output: join(outDir, "theme.css"),
      style: dev ? "expanded" : "compressed",
    },
  ];
}
