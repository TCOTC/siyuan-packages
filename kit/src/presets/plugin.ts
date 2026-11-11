import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { InlineConfig, Plugin } from "vite";
import type { BuildOptions, PassOptions } from "../define.ts";
import type { BuildMode, BuildStep } from "../plan.ts";
import type { ResolvedPackage } from "../resolve.ts";

/** 插件 preset：默认单入口 cjs，多入口用 passes。 */
export function pluginSteps(pkg: ResolvedPackage, options: BuildOptions, mode: BuildMode, outDir: string, buildTime: number): BuildStep[] {
  return passesOf(options).map((pass) => ({
    runner: "vite",
    label: `plugin:${pass.format}:${pass.outName ?? "index"}`,
    config: pluginConfig(pkg, pass, mode, outDir, options.define, buildTime),
  }));
}

/** 没写 passes 时按单入口 cjs 处理；写了 entry 就只换入口。 */
function passesOf(options: BuildOptions): PassOptions[] {
  if (options.passes && options.passes.length > 0) {
    return options.passes;
  }
  return [{ format: "cjs", entry: options.entry ?? "src/index.ts" }];
}

function pluginConfig(pkg: ResolvedPackage, pass: PassOptions, mode: BuildMode, outDir: string, extraDefine: Record<string, string> | undefined, buildTime: number): InlineConfig {
  const dev = mode.profile === "dev";

  return {
    root: pkg.root,
    // 由 kit 完全接管配置，不让包内的 vite.config.* 参与合并
    configFile: false,
    logLevel: "warn",

    // 样式 import 存在、但编译后没有任何规则时（例如整份 SCSS 都是注释），
    // vite 不会产出 CSS 资产。dev 下补个空的 index.css，让工作空间里看到的结构
    // 与真实插件一致；build 不补——没有有效样式就不该产出这个文件。
    plugins: dev ? [ensureStyleAsset(pkg, pass.entry, outDir)] : [],

    // 插件装进内核后位于 /plugins/<name>/ 下，静态资源、Worker、wasm 的相对路径
    // 都以它为基准；开发时从包根加载，结构一致，所以同一个 base 两边都能用。
    base: `/plugins/${pkg.name}/`,

    define: {
      "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production"),
      // 部分包用 DEV_MODE 分支判断是否注册调试入口
      "process.env.DEV_MODE": JSON.stringify(String(dev)),
      // 思源插件不是 Node 进程；这里整体替换掉，避免 bundle 里残留 process 引用
      "process.env": "{}",
      // 构建时间戳（epoch 毫秒的字符串），见 Plan.buildTime 的注释。
      __SIYUAN_BUILD_TIME__: JSON.stringify(String(buildTime)),
      ...extraDefine,
    },

    build: {
      outDir,
      // 产物目录里有上一次的残留会被打进 zip，交给 kit 在构建前统一清理，
      // 而不是让 vite 清空（dev 模式下 outDir 是包根，绝不能清空）
      emptyOutDir: false,
      ...(mode.watch ? { watch: {} } : {}),
      // dev 与 build 的产物形态刻意不同，只有 build 的结果会进 package.zip：
      //   dev   —— 不压缩、inline sourcemap（贴着源码调试，行号要对得上）
      //   build —— 压缩、无 sourcemap（思源用 eval 加载，外链 .map 也解析不到）
      sourcemap: dev ? "inline" : false,
      minify: !dev,
      lib: {
        entry: resolve(pkg.root, pass.entry),
        formats: [pass.format],
        fileName: () => pass.outName ?? "index",
        // 必须显式给，否则 vite 会去读 package.json 的 name 推断 CSS 文件名；
        // 思源按固定名找样式。
        cssFileName: pass.outName ?? "index",
        ...(pass.name ? { name: pass.name } : {}),
      },
      rollupOptions: {
        // siyuan 由内核注入，不参与打包
        external: ["siyuan", "process"],
        // 第三方预编译产物自身带 eval（libs/vconsole 的 dist 是上游官方构建），本仓改不了，
        // 每次构建都刷两条 EVAL 警告会盖住真正的构建问题。只按来源过滤，不按 code 全局关 ——
        // 本仓代码里出现 eval 仍然要报。
        onLog(level, log, handler) {
          if (isVendorLog(log)) {
            return;
          }
          handler(level, log);
        },
        output: {
          // 必须用 outName：lib 模式下的 `[name]` 来自入口文件名，
          // 而插件运行时按固定名加载。
          entryFileNames: `${pass.outName ?? "index"}.js`,
          chunkFileNames: "chunk/[name]-[hash].js",
          // 思源按固定名找样式（index.css），而 lib 模式默认给它带哈希、还可能塞进
          // assets/ 子目录。插件只会有一份样式入口。
          assetFileNames: (asset) => (asset.names.some((name) => name.endsWith(".css")) ? "index.css" : "assets/[name]-[hash][extname]"),
        },
      },
    },
  };
}

/** 由上游发布、直接放进仓库的预编译产物（不参与本仓的 lint 与改写）。 */
const VENDOR_DIRS = ["libs/vconsole/"];

/** 判断一条构建日志是否来自上面那些第三方产物；`loc.file` 缺失时退回 `id`。 */
function isVendorLog(log: { loc?: { file?: string }; id?: string }): boolean {
  const file = log.loc?.file ?? log.id ?? "";
  return VENDOR_DIRS.some((dir) => file.includes(dir));
}

/** dev 专用：入口引用了样式、但编译结果为空时，补一个空 index.css。 */
function ensureStyleAsset(pkg: ResolvedPackage, entry: string, outDir: string): Plugin {
  const source = readFileSync(resolve(pkg.root, entry), "utf8");
  if (!/import\s+["'][^"']+\.(css|scss|sass|less|styl)["']/.test(source)) {
    return { name: "siyuan-kit:style-absent" };
  }

  return {
    name: "siyuan-kit:ensure-style-asset",
    // 必须在产物写完后检查：vite 的 CSS 产物由内部的 post 插件在 generateBundle
    // 阶段才 emit，提前检查看到的是「还没有 CSS」，自己 emit 会与它同名冲突。
    closeBundle() {
      const file = join(outDir, "index.css");
      if (existsSync(file)) {
        return;
      }
      // 1 字节换行：工作空间里看到的目录结构稳定，不会因为空样式表而没有 index.css
      writeFileSync(file, "\n");
    },
  };
}
