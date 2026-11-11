import { resolve } from "node:path";
import type { InlineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import type { BuildOptions } from "../define.ts";
import type { BuildMode, BuildStep } from "../plan.ts";
import type { ResolvedPackage } from "../resolve.ts";

/**
 * 挂件 preset：产物是 /widgets/<name>/index.html。
 * 用 vite-plugin-singlefile 把 JS/CSS 全部内联，避免运行时请求相对资源。
 */
export function widgetSteps(pkg: ResolvedPackage, options: BuildOptions, mode: BuildMode, outDir: string): BuildStep[] {
  return [
    {
      runner: "vite",
      label: "widget:html",
      config: widgetConfig(pkg, mode, outDir, options),
    },
  ];
}

function widgetConfig(pkg: ResolvedPackage, mode: BuildMode, outDir: string, options: BuildOptions): InlineConfig {
  const dev = mode.profile === "dev";

  return {
    root: pkg.root,
    configFile: false,
    logLevel: "warn",
    base: `/widgets/${pkg.name}/`,

    define: {
      "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production"),
      "process.env": "{}",
      // 构建时间戳，与插件预设同义：给固定 URL 的静态资源拼缓存标签。见 presets/plugin.ts 的注释。
      __SIYUAN_BUILD_TIME__: JSON.stringify(String(Date.now())),
      ...options.define,
    },

    plugins: [
      // removeViteModuleLoader 去掉只在 dev server 下有用的预加载逻辑。
      viteSingleFile({ removeViteModuleLoader: true }),
    ],

    build: {
      outDir,
      emptyOutDir: false,
      ...(mode.watch ? { watch: {} } : {}),
      sourcemap: dev ? "inline" : false,
      minify: !dev,
      rollupOptions: {
        // 挂件入口是 HTML，源文件按约定放在包根。
        input: resolve(pkg.root, "index.html"),
        // output.minify 一旦给出就整体替换 vite 由 build.minify 推导出的默认值，
        // 所以只在真的要丢 console 时才写，其余情况仍走 vite 的默认压缩。
        ...(options.dropConsole && !dev ? { output: { minify: { compress: { dropConsole: true } } } } : {}),
      },
    },
  };
}
