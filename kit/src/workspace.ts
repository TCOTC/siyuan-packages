import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { PLURAL_DIR, type ResolvedPackage } from "./resolve.ts";

/**
 * 本机的思源工作空间路径（gitignore）：每台机器不同，且里面是个人数据。
 * 仓库只提交 siyuan.config.example.json 作为模板。
 */
export const CONFIG_FILE = "siyuan.config.json";

export interface WorkspaceConfig {
  /** 思源工作空间的根目录，也就是包含 data/ 的那一层。 */
  workspace: string;
}

/** 链接目标已存在且指向本包产物目录时的结果。 */
export interface LinkResult {
  target: string;
  /** 本次是否新建了链接；false 表示原本就链着同一个产物目录。 */
  created: boolean;
  /** 是否为了建链接删掉了原有的真实目录（集市安装的同一个包）。 */
  replacedDirectory: boolean;
}

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
  if (!existsSync(join(workspace, "data"))) {
    throw new Error(`${CONFIG_FILE} 里的 workspace 下没有 data/ 目录，不像是思源工作空间：${workspace}`);
  }

  return { workspace };
}

/** <workspace>/data/<plugins|themes|widgets>/<name> */
export function workspaceTarget(pkg: ResolvedPackage, config: WorkspaceConfig): string {
  return resolve(join(dataDir(config), PLURAL_DIR[pkg.kind], pkg.name));
}

/** lstat，路径不存在时返回 undefined（不跟随链接）。 */
function lstatOrUndefined(path: string): ReturnType<typeof lstatSync> | undefined {
  try {
    return lstatSync(path);
  } catch {
    return undefined;
  }
}

/** 读取链接指向的路径。Windows 的目录联接可能带 \\?\ / \??\ 前缀，先剥掉再相对化。 */
function readLinkTarget(link: string): string {
  const raw = readlinkSync(link)
    .replace(/^\\\\\?\\/, "")
    .replace(/^\\\?\?\\/, "");
  return resolve(dirname(link), raw);
}

function samePath(a: string, b: string): boolean {
  const left = resolve(a);
  const right = resolve(b);
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

/** target 是否就是链到 source 的那个链接（Windows 的目录联接在 lstat 里也报 symlink）。 */
function linksTo(target: string, source: string): boolean {
  const stats = lstatOrUndefined(target);
  if (!stats) {
    return false;
  }
  if (stats.isSymbolicLink()) {
    return samePath(readLinkTarget(target), source);
  }
  // 兜底：某些平台上目录联接只被当成目录，用真实路径判断
  return stats.isDirectory() && existsSync(source) && samePath(realpathSync(target), realpathSync(source));
}

/** 确认目标目录里装的就是本包（清单存在且 name 一致），避免 workspace 配错时误删别人的目录。 */
function assertPackageDir(pkg: ResolvedPackage, target: string): void {
  const manifestPath = join(target, pkg.manifestFile);
  if (!existsSync(manifestPath)) {
    throw new Error(`拒绝写入 ${target}：该目录里没有 ${pkg.manifestFile}，不像一个思源包目录。请检查 ${CONFIG_FILE} 里的 workspace。`);
  }
  const installed = JSON.parse(readFileSync(manifestPath, "utf8")) as { name?: unknown };
  if (installed.name !== pkg.name) {
    throw new Error(`拒绝写入 ${target}：目录里已安装的包名是 ${String(installed.name)}，与 ${pkg.name} 不一致。请检查 ${CONFIG_FILE} 里的 workspace。`);
  }
}

/**
 * 在工作空间里为产物目录建链接：`<工作空间>/data/<类型>/<name>` → `dist/<name>/`。
 *
 * 链接建一次就够，构建写的是同一个目录，所以 dev 期间不再需要逐文件复制。
 * Windows 用目录联接（junction）：不需要开发者模式或管理员权限；其它平台用符号链接。
 */
export function linkToWorkspace(pkg: ResolvedPackage, outDir: string, config: WorkspaceConfig): LinkResult {
  const target = workspaceTarget(pkg, config);
  const source = resolve(outDir);

  // Windows 的目录联接连到不存在的目标会失败，先保证产物目录存在（随后构建会正常写入）
  mkdirSync(source, { recursive: true });

  if (linksTo(target, source)) {
    return { target, created: false, replacedDirectory: false };
  }

  let replacedDirectory = false;
  const stats = lstatOrUndefined(target);
  if (stats) {
    if (stats.isSymbolicLink()) {
      throw new Error(`拒绝写入 ${target}：它已经是指向 ${readLinkTarget(target)} 的链接，不是 ${source}。请先删掉这个链接。`);
    }
    if (!stats.isDirectory()) {
      throw new Error(`拒绝写入 ${target}：同名条目已存在且不是目录，请先删掉它。`);
    }
    // 真实目录（例如从集市装过的同名包）：确认是本包后替换成链接
    assertPackageDir(pkg, target);
    rmSync(target, { recursive: true, force: true });
    replacedDirectory = true;
  }

  mkdirSync(dirname(target), { recursive: true });
  symlinkSync(source, target, process.platform === "win32" ? "junction" : "dir");
  return { target, created: true, replacedDirectory };
}
