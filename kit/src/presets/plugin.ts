import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { InlineConfig, Plugin } from "vite";
import type { BuildOptions, PassOptions } from "../define.ts";
import type { BuildStep } from "../plan.ts";
import type { ResolvedPackage } from "../resolve.ts";

/**
 * 插件 preset。
 *
 * 这里每一条都对应原 webpack 配置里的一处设置——那些设置现在在 20 个仓库里
 * 各存了一份，且已经漂移成 20 个不同版本。收进来的目的不是「少写代码」，
 * 而是让它们只可能有一种行为。
 */
export function pluginSteps(pkg: ResolvedPackage, options: BuildOptions, dev: boolean, outDir: string): BuildStep[] {
  return passesOf(options).map((pass) => ({
    runner: "vite",
    label: `plugin:${pass.format}:${pass.outName ?? "index"}`,
    config: pluginConfig(pkg, pass, dev, outDir, options.define),
  }));
}

/** 没写 passes 时按单入口 cjs 处理；写了 entry 就只换入口。 */
function passesOf(options: BuildOptions): PassOptions[] {
  if (options.passes && options.passes.length > 0) {
    return options.passes;
  }
  return [{ format: "cjs", entry: options.entry ?? "src/index.ts" }];
}

function pluginConfig(pkg: ResolvedPackage, pass: PassOptions, dev: boolean, outDir: string, extraDefine: Record<string, string> | undefined): InlineConfig {
  return {
    root: pkg.root,
    // 由 kit 完全接管配置，不让包内的 vite.config.* 参与合并
    configFile: false,
    logLevel: "warn",

    // 样式 import 存在、但编译后没有任何规则时（例如整份 SCSS 都是注释），
    // vite 不会产出 CSS 资产。dev 下补个空的 index.css，让工作空间里看到的结构
    // 与真实插件一致；build 不补——没有有效样式就不该产出这个文件。
    plugins: dev ? [ensureStyleAsset(pkg, pass.entry, outDir)] : [],

    // 插件装进内核后位于 /plugins/<name>/ 下。静态资源、Worker、wasm 的相对路径
    // 都以它为基准；开发时从包根加载，结构一致，所以同一个 base 两边都能用。
    // image-squeeze 之前手写 publicPath 就是因为 webpack 的自动推断会多叠一层目录。
    base: `/plugins/${pkg.name}/`,

    define: {
      "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production"),
      // 部分包用 DEV_MODE 分支判断是否注册调试入口
      "process.env.DEV_MODE": JSON.stringify(String(dev)),
      // 思源插件不是 Node 进程；这里整体替换掉，避免 bundle 里残留 process 引用
      "process.env": "{}",
      ...extraDefine,
    },

    build: {
      outDir,
      // 产物目录里有上一次的残留会被打进 zip，交给 kit 在构建前统一清理，
      // 而不是让 vite 清空（dev 模式下 outDir 是包根，绝不能清空）
      emptyOutDir: false,
      ...(dev ? { watch: {} } : {}),
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
        // 思源按固定名找样式，不能让它随包名变化。
        // 冒烟测试实测：不设会直接报
        //   Name in package.json is required if option "build.lib.cssFileName" is not provided
        cssFileName: pass.outName ?? "index",
        ...(pass.name ? { name: pass.name } : {}),
      },
      rollupOptions: {
        // siyuan 由内核注入，不参与打包
        external: ["siyuan", "process"],
        output: {
          entryFileNames: "[name].js",
          chunkFileNames: "chunk/[name]-[hash].js",
          // 思源按固定名找样式（index.css），而 lib 模式默认给它带哈希、还可能塞进
          // assets/ 子目录。冒烟测试实测：只设 cssFileName 不够，最终路径仍由这里决定。
          // 插件只会有一份样式入口；将来若某个包有多份样式，需要在 build.config.ts 里覆盖。
          assetFileNames: (asset) => (asset.names.some((name) => name.endsWith(".css")) ? "index.css" : "assets/[name]-[hash][extname]"),
          ...(pass.inlineDynamicImports ? { inlineDynamicImports: true } : {}),
        },
      },
    },
  };
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
      // 与旧 webpack 的 dev 产物同形：1 字节换行，内容是空样式表
      writeFileSync(file, "\n");
    },
  };
}
