import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/**
 * sass 编译步骤。目前只有主题用它——主题的产物就是一份 CSS，
 * 不需要打包器（理由见 presets/theme.ts）。
 */
export interface SassStep {
  runner: "sass";
  label: string;
  /** 入口文件，绝对路径。 */
  input: string;
  /** 产物文件，绝对路径。 */
  output: string;
  style: "expanded" | "compressed";
  /** 开发模式下额外产出 `<output>.map`，并在 CSS 末尾写 sourceMappingURL。 */
  sourceMap?: boolean;
  /**
   * 需要内联进 CSS 的图标目录，绝对路径。
   *
   * 主题的 `icons/` 只存在于源码里，产物里没有这个目录，
   * 所以编译后要把 `url(.../<目录名>/x.svg)` 换成 data URI，
   * 否则装到思源里图标会 404。
   */
  iconDir?: string;
}

/** 编译 sass，按需内联图标与 sourcemap。 */
export async function runSassStep(step: SassStep): Promise<void> {
  const { compileAsync } = await import("sass");
  const result = await compileAsync(step.input, {
    style: step.style,
    loadPaths: [dirname(step.input)],
    sourceMap: step.sourceMap === true,
  });

  let css = result.css;
  if (step.iconDir) {
    css = inlineIcons(css, readIcons(step.iconDir), basename(step.iconDir));
  }

  mkdirSync(dirname(step.output), { recursive: true });
  if (step.sourceMap === true && result.sourceMap) {
    writeFileSync(`${step.output}.map`, JSON.stringify(result.sourceMap));
    css += `/*# sourceMappingURL=${basename(step.output)}.map */`;
  }
  writeFileSync(step.output, css);
}

/** 递归收集目录下的全部 SVG，键是相对该目录的路径。 */
function readIcons(dir: string): Map<string, string> {
  const icons = new Map<string, string>();
  const walk = (current: string, prefix: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(path, `${prefix}${entry.name}/`);
      } else if (entry.name.endsWith(".svg")) {
        icons.set(`${prefix}${entry.name}`, readFileSync(path, "utf8"));
      }
    }
  };
  walk(dir, "");
  return icons;
}

/**
 * 把指向图标目录的 `url()` 换成 data URI。
 *
 * 样式写在 `styles/modules/editor/` 这类深层 partial 里，url 会带若干层 `../`，
 * 而 sass 编译结果原样保留这些相对路径，所以按「若干层 ../ + 目录名/」匹配。
 * 找不到对应文件时不改写，留着让它在浏览器里显式 404——比静默丢掉 url 更容易发现。
 */
function inlineIcons(css: string, icons: Map<string, string>, dirName: string): string {
  const pattern = new RegExp(`url\\((['"]?)(?:\\.\\./)+${escapeRegExp(dirName)}/([^"')]+)\\1\\)`, "g");
  return css.replace(pattern, (match, _quote: string, iconPath: string) => {
    const content = icons.get(iconPath);
    return content === undefined ? match : `url("data:image/svg+xml,${encodeURIComponent(content)}")`;
  });
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
