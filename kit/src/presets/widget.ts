import { resolve } from "node:path";
import type { InlineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import type { BuildOptions } from "../define.ts";
import type { BuildStep } from "../plan.ts";
import type { ResolvedPackage } from "../resolve.ts";

/**
 * 挂件 preset。
 *
 * 挂件与插件的本质差别：思源把它当页面加载（/widgets/<name>/index.html），
 * 所以产物是「一个自包含的 HTML」，而不是一个 CJS bundle。
 * 用 vite-plugin-singlefile 把 JS/CSS 全部内联，避免运行时再去请求相对资源
 * ——这与 inline-elements 现在的做法一致。
 */
export function widgetSteps(pkg: ResolvedPackage, options: BuildOptions, dev: boolean, outDir: string): BuildStep[] {
  return [
    {
      runner: "vite",
      label: "widget:html",
      config: widgetConfig(pkg, dev, outDir, options),
    },
  ];
}

function widgetConfig(pkg: ResolvedPackage, dev: boolean, outDir: string, options: BuildOptions): InlineConfig {
  return {
    root: pkg.root,
    configFile: false,
    logLevel: "warn",
    base: `/widgets/${pkg.name}/`,

    define: {
      "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production"),
      "process.env": "{}",
      ...options.define,
    },

    plugins: [
      // 单文件内联。removeViteModuleLoader 去掉只在 dev server 下有用的预加载逻辑，
      // 挂件是纯静态页面，不需要。
      viteSingleFile({ removeViteModuleLoader: true }),
    ],

    build: {
      outDir,
      emptyOutDir: false,
      ...(dev ? { watch: {} } : {}),
      sourcemap: dev ? "inline" : false,
      minify: !dev,
      rollupOptions: {
        // 挂件入口是 HTML，不是 JS。源文件按约定放在包根。
        input: resolve(pkg.root, "index.html"),
        // output.minify 一旦给出就整体替换 vite 由 build.minify 推导出的默认值，
        // 所以只在真的要丢 console 时才写，其余情况仍走 vite 的默认压缩。
        ...(options.dropConsole && !dev ? { output: { minify: { compress: { dropConsole: true } } } } : {}),
      },
    },
  };
}
