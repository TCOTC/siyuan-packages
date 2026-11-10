import { mkdirSync, readdirSync, readFileSync, watch, writeFileSync, type FSWatcher } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

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

export interface SassResult {
  /** 本次编译读过的全部文件：入口 + `@use`/`@import` 进来的 partial。 */
  loadedFiles: string[];
}

export async function runSassStep(step: SassStep): Promise<SassResult> {
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

  return { loadedFiles: result.loadedUrls.filter((url) => url.protocol === "file:").map((url) => fileURLToPath(url)) };
}

/** 合并窗口：编辑器保存一次常连发多个事件（写临时文件再改名）。 */
const REBUILD_DEBOUNCE_MS = 60;

/**
 * 开发模式下盯着样式源重编译。
 *
 * sass 的 `compileAsync` 没有内建监听（`--watch` 只在 dart-sass 的 CLI 里），
 * 而主题是三个 preset 里唯一不走打包器的，所以 dev 必须自己盯文件：
 * 否则只编译一次就退出，改完样式思源那边永远看不到新的 `theme.css`。
 */
export function watchSassStep(step: SassStep, loadedFiles: string[], name: string): void {
  const watchers = new Map<string, FSWatcher>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let queued = false;

  function ensureWatched(dir: string): void {
    const root = resolve(dir);
    for (const existing of watchers.keys()) {
      if (isInside(root, existing)) {
        return;
      }
    }
    try {
      // recursive 在三个平台上都可用（Windows 原生支持，Linux 自 Node 20 起支持），
      // 目录今后新增的 partial 也能立刻生效。
      const watcher = watch(root, { recursive: true }, schedule);
      watcher.on("error", (error: Error) => {
        console.warn(`[${name}] 监听 ${root} 失败：${error.message}`);
      });
      watchers.set(root, watcher);
    } catch (error) {
      console.warn(`[${name}] 监听 ${root} 失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function schedule(): void {
    clearTimeout(timer);
    timer = setTimeout(() => void rebuild(), REBUILD_DEBOUNCE_MS);
  }

  async function rebuild(): Promise<void> {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      const result = await runSassStep(step);
      // 新引入的 partial 可能在还没盯的目录里
      for (const file of result.loadedFiles) {
        ensureWatched(dirname(file));
      }
      console.log(`[${name}] ${step.label} 已更新`);
    } catch (error) {
      // 编译错误不能终止监听：改一半的 SCSS 是常态，控制台报错即可
      console.error(`[${name}] ${step.label} 编译失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      running = false;
      if (queued) {
        queued = false;
        schedule();
      }
    }
  }

  for (const dir of watchRoots(step, loadedFiles)) {
    ensureWatched(dir);
  }
  console.log(`[${name}] ${step.label} 监听中（改完样式自动重编译，Ctrl+C 退出）`);
}

/** 要盯的目录：入口目录（含 partial 子目录）、入口目录之外被引用过的文件、图标目录。 */
function watchRoots(step: SassStep, loadedFiles: string[]): string[] {
  const roots = [dirname(step.input), ...loadedFiles.map((file) => dirname(file))];
  if (step.iconDir) {
    roots.push(step.iconDir);
  }
  return roots;
}

function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
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
