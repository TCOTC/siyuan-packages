import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { PackageKind } from "./define.ts";

/** 必须与 bazaar 的 rules.ManifestFile() 完全一致。 */
const MANIFEST_BY_KIND: Record<PackageKind, string> = {
  plugin: "plugin.json",
  theme: "theme.json",
  widget: "widget.json",
};

/** 目录名 → 包类型。 */
const KIND_BY_DIR: Record<string, PackageKind> = {
  plugins: "plugin",
  themes: "theme",
  widgets: "widget",
};

/** 包类型 → 思源工作空间里的目录名。 */
export const PLURAL_DIR: Record<PackageKind, string> = {
  plugin: "plugins",
  theme: "themes",
  widget: "widgets",
};

export interface ResolvedPackage {
  root: string;
  /** 目录名，也是集市发布目标的默认名。 */
  dirName: string;
  kind: PackageKind;
  /** 决定 /plugins/<name>/ 的 base 与 i18n 目录名。 */
  name: string;
  /** 必须不带 `v` 前缀（bazaar 会拒绝）。 */
  version: string;
  manifestFile: string;
  manifest: Record<string, unknown>;
  hasI18n: boolean;
}

/** 从路径推断包类型。 */
export function inferKind(root: string): PackageKind {
  for (const segment of root.split(/[\\/]/)) {
    const kind = KIND_BY_DIR[segment];
    if (kind) {
      return kind;
    }
  }

  // 路径里没有 kind 目录时，按清单文件识别
  for (const [kind, file] of Object.entries(MANIFEST_BY_KIND)) {
    if (existsSync(join(root, file))) {
      return kind as PackageKind;
    }
  }

  throw new Error(`无法推断包类型：${root}\n请把它放到 {plugins,themes,widgets}/ 下，或在 build.config.ts 里显式写 kind。`);
}

export function manifestFileName(kind: PackageKind): string {
  return MANIFEST_BY_KIND[kind];
}

/** 从包目录向上找仓库根（含 pnpm-workspace.yaml 的那一层）。 */
export function findRepoRoot(start: string): string {
  let current = start;
  for (;;) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(`找不到仓库根（含 pnpm-workspace.yaml 的目录）：${start}`);
    }
    current = parent;
  }
}

/**
 * 读取并校验清单。不重复 bazaar 的完整规则，只拦构建阶段能判定的硬错误。
 */
export function resolvePackage(root: string, kindOverride?: PackageKind): ResolvedPackage {
  const kind = kindOverride ?? inferKind(root);
  const manifestFile = manifestFileName(kind);
  const manifestPath = join(root, manifestFile);

  if (!existsSync(manifestPath)) {
    throw new Error(`缺少清单文件 ${manifestFile}：${root}`);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  const name = manifest["name"];
  const version = manifest["version"];

  if (typeof name !== "string" || name.trim() === "") {
    throw new Error(`${manifestFile} 缺少非空字符串字段 name：${root}`);
  }
  if (typeof version !== "string" || version.trim() === "") {
    throw new Error(`${manifestFile} 缺少非空字符串字段 version：${root}`);
  }
  if (/^[vV]/.test(version)) {
    throw new Error(`${manifestFile} 的 version 不能带 v 前缀（集市会拒绝）：${version}`);
  }

  // 目录名必须与清单 name 逐字符相同（含大小写）。name 同时决定产物目录、
  // 思源安装目录与发布仓库，任何一处漂移都会让同一个包出现多种写法。
  // 拦成硬错误而不是警告：改名成本应该在这次构建里付掉。
  const dirName = basename(root);
  if (dirName !== name) {
    throw new Error(`包目录名必须与 ${manifestFile} 的 name 一致：目录是 ${dirName}，清单是 ${name}。\n请执行 git mv ${dirName} ${name}（同时改包内 package.json 的 name），而不是让构建去猜。`);
  }

  // package.json 的 name 也必须一致：它是 pnpm --filter 的唯一入口。
  const packageJsonPath = join(root, "package.json");
  if (existsSync(packageJsonPath)) {
    const npmName = (JSON.parse(readFileSync(packageJsonPath, "utf8")) as { name?: unknown }).name;
    if (npmName !== name) {
      throw new Error(`${packageJsonPath} 的 name 必须与 ${manifestFile} 的 name 一致：package.json 是 ${String(npmName)}，清单是 ${name}。`);
    }
  }

  return {
    root,
    dirName,
    kind,
    name,
    version,
    manifestFile,
    manifest,
    hasI18n: existsSync(join(root, "src", "i18n")),
  };
}

/**
 * 收集要放进包根目录的静态文件。
 *
 * 图标与预览图：清单里声明了就必须存在，没声明则回退到同名文件、缺了跳过。
 */
export interface StaticAsset {
  from: string;
  to: string;
}

/**
 * 第三方许可与通知文件：包根有这份文件就随产物分发（自有许可只在仓库根声明一次）。
 * 文件名固定，许可全文一并写进该文件，不另存文件。
 */
export const THIRD_PARTY_NOTICES = "THIRD_PARTY-NOTICES.md";

export function collectStaticAssets(pkg: ResolvedPackage): StaticAsset[] {
  const assets: StaticAsset[] = [{ from: join(pkg.root, pkg.manifestFile), to: pkg.manifestFile }];

  // 集市按清单 readme 字段查找，默认回退 README.md
  for (const file of readdirSync(pkg.root)) {
    if (/^README(\.[\w-]+)?\.md$/.test(file)) {
      assets.push({ from: join(pkg.root, file), to: file });
    }
  }

  const notices = join(pkg.root, THIRD_PARTY_NOTICES);
  if (existsSync(notices)) {
    assets.push({ from: notices, to: THIRD_PARTY_NOTICES });
  }

  for (const [field, legacy] of [
    ["icon", "icon.png"],
    ["preview", "preview.png"],
  ] as const) {
    const declared = pkg.manifest[field];
    const fileName = typeof declared === "string" && declared.trim() !== "" ? declared : legacy;
    const source = join(pkg.root, fileName);

    if (existsSync(source)) {
      assets.push({ from: source, to: fileName });
    } else if (typeof declared === "string" && declared.trim() !== "") {
      throw new Error(`${pkg.manifestFile} 声明了 ${field} = ${declared}，但文件不存在：${source}`);
    }
  }

  return assets;
}
