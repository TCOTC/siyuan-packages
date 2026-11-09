import { join } from "node:path";
import type { InlineConfig, Plugin } from "vite";
import type { BuildOptions } from "./define.ts";
import { pluginSteps } from "./presets/plugin.ts";
import { themeSteps } from "./presets/theme.ts";
import { widgetSteps } from "./presets/widget.ts";
import { findRepoRoot, type ResolvedPackage } from "./resolve.ts";
import type { SassStep } from "./sass.ts";

/**
 * 一次构建要执行的最小单元。
 *
 * kit 统一的是「契约 + 产物」，不是「所有包共用同一个打包器」：
 *   - 需要打包的形态（插件、挂件）走 vite
 *   - 纯 CSS 形态（主题）直接交给 sass 编译，不必为了让工具统一而套一层 vite
 * 两种 runner 产出的东西都落到同一个地方（dist/<name>/），后续的复制与打包完全一致。
 */
export type BuildStep = { runner: "vite"; label: string; config: InlineConfig } | SassStep;

export interface Plan {
  pkg: ResolvedPackage;
  repoRoot: string;
  dev: boolean;
  /** 产物目录：<repoRoot>/dist/<name>。绝不写进包目录，源码和产物完全分离。 */
  outDir: string;
  /** 发布用压缩包：<repoRoot>/dist/<name>.zip */
  zipPath: string;
  steps: BuildStep[];
  /** build 模式下是否产出 zip。 */
  zip: boolean;
}

/**
 * @param onBundle 每次产物落盘后的回调，参数是产物目录（dev 模式下用来同步进思源工作空间）。
 *   vite 走插件钩子，所以 watch 每次重建都会触发。
 */
export function plan(pkg: ResolvedPackage, options: BuildOptions, dev: boolean, onBundle?: (outDir: string) => void): Plan {
  const repoRoot = findRepoRoot(pkg.root);
  const outDir = join(repoRoot, "dist", pkg.name);
  const zipPath = join(repoRoot, "dist", `${pkg.name}.zip`);
  const zip = !dev && options.zip !== false;

  let steps: BuildStep[];
  switch (pkg.kind) {
    case "plugin":
      steps = pluginSteps(pkg, options, dev, outDir);
      break;
    case "widget":
      steps = widgetSteps(pkg, options, dev, outDir);
      break;
    case "theme":
      steps = themeSteps(pkg, options, dev, outDir);
      break;
  }

  if (onBundle) {
    for (const step of steps) {
      if (step.runner === "vite") {
        step.config.plugins = [...(step.config.plugins ?? []), bundleHook(() => onBundle(outDir))];
      }
    }
  }

  return { pkg, repoRoot, dev, outDir, zipPath, steps, zip };
}

function bundleHook(onBundle: () => void): Plugin {
  return {
    name: "siyuan-workspace-sync",
    closeBundle() {
      onBundle();
    },
  };
}
