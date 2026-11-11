/**
 * `resolve.ts` 的单元测试。
 *
 * 这里钉住的是「源码 → 产物清单」这一段：字段从哪一层来、什么时候不写进清单、
 * 哪些写法必须直接抛错。合成错了不会让构建失败，只会让集市读到一份错的清单，
 * 所以每条规则都要有正反两面。
 */

import * as assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "vitest";
import { addPackage, createRepo, json, type RepoFixture } from "./__fixtures__/repo.ts";
import { BASE_MANIFEST_FILE, collectStaticAssets, findImage, findRepoRoot, inferKind, listPackages, loadBaseManifest, manifestFileName, resolvePackage, SOURCE_MANIFEST_FILE, THIRD_PARTY_NOTICES, writeManifest } from "./resolve.ts";

const repos: RepoFixture[] = [];

function repo(): RepoFixture {
  const created = createRepo();
  repos.push(created);
  return created;
}

afterEach(() => {
  for (const created of repos.splice(0)) {
    created.cleanup();
  }
});

function writeBase(fixture: RepoFixture, value: unknown): void {
  fixture.write(BASE_MANIFEST_FILE, json(value));
}

describe("inferKind", () => {
  it("按类型目录判断包类型", () => {
    assert.equal(inferKind(join("repo", "plugins", "move-doc")), "plugin");
    assert.equal(inferKind(join("repo", "themes", "Whisper")), "theme");
    assert.equal(inferKind(join("repo", "widgets", "inline-elements")), "widget");
  });

  it("路径里出现类型目录即可，不必是直接父目录", () => {
    assert.equal(inferKind(join("repo", "plugins", "move-doc", "src")), "plugin");
    // 混合分隔符也认（Windows 上传进来的路径）
    assert.equal(inferKind("repo\\themes\\Whisper\\styles"), "theme");
  });

  it("无法判断时抛错，并在有 manifest.json 时点明原因", () => {
    const fixture = repo();
    addPackage(fixture, "plugin", "stray");
    // 把包挪到类型目录之外：源清单名对三类型都一样，只能靠目录
    const target = join(fixture.root, "elsewhere", "stray");
    fixture.write("elsewhere/stray/manifest.json", json({ version: "1.0.0" }));
    assert.throws(() => inferKind(target), /里有 manifest\.json，但源清单名对三种包类型都一样/);
  });

  it("无法判断且没有清单时给出目录放置建议", () => {
    const fixture = repo();
    const target = join(fixture.root, "elsewhere");
    fixture.mkdir("elsewhere");
    assert.throws(() => inferKind(target), /请把它放到 \{plugins,themes,widgets\}\/ 下/);
  });
});

describe("findRepoRoot", () => {
  it("从包目录向上找到含 pnpm-workspace.yaml 的那一层", () => {
    const fixture = repo();
    addPackage(fixture, "plugin", "move-doc");
    assert.equal(findRepoRoot(join(fixture.root, "plugins", "move-doc", "src")), fixture.root);
  });

  it("一路找不到时抛错而不是返回空串", () => {
    const orphan = mkdtempSync(join(tmpdir(), "siyuan-kit-no-root-"));
    try {
      assert.throws(() => findRepoRoot(join(orphan, "plugins", "x")), /找不到仓库根/);
    } finally {
      rmSync(orphan, { recursive: true, force: true, maxRetries: 3 });
    }
  });
});

describe("manifestFileName", () => {
  it("三种包各有自己的产物清单名", () => {
    assert.equal(manifestFileName("plugin"), "plugin.json");
    assert.equal(manifestFileName("theme"), "theme.json");
    assert.equal(manifestFileName("widget"), "widget.json");
  });
});

describe("resolvePackage", () => {
  it("三层合成：共用顶层 → 类型分节 → 包内覆盖 → 推导", () => {
    const fixture = repo();
    writeBase(fixture, {
      $schema: "./base.schema.json",
      author: "共用作者",
      plugin: { backends: ["all"] },
    });
    addPackage(fixture, "plugin", "move-doc", { manifest: { version: "1.2.3" } });

    const pkg = resolvePackage(join(fixture.root, "plugins", "move-doc"));
    assert.equal(pkg.name, "move-doc");
    assert.equal(pkg.kind, "plugin");
    assert.equal(pkg.version, "1.2.3");
    assert.equal(pkg.manifestFile, "plugin.json");
    assert.equal(pkg.sourceFile, SOURCE_MANIFEST_FILE);
    assert.equal(pkg.manifest["author"], "共用作者");
    assert.deepEqual(pkg.manifest["backends"], ["all"]);
    assert.equal(pkg.manifest["url"], "https://github.com/TCOTC/move-doc");
    // 包内清单里没写的字段不会凭空出现
    assert.equal("funding" in pkg.manifest, false);
  });

  it("产物清单按固定字段顺序输出，与包内书写顺序无关", () => {
    const fixture = repo();
    writeBase(fixture, { author: "共用作者", funding: { custom: ["https://example.com"] } });
    addPackage(fixture, "plugin", "move-doc", {
      // 故意把顺序写反
      manifest: { description: { default: "描述" }, displayName: { default: "名称" }, version: "1.0.0" },
    });

    const pkg = resolvePackage(join(fixture.root, "plugins", "move-doc"));
    assert.deepEqual(Object.keys(pkg.manifest), ["name", "author", "url", "version", "minAppVersion", "disabledInPublish", "displayName", "description", "readme", "funding"]);
  });

  it("base 分节覆盖顶层同名字段（合并顺序就是三层语义）", () => {
    const fixture = repo();
    writeBase(fixture, { keywords: ["顶层"], plugin: { keywords: ["分节"] } });
    addPackage(fixture, "plugin", "move-doc");

    assert.deepEqual(resolvePackage(join(fixture.root, "plugins", "move-doc")).manifest["keywords"], ["分节"]);
  });

  it("readme 由包根文件推导：README.md → default，其余按码位排序", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "move-doc");
    fixture.write(`${dir}/README.zh-CN.md`, "## 中文\n");
    fixture.write(`${dir}/README.ja.md`, "## 日本語\n");
    // 下划线写法不被通配认，因此不进产物清单（由 check 报给作者）
    fixture.write(`${dir}/README_zh_TW.md`, "## 繁體\n");

    const readme = resolvePackage(join(fixture.root, "plugins", "move-doc")).manifest["readme"];
    assert.deepEqual(readme, { default: "README.md", ja: "README.ja.md", "zh-CN": "README.zh-CN.md" });
  });

  it("没有任何 README 时不写 readme 字段", () => {
    const fixture = repo();
    addPackage(fixture, "plugin", "move-doc", { omitReadme: true });
    assert.equal("readme" in resolvePackage(join(fixture.root, "plugins", "move-doc")).manifest, false);
  });

  it("icon / preview 用默认名时不写进清单，非默认名才写", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "move-doc");
    fixture.write(`${dir}/icon.png`, "");
    fixture.write(`${dir}/preview.webp`, "");

    const pkg = resolvePackage(join(fixture.root, "plugins", "move-doc"));
    assert.equal("icon" in pkg.manifest, false);
    assert.equal(pkg.manifest["preview"], "preview.webp");
    // 文件仍然要复制进产物：默认名不进清单不等于不复制
    assert.deepEqual(
      collectStaticAssets(pkg)
        .map((asset) => asset.to)
        .sort(),
      ["README.md", "icon.png", "preview.webp"].sort(),
    );
  });

  it("扩展名优先级固定：png 先于 webp", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "move-doc");
    fixture.write(`${dir}/icon.webp`, "");
    fixture.write(`${dir}/icon.png`, "");
    assert.equal(findImage(join(fixture.root, dir), "icon"), "icon.png");
  });

  it("包内清单声明推导字段时直接抛错", () => {
    const fixture = repo();
    addPackage(fixture, "plugin", "move-doc", { manifest: { url: "https://example.com" } });
    assert.throws(() => resolvePackage(join(fixture.root, "plugins", "move-doc")), /不允许声明 url/);
  });

  it("version 必须是三段之外的非空字符串（空值、缺字段、带 v 前缀都报错）", () => {
    const fixture = repo();
    addPackage(fixture, "plugin", "no-version", { manifest: { version: undefined } });
    assert.throws(() => resolvePackage(join(fixture.root, "plugins", "no-version")), /缺少非空字符串字段 version/);

    addPackage(fixture, "plugin", "v-prefix", { manifest: { version: "v1.0.0" } });
    assert.throws(() => resolvePackage(join(fixture.root, "plugins", "v-prefix")), /不能带 v 前缀/);
  });

  it("package.json 的 name 必须等于目录名", () => {
    const fixture = repo();
    addPackage(fixture, "plugin", "move-doc", { packageJson: { name: "move_doc" } });
    assert.throws(() => resolvePackage(join(fixture.root, "plugins", "move-doc")), /name 必须与包目录名一致/);
  });

  it("缺 manifest.json 但有产物清单名时提示 git mv", () => {
    const fixture = repo();
    fixture.write("plugins/move-doc/plugin.json", json({ version: "1.0.0" }));
    assert.throws(() => resolvePackage(join(fixture.root, "plugins", "move-doc")), /git mv plugin\.json manifest\.json/);
  });

  it("hasI18n 只看 src/i18n 是否存在", () => {
    const fixture = repo();
    addPackage(fixture, "plugin", "with-i18n");
    fixture.write("plugins/with-i18n/src/i18n/zh-CN.json", "{}");
    addPackage(fixture, "plugin", "without-i18n");

    assert.equal(resolvePackage(join(fixture.root, "plugins", "with-i18n")).hasI18n, true);
    assert.equal(resolvePackage(join(fixture.root, "plugins", "without-i18n")).hasI18n, false);
  });
});

describe("loadBaseManifest", () => {
  it("缺文件时两层都为空（仓库外夹具不需要造 base.json）", () => {
    const fixture = repo();
    assert.deepEqual(loadBaseManifest("plugin", fixture.root), { common: {}, section: {} });
  });

  it("$schema 与类型分节不进 common，分节只取本类型那一份", () => {
    const fixture = repo();
    writeBase(fixture, { $schema: "./x.json", author: "A", plugin: { backends: ["all"] }, theme: { frontends: ["desktop"] } });

    const loaded = loadBaseManifest("plugin", fixture.root);
    assert.deepEqual(loaded.common, { author: "A" });
    assert.deepEqual(loaded.section, { backends: ["all"] });
    assert.deepEqual(loadBaseManifest("theme", fixture.root).section, { frontends: ["desktop"] });
    // 没有该类型分节时退化成空对象，而不是 undefined
    assert.deepEqual(loadBaseManifest("widget", fixture.root).section, {});
  });
});

describe("collectStaticAssets", () => {
  it("收集 README、第三方通知与图片，不收集 LICENSE / package.json / 源码", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "move-doc");
    fixture.write(`${dir}/README.zh-CN.md`, "## 中文\n");
    fixture.write(`${dir}/THIRD_PARTY-NOTICES.md`, "许可全文\n");
    fixture.write(`${dir}/icon.png`, "");
    fixture.write(`${dir}/preview.jpg`, "");
    fixture.write(`${dir}/LICENSE`, "MIT\n");
    fixture.write(`${dir}/THIRD_PARTY-Apache-2.0.txt`, "全文\n");

    const pkg = resolvePackage(join(fixture.root, "plugins", "move-doc"));
    const assets = collectStaticAssets(pkg).map((asset) => asset.to);

    assert.deepEqual(assets.sort(), ["README.md", "README.zh-CN.md", THIRD_PARTY_NOTICES, "icon.png", "preview.jpg"].sort());
  });
});

describe("writeManifest", () => {
  it("把合成后的清单写成 2 空格 JSON + 末尾换行", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "move-doc");
    const pkg = resolvePackage(join(fixture.root, "plugins", "move-doc"));

    writeManifest(pkg, join(fixture.root, "dist", "move-doc"));

    const written = readFileSync(join(fixture.root, "dist", "move-doc", "plugin.json"), "utf8");
    assert.equal(written, `${JSON.stringify(pkg.manifest, null, 2)}\n`);
    assert.ok(written.endsWith("\n"));
    assert.equal(dir, "plugins/move-doc");
  });
});

describe("listPackages", () => {
  it("只扫三个类型目录，忽略普通文件与 libs", () => {
    const fixture = repo();
    addPackage(fixture, "plugin", "move-doc");
    addPackage(fixture, "theme", "Whisper");
    addPackage(fixture, "widget", "inline-elements");
    fixture.write("plugins/README.md", "说明\n");
    fixture.write("libs/token-vault/package.json", json({ name: "token-vault" }));

    const packages = listPackages(fixture.root);
    assert.deepEqual(packages.map((entry) => `${entry.kind}:${entry.name}`).sort(), ["plugin:move-doc", "theme:Whisper", "widget:inline-elements"]);
  });
});
