import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 基于 `kit/templates/plugin/` 生成新插件。
 * 模板不是 pnpm workspace 成员，生成器自己遍历：文本替换占位符，二进制原样复制。
 */

/** 模板里可以用到的占位符。新增时记得同步 kit/templates/README.md。 */
export type TemplateValues = {
  name: string;
  displayName: string;
  displayNameZhCN: string;
  description: string;
  descriptionZhCN: string;
};

const TEMPLATE_KIND = "plugin";
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TOKEN_PATTERN = /\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g;

/** 按扩展名判断文本文件；其余（图片等）原样复制。 */
const TEXT_EXTENSIONS = new Set([".json", ".md", ".scss", ".ts"]);

const FLAGS = new Set(["display-name", "zh-name", "description", "zh-description"]);

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
    throw new Error("用法：siyuan-kit create <name> [--display-name <显示名>] [--zh-name <中文显示名>] [--description <描述>] [--zh-description <中文描述>]");
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
  };
}

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
 * 模板目录 = `kit/templates/<kind>`，按模块自身位置推导，不依赖仓库根。
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
  return TEXT_EXTENSIONS.has(extname(fileName));
}

/**
 * 一次性替换全部占位符。
 * 用 replace 的回调而不是逐个 replaceAll：替换值里的 `{{...}}` 不会被再展开；
 * 未定义的占位符直接报错，避免模板拼写错误留在生成的包里。
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

function toTitleCase(name: string): string {
  return name
    .split("-")
    .filter((part) => part !== "")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
