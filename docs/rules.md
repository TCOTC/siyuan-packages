# 仓库规则

22 个集市包的源码收在一处，共享一套构建契约。其中能在构建阶段判定的部分由 `pnpm check` 拦住（第 6 节）。

---

## 1. 集市约束

以下五条决定仓库形态，依据是集市（bazaar）源码：

| 约束                                    | 依据                                                                                                 | 对架构的影响                              |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 一个仓库只能承载一个包                  | `util.FetchLatestReleaseZip` 走 `/releases/latest`；`plugins.txt` 是纯 `owner/repo` 行，不支持子目录 | 每个包的收录仓库必须保留，不能合并成 1 个 |
| 集市只读最新 release 里的 `package.zip` | `actions/stage/index.go` 下载 zip 并解压，从 zip 内读清单、README、图标                              | 分发只需发 release 资产；仓库树内容不参与 |
| 资产名必须恰好是 `package.zip`          | `actions/util/release.go` 里 `asset.GetName() == "package.zip"`                                      | 产物命名不可自定义                        |
| prerelease 不参与索引                   | GitHub `/releases/latest` 忽略 prerelease                                                            | 自动发布必须直接建正式 release            |
| `version` 单调递增且不带 `v` 前缀       | `rules/manifest.go`                                                                                  | 清单写 `1.0.2`，tag 写 `v1.0.2`           |

即「单源码仓 + 每个包一个发布端点」，不是把 22 个包并成一个集市包。

---

## 2. 目录与身份

### 2.1 类型目录与支撑目录

```
plugins/          发布包，类型 plugin  → plugin.json
themes/           发布包，类型 theme   → theme.json
widgets/          发布包，类型 widget  → widget.json
libs/             不发布的共享库
kit/              构建内核 @jeffrey-chen/siyuan-kit
```

目录决定类型，类型决定清单文件名。`libs/*` 不是集市包：无清单、无 `build` 脚本、不进 `dist/`，`exports` 指向 `src/index.ts`，由消费方 vite 一并编译进 bundle。

`libs/vconsole` 是唯一例外：上游只发源码、打包需要整套 svelte + webpack，仓内无法复现，所以直接提交官方构建产物（更新方式见该目录 README）。

### 2.2 目录名 == 清单 `name` == `package.json` 的 `name`

三者逐字符相同（含大小写），`resolvePackage` 里是**硬错误**。`name` 决定 `dist/<name>`、`data/<类型>/<name>` 与发布仓库 `TCOTC/<name>`，任何一处漂移都会让同一个包出现多种写法。

代价是 `pnpm --filter` 区分大小写。改 `name` 会让思源装出新目录、集市收录记录也对不上，所以不能改。

### 2.3 locale 一律 BCP 47

除 `zh-CN` / `zh-TW` / `pt-BR` 外不带地区码。思源落盘前就把语言码归一成 BCP 47（`kernel/model/conf_specs.go`），下划线写法只是回退链里的兼容分支。

四处必须同步改，只改一半就会静默失效：

| 位置                                                 | 例子                                        |
| ---------------------------------------------------- | ------------------------------------------- |
| 清单 `displayName` / `description` / `readme` 的 key | `"zh-CN"`、`"zh-TW"`、`"ja"`                |
| 多语言 README 文件名                                 | `README.zh-CN.md`、`README.ja.md`           |
| `src/i18n/*.json` 的文件名                           | `zh-CN.json`、`ja.json`                     |
| `src/index.ts` 里对 i18n JSON 的导入路径             | `import type zhCN from "./i18n/zh-CN.json"` |

`pnpm check` 校验前两项，并检查清单声明的每个 README 都真实存在。

### 2.4 一个插件包的最小结构

```
plugins/move-doc/
├── package.json
├── plugin.json           # 清单：name / version / icon / preview / readme
├── icon.png
├── preview.png
├── README.md             # 多语言：README.zh-CN.md、README.ja.md …
└── src/
    ├── index.ts          # 默认入口
    └── i18n/*.json       # 会被复制到产物的 i18n/
```

主题的约定入口是 `styles/index.scss`，挂件的约定入口是包根的 `index.html`。

---

## 3. 产物契约

### 3.1 产物只在仓库根的 `dist/`

源码目录里永远不出现产物，`.gitignore` 只需一行 `/dist`。

```
plugins/move-doc/           源码  {plugin.json, README*.md, icon.png, preview.png, src/}
        └─▶ dist/move-doc/  产物  {index.js, index.css, plugin.json, README*.md, i18n/}
            dist/move-doc.zip       上传到 release 的那个包
```

发布脚本按约定取 `dist/<name>.zip`，不用遍历包目录；换机器、换工作空间路径都不用动包。

三条硬规定：

- zip 内不能多一层包装目录，清单必须在 zip 根
- 清单 `version` 不带 `v` 前缀；release tag 带 `v`
- `dist/` 与 `siyuan.config.json` 都 gitignore

### 3.2 运行期形态

- 插件入口必须是 CommonJS（内核按 `require` 加载），不要改成纯 ESM。
- 样式必须落在 `index.css`，不能带哈希或进 `assets/`（内核按固定名找）。
- 入口 import 了样式但编译结果为空时，build 不产出 `index.css`，dev 补一个空文件。
- dev 与 build 只差两处：dev 不压缩 + inline sourcemap，build 压缩 + 无 sourcemap。`base` / `external` / CSS 命名两边一致，否则会「本地能跑、装了包不行」。

### 3.3 dev 同步

产物落盘后 `dist/<name>/` 会被镜像进 `<工作空间>/data/<类型>/<name>/`：新增复制、变化覆盖、产物里没有的删除。

需要仓库根的 `siyuan.config.json`（gitignore，模板见 `siyuan.config.example.json`）：

```json
{ "workspace": "D:/SiYuan" }
```

指向工作空间根目录（含 `data/` 的那一层）。缺文件时只构建不同步；路径不存在、填成 `data` 本身、目录下没有 `data/` 各有报错。

同步前会校验目标目录的清单与本包 `name` 一致，否则拒绝写入——镜像会删多余文件，配错就会清掉别人的插件目录。也不要把源码 checkout 当目标。

---

## 4. 零配置与例外

标准包零构建配置，`package.json` 只有下面这些（`typecheck` 由根目录 `pnpm -r` 驱动）：

```json
{
  "name": "move-doc",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "siyuan-kit build",
    "dev": "siyuan-kit dev",
    "typecheck": "tsc -p ."
  },
  "devDependencies": {
    "@jeffrey-chen/siyuan-kit": "workspace:*",
    "siyuan": "catalog:",
    "typescript": "catalog:"
  }
}
```

- 有单测的包再加 `"test": "vitest run"` 与 `vitest` 依赖；需要 DOM 的包在 `vitest.config.ts` 里设 `environment: "jsdom"`。`siyuan` 是纯类型包，测试里 alias 到桩。
- `@jeffrey-chen/siyuan-kit` 必须写进 `devDependencies`（`workspace:*`），否则 `siyuan-kit` bin 不会链进该包。
- kit 从清单读 `name` / `version` / `icon` / `preview` / `readme`，按约定找 `src/index.ts` 与 `src/i18n/`，用 name 算出 `/plugins/<name>/` 作为 `base`。

### 4.1 `build.config.ts` 白名单

偏离约定用同一套 API 声明。只有「有东西不在 vite 模块图里」或「需要多入口」才需要这份配置：

| 包                                         | 需要什么                                                | 怎么表达                                                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `image-squeeze`                            | 主入口 CJS + Worker 入口 IIFE；wasm 由 `new URL` 引用   | `passes: [{format:"cjs"}, {format:"iife", name, inlineDynamicImports}]`，另加 `define: {"import.meta.url": "self.location.href"}`（iife 没有 `import.meta`） |
| `code-recognition`                         | wasm 不在模块图里（运行期按绝对路径动态 import）        | `copy: ["wasm/**/*"]`，原样复制到产物根                                                                                                                      |
| `flomo-web`                                | 主进程挂钩脚本由 `remote.require()` 按路径加载          | `copy: ["devtools-hook.cjs"]`                                                                                                                                |
| `siyuan-ttf-LXGWWenKaiGB-and-Twemoji`      | 14 MB 字体不能进模块图（会被当成 url() 依赖再打包一份） | `copy: ["LXGWWenKai/**/*", "Twemoji/**/*", "!**/*.bak"]`；样式里写 `/plugins/<name>/...` 绝对 URL                                                            |
| `siyuan-ttf-HarmonyOS_Sans_SC-and-Twemoji` | 11 MB 字体不能进模块图                                  | `copy: ["HarmonyOS_Sans/**/*", "Twemoji/**/*"]`，同上                                                                                                        |
| `siyuan-plugin-openmoji-emoji`             | 953 KiB 字体不能进模块图                                | `copy: ["OpenMoji/**/*"]`（字体自带的 `OpenMoji/LICENSE.txt` 一并复制）                                                                                      |
| `inline-elements`                          | 生产构建要去掉 `console.*`                              | `dropConsole: true`：挂件 preset 把它传给 rolldown 的 `output.minify.compress.dropConsole`，dev 不生效                                                       |

这份表是**白名单**：新增条目必须先登记到 `kit/src/check.ts` 的 `ALLOWED_BUILD_CONFIG`（附理由），否则 `pnpm check` 会红。

`copy` 的规则：相对包根 glob，`!` 前缀排除，命中目录递归复制，目标保持包内相对路径。字体与 wasm 在产物里的位置与源码一致，运行期用 `/plugins/<name>/...` 绝对 URL 访问，vite 不改写也不会再打包一份。

---

## 5. tsconfig 只有两档

包内 `tsconfig.json` 只指定 `extends`（必要时再写 `include` 与个别 `compilerOptions` 覆盖），不许自创第三份基线：

| 基线                    | 严格度                                                                  | 谁用                                                                          |
| ----------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `tsconfig.base.json`    | `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`    | `kit`、`libs/token-vault`、`snippets` / `install-package` / `inline-elements` |
| `tsconfig.package.json` | `strict: false` + `noImplicitAny`（其余依赖 strictNullChecks 的项关掉） | 其余 18 个包                                                                  |

新包默认走严格档。宽松档留给严格度尚未收紧的包，收紧类型属于独立重构。

两点需要注意：

- `include` 不能放进共享基线：TS 的相对声明它的配置文件解析，写进根配置会指向仓库根的 `src/`。
- `libs/token-vault` 的源码会被两个消费方的 tsc 程序一并检查，因此与它们一致关掉了 `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes`。

---

## 6. 契约门禁：`pnpm check`

`siyuan-kit check` 遍历 `{plugins,themes,widgets}/*`，把能在构建阶段判定的约定变成一条会变红的检查：

| 检查项      | 具体规则                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| 身份一致    | 目录名 == 清单 `name` == `package.json` 的 `name`（逐字符，含大小写）                                        |
| 脚本入口    | `build` 必须是 `siyuan-kit build`，`dev` 必须是 `siyuan-kit dev`                                             |
| 测试        | 有 `src/**/*.test.ts` 或 `tests/` 就必须有 `test` 脚本且为 `vitest run`                                      |
| tsconfig    | 必须 extends 仓库根的 `tsconfig.base.json` 或 `tsconfig.package.json`                                        |
| 配置白名单  | 有 `build.config.ts` 就必须在 `ALLOWED_BUILD_CONFIG` 里                                                      |
| locale      | 清单的 `displayName` / `description` / `readme` / `title` key 与 `src/i18n/*.json` 文件名必须是 BCP 47       |
| README 存在 | 清单 `readme` 声明的每个文件都必须存在                                                                       |
| 产物位置    | 包目录里不允许出现 `dist/` / `package.zip` / `index.js` / `index.css` / `i18n/`                              |
| 许可副本    | 包根不允许出现 `LICENSE` / `LICENSE.md` / `LICENSE.txt`，许可只在仓库根声明                                  |
| 第三方通知  | 包根只能有 `THIRD_PARTY-NOTICES.md`，其它 `THIRD_PARTY*` 文件一律报错（它们不会进产物）                      |
| 约定入口    | 没有 `build.config.ts` 时，`src/index.ts`（插件）/ `index.html`（挂件）/ `styles/index.scss`（主题）必须存在 |

CI 在 `format:check` 之前跑它：结构错了，后面的检查都跑在错的输入上。

---

## 7. 依赖治理

- **一份 lockfile**：`pnpm-lock.yaml` 只有根目录一份。
- **catalog 是唯一真相源**：升级思源 API 或构建工具只改 `pnpm-workspace.yaml`，全仓一起动。
- **`siyuan` 类型包钉在 petal 的具体提交**（当前 `github:siyuan-note/petal#edc4b0494a`）：插件需要的几处声明还没发到 npm。单一 pin、单一升级点，lockfile 仍可复现；petal 发布后改回 semver 即可。
- **仓内共享库用 `workspace:*`**：解析结果永远是 `link:../../libs/<name>`，不会出现两个消费方锁在不同提交。
- **仓内构建不了的预编译产物也放 `libs/*`**：如 `libs/vconsole`。
- **不开 `shamefully-hoist`**：开了会拍平全部插件的依赖解析，幽灵依赖被静默接受。
- **不用 `overrides` 压平副本**：清单写范围或精确版本，由 lockfile 钉住。上游抬高最低版本时 pnpm 会解析出两份，`tsc` 直接报私有字段类型冲突 —— 这个错误正好提示该升 catalog；而 `overrides` 会把旧版静默塞给要求新版的包，编译能过、运行期缺 API。
- **直接进产物的依赖在 catalog 里写精确版本**：`@codemirror/*`、`@lezer/*`、`@jsquash/*` 版本漂移会让产物随上游变化，出问题无法归因。
- **机器相关配置不进仓库**：registry / `store-dir` 留在 `~/.npmrc`。
- **只用类型的重依赖也要写进 `allowBuilds`**：如 `electron`，漏写会让 pnpm 报 `ERR_PNPM_IGNORED_BUILDS` 并退出 1；写 `false` 则不下载二进制。

---

## 8. 格式化与 lint

两者都交给 oxc，覆盖面包括 TS / SCSS / Markdown / JSON：

- `pnpm format` / `format:check` → oxfmt（`.oxfmtrc.json`）
- `pnpm lint` → oxlint（`.oxlintrc.json`）

规则要点：

- `printWidth: 320`：oxfmt 允许的最大值（超出会报配置错误），实际效果是 320 列以内不折行。
- `experimentalOperatorPosition: "start"`：被迫折行时运算符放行首。
- `tabWidth: 2`、LF、双引号、分号、`trailingComma: "all"`、`objectWrap: "preserve"`。
- YAML 不参与（`ignorePatterns` 排掉 `**/*.{yml,yaml}`）。
- `src/i18n/` 参与格式化，包根的 `i18n/`（构建产物）排除。
- 压缩产物与生成物排除：`libs/vconsole/dist`、`libs/vconsole/build`、`plugins/code-recognition/wasm` 与 `docs/`。格式化 wasm-bindgen 产物会让每次构建都漂移，格式化基准语料会毁掉基准。

**已知取舍**：oxfmt 是 Prettier 系，会把能塞进 320 的手动折行合并回一行，也会改写 Markdown 列表标记（`*` → `-`）。需要保留自己的断行时在上一行写 `// oxfmt-ignore`（`// prettier-ignore` 同样有效）。

---

## 9. 脚本与 CI

根目录脚本见 [README](../README.md#快速开始)。

CI 顺序：`install --frozen-lockfile` → `check` → `format:check` → `lint` → `typecheck` → `test` → `build`。

---

## 10. 发布链路

```
打 tag `move-doc/v1.0.3`
        │
        ├─ 从 github.ref_name 切出 package=move-doc、version=1.0.3
        ├─ 校验：tag 格式 / 包目录存在 / 清单 version == tag / 目录名 == 清单 name
        ├─ 从清单 url 推导目标仓库（回退 TCOTC/<name>）
        ├─ 只构建这一个包（不是全量）→ dist/move-doc.zip
        ├─ cp dist/move-doc.zip package.zip     ← 集市按资产名找，必须改名
        └─ gh release create v1.0.3 --repo TCOTC/move-doc package.zip
               └─ 必须是正式 release，不能是 prerelease
                ↓
        bazaar Stage 下一轮抓到新 release → 集市可见
```

发一个版本就两句：

```bash
# 改完清单里的 version 后
git tag move-doc/v1.0.3 && git push origin move-doc/v1.0.3
```

`workflow_dispatch` 保留做 dry-run（`dry_run` 默认 true）：只构建、校验 zip 根目录有清单，不创建 release。

三个容易做错的地方：

1. **用 PAT，不能用 `GITHUB_TOKEN`**：后者只能写当前仓库，跨 20 多个收录仓库需要 fine-grained PAT（`contents: write`），存在 `PUBLISH_TOKEN`。
2. **目标仓库不能有自己的发布工作流**：创建 release 会在目标仓库建 tag，若那里还有 `on: push: tags` 的旧工作流，同一版本会被构建两次、互相覆盖资产。
3. **不要用「推 tag 让目标仓库自己构建」**：那等于保留 20 多份 lockfile 和 20 多份工具链。

---

## 11. 许可

### 11.1 自有代码：仓库根一份

整个仓库共用根目录的一份 [LICENSE](../LICENSE)（MIT）。各包不放副本，`pnpm check` 会把包根的 `LICENSE` / `LICENSE.md` / `LICENSE.txt` 判为错误。

**发布产物固定不带许可原文。** `collectStaticAssets` 只复制清单、README、图标、预览图、`i18n/` 与第三方通知文件，`build.config.ts` 的 `copy` 也不许列 `LICENSE`。

### 11.2 第三方：固定一个 `THIRD_PARTY-NOTICES.md`

第三方条款是**再分发义务**，不能靠仓库根那份代替。包根放恰好一个 `THIRD_PARTY-NOTICES.md`，kit 会自动复制到产物根，不需要也不要再写 `copy`。

文件名固定：许可全文（Apache / BSD / IJG / ISC …）写进该文件的「许可全文」段落，每份用 ` ```text ` 围栏包住（围栏内不会被 oxfmt 重排）。包根任何 `THIRD_PARTY` 开头但名字不对的文件都会被 `pnpm check` 判错——那些文件不会进产物，而作者会以为带上了。

判断依据是「代码有没有进产物」，不是「有没有装依赖」：

| 形态                                   | 是否需随附 | 例子                                              |
| -------------------------------------- | ---------- | ------------------------------------------------- |
| 打包进 `index.js` / `codecWorker.js`   | 需要       | CodeMirror、prettier、acorn、vConsole、`@jsquash` |
| 作为独立文件随产物分发                 | 需要       | 字体、wasm、模型                                  |
| 仅类型（`import type`）                | 不需要     | `electron`、`@octokit/openapi-types`、`siyuan`    |
| 仅构建期（vite / sass / oxc / vitest） | 不需要     | —                                                 |

现有第三方内容的归属：

| 包                             | 内容                                                                            | 许可                               | 位置                                        |
| ------------------------------ | ------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------- |
| `devtools`                     | vConsole 3.16.0-alpha                                                           | MIT（腾讯声明）                    | `THIRD_PARTY-NOTICES.md`                    |
| `snippets`                     | CodeMirror 6 / @lezer / prettier / meriyah / acorn / @uiw 主题 / @babel/runtime | MIT + ISC                          | `THIRD_PARTY-NOTICES.md`                    |
| `image-squeeze`                | `@jsquash/*` 与三份编解码器 wasm                                                | Apache-2.0 + BSD-3 + IJG + MIT     | `THIRD_PARTY-NOTICES.md`（含四份许可全文）  |
| `code-recognition`             | betlang wasm、Magika 蒸馏模型                                                   | MIT / Apache-2.0                   | `THIRD_PARTY-NOTICES.md`（含两份许可全文）  |
| `siyuan-plugin-openmoji-emoji` | OpenMoji 字体                                                                   | CC BY-SA 4.0                       | `OpenMoji/LICENSE.txt`（随字体一起 `copy`） |
| 两个字体包                     | Twemoji / 霞鹜文楷 / HarmonyOS Sans                                             | CC BY 4.0 / OFL 1.1 / 华为字体许可 | 各字体子目录内的许可文件                    |

新增第三方内容时，先确认条款对「随插件分发」的要求，再在「随附组件」表加一行（组件 / 版本 / 许可 / 版权行），并把许可全文追加到「许可全文」段落。不要拆成多个 `THIRD_PARTY-*` 文件，也不要改名成包根 `LICENSE` 或塞进 `copy`。
