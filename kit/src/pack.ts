import { ZipArchive } from "archiver";
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, copyFileSync, rmSync, globSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { CopyPattern } from "./define.ts";
import { collectStaticAssets, writeManifest, type ResolvedPackage } from "./resolve.ts";

/** 构建前清空输出目录。**dev 不要调用**：那时产物目录已经链进思源工作空间，是它正在读取的活目录。 */
export function cleanOutput(outDir: string): void {
  rmSync(outDir, { recursive: true, force: true });
}

/**
 * 把清单 / README / 图标 / 预览图 / 通知文件写进产物根目录。
 * 清单是合成结果，不是从包目录复制的——包里那份只是覆盖层。
 */
export function copyAssets(pkg: ResolvedPackage, outDir: string): void {
  writeManifest(pkg, outDir);

  for (const asset of collectStaticAssets(pkg)) {
    const dest = join(outDir, asset.to);
    if (resolve(dest) === resolve(asset.from)) {
      continue;
    }
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(asset.from, dest);
  }

  // 只有插件的 i18n 目录会被内核读取（siyuan 仓库 kernel/model/plugin.go 的 loadPlugin
  // 按 Conf.Lang → en → zh-CN 挑一份注入 Plugin.i18n）。主题与挂件没有这条路径，
  // 产物的 i18n/ 目录白放着也不会有人读，所以只给插件复制。
  if (pkg.hasI18n && pkg.kind === "plugin") {
    copyDirectory(join(pkg.root, "src", "i18n"), join(outDir, "i18n"));
  }
}

/**
 * 复制 `build.config.ts` 里 `copy` 声明的额外资源（字体、wasm 等大文件）。
 *
 * 字符串规则相对包根 glob，`!` 前缀排除，命中的目录递归复制并保持包内相对路径。
 * 对象规则可以跨包：`from` 以 `@repo/` 开头时相对仓库根（多个包分发同一份二进制时用，
 * 避免在各自目录里各存一份、日后再漂成不同版本），`to` 是产物里的目标目录。
 */
export function copyExtras(pkg: ResolvedPackage, entries: CopyPattern[], outDir: string): void {
  const root = resolve(pkg.root);
  const excluded = new Set<string>();
  for (const entry of entries) {
    if (typeof entry !== "string" || !entry.startsWith("!")) {
      continue;
    }
    for (const match of globSync(entry.slice(1), { cwd: root })) {
      excluded.add(resolve(root, match));
    }
  }

  const copied = new Set<string>();
  for (const entry of entries) {
    if (typeof entry === "string") {
      if (entry.startsWith("!")) {
        continue;
      }
      for (const match of globSync(entry, { cwd: root })) {
        copyExtra(root, match, outDir, excluded, copied);
      }
      continue;
    }

    // 对象规则：基准目录由 @repo/ 前缀决定，目标目录由 to 决定
    const base = entry.from.startsWith(REPO_PREFIX) ? pkg.repoRoot : root;
    const pattern = entry.from.startsWith(REPO_PREFIX) ? entry.from.slice(REPO_PREFIX.length) : entry.from;
    // 命中文件相对这个目录计算目标路径：glob 里第一个通配符之前的那段目录；
    // 没有通配符时就是该文件所在的目录，使 dest 只取文件名
    const wildcard = firstWildcardIndex(pattern);
    const anchor = join(base, dirname(wildcard === -1 ? pattern : pattern.slice(0, wildcard + 1)));
    const to = entry.to ?? "";
    for (const match of globSync(pattern, { cwd: base })) {
      const from = resolve(base, match);
      if (excluded.has(from)) {
        continue;
      }
      if (!isWithin(base, from)) {
        throw new Error(`copy 里的路径越出了仓库/包目录：${entry.from}`);
      }
      const relativeDest = join(to, relative(anchor, from));
      if (statSync(from).isDirectory()) {
        for (const file of globSync("**/*", { cwd: from })) {
          copyFile(resolve(from, file), relativeDest, file, outDir, copied);
        }
        continue;
      }
      copyFile(from, relativeDest, "", outDir, copied);
    }
  }
}

/** 仓库根相对的 `copy` 规则前缀。 */
const REPO_PREFIX = "@repo/";

const isWithin = (base: string, target: string): boolean => target === base || target.startsWith(base + sep);

/** 第一个通配符的位置（找不到返回 -1）。 */
const firstWildcardIndex = (pattern: string): number => {
  for (let index = 0; index < pattern.length; index++) {
    if ("*?[{".includes(pattern[index]!)) {
      return index;
    }
  }
  return -1;
};

/** 把 `source` 复制到 `outDir/<destDir>/<relativeName>`，`copied` 用于跳过重复命中。 */
function copyFile(source: string, destDir: string, relativeName: string, outDir: string, copied: Set<string>): void {
  if (copied.has(source)) {
    return;
  }
  copied.add(source);
  const dest = join(outDir, destDir, relativeName);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(source, dest);
}

/** 包内相对路径的 `url()`：`/\plugins/<name>/...` 这类绝对路径，vite 既不解析也不加哈希。 */
const PLUGIN_URL = /url\(\s*(["']?)([^"')]+)\1\s*\)/g;

/**
 * 给产物 CSS 里指向本包的绝对路径 `url()` 追加 `?v=<buildTime>`。
 *
 * 这些资源（字体、wasm）的文件名通常不含版本（如 `HarmonyOS_Sans_Regular.woff`），
 * 集市换掉文件后 URL 不变，渲染进程就会继续用按 URL 缓存的旧字形——实测表现为
 * 换了字体但页面没变，必须彻底退出思源才恢复。加个随构建变化的查询串即可。
 *
 * 只处理以 `/plugins/<本包名>/` 开头的目标：思源内置资源（`/appearance/fonts/...`）
 * 不归本包管，相对路径与带哈希的资产本来就不会命中这个前缀。
 * 内核的静态文件处理器只取 `c.Param("filepath")`，查询串不参与定位。
 *
 * 扫产物根下的 `*.css`：插件是 `index.css`、主题是 `theme.css`；`assets/` 里的
 * 带哈希文件不需要。
 */
export function stampAssetUrls(pkg: ResolvedPackage, outDir: string, buildTime: number): void {
  if (!existsSync(outDir)) {
    return;
  }
  const prefix = `/plugins/${pkg.name}/`;
  for (const file of globSync("*.css", { cwd: outDir })) {
    const path = join(outDir, file);
    const source = readFileSync(path, "utf8");
    const stamped = source.replace(PLUGIN_URL, (whole: string, quote: string, target: string) => (target.startsWith(prefix) && !target.includes("?") ? `url(${quote}${target}?v=${buildTime}${quote})` : whole));
    if (stamped !== source) {
      writeFileSync(path, stamped);
    }
  }
}

function copyExtra(root: string, relativePath: string, outDir: string, excluded: Set<string>, copied: Set<string>): void {
  const source = resolve(root, relativePath);
  if (excluded.has(source)) {
    return;
  }
  if (!source.startsWith(root + sep)) {
    throw new Error(`copy 里的路径越出了包目录：${relativePath}`);
  }

  if (statSync(source).isDirectory()) {
    for (const entry of readdirSync(source)) {
      copyExtra(root, join(relativePath, entry), outDir, excluded, copied);
    }
    return;
  }

  // 同一个文件可能被多条 glob 命中，重复 copyFileSync 只是浪费
  if (copied.has(source)) {
    return;
  }
  copied.add(source);

  const dest = join(outDir, relativePath);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(source, dest);
}

function copyDirectory(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = join(from, entry.name);
    const dest = join(to, entry.name);
    if (resolve(source) === resolve(dest)) {
      continue;
    }
    if (entry.isDirectory()) {
      copyDirectory(source, dest);
    } else {
      copyFileSync(source, dest);
    }
  }
}

/**
 * 把产物目录打成 zip。
 *
 * 集市要求资产名为 `package.zip`，且 zip 内不能多一层包装目录。
 * 所以用 `directory(dir, false)` 把内容平铺进 zip 根。
 */
export async function zipDir(dir: string, outFile: string): Promise<void> {
  if (!existsSync(dir)) {
    throw new Error(`打包失败：产物目录不存在 ${dir}`);
  }

  // archiver 8 改成了 class 导出，finalize() 也返回 Promise。
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const output = createWriteStream(outFile);

  const written = new Promise<void>((ok, fail) => {
    output.on("close", () => ok());
    output.on("error", fail);
    archive.on("error", fail);
    archive.on("warning", (err) => {
      if (err.code === "ENOENT") {
        console.warn(`[zip] ${err.message}`);
      } else {
        fail(err);
      }
    });
  });

  archive.pipe(output);
  archive.directory(dir, false);
  await archive.finalize();
  await written;
}
