import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 基于 `kit/templates/plugin/` 生成一个新插件。
 *
 * 模板与生成器同处 kit，所以不新增顶层目录；它也不是 pnpm workspace 成员
 * （kit/tsconfig.json 的 include 只有 src/**\/*.ts），`pnpm -r build` 不会扫到它。
 * 生成器自己遍历：文本文件做占位符替换，图片等二进制文件原样复制。
 */

/** 模板里可以用到的占位符。新增时记得同步 kit/templates/README.md。 */
export type TemplateValues = {
  name: string;
  displayName: string;
  displayNameZhCN: string;
  description: string;
  descriptionZhCN: string;
  author: string;
  url: string;
  year: string;
};

const TEMPLATE_KIND = "plugin";
const DEFAULT_AUTHOR = "Jeffrey Chen";
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TOKEN_PATTERN = /\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g;

/** 按扩展名判断文本文件；`LICENSE` 这类无扩展名的也当文本处理。 */
const TEXT_EXTENSIONS = new Set([".json", ".md", ".scss", ".ts"]);
const TEXT_FILES = new Set(["LICENSE"]);

const FLAGS = new Set(["display-name", "zh-name", "description", "zh-description", "author", "url"]);

/** 解析 `create` 子命令的参数，返回模板要用的全部取值。 */
export function parseCreateArgs(args: string[]): TemplateValues {
  const positional: string[] = [];
  const flags = new Map<string, string>();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      continue;
    }
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const flag = arg.slice(2);
    if (!FLAGS.has(flag)) {
      throw new Error(`未知参数：${arg}\n可用参数：${[...FLAGS].map((name) => `--${name}`).join(" ")}`);
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`参数 ${arg} 缺少取值`);
    }
    flags.set(flag, value);
    index += 1;
  }

  const [name, ...extra] = positional;
  if (name === undefined) {
    throw new Error("用法：siyuan-kit create <name> [--display-name <显示名>] [--zh-name <中文显示名>] [--description <描述>] [--zh-description <中文描述>] [--author <作者>] [--url <仓库地址>]");
  }
  if (extra.length > 0) {
    throw new Error(`只接受一个包名，多余的参数：${extra.join(" ")}`);
  }
  if (!NAME_PATTERN.test(name)) {
    throw new Error(`包名只能由小写字母、数字与连字符组成（kebab-case），例如 my-plugin：${name}`);
  }

  const displayName = flags.get("display-name") ?? toTitleCase(name);
  const description = flags.get("description") ?? "";

  return {
    name,
    displayName,
    displayNameZhCN: flags.get("zh-name") ?? displayName,
    description,
    descriptionZhCN: flags.get("zh-description") ?? description,
    author: flags.get("author") ?? DEFAULT_AUTHOR,
    url: flags.get("url") ?? `https://github.com/TCOTC/${name}`,
    year: String(new Date().getFullYear()),
  };
}

/** 在 `plugins/<name>/` 下生成插件，返回目标目录的绝对路径。 */
export function createPlugin(repoRoot: string, values: TemplateValues): string {
  const templateDir = templateDirectory();
  if (!existsSync(templateDir)) {
    throw new Error(`找不到模板目录：${templateDir}`);
  }

  const targetDir = join(repoRoot, "plugins", values.name);
  if (existsSync(targetDir)) {
    throw new Error(`目录已存在，拒绝覆盖：${targetDir}`);
  }

  copyDirectory(templateDir, targetDir, values);
  return targetDir;
}

/**
 * 模板目录 = `kit/templates/<kind>`。
 *
 * 按模块自身位置推导，而不是从仓库根拼：kit 的源码本身就是入口
 * （`exports` 指向 `src/index.ts`），所以这里能拿到 `<repo>/kit/src/create.ts`。
 */
function templateDirectory(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "templates", TEMPLATE_KIND);
}

function copyDirectory(from: string, to: string, values: TemplateValues): void {
  mkdirSync(to, { recursive: true });

  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = join(from, entry.name);
    const target = join(to, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(source, target, values);
      continue;
    }

    if (isTextFile(entry.name)) {
      writeFileSync(target, render(readFileSync(source, "utf8"), values));
    } else {
      copyFileSync(source, target);
    }
  }
}

function isTextFile(fileName: string): boolean {
  return TEXT_EXTENSIONS.has(extname(fileName)) || TEXT_FILES.has(fileName);
}

/**
 * 一次性替换全部占位符。
 *
 * 用 replace 的回调而不是逐个 replaceAll：替换进来的值即使包含 `{{...}}`
 * 也不会被再展开一遍。遇到未定义的占位符直接报错，避免模板拼写错误
 * 悄悄留在生成的包里。
 */
function render(content: string, values: TemplateValues): string {
  // 模板文件名是任意的，这里按字符串键取值（类型别名才有隐式索引签名）
  const table: Record<string, string> = values;
  return content.replace(TOKEN_PATTERN, (match, key: string) => {
    const value = table[key];
    if (value === undefined) {
      throw new Error(`模板里有未定义的占位符 ${match}，可用：${Object.keys(values).join(" / ")}`);
    }
    return value;
  });
}

/** `my-plugin` → `My Plugin`，作为 displayName 的默认值。 */
function toTitleCase(name: string): string {
  return name
    .split("-")
    .filter((part) => part !== "")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
