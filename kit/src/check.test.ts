/**
 * `check.ts` 的单元测试。
 *
 * 契约门禁唯一的价值是「该红的会红」。所以每个用例都在临时仓库里**只破坏一处**，
 * 断言报出了对应的问题；再加一条「合规的最小包零问题」兜住误报——
 * 误报会让作者关掉检查，比漏报更致命。
 */

import * as assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, it } from "vitest";
import { addPackage, createRepo, json, type RepoFixture } from "./__fixtures__/repo.ts";
import { ALLOWED_BUILD_CONFIG, checkWorkspace, PREBUILT_LIBS } from "./check.ts";
import { listPackages } from "./resolve.ts";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

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

function messagesOf(fixture: RepoFixture): string[] {
  return checkWorkspace(fixture.root).issues.map((issue) => `${issue.package}: ${issue.message}`);
}

/** 断言出现了包含某个片段的报错；失败时把全部报错打出来，省得再跑一次。 */
function expectIssue(fixture: RepoFixture, fragment: string): void {
  const messages = messagesOf(fixture);
  assert.ok(
    messages.some((message) => message.includes(fragment)),
    `期望出现「${fragment}」，实际报出：\n${messages.join("\n") || "（无问题）"}`,
  );
}

function expectClean(fixture: RepoFixture): void {
  assert.deepEqual(messagesOf(fixture), []);
}

describe("合规的包不报任何问题", () => {
  it("插件", () => {
    const fixture = repo();
    addPackage(fixture, "plugin", "move-doc");
    expectClean(fixture);
  });

  it("主题（没有 disabledInPublish）", () => {
    const fixture = repo();
    addPackage(fixture, "theme", "Whisper");
    expectClean(fixture);
  });

  it("挂件（入口在包根 index.html）", () => {
    const fixture = repo();
    addPackage(fixture, "widget", "inline-elements");
    expectClean(fixture);
  });

  it("仓库里没有发布包时也不报错", () => {
    const fixture = repo();
    assert.deepEqual(checkWorkspace(fixture.root), { packages: [], issues: [] });
  });
});

describe("真实仓库", () => {
  it("22 个包全部合规（与 pnpm check 同源）", () => {
    const result = checkWorkspace(REPO_ROOT);
    assert.ok(result.packages.length >= 20, `只扫到 ${result.packages.length} 个包，repoRoot 是否正确？`);
    assert.deepEqual(result.issues, [], result.issues.map((issue) => `${issue.package}: ${issue.message}`).join("\n"));
  });

  it("白名单没有死条目：登记的包/库都真实存在", () => {
    const names = new Set(listPackages(REPO_ROOT).map((entry) => entry.name));
    for (const [name, reason] of Object.entries(ALLOWED_BUILD_CONFIG)) {
      assert.ok(names.has(name), `ALLOWED_BUILD_CONFIG 里的 ${name} 已不存在，请删掉这一项`);
      assert.ok(reason.length > 0, `ALLOWED_BUILD_CONFIG 的 ${name} 没写理由`);
    }
    for (const [name, reason] of Object.entries(PREBUILT_LIBS)) {
      assert.ok(existsSync(join(REPO_ROOT, "libs", name)), `PREBUILT_LIBS 里的 ${name} 已不存在，请删掉这一项`);
      assert.ok(reason.length > 0, `PREBUILT_LIBS 的 ${name} 没写理由`);
    }
  });
});

describe("身份与脚本", () => {
  it("package.json 的 name 与目录名不一致", () => {
    const fixture = repo();
    addPackage(fixture, "plugin", "move-doc", { packageJson: { name: "move_doc" } });
    expectIssue(fixture, "name 必须与包目录名一致");
  });

  it("缺 package.json", () => {
    const fixture = repo();
    addPackage(fixture, "plugin", "move-doc", { omitPackageJson: true });
    expectIssue(fixture, "缺少 package.json");
  });

  it("package.json 缺 name（与目录名比对时是 undefined）", () => {
    const fixture = repo();
    addPackage(fixture, "plugin", "move-doc", { packageJson: { name: undefined } });
    expectIssue(fixture, "name 必须与包目录名一致");
  });

  it("build / dev 不是 siyuan-kit 的子命令", () => {
    const fixture = repo();
    addPackage(fixture, "plugin", "move-doc", { packageJson: { scripts: { build: "vite build", dev: "vite" } } });
    expectIssue(fixture, 'scripts.build 必须是 "siyuan-kit build"');
    expectIssue(fixture, 'scripts.dev 必须是 "siyuan-kit dev"');
  });
});

describe("测试布局", () => {
  it("存在 tests/ 目录（webpack 时代遗留）", () => {
    const fixture = repo();
    addPackage(fixture, "plugin", "move-doc");
    fixture.mkdir("plugins/move-doc/tests");
    expectIssue(fixture, "不允许 tests/ 或 test/ 目录");
  });

  it(".test.mjs 必须改成 .test.ts", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "move-doc");
    fixture.write(`${dir}/src/legacy.test.mjs`, "export {};\n");
    expectIssue(fixture, "必须写成 .test.ts");
  });

  it("有测试文件却没有 test 脚本与 vitest.config.ts", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "move-doc");
    fixture.write(`${dir}/src/index.test.ts`, 'import * as assert from "node:assert/strict";\nassert.ok(true);\n');
    expectIssue(fixture, '有测试文件，但 scripts.test 不是 "vitest run"');
    expectIssue(fixture, "有测试就必须有 vitest.config.ts");
  });

  it("vitest.config.ts 的 include 缺 e2e 通配", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "move-doc", { packageJson: { scripts: { build: "siyuan-kit build", dev: "siyuan-kit dev", test: "vitest run" } } });
    fixture.write(`${dir}/src/index.test.ts`, 'import * as assert from "node:assert/strict";\nassert.ok(true);\n');
    fixture.write(`${dir}/vitest.config.ts`, 'export default { test: { include: ["src/**/*.test.ts"] } };\n');
    expectIssue(fixture, 'include 必须包含 "e2e/**/*.test.ts"');
  });
});

describe("tsconfig", () => {
  it("extends 了自创的第三份基线", () => {
    const fixture = repo();
    addPackage(fixture, "plugin", "move-doc", { tsconfig: { extends: "../../tsconfig.package.json" } });
    expectIssue(fixture, "tsconfig.json 必须 extends");
  });

  it("覆盖基线管辖的选项", () => {
    const fixture = repo();
    addPackage(fixture, "plugin", "move-doc", { tsconfig: { compilerOptions: { target: "ES2020" } } });
    expectIssue(fixture, "不允许覆盖共享基线的选项：target");
  });

  it("调得更严（noUnusedLocals）是允许的", () => {
    const fixture = repo();
    addPackage(fixture, "plugin", "move-doc", { tsconfig: { compilerOptions: { noUnusedLocals: true } } });
    expectClean(fixture);
  });
});

describe("build.config.ts 白名单", () => {
  it("未登记的包不允许有构建配置", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "move-doc");
    fixture.write(`${dir}/build.config.ts`, "export default { copy: [] };\n");
    expectIssue(fixture, "未在 kit 的 ALLOWED_BUILD_CONFIG 里登记理由");
  });

  it("登记过的包允许有构建配置", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "widget", "inline-elements");
    fixture.write(`${dir}/build.config.ts`, "export default { dropConsole: true };\n");
    expectClean(fixture);
  });
});

describe("清单覆盖层", () => {
  it("声明推导字段", () => {
    const fixture = repo();
    addPackage(fixture, "plugin", "move-doc", { manifest: { readme: { default: "README.md" } } });
    // resolvePackage 先抛错（check 只是把异常转成 issue），所以看到的是它的文案
    expectIssue(fixture, "不允许声明 readme");
  });

  it("声明全仓统一字段", () => {
    const fixture = repo();
    addPackage(fixture, "plugin", "move-doc", { manifest: { author: "TCOTC", funding: {} } });
    expectIssue(fixture, "包内清单不允许声明 author");
    expectIssue(fixture, "包内清单不允许声明 funding");
  });

  it("与 base 取值相同的声明算冗余，不同的覆盖允许", () => {
    const fixture = repo();
    fixture.write("manifests/base.json", json({ plugin: { backends: ["all"] } }));
    addPackage(fixture, "plugin", "redundant", { manifest: { backends: ["all"] } });
    addPackage(fixture, "plugin", "override", { manifest: { backends: ["windows"] } });

    expectIssue(fixture, "backends 与 manifests/base.json 取值相同");
    assert.equal(
      messagesOf(fixture).some((message) => message.includes("override")),
      false,
      "真正不同的覆盖不该被报成冗余",
    );
  });

  it("displayName / description 缺 default", () => {
    const fixture = repo();
    addPackage(fixture, "plugin", "move-doc", { manifest: { displayName: { "zh-CN": "移动文档" } } });
    expectIssue(fixture, "清单 displayName 必须带 default 文案");
  });

  it("plugin 必须显式写 disabledInPublish，theme 不许写", () => {
    const plugin = repo();
    addPackage(plugin, "plugin", "move-doc", { manifest: { disabledInPublish: undefined } });
    expectIssue(plugin, "插件清单必须显式写 disabledInPublish");

    const theme = repo();
    addPackage(theme, "theme", "Whisper", { manifest: { disabledInPublish: false } });
    expectIssue(theme, "主题清单不允许声明 disabledInPublish");
  });

  it("settingsWindow 只有插件可写，且只能为 true", () => {
    const ok = repo();
    addPackage(ok, "plugin", "font-ok", { manifest: { settingsWindow: true } });
    expectClean(ok);

    const falsy = repo();
    addPackage(falsy, "plugin", "font-false", { manifest: { settingsWindow: false } });
    expectIssue(falsy, "只允许写 true");

    const widget = repo();
    addPackage(widget, "widget", "inline-elements", { manifest: { settingsWindow: true } });
    expectIssue(widget, "只有插件清单可以声明 settingsWindow");
  });
});

describe("共用清单", () => {
  it("顶层写了每包必然不同的字段", () => {
    const fixture = repo();
    fixture.write("manifests/base.json", json({ name: "shared", version: "1.0.0" }));
    expectIssue(fixture, "顶层不允许声明 name");
    expectIssue(fixture, "顶层不允许声明 version");
  });

  it("类型分节与顶层重复", () => {
    const fixture = repo();
    fixture.write("manifests/base.json", json({ author: "TCOTC", plugin: { author: "TCOTC" } }));
    expectIssue(fixture, "plugin.author 与顶层重复");
  });

  it("类型分节写了包间不同的字段", () => {
    const fixture = repo();
    fixture.write("manifests/base.json", json({ plugin: { displayName: { default: "x" } } }));
    expectIssue(fixture, "plugin.displayName 不允许写");
  });

  it("base.json 不是合法 JSON 时报解析错误而不是崩掉", () => {
    const fixture = repo();
    fixture.write("manifests/base.json", "{ oops");
    expectIssue(fixture, "manifests/base.json: ");
  });
});

describe("locale", () => {
  it("清单 key 用下划线写法", () => {
    const fixture = repo();
    addPackage(fixture, "plugin", "move-doc", { manifest: { displayName: { default: "x", zh_CN: "中文" } } });
    expectIssue(fixture, "displayName 的 key zh_CN 不是 BCP 47");
  });

  it("i18n 文件名用下划线写法", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "move-doc");
    fixture.write(`${dir}/src/i18n/zh_CN.json`, "{}");
    expectIssue(fixture, "src/i18n/zh_CN.json 的文件名不是 BCP 47");
  });

  it("zh-CN / zh-TW / pt-BR 这几个带地区码的写法是合法的", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "move-doc");
    for (const locale of ["zh-CN", "zh-TW", "pt-BR", "en", "ja"]) {
      fixture.write(`${dir}/src/i18n/${locale}.json`, "{}");
    }
    expectClean(fixture);
  });
});

describe("i18n 形态", () => {
  it("目录里出现非 JSON 文件", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "move-doc");
    fixture.write(`${dir}/src/i18n/notes.txt`, "说明\n");
    expectIssue(fixture, "只放 <locale>.json");
  });
});

describe("README", () => {
  it("下划线命名的多语言 README 不会被复制", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "move-doc");
    fixture.write(`${dir}/README_zh_CN.md`, "## 中文\n");
    expectIssue(fixture, "不会被复制进产物");
  });

  it("缺 README.md（集市没有回退目标）", () => {
    const fixture = repo();
    addPackage(fixture, "plugin", "move-doc", { omitReadme: true });
    expectIssue(fixture, "缺少 README.md");
  });

  it("出现一级标题", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "move-doc");
    fixture.write(`${dir}/README.zh-CN.md`, "说明\n\n# 集市包管理器\n");
    expectIssue(fixture, "README.zh-CN.md 第 3 行是一级标题");
  });

  it("正文以二级标题开头是允许的", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "move-doc");
    fixture.write(`${dir}/README.zh-CN.md`, "## 用法\n");
    expectClean(fixture);
  });
});

describe("产物位置与许可", () => {
  it("包目录里出现产物", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "move-doc");
    fixture.mkdir(`${dir}/dist`);
    expectIssue(fixture, "包目录里出现产物 dist");
  });

  it("包根出现产物清单名时点明包内清单叫什么", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "move-doc");
    fixture.write(`${dir}/plugin.json`, "{}");
    expectIssue(fixture, "那是产物清单的名字");
    expectIssue(fixture, "包内清单统一叫 manifest.json");
  });

  it("包根出现 i18n 目录", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "move-doc");
    fixture.mkdir(`${dir}/i18n`);
    expectIssue(fixture, "包目录里出现产物 i18n");
  });

  it("包根不允许放自有许可副本", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "move-doc");
    fixture.write(`${dir}/LICENSE`, "MIT\n");
    expectIssue(fixture, "包目录里不允许有 LICENSE");
  });

  it("第三方通知必须是固定文件名", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "move-doc");
    fixture.write(`${dir}/THIRD_PARTY-Apache-2.0.txt`, "全文\n");
    expectIssue(fixture, "第三方通知必须写成 THIRD_PARTY-NOTICES.md");
    // 固定名本身是允许的
    fixture.write(`${dir}/THIRD_PARTY-NOTICES.md`, "全文\n");
    assert.equal(messagesOf(fixture).filter((message) => message.includes("THIRD_PARTY-NOTICES.md")).length, 1, "只有 Apache 那一份该报");
  });
});

describe("图标与预览图", () => {
  it("思源不支持的扩展名", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "move-doc");
    fixture.write(`${dir}/icon.svg`, "<svg/>\n");
    expectIssue(fixture, "的扩展名思源不支持");
  });

  it("文件名大小写与构建探测不一致", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "move-doc");
    // Windows 上不能同时建 icon.png 与 Icon.PNG（会互相覆盖），这里只建大写那份
    fixture.write(`${dir}/Icon.PNG`, "");
    expectIssue(fixture, "与构建探测的文件名不一致");
  });

  it("完全缺图不报（那是内容缺口，不是契约违规）", () => {
    const fixture = repo();
    addPackage(fixture, "plugin", "move-doc");
    expectClean(fixture);
  });
});

describe("环境声明与文件命名", () => {
  it("包内出现历史遗留的环境声明文件名", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "move-doc");
    fixture.write(`${dir}/src/declarations.d.ts`, 'declare module "*.scss";\n');
    expectIssue(fixture, "样式模块等环境声明统一在仓库根 types/ambient");
  });

  it("src/types.d.ts 是允许的", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "move-doc");
    fixture.write(`${dir}/src/types.d.ts`, "export {};\n");
    expectClean(fixture);
  });

  it("camelCase 源码文件名", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "move-doc");
    fixture.write(`${dir}/src/myThing.ts`, "export {};\n");
    expectIssue(fixture, "应改成 kebab-case（my-thing.ts）");
  });

  it("README / LICENSE / THIRD_PARTY 前缀只豁免约定名，不豁免同名源码", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "move-doc");
    fixture.write(`${dir}/src/READMEHelper.ts`, "export {};\n");
    expectIssue(fixture, "READMEHelper.ts 应改成 kebab-case（readme-helper.ts）");
  });

  it("i18n 的 locale 文件名不做 kebab-case 检查", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "move-doc");
    fixture.write(`${dir}/src/i18n/pt-BR.json`, "{}");
    fixture.write(`${dir}/src/i18n/zh-TW.json`, "{}");
    expectClean(fixture);
  });
});

describe("约定入口", () => {
  it("没有 build.config.ts 时必须有约定入口", () => {
    const fixture = repo();
    addPackage(fixture, "plugin", "move-doc", { omitEntry: true });
    expectIssue(fixture, "缺少约定入口 src/index.ts");
  });

  it("build.config.ts 只写了 copy 时仍要求约定入口", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "widget", "inline-elements", { omitEntry: true });
    fixture.write(`${dir}/build.config.ts`, "export default { dropConsole: true };\n");
    expectIssue(fixture, "缺少约定入口 index.html");
  });

  it("用 passes / entry 显式声明入口时可不用约定入口", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "image-squeeze", { omitEntry: true });
    fixture.write(`${dir}/build.config.ts`, 'export default { passes: [{ format: "cjs", entry: "src/main.ts" }] };\n');
    expectClean(fixture);
  });

  it("主题的约定入口是 styles/index.scss", () => {
    const fixture = repo();
    addPackage(fixture, "theme", "Whisper", { omitEntry: true });
    expectIssue(fixture, "缺少约定入口 styles/index.scss");
  });
});

describe("随仓生成物", () => {
  it("code-recognition 缺 wasm 时有报错，并给出重建命令", () => {
    const fixture = repo();
    addPackage(fixture, "plugin", "code-recognition");
    expectIssue(fixture, "缺少生成物 wasm/betlang_wasm_bg.wasm");
    expectIssue(fixture, "pnpm --filter code-recognition build:wasm");
  });

  it("生成物存在时通过", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "code-recognition");
    fixture.write(`${dir}/wasm/betlang_wasm_bg.wasm`, "wasm\n");
    expectClean(fixture);
  });
});

describe("libs/*", () => {
  it("缺 tsconfig", () => {
    const fixture = repo();
    fixture.write("libs/token-field/package.json", json({ name: "token-field" }));
    expectIssue(fixture, "libs/token-field: 缺少 tsconfig.json");
  });

  it("extends 了宽松基线", () => {
    const fixture = repo();
    fixture.write("libs/token-field/tsconfig.json", json({ extends: "../../tsconfig.base.json" }));
    expectIssue(fixture, '必须 extends "../../tsconfig.strict.json"');
  });

  it("出现预编译产物", () => {
    const fixture = repo();
    fixture.write("libs/token-field/tsconfig.json", json({ extends: "../../tsconfig.strict.json" }));
    fixture.mkdir("libs/token-field/dist");
    expectIssue(fixture, "不允许出现 dist");
  });

  it("PREBUILT_LIBS 白名单里的库整体豁免", () => {
    const fixture = repo();
    fixture.write("libs/vconsole/dist/vconsole.min.js", "// minified\n");
    expectClean(fixture);
  });

  it("合规的 lib 零问题", () => {
    const fixture = repo();
    fixture.write("libs/token-field/tsconfig.json", json({ extends: "../../tsconfig.strict.json" }));
    expectClean(fixture);
  });
});

describe("发行代码里的 Node API", () => {
  it("引用 node: 内置模块", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "move-doc");
    fixture.write(`${dir}/src/uses-node.ts`, 'import { readFileSync } from "node:fs";\nexport const size = readFileSync;\n');
    expectIssue(fixture, "产物跑在思源里");
  });

  it("首段是内置名的子路径也拦（fs/promises）", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "move-doc");
    fixture.write(`${dir}/src/uses-fs.ts`, 'import { readFile } from "fs/promises";\nexport const read = readFile;\n');
    expectIssue(fixture, "模块 fs/promises");
  });

  it("Node 独有全局量", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "move-doc");
    fixture.write(`${dir}/src/uses-process.ts`, "export const env = process.env.NODE_ENV;\n");
    expectIssue(fixture, "全局量 process.env");
  });

  it("注释里提到 node: 不算（整行跳过）", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "move-doc");
    fixture.write(`${dir}/src/comment.ts`, '// 这里不能 import { readFileSync } from "node:fs"\nexport const ok = true;\n');
    expectClean(fixture);
  });

  it("测试文件与 src/__mocks__ 例外", () => {
    const fixture = repo();
    const dir = addPackage(fixture, "plugin", "move-doc", {
      packageJson: { scripts: { build: "siyuan-kit build", dev: "siyuan-kit dev", test: "vitest run" } },
    });
    fixture.write(`${dir}/vitest.config.ts`, 'export default { test: { include: ["src/**/*.test.ts", "e2e/**/*.test.ts"] } };\n');
    fixture.write(`${dir}/src/uses-node.test.ts`, 'import * as assert from "node:assert/strict";\nexport const ok = assert;\n');
    fixture.write(`${dir}/src/__mocks__/siyuan.ts`, 'import { join } from "node:path";\nexport const p = join;\n');
    expectClean(fixture);
  });
});

describe("问题定位", () => {
  it("每个问题都带上出问题的包名", () => {
    const fixture = repo();
    addPackage(fixture, "plugin", "move-doc", { omitEntry: true });
    addPackage(fixture, "plugin", "other-doc", { omitReadme: true });

    const issues = checkWorkspace(fixture.root).issues;
    assert.ok(issues.length >= 2);
    assert.ok(issues.some((issue) => issue.package === "move-doc" && issue.message.includes("缺少约定入口")));
    assert.ok(issues.some((issue) => issue.package === "other-doc" && issue.message.includes("缺少 README.md")));
  });

  it("一个包崩掉不影响其余包的检查", () => {
    const fixture = repo();
    addPackage(fixture, "plugin", "broken", { manifest: { name: "x" } });
    addPackage(fixture, "plugin", "healthy", { omitReadme: true });

    expectIssue(fixture, "不允许声明 name");
    expectIssue(fixture, "healthy: 缺少 README.md");
  });
});
