import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/** sass 编译步骤，目前只有主题使用（主题产物就是一份 CSS，不需要打包器）。 */
export interface SassStep {
  runner: "sass";
  label: string;
  input: string;
  output: string;
  style: "expanded" | "compressed";
  /** 开发模式下额外产出 `<output>.map`，并在 CSS 末尾写 sourceMappingURL。 */
  sourceMap?: boolean;
  /**
   * 需要内联进 CSS 的图标目录。icons/ 不进产物，
   * 编译后要把 url(.../<目录名>/x.svg) 换成 data URI，否则会 404。
   */
  iconDir?: string;
}

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

/** 目录下全部 SVG，键为相对该目录的路径。 */
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
 * 把指向图标目录的 `url()` 换成 data URI。深层 partial 里的 url 带多层 `../`，
 * 按「若干层 ../ + 目录名/」匹配；找不到文件则保留原 url，让它显式 404。
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
