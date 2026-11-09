import { existsSync, globSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { resolvePackage, type ResolvedPackage } from "./resolve.ts";

/**
 * 仓库级的「契约门禁」。
 *
 * 这个命令存在的理由：README 里的约定只有人读，而人会忘。22 个包的目录名、
 * 清单 name、package.json name、脚本名、测试位置、配置白名单，任何一处漂移
 * 都应该在 CI 变红，而不是在半年后某次发版时才被发现。
 *
 * 只检查「构建阶段就能判定」的结构问题，不重复集市（bazaar）的清单校验，
 * 也不检查产物内容——那是构建自己的事。
 */

/** 允许存在的 `{plugins,themes,widgets}/` 目录，顺序即检查顺序。 */
const PACKAGE_KINDS = ["plugins", "themes", "widgets"] as const;

/**
 * 允许携带 `build.config.ts` 的包，值是该包必须偏离约定的理由。
 *
 * 这张表是**白名单**：新增条目必须在这里写清为什么不走默认 preset，
 * 否则任何人加一份配置都不会被发现。表里的理由也会打印在 `--verbose` 输出里。
 */
export const ALLOWED_BUILD_CONFIG: Record<string, string> = {
  "code-recognition": "wasm 与第三方许可不在 vite 模块图里，需要 copy",
  "flomo-web": "主进程挂钩脚本由 remote.require 按路径加载，需要 copy",
  "image-squeeze": "Worker 入口要 iife + inlineDynamicImports，需要 passes",
  "inline-elements": "旧产物在生产构建里开启 dropConsole",
  "siyuan-plugin-openmoji-emoji": "字体与根 LICENSE 需要 copy",
  "siyuan-ttf-HarmonyOS_Sans_SC-and-Twemoji": "11 MB 字体不能进模块图，需要 copy",
  "siyuan-ttf-LXGWWenKaiGB-and-Twemoji": "14 MB 字体不能进模块图，需要 copy",
};

/** 包目录里绝不允许出现的文件与目录：产物只能落在仓库根的 dist/ 下。 */
const FORBIDDEN_ENTRIES = ["dist", "package.zip", "index.js", "index.css", "i18n"];

/** 扩展名 → 该包类型必须存在的约定入口。 */
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
  /** 已检查的包目录名。 */
  packages: string[];
  issues: CheckIssue[];
}

/** 检查整个仓库的所有发布包。 */
export function checkWorkspace(repoRoot: string): CheckResult {
  const packages: string[] = [];
  const issues: CheckIssue[] = [];

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

function checkPackage(root: string, issues: CheckIssue[]): void {
  const fallbackName = basename(root);
  const push = (message: string) => issues.push({ package: fallbackName, message });

  // 目录名 == 清单 name == package.json name 的校验已经写在 resolvePackage 里，
  // 这里只负责把异常转成一条 issue，而不是让整个命令崩掉。
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
  checkReadmeNames(pkg, push);
  checkForbiddenEntries(root, push);
  checkEntry(pkg, push);
}

/** 每个包都必须走同一套脚本入口，不许某个包偷偷退回自建构建。 */
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

/** 有测试就必须能跑测试，而且跑的是同一套 runner。 */
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

/**
 * 包内 tsconfig 只能 extends 仓库里的两个基线之一：
 *   - tsconfig.package.json：从旧仓库原样迁入的宽松档（多数包）
 *   - tsconfig.base.json：旧仓库本来就是 strict 的包
 * 不许各写一份互不相同的配置——那正是合仓要消除的漂移。
 */
const ALLOWED_TSCONFIG_BASES = ["../../tsconfig.base.json", "../../tsconfig.package.json"];

function checkTsconfig(root: string, push: (message: string) => void): void {
  const file = join(root, "tsconfig.json");
  if (!existsSync(file)) {
    return;
  }

  // tsconfig 允许注释，JSON.parse 会直接报错；这里只关心 extends 这一项，正则足够
  const match = /"extends"\s*:\s*"([^"]*)"/.exec(readFileSync(file, "utf8"));
  const base = match?.[1];
  if (base === undefined || !ALLOWED_TSCONFIG_BASES.includes(base)) {
    push(`tsconfig.json 必须 extends ${ALLOWED_TSCONFIG_BASES.map((item) => JSON.stringify(item)).join(" 或 ")}，实际是 ${JSON.stringify(base ?? null)}`);
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
 * 集市按清单里的 readme 字段读文件，kit 的约定只认 `README.md` / `README.<locale>.md`。
 * 下划线写法（`README_zh_CN.md`）会让 collectStaticAssets 静默漏掉，只能靠 copy 兜底——
 * 那是历史包袱，不允许再扩大到新包。
 */
function checkReadmeNames(pkg: ResolvedPackage, push: (message: string) => void): void {
  const readme = pkg.manifest["readme"];
  if (typeof readme !== "object" || readme === null) {
    return;
  }
  for (const [locale, file] of Object.entries(readme as Record<string, unknown>)) {
    if (typeof file === "string" && file.startsWith("README_")) {
      push(`清单 readme.${locale} 用了下划线命名 ${file}，应改成 README.<locale>.md 以走默认约定`);
    }
  }
}

/** 产物只能落在 <repo>/dist/，包目录里出现产物说明有人跑了旧脚本或手动拷回。 */
function checkForbiddenEntries(root: string, push: (message: string) => void): void {
  for (const entry of FORBIDDEN_ENTRIES) {
    if (existsSync(join(root, entry))) {
      push(`包目录里出现产物 ${entry}；产物只能落在 <仓库>/dist/ 下`);
    }
  }
}

/** 每种类型都有一个约定入口，缺了构建一定会失败，不如在这里先报。 */
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
