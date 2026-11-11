#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";
import { checkWorkspace } from "./check.ts";
import { createPlugin, parseCreateArgs } from "./create.ts";
import type { BuildOptions } from "./define.ts";
import { cleanOutput, copyAssets, copyExtras, stampAssetUrls, zipDir } from "./pack.ts";
import { plan, type BuildMode, type BuildStep } from "./plan.ts";
import { findRepoRoot, listPackages, resolvePackage } from "./resolve.ts";
import { runSassStep, watchSassStep } from "./sass.ts";
import { CONFIG_FILE, linkToWorkspace, loadWorkspaceConfig, type WorkspaceConfig } from "./workspace.ts";

const USAGE = `siyuan-kit — 思源集市包统一构建

用法：
  siyuan-kit build [--no-zip]     构建当前包 → <仓库>/dist/<name>/ 与 <仓库>/dist/<name>.zip
  siyuan-kit dev <包名…>          监听构建，并把产物目录链接进思源工作空间
                                  在包目录里跑默认是自己；在仓库根必须点名（全部用 pnpm dev:all）
  siyuan-kit sync [包名…]         构建全部包（dev 口径：不压缩 + sourcemap），不打包 zip，
                                  并把产物目录链接进思源工作空间；跑完就退出，不监听
  siyuan-kit check                校验仓库里所有包是否遵守统一契约（CI 用）
  siyuan-kit manifest [目录]      输出合成后的完整清单 JSON（默认当前包）；供 CI 与调试使用
  siyuan-kit create <name> [--display-name <显示名>] [--zh-name <中文显示名>]
        [--description <描述>] [--zh-description <中文描述>]
                                  基于 templates/plugin 生成 plugins/<name>（随后执行 pnpm install）

产物位置（不写进包目录）：
  build: <仓库>/dist/<name>/       解包内容（清单、README、图标、i18n、代码）
         <仓库>/dist/<name>.zip    上传到 release 的那个包

dev 同步到工作空间需要在仓库根建 ${CONFIG_FILE}（已 gitignore）：
  { "workspace": "D:/SiYuan" }             ← 工作空间根目录，即 data 的上一层

  dev / sync 会把 <仓库>/dist/<name>/ 链成 <工作空间>/data/<类型>/<name>（Windows 用目录联接，
  不需要开发者模式），改完源码刷新思源即可看到。

  dev 是持续监听：插件/挂件用 vite 的 build.watch，主题由 kit 盯住 styles/ 与 icons/。
  只监听在改的那个包：pnpm dev <包名>；根目录裸跑 dev 会报错并列出包名。

  sync 是同一套产物口径与链接，但只构建一次：在仓库根裸跑就是全部分发包，
  适合改完一批包后统一刷进思源，不用把二十多个 watch 进程一直开着。

约定（无需配置）：
  plugins/<name>/   manifest.json  src/index.ts  src/i18n/
  widgets/<name>/   manifest.json  index.html
  themes/<name>/    manifest.json  styles/index.scss

清单是三层合成结果（共用 manifests/base.json + 本包独有值 + 推导字段）：
  name / url          ← 目录名
  readme              ← 包根 README*.md
  icon / preview      ← 包根 icon.* / preview.*

包内清单统一叫 manifest.json；产物里叫 plugin.json / theme.json / widget.json（集市按这个名读）。

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
  if (isBuildCommand(command)) {
    await runBuild(root, command, rest);
    return;
  }
  if (command === "check") {
    runCheck(findRepoRoot(root));
    return;
  }
  if (command === "manifest") {
    // 包里那份只是覆盖层，外部（CI、发布脚本）要的总是合成后的完整清单
    const pkg = resolvePackage(rest[0] === undefined ? root : resolve(root, rest[0]));
    console.log(JSON.stringify(pkg.manifest, null, 2));
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

type BuildCommand = "build" | "dev" | "sync";

interface BuildCommandSpec {
  mode: BuildMode;
  /** 链接进思源工作空间：never 不读配置；optional 缺配置时只构建；required 缺配置直接报错。 */
  link: "never" | "optional" | "required";
  /** 构建前是否清空产物目录。只有不链接的 build 能这样做。 */
  clean: boolean;
}

/** 三个构建命令只差三处：产物口径、是否监听、与工作空间的链接。 */
const BUILD_COMMANDS: Record<BuildCommand, BuildCommandSpec> = {
  build: { mode: { profile: "build", watch: false }, link: "never", clean: true },
  dev: { mode: { profile: "dev", watch: true }, link: "optional", clean: false },
  // 一次性把全部包建成 dev 口径并链过去：改完一批包跑一遍，不用常驻 watch
  sync: { mode: { profile: "dev", watch: false }, link: "required", clean: false },
};

function isBuildCommand(command: string): command is BuildCommand {
  return command === "build" || command === "dev" || command === "sync";
}

async function runBuild(cwd: string, command: BuildCommand, rest: string[]): Promise<void> {
  const targets = command === "build" ? [cwd] : commandTargets(cwd, command, rest);
  if (targets.length === 0) {
    throw new Error("仓库里没有可构建的包。");
  }

  for (const root of targets) {
    // 多个包时串行：watch 模式下手动起的进程越少，内存越安全
    await buildPackage(root, command, rest);
  }
}

/**
 * dev / sync 要构建哪些包。
 *
 * 在包目录里跑 → 就是它自己。在仓库根跑 → 允许点名；裸跑时的默认值两者不同：
 * dev 必须点名，因为根目录无参数等于一次拉起二十多个 watch 进程，每个 vite / sass 进程
 * 都常驻几十到上百 MB，叠加编辑器的文件监听与 TS 服务，最先撑不住的是编辑器
 * （确实要全部时走根目录的 `pnpm dev:all`：每个包一个进程，各自一个堆）。
 * sync 不常驻，裸跑就是全部分发包。
 */
function commandTargets(cwd: string, command: "dev" | "sync", rest: string[]): string[] {
  const repoRoot = findRepoRoot(cwd);
  const names = rest.filter((arg) => !arg.startsWith("-"));
  const entries = listPackages(repoRoot);

  if (names.length === 0) {
    if (resolve(cwd) !== resolve(repoRoot)) {
      return [cwd];
    }

    if (command === "sync") {
      return entries.map((entry) => entry.root);
    }

    // 命令列对齐到最长那一条，读起来像一张表；描述里有中文，不按显示宽度对齐
    const examples: [string, string][] = [
      ["pnpm dev Whisper", "只监听一个包（推荐）"],
      ["pnpm dev Whisper move-doc", "同时监听两个（也可以写目录：themes/Whisper）"],
      ["pnpm dev:all", `全部 ${entries.length} 个包：每包一个进程，很吃内存，慎用`],
    ];
    const width = Math.max(...examples.map(([line]) => line.length));
    throw new Error(["dev 需要指定包名（全部包用 pnpm dev:all）。", "", ...examples.map(([line, note]) => `  ${line.padEnd(width)}  ${note}`), "", `可用包名：${entries.map((entry) => entry.name).join("、")}`].join("\n"));
  }

  return names.map((name) => {
    // 允许写成目录（themes/Whisper），省得先查包名
    const byPath = resolve(cwd, name);
    if (existsSync(byPath)) {
      return byPath;
    }
    const found = entries.find((entry) => entry.name === name);
    if (!found) {
      throw new Error(`没有名为 ${name} 的包。可用包名：${entries.map((entry) => entry.name).join("、")}`);
    }
    return found.root;
  });
}

async function buildPackage(root: string, command: BuildCommand, rest: string[]): Promise<void> {
  const spec = BUILD_COMMANDS[command];
  const options = await loadOptions(root);
  if (rest.includes("--no-zip")) {
    options.zip = false;
  }

  const pkg = resolvePackage(root, options.kind);
  const repoRoot = findRepoRoot(pkg.root);

  // build 不看工作空间配置：它本来就只需要仓库内的路径，
  // 不该因为本机 workspace 配错（换机器、路径失效）而失败。
  const config = spec.link === "never" ? undefined : loadConfigFor(command, repoRoot);

  const current = plan(pkg, options, spec.mode);

  // build 前可以放心清空产物目录（源码与产物分离，包里永远是源码）。
  // dev / sync 不行：产物目录已经链进思源工作空间，是思源正在读取的活目录；
  // 先清后编的话，一旦编译失败（SCSS 报错、进程 OOM）思源里就只剩一个空主题/空插件。
  if (spec.clean) {
    cleanOutput(current.outDir);
  }

  if (config) {
    // 链接只建一次：构建写的就是链接指向的那个目录，不需要逐文件复制。
    const result = linkToWorkspace(pkg, current.outDir, config);
    const note = !result.created ? "（已存在）" : result.replacedDirectory ? "（已替换原有目录）" : "";
    console.log(`[${pkg.name}] 已链接 ${result.target} → ${current.outDir}${note}`);
  }

  for (const step of current.steps) {
    console.log(`[${pkg.name}] ${step.label}`);
    // 必须串行：多个 pass 写的是同一个产物目录，并发会互相覆盖
    await runStep(step, spec.mode, pkg.name);
  }

  copyAssets(pkg, current.outDir);

  if (options.copy && options.copy.length > 0) {
    copyExtras(pkg, options.copy, current.outDir);
  }

  // 产物 CSS 里指向本包的绝对 url() 补上缓存标签，避免换字体后仍用旧字形。
  // dev 也要做：产物目录已经链进工作空间，思源读的就是它。
  stampAssetUrls(pkg, current.outDir, current.buildTime);

  if (current.zip) {
    await zipDir(current.outDir, current.zipPath);
    console.log(`[${pkg.name}] ${current.outDir} → ${current.zipPath}`);
  }
}

/**
 * 读本机工作空间配置。dev 缺文件时只构建不链接（同一批进程里只提示一次）；
 * sync 的全部意义就是链接，缺文件直接报错，免得跑完发现思源里什么都没变。
 */
function loadConfigFor(command: BuildCommand, repoRoot: string): WorkspaceConfig | undefined {
  const config = loadWorkspaceConfig(repoRoot);
  if (config) {
    return config;
  }

  if (command === "sync") {
    throw new Error([`sync 需要仓库根的 ${CONFIG_FILE}：它要把产物目录链接进思源工作空间。`, "", `复制 siyuan.config.example.json 为 ${CONFIG_FILE}，把 workspace 改成自己的思源工作空间根目录（含 data/ 的那一层）。`].join("\n"));
  }

  notifyMissingConfig(repoRoot);
  return undefined;
}

async function runStep(step: BuildStep, mode: BuildMode, name: string): Promise<void> {
  if (step.runner === "vite") {
    // watch 时 config 里带了 build.watch，build() 返回 watcher 并让进程常驻；否则跑完就返回
    await build(step.config);
    return;
  }

  const { loadedFiles } = await runSassStep(step);
  if (mode.watch) {
    watchSassStep(step, loadedFiles, name);
  }
}

/** 同一批启动的提示只打一次。根目录 `pnpm dev` 会并发拉起每个包的 kit 进程，各自都会走到这里。 */
const NOTICE_WINDOW_MS = 5000;

function notifyMissingConfig(repoRoot: string): void {
  const marker = join(tmpdir(), `siyuan-kit-${createHash("sha1").update(repoRoot).digest("hex").slice(0, 12)}.notice`);
  try {
    if (existsSync(marker) && Date.now() - statSync(marker).mtimeMs < NOTICE_WINDOW_MS) {
      return;
    }
    writeFileSync(marker, new Date().toISOString());
  } catch {
    // 标记写不进去就照常提示，不用为此报错
  }
  console.warn(`没有 ${CONFIG_FILE}，dev 只构建不链接。在仓库根创建它并写入 { "workspace": "<思源工作空间根目录>" } 即可。`);
}

/** 校验仓库里所有包是否遵守统一契约。只报告，不修复。 */
function runCheck(repoRoot: string): void {
  const { packages, issues } = checkWorkspace(repoRoot);

  for (const issue of issues) {
    console.error(`${issue.package}: ${issue.message}`);
  }

  if (issues.length > 0) {
    throw new Error(`[\`check\`] ${issues.length} 个问题，涉及 ${new Set(issues.map((issue) => issue.package)).size} 个包`);
  }

  console.log(`[\`check\`] ${packages.length} 个包全部符合仓库契约`);
}

/**
 * 读取可选的 build.config.ts。用动态 import：Node 24 能直接加载 TS，无需预编译。
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
