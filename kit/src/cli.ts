#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";
import { createPlugin, parseCreateArgs } from "./create.ts";
import type { BuildOptions } from "./define.ts";
import { cleanOutput, copyAssets, copyExtras, zipDir } from "./pack.ts";
import { plan, type BuildStep } from "./plan.ts";
import { findRepoRoot, resolvePackage } from "./resolve.ts";
import { runSassStep } from "./sass.ts";
import { CONFIG_FILE, loadWorkspaceConfig, syncToWorkspace } from "./workspace.ts";

const USAGE = `siyuan-kit — 思源集市包统一构建

用法：
  siyuan-kit build [--no-zip]     构建当前包 → <仓库>/dist/<name>/ 与 <仓库>/dist/<name>.zip
  siyuan-kit dev                  监听构建，每次产物落盘后同步进思源工作空间
  siyuan-kit create <name> [--display-name <显示名>] [--zh-name <中文显示名>]
        [--description <描述>] [--zh-description <中文描述>] [--author <作者>] [--url <仓库地址>]
                                  基于 templates/plugin 生成 plugins/<name>（随后执行 pnpm install）

产物位置（不写进包目录）：
  build: <仓库>/dist/<name>/       解包内容（清单、README、图标、i18n、代码）
         <仓库>/dist/<name>.zip    上传到 release 的那个包

dev 同步到工作空间需要在仓库根建 ${CONFIG_FILE}（已 gitignore）：
  { "workspace": "D:/SiYuan" }             ← 工作空间根目录，即 data 的上一层

约定（无需配置）：
  plugins/<name>/   plugin.json  src/index.ts  src/i18n/
  widgets/<name>/   widget.json  index.html
  themes/<name>/    theme.json   styles/index.scss

需要偏离约定时，在包根放 build.config.ts：
  export default defineBuild({ passes: [{ format: "iife", entry: "src/worker.ts", name: "Worker" }] })
`;

async function main(): Promise<void> {
  const [command = "build", ...rest] = process.argv.slice(2);
  const root = process.cwd();

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(USAGE);
    return;
  }
  if (command === "build" || command === "dev") {
    await runBuild(root, command === "dev", rest);
    return;
  }
  if (command === "create") {
    const values = parseCreateArgs(rest);
    const target = createPlugin(findRepoRoot(root), values);
    console.log(`已创建 ${target}`);
    console.log("");
    console.log("下一步：");
    console.log("  pnpm install                  # 把新包接进 workspace");
    console.log(`  pnpm --filter ${values.name} dev`);
    return;
  }
  throw new Error(`未知命令：${command}\n\n${USAGE}`);
}

async function runBuild(root: string, dev: boolean, rest: string[]): Promise<void> {
  const options = await loadOptions(root);
  if (rest.includes("--no-zip")) {
    options.zip = false;
  }

  const pkg = resolvePackage(root, options.kind);
  const repoRoot = findRepoRoot(pkg.root);
  const config = loadWorkspaceConfig(repoRoot);

  // dev 才能同步进工作空间；没有配置就只构建、并明确提示
  let sync: ((outDir: string) => void) | undefined;
  if (dev) {
    if (config) {
      sync = (outDir) => {
        const target = syncToWorkspace(pkg, outDir, config);
        console.log(`[${pkg.name}] 已同步 → ${target}`);
      };
    } else {
      console.warn(`[${pkg.name}] 没有 ${CONFIG_FILE}，只构建不同步。在仓库根创建它并写入 { "workspace": "<思源工作空间>/data" } 即可。`);
    }
  }

  const current = plan(pkg, options, dev, sync);

  // 产物目录在 <仓库>/dist/ 下，源码和产物完全分离，构建前可以放心清空
  cleanOutput(current.outDir);

  for (const step of current.steps) {
    console.log(`[${pkg.name}] ${step.label}`);
    // 必须串行：多个 pass 写的是同一个产物目录，并发会互相覆盖
    // oxlint-disable-next-line no-await-in-loop
    await runStep(step);
  }

  copyAssets(pkg, current.outDir);

  // `copy` 是约定之外的静态资源（字体、wasm）：清单、README、图标、i18n 之外的
  // 大文件都靠它，条数与体积都不适合塞进 preset。
  if (options.copy && options.copy.length > 0) {
    copyExtras(pkg, options.copy, current.outDir);
  }

  // vite 的 step 通过插件钩子同步；sass 之类没有钩子的，在这里补一次
  if (sync && current.steps.every((step) => step.runner !== "vite")) {
    sync(current.outDir);
  }

  if (current.zip) {
    await zipDir(current.outDir, current.zipPath);
    console.log(`[${pkg.name}] ${current.outDir} → ${current.zipPath}`);
  }
}

async function runStep(step: BuildStep): Promise<void> {
  if (step.runner === "vite") {
    await build(step.config);
    return;
  }

  await runSassStep(step);
}

/**
 * 读取可选的 build.config.ts。
 *
 * 用动态 import 而不是自己解析：文件就是普通 TS，Node 24 原生剥离类型后可直接加载，
 * 不需要为 kit 先编一遍再跑。
 */
async function loadOptions(root: string): Promise<BuildOptions> {
  const file = join(root, "build.config.ts");
  if (!existsSync(file)) {
    return {};
  }
  const mod = (await import(pathToFileURL(file).href)) as { default?: BuildOptions };
  return mod.default ?? {};
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
