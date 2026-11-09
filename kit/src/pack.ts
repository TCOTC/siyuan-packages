import { ZipArchive } from "archiver";
import { createWriteStream, existsSync, mkdirSync, readdirSync, copyFileSync, rmSync, globSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { collectStaticAssets, type ResolvedPackage } from "./resolve.ts";

/** 构建前清空输出目录。dev 模式下 outDir 是包根，调用方不应调用本函数。 */
export function cleanOutput(outDir: string): void {
  rmSync(outDir, { recursive: true, force: true });
}

/**
 * 把清单 / README / 图标 / 预览图 / i18n 复制到产物根目录。
 *
 * 这些文件必须在 package.zip 内位于根目录，思源安装时直接读。
 * dev 模式下 outDir 就是包根，源与目标可能是同一个文件，必须跳过，
 * 否则 Windows 上 copyFileSync 会直接抛错。
 */
export function copyAssets(pkg: ResolvedPackage, outDir: string): void {
  for (const asset of collectStaticAssets(pkg)) {
    const dest = join(outDir, asset.to);
    if (resolve(dest) === resolve(asset.from)) {
      continue;
    }
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(asset.from, dest);
  }

  if (pkg.hasI18n) {
    copyDirectory(join(pkg.root, "src", "i18n"), join(outDir, "i18n"));
  }
}

/**
 * 复制 `build.config.ts` 里 `copy` 声明的额外静态资源（字体、wasm 这类大文件）。
 *
 * 每一项是相对包根的 glob，`!` 前缀表示排除（用于跳过字体剥离脚本留下的 .bak）。
 * 命中的目录整体递归复制，目标保持包内相对路径：运行时的绝对路径由清单 name
 * 决定的 `/plugins/<name>/` 负责，样式里直接写绝对 URL，vite 既不改写也不会
 * 把它们当模块再打包一份。
 */
export function copyExtras(pkg: ResolvedPackage, patterns: string[], outDir: string): void {
  const root = resolve(pkg.root);
  const excluded = new Set<string>();
  for (const pattern of patterns) {
    if (!pattern.startsWith("!")) {
      continue;
    }
    for (const match of globSync(pattern.slice(1), { cwd: root })) {
      excluded.add(resolve(root, match));
    }
  }

  const copied = new Set<string>();
  for (const pattern of patterns) {
    if (pattern.startsWith("!")) {
      continue;
    }
    for (const match of globSync(pattern, { cwd: root })) {
      copyExtra(root, match, outDir, excluded, copied);
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
 * 两个约束来自集市，不能改：
 *   - 上传到 release 时资产名必须恰好是 `package.zip`（bazaar 按名字找资产）；
 *     本地文件名随意（我们用 <name>.zip），发布工作流负责改名后上传
 *   - zip 内不能多一层包装目录，清单必须在 zip 根
 * 所以这里用 `directory(dir, false)`，把 dir 的内容平铺进去。
 */
export async function zipDir(dir: string, outFile: string): Promise<void> {
  if (!existsSync(dir)) {
    throw new Error(`打包失败：产物目录不存在 ${dir}`);
  }

  // archiver 8 是重写：没有默认导出的工厂函数，改用 new ZipArchive()；
  // finalize() 也从同步返回变成了 Promise。
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
