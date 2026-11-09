import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { PLURAL_DIR, type ResolvedPackage } from "./resolve.ts";

/**
 * 本机的思源工作空间路径。
 *
 * 这个文件是 gitignore 的：每台机器的工作空间目录都不一样，而且里面是别人的个人数据。
 * 仓库里只提交 siyuan.config.example.json 作为模板。
 */
export const CONFIG_FILE = "siyuan.config.json";

export interface WorkspaceConfig {
  /** 思源工作空间的根目录，也就是包含 data/ 的那一层。 */
  workspace: string;
}

/** 工作空间里的数据目录：<workspace>/data */
export function dataDir(config: WorkspaceConfig): string {
  return join(config.workspace, "data");
}

export function loadWorkspaceConfig(repoRoot: string): WorkspaceConfig | undefined {
  const file = join(repoRoot, CONFIG_FILE);
  if (!existsSync(file)) {
    return undefined;
  }

  const raw = JSON.parse(readFileSync(file, "utf8")) as { workspace?: unknown };
  const workspace = raw.workspace;
  if (typeof workspace !== "string" || workspace.trim() === "") {
    throw new Error(`${CONFIG_FILE} 缺少 workspace 字段（指向思源工作空间根目录，即 data 的上一层）`);
  }
  if (!existsSync(workspace)) {
    throw new Error(`${CONFIG_FILE} 里的 workspace 不存在：${workspace}`);
  }

  // 常见错误：直接填了 data 目录
  if (basename(resolve(workspace)) === "data") {
    throw new Error(`${CONFIG_FILE} 里的 workspace 填成了 data 目录，应该填它的上一层（工作空间根目录）：${resolve(workspace, "..")}`);
  }
  if (!existsSync(dataDir({ workspace }))) {
    throw new Error(`${CONFIG_FILE} 里的 workspace 下没有 data/ 目录，不像是思源工作空间：${workspace}`);
  }

  return { workspace };
}

/** 该包在思源工作空间里的安装目录：<workspace>/data/<plugins|themes|widgets>/<name> */
export function workspaceTarget(pkg: ResolvedPackage, config: WorkspaceConfig): string {
  return resolve(join(dataDir(config), PLURAL_DIR[pkg.kind], pkg.name));
}

/**
 * 把产物同步进思源工作空间，覆盖同名的已安装包。
 *
 * 这个操作会删掉目标目录里「产物里没有」的文件，所以必须先确认目标确实是本包：
 * 目录里得有对应清单、且清单里的 name 与本包一致。校验不过就拒绝动手，
 * 避免 workspace 配错时把别的插件目录清空。
 */
export function syncToWorkspace(pkg: ResolvedPackage, outDir: string, config: WorkspaceConfig): string {
  const target = workspaceTarget(pkg, config);

  if (existsSync(target)) {
    const manifestPath = join(target, pkg.manifestFile);
    if (!existsSync(manifestPath)) {
      throw new Error(`拒绝写入 ${target}：该目录里没有 ${pkg.manifestFile}，不像一个思源包目录。请检查 ${CONFIG_FILE} 里的 workspace。`);
    }
    const installed = JSON.parse(readFileSync(manifestPath, "utf8")) as { name?: unknown };
    if (installed.name !== pkg.name) {
      throw new Error(`拒绝写入 ${target}：目录里已安装的包名是 ${String(installed.name)}，与 ${pkg.name} 不一致。请检查 ${CONFIG_FILE} 里的 workspace。`);
    }
  }

  mirrorDirectory(outDir, target);
  return target;
}

/**
 * 把 from 的内容镜像到 to：新增的文件复制过去，内容有变化的覆盖，
 * 目标里多出来的条目删掉（否则改了文件名后旧产物会一直留在插件目录里）。
 */
export function mirrorDirectory(from: string, to: string): void {
  if (!existsSync(from)) {
    throw new Error(`产物目录不存在：${from}`);
  }
  mkdirSync(to, { recursive: true });

  const kept = new Set<string>();
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    kept.add(entry.name);
    const source = join(from, entry.name);
    const dest = join(to, entry.name);
    if (entry.isDirectory()) {
      mirrorDirectory(source, dest);
    } else {
      copyIfChanged(source, dest);
    }
  }

  for (const entry of readdirSync(to, { withFileTypes: true })) {
    if (!kept.has(entry.name)) {
      rmSync(join(to, entry.name), { recursive: true, force: true });
    }
  }
}

function copyIfChanged(source: string, dest: string): void {
  if (existsSync(dest)) {
    const a = statSync(source);
    const b = statSync(dest);
    // 大小相同且不比目标新，就认为没变
    if (a.size === b.size && a.mtimeMs <= b.mtimeMs) {
      return;
    }
  }
  cpSync(source, dest);
}
