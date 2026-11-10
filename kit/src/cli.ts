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
import { cleanOutput, copyAssets, copyExtras, zipDir } from "./pack.ts";
import { plan, type BuildStep } from "./plan.ts";
import { findRepoRoot, resolvePackage } from "./resolve.ts";
import { runSassStep } from "./sass.ts";
import { CONFIG_FILE, linkToWorkspace, loadWorkspaceConfig } from "./workspace.ts";

const USAGE = `siyuan-kit — 思源集市包统一构建

用法：
  siyuan-kit build [--no-zip]     构建当前包 → <仓库>/dist/<name>/ 与 <仓库>/dist/<name>.zip
  siyuan-kit dev                  监听构建，并把产物目录链接进思源工作空间
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

  dev 会把 <仓库>/dist/<name>/ 链成 <工作空间>/data/<类型>/<name>（Windows 用目录联接，
  不需要开发者模式），改完源码刷新思源即可看到。

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
  if (command === "build" || command === "dev") {
    await runBuild(root, command === "dev", rest);
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

async function runBuild(root: string, dev: boolean, rest: string[]): Promise<void> {
  const options = await loadOptions(root);
  if (rest.includes("--no-zip")) {
    options.zip = false;
  }

  const pkg = resolvePackage(root, options.kind);
  const repoRoot = findRepoRoot(pkg.root);

  // 只有 dev 会碰工作空间。build 不看配置：它本来就只需要仓库内的路径，
  // 不该因为本机 workspace 配错（换机器、路径失效）而失败。
  const config = dev ? loadWorkspaceConfig(repoRoot) : undefined;

  if (dev && !config) {
    notifyMissingConfig(repoRoot);
  }

  const current = plan(pkg, options, dev);

  // 产物目录在 <仓库>/dist/ 下，源码与产物分离，构建前可以放心清空
  cleanOutput(current.outDir);

  if (config) {
    // dev 只建一次链接：构建写的就是链接指向的那个目录，不需要逐文件复制。
    const result = linkToWorkspace(pkg, current.outDir, config);
    const note = !result.created ? "（已存在）" : result.replacedDirectory ? "（已替换原有目录）" : "";
    console.log(`[${pkg.name}] 已链接 ${result.target} → ${current.outDir}${note}`);
  }

  for (const step of current.steps) {
    console.log(`[${pkg.name}] ${step.label}`);
    // 必须串行：多个 pass 写的是同一个产物目录，并发会互相覆盖
    // oxlint-disable-next-line no-await-in-loop
    await runStep(step);
  }

  copyAssets(pkg, current.outDir);

  if (options.copy && options.copy.length > 0) {
    copyExtras(pkg, options.copy, current.outDir);
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
