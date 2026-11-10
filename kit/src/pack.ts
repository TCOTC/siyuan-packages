import { ZipArchive } from "archiver";
import { createWriteStream, existsSync, mkdirSync, readdirSync, copyFileSync, rmSync, globSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { collectStaticAssets, writeManifest, type ResolvedPackage } from "./resolve.ts";

/** 构建前清空输出目录。dev 模式下 outDir 是包根，调用方不应调用本函数。 */
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

  if (pkg.hasI18n) {
    copyDirectory(join(pkg.root, "src", "i18n"), join(outDir, "i18n"));
  }
}

/**
 * 复制 `build.config.ts` 里 `copy` 声明的额外资源（字体、wasm 等大文件）。
 * 相对包根 glob，`!` 前缀排除；命中的目录递归复制并保持包内相对路径。
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
