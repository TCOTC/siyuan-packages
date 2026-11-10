import { existsSync, globSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { BASE_FORBIDDEN_FIELDS, BASE_MANIFEST_FILE, BASE_SECTION_KEYS, DERIVED_FIELDS, IMAGE_EXTENSIONS, loadBaseManifest, README_FILE_PATTERN, resolvePackage, SOURCE_MANIFEST_FILE, THIRD_PARTY_NOTICES, type ResolvedPackage } from "./resolve.ts";

/**
 * 仓库级契约门禁：把 README 里的约定变成 CI 会变红的检查。
 * 只检查构建阶段能判定的结构问题，不重复集市校验，也不看产物内容。
 */

/** {plugins,themes,widgets} 的检查顺序。 */
const PACKAGE_KINDS = ["plugins", "themes", "widgets"] as const;

/**
 * 允许携带 `build.config.ts` 的包，值是必须偏离默认 preset 的理由。
 * 这是白名单：新增条目必须写清理由，否则标准包多出配置不会有人发现。
 */
export const ALLOWED_BUILD_CONFIG: Record<string, string> = {
  "code-recognition": "wasm 不在 vite 模块图里，需要 copy",
  "flomo-web": "主进程挂钩脚本由 remote.require 按路径加载，需要 copy",
  "image-squeeze": "Worker 入口要 iife + inlineDynamicImports，需要 passes",
  "inline-elements": "生产构建需要去掉 console.*（dropConsole）",
  "siyuan-plugin-openmoji-emoji": "字体不在 vite 模块图里，需要 copy",
  "siyuan-ttf-HarmonyOS_Sans_SC-and-Twemoji": "11 MB 字体不能进模块图，需要 copy",
  "siyuan-ttf-LXGWWenKaiGB-and-Twemoji": "14 MB 字体不能进模块图，需要 copy",
};

/** 产物清单名（随包类型变化），包根出现它们就是旧命名没改干净。 */
const ARTIFACT_MANIFEST_NAMES = ["plugin.json", "theme.json", "widget.json"];

/** 包目录里不允许出现的产物。plugin.json / theme.json / widget.json 是产物清单名，包内清单叫 manifest.json。 */
const FORBIDDEN_ENTRIES = ["dist", "package.zip", "index.js", "index.css", "i18n", ...ARTIFACT_MANIFEST_NAMES];

/** 包类型 → 必须存在的约定入口。 */
const REQUIRED_ENTRY: Record<string, string> = {
  plugin: "src/index.ts",
  widget: "index.html",
  theme: "styles/index.scss",
};

export interface CheckIssue {
  /** 出问题的包目录名；仓库级问题用 `<repo>`。 */
  package: string;
  message: string;
}

export interface CheckResult {
  packages: string[];
  issues: CheckIssue[];
}

/** 检查整个仓库的所有发布包。 */
export function checkWorkspace(repoRoot: string): CheckResult {
  const packages: string[] = [];
  const issues: CheckIssue[] = [];

  checkBaseManifest(repoRoot, issues);

  for (const kind of PACKAGE_KINDS) {
    const dir = join(repoRoot, kind);
    if (!existsSync(dir)) {
      continue;
    }
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const root = join(dir, entry.name);
      packages.push(entry.name);
      checkPackage(root, issues);
    }
  }

  return { packages, issues };
}

/**
 * 共用清单只能在两层放字段：顶层（跨类型相同）与类型分节（该类型特有）。
 * 两层都不许出现「每包必然不同」或「构建推导」的字段，否则合并时要么被包内清单盖掉，要么被发现时已晚。
 */
function checkBaseManifest(repoRoot: string, issues: CheckIssue[]): void {
  const file = join(repoRoot, BASE_MANIFEST_FILE);
  if (!existsSync(file)) {
    return;
  }

  const push = (message: string) => issues.push({ package: BASE_MANIFEST_FILE, message });

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch (error) {
    push(error instanceof Error ? error.message : String(error));
    return;
  }

  const common: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (key === "$schema" || (BASE_SECTION_KEYS as readonly string[]).includes(key)) {
      continue;
    }
    common[key] = value;
  }

  for (const field of BASE_FORBIDDEN_FIELDS) {
    if (field in common) {
      push(`顶层不允许声明 ${field}：它每包不同（或由构建推导），包内清单必须各自声明`);
    }
  }

  for (const kind of BASE_SECTION_KEYS) {
    const section = parsed[kind];
    if (section === undefined) {
      continue;
    }
    if (typeof section !== "object" || section === null || Array.isArray(section)) {
      push(`${kind} 必须是对象`);
      continue;
    }
    for (const field of Object.keys(section)) {
      if (field in common) {
        push(`${kind}.${field} 与顶层重复：三层合并时类型分节会盖掉顶层，两份取值容易漂移`);
      }
      if ((BASE_FORBIDDEN_FIELDS as readonly string[]).includes(field)) {
        push(`${kind}.${field} 不允许写：该字段每包必然不同`);
      }
    }
  }
}

function checkPackage(root: string, issues: CheckIssue[]): void {
  const fallbackName = basename(root);
  const push = (message: string) => issues.push({ package: fallbackName, message });

  // 身份校验在 resolvePackage 里，这里只把异常转成 issue，避免整条命令崩掉。
  let pkg: ResolvedPackage;
  try {
    pkg = resolvePackage(root);
  } catch (error) {
    push(error instanceof Error ? error.message : String(error));
    return;
  }

  checkScripts(root, push);
  checkTests(root, push);
  checkTsconfig(root, push);
  checkBuildConfig(pkg, push);
  checkManifestFields(pkg, push);
  checkLocales(pkg, push);
  checkReadmeFiles(pkg, push);
  checkI18nFileNames(pkg, push);
  checkForbiddenEntries(root, push);
  checkLicenseCopy(root, push);
  checkImages(pkg, push);
  checkEntry(pkg, push);
}

/** 所有包必须使用同一套脚本入口。 */
function checkScripts(root: string, push: (message: string) => void): void {
  const packageJsonPath = join(root, "package.json");
  if (!existsSync(packageJsonPath)) {
    push("缺少 package.json");
    return;
  }

  const scripts = (JSON.parse(readFileSync(packageJsonPath, "utf8")) as { scripts?: Record<string, string> }).scripts ?? {};

  for (const command of ["build", "dev"] as const) {
    const expected = `siyuan-kit ${command}`;
    if (scripts[command] !== expected) {
      push(`scripts.${command} 必须是 "${expected}"，实际是 ${JSON.stringify(scripts[command] ?? null)}`);
    }
  }
}

/** 有测试就必须能跑。 */
function checkTests(root: string, push: (message: string) => void): void {
  const hasUnitTests = globSync("src/**/*.test.ts", { cwd: root }).length > 0;
  const hasTestsDir = existsSync(join(root, "tests"));

  if (!hasUnitTests && !hasTestsDir) {
    return;
  }

  const scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts?: Record<string, string> }).scripts ?? {};
  if (scripts["test"] !== "vitest run") {
    push(`有测试文件，但 scripts.test 不是 "vitest run"（实际是 ${JSON.stringify(scripts["test"] ?? null)}）`);
  }
}

/** 包内 tsconfig 只能 extends 这两份共享基线之一，避免各包配置漂移。 */
const ALLOWED_TSCONFIG_BASES = ["../../tsconfig.base.json", "../../tsconfig.strict.json"];

/**
 * 归共享基线管辖的选项。包内覆盖它们会让 21 份配置重新漂移：
 * 一半是编译事实（改了会改产物），一半是基线严格度（改了等于自创一档）。
 * 包内允许的只剩「把某项检查调得更严」，例如 noUnusedLocals。
 */
const BASELINE_OWNED_OPTIONS = ["target", "lib", "module", "moduleResolution", "types", "noEmit", "skipLibCheck", "resolveJsonModule", "strict", "noImplicitOverride", "noUncheckedIndexedAccess", "exactOptionalPropertyTypes", "verbatimModuleSyntax", "allowImportingTsExtensions", "erasableSyntaxOnly"];

function checkTsconfig(root: string, push: (message: string) => void): void {
  const file = join(root, "tsconfig.json");
  if (!existsSync(file)) {
    return;
  }

  // tsconfig 允许注释，JSON.parse 会直接报错；这里只关心 extends 这一项，正则足够
  const source = readFileSync(file, "utf8");
  const match = /"extends"\s*:\s*"([^"]*)"/.exec(source);
  const base = match?.[1];
  if (base === undefined || !ALLOWED_TSCONFIG_BASES.includes(base)) {
    push(`tsconfig.json 必须 extends ${ALLOWED_TSCONFIG_BASES.map((item) => JSON.stringify(item)).join(" 或 ")}，实际是 ${JSON.stringify(base ?? null)}`);
  }

  const owned = compilerOptionKeys(source).filter((key) => BASELINE_OWNED_OPTIONS.includes(key));
  if (owned.length > 0) {
    push(`tsconfig.json 不允许覆盖共享基线的选项：${owned.join("、")}；需要不同的严格度请换成 tsconfig.strict.json`);
  }
}

/** 取 compilerOptions 的键名；注释剥不干净时返回空数组，宁可漏报也不误报。 */
function compilerOptionKeys(source: string): string[] {
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  try {
    const parsed = JSON.parse(stripped) as { compilerOptions?: Record<string, unknown> };
    return Object.keys(parsed.compilerOptions ?? {});
  } catch {
    return [];
  }
}

/** `build.config.ts` 是例外，必须登记在白名单里。 */
function checkBuildConfig(pkg: ResolvedPackage, push: (message: string) => void): void {
  if (!existsSync(join(pkg.root, "build.config.ts"))) {
    return;
  }
  if (!(pkg.name in ALLOWED_BUILD_CONFIG)) {
    push(`build.config.ts 未在 kit 的 ALLOWED_BUILD_CONFIG 里登记理由；标准包不应该有这份配置`);
  }
}

/**
 * 思源用 BCP 47 作为 locale 标识（siyuan 仓库 `kernel/util/lang.go` 的 LangLegacyToBCP47）。
 * 下划线写法只是回退链里的兼容分支，不应出现在新代码里。
 */
const BCP47_LOCALES = new Set(["zh-CN", "zh-TW", "en", "de", "fr", "es", "pt-BR", "it", "ja", "ko", "ru", "uk", "pl", "nl", "ar", "he", "hi", "id", "th", "tr", "sk", "sr"]);

/** 清单里所有「key 是 locale」的对象字段。 */
const LOCALE_FIELDS = ["displayName", "description", "readme", "title"] as const;

/** 清单里所有以 locale 为 key 的字段，其 key 必须是 BCP 47。 */
function checkLocales(pkg: ResolvedPackage, push: (message: string) => void): void {
  for (const field of LOCALE_FIELDS) {
    const map = pkg.manifest[field];
    if (typeof map !== "object" || map === null) {
      continue;
    }
    for (const locale of Object.keys(map as Record<string, unknown>)) {
      if (locale === "default") {
        continue;
      }
      if (!BCP47_LOCALES.has(locale)) {
        push(`清单 ${field} 的 key ${locale} 不是 BCP 47 标识（应为 ${locale.replace(/_/g, "-")} 对应形式，如 zh-CN / zh-TW / en / ja）`);
      }
    }
  }
}

/** 包内清单是覆盖层：只能写本包独有的值。 */
const UNIFIED_FIELDS = ["author", "funding"] as const;

/**
 * 包内清单是覆盖层：只能写本包独有的值。
 * 推导字段（name / url / readme / icon / preview）写了也不生效，直接报错避免两份真相。
 */
function checkManifestFields(pkg: ResolvedPackage, push: (message: string) => void): void {
  for (const field of DERIVED_FIELDS) {
    if (field in pkg.override) {
      push(`包内清单不允许声明 ${field}：它由构建推导（name / url 来自目录名，readme / icon / preview 来自包根文件），写了也不会生效`);
    }
  }

  // 全仓统一的身份信息：包内出现一份就会盖掉共用值，改 base 时也改不到它
  for (const field of UNIFIED_FIELDS) {
    if (field in pkg.override) {
      push(`包内清单不允许声明 ${field}：全仓统一在 manifests/base.json 里声明，这里写一份会覆盖它，改 base 时也同步不到`);
    }
  }

  // 与共用清单取值完全相同的本地声明是纯冗余：删掉行为不变，留着只会成为下一次漂移的起点
  const base = loadBaseManifest(pkg.kind, pkg.repoRoot);
  for (const [field, value] of Object.entries(pkg.override)) {
    const fromBase = field in base.section ? base.section[field] : base.common[field];
    if (fromBase !== undefined && sameValue(fromBase, value)) {
      push(`包内清单的 ${field} 与 manifests/base.json 取值相同，是冗余声明；删掉这一项，以后改 base 才能生效`);
    }
  }

  for (const field of ["displayName", "description"] as const) {
    const map = pkg.manifest[field];
    const hasDefault = typeof map === "object" && map !== null && typeof (map as Record<string, unknown>)["default"] === "string";
    if (!hasDefault) {
      push(`清单 ${field} 必须带 default 文案，否则非目标语言的用户看不到任何文字`);
    }
  }

  // 插件与挂件在发布服务里会被这个字段拦住（siyuan 仓库 kernel/model/publish_resource_access.go 的
  // CheckPluginAccessableInPublish / CheckWidgetAccessableInPublish）；省略虽等价于 false，
  // 但会让人误以为忘了写，所以要求显式声明。主题没有对应读取点，写了也不会生效。
  if (pkg.kind === "theme") {
    if ("disabledInPublish" in pkg.override) {
      push("主题清单不允许声明 disabledInPublish：内核没有读取主题这个字段的地方，写了也不生效");
    }
  } else if (typeof pkg.manifest["disabledInPublish"] !== "boolean") {
    push(`${pkg.kind === "plugin" ? "插件" : "挂件"}清单必须显式写 disabledInPublish（true / false），不要省略：它决定发布服务里能否访问`);
  }
}

/** 归类时忽略键顺序：`{a:1,b:2}` 与 `{b:2,a:1}` 视为同一个值。 */
function sameValue(left: unknown, right: unknown): boolean {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(normalize);
    }
    if (typeof value === "object" && value !== null) {
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(value).sort()) {
        sorted[key] = normalize((value as Record<string, unknown>)[key]);
      }
      return sorted;
    }
    return value;
  };
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

/**
 * 集市的 README 来自清单 `readme`（缺省回退 README.md），产物里的 README 来自包根文件通配。
 * 现在 readme 由构建推导，两边天然一致；这里改为盯住推导抓不到的情况：
 * 写法不匹配通配的文件会静默不进产物，而缺 README.md 会让集市没有回退目标。
 */
function checkReadmeFiles(pkg: ResolvedPackage, push: (message: string) => void): void {
  for (const file of readdirSync(pkg.root)) {
    if (/^readme/i.test(file) && !README_FILE_PATTERN.test(file)) {
      push(`${file} 不会被复制进产物：多语言 README 必须写成 README.<locale>.md（如 README.zh-CN.md，下划线不匹配）`);
    }
  }

  if (!existsSync(join(pkg.root, "README.md"))) {
    push("缺少 README.md：清单 readme 没有 default 时集市会回退到它，产物里也必须有");
  }
}

/** i18n 目录里的文件名同样是 locale，思源按 `Conf.Lang` → 历史下划线 → en 的顺序查。 */
function checkI18nFileNames(pkg: ResolvedPackage, push: (message: string) => void): void {
  if (!pkg.hasI18n) {
    return;
  }
  for (const file of readdirSync(join(pkg.root, "src", "i18n"))) {
    const locale = /^(.+)\.json$/.exec(file)?.[1];
    if (locale === undefined) {
      continue;
    }
    if (!BCP47_LOCALES.has(locale)) {
      push(`src/i18n/${file} 的文件名不是 BCP 47 标识（如 zh-CN / zh-TW / en / ja）`);
    }
  }
}

/** 产物只能落在 <repo>/dist/；包目录里出现产物说明有人手动拷回或绕过了 kit。 */
function checkForbiddenEntries(root: string, push: (message: string) => void): void {
  for (const entry of FORBIDDEN_ENTRIES) {
    if (existsSync(join(root, entry))) {
      // 清单名单独说明，否则容易被当成「清单该放这里」而改错文件
      push(ARTIFACT_MANIFEST_NAMES.includes(entry) ? `包目录里出现 ${entry}：那是产物清单的名字，包内清单统一叫 ${SOURCE_MANIFEST_FILE}，产物只能落在 <仓库>/dist/ 下` : `包目录里出现产物 ${entry}；产物只能落在 <仓库>/dist/ 下`);
    }
  }
}

/** 许可只在仓库根声明一次，各包不得放副本；第三方许可走 THIRD_PARTY-NOTICES.md。 */
const LICENSE_COPIES = ["LICENSE", "LICENSE.md", "LICENSE.txt"];

function checkLicenseCopy(root: string, push: (message: string) => void): void {
  for (const file of LICENSE_COPIES) {
    if (existsSync(join(root, file))) {
      push(`包目录里不允许有 ${file}：许可统一在仓库根的 LICENSE 声明，产物不带原文`);
    }
  }

  // THIRD_PARTY-* 的文件名是固定的，kit 只认 THIRD_PARTY_NOTICES；
  // 其他写法不会被复制进产物，是最容易静默失效的一类。
  for (const file of readdirSync(root)) {
    if (file.startsWith("THIRD_PARTY") && file !== THIRD_PARTY_NOTICES) {
      push(`第三方通知必须写成 ${THIRD_PARTY_NOTICES}，不允许 ${file}；许可全文写在该文件的「许可全文」段落`);
    }
  }
}

/** 每种类型都有一个约定入口，缺了构建必然失败，不如先在这里报。 */
/**
 * 图标与预览图：思源只认 png / jpg / jpeg / webp / avif（siyuan 仓库 kernel/bazaar/bazaar.go 的 isSupportedPackageImageName）。
 * 包根放了 icon.svg 这类文件时，构建不会把它写进清单，集市也就永远拿不到图标——属于静默失效，必须提前报。
 * 完全缺图不在这里报：那是包自身的内容缺口（如 temp-edit 本来就没图），不是契约违规。
 */
function checkImages(pkg: ResolvedPackage, push: (message: string) => void): void {
  for (const file of readdirSync(pkg.root)) {
    const match = /^(icon|preview)\.([^.]+)$/i.exec(file);
    if (!match) {
      continue;
    }
    const extension = match[2]?.toLowerCase() ?? "";
    if (!(IMAGE_EXTENSIONS as readonly string[]).includes(extension)) {
      push(`${file} 的扩展名思源不支持（只认 ${IMAGE_EXTENSIONS.join(" / ")}），这个文件不会进产物、集市也拿不到图；请转成 png 或 webp`);
    }
  }
}

function checkEntry(pkg: ResolvedPackage, push: (message: string) => void): void {
  const entry = REQUIRED_ENTRY[pkg.kind];
  if (!entry) {
    return;
  }
  // 声明了 passes / entry 的包用自己指定的入口，约定入口可以不存
  if (existsSync(join(pkg.root, "build.config.ts"))) {
    return;
  }
  if (!existsSync(join(pkg.root, entry))) {
    push(`缺少约定入口 ${entry}`);
  }
}
