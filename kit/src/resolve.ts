import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { PackageKind } from "./define.ts";

/**
 * 包内可编辑的清单文件名，三种包类型统一用它。
 * 文件里只有本包独有的字段（覆盖层），不是思源读的那一份。
 */
export const SOURCE_MANIFEST_FILE = "manifest.json";

/**
 * 产物里的清单文件名，必须与 bazaar 的 rules.ManifestFile() / localPackageManifests 完全一致。
 * 与 SOURCE_MANIFEST_FILE 分开：包里的 manifest.json 是手写的覆盖层，
 * 产物里的 plugin.json 是三层合并后的完整清单，两者同名只会让人分不清哪个该改。
 */
const ARTIFACT_MANIFEST_BY_KIND: Record<PackageKind, string> = {
  plugin: "plugin.json",
  theme: "theme.json",
  widget: "widget.json",
};

/**
 * 仓库级的共用清单。顶层放三种包类型取值相同的字段，plugin / theme / widget
 * 分节放该类型特有的默认值；包内清单只写与它不同的值。
 */
export const BASE_MANIFEST_FILE = "manifests/base.json";

/** base.json 里属于「类型分节」的键（单数，与 PackageKind 一致），其余顶层键都是跨类型共用的默认值。 */
export const BASE_SECTION_KEYS = ["plugin", "theme", "widget"] as const;

/**
 * 共用清单里不允许出现的字段：每包必然不同（version、displayName 等），
 * 或由构建推导（name、url、readme、icon、preview）。
 */
export const BASE_FORBIDDEN_FIELDS = ["name", "url", "readme", "icon", "preview", "version", "minAppVersion", "displayName", "description"] as const;

/**
 * 由构建推导的字段，包内清单不得声明它们。
 * 声明了就是两份真相：构建写的那一份永远赢，本地那一份只能误导人。
 */
export const DERIVED_FIELDS = ["name", "url", "readme", "icon", "preview"] as const;

/**
 * 产物清单的字段顺序。写死顺序是为了让两次构建产出的 JSON 逐字节相同，
 * 与包内清单里字段的书写顺序无关。
 */
const MANIFEST_FIELD_ORDER = ["name", "author", "url", "version", "minAppVersion", "backends", "frontends", "kernels", "settingsWindow", "bootAppearances", "disabledInPublish", "displayName", "description", "readme", "icon", "preview", "funding", "keywords", "modes"];

/**
 * 包根可用作 icon / preview 的扩展名，按优先级排列。
 * 必须与 siyuan 仓库 kernel/bazaar/bazaar.go 的 isSupportedPackageImageName 一致：
 * 只认 png / jpg / jpeg / webp / avif，其它扩展名（如 svg）拿不到图片 URL。
 */
export const IMAGE_EXTENSIONS = ["png", "webp", "jpg", "jpeg", "avif"] as const;

/**
 * 清单里不声明 icon / preview 时，集市回退的文件名。
 * 依据 siyuan 仓库 kernel/bazaar/bazaar.go 的 packageImageName(configured, legacyName)：
 * configured 为 nil 就返回 legacyName，所以“png 且刚好叫这个名字”与省略声明完全等价。
 */
const DEFAULT_IMAGE_FILE: Record<"icon" | "preview", string> = { icon: "icon.png", preview: "preview.png" };

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
  /** 仓库根（含 pnpm-workspace.yaml 的那一层），共用清单从它下面找。 */
  repoRoot: string;
  /** 目录名，也是集市发布目标的默认名。 */
  dirName: string;
  kind: PackageKind;
  /** 决定 /plugins/<name>/ 的 base 与 i18n 目录名。 */
  name: string;
  /** 必须不带 `v` 前缀（bazaar 会拒绝）。 */
  version: string;
  /** 产物里的清单文件名（plugin.json / theme.json / widget.json）。 */
  manifestFile: string;
  /** 包内可编辑的清单文件名（统一为 manifest.json）。 */
  sourceFile: string;
  /** 合成后的完整清单，也就是写进产物的那一份。 */
  manifest: Record<string, unknown>;
  /** 包内清单原文（覆盖层），用来判断哪些字段是本包自己声明的。 */
  override: Record<string, unknown>;
  hasI18n: boolean;
}

/** 从路径推断包类型；源清单名统一，所以只能靠类型目录或 build.config.ts 的 kind。 */
export function inferKind(root: string): PackageKind {
  for (const segment of root.split(/[\\/]/)) {
    const kind = KIND_BY_DIR[segment];
    if (kind) {
      return kind;
    }
  }

  const hint = existsSync(join(root, SOURCE_MANIFEST_FILE)) ? `\n${root} 里有 ${SOURCE_MANIFEST_FILE}，但源清单名对三种包类型都一样，无法从文件名判断类型。` : "";
  throw new Error(`无法推断包类型：${root}${hint}\n请把它放到 {plugins,themes,widgets}/ 下，或在 build.config.ts 里显式写 kind。`);
}

/** 产物清单的文件名，随包类型变化（plugin.json / theme.json / widget.json）。 */
export function manifestFileName(kind: PackageKind): string {
  return ARTIFACT_MANIFEST_BY_KIND[kind];
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
 * 读取包内清单（覆盖层）并合成出产物清单。
 *
 * 三层：共用（manifests/base.json）→ 包内独有值 → 推导（name / url / readme / icon / preview）。
 * 不重复 bazaar 的完整规则，只拦构建阶段能判定的硬错误。
 */
export function resolvePackage(root: string, kindOverride?: PackageKind): ResolvedPackage {
  const kind = kindOverride ?? inferKind(root);
  const manifestFile = manifestFileName(kind);
  const manifestPath = join(root, SOURCE_MANIFEST_FILE);

  if (!existsSync(manifestPath)) {
    const stale = join(root, manifestFile);
    const trailer = existsSync(stale) ? `\n发现 ${manifestFile}：那是产物清单的名字，包内清单统一叫 ${SOURCE_MANIFEST_FILE}，请执行 git mv ${manifestFile} ${SOURCE_MANIFEST_FILE}。` : "";
    throw new Error(`缺少清单文件 ${SOURCE_MANIFEST_FILE}：${root}${trailer}`);
  }

  const override = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  const dirName = basename(root);

  for (const field of DERIVED_FIELDS) {
    if (field in override) {
      throw new Error(`${manifestPath} 不允许声明 ${field}：它由构建推导（name/url 来自目录名，readme/icon/preview 来自包根文件），写了也不会生效。请删掉这一项。`);
    }
  }

  const version = override["version"];
  if (typeof version !== "string" || version.trim() === "") {
    throw new Error(`${SOURCE_MANIFEST_FILE} 缺少非空字符串字段 version：${root}`);
  }
  if (/^[vV]/.test(version)) {
    throw new Error(`${SOURCE_MANIFEST_FILE} 的 version 不能带 v 前缀（集市会拒绝）：${version}`);
  }

  // package.json 的 name 必须与目录名一致：它是 pnpm --filter 的唯一入口。
  // 清单里的 name 不再单独声明（由目录名推导），三方一致性收敛成两方。
  const packageJsonPath = join(root, "package.json");
  if (existsSync(packageJsonPath)) {
    const npmName = (JSON.parse(readFileSync(packageJsonPath, "utf8")) as { name?: unknown }).name;
    if (npmName !== dirName) {
      throw new Error(`${packageJsonPath} 的 name 必须与包目录名一致：目录是 ${dirName}，package.json 是 ${String(npmName)}。`);
    }
  }

  const repoRoot = findRepoRoot(root);
  const manifest = composeManifest(root, dirName, kind, repoRoot, override);

  return {
    root,
    repoRoot,
    dirName,
    kind,
    name: dirName,
    version,
    manifestFile,
    sourceFile: SOURCE_MANIFEST_FILE,
    manifest,
    override,
    hasI18n: existsSync(join(root, "src", "i18n")),
  };
}

/**
 * 合成产物清单：共用段 → 包内覆盖 → 推导字段，最后按固定顺序重排。
 * 共用清单缺失时退化成空对象，仓库外的临时夹具因此不需要造一份 base.json。
 */
function composeManifest(root: string, name: string, kind: PackageKind, repoRoot: string, override: Record<string, unknown>): Record<string, unknown> {
  const base = loadBaseManifest(kind, repoRoot);
  const merged: Record<string, unknown> = { ...base.common, ...base.section, ...override };

  merged["name"] = name;
  // 集市仓库命名固定：一个包一个收录仓库，owner 不随包变化
  merged["url"] = `https://github.com/TCOTC/${name}`;

  const readme = deriveReadme(root);
  if (Object.keys(readme).length > 0) {
    merged["readme"] = readme;
  } else {
    delete merged["readme"];
  }

  // icon / preview：只有与集市回退的默认名不同时才写进清单（icon.png / preview.png 不写）
  for (const field of ["icon", "preview"] as const) {
    const fileName = findImage(root, field);
    if (fileName && fileName !== DEFAULT_IMAGE_FILE[field]) {
      merged[field] = fileName;
    } else {
      delete merged[field];
    }
  }

  const ordered: Record<string, unknown> = {};
  for (const field of MANIFEST_FIELD_ORDER) {
    if (field in merged) {
      ordered[field] = merged[field];
    }
  }
  // 固定列表之外的新字段仍要保留，否则以后加字段会静默丢值
  for (const [field, value] of Object.entries(merged)) {
    if (!(field in ordered)) {
      ordered[field] = value;
    }
  }
  return ordered;
}

/**
 * 读 manifests/base.json，拆成「跨类型共用」与「该类型分节」两部分。
 * 文件缺失时两者都为空，仓库外的临时夹具因此不需要造一份 base.json。
 */
export function loadBaseManifest(kind: PackageKind, repoRoot: string): { common: Record<string, unknown>; section: Record<string, unknown> } {
  const file = join(repoRoot, BASE_MANIFEST_FILE);
  if (!existsSync(file)) {
    return { common: {}, section: {} };
  }

  const parsed = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;

  const common: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (key === "$schema" || (BASE_SECTION_KEYS as readonly string[]).includes(key)) {
      continue;
    }
    common[key] = value;
  }

  const section = parsed[kind];
  return { common, section: typeof section === "object" && section !== null ? { ...(section as Record<string, unknown>) } : {} };
}

/**
 * 产物 readme：`README.md` → default，`README.<locale>.md` → 该 locale。
 * default 排在最前，其余按码位排序，保证跨平台产物稳定。
 */
function deriveReadme(root: string): Record<string, string> {
  const entries: [string, string][] = [];
  for (const file of readdirSync(root)) {
    if (!README_FILE_PATTERN.test(file)) {
      continue;
    }
    const locale = file === "README.md" ? "default" : file.slice("README.".length, -".md".length);
    entries.push([locale, file]);
  }

  entries.sort((a, b) => {
    if (a[0] === b[0]) {
      return 0;
    }
    if (a[0] === "default") {
      return -1;
    }
    if (b[0] === "default") {
      return 1;
    }
    return a[0] < b[0] ? -1 : 1;
  });
  return Object.fromEntries(entries);
}

/**
 * 包根里的 icon / preview 文件名，按扩展名优先级取第一个。
 * 返回的不仅是声明用的值，也是要复制进产物的那一个文件；都找不到时返回 undefined。
 */
export function findImage(root: string, field: "icon" | "preview"): string | undefined {
  for (const extension of IMAGE_EXTENSIONS) {
    const fileName = `${field}.${extension}`;
    if (existsSync(join(root, fileName))) {
      return fileName;
    }
  }
  return undefined;
}

/**
 * 收集要放进包根目录的静态文件。
 *
 * 图标与预览图：按文件探测结果复制（与清单里是否声明无关——默认名不进清单）；
 * 一个都找不到就不复制，集市那边会拿不到 URL，由 check 负责提前报。
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

/**
 * 包根里会被复制进产物的 README 文件名。
 * 集市按清单 `readme` 字段取文件、缺省回退 README.md，kit 则按这个通配全收；
 * `check.ts` 用同一份规则比对两个集合，避免两边漂移静默漏文件。
 */
export const README_FILE_PATTERN = /^README(\.[\w-]+)?\.md$/;

export function collectStaticAssets(pkg: ResolvedPackage): StaticAsset[] {
  const assets: StaticAsset[] = [];

  for (const file of readdirSync(pkg.root)) {
    if (README_FILE_PATTERN.test(file)) {
      assets.push({ from: join(pkg.root, file), to: file });
    }
  }

  const notices = join(pkg.root, THIRD_PARTY_NOTICES);
  if (existsSync(notices)) {
    assets.push({ from: notices, to: THIRD_PARTY_NOTICES });
  }

  // icon / preview 按文件探测，而不是看清单里有没有声明：
  // 默认名（icon.png / preview.png）不进清单，但文件仍然必须复制进产物。
  for (const field of ["icon", "preview"] as const) {
    const fileName = findImage(pkg.root, field);
    if (fileName) {
      assets.push({ from: join(pkg.root, fileName), to: fileName });
    }
  }

  return assets;
}

/**
 * 把合成后的清单写进产物。清单不再从包目录复制——包里那份只是覆盖层，
 * 直接复制会让集市读到缺 name / 缺 url 的半成品。
 */
export function writeManifest(pkg: ResolvedPackage, outDir: string): void {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, pkg.manifestFile), `${JSON.stringify(pkg.manifest, null, 2)}\n`);
}
