/**
 * kit 单测使用的临时仓库夹具。
 *
 * kit 的检查全部是「读文件系统 → 报问题」，所以测试必须在真实目录上跑，不能 mock fs：
 * mock 掉 `existsSync` 只会把规则里的路径拼错、`readdirSync` 漏读等问题一起藏起来。
 * 每个夹具都是系统临时目录下的一次性仓库，`cleanup()` 之后不留痕迹。
 *
 * 只有 `*.test.ts` 引用本文件（kit 的 exports 只指向 index.ts，它不会进任何产物）。
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { PackageKind } from "../define.ts";
import { PLURAL_DIR } from "../resolve.ts";

export interface RepoFixture {
  /** 仓库根（含 pnpm-workspace.yaml 的那一层）。 */
  root: string;
  /** 写入文件，父目录自动创建。 */
  write(relativePath: string, content: string): void;
  /** 只建目录（用来造 tests/、dist/ 这类「不该存在」的条目）。 */
  mkdir(relativePath: string): void;
  /** 递归删除整个临时仓库。 */
  cleanup(): void;
}

/** 建一个空仓库：只有 pnpm-workspace.yaml，`findRepoRoot` 才能定位到它。 */
export function createRepo(): RepoFixture {
  const root = mkdtempSync(join(tmpdir(), "siyuan-kit-"));
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - plugins/*\n  - themes/*\n  - widgets/*\n");
  return {
    root,
    write(relativePath, content) {
      const file = join(root, relativePath);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, content);
    },
    mkdir(relativePath) {
      mkdirSync(join(root, relativePath), { recursive: true });
    },
    cleanup() {
      // Windows 上刚写完的文件可能还被句柄占着，重试几次比偶尔红一条稳定
      rmSync(root, { recursive: true, force: true, maxRetries: 3 });
    },
  };
}

/** 三种包的约定入口（与 `check.ts` 的 `REQUIRED_ENTRY` 保持一致）。 */
const ENTRY_FILE: Record<PackageKind, string> = {
  plugin: "src/index.ts",
  theme: "styles/index.scss",
  widget: "index.html",
};

/** 三类包的最小合法清单：主题不许写 disabledInPublish，插件与挂件必须显式写。 */
function minimalManifest(kind: PackageKind, name: string): Record<string, unknown> {
  return {
    version: "1.0.0",
    minAppVersion: "3.0.0",
    ...(kind === "theme" ? {} : { disabledInPublish: false }),
    displayName: { default: name },
    description: { default: `${name} 的描述` },
  };
}

export interface PackageFixtureOptions {
  /** 合并进最小清单的覆盖层。 */
  manifest?: Record<string, unknown>;
  /** 合并进 package.json。 */
  packageJson?: Record<string, unknown>;
  /** 合并进 tsconfig.json。 */
  tsconfig?: Record<string, unknown>;
  /** 不写约定入口，用来测「缺少约定入口」。 */
  omitEntry?: boolean;
  /** 不写 README.md。 */
  omitReadme?: boolean;
  /** 不写 package.json。 */
  omitPackageJson?: boolean;
}

/**
 * 加一个「本来可以通过 check」的包，返回它相对仓库根的目录。
 * 每个用例只在需要的方向上破坏一处，报出的问题才归因明确。
 */
export function addPackage(repo: RepoFixture, kind: PackageKind, name: string, options: PackageFixtureOptions = {}): string {
  const dir = `${PLURAL_DIR[kind]}/${name}`;
  repo.write(`${dir}/manifest.json`, JSON.stringify({ ...minimalManifest(kind, name), ...options.manifest }, null, 2));
  if (!options.omitPackageJson) {
    repo.write(
      `${dir}/package.json`,
      JSON.stringify(
        {
          name,
          private: true,
          type: "module",
          scripts: { build: "siyuan-kit build", dev: "siyuan-kit dev" },
          ...options.packageJson,
        },
        null,
        2,
      ),
    );
  }
  repo.write(`${dir}/tsconfig.json`, JSON.stringify({ extends: "../../tsconfig.base.json", include: ["src/**/*.ts"], ...options.tsconfig }, null, 2));
  if (!options.omitReadme) {
    repo.write(`${dir}/README.md`, "## 用法\n\n说明。\n");
  }
  if (!options.omitEntry) {
    const entry = ENTRY_FILE[kind];
    repo.write(`${dir}/${entry}`, kind === "plugin" ? "export {};\n" : "");
  }
  return dir;
}

/** 一个只有内容的 JSON 文件，省掉每个用例都写 `JSON.stringify`。 */
export function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
