import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { PackageKind } from "./define.ts";

/** 每种包类型的清单文件名。必须与 bazaar 的 rules.ManifestFile() 完全一致。 */
const MANIFEST_BY_KIND: Record<PackageKind, string> = {
  plugin: "plugin.json",
  theme: "theme.json",
  widget: "widget.json",
};

/** 目录名 → 包类型。约定优于配置的基础。 */
const KIND_BY_DIR: Record<string, PackageKind> = {
  plugins: "plugin",
  themes: "theme",
  widgets: "widget",
};

/** 包类型 → 思源工作空间里的目录名。同步产物时按这个拼路径。 */
export const PLURAL_DIR: Record<PackageKind, string> = {
  plugin: "plugins",
  theme: "themes",
  widget: "widgets",
};

export interface ResolvedPackage {
  /** 包根目录的绝对路径。 */
  root: string;
  /** 目录名，同时作为集市发布时目标仓库的默认名。 */
  dirName: string;
  kind: PackageKind;
  /** 清单里的 name。决定 /plugins/<name>/ 的 base，以及 i18n 目录名。 */
  name: string;
  /** 清单里的 version。必须不带 `v` 前缀（bazaar 会拒绝）。 */
  version: string;
  manifestFile: string;
  manifest: Record<string, unknown>;
  /** src/i18n/ 是否存在。 */
  hasI18n: boolean;
}

/** 从路径推断包类型。识别不出来时抛出可读的错误，而不是猜。 */
export function inferKind(root: string): PackageKind {
  for (const segment of root.split(/[\\/]/)) {
    const kind = KIND_BY_DIR[segment];
    if (kind) {
      return kind;
    }
  }

  // 回退：靠清单文件识别（用于包被放在别处的场景）
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

/**
 * 从包目录向上找仓库根（含 pnpm-workspace.yaml 的那一层）。
 * 产物集中放在仓库根的 dist/ 下，所以每个命令都需要它。
 */
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
 * 读取并校验一个包的清单。
 *
 * 这里刻意不重复 bazaar 的全部校验规则（那是集市的职责，而且规则会变），
 * 只拦「构建阶段就能发现」的硬错误：清单缺失、name/version 缺失或带 v 前缀。
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

  // 目录名必须与清单 name 逐字符相同（含大小写）。
  //
  // name 决定三件事：产物目录 dist/<name>、思源安装目录 data/<类型>/<name>、
  // 以及归档旧仓库 README 里 `.../tree/main/<类型>/<name>` 那条链接。
  // 目录名一旦各自漂移（Whisper-Plus 曾写成 whisper-plus、Whisper 曾写成 whisper），
  // 同一个包就在四个地方有不同写法，看目录的人无从判断哪个是真实身份。
  // 这里拦成硬错误，而不是警告：改名成本在这次构建里就该付掉。
  const dirName = basename(root);
  if (dirName !== name) {
    throw new Error(`包目录名必须与 ${manifestFile} 的 name 一致：目录是 ${dirName}，清单是 ${name}。\n请执行 git mv ${dirName} ${name}（同时改包内 package.json 的 name），而不是让构建去猜。`);
  }

  // package.json 的 name 也钉成同一个字符串：它是 pnpm --filter 的唯一入口，
  // 与目录名不同就会变成「目录叫 Whisper-Plus、--filter 要写 whisper-plus」这种双写记忆。
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
 * 图标与预览图是可选的，规则沿用 image-squeeze 里已经推敲过的那一套：
 *   - 清单里声明了：文件必须存在，缺失视为打包错误
 *   - 没声明：回退到约定文件名，缺了静默跳过
 * 这条差异不吸收进 kit，每个包都会各写一遍，然后各写错一遍。
 */
export interface StaticAsset {
  /** 源文件绝对路径。 */
  from: string;
  /** 包根内的相对路径。 */
  to: string;
}

export function collectStaticAssets(pkg: ResolvedPackage): StaticAsset[] {
  const assets: StaticAsset[] = [{ from: join(pkg.root, pkg.manifestFile), to: pkg.manifestFile }];

  // README：集市按清单里的 readme 字段取，默认回退 README.md
  for (const file of readdirSync(pkg.root)) {
    if (/^README(\.[\w-]+)?\.md$/.test(file)) {
      assets.push({ from: join(pkg.root, file), to: file });
    }
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
