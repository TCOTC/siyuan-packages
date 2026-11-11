import { join } from "node:path";
import type { InlineConfig } from "vite";
import type { BuildOptions } from "./define.ts";
import { pluginSteps } from "./presets/plugin.ts";
import { themeSteps } from "./presets/theme.ts";
import { widgetSteps } from "./presets/widget.ts";
import { findRepoRoot, type ResolvedPackage } from "./resolve.ts";
import type { SassStep } from "./sass.ts";

/**
 * 一次构建的最小单元。需要打包的形态走 vite，纯 CSS 形态直接交给 sass；
 * 两种 runner 的产物都落到 dist/<name>/，后续复制与打包完全一致。
 */
export type BuildStep = { runner: "vite"; label: string; config: InlineConfig } | SassStep;

/**
 * 一次构建的模式。两个维度分开，是因为 sync 要 dev 口径的产物（贴着源码调试），
 * 却只构建一次、不常驻监听。
 */
export interface BuildMode {
  /** 产物口径：dev 不压缩 + inline sourcemap；build 压缩且不带 sourcemap。 */
  profile: "dev" | "build";
  /** 是否常驻监听源码变化；只有 dev 命令为 true。 */
  watch: boolean;
}

export interface Plan {
  pkg: ResolvedPackage;
  repoRoot: string;
  mode: BuildMode;
  /** 产物目录：<repoRoot>/dist/<name>。绝不写进包目录。 */
  outDir: string;
  zipPath: string;
  steps: BuildStep[];
  /** build 模式下是否产出 zip。 */
  zip: boolean;
  /**
   * 本次构建的时间戳（epoch 毫秒）。两个用途，必须同一个值：
   * - 注入为 `__SIYUAN_BUILD_TIME__`，让 JS 拼资源 URL 的缓存标签；
   * - 给产物 CSS 里以 `/plugins/<name>/` 开头的 `url()` 追加 `?v=`。
   * 渲染进程按 URL 缓存已解码的字体，换掉字体文件但 URL 不变时会继续用旧字形
   * （集市更新后要彻底重启才恢复）。同一个 Plan 只取一次，所以 dev 监听重建时稳定。
   */
  buildTime: number;
}

export function plan(pkg: ResolvedPackage, options: BuildOptions, mode: BuildMode): Plan {
  const repoRoot = findRepoRoot(pkg.root);
  const outDir = join(repoRoot, "dist", pkg.name);
  const zipPath = join(repoRoot, "dist", `${pkg.name}.zip`);
  // dev 口径的产物只用于本机链接，永远不打 zip；build 口径才走发布链路
  const zip = mode.profile === "build" && options.zip !== false;
  const buildTime = Date.now();

  let steps: BuildStep[];
  switch (pkg.kind) {
    case "plugin":
      steps = pluginSteps(pkg, options, mode, outDir, buildTime);
      break;
    case "widget":
      steps = widgetSteps(pkg, options, mode, outDir, buildTime);
      break;
    case "theme":
      steps = themeSteps(pkg, options, mode, outDir);
      break;
  }

  return { pkg, repoRoot, mode, outDir, zipPath, steps, zip, buildTime };
}
