import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { BuildOptions } from "../define.ts";
import type { BuildStep } from "../plan.ts";
import type { ResolvedPackage } from "../resolve.ts";

/** 主题 preset：styles/index.scss → theme.css，直接交给 sass，不套 vite。 */
export function themeSteps(pkg: ResolvedPackage, options: BuildOptions, dev: boolean, outDir: string): BuildStep[] {
  // 主题只有一个入口；需要第二个入口时再由 build.config.ts 提供 entry。
  const input = resolve(pkg.root, options.entry ?? "styles/index.scss");

  // icons/ 不进产物，编译后由 runner 内联成 data URI。
  const icons = join(pkg.root, "icons");

  return [
    {
      runner: "sass",
      label: "theme:css",
      input,
      output: join(outDir, "theme.css"),
      style: dev ? "expanded" : "compressed",
      sourceMap: dev,
      ...(existsSync(icons) ? { iconDir: icons } : {}),
    },
  ];
}
